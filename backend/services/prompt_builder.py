"""
prompt_builder.py
-----------------
Fonctions de construction du prompt envoyé au LLM.

Responsabilités :
- Formater les métriques magasin / marché en texte lisible
- Injecter le catalogue des règles et stratégies
- Calculer la position concurrentielle réelle (gap %)
- Produire un prompt structuré, reproductible et indépendant du transport LLM

Usage :
    from services.prompt_builder import build_prompt, get_price_gap_pct
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

# ──────────────────────────────────────────────────────────────────────────────
# Constantes de seuil (miroirs de LLMService pour éviter l'import circulaire)
# ──────────────────────────────────────────────────────────────────────────────

GAP_MODERATE_ABOVE = 5.0
GAP_MODERATE_BELOW = -5.0


# ──────────────────────────────────────────────────────────────────────────────
# Helpers internes
# ──────────────────────────────────────────────────────────────────────────────

def _fmt(value: Any, suffix: str = "", decimals: int = 2) -> str:
    """Formate une valeur numérique ou retourne 'N/A'."""
    if value is None:
        return "N/A"
    try:
        return f"{round(float(value), decimals)}{suffix}"
    except (TypeError, ValueError):
        return "N/A"


def _format_rules_catalog(rules_catalog: Dict[str, Dict[str, Any]]) -> str:
    """Sérialise le catalogue des règles en texte lisible pour le prompt."""
    lines = []
    for rid, rule_def in rules_catalog.items():
        params_desc = ""
        for pname, pdef in (rule_def.get("params") or {}).items():
            if not isinstance(pdef, dict):
                continue
            if pdef.get("type") == "enum":
                params_desc += (
                    f"\n  - {pname}: allowed values {pdef.get('values', [])}, "
                    f"default={pdef.get('default')}"
                )
            elif pdef.get("type") == "float":
                params_desc += (
                    f"\n  - {pname}: range [{pdef.get('min')} -> {pdef.get('max')}], "
                    f"default={pdef.get('default')}"
                )
        lines.append(
            f"[{rid}] {rule_def['label']}: {rule_def['description']}{params_desc}"
        )
    return "\n".join(lines)


def _format_strategies_catalog(strategies_catalog: Dict[str, Dict[str, Any]]) -> str:
    """Sérialise le catalogue des stratégies système en texte lisible pour le prompt."""
    lines = []
    for sid, strategy in strategies_catalog.items():
        rules_list = ", ".join(
            f"{r['rule_id']}(coeff={r['coefficient']})"
            for r in strategy["default_rules"]
        )
        lines.append(
            f"[{sid}] {strategy['name']}: {strategy['description']} -> rules: {rules_list}"
        )
    return "\n".join(lines)


def _describe_real_position(
    own: dict,
    market: dict,
    price_gap_pct: Optional[float],
) -> str:
    """Retourne une description textuelle de la position concurrentielle réelle."""
    own_avg = float(own.get("avg_price_eur") or 0)
    market_avg = float(market.get("market_avg_price_eur") or 0)

    if market_avg <= 0 or price_gap_pct is None:
        return "Position versus market cannot be calculated (missing market data)"

    if price_gap_pct > GAP_MODERATE_ABOVE:
        return (
            f"ABOVE market by +{price_gap_pct}% "
            f"({own_avg}€ vs {market_avg}€ market)"
        )
    if price_gap_pct < GAP_MODERATE_BELOW:
        return (
            f"BELOW market by {abs(price_gap_pct):.1f}% "
            f"({own_avg}€ vs {market_avg}€ market)"
        )
    return (
        f"IN LINE with market ({price_gap_pct:+.1f}%) "
        f"({own_avg}€ vs {market_avg}€ market)"
    )


# ──────────────────────────────────────────────────────────────────────────────
# Public
# ──────────────────────────────────────────────────────────────────────────────

def get_price_gap_pct(own: dict, market: dict) -> Optional[float]:
    """
    Calcule l'écart de prix magasin vs marché en %.

    Fallback sur l'IPP si les prix moyens sont indisponibles.
    Retourne None si aucune donnée suffisante.
    """
    own_avg = float(own.get("avg_price_eur") or 0)
    market_avg = float(market.get("market_avg_price_eur") or 0)

    if market_avg > 0:
        return round((own_avg / market_avg - 1) * 100, 1)

    ipp = own.get("ipp_category") or own.get("ipp_global")
    if ipp is not None:
        return round(float(ipp) - 100, 1)

    return None


def build_prompt(
    own: dict,
    market: dict,
    network: dict,
    categories: Optional[List[str]],
    brands: Optional[List[str]],
    company_name: str,
    rules_catalog: Dict[str, Dict[str, Any]],
    strategies_catalog: Dict[str, Dict[str, Any]],
) -> str:
    """
    Construit le prompt envoyé au LLM.

    Parameters
    ----------
    own               : métriques du magasin connecté (dm_pricing_performance)
    market            : métriques concurrents (même périmètre, même période)
    network           : network_tier et nb_stores (dm_store_network)
    categories        : filtres catégorie (None = tous)
    brands            : filtres marque (None = toutes)
    company_name      : nom de l'enseigne connectée
    rules_catalog     : catalogue des règles chargé depuis la DB
    strategies_catalog: catalogue des stratégies système chargé depuis la DB

    Returns
    -------
    str : prompt formaté prêt à envoyer au LLM
    """
    cat_label   = ", ".join(categories) if categories else "All"
    brand_label = ", ".join(brands) if brands else "All"

    price_gap_pct   = get_price_gap_pct(own, market)
    real_position   = _describe_real_position(own, market, price_gap_pct)
    rules_text      = _format_rules_catalog(rules_catalog)
    strategies_text = _format_strategies_catalog(strategies_catalog)

    return f"""
You are a senior retail pricing strategy expert.

Analyze the context below and recommend the best pricing strategy.

STORE CONTEXT: {company_name}
Scope: categories={cat_label} | brands={brand_label}
Network: {network.get("network_tier", "N/A")} ({_fmt(network.get("nb_stores"), " stores", 0)})

STORE METRICS:
- Real competitive position : {real_position}
- Global IPP                : {_fmt(own.get("ipp_global"))}
- Category IPP              : {_fmt(own.get("ipp_category"))}
- Brand IPP                 : {_fmt(own.get("ipp_brand"))}
- Price evolution MoM       : {_fmt(own.get("price_evolution_mom"), "%")}
- Seasonality index         : {_fmt(own.get("indice_saisonnier_category"))}
- Data volume               : {_fmt(own.get("nb_prices"), " collected prices", 0)}

COMPETITOR METRICS:
- Market average price      : {_fmt(market.get("market_avg_price_eur"), "€")}
- Market category IPP       : {_fmt(market.get("market_ipp_category"))}
- Market MoM evolution      : {_fmt(market.get("market_price_evolution_mom"), "%")}
- Market promo rate (global): {_fmt(market.get("market_taux_promo_global"), "%")}
- Market promo rate (cat.)  : {_fmt(market.get("market_taux_promo_category"), "%")}
- Average competitor rank   : {_fmt(market.get("market_avg_rang_category"), "", 1)}
- Active competitors        : {_fmt(market.get("nb_concurrents"), "", 0)}

AVAILABLE EXISTING RULES:
{rules_text}

AVAILABLE SYSTEM STRATEGIES:
{strategies_text}

MANDATORY STRATEGY SELECTION RULES:
1. Prefer a system strategy (s1/s2/s3) whenever possible.
   Each system strategy has a FIXED rule set — you MUST use EXACTLY those rules, no more, no less:
     - s1 AGGRESSIVE    : r1, r2, r3
     - s2 COMPETITIVE   : r1, r3, r6
     - s3 MARKET_ALIGNED: r4, r2, r6
   Do NOT add or remove rules from a system strategy set.
2. Choose AGGRESSIVE (s1) mainly if:
   - the store is below market by more than 15%, AND
   - there are at least 3 active competitors.
3. Choose COMPETITIVE (s2) mainly if:
   - the store is near market (between -15% and +10%), OR
   - the objective is to remain competitive without strong repositioning.
4. Choose MARKET_ALIGNED (s3) mainly if:
   - the store is above market by more than 10%, AND
   - the objective is to reduce the gap with market average.
5. Choose CUSTOM (s4) if:
   - the combination of existing rule_ids does not match any system strategy, OR
   - at least one custom rule is proposed, OR
   - the recommendation requires business logic not covered by existing rules.
   For CUSTOM: use between 2 and 4 rules, r1 is optional.

MANDATORY CONSTRAINTS:
1.  Coefficient sum must equal exactly 1.0.
2.  Each coefficient must be > 0.
3.  Parameters must stay within allowed ranges for existing rules.
4.  For system strategies (s1/s2/s3): use EXACTLY the rule set listed above — no additions, no removals.
5.  Return ONLY valid JSON in English.
6.  Base the recommendation primarily on real competitive position versus market average price.
7.  If the store is significantly below market, avoid recommendations that reduce prices further
    unless strongly justified.
8.  If active competitors = 0:
    - Do NOT use competitor_beat_rule (r3) as the dominant rule.
    - Prefer rules based on internal protection and stability such as floor_price_rule (r2).
    - If r3 is still used, its coefficient must remain low and explicitly justified.
9.  If the store is above market by more than 15%, avoid using competitor_beat_rule (r3) as dominant.
10. A custom rule is allowed only in CUSTOM strategy (s4).
11. Every custom rule must include:
    - custom_rule_code, rule_name, rule_formula, rule_description
    - params (use {{}} if no parameters are needed)
12. Prefer existing rules whenever they are sufficient.
13. Do not invent a custom rule if an existing rule already covers the same intent.
14. For each existing rule, specify params with chosen values (not just defaults).
    If defaults are appropriate, still include them explicitly in the params object.
15. CRITICAL — In the 'explanation' field, you MUST use the EXACT strategy name from
    'recommended_strategy_name'. NEVER mention any other strategy name in any text field.
    ❌ BAD:  recommended_strategy_name="MARKET_ALIGNED", explanation="The AGGRESSIVE strategy..."
    ✅ GOOD: recommended_strategy_name="MARKET_ALIGNED", explanation="The MARKET_ALIGNED strategy..."

RESPONSE FORMAT — return ONLY this JSON, no extra text:
{{
  "recommended_strategy_id": "s1|s2|s3|s4",
  "recommended_strategy_name": "AGGRESSIVE|COMPETITIVE|MARKET_ALIGNED|CUSTOM",
  "is_custom": false,
  "confidence_score": 0.82,
  "rules": [
    {{
      "rule_type": "existing",
      "rule_id": "r1",
      "custom_rule_code": null,
      "rule_name": "aggregation_rule",
      "rule_formula": null,
      "rule_description": null,
      "coefficient": 0.4,
      "params": {{"aggregation_function": "median"}}
    }},
    {{
      "rule_type": "custom",
      "rule_id": null,
      "custom_rule_code": "cr_margin_guard",
      "rule_name": "Margin Guard Rule",
      "rule_formula": "Do not recommend a final price below estimated_cost * 1.08",
      "rule_description": "Protects minimum margin by enforcing an 8% margin floor over estimated cost.",
      "coefficient": 0.2,
      "params": {{"min_margin_pct": 8.0}}
    }}
  ],
  "reasoning": {{
    "market_position":       "one sentence summarising store position vs competitors",
    "strategy_choice":       "one sentence explaining the strategy choice",
    "params_justification":  "one sentence explaining the chosen parameters"
  }},
  "explanation": "Full explanation in English (3-4 sentences) for the store manager."
}}
""".strip()