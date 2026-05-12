from models.rule import Rule


class RuleRepository:
    """Accès aux données des règles de pricing dans la base applicative."""

    def __init__(self, db_manager):
        self._db = db_manager

    def find_all_system(self):
        """Retourne toutes les règles système."""
        with self._db.session_scope() as session:
            rules = session.query(Rule).filter(Rule.is_system == True).all()
            for r in rules:
                session.expunge(r)
            return rules

    def find_by_id(self, rule_id: str):
        """Recherche une règle par son identifiant."""
        with self._db.session_scope() as session:
            rule = session.query(Rule).filter(Rule.id == rule_id).first()
            if rule:
                session.expunge(rule)
            return rule

    def update(self, rule: Rule) -> Rule:
        """Sauvegarde les modifications d'une règle existante."""
        with self._db.session_scope() as session:
            merged = session.merge(rule)
            session.flush()
            session.refresh(merged)
            session.expunge(merged)
            return merged