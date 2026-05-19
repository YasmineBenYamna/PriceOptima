"""
catalogs.py
-----------
CatalogMixin : chargement et cache des catalogs rules/strategies depuis l'app DB.

Responsabilités :
- Charger les règles actives depuis la table `rules`
- Charger les stratégies système depuis les tables `strategies` + `strategy_rules`
- Construire les frozensets de rule_ids par stratégie (détection faux CUSTOM)
- Exposer reload_catalogs() pour forcer un rechargement à chaud

Usage :
    class LLMService(CatalogMixin):
        def __init__(self, db_manager, ...):
            self._db = db_manager
            self._catalog_lock = threading.Lock()
            self.RULES_CATALOG = {}
            self.STRATEGIES_CATALOG = {}
            self._STRATEGY_RULE_SETS = {}
"""

from __future__ import annotations

import json
import logging
from collections import defaultdict
from typing import TYPE_CHECKING, Any, Dict

from fastapi import HTTPException

if TYPE_CHECKING:
    pass

logger = logging.getLogger("llm_service.catalogs")

# IDs des stratégies système chargées depuis la DB
_SYSTEM_STRATEGY_IDS = ("s1", "s2", "s3")


class CatalogMixin:
    """
    Mixin de chargement des catalogs rules/strategies depuis l'app DB.

    Requiert que la classe hôte expose :
    - self._db          : db_manager avec méthode app_conn()
    - self._catalog_lock: threading.Lock()
    - self.RULES_CATALOG, self.STRATEGIES_CATALOG, self._STRATEGY_RULE_SETS : dict
    """

    # ──────────────────────────────────────────────────────────────────────────
    # Public
    # ──────────────────────────────────────────────────────────────────────────

    def reload_catalogs(self) -> None:
        """Force le rechargement complet des catalogs (thread-safe)."""
        with self._catalog_lock:
            self.RULES_CATALOG = {}
            self.STRATEGIES_CATALOG = {}
            self._STRATEGY_RULE_SETS = {}
            self._ensure_catalogs_loaded()

    # ──────────────────────────────────────────────────────────────────────────
    # Internal — lazy loading
    # ──────────────────────────────────────────────────────────────────────────

    def _ensure_catalogs_loaded(self) -> None:
        """Charge les catalogs si absents (idempotent, thread-safe)."""
        if self.RULES_CATALOG and self.STRATEGIES_CATALOG and self._STRATEGY_RULE_SETS:
            return

        try:
            self.RULES_CATALOG = self._load_rules_catalog()
            self.STRATEGIES_CATALOG = self._load_strategies_catalog()
            self._STRATEGY_RULE_SETS = self._build_strategy_rule_sets()

            logger.info(
                "LLM catalogs loaded — %d rules, %d strategies",
                len(self.RULES_CATALOG),
                len(self.STRATEGIES_CATALOG),
            )
        except HTTPException:
            raise
        except Exception as exc:
            logger.exception("Failed to load LLM catalogs: %s", exc)
            raise HTTPException(
                status_code=500,
                detail=f"Unable to load LLM catalogs: {exc}",
            )

    # ──────────────────────────────────────────────────────────────────────────
    # Loaders
    # ──────────────────────────────────────────────────────────────────────────

    def _load_rules_catalog(self) -> Dict[str, Dict[str, Any]]:
        """Charge les règles actives depuis la table `rules`."""
        logger.info("Loading rules catalog from app DB...")

        rows = self._query_app(
            """
            SELECT id, name, description, params
            FROM   rules
            WHERE  active = true
            ORDER  BY id
            """,
            {},
        )

        if not rows:
            raise HTTPException(
                status_code=500,
                detail="No active rules found in the rules table.",
            )

        catalog: Dict[str, Dict[str, Any]] = {}

        for row in rows:
            rule_id = row["id"]
            params_raw = self._parse_json_field(row.get("params"), f"rules.params[{rule_id}]")
            rule_name = row.get("name") or rule_id

            catalog[rule_id] = {
                "name":        rule_name,
                "label":       rule_name,
                "description": row.get("description") or "",
                "params":      params_raw,
            }

        return catalog

    def _load_strategies_catalog(self) -> Dict[str, Dict[str, Any]]:
        """Charge les stratégies système et leurs règles associées."""
        logger.info("Loading strategies catalog from app DB...")

        placeholders = ", ".join(f"'{sid}'" for sid in _SYSTEM_STRATEGY_IDS)

        strategies_rows = self._query_app(
            f"""
            SELECT id, name, description
            FROM   strategies
            WHERE  id IN ({placeholders})
            ORDER  BY id
            """,
            {},
        )

        strategy_rules_rows = self._query_app(
            f"""
            SELECT strategy_id, rule_id, coefficient
            FROM   strategy_rules
            WHERE  strategy_id IN ({placeholders})
            ORDER  BY strategy_id, rule_id
            """,
            {},
        )

        rules_by_strategy: Dict[str, list] = defaultdict(list)

        for row in strategy_rules_rows:
            strategy_id = row["strategy_id"]
            rule_id = row["rule_id"]

            if rule_id not in self.RULES_CATALOG:
                logger.warning(
                    "strategy_rules references unknown/inactive rule_id=%s for strategy_id=%s",
                    rule_id,
                    strategy_id,
                )
                continue

            rules_by_strategy[strategy_id].append(
                {
                    "rule_id":     rule_id,
                    "coefficient": float(row["coefficient"]),
                }
            )

        if not strategies_rows:
            raise HTTPException(
                status_code=500,
                detail="No system strategies found in the strategies table.",
            )

        return {
            row["id"]: {
                "id":           row["id"],
                "name":         row.get("name") or row["id"],
                "description":  row.get("description") or "",
                "default_rules": rules_by_strategy.get(row["id"], []),
            }
            for row in strategies_rows
        }

    def _build_strategy_rule_sets(self) -> Dict[str, frozenset]:
        """Construit les frozensets de rule_ids par stratégie (détection faux CUSTOM)."""
        return {
            sid: frozenset(rule["rule_id"] for rule in strategy["default_rules"])
            for sid, strategy in self.STRATEGIES_CATALOG.items()
        }

    # ──────────────────────────────────────────────────────────────────────────
    # Helpers
    # ──────────────────────────────────────────────────────────────────────────

    def _query_app(self, sql: str, params: dict) -> list:
        """Exécute une requête sur la connexion app DB."""
        from sqlalchemy import text

        with self._db.app_conn() as conn:
            result = conn.execute(text(sql), params)
            return [dict(row._mapping) for row in result]

    @staticmethod
    def _parse_json_field(value: Any, context: str = "") -> dict:
        """Parse un champ JSON stocké en string ou dict ; retourne {} si invalide."""
        if value is None:
            return {}
        if isinstance(value, dict):
            return value
        if isinstance(value, str):
            try:
                parsed = json.loads(value)
                return parsed if isinstance(parsed, dict) else {}
            except json.JSONDecodeError:
                logger.warning("Invalid JSON in field %s", context)
                return {}
        return {}