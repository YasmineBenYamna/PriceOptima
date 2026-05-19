from models.strategy import StrategyRule, UserStrategyRule


class StrategyRuleRepository:
    """Gère les associations entre stratégies et règles."""

    def __init__(self, db_manager):
        self._db = db_manager

    def add_system_rule(self, rule: StrategyRule):
        """Ajoute une règle à une stratégie système."""
        with self._db.session_scope() as session:
            session.add(rule)

    def add_user_rule(self, rule: UserStrategyRule):
        """Ajoute une règle à une stratégie utilisateur."""
        with self._db.session_scope() as session:
            session.add(rule)

    def add_user_rules_bulk(self, rules: list):
        """Ajoute plusieurs règles en une seule session."""
        with self._db.session_scope() as session:
            for rule in rules:
                session.add(rule)

    def delete_user_rules(self, user_strategy_id: str):
        """Supprime toutes les règles d'une stratégie utilisateur."""
        with self._db.session_scope() as session:
            session.query(UserStrategyRule).filter(
                UserStrategyRule.user_strategy_id == user_strategy_id
            ).delete()

    def delete_user_strategy_with_rules(self, user_strategy_id: str, user_strategy):
        """Supprime une stratégie utilisateur et toutes ses règles."""
        with self._db.session_scope() as session:
            session.query(UserStrategyRule).filter(
                UserStrategyRule.user_strategy_id == user_strategy_id
            ).delete()
            session.delete(session.merge(user_strategy))