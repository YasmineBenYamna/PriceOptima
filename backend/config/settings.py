"""Paramètres de configuration globaux de l'application Data Pricer."""
import os
from functools import lru_cache

import os
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")

class Settings:
    # Base de données
    db_host: str     = os.getenv("POSTGRES_HOST",     "postgres")
    db_port: int     = int(os.getenv("POSTGRES_PORT", "5432"))
    db_user: str     = os.getenv("POSTGRES_USER",     "postgres")
    db_password: str = os.getenv("POSTGRES_PASSWORD", "admin123")

    # JWT
    secret_key: str           = os.getenv("SECRET_KEY", "data_pricer_secret_2026")
    algorithm: str            = "HS256"
    token_expire_minutes: int = 60

    # Application
    app_title: str   = "Data Pricer API"
    app_version: str = "3.0.0"


@lru_cache
def get_settings() -> Settings:
    return Settings()
APP_TITLE = 'Data Pricer API'
APP_VERSION = '3.0.0'

SECRET_KEY = 'data_pricer_secret_2026'
ALGORITHM = 'HS256'
TOKEN_EXPIRE_MINUTES = 60
