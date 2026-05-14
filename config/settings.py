"""Paramètres de configuration globaux de l'application Data Pricer."""

# Base de données
DB_HOST     = "localhost"
DB_PORT     = 5433
DB_USER     = "postgres"
DB_PASSWORD = "admin123"

# JWT
SECRET_KEY           = "data_pricer_secret_2026"
ALGORITHM            = "HS256"
TOKEN_EXPIRE_MINUTES = 60

# Application
APP_TITLE   = "Data Pricer API"
APP_VERSION = "3.0.0"