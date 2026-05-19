from __future__ import annotations

import json
import logging
import os
import threading
from typing import Any, Dict, List, Optional

from fastapi import HTTPException
from groq import BadRequestError, Groq, RateLimitError
from pydantic import ValidationError
from sqlalchemy import text

from schemas.llm import LLMSuggestResponse, RuleInStrategy
from services.catalogs import CatalogMixin
from services.prompt_builder import build_prompt, get_price_gap_pct
from services.rule_helpers import (
    build_ilike_filter,
    clamp_existing_rule_params,
    extract_json_object,
    find_rule,
    map_llm_rule_to_schema,
    normalize_rule_coefficients,
    to_list,
)

logger = logging.getLogger("llm_service")


class LLMService(CatalogMixin):
    """
    Suggère une stratégie de pricing optimale via LLM (Groq / Llama).
    """
    # ── Modèles Groq par ordre de préférence ──────────────────────────────────
    DEFAULT_MODELS = [
    "llama-3.3-70b-versatile",  # principal
    "llama-3.1-8b-instant",     # secours
]

    # ── IDs / noms stratégie CUSTOM ───────────────────────────────────────────
    CUSTOM_STRATEGY_ID   = "s4"
    CUSTOM_STRATEGY_NAME = "CUSTOM"

    # ── Seuils de position concurrentielle (%) ────────────────────────────────
    GAP_MODERATE_ABOVE = 5.0
    GAP_STRONG_ABOVE   = 15.0
    GAP_MODERATE_BELOW = -5.0
    GAP_STRONG_BELOW   = -15.0

    # ── Caps sur le coefficient r3 selon nb_concurrents ──────────────────────
    MAX_R3_NO_COMPETITORS  = 0.20
    MAX_R3_LOW_COMPETITORS = 0.35

    # ────────────────────────────Init─────────────────────────────────────────
    def __init__(
        self,
        db_manager,
        groq_api_key: str,
        model_name: Optional[str] = None,
    ) -> None:
        self._db     = db_manager
        self._client = Groq(api_key=groq_api_key)

        # Résolution des modèles : env var > argument > defaults
        preferred = model_name or os.getenv("GROQ_MODEL")
        self._models: List[str] = [preferred] if preferred else []
        self._models.extend(m for m in self.DEFAULT_MODELS if m not in self._models)

        # Catalogs chargés lazily par CatalogMixin
        self._catalog_lock    = threading.Lock()
        self.RULES_CATALOG:      Dict[str, Dict[str, Any]] = {}
        self.STRATEGIES_CATALOG: Dict[str, Dict[str, Any]] = {}
        self._STRATEGY_RULE_SETS: Dict[str, frozenset]     = {}

    # ────────────────────────────Public──────────────────────────────────────────────────────────

    def suggest_strategy(
        self,
        category,
        brand,
        magasin_id: Optional[str] = None,
        company_name: str = "",
    ) -> dict:
        """
        Suggère une stratégie optimale pour le magasin connecté.
        Flow :
        1. Chargement lazy des catalogs (CatalogMixin)
        2. Validation des entrées
        3. Récupération de la dernière période disponible
        4. Métriques magasin + concurrents + sanity check
        5. Construction du prompt + appel Groq avec fallback
        6. Parsing, validation Pydantic, business guards
        7. Injection du contexte dans la réponse finale
        """
        self._ensure_catalogs_loaded()

        categories = to_list(category)
        brands     = to_list(brand)

        if not categories and not brands:
            raise HTTPException(status_code=400, detail="Provide at least category or brand.")
        if not magasin_id:
            raise HTTPException(status_code=400, detail="Store not found.")

        date_id = self._get_latest_date_id()
        if not date_id:
            raise HTTPException(status_code=503, detail="No pricing data available.")

        own = self._get_own_metrics(magasin_id, categories, brands, date_id)
        if not own:
            raise HTTPException(status_code=404, detail="No pricing data found for this store.")

        market  = self._get_market_metrics(magasin_id, categories, brands, date_id)
        self._sanity_check(own, market)
        network = self._get_network_info(magasin_id)

        prompt     = build_prompt(own, market, network, categories, brands, company_name,
                                  self.RULES_CATALOG, self.STRATEGIES_CATALOG)
        raw_result = self._call_groq_with_fallback(prompt)
        parsed     = self._parse_and_validate_llm_output(raw_result)
        parsed     = self._apply_business_guards(parsed, own=own, market=market)
        parsed     = self._rebuild_response_with_context(
            parsed=parsed,
            own=own, market=market, network=network,
            categories=categories, brands=brands,
            company_name=company_name, magasin_id=magasin_id, date_id=date_id,
        )
        return parsed.model_dump()

    # ────────────────────────────Market DB────────────────────────────────────────────

    def _query(self, sql: str, params: dict) -> list:
        with self._db.market_conn() as conn:
            result = conn.execute(text(sql), params)
            return [dict(row._mapping) for row in result]

    def _get_latest_date_id(self) -> Optional[int]:
        rows = self._query(
            "SELECT MAX(date_id) AS max_date FROM gold.dm_pricing_performance", {}
        )
        if rows and rows[0].get("max_date"):
            return rows[0]["max_date"]
        return None

    def _get_own_metrics(
        self,
        magasin_id: str,
        categories: Optional[List[str]],
        brands: Optional[List[str]],
        date_id: Optional[int],
    ) -> dict:
        params  = {"magasin_id": magasin_id}
        filters = "WHERE dp.magasin_id = :magasin_id"

        if date_id:
            filters += " AND dp.date_id = :date_id"
            params["date_id"] = date_id
        if categories:
            filters += " " + build_ilike_filter("c.category_name", categories, params, "cat")
        if brands:
            filters += " " + build_ilike_filter("b.brand_name", brands, params, "brd")

        ipp_cat_sel   = "ROUND(AVG(dp.ipp_category)::NUMERIC, 2) AS ipp_category" if categories else "NULL AS ipp_category"
        ipp_brand_sel = "ROUND(AVG(dp.ipp_brand)::NUMERIC, 2) AS ipp_brand"       if brands     else "NULL AS ipp_brand"

        rows = self._query(
        f"""
        SELECT
            ROUND(AVG(dp.avg_price_eur)::NUMERIC, 4)              AS avg_price_eur,
            ROUND(AVG(dp.ipp_global)::NUMERIC, 2)                 AS ipp_global,
            {ipp_cat_sel},
            {ipp_brand_sel},
            ROUND(AVG(dp.price_evolution_pct_mom)::NUMERIC, 2)    AS price_evolution_mom,
            ROUND(AVG(dp.indice_saisonnier_category)::NUMERIC, 2) AS indice_saisonnier_category,
            ROUND(AVG(mp.taux_promo_global)::NUMERIC, 2)          AS taux_promo_global,
            ROUND(AVG(mp.rang_category)::NUMERIC, 1)              AS rang_category,
            SUM(dp.nb_prices)                                     AS nb_prices
        FROM gold.dm_pricing_performance dp
        LEFT JOIN gold.dm_market_positioning mp
            ON mp.magasin_id  = dp.magasin_id
            AND mp.category_id = dp.category_id
            AND mp.brand_id    = dp.brand_id
            AND mp.date_id     = dp.date_id
        LEFT JOIN silver.category c ON c.category_id = dp.category_id
        LEFT JOIN silver.brand    b ON b.brand_id    = dp.brand_id
        {filters}
        """,
        params,
        )
        return rows[0] if rows and rows[0].get("avg_price_eur") is not None else {}
    def _get_market_metrics(
        self,
        magasin_id: str,
        categories: Optional[List[str]],
        brands: Optional[List[str]],
        date_id: Optional[int],
    ) -> dict:
        """
        Lit les métriques concurrentielles depuis dm_market_positioning
        (concurrents = tous les magasin_id != magasin connecté, même périmètre catégorie/marque).
        """
        params  = {"magasin_id": magasin_id}
        filters = "WHERE mp.magasin_id != :magasin_id AND mp.avg_price_eur IS NOT NULL"

        if date_id:
            filters += " AND mp.date_id = :date_id"
            params["date_id"] = date_id
        if categories:
            filters += " " + build_ilike_filter("c.category_name", categories, params, "cat")
        if brands:
            filters += " " + build_ilike_filter("b.brand_name", brands, params, "brd")

        rows = self._query(
            f"""
            SELECT
                ROUND(AVG(mp.avg_price_eur)::NUMERIC, 4)                       AS market_avg_price_eur,
                ROUND(AVG(mp.indice_saisonnier_marche_cat)::NUMERIC, 2)        AS market_indice_saisonnier_cat,
                ROUND(AVG(mp.taux_promo_global)::NUMERIC, 2)                   AS market_taux_promo_global,
                ROUND(AVG(mp.taux_promo_category)::NUMERIC, 2)                 AS market_taux_promo_category,
                ROUND(AVG(mp.rang_category)::NUMERIC, 1)                       AS market_avg_rang_category,
                COUNT(DISTINCT mp.magasin_id)                                  AS nb_concurrents
            FROM gold.dm_market_positioning mp
            LEFT JOIN silver.category c ON c.category_id = mp.category_id
            LEFT JOIN silver.brand    b ON b.brand_id    = mp.brand_id
            {filters}
            """,
            params,
        )
        return rows[0] if rows else {}
    
    def _get_network_info(self, magasin_id: str) -> dict:
        rows = self._query(
            """
            SELECT network_tier, nb_stores, nb_stores_actifs
            FROM   gold.dm_store_network dsn
            JOIN   silver.magasin m ON m.magasin_id = dsn.magasin_id
            WHERE  dsn.magasin_id = :magasin_id
            LIMIT  1
            """,
            {"magasin_id": magasin_id},
        )
        return rows[0] if rows else {}

    def _sanity_check(self, own: dict, market: dict) -> None:
        market_avg = market.get("market_avg_price_eur")
        own_avg    = own.get("avg_price_eur")

        if market_avg and float(market_avg) > 1000:
            raise HTTPException(
                status_code=422,
                detail="Abnormal market data detected. Please check the pipeline.",
            )
        if own_avg and market_avg:
            ratio = float(own_avg) / float(market_avg)
            if ratio > 10 or ratio < 0.1:
                raise HTTPException(
                    status_code=422,
                    detail=f"Inconsistent store/market price ratio (ratio={ratio:.2f}).",
                )

    # ────────────────────────────Groq — appel avec fallback multi-modèles────────────────────────────────────────────────────

    def _call_groq_with_fallback(self, prompt: str) -> dict:
        raw = cleaned = ""
        last_error: Optional[Exception] = None

        for model_name in self._models:
            try:
                logger.info("Trying Groq model: %s", model_name)

                response = self._client.chat.completions.create(
                    model=model_name,
                    messages=[
                        {
                            "role": "system",
                            "content": (
                                "You are a senior retail pricing strategy expert. "
                                "Respond ONLY with valid JSON in English, "
                                "without markdown and without extra text."
                            ),
                        },
                        {"role": "user", "content": prompt},
                    ],
                    temperature=0.05,
                    max_tokens=900,
                    response_format={"type": "json_object"},
                )

                content = response.choices[0].message.content
                if not content:
                    raise HTTPException(status_code=502, detail="LLM returned empty content.")

                raw     = content.strip()
                cleaned = extract_json_object(raw)
                logger.info("Groq response ok with model=%s", model_name)
                return json.loads(cleaned)

            except BadRequestError as exc:
                last_error = exc
                err_text   = str(exc)
                logger.warning("Groq BadRequestError on model=%s: %s", model_name, err_text)
                if "decommissioned" in err_text:
                    continue
                raise HTTPException(status_code=503, detail=f"LLM bad request: {err_text}")

            except RateLimitError as exc:
                logger.warning("Groq rate limit reached on model=%s: %s", model_name, exc)
                raise HTTPException(
                    status_code=429,
                    detail="LLM rate limit reached. Please try again later.",
                )

            except json.JSONDecodeError as exc:
                logger.error(
                    "LLM JSON parse error: %s | raw=%s | cleaned=%s",
                    exc, raw[:500], cleaned[:500],
                )
                raise HTTPException(status_code=502, detail="LLM did not return valid JSON.")

            except HTTPException:
                raise

            except Exception as exc:
                last_error = exc
                logger.exception("Groq API error on model=%s: %s", model_name, exc)

        raise HTTPException(
            status_code=503,
            detail=f"All configured Groq models failed. Last error: {last_error}",
        )

    # ────────────────────────────Parsing & validation─────────────────────────────────────────────────

    def _parse_and_validate_llm_output(self, result: dict) -> LLMSuggestResponse:
        try:
            mapped_rules = [map_llm_rule_to_schema(r) for r in result.get("rules", [])]
            mapped_rules = normalize_rule_coefficients(mapped_rules)

            has_custom_rule   = any(r.is_new for r in mapped_rules)
            existing_rule_ids = []

            for rule in mapped_rules:
                if not rule.is_new:
                    if rule.rule_id not in self.RULES_CATALOG:
                        raise HTTPException(
                            status_code=502,
                            detail=f"Unknown existing rule_id: {rule.rule_id}",
                        )
                    existing_rule_ids.append(rule.rule_id)
                    clamp_existing_rule_params(rule, self.RULES_CATALOG)

            strategy_id, strategy_name, is_custom = self._resolve_strategy(
                result, has_custom_rule, existing_rule_ids
            )

            payload = {
                "recommended_strategy_id":   strategy_id,
                "recommended_strategy_name": strategy_name,
                "is_custom":                 is_custom,
                "confidence_score":          result.get("confidence_score"),
                "rules":                     [r.model_dump() for r in mapped_rules],
                "reasoning":                 result.get("reasoning") or {},
                "explanation":               result.get("explanation") or "",
                "context_used":              result.get("context_used") or {},
            }
            return LLMSuggestResponse.model_validate(payload)

        except ValidationError as exc:
            logger.error("LLM validation error: %s", exc)
            raise HTTPException(status_code=502, detail=f"Invalid LLM response: {exc}")
        except HTTPException:
            raise
        except Exception as exc:
            logger.exception("Unexpected validation error: %s", exc)
            raise HTTPException(status_code=502, detail=f"Invalid LLM response: {exc}")

    def _resolve_strategy(
        self,
        result: dict,
        has_custom_rule: bool,
        existing_rule_ids: List[str],
    ) -> tuple[str, str, bool]:
        """Détermine l'ID/nom/is_custom de la stratégie retournée par le LLM."""
        if has_custom_rule:
            return self.CUSTOM_STRATEGY_ID, self.CUSTOM_STRATEGY_NAME, True

        returned_rule_ids = frozenset(existing_rule_ids)
        for sid, system_rule_ids in self._STRATEGY_RULE_SETS.items():
            if returned_rule_ids == system_rule_ids:
                return sid, self.STRATEGIES_CATALOG[sid]["name"], False

        # Combinaison de rule_ids inconnue → CUSTOM légitime
        return self.CUSTOM_STRATEGY_ID, self.CUSTOM_STRATEGY_NAME, True

    def _rebuild_response_with_context(
        self,
        parsed: LLMSuggestResponse,
        own: dict,
        market: dict,
        network: dict,
        categories: Optional[List[str]],
        brands: Optional[List[str]],
        company_name: str,
        magasin_id: str,
        date_id: int,
    ) -> LLMSuggestResponse:
        payload = parsed.model_dump()
        payload["context_used"] = {
    "company_name":                company_name,
    "magasin_id":                  magasin_id,
    "date_id":                     date_id,
    "categories":                  categories,
    "brands":                      brands,
    "own_avg_price_eur":           own.get("avg_price_eur"),
    "market_avg_price_eur":        market.get("market_avg_price_eur"),
    "price_gap_pct":               get_price_gap_pct(own, market),
    "own_ipp_category":            own.get("ipp_category"),
    "own_ipp_brand":               own.get("ipp_brand"),
    "price_evolution_mom":         own.get("price_evolution_mom"),
    "nb_concurrents":              market.get("nb_concurrents"),
    "network_tier":                network.get("network_tier"),
    "market_taux_promo_global":    market.get("market_taux_promo_global"),
    "market_taux_promo_category":  market.get("market_taux_promo_category"),
    "market_avg_rang_category":    market.get("market_avg_rang_category"),
    }
        return LLMSuggestResponse.model_validate(payload)

    # ────────────────────────────Business guards — post-LLM─────────────────────────────────────────────────

    def _apply_business_guards(
        self,
        parsed: LLMSuggestResponse,
        own: dict,
        market: dict,
    ) -> LLMSuggestResponse:
        """
        Applique les gardes métier sur la réponse LLM.

        Guards (par ordre de priorité) :
        1. Aucun concurrent → protection interne forcée (CUSTOM)
        2. Store > +15% marché → MARKET_ALIGNED forcé (s3)
        3. Store < -15% marché + ≥3 concurrents → AGGRESSIVE forcé (s1)
        4. 1-2 concurrents → cap du coefficient r3
        """
        rules          = parsed.rules[:]
        nb_concurrents = int(market.get("nb_concurrents") or 0)
        price_gap_pct  = get_price_gap_pct(own, market)
        strategy_overridden = False

        # ── Guard 1 : No competitors ──────────────────────────────────────────
        if nb_concurrents == 0:
            rules = self._guard_no_competitors(rules)
            parsed.recommended_strategy_id   = self.CUSTOM_STRATEGY_ID
            parsed.recommended_strategy_name = self.CUSTOM_STRATEGY_NAME
            parsed.is_custom = True
            parsed.reasoning["strategy_choice"] = (
                "Custom protection-oriented strategy applied: no active competitors in scope."
            )
            strategy_overridden = True

        # ── Guard 2 : Strongly above market → force s3 ───────────────────────
        elif price_gap_pct is not None and price_gap_pct > self.GAP_STRONG_ABOVE:
            rules = self._get_system_rules_for_strategy("s3") or rules
            parsed.recommended_strategy_id   = "s3"
            parsed.recommended_strategy_name = "MARKET_ALIGNED"
            parsed.is_custom = False
            parsed.reasoning["strategy_choice"] = (
                f"Market-aligned strategy enforced: store is +{price_gap_pct:.1f}% above market."
            )
            strategy_overridden = True

        # ── Guard 3 : Strongly below market + enough competitors → force s1 ──
        elif (
            price_gap_pct is not None
            and price_gap_pct < self.GAP_STRONG_BELOW
            and nb_concurrents >= 3
        ):
            rules = self._get_system_rules_for_strategy("s1") or rules
            parsed.recommended_strategy_id   = "s1"
            parsed.recommended_strategy_name = "AGGRESSIVE"
            parsed.is_custom = False
            parsed.reasoning["strategy_choice"] = (
                f"Aggressive strategy enforced: store is {price_gap_pct:.1f}% below market "
                f"with {nb_concurrents} active competitors."
            )
            strategy_overridden = True

        # ── Guard 4 : Few competitors → cap r3 ───────────────────────────────
        if not strategy_overridden and nb_concurrents in (1, 2):
            r3 = find_rule(rules, "r3")
            if r3 and float(r3.coefficient) > self.MAX_R3_LOW_COMPETITORS:
                r3.coefficient = self.MAX_R3_LOW_COMPETITORS

        # ── Synchronisation explanation ───────────────────────────────────────
        if strategy_overridden:
            parsed.explanation = (
                f"[Adjusted by business rules] "
                f"{parsed.reasoning.get('strategy_choice', '')} "
                f"Original LLM explanation: {parsed.explanation}"
            ).strip()

        rules = normalize_rule_coefficients(rules)

        try:
            payload = parsed.model_dump()
            payload["rules"] = [r.model_dump() for r in rules]
            return LLMSuggestResponse.model_validate(payload)
        except ValidationError as exc:
            logger.error("Business guards produced invalid response: %s", exc)
            raise HTTPException(status_code=502, detail=f"Invalid guarded LLM response: {exc}")

    def _guard_no_competitors(self, rules: List[RuleInStrategy]) -> List[RuleInStrategy]:
        """Applique les ajustements de protection quand nb_concurrents = 0."""
        
        # Retirer competitor_beat_rule (r3) : sans concurrents, elle n'a pas de sens
        rules = [r for r in rules if r.rule_id != "r3"]
        
        r2_name = self.RULES_CATALOG.get("r2", {}).get("name", "floor_price_rule")
        r6_name = self.RULES_CATALOG.get("r6", {}).get("name", "stability_rule")

        if find_rule(rules, "r2") is None and len(rules) < 4 and "r2" in self.RULES_CATALOG:
            rules.append(RuleInStrategy(
                rule_id="r2", rule_name=r2_name,
                coefficient=0.20, params={}, is_new=False,
            ))

        if find_rule(rules, "r6") is None and len(rules) < 4 and "r6" in self.RULES_CATALOG:
            rules.append(RuleInStrategy(
                rule_id="r6", rule_name=r6_name,
                coefficient=0.20, params={}, is_new=False,
            ))

        return rules

    def _get_system_rules_for_strategy(self, strategy_id: str) -> List[RuleInStrategy]:
        """Retourne les règles système d'une stratégie sous forme de RuleInStrategy."""
        strategy = self.STRATEGIES_CATALOG.get(strategy_id)
        if not strategy:
            return []
        return [
            RuleInStrategy(
                rule_id=r["rule_id"],
                rule_name=self.RULES_CATALOG.get(r["rule_id"], {}).get("name", r["rule_id"]),
                coefficient=float(r["coefficient"]),
                params={},
                is_new=False,
            )
            for r in strategy["default_rules"]
        ]
