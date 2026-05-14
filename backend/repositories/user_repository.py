from models.user import User
from sqlalchemy.orm import make_transient


class UserRepository:
    """Accès aux données des utilisateurs dans la base applicative."""

    def __init__(self, db_manager):
        """
        Args:
            db_manager: Instance de DatabaseManager
        """
        self._db = db_manager

    def find_by_email(self, email: str):
        """Recherche un utilisateur par son adresse email."""
        with self._db.session_scope() as session:
            user = session.query(User).filter(User.work_mail == email).first()
            if user:
                session.expunge(user)
                make_transient(user)
            return user

    def find_by_id(self, user_id: str):
        """Recherche un utilisateur par son identifiant."""
        with self._db.session_scope() as session:
            user = session.query(User).filter(User.id == user_id).first()
            if user:
                session.expunge(user)
                make_transient(user)
            return user

    def create(self, user: User) -> User:
        """Crée un nouvel utilisateur et retourne l'instance persistée."""
        with self._db.session_scope() as session:
            session.add(user)
            session.flush()
            session.refresh(user)
            session.expunge(user)
            make_transient(user)
            return user