from fastapi import HTTPException
from models.rule import CustomRule, Rule

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
        """
        Args:
            rule_repo: Instance de RuleRepository
        """
        self._rule_repo = rule_repo

    def _serialize_system(self, rule) -> dict:
        """Convertit une règle système en dict sérialisable."""
        return {
            "id":          rule.id,
            "name":        rule.name,
            "active":      rule.active,
            "params":      rule.params or {},
            "description": rule.description,
            "is_system":   True,
            "source":      "system"
        }

    def _serialize_custom(self, rule) -> dict:
        """Convertit une règle custom en dict sérialisable."""
        return {
            "id":          rule.id,
            "name":        rule.name,
            "description": rule.description,
            "formula":     rule.formula,
            "active":      rule.active,
            "is_system":   False,
            "source":      "user",
            "created_at":  str(rule.created_at)
        }

    def list_all_rules(self, user_id: str, db_manager) -> dict:
        """
        Retourne toutes les règles visibles par l'utilisateur :
        - règles système (visibles par tous)
        - règles custom créées par cet utilisateur uniquement
        """
        # Règles système
        system_rules = self._rule_repo.find_all_system()
        result = [self._serialize_system(r) for r in system_rules]

        # Règles custom de cet utilisateur uniquement
        with db_manager.session_scope() as session:
            custom_rules = session.query(CustomRule).filter(
                CustomRule.user_id == user_id
            ).all()
            for r in custom_rules:
                result.append(self._serialize_custom(r))

        return {"rules": result, "total": len(result)}

    def get_rule(self, rule_id: str) -> dict:
        """
        Retourne une règle système par son identifiant.

        Raises:
            HTTPException 404 si la règle n'existe pas
        """
        rule = self._rule_repo.find_by_id(rule_id)
        if not rule:
            raise HTTPException(status_code=404, detail="Rule introuvable")
        return self._serialize_system(rule)

    def update_rule(self, rule_id: str, body) -> dict:
        """
        Met à jour les paramètres ou le statut d'une règle système.

        Args:
            rule_id: Identifiant de la règle
            body: RuleUpdate (active, params)
        """
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
        """
        Crée une nouvelle règle personnalisée pour un utilisateur.
        Le user fournit une formule et une description.

        Args:
            body: CustomRuleCreate (name, description, formula, coefficient)
            user_id: ID de l'utilisateur courant
            db_manager: Instance de DatabaseManager
        """
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