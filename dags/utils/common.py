import os
import psycopg2
from datetime import datetime, timezone

def _require_env(key: str) -> str:
    value = os.environ.get(key)
    if not value:
        raise EnvironmentError(f"Variable d'environnement manquante : '{key}'")
    return value

DB_CONFIG = {
    "host"    : os.environ.get("POSTGRES_HOST", "postgres"),
    "port"    : int(os.environ.get("POSTGRES_PORT", 5432)),
    "dbname"  : os.environ.get("POSTGRES_DB", "retail_pricing"),
    "user"    : os.environ.get("POSTGRES_USER", "postgres"),
    "password": _require_env("POSTGRES_PASSWORD"),
}

# common.py — ajouter après DB_CONFIG
import json

SCHEMA_CONFIG_PATH = os.environ.get(
    "SCHEMA_CONFIG_PATH", 
    "/opt/airflow/dags/config/schema_config.json"
)

with open(SCHEMA_CONFIG_PATH) as f:
    _SCHEMA = json.load(f)

PRICES_COLUMNS      = _SCHEMA["prices_raw"]["insert_columns"]
PRICES_INT_COLS     = set(_SCHEMA["prices_raw"]["cast_types"]["bigint"] +
                          _SCHEMA["prices_raw"]["cast_types"]["integer"])
PRICES_NUMERIC_COLS = set(_SCHEMA["prices_raw"]["cast_types"]["double"])
PRICES_BOOL_COLS    = set(_SCHEMA["prices_raw"]["cast_types"]["boolean"])
PRICES_DATE_COLS    = set(_SCHEMA["prices_raw"]["cast_types"]["date"])
PRICES_TS_COLS      = set(_SCHEMA["prices_raw"]["cast_types"]["timestamp"])

PRODUCTS_COLUMNS        = _SCHEMA["products_raw"]["insert_columns"]
PRODUCTS_COMMON_COLS    = set(_SCHEMA["products_raw"]["common_columns"])
PRODUCTS_TECHNICAL_COLS = set(_SCHEMA["products_raw"]["technical_columns"])
PRODUCTS_FLAT_COLS = set(_SCHEMA["products_raw"]["common_columns"])
PRODUCTS_INSERT_COLS = _SCHEMA["products_raw"]["insert_columns"]

def get_db_connection() -> psycopg2.extensions.connection:
    return psycopg2.connect(**DB_CONFIG)

def unix_to_datetime(ts: int | float | None) -> datetime | None:
    """Convertit un timestamp Unix en objet datetime UTC.

    dans notre datasets, certains champs sont en secondes
    , d'autres peuvent être en millisecondes.
    La heuristique `> 10_000_000_000` détecte les millisecondes — toute valeur
    supérieure correspond à une date après l'année 2286 en secondes, ce qui est
    impossible pour des données produits — et divise par 1000 pour normaliser.

    Parameters
    ----------
    ts : int | float | None
        Timestamp Unix en secondes ou millisecondes.

    Returns
    -------
    datetime | None
        Datetime UTC correspondant, ou None si ts est None ou invalide.
    """
    if ts is None:
        return None
    try:
        ts = int(ts)
        if ts > 10_000_000_000:
            ts = ts / 1000
        return datetime.fromtimestamp(ts, tz=timezone.utc)
    except Exception:
        return None