from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from contextlib import contextmanager
from .settings import get_settings

Base = declarative_base()


class DatabaseManager:
    """
    Gère toutes les connexions aux bases de données.
    Fournit les sessions et engines pour la base applicative et la base marché.
    """

    def __init__(self):
        s = get_settings()

        self._app_engine = create_engine(
            f"postgresql://{s.db_user}:{s.db_password}@{s.db_host}:{s.db_port}/data_pricer",
            pool_size=3, max_overflow=2, pool_pre_ping=True,
            pool_recycle=300, pool_timeout=30,
            connect_args={"connect_timeout": 5}, 
        )
        self._AppSession = sessionmaker(
            autocommit=False, autoflush=False, bind=self._app_engine
        )
        self._market_engine = create_engine(
            f"postgresql://{s.db_user}:{s.db_password}@{s.db_host}:{s.db_port}/retail_pricing",
            pool_size=3, max_overflow=2, pool_pre_ping=True,
            pool_recycle=300, pool_timeout=30,
            connect_args={"connect_timeout": 5},
        )

    def create_tables(self):
        import models  # noqa: F401
        Base.metadata.create_all(bind=self._app_engine)

    def get_session(self):
        session = self._AppSession()
        try:
            yield session
        finally:
            session.close()

    @contextmanager
    def session_scope(self):
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
        return self._market_engine

    @contextmanager
    def market_conn(self):
        conn = self._market_engine.connect()
        try:
            yield conn
        finally:
            conn.close()
    @contextmanager
    def app_conn(self):
        conn = self._app_engine.connect()
        try:
            yield conn
        finally:
            conn.close()