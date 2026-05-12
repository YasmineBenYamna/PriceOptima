from fastapi import HTTPException
from models.strategy import UserStrategy, UserStrategyRule


class StrategyService:
    """Gère les stratégies de pricing système et personnalisées utilisateur."""

    def __init__(self, strategy_repo, rule_repo):
        """
        Args:
            strategy_repo: Instance de StrategyRepository
            rule_repo: Instance de RuleRepository
        """
        self._strategy_repo = strategy_repo
        self._rule_repo     = rule_repo

    def _serialize_user_strategy(self, s) -> dict:
        """Convertit une stratégie utilisateur en dict sérialisable."""
        return {
            "id":               s.id,
            "name":             s.name,
            "description":      s.description,
            "is_custom":        s.is_custom,
            "base_strategy_id": s.base_strategy_id,
            "rules": [
                {
                    "rule_id":     sr.rule_id,
                    "name":        sr.rule.name,
                    "description": sr.rule.description or "",  # ← ajout
                    "coefficient": sr.coefficient,
                    "active":      sr.rule.active,
                    "params":      sr.rule.params or {}
                }
            for sr in s.rules
        ]
        }

    def _validate_coefficients(self, rules):
        """
        Vérifie que la somme des coefficients est égale à 1.0.

        Raises:
            HTTPException 400 si invalide
        """
        if not rules:
            raise HTTPException(
                status_code=400,
                detail={"error": "VALIDATION_ERROR", "message": "Rules vides"}
            )
        total = sum(r.coefficient for r in rules)
        if not (0.99 <= total <= 1.01):
            raise HTTPException(
                status_code=400,
                detail={
                    "error":   "VALIDATION_ERROR",
                    "message": f"Somme coefficients = {round(total, 4)}, doit = 1.0"
                }
            )

    def list_all(self, user_id: str) -> dict:
        """
        Retourne les stratégies système + uniquement les stratégies
        vraiment personnalisées par l'utilisateur (is_custom=True).
        Les entrées historiques (is_custom=False) sont exclues de l'affichage.
        """
        system_strats = self._strategy_repo.find_all_system()
        user_strats   = self._strategy_repo.find_user_strategies(user_id)

        result = []

        for s in system_strats:
            result.append({
                "id":               s.id,
                "name":             s.name,
                "description":      s.description,
                "is_custom":        False,
                "base_strategy_id": None,
                "rules_count":      len(s.rules),
                "source":           "system"
            })

        for s in user_strats:
            if s.is_custom:  # uniquement les vraies custom — pas l'historique
                result.append({
                    "id":               s.id,
                    "name":             s.name,
                    "description":      s.description,
                    "is_custom":        True,
                    "base_strategy_id": s.base_strategy_id,
                    "rules_count":      len(s.rules),
                    "source":           "user"
                })

        return {"strategies": result, "total": len(result)}

    def get_system_strategy(self, strategy_id: str) -> dict:
        s = self._strategy_repo.find_system_by_id(strategy_id)
        if not s:
            raise HTTPException(status_code=404, detail="Strategy introuvable")
        return {
            "id": s.id, "name": s.name, "description": s.description,
            "rules": [
                {
                "rule_id":     sr.rule_id,
                "name":        sr.rule.name,
                "description": sr.rule.description or "",  # ← ajout
                "coefficient": sr.coefficient,
                "active":      sr.rule.active,
                "params":      sr.rule.params or {}
            }
            for sr in s.rules
        ]
    }

    def get_user_strategy(self, strategy_id: str, user_id: str) -> dict:
        """Retourne une stratégie utilisateur par son identifiant."""
        s = self._strategy_repo.find_user_strategy(strategy_id, user_id)
        if not s:
            raise HTTPException(status_code=404, detail="User strategy introuvable")
        if s.user_id != user_id:
            raise HTTPException(status_code=403, detail="Forbidden")
        return self._serialize_user_strategy(s)

    def resolve_strategy(self, system_strategy_id, user_strategy_id, user_id: str):
        if user_strategy_id:
            s = self._strategy_repo.find_user_strategy(user_strategy_id, user_id)
            if not s:
                raise HTTPException(status_code=404, detail="User strategy introuvable")
            return s

        if system_strategy_id:
            sys_s = self._strategy_repo.find_system_by_id(system_strategy_id)
            if not sys_s:
                raise HTTPException(status_code=404, detail="Strategy système introuvable")

            # Créer un nouvel historique à chaque utilisation (pas de déduplication)
            entry = UserStrategy(
                user_id          = user_id,
                base_strategy_id = system_strategy_id,
                name             = sys_s.name,
                description      = sys_s.description,
                is_custom        = False
        )
            entry = self._strategy_repo.create_user_strategy(entry)
            for sr in sys_s.rules:
                self._strategy_repo.add_rule(
                    UserStrategyRule(
                        user_strategy_id = entry.id,
                        rule_id          = sr.rule_id,
                        coefficient      = sr.coefficient
                )
            )
            entry = self._strategy_repo.find_user_strategy(entry.id, user_id)
            return entry

        raise HTTPException(
            status_code=400,
            detail="Fournir system_strategy_id ou user_strategy_id"
    )

    def create_user_strategy(self, body, user_id: str) -> dict:
        """Crée une nouvelle stratégie personnalisée pour l'utilisateur."""
        self._validate_coefficients(body.rules)
        s = UserStrategy(
            user_id          = user_id,
            base_strategy_id = body.base_strategy_id,
            name             = body.name.upper(),
            description      = body.description or "",
            is_custom        = True  # toujours affiché
        )
        s = self._strategy_repo.create_user_strategy(s)
        for r in body.rules:
            rule = self._rule_repo.find_by_id(r.rule_id)
            if not rule:
                raise HTTPException(status_code=400, detail=f"Rule '{r.rule_id}' introuvable")
            self._strategy_repo.add_rule(
                UserStrategyRule(
                    user_strategy_id = s.id,
                    rule_id          = r.rule_id,
                    coefficient      = r.coefficient
                )
            )
        result = self._strategy_repo.find_user_strategy(s.id, user_id)
        return self._serialize_user_strategy(result)

    def update_user_strategy(self, strategy_id: str, body, user_id: str) -> dict:
        """Met à jour une stratégie utilisateur existante."""
        s = self._strategy_repo.find_user_strategy(strategy_id, user_id)
        if not s:
            raise HTTPException(status_code=404, detail="User strategy introuvable")
        if s.user_id != user_id:
            raise HTTPException(status_code=403, detail="Forbidden")
        if body.name:        s.name        = body.name.upper()
        if body.description: s.description = body.description
        if body.rules is not None:
            self._validate_coefficients(body.rules)
            self._strategy_repo.delete_rules(strategy_id)
            for r in body.rules:
                rule = self._rule_repo.find_by_id(r.rule_id)
                if not rule:
                    raise HTTPException(status_code=400, detail=f"Rule '{r.rule_id}' introuvable")
                self._strategy_repo.add_rule(
                    UserStrategyRule(
                        user_strategy_id = strategy_id,
                        rule_id          = r.rule_id,
                        coefficient      = r.coefficient
                    )
                )
            s.is_custom = True
        result = self._strategy_repo.find_user_strategy(strategy_id, user_id)
        return self._serialize_user_strategy(result)

    def delete_user_strategy(self, strategy_id: str, user_id: str):
        """Supprime une stratégie utilisateur."""
        s = self._strategy_repo.find_user_strategy(strategy_id, user_id)
        if not s:
            raise HTTPException(status_code=404, detail="User strategy introuvable")
        if s.user_id != user_id:
            raise HTTPException(status_code=403, detail="Forbidden")
        self._strategy_repo.delete_user_strategy(s)