from fastapi import HTTPException
from sqlalchemy import text
from typing import Optional
import statistics, logging

logger = logging.getLogger("pricing_service")


class PricingService:
    """
    Calcule les prix optimisés en appliquant les règles d'une stratégie
    sur les données de marché de la base retail_pricing.
    Lit depuis le schéma silver (views nettoyées).
    """

    def __init__(self, db_manager):
        self._db = db_manager

    def _query(self, sql: str, params: dict) -> list:
        with self._db.market_conn() as conn:
            result = conn.execute(text(sql), params)
            return [dict(row._mapping) for row in result]
    
    def _get_param(self, params: dict, key: str, default):
        """
        Extrait la valeur d'un param qui peut être :
        - une valeur directe : {"aggregation_function": "median"}
        - une métadonnée catalogue : {"aggregation_function": {"default": "median", ...}}
        """
        val = params.get(key, default)
        if isinstance(val, dict):
            return val.get("default", default)
        return val

    def _resolve_base_price(self, product_code: str, company_name: Optional[str]) -> float:
        """
        Résout le prix de base du produit depuis silver.prices.
        Priorité : prix du magasin du user → sinon AVG marché.

        silver.prices  → price_eur, product_code, magasin_id
        silver.magasin → magasin_id, nom_enseigne
        """
        if company_name:
            own_rows = self._query("""
                SELECT p.price_eur AS price
                FROM silver.prices p
                JOIN silver.magasin m ON m.magasin_id = p.magasin_id
                WHERE p.product_code = :c
                AND m.nom_enseigne ILIKE :n
                AND p.price_eur IS NOT NULL AND p.price_eur > 0
                ORDER BY p.date DESC   -- ← dernière observation
                LIMIT 1
            """, {"c": product_code, "n": f"%{company_name}%"})
            if own_rows:
                return float(own_rows[0]["price"])

        market_rows = self._query("""
            SELECT AVG(price_eur) AS avg_price
            FROM silver.prices
            WHERE product_code = :c
            AND price_eur IS NOT NULL
            AND price_eur > 0
            AND price_eur < 1000
        """, {"c": product_code})
        if market_rows and market_rows[0]["avg_price"]:
            return round(float(market_rows[0]["avg_price"]), 4)

        raise HTTPException(
            status_code=404,
            detail=f"Aucun prix trouvé dans la base pour l'EAN '{product_code}'"
        )

    def _fetch_market_data(self, product_code: str, company_name: Optional[str] = None) -> dict:
        """
        Récupère les prix marché, concurrents et propres pour un produit.

        - market_prices    : tous les prix (magasin user + concurrents)
        - own_prices       : prix du magasin du user uniquement
        - competitor_prices: prix des concurrents uniquement (pas le magasin user)
        """
        try:
            market = [
                float(r["price_eur"]) for r in self._query("""
                    SELECT price_eur
                    FROM silver.prices
                    WHERE product_code = :c
                    AND price_eur IS NOT NULL
                    AND price_eur > 0
                    AND price_eur < 1000
                    AND price_eur < COALESCE(
                        (
                            SELECT PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY price_eur)
                            FROM silver.prices
                            WHERE product_code = :c
                                AND price_eur > 0
                                AND price_eur < 1000
                        ),
                        1000
                    )
                """, {"c": product_code})
            ]
            own, comps = [], list(market)
            if company_name:
                own = [
                    float(r["price_eur"]) for r in self._query("""
                        SELECT p.price_eur
                        FROM silver.prices p
                        JOIN silver.magasin m ON m.magasin_id = p.magasin_id
                        WHERE p.product_code = :c
                        AND m.nom_enseigne ILIKE :n
                        AND p.price_eur IS NOT NULL
                        AND p.price_eur > 0
                        AND p.price_eur < 1000
                        ORDER BY p.date DESC
                        LIMIT 10
                    """, {"c": product_code, "n": f"%{company_name}%"})
                ]
                logger.info(
                    "EAN=%s company_name=%r pattern=%r own=%d market=%d",
                    product_code,
                    company_name,
                    f"%{company_name}%",
                    len(own),
                    len(market)
                )
                comps = [
                    float(r["price_eur"]) for r in self._query("""
                        SELECT p.price_eur
                        FROM silver.prices p
                        LEFT JOIN silver.magasin m ON m.magasin_id = p.magasin_id
                        WHERE p.product_code = :c
                          AND (m.nom_enseigne NOT ILIKE :n OR m.nom_enseigne IS NULL)
                          AND p.price_eur IS NOT NULL AND p.price_eur > 0
                    """, {"c": product_code, "n": f"%{company_name}%"})
                ]
            return {
                "market_prices":     market,
                "own_prices":        own,
                "competitor_prices": comps,
                "found_in_db":       len(market) > 0
            }
        except Exception as e:
            logger.warning(f"fetch_market_data error {product_code}: {e}")
            return {"market_prices": [], "own_prices": [], "competitor_prices": [], "found_in_db": False}

    def _compute_rule_price(self, rule, base_price: float, market_data: dict) -> tuple:
        name   = rule.name.lower().replace(" ", "_")
        params = rule.params or {}
        market = market_data["market_prices"]
        comps  = market_data["competitor_prices"]
        own    = market_data["own_prices"]

        if name == "aggregation_rule":
            # Utiliser les prix concurrents si disponibles, sinon marché complet
            source = comps if comps else market
            if not source:
                return base_price, "Aucun prix marché — fallback"
            agg = self._get_param(params, "aggregation_function", "median")
            if agg == "lowest":
                suggested = min(source)
            elif agg == "average":
                suggested = sum(source) / len(source)
            else:
                suggested = statistics.median(source)
            label = "comps" if comps else "market"
            return round(suggested, 4), f"agg={agg}, n={len(source)}, source={label}"
        elif name == "floor_price_rule":
            # floor_value : seuil absolu configuré dans les params de la règle
            # floor_pct   : seuil relatif (% du prix de base), optionnel
            floor_value = float(self._get_param(params, "floor_value", 0.0))
            floor_pct   = float(self._get_param(params, "floor_pct",   0.0))

            floor_from_pct = round(base_price * (1.0 - floor_pct / 100.0), 4) if floor_pct > 0 else 0.0
            floor = max(floor_value, floor_from_pct)

            if floor <= 0:
                return base_price, "Aucun floor configuré — fallback"

            final = round(max(base_price, floor), 4)
            return final, f"floor={round(floor,4)}€ (value={floor_value}, pct={floor_pct}%)"

        elif name == "competitor_beat_rule":
            source = comps if comps else market
            if not source:
                return base_price, "Aucun prix concurrent — fallback"
            pct = float(self._get_param(params, "discount_pct", 3.0))
            avg_source = sum(source) / len(source)
            suggested = round(avg_source * (1.0 - pct / 100.0), 4)
            suggested = min(suggested, base_price)
            label = "comps" if comps else "market"
            return suggested, f"{label}_avg={round(avg_source,4)} × (1−{pct}%)"

        elif name == "market_average_rule":
            if not market:
                return base_price, "Aucun prix marché — fallback"
            avg = sum(market) / len(market)
            return round(avg, 4), f"AVG({len(market)} prix marché)"

        elif name == "min_store_price_rule":
            if not own:
                return base_price, "Aucun prix magasin user — fallback"
            min_store = min(own)
            return round(max(base_price, min_store), 4), f"MIN(store)={round(min_store,4)}€"

        elif name == "stability_rule":
            source = own if len(own) >= 2 else market
            if len(source) < 2:
                return base_price, "Historique insuffisant — fallback"
            price_t  = source[0]
            price_t1 = source[1]
            if price_t1 <= 0 or price_t == price_t1:
                return base_price, "Prix identiques — stable"
            high = float(self._get_param(params, "high_threshold_pct", 15.0))
            low  = float(self._get_param(params, "low_threshold_pct", 1.0))
            var  = abs(price_t - price_t1) / price_t1 * 100
            if var > high:
                capped = round(price_t1 * (1 + high / 100), 4)
                return capped, f"variation={round(var,1)}% > {high}% → capé"
            if var < low:
                return base_price, f"variation={round(var,1)}% < {low}% → stable"
            return base_price, f"variation={round(var,1)}% → stable"
                
        formula = getattr(rule, 'formula', None)
        if formula:
            context = {
                'price':            base_price,
                'market_average':   round(sum(market) / len(market), 4) if market else base_price,
                'competitor_price': round(sum(comps)  / len(comps),  4) if comps  else base_price,
                'own_price':        round(sum(own)     / len(own),    4) if own    else base_price,
                'min_market':       min(market) if market else base_price,
                'max_market':       max(market) if market else base_price,
            }
            try:
                result = eval(formula, {"__builtins__": {}}, context)
                return round(float(result), 4), f"custom formula: {formula}"
            except Exception as e:
                logger.warning("Custom rule formula eval error: %s", str(e))
                return base_price, "Formule invalide — fallback"

        return base_price, "Rule inconnue fallback"

    
    def compute_price(self, ean: str, strategy, company_name: str = None) -> dict:
        """
        Calcule le prix optimal pour un EAN selon une stratégie.

        1. Résout le prix de base depuis silver.prices
        2. Récupère market_data (marché, own, concurrents)
        3. Applique chaque règle active avec son coefficient
        4. Retourne le prix final = somme des (prix_suggéré × coefficient)
        """
        rules = [(sr.rule, sr.coefficient) for sr in strategy.rules if sr.rule is not None and sr.rule.active]
        if not rules:
            raise HTTPException(status_code=400, detail={"error": "EMPTY_STRATEGY", "message": "Aucune règle active dans la stratégie"})

        total_coeff = sum(c for _, c in rules)
        if total_coeff > 0 and abs(total_coeff - 1.0) > 0.01:
            rules = [(r, round(c / total_coeff, 4)) for r, c in rules]

        base_price   = self._resolve_base_price(ean, company_name)
        market_data  = self._fetch_market_data(ean, company_name)
        contributions = []

        for rule, coeff in rules:
            suggested, detail = self._compute_rule_price(rule, base_price, market_data)
            contributions.append({
                "rule":        rule.name,
                "rule_id":     rule.id,
                "params":      rule.params or {},
                "suggested":   suggested,
                "coefficient": coeff,
                "weighted":    round(suggested * coeff, 4),
                "detail":      detail
            })

        valid = [c for c in contributions if "fallback" not in c["detail"]]

        if valid:
            total_valid_coeff = sum(c["coefficient"] for c in valid)
            final_price = round(
                sum(c["suggested"] * (c["coefficient"] / total_valid_coeff)
                    for c in valid),
                2
            )
        else:
            # Toutes les règles en fallback → prix inchangé
            final_price = round(base_price, 2)

        price_change = round(final_price - base_price, 2)
        change_pct   = round((price_change / base_price) * 100, 1) if base_price > 0 else 0.0
        logger.info(
            "EAN=%s base=%.4f market=%d own=%d comps=%d contributions=%s",
            ean,
            base_price,
            len(market_data["market_prices"]),
            len(market_data["own_prices"]),
            len(market_data["competitor_prices"]),
            [(c["rule"], c["suggested"], c["detail"]) for c in contributions]
        )
        return {
            "product_id":        ean,
            "original_price":    round(base_price, 2),
            "final_price":       final_price,
            "price_change":      price_change,
            "change_pct":        change_pct,
            "currency":          "EUR",
            "strategy_name":     strategy.name,
            "is_custom":         strategy.is_custom,
            "contributions":     contributions,
            "fallback_count":    len(contributions) - len(valid),  # ← info utile pour debug
            "market_data": {
                "market_prices_count":     len(market_data["market_prices"]),
                "competitor_prices_count": len(market_data["competitor_prices"]),
                "own_prices_count":        len(market_data["own_prices"]),
                "found_in_db":             market_data["found_in_db"]
            }
        }

    def get_products_for_scope(self, eans, category, brand, limit, company_name: str = None) -> list:
        """
        Résout le périmètre de produits :
        - eans      → liste d'EANs fournis directement
        - category  → tous les EANs de cette catégorie (silver.products JOIN silver.category)
        - brand     → tous les EANs de cette marque (silver.products JOIN silver.brand)

        Retourne une liste d'EANs (strings).
        """
        if eans:
            return [e.strip() for e in eans if e.strip()]

        if category:
            rows = self._query("""
                SELECT DISTINCT pr.product_code
                FROM silver.products pr
                JOIN silver.prices p ON p.product_code = pr.product_code
                JOIN silver.category c ON c.category_tag = ANY(
                    string_to_array(pr.brand_id, ',')
                )
                WHERE c.category_name ILIKE :cat
                  AND pr.product_name IS NOT NULL
                  AND p.price_eur IS NOT NULL AND p.price_eur > 0
                LIMIT :limit
            """, {"cat": f"%{category}%", "limit": limit})
            # Fallback : chercher directement dans products si la jointure ne retourne rien
            if not rows:
                rows = self._query("""
                    SELECT DISTINCT pr.product_code
                    FROM silver.products pr
                    JOIN silver.prices p ON p.product_code = pr.product_code
                    WHERE pr.product_name IS NOT NULL
                      AND p.price_eur IS NOT NULL AND p.price_eur > 0
                    LIMIT :limit
                """, {"limit": limit})
            if not rows:
                raise HTTPException(status_code=404, detail=f"Aucun produit trouvé pour la catégorie '{category}'")
            return [r["product_code"] for r in rows]

        if brand:
            rows = self._query("""
                SELECT DISTINCT pr.product_code
                FROM silver.products pr
                JOIN silver.prices p ON p.product_code = pr.product_code
                WHERE pr.brand_primary ILIKE :brand
                  AND pr.product_name IS NOT NULL
                  AND p.price_eur IS NOT NULL AND p.price_eur > 0
                LIMIT :limit
            """, {"brand": f"%{brand}%", "limit": limit})
            if not rows:
                raise HTTPException(status_code=404, detail=f"Aucun produit trouvé pour la marque '{brand}'")
            return [r["product_code"] for r in rows]

        raise HTTPException(status_code=400, detail="Fournir eans, category ou brand")