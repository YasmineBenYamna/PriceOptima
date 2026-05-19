from models.strategy import Strategy, UserStrategy, UserStrategyRule
from sqlalchemy.orm import make_transient


class StrategyRepository:
    """Accès aux données des stratégies système et utilisateur."""

    def __init__(self, db_manager):
        """
        Args:
            db_manager: Instance de DatabaseManager
        """
        self._db = db_manager

    def find_all_system(self):
        """Retourne toutes les stratégies système avec leurs règles chargées."""
        with self._db.session_scope() as session:
            strats = session.query(Strategy).all()
            for s in strats:
                _ = [
                    (sr.rule.name, sr.rule.params, sr.rule.active, sr.rule.id, sr.coefficient, sr.rule_id)
                    for sr in s.rules
                ]
            session.expunge_all()
            return strats

    def find_system_by_id(self, strategy_id: str):
        """Recherche une stratégie système par son identifiant avec ses règles."""
        with self._db.session_scope() as session:
            s = session.query(Strategy).filter(Strategy.id == strategy_id).first()
            if not s:
                return None
            _ = [
                (sr.rule.name, sr.rule.params, sr.rule.active, sr.rule.id, sr.coefficient, sr.rule_id)
                for sr in s.rules
            ]
            session.expunge_all()
            return s

    def find_user_strategy(self, strategy_id: str, user_id: str):
        """Recherche une stratégie utilisateur par son id et l'id utilisateur."""
        with self._db.session_scope() as session:
            s = session.query(UserStrategy).filter(
                UserStrategy.id      == strategy_id,
                UserStrategy.user_id == user_id
            ).first()
            if not s:
                return None
            _ = [
                (sr.rule.name, sr.rule.params, sr.rule.active, sr.rule.id, sr.coefficient, sr.rule_id)
                for sr in s.rules
            ]
            session.expunge_all()
            return s

    def find_user_strategies(self, user_id: str):
        """Retourne toutes les stratégies d'un utilisateur avec leurs règles."""
        with self._db.session_scope() as session:
            strats = session.query(UserStrategy).filter(
                UserStrategy.user_id == user_id
            ).all()
            for s in strats:
                _ = [
                    (sr.rule.name, sr.rule.params, sr.rule.active, sr.rule.id, sr.coefficient, sr.rule_id)
                    for sr in s.rules
                ]
            session.expunge_all()
            return strats

    def find_existing_history(self, user_id: str, base_strategy_id: str):
        """Vérifie si une entrée historique existe déjà pour cet utilisateur."""
        with self._db.session_scope() as session:
            s = session.query(UserStrategy).filter(
                UserStrategy.user_id          == user_id,
                UserStrategy.base_strategy_id == base_strategy_id,
                UserStrategy.is_custom        == False
            ).first()
            if not s:
                return None
            _ = [
                (sr.rule.name, sr.rule.params, sr.rule.active, sr.rule.id, sr.coefficient, sr.rule_id)
                for sr in s.rules
            ]
            session.expunge_all()
            return s

    def create_user_strategy(self, user_strategy: UserStrategy) -> UserStrategy:
        """Crée une nouvelle stratégie utilisateur."""
        with self._db.session_scope() as session:
            session.add(user_strategy)
            session.flush()
            session.refresh(user_strategy)
            session.expunge(user_strategy)
            make_transient(user_strategy)
            return user_strategy

    def add_rule(self, rule: UserStrategyRule):
        """Ajoute une règle à une stratégie utilisateur."""
        with self._db.session_scope() as session:
            session.add(rule)

    def delete_rules(self, user_strategy_id: str):
        """Supprime toutes les règles d'une stratégie utilisateur."""
        with self._db.session_scope() as session:
            session.query(UserStrategyRule).filter(
                UserStrategyRule.user_strategy_id == user_strategy_id
            ).delete()

    def delete_user_strategy(self, user_strategy: UserStrategy):
        """Supprime une stratégie utilisateur et toutes ses règles."""
        with self._db.session_scope() as session:
            merged = session.merge(user_strategy)
            session.query(UserStrategyRule).filter(
                UserStrategyRule.user_strategy_id == merged.id
            ).delete()
            session.delete(merged)