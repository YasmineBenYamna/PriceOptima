from fastapi import HTTPException
from models.rule import CustomRule, Rule
from typing import Optional
VALID_PARAMS = {
    "Aggregation Rule":     {"aggregation_function"},
    "Floor Price Rule":     set(),
    "Competitor Beat Rule": {"discount_pct"},
    "Market Average Rule":  set(),
    "Min Store Price Rule": set(),
    "Stability Rule":       {"high_threshold_pct", "low_threshold_pct"},
}


class RuleService:
    """Gère la consultation et la mise à jour des règles de pricing."""

    def __init__(self, rule_repo):
        self._rule_repo = rule_repo

    def _serialize_system(self, rule) -> dict:
        return {
            "id":          str(rule.id),
            "name":        rule.name,
            "active":      rule.active,
            "params":      rule.params or {},
            "description": rule.description,
            "is_system":   True,
            "source":      "system"
        }

    def _serialize_custom(self, rule) -> dict:
        return {
            "id":          str(rule.id),
            "name":        rule.name,
            "description": rule.description,
            "formula":     rule.formula,
            "active":      rule.active,
            "is_system":   False,
            "source":      "user",
            "created_at":  str(rule.created_at)
        }

    def list_all_rules(self, user_id: str, db_manager, is_system: Optional[bool] = None, active: Optional[bool] = None, name: Optional[str] = None) -> dict:
        result = []

    # is_system=True ou is_system=None → inclure les règles système
        if is_system is None or is_system is True:
            system_rules = self._rule_repo.find_all(is_system=True, active=active, name=name)
            result += [self._serialize_system(r) for r in system_rules]

    # is_system=False ou is_system=None → inclure les règles custom de l'utilisateur
        if is_system is None or is_system is False:
            with db_manager.session_scope() as session:
                from models.rule import CustomRule
                q = session.query(CustomRule).filter(CustomRule.user_id == user_id)
                if active is not None:
                    q = q.filter(CustomRule.active == active)
                if name:
                    q = q.filter(CustomRule.name.ilike(f"%{name}%"))
                custom_rules = q.all()
                for r in custom_rules:
                    result.append(self._serialize_custom(r))

        return {"rules": result, "total": len(result)}

    def get_rule(self, rule_id: str) -> dict:
        """Retourne une règle système par son identifiant."""
        rule = self._rule_repo.find_by_id(rule_id)
        if not rule:
            raise HTTPException(status_code=404, detail="Rule introuvable")
        return self._serialize_system(rule)

    def update_rule(self, rule_id: str, body) -> dict:
        """Met à jour les paramètres ou le statut d'une règle système."""
        rule = self._rule_repo.find_by_id(rule_id)
        if not rule:
            raise HTTPException(status_code=404, detail="Rule introuvable")
        if body.active is not None:
            rule.active = body.active
        if body.params:
            allowed = VALID_PARAMS.get(rule.name, set())
            invalid = set(body.params.keys()) - allowed
            if invalid:
                raise HTTPException(
                    status_code=400,
                    detail={"error": "INVALID_PARAMS", "allowed": list(allowed)}
                )
            rule.params = {**(rule.params or {}), **body.params}
        rule = self._rule_repo.update(rule)
        return {"status": "updated", **self._serialize_system(rule)}

    def create_custom_rule(self, body, user_id: str, db_manager) -> dict:
        """Crée une nouvelle règle personnalisée pour un utilisateur."""
        custom_rule = CustomRule(
            user_id     = user_id,
            name        = body.name,
            description = body.description or "",
            formula     = body.formula,
            active      = True
        )
        with db_manager.session_scope() as session:
            session.add(custom_rule)
            session.flush()
            session.refresh(custom_rule)
            result = self._serialize_custom(custom_rule)
        return result