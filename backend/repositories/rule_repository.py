from types import SimpleNamespace

from models.rule import Rule, CustomRule
from typing import Optional


class RuleRepository:
    """Accès aux règles de pricing (système + custom utilisateur)."""

    def __init__(self, db_manager):
        self._db = db_manager

    def find_all(self, is_system: Optional[bool] = None, active: Optional[bool] = None, name: Optional[str] = None):
        """Retourne les règles système avec filtres optionnels."""
        with self._db.session_scope() as session:
            q = session.query(Rule)
            if is_system is not None:
                q = q.filter(Rule.is_system == is_system)
            if active is not None:
                q = q.filter(Rule.active == active)
            if name:
                q = q.filter(Rule.name.ilike(f"%{name}%"))
            rules = q.all()
            for r in rules:
                session.expunge(r)
            return rules

    def find_by_id(self, rule_id: str):
        """
        Recherche une règle par son identifiant.
        Cherche d'abord dans la table rules (système),
        puis dans custom_rules si non trouvée.
        """
        with self._db.session_scope() as session:
            # System rules table
            rule = session.query(Rule).filter(Rule.id == rule_id).first()
            if rule:
                session.expunge(rule)
                return rule

            # Custom rules table (created by users)
            custom = session.query(CustomRule).filter(CustomRule.id == rule_id).first()
            if custom:
                rule = SimpleNamespace(
                    id          = custom.id,
                    name        = custom.name,
                    description = custom.description,
                    params      = {},
                    formula     = custom.formula,   # ← préservé
                    is_system   = False,
                    active      = custom.active,
                    created_at  = custom.created_at,
                )
                session.expunge(custom)
                return rule

            return None

    def find_custom_by_user(self, user_id: str):
        """Retourne toutes les custom rules créées par un utilisateur."""
        with self._db.session_scope() as session:
            rules = session.query(CustomRule).filter(
                CustomRule.user_id == user_id,
                CustomRule.active  == True,
            ).all()
            for r in rules:
                session.expunge(r)
            return rules

    def create_custom(self, custom_rule: CustomRule) -> CustomRule:
        """Persiste une nouvelle custom rule."""
        with self._db.session_scope() as session:
            session.add(custom_rule)
            session.flush()
            session.refresh(custom_rule)
            session.expunge(custom_rule)
            return custom_rule

    def update(self, rule: Rule) -> Rule:
        """Sauvegarde les modifications d'une règle existante."""
        with self._db.session_scope() as session:
            merged = session.merge(rule)
            session.flush()
            session.refresh(merged)
            session.expunge(merged)
            return merged