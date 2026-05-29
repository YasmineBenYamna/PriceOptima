from models.strategy import Strategy, UserStrategy, UserStrategyRule
from sqlalchemy.orm import make_transient, selectinload
from typing import Optional



class StrategyRepository:
    """Accès aux stratégies système et utilisateur."""


    def __init__(self, db_manager):
        self._db = db_manager


    def _load_rules(self, s):
        """Précharge les attributs des règles pour éviter DetachedInstanceError."""
        _ = [
            (
                sr.rule.name        if sr.rule else sr.rule_id,
                sr.rule.params      if sr.rule else {},
                sr.rule.active      if sr.rule else True,
                sr.rule.id          if sr.rule else sr.rule_id,
                sr.rule.description if sr.rule else "",
                sr.coefficient,
                sr.rule_id
            )
            for sr in s.rules
        ]


    def find_all_system(self, name: Optional[str] = None, active: Optional[bool] = None):
        """Retourne les stratégies système avec filtres optionnels."""
        with self._db.session_scope() as session:
            q = session.query(Strategy)
            if name:
                q = q.filter(Strategy.name.ilike(f"%{name}%"))
            if active is not None:
                q = q.filter(Strategy.active == active)
            strats = q.all()
            for s in strats:
                self._load_rules(s)
            session.expunge_all()
            return strats


    def find_system_by_id(self, strategy_id: str):
        """Recherche une stratégie système par son identifiant."""
        with self._db.session_scope() as session:
            s = session.query(Strategy).filter(Strategy.id == strategy_id).first()
            if not s:
                return None
            self._load_rules(s)
            session.expunge_all()
            return s


    def find_user_strategy(self, strategy_id: str, user_id: str):
        """Recherche une stratégie utilisateur par son identifiant."""
        with self._db.session_scope() as session:
            s = (
                session.query(UserStrategy)
                .options(
                    selectinload(UserStrategy.rules)
                    .selectinload(UserStrategyRule.rule)  # ← charge sr.rule dans la session
                )
                .filter(
                    UserStrategy.id      == strategy_id,
                    UserStrategy.user_id == user_id,
                )
                .first()
            )
            if not s:
                return None
            # Forcer la lecture complète AVANT expunge
            self._load_rules(s)
            session.expunge_all()
            return s


    def find_user_strategies(self, user_id: str, name: Optional[str] = None, is_custom: Optional[bool] = None):
        """
        Retourne les stratégies d'un utilisateur avec filtres optionnels.
        Passer is_custom=True pour ne récupérer que les stratégies custom (interface).
        Passer is_custom=None pour tout récupérer (usage interne uniquement).
        """
        with self._db.session_scope() as session:
            q = session.query(UserStrategy).filter(UserStrategy.user_id == user_id)
            if name:
                q = q.filter(UserStrategy.name.ilike(f"%{name}%"))
            if is_custom is not None:
                q = q.filter(UserStrategy.is_custom == is_custom)
            strats = q.all()
            for s in strats:
                self._load_rules(s)
            session.expunge_all()
            return strats


    def find_existing_history(self, user_id: str, base_strategy_id: str):
        """
        Vérifie si une entrée historique (is_custom=False) existe déjà
        pour cet utilisateur et cette stratégie système.
        """
        with self._db.session_scope() as session:
            s = session.query(UserStrategy).filter(
                UserStrategy.user_id          == user_id,
                UserStrategy.base_strategy_id == base_strategy_id,
                UserStrategy.is_custom        == False
            ).first()
            if not s:
                return None
            self._load_rules(s)
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


    def delete_user_strategy(self, user_strategy: UserStrategy):
        """Supprime une stratégie utilisateur."""
        with self._db.session_scope() as session:
            session.delete(session.merge(user_strategy))