from fastapi import HTTPException
from sqlalchemy import text
from groq import Groq
import json
import logging
from typing import Optional, List

logger = logging.getLogger("llm_service")


class LLMService:
    """
    Suggère une stratégie de pricing optimale via LLM (Groq / Llama 3.3 70B).

    Logique :
    - Filtre les données du magasin connecté (via magasin_id résolu à l'inscription)
    - Filtre sur la DERNIÈRE période disponible uniquement (évite AVG multi-mois)
    - Calcule les métriques concurrents (tous les autres magasins, même category×brand)
    - Sanity check sur market_avg_price_eur avant d'appeler le LLM
    - Recommande une stratégie système OU propose une stratégie CUSTOM avec rules+coeff+params
    - Contrainte stricte : somme coefficients = 1.0
    - Supporte multi-category et multi-brand (listes de valeurs)

    DÉFINITION CUSTOM :
    - CUSTOM = combinaison de rule_ids absente : cette combinaison de règles n'existe dans AUCUNE stratégie système
    - Modifier les coefficients d'une stratégie système ≠ CUSTOM
    - Désactiver une rule d'une stratégie système ≠ CUSTOM
    - Le backend détecte et corrige automatiquement les faux CUSTOM

    NOTE IPP :
    - ipp_category = médiane propre / médiane GLOBALE de la catégorie (tous magasins inclus)
    - Ce n'est PAS un IPP purement concurrentiel — il inclut le magasin lui-même
    - La comparaison directionnelle fiable est : own_avg_price_eur vs market_avg_price_eur
    - ipp_category est NULL si aucun filtre category fourni
    - ipp_brand     est NULL si aucun filtre brand fourni
    """

    RULES_CATALOG = {
        "r1": {
            "name": "aggregation_rule",
            "label": "Aggregation Rule",
            "description": "Lowest / average / median des prix collectés",
            "params": {
                "aggregation_function": {
                    "type": "enum",
                    "values": ["lowest", "average", "median"],
                    "default": "median"
                }
            }
        },
        "r2": {
            "name": "floor_price_rule",
            "label": "Floor Price Rule",
            "description": "Prix minimum garanti basé sur les 90 derniers jours",
            "params": {}
        },
        "r3": {
            "name": "competitor_beat_rule",
            "label": "Competitor Beat Rule",
            "description": "Battre les concurrents avec un pourcentage de réduction",
            "params": {
                "discount_pct": {"type": "float", "min": 1.0, "max": 10.0, "default": 3.0}
            }
        },
        "r4": {
            "name": "market_average_rule",
            "label": "Market Average Rule",
            "description": "Alignement marché via prix moyen",
            "params": {}
        },
        "r5": {
            "name": "min_store_price_rule",
            "label": "Min Store Price Rule",
            "description": "Prix minimum interne pour éviter cannibalisation",
            "params": {}
        },
        "r6": {
            "name": "stability_rule",
            "label": "Stability Rule",
            "description": "Limiter les variations de prix (lissage)",
            "params": {
                "low_threshold_pct":  {"type": "float", "min": 1.0,  "max": 5.0,  "default": 1.0},
                "high_threshold_pct": {"type": "float", "min": 5.0,  "max": 20.0, "default": 15.0}
            }
        }
    }

    STRATEGIES_CATALOG = {
        "s1": {
            "id": "s1", "name": "AGGRESSIVE",
            "description": "Conquête du marché avec prix bas",
            "default_rules": [
                {"rule_id": "r1", "coefficient": 0.4},
                {"rule_id": "r2", "coefficient": 0.3},
                {"rule_id": "r3", "coefficient": 0.3}
            ]
        },
        "s2": {
            "id": "s2", "name": "COMPETITIVE",
            "description": "Équilibre entre compétitivité et stabilité",
            "default_rules": [
                {"rule_id": "r1", "coefficient": 0.3},
                {"rule_id": "r3", "coefficient": 0.5},
                {"rule_id": "r6", "coefficient": 0.2}
            ]
        },
        "s3": {
            "id": "s3", "name": "MARKET_ALIGNED",
            "description": "Alignement strict avec le marché",
            "default_rules": [
                {"rule_id": "r4", "coefficient": 0.5},
                {"rule_id": "r2", "coefficient": 0.3},
                {"rule_id": "r6", "coefficient": 0.2}
            ]
        },
    
    }

    # rule_ids de chaque stratégie système — utilisé pour la détection des faux CUSTOM
    _STRATEGY_RULE_SETS = {
        sid: frozenset(r["rule_id"] for r in s["default_rules"])
        for sid, s in STRATEGIES_CATALOG.items()
    }

    def __init__(self, db_manager, groq_api_key: str):
        self._db     = db_manager
        self._client = Groq(api_key=groq_api_key)

    # ───────────────────────────────────────────────────────────────────────────
    # HELPERS — NORMALISATION DES FILTRES
    # ───────────────────────────────────────────────────────────────────────────

    @staticmethod
    def _to_list(value) -> Optional[List[str]]:
        """
        Normalise category/brand en liste ou None.
        Accepte : None, str, List[str].
        Filtre les valeurs vides.
        """
        if value is None:
            return None
        if isinstance(value, str):
            value = [value]
        cleaned = [v.strip() for v in value if v and v.strip()]
        return cleaned if cleaned else None

    @staticmethod
    def _build_ilike_filter(field: str, values: List[str], params: dict, prefix: str) -> str:
        """
        Construit un filtre SQL ILIKE OR pour une liste de valeurs.
        Ex : AND (c.category_name ILIKE :cat_0 OR c.category_name ILIKE :cat_1)
        Injecte les paramètres nommés dans `params`.
        """
        conditions = []
        for i, v in enumerate(values):
            key = f"{prefix}_{i}"
            params[key] = f"%{v}%"
            conditions.append(f"{field} ILIKE :{key}")
        return f"AND ({' OR '.join(conditions)})"

    # ───────────────────────────────────────────────────────────────────────────
    # HELPERS DB
    # ───────────────────────────────────────────────────────────────────────────

    def _query(self, sql: str, params: dict) -> list:
        with self._db.market_conn() as conn:
            result = conn.execute(text(sql), params)
            return [dict(row._mapping) for row in result]

    def _get_latest_date_id(self) -> Optional[int]:
        """
        Récupère la dernière période disponible dans dm_pricing_performance.
        CRITIQUE : sans ce filtre, AVG agrège tous les mois → valeurs aberrantes.
        """
        rows = self._query(
            "SELECT MAX(date_id) AS max_date FROM gold.dm_pricing_performance",
            {}
        )
        if rows and rows[0].get("max_date"):
            return rows[0]["max_date"]
        return None

    def _get_own_metrics(
        self,
        magasin_id: str,
        categories: Optional[List[str]],
        brands: Optional[List[str]],
        date_id: Optional[int]
    ) -> dict:
        """
        Métriques du magasin connecté depuis dm_pricing_performance.
        - Filtre sur magasin_id + date_id (dernière période)
        - Filtre multi-category et/ou multi-brand via ILIKE OR
        - ipp_category = NULL si pas de filtre category (non significatif sans périmètre)
        - ipp_brand    = NULL si pas de filtre brand    (non significatif sans périmètre)
        """
        params  = {"magasin_id": magasin_id}
        filters = "WHERE dp.magasin_id = :magasin_id"

        if date_id:
            filters += " AND dp.date_id = :date_id"
            params["date_id"] = date_id

        if categories:
            filters += " " + self._build_ilike_filter("c.category_name", categories, params, "cat")

        if brands:
            filters += " " + self._build_ilike_filter("b.brand_name", brands, params, "brd")

        # IPP conditionnel : non significatif sans filtre correspondant
        ipp_category_select = (
            "ROUND(AVG(dp.ipp_category)::NUMERIC, 2) AS ipp_category"
            if categories else "NULL AS ipp_category"
        )
        ipp_brand_select = (
            "ROUND(AVG(dp.ipp_brand)::NUMERIC, 2) AS ipp_brand"
            if brands else "NULL AS ipp_brand"
        )

        rows = self._query(f"""
            SELECT
                ROUND(AVG(dp.avg_price_eur)::NUMERIC, 4)               AS avg_price_eur,
                ROUND(AVG(dp.ipp_global)::NUMERIC, 2)                  AS ipp_global,
                {ipp_category_select},
                {ipp_brand_select},
                ROUND(AVG(dp.price_evolution_pct_mom)::NUMERIC, 2)     AS price_evolution_mom,
                ROUND(AVG(dp.indice_saisonnier_category)::NUMERIC, 2)  AS indice_saisonnier_category,
                ROUND(AVG(dp.indice_saisonnier_brand)::NUMERIC, 2)     AS indice_saisonnier_brand,
                SUM(dp.nb_prices)                                       AS nb_prices
            FROM gold.dm_pricing_performance dp
            LEFT JOIN silver.category c ON c.category_id = dp.category_id
            LEFT JOIN silver.brand    b ON b.brand_id    = dp.brand_id
            {filters}
        """, params)

        return rows[0] if rows and rows[0]["avg_price_eur"] else {}

    def _get_market_metrics(
        self,
        magasin_id: str,
        categories: Optional[List[str]],
        brands: Optional[List[str]],
        date_id: Optional[int]
    ) -> dict:
        """
        Métriques marché = tous les concurrents (magasin_id != celui du user).
        Même périmètre category/brand que own_metrics pour une comparaison cohérente.
        """
        params  = {"magasin_id": magasin_id}
        filters = "WHERE dp.magasin_id != :magasin_id"

        if date_id:
            filters += " AND dp.date_id = :date_id"
            params["date_id"] = date_id

        if categories:
            filters += " " + self._build_ilike_filter("c.category_name", categories, params, "cat")

        if brands:
            filters += " " + self._build_ilike_filter("b.brand_name", brands, params, "brd")

        rows = self._query(f"""
            SELECT
                ROUND(AVG(dp.avg_price_eur)::NUMERIC, 4)           AS market_avg_price_eur,
                ROUND(AVG(dp.ipp_category)::NUMERIC, 2)            AS market_ipp_category,
                ROUND(AVG(dp.price_evolution_pct_mom)::NUMERIC, 2) AS market_price_evolution_mom,
                COUNT(DISTINCT dp.magasin_id)                      AS nb_concurrents
            FROM gold.dm_pricing_performance dp
            LEFT JOIN silver.category c ON c.category_id = dp.category_id
            LEFT JOIN silver.brand    b ON b.brand_id    = dp.brand_id
            {filters}
        """, params)

        return rows[0] if rows else {}

    def _get_network_info(self, magasin_id: str) -> dict:
        """Récupère le network_tier et nb_stores du magasin connecté."""
        rows = self._query("""
            SELECT network_tier, nb_stores, nb_stores_actifs
            FROM gold.dm_store_network dsn
            JOIN silver.magasin m ON m.magasin_id = dsn.magasin_id
            WHERE dsn.magasin_id = :magasin_id
            LIMIT 1
        """, {"magasin_id": magasin_id})
        return rows[0] if rows else {}

    def _sanity_check(self, own: dict, market: dict) -> None:
        """
        Vérifie la cohérence des métriques avant d'appeler le LLM.
        Lève une HTTPException 422 si les données sont aberrantes.
        """
        market_avg = market.get("market_avg_price_eur")
        own_avg    = own.get("avg_price_eur")

        if market_avg and float(market_avg) > 1000:
            logger.error(f"Sanity check failed: market_avg_price_eur={market_avg}")
            raise HTTPException(
                status_code=422,
                detail=(
                    f"Données marché aberrantes détectées (market_avg={market_avg}€). "
                    "Vérifiez le pipeline de données."
                )
            )

        if own_avg and market_avg:
            ratio = float(own_avg) / float(market_avg)
            if ratio > 10 or ratio < 0.1:
                logger.error(
                    f"Sanity check failed: own={own_avg}€ / market={market_avg}€ → ratio={ratio:.2f}"
                )
                raise HTTPException(
                    status_code=422,
                    detail=(
                        f"Écart prix magasin/marché incohérent (ratio={ratio:.2f}). "
                        "Vérifiez les données source."
                    )
                )

    # ───────────────────────────────────────────────────────────────────────────
    # CONSTRUCTION DU PROMPT
    # ───────────────────────────────────────────────────────────────────────────

    def _build_prompt(
        self,
        own: dict,
        market: dict,
        network: dict,
        categories: Optional[List[str]],
        brands: Optional[List[str]],
        company_name: str
    ) -> str:

        def fmt(v, suffix="", d=2):
            return f"{round(float(v), d)}{suffix}" if v is not None else "N/A"

        # ── Libellés périmètre
        cat_label   = ", ".join(categories) if categories else "Toutes"
        brand_label = ", ".join(brands)     if brands     else "Toutes"

        # ── Position concurrentielle réelle
        own_avg    = float(own.get("avg_price_eur") or 0)
        market_avg = float(market.get("market_avg_price_eur") or 0)

        if market_avg > 0:
            prix_relatif_pct = round((own_avg / market_avg - 1) * 100, 1)
            if prix_relatif_pct > 5:
                position_reelle = (
                    f"AU-DESSUS du marché de +{prix_relatif_pct}% "
                    f"({own_avg}€ vs {market_avg}€ marché) → prix non compétitifs"
                )
            elif prix_relatif_pct < -5:
                position_reelle = (
                    f"EN-DESSOUS du marché de {prix_relatif_pct}% "
                    f"({own_avg}€ vs {market_avg}€ marché) → bonne compétitivité prix"
                )
            else:
                position_reelle = (
                    f"DANS LA MOYENNE du marché ({prix_relatif_pct:+.1f}%) "
                    f"({own_avg}€ vs {market_avg}€ marché)"
                )
        else:
            prix_relatif_pct = 0
            position_reelle  = "position vs marché non calculable (données marché manquantes)"

        # ── IPP catégorie (uniquement si filtre category fourni)
        ipp_cat      = own.get("ipp_category")
        ipp_cat_line = "N/A (aucun filtre catégorie appliqué)"
        if ipp_cat is not None:
            ipp_cat_f = float(ipp_cat)
            if ipp_cat_f > 110:
                ipp_note = "médiane interne élevée vs distribution globale de la catégorie"
            elif ipp_cat_f < 90:
                ipp_note = "médiane interne basse vs distribution globale de la catégorie"
            else:
                ipp_note = "médiane interne dans la moyenne de la catégorie"
            ipp_cat_line = f"{fmt(ipp_cat_f)} — {ipp_note}"

        # ── IPP brand (uniquement si filtre brand fourni)
        ipp_brand      = own.get("ipp_brand")
        ipp_brand_line = "N/A (aucun filtre marque appliqué)"
        if ipp_brand is not None:
            ipp_brand_line = fmt(ipp_brand)

        # ── Tendance prix MoM
        evol     = float(own.get("price_evolution_mom") or 0)
        tendance = (
            "FORTE HAUSSE (+{}%)".format(round(evol, 1)) if evol > 5  else
            "HAUSSE (+{}%)".format(round(evol, 1))       if evol > 1  else
            "FORTE BAISSE ({}%)".format(round(evol, 1))  if evol < -5 else
            "BAISSE ({}%)".format(round(evol, 1))        if evol < -1 else
            "STABLE ({}%)".format(round(evol, 1))
        )

        # ── Alerte forte baisse MoM
        evol_alert = ""
        if evol < -5:
            evol_alert = (
                f"\n  ⚠ ALERTE : évolution MoM = {round(evol, 1)}% → FORTE BAISSE des prix ce mois. "
                "Privilegier Stability Rule (r6). NE PAS utiliser Competitor Beat Rule (r3) comme règle dominante."
            )

        # ── Saisonnalité
        saison  = float(own.get("indice_saisonnier_category") or 100)
        periode = "HAUTE SAISON" if saison > 105 else "BASSE SAISON" if saison < 95 else "SAISON NORMALE"

        # ── Catalogue rules
        rules_text = ""
        for rid, r in self.RULES_CATALOG.items():
            params_desc = ""
            for pname, pdef in r["params"].items():
                if pdef["type"] == "enum":
                    params_desc += (
                        f"\n        {pname}: valeurs possibles {pdef['values']}, "
                        f"défaut={pdef['default']}"
                    )
                else:
                    params_desc += (
                        f"\n        {pname}: plage [{pdef['min']} → {pdef['max']}], "
                        f"défaut={pdef['default']}"
                    )
            rules_text += f"  [{rid}] {r['label']}\n      {r['description']}{params_desc}\n"

        # ── Catalogue stratégies avec rule_ids explicites
        strategies_text = ""
        for sid, s in self.STRATEGIES_CATALOG.items():
            rules_list = ", ".join(
                f"{r['rule_id']}(coeff={r['coefficient']})"
                for r in s["default_rules"]
            )
            strategies_text += (
                f"  [{sid}] {s['name']}: {s['description']} "
                f"→ règles: {rules_list}\n"
            )

        prompt = f"""Tu es un expert en stratégie de pricing retail grande distribution.
Analyse le contexte marché ci-dessous et recommande la stratégie de pricing optimale.

════════════════════════════════════════
CONTEXTE MAGASIN : {company_name}
════════════════════════════════════════
Périmètre analysé  : catégorie(s)={cat_label} | marque(s)={brand_label}
Réseau             : {network.get("network_tier", "N/A")} ({fmt(network.get("nb_stores"), " magasins", 0)})

MÉTRIQUES MAGASIN :

  [INDICATEUR PRINCIPAL — base ta recommandation sur ceci]
  • Position concurrentielle réelle : {position_reelle}

  [INDICATEURS COMPLÉMENTAIRES]
  • IPP Catégorie (interne)  : {ipp_cat_line}
    ⚠ L'IPP est calculé vs la médiane GLOBALE de la catégorie (tous magasins confondus,
      y compris {company_name}). Il peut diverger de la position concurrentielle réelle.
      En cas de contradiction avec la position réelle ci-dessus, privilégie la position réelle.
  • IPP Global               : {fmt(own.get("ipp_global"))} (100=médiane globale tous produits)
  • IPP Marque               : {ipp_brand_line}
  • Évolution prix MoM       : {tendance}{evol_alert}
  • Indice saisonnier        : {fmt(saison)} → {periode}
  • Volume données           : {fmt(own.get("nb_prices"), " prix collectés", 0)}

MÉTRIQUES CONCURRENTS (même périmètre, même période) :
  • IPP catégorie marché     : {fmt(market.get("market_ipp_category"))}
  • Évolution marché MoM     : {fmt(market.get("market_price_evolution_mom"), "%")}
  • Nb concurrents actifs    : {fmt(market.get("nb_concurrents"), "", 0)}

════════════════════════════════════════
RÈGLES DISPONIBLES
════════════════════════════════════════
{rules_text}
════════════════════════════════════════
STRATÉGIES SYSTÈME DISPONIBLES
════════════════════════════════════════
{strategies_text}
La stratégie CUSTOM (s5) est réservée aux cas où AUCUNE stratégie système ci-dessus ne convient.

════════════════════════════════════════
CONTRAINTES OBLIGATOIRES
════════════════════════════════════════
1. La SOMME des coefficients doit être EXACTEMENT 1.0
2. Chaque coefficient doit être > 0
3. Les paramètres doivent rester dans leurs plages autorisées
4. Minimum 2 rules, maximum 4 rules par stratégie
5. DÉFINITION STRICTE DE CUSTOM (s5) :
   - CUSTOM = la combinaison de rule_ids choisie n'existe dans AUCUNE stratégie système (s1/s2/s3/s4)
   - Modifier uniquement les COEFFICIENTS d'une stratégie système = ce n'est PAS du CUSTOM → utilise l'ID système
   - Désactiver une rule d'une stratégie système = ce n'est PAS du CUSTOM → utilise l'ID système
   - CUSTOM uniquement si tu ajoutes une rule absente de la stratégie système la plus proche
6. Si evolution_mom < -5%, NE PAS utiliser Competitor Beat Rule (r3) comme règle dominante
7. Si le magasin est EN-DESSOUS du marché ET evolution_mom < 0, privilégier Stability Rule (r6)
   → La stratégie STABILIZATION (s4) est conçue pour ce cas précis
8. Base ta recommandation sur la POSITION CONCURRENTIELLE RÉELLE, pas sur l'IPP
9. Si le magasin est EN-DESSOUS du marché de plus de 15%, NE PAS inclure market_average_rule (r4)
   — elle ferait remonter les prix et détruirait l'avantage concurrentiel acquis
10. PRIORITÉ : toujours préférer une stratégie système (s1/s2/s3/s4) si elle convient.
    N'utilise CUSTOM (s5) qu'en dernier recours avec justification explicite.

════════════════════════════════════════
FORMAT DE RÉPONSE — JSON STRICT
════════════════════════════════════════
Réponds UNIQUEMENT avec ce JSON, sans texte avant ni après :

{{
  "recommended_strategy_id": "s1|s2|s3|s4|s5",
  "recommended_strategy_name": "AGGRESSIVE|COMPETITIVE|MARKET_ALIGNED|STABILIZATION|CUSTOM",
  "is_custom": false,
  "rules": [
    {{
      "rule_id": "r1",
      "rule_name": "aggregation_rule",
      "coefficient": 0.40,
      "params": {{"aggregation_function": "median"}}
    }}
  ],
  "reasoning": {{
    "market_position": "résumé en 1 phrase de la position réelle du magasin vs concurrents",
    "strategy_choice": "pourquoi cette stratégie en 1 phrase",
    "params_justification": "pourquoi ces paramètres précis en 1 phrase"
  }},
  "explanation": "Explication complète en français (3-4 phrases) destinée au manager du magasin."
}}"""
        return prompt

    # ───────────────────────────────────────────────────────────────────────────
    # VALIDATION & CORRECTION
    # ───────────────────────────────────────────────────────────────────────────

    def _validate_and_fix(self, result: dict) -> dict:
        """
        Valide et corrige la réponse LLM :
        - Normalise la somme des coefficients à 1.0
        - Clamp les paramètres dans leurs plages autorisées
        - Détecte les faux CUSTOM : si les rule_ids correspondent à une stratégie système,
          corrige automatiquement l'ID, le nom et is_custom
        """
        rules = result.get("rules", [])
        if not rules:
            raise HTTPException(status_code=502, detail="LLM n'a pas retourné de règles.")

        # Fix somme coefficients
        total = sum(r.get("coefficient", 0) for r in rules)
        if not (0.99 <= total <= 1.01):
            logger.warning(f"LLM coeff sum={total}, normalisation forcée")
            for r in rules:
                r["coefficient"] = round(r["coefficient"] / total, 3)

        # Fix paramètres hors plage
        for rule in rules:
            rid = rule.get("rule_id")
            if rid not in self.RULES_CATALOG:
                continue
            catalog_params = self.RULES_CATALOG[rid]["params"]
            rule_params    = rule.get("params", {})
            for pname, pdef in catalog_params.items():
                if pname in rule_params and pdef["type"] == "float":
                    val = float(rule_params[pname])
                    rule_params[pname] = round(
                        max(pdef["min"], min(pdef["max"], val)), 2
                    )

        result["rules"] = rules

        # ── Détection faux CUSTOM
        # CUSTOM réel = combinaison de rule_ids absente de toutes les stratégies système
        # Si les rule_ids retournés = rule_ids d'une stratégie système → corriger automatiquement
        returned_rule_ids = frozenset(r["rule_id"] for r in rules)
        for sid, system_rule_ids in self._STRATEGY_RULE_SETS.items():
            if returned_rule_ids == system_rule_ids:
                old_id = result.get("recommended_strategy_id")
                result["recommended_strategy_id"]   = sid
                result["recommended_strategy_name"] = self.STRATEGIES_CATALOG[sid]["name"]
                result["is_custom"]                 = False
                logger.info(
                    f"Faux CUSTOM détecté : rule_ids {set(returned_rule_ids)} "
                    f"= stratégie {self.STRATEGIES_CATALOG[sid]['name']} "
                    f"(LLM avait dit '{old_id}') → corrigé automatiquement"
                )
                break
        else:
            # Aucune stratégie système ne correspond → CUSTOM légitime
            result["is_custom"]                 = True
            result["recommended_strategy_id"]   = "s5"
            result["recommended_strategy_name"] = "CUSTOM"

        return result

    # ───────────────────────────────────────────────────────────────────────────
    # POINT D'ENTRÉE PRINCIPAL
    # ───────────────────────────────────────────────────────────────────────────

    def suggest_strategy(
        self,
        category,           # str | List[str] | None
        brand,              # str | List[str] | None
        magasin_id: Optional[str] = None,
        company_name: str = ""
    ) -> dict:
        """
        Suggère une stratégie optimale pour le magasin connecté.

        Accepte category et brand en tant que str, List[str], ou None.

        Flow :
        1. Normalise category/brand en listes
        2. Récupère la dernière période disponible (date_id)
        3. Récupère métriques magasin (filtré sur magasin_id + date_id)
        4. Récupère métriques concurrents (tous sauf magasin_id, même date_id)
        5. Sanity check des données avant appel LLM
        6. Récupère network_tier
        7. Construit prompt + appelle Groq Llama 3.3 70B
        8. Valide, corrige les faux CUSTOM, retourne JSON structuré
        """
        # 0. Normalisation
        categories = self._to_list(category)
        brands     = self._to_list(brand)

        if not categories and not brands:
            raise HTTPException(
                status_code=400,
                detail="Fournir au moins category ou brand pour la suggestion LLM."
            )

        if not magasin_id:
            raise HTTPException(
                status_code=400,
                detail="Magasin non trouvé dans notre base. Vérifiez le nom de votre enseigne."
            )

        # 1. Dernière période disponible
        date_id = self._get_latest_date_id()
        if not date_id:
            raise HTTPException(
                status_code=503,
                detail="Aucune donnée pricing disponible dans dm_pricing_performance."
            )
        logger.info(
            f"LLM suggest_strategy — magasin_id={magasin_id} | date_id={date_id} "
            f"| categories={categories} | brands={brands}"
        )

        # 2. Données magasin connecté
        own = self._get_own_metrics(magasin_id, categories, brands, date_id)
        if not own:
            raise HTTPException(
                status_code=404,
                detail="Aucune donnée pricing trouvée pour votre magasin sur ce périmètre."
            )

        # 3. Données concurrents
        market = self._get_market_metrics(magasin_id, categories, brands, date_id)

        # 4. Sanity check
        self._sanity_check(own, market)

        # 5. Network info
        network = self._get_network_info(magasin_id)

        # 6. Prompt + appel LLM
        prompt = self._build_prompt(own, market, network, categories, brands, company_name)

        try:
            response = self._client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "Tu es un expert pricing retail. "
                            "Tu réponds UNIQUEMENT en JSON valide, sans markdown, "
                            "sans balises ```json, sans texte avant ou après."
                        )
                    },
                    {"role": "user", "content": prompt}
                ],
                temperature=0.2,
                max_tokens=1000
            )

            raw = response.choices[0].message.content.strip()

            # Nettoyage si le LLM ajoute des balises markdown malgré la consigne
            if "```" in raw:
                raw = raw.split("```")[1]
                if raw.startswith("json"):
                    raw = raw[4:].strip()

            result = json.loads(raw)

        except json.JSONDecodeError as e:
            logger.error(f"LLM JSON parse error: {e} | raw='{raw[:200]}'")
            raise HTTPException(
                status_code=502,
                detail="Le LLM n'a pas retourné un JSON valide. Réessayez."
            )
        except Exception as e:
            logger.error(f"Groq API error: {e}")
            raise HTTPException(status_code=503, detail=f"Erreur service LLM: {str(e)}")

        # 7. Validation + correction (coefficients, params, faux CUSTOM)
        result = self._validate_and_fix(result)

        # Calcul écart direct pour context_used
        own_avg    = float(own.get("avg_price_eur") or 0)
        market_avg = float(market.get("market_avg_price_eur") or 0)
        prix_relatif_pct = round((own_avg / market_avg - 1) * 100, 1) if market_avg > 0 else None

        return {
            "recommended_strategy_id":   result.get("recommended_strategy_id"),
            "recommended_strategy_name": result.get("recommended_strategy_name"),
            "is_custom":                 result.get("is_custom", False),
            "rules":                     result.get("rules", []),
            "reasoning":                 result.get("reasoning", {}),
            "explanation":               result.get("explanation", ""),
            "context_used": {
                "company_name":         company_name,
                "magasin_id":           magasin_id,
                "date_id":              date_id,
                "categories":           categories,
                "brands":               brands,
                "own_avg_price_eur":    own.get("avg_price_eur"),
                "market_avg_price_eur": market.get("market_avg_price_eur"),
                "prix_relatif_pct":     prix_relatif_pct,
                "own_ipp_category":     own.get("ipp_category"),   # None si pas de filtre category
                "own_ipp_brand":        own.get("ipp_brand"),       # None si pas de filtre brand
                "price_evolution_mom":  own.get("price_evolution_mom"),
                "nb_concurrents":       market.get("nb_concurrents"),
                "network_tier":         network.get("network_tier")
            }
        }