from fastapi import HTTPException
from models.strategy import UserStrategy, UserStrategyRule
from schemas.strategy import UserStrategyResponse, RuleInStrategy
from typing import Optional



class StrategyService:
    """Gère les stratégies de pricing système et personnalisées utilisateur."""


    def __init__(self, strategy_repo, rule_repo, strategy_rule_repo):
        self._strategy_repo      = strategy_repo
        self._rule_repo          = rule_repo
        self._strategy_rule_repo = strategy_rule_repo


    # ── Helpers ───────────────────────────────────────────────────────────────


    def _resolve_rule_name(self, sr) -> str:
        """Cherche le nom dans rules (system) ET custom_rules (user)."""
        if sr.rule and sr.rule.name:
            return sr.rule.name
        found = self._rule_repo.find_by_id(str(sr.rule_id))
        return found.name if found else str(sr.rule_id)


    def _resolve_rule_desc(self, sr) -> str:
        """Cherche la description dans rules ET custom_rules."""
        if sr.rule and sr.rule.description:
            return sr.rule.description
        found = self._rule_repo.find_by_id(str(sr.rule_id))
        return (found.description if found else "") or ""


    def _resolve_rule_active(self, sr) -> bool:
        if sr.rule:
            return sr.rule.active
        found = self._rule_repo.find_by_id(str(sr.rule_id))
        return found.active if found else True


    def _resolve_rule_params(self, sr) -> dict:
        if sr.rule:
            return sr.rule.params or {}
        found = self._rule_repo.find_by_id(str(sr.rule_id))
        return (found.params if found else {}) or {}


    def _to_response(self, s) -> UserStrategyResponse:
        return UserStrategyResponse(
            id               = str(s.id),
            name             = s.name,
            description      = s.description or "",
            is_custom        = getattr(s, 'is_custom', False),
            base_strategy_id = getattr(s, 'base_strategy_id', None),
            rules=[
                RuleInStrategy(
                    rule_id     = str(sr.rule_id),
                    name        = self._resolve_rule_name(sr),
                    description = self._resolve_rule_desc(sr),
                    coefficient = sr.coefficient,
                    active      = self._resolve_rule_active(sr),
                    params      = self._resolve_rule_params(sr),
                )
                for sr in s.rules
            ]
        )


    def _validate_coefficients(self, rules):
        if not rules:
            raise HTTPException(status_code=400, detail={"error": "VALIDATION_ERROR", "message": "Rules vides"})
        active_rules = [r for r in rules if getattr(r, 'active', True)]
        if not active_rules:
            raise HTTPException(status_code=400, detail={"error": "VALIDATION_ERROR", "message": "Au moins une règle active requise"})
        total = sum(r.coefficient for r in active_rules)
        if not (0.99 <= total <= 1.01):
            raise HTTPException(status_code=400, detail={
                "error":   "VALIDATION_ERROR",
                "message": f"Somme coefficients (règles actives) = {round(total, 4)}, doit = 1.0"
            })


    # ── Lecture ───────────────────────────────────────────────────────────────


    def list_all(self, user_id: str, name: Optional[str] = None) -> dict:
        """
        Retourne les stratégies visibles dans l'interface :
        - Stratégies système (table strategies, communes à tous)
        - Stratégies custom de l'utilisateur (table user_strategies, is_custom=True uniquement)
        Les entrées is_custom=False (historique interne resolve_strategy) ne sont JAMAIS retournées.
        """
        system_strats = self._strategy_repo.find_all_system(name=name)
        user_strats   = self._strategy_repo.find_user_strategies(user_id, name=name, is_custom=True)

        result = []
        for s in system_strats:
            result.append({
                "id":               str(s.id),
                "name":             s.name,
                "description":      s.description,
                "is_custom":        False,
                "base_strategy_id": None,
                "rules_count":      len(s.rules),
                "source":           "system"
            })
        for s in user_strats:
            if not s.is_custom:
                continue
            result.append({
                "id":               str(s.id),
                "name":             s.name,
                "description":      s.description,
                "is_custom":        True,
                "base_strategy_id": str(s.base_strategy_id) if s.base_strategy_id else None,
                "rules_count":      len(s.rules),
                "source":           "user"
            })
        return {"strategies": result, "total": len(result)}


    def list_user_strategies(self, user_id: str, name: Optional[str] = None) -> dict:
        """
        Retourne uniquement les stratégies custom (is_custom=True) de l'utilisateur.
        Appelé par GET /api/v1/user-strategies.
        """
        user_strats = self._strategy_repo.find_user_strategies(user_id, name=name, is_custom=True)
        result = []
        for s in user_strats:
            if not s.is_custom:
                continue
            result.append({
                "id":               str(s.id),
                "name":             s.name,
                "description":      s.description,
                "is_custom":        True,
                "base_strategy_id": str(s.base_strategy_id) if s.base_strategy_id else None,
                "rules_count":      len(s.rules),
                "source":           "user"
            })
        return {"strategies": result, "total": len(result)}


    def get_system_strategy(self, strategy_id: str) -> dict:
        """Retourne une stratégie système par son identifiant."""
        s = self._strategy_repo.find_system_by_id(strategy_id)
        if not s:
            raise HTTPException(status_code=404, detail="Strategy introuvable")
        return self._to_response(s).model_dump()


    def get_user_strategy(self, strategy_id: str, user_id: str) -> dict:
        """Retourne une stratégie utilisateur par son identifiant."""
        s = self._strategy_repo.find_user_strategy(strategy_id, user_id)
        if not s:
            raise HTTPException(status_code=404, detail="User strategy introuvable")
        return self._to_response(s).model_dump()


    # ── Résolution pour pricing ───────────────────────────────────────────────


    def resolve_strategy(self, system_strategy_id, user_strategy_id, user_id: str):
        """
        Résout la stratégie à utiliser pour un calcul de pricing.
        - Si user_strategy_id fourni → charge directement la stratégie custom
        - Si system_strategy_id fourni → crée une entrée UserStrategy is_custom=False
          (historique interne, JAMAIS affiché dans l'interface)
        """
        if user_strategy_id:
            s = self._strategy_repo.find_user_strategy(user_strategy_id, user_id)
            if not s:
                raise HTTPException(status_code=404, detail="User strategy introuvable")
            return s

        if system_strategy_id:
            sys_s = self._strategy_repo.find_system_by_id(system_strategy_id)
            if not sys_s:
                raise HTTPException(status_code=404, detail="Strategy système introuvable")

            existing = self._strategy_repo.find_existing_history(user_id, system_strategy_id)
            if existing:
                return existing

            entry = UserStrategy(
                user_id          = user_id,
                base_strategy_id = system_strategy_id,
                name             = sys_s.name,
                description      = sys_s.description,
                is_custom        = False
            )
            entry = self._strategy_repo.create_user_strategy(entry)

            rules_to_add = [
                UserStrategyRule(
                    user_strategy_id = entry.id,
                    rule_id          = sr.rule_id,
                    coefficient      = sr.coefficient
                )
                for sr in sys_s.rules
            ]
            self._strategy_rule_repo.add_user_rules_bulk(rules_to_add)

            return self._strategy_repo.find_user_strategy(entry.id, user_id)

        raise HTTPException(status_code=400, detail="Fournir system_strategy_id ou user_strategy_id")


    # ── CRUD user strategies ──────────────────────────────────────────────────


    def create_user_strategy(self, body, user_id: str) -> dict:
        self._validate_coefficients(body.rules)

        s = UserStrategy(
            user_id          = user_id,
            base_strategy_id = body.base_strategy_id,
            name             = body.name.upper(),
            description      = body.description or "",
            is_custom        = getattr(body, 'is_custom', True),
        )
        s = self._strategy_repo.create_user_strategy(s)

        rules_to_add = []
        for r in body.rules:
            rule = self._rule_repo.find_by_id(r.rule_id)
            if not rule:
                raise HTTPException(
                    status_code=400,
                    detail=f"Rule '{r.rule_id}' introuvable"
                )
            rules_to_add.append(
                UserStrategyRule(
                    user_strategy_id = s.id,
                    rule_id          = r.rule_id,
                    coefficient      = r.coefficient
                )
            )
        self._strategy_rule_repo.add_user_rules_bulk(rules_to_add)

        result = self._strategy_repo.find_user_strategy(s.id, user_id)
        return self._to_response(result).model_dump()


    def update_user_strategy(self, strategy_id: str, body, user_id: str) -> dict:
        """Met à jour une stratégie custom existante."""
        s = self._strategy_repo.find_user_strategy(strategy_id, user_id)
        if not s:
            raise HTTPException(status_code=404, detail="User strategy introuvable")

        if body.name:
            s.name = body.name.upper()
        if body.description:
            s.description = body.description

        if body.rules is not None:
            self._validate_coefficients(body.rules)
            self._strategy_rule_repo.delete_user_rules(strategy_id)

            rules_to_add = []
            for r in body.rules:
                rule = self._rule_repo.find_by_id(r.rule_id)
                if not rule:
                    raise HTTPException(status_code=400, detail=f"Rule '{r.rule_id}' introuvable")
                rules_to_add.append(
                    UserStrategyRule(
                        user_strategy_id = strategy_id,
                        rule_id          = r.rule_id,
                        coefficient      = r.coefficient,
                    )
                )
            self._strategy_rule_repo.add_user_rules_bulk(rules_to_add)
            s.is_custom = True

        result = self._strategy_repo.find_user_strategy(strategy_id, user_id)
        return self._to_response(result).model_dump()


    def delete_user_strategy(self, strategy_id: str, user_id: str):
        """Supprime une stratégie custom de l'utilisateur."""
        s = self._strategy_repo.find_user_strategy(strategy_id, user_id)
        if not s:
            raise HTTPException(status_code=404, detail="User strategy introuvable")
        self._strategy_rule_repo.delete_user_strategy_with_rules(strategy_id, s)