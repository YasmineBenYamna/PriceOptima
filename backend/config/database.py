from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from contextlib import contextmanager

from config.settings import DB_HOST, DB_PASSWORD, DB_PORT, DB_USER

Base = declarative_base()


class DatabaseManager:
    """
    Gère toutes les connexions aux bases de données.
    Fournit les sessions et engines pour la base applicative et la base marché.
    """

    def __init__(self, host: str, port: int, user: str, password: str):
        self._host     = host
        self._port     = port
        self._user     = user
        self._password = password

        self._app_engine = create_engine(
            f"postgresql://{user}:{password}@{host}:{port}/data_pricer",
            pool_size=3,
            max_overflow=2,
            pool_pre_ping=True,
            pool_recycle=300,
            pool_timeout=30,
        )
        self._AppSession = sessionmaker(
            autocommit=False, autoflush=False, bind=self._app_engine
        )
        self._market_engine = create_engine(
            f"postgresql://{user}:{password}@{host}:{port}/retail_pricing",
            pool_size=3,
            max_overflow=2,
            pool_pre_ping=True,
            pool_recycle=300,
            pool_timeout=30,
        )

    def create_tables(self):
        """Crée toutes les tables définies dans les modèles SQLAlchemy."""
        import models  # noqa: F401
        Base.metadata.create_all(bind=self._app_engine)

    def get_session(self) -> Session:
        """Retourne une nouvelle session applicative."""
        return self._AppSession()

    @contextmanager
    def session_scope(self):
        """Context manager pour une session avec commit/rollback automatique."""
        session = self._AppSession()
        try:
            yield session
            session.commit()
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()

    def get_market_engine(self):
        """Retourne l'engine de connexion à la base marché."""
        return self._market_engine

    @contextmanager
    def market_conn(self):
        """Context manager pour une connexion à la base marché."""
        conn = self._market_engine.connect()
        try:
            yield conn
        finally:
            conn.close()
            
def init_db():
    """Initialise la base au démarrage."""
    db_manager = DatabaseManager(
        host=DB_HOST,
        port=DB_PORT,
        user=DB_USER,
        password=DB_PASSWORD
    )
    db_manager.create_tables()
    print("DB initialisée")