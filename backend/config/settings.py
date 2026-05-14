"""Paramètres de configuration globaux de l'application Data Pricer."""
import os

# Base de données — lit les variables d'environnement Docker
DB_HOST     = os.getenv("POSTGRES_HOST",     "postgres")
DB_PORT     = int(os.getenv("POSTGRES_PORT", "5432"))
DB_USER     = os.getenv("POSTGRES_USER",     "postgres")
DB_PASSWORD = os.getenv("POSTGRES_PASSWORD", "admin123")

# JWT
SECRET_KEY           = "data_pricer_secret_2026"
ALGORITHM            = "HS256"
TOKEN_EXPIRE_MINUTES = 60

# Application
APP_TITLE   = "Data Pricer API"
APP_VERSION = "3.0.0"

#GROQ
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")