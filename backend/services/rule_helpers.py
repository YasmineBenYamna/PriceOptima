from __future__ import annotations

import re
import logging
from typing import Any, Dict, List, Optional

from fastapi import HTTPException
from pydantic import ValidationError

from schemas.llm import RuleInStrategy

logger = logging.getLogger("llm_service")


# ─────────────────────────────────────────────────Static helpers─────────────────────────────────────────────────


def normalize_rule_coefficients(
    rules: List[RuleInStrategy],
) -> List[RuleInStrategy]:
    total = sum(float(r.coefficient) for r in rules)
    if total <= 0:
        raise HTTPException(status_code=502, detail="Invalid coefficient sum.")
    for rule in rules:
        rule.coefficient = round(float(rule.coefficient) / total, 3)
    # Correction du delta d'arrondi sur la dernière règle
    delta = round(1.0 - round(sum(float(r.coefficient) for r in rules), 3), 3)
    if rules and delta != 0:
        rules[-1].coefficient = round(float(rules[-1].coefficient) + delta, 3)
    return rules


def find_rule(
    rules: List[RuleInStrategy], rule_id: str
) -> Optional[RuleInStrategy]:
    return next((r for r in rules if not r.is_new and r.rule_id == rule_id), None)


def map_llm_rule_to_schema(raw_rule: dict) -> RuleInStrategy:
    if raw_rule.get("rule_type") == "custom":
        return RuleInStrategy(
            rule_id=None,
            rule_name=raw_rule.get("rule_name") or "custom_rule",
            coefficient=raw_rule.get("coefficient", 0),
            params=raw_rule.get("params") or {},
            is_new=True,
            description=raw_rule.get("rule_description"),
            formula=raw_rule.get("rule_formula"),
        )
    return RuleInStrategy(
        rule_id=raw_rule.get("rule_id"),
        rule_name=raw_rule.get("rule_name") or raw_rule.get("rule_id") or "unknown_rule",
        coefficient=raw_rule.get("coefficient", 0),
        params=raw_rule.get("params") or {},
        is_new=False,
        description=None,
        formula=None,
    )


def clamp_existing_rule_params(
    rule: RuleInStrategy,
    rules_catalog: Dict[str, Dict[str, Any]],
) -> RuleInStrategy:
    rid = rule.rule_id
    if not rid or rid not in rules_catalog:
        return rule
    for pname, pdef in (rules_catalog[rid].get("params") or {}).items():
        if pname in rule.params and isinstance(pdef, dict) and pdef.get("type") == "float":
            try:
                rule.params[pname] = round(
                    max(pdef["min"], min(pdef["max"], float(rule.params[pname]))), 2
                )
            except Exception:
                logger.warning("Invalid param %s for rule %s", pname, rid)
    return rule


# ─────────────────────────────────────────────────Query helpers─────────────────────────────────────────────────


def to_list(value) -> Optional[List[str]]:
    if value is None:
        return None
    if isinstance(value, str):
        value = [value]
    cleaned = [v.strip() for v in value if v and v.strip()]
    return cleaned if cleaned else None


def build_ilike_filter(
    field: str, values: List[str], params: dict, prefix: str
) -> str:
    conditions = []
    for i, v in enumerate(values):
        key = f"{prefix}_{i}"
        params[key] = f"%{v}%"
        conditions.append(f"{field} ILIKE :{key}")
    return f"AND ({' OR '.join(conditions)})"


# ─────────────────────────────────────────────────JSON helpers─────────────────────────────────────────────────


def clean_raw(raw: str) -> str:
    return re.sub(r"```(?:json)?\s*|\s*```", "", raw).strip()


def extract_json_object(raw: str) -> str:
    cleaned = clean_raw(raw)
    start, end = cleaned.find("{"), cleaned.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return cleaned
    return cleaned[start : end + 1]
