import json
import os
import time
import uuid
import logging
from pathlib import Path
import duckdb
import pyarrow.parquet as pq
import io
import zipfile
import requests
import pandas as pd
from datetime import date, timedelta
from psycopg2.extras import execute_values

from dag_seed import SCHEMA_CONFIG_PATH
from utils.common import (
    get_db_connection,
    DB_CONFIG,
)
logger = logging.getLogger(__name__)

DATA_PATH      = "/opt/airflow/data"

# ── chargement config externe ─────────────────────────────
with open(SCHEMA_CONFIG_PATH) as f:
    _cfg = json.load(f)

_currency_cfg      = _cfg["currency_config"]
TARGET_CURRENCIES  = set(_currency_cfg["target_currencies"])
DATE_MIN_CURRENCY  = date.fromisoformat(_currency_cfg["date_min"])
CURRENCY_PAGE_SIZE = _currency_cfg["page_size"]

_sources    = _cfg["sources"]
URL_PRICES  = _sources["prices"]
URL_FOOD    = _sources["food"]
URL_BEAUTY  = _sources["beauty"]
URL_OTHER   = _sources["other"]
ECB_ZIP_URL = _sources["ecb"]
IMF_CSV_URL = _sources["imf"]

_file_names         = _cfg.get("file_names", {})
PARQUET_PATH_PRICES = f"{DATA_PATH}/{_file_names.get('prices', 'prices.parquet')}"
PARQUET_PATH_FOOD   = f"{DATA_PATH}/{_file_names.get('food',   'food.parquet')}"
JSONL_PATH_BEAUTY   = f"{DATA_PATH}/{_file_names.get('beauty', 'beauty.jsonl')}"
JSONL_PATH_OTHER    = f"{DATA_PATH}/{_file_names.get('other',  'other.jsonl')}"

# cast types — prices
_prices_cast        = _cfg["prices_raw"]["cast_types"]
PRICES_INT_COLS     = set(_prices_cast["bigint"] + _prices_cast["integer"])
PRICES_NUMERIC_COLS = set(_prices_cast["double"])
PRICES_BOOL_COLS    = set(_prices_cast["boolean"])
PRICES_DATE_COLS    = set(_prices_cast["date"])
PRICES_TS_COLS      = set(_prices_cast["timestamp"])

# cast types — products
_products_cast        = _cfg["products_raw"]["cast_types"]
PRODUCTS_INTEGER_COLS = set(_products_cast["integer"])
PRODUCTS_DOUBLE_COLS  = set(_products_cast["double"])
PRODUCTS_BOOLEAN_COLS = set(_products_cast["boolean"])
PRODUCTS_BIGINT_COLS  = set(_products_cast["bigint"])

# colonnes insert
PRICES_COLUMNS   = _cfg["prices_raw"]["insert_columns"]
PRODUCTS_COLUMNS = _cfg["products_raw"]["insert_columns"]

# colonnes produits
PRODUCTS_COMMON_COLS    = set(_cfg["products_raw"]["common_columns"])
PRODUCTS_TECHNICAL_COLS = set(_cfg["products_raw"]["technical_columns"])

# DUCKDB — helpers

def _pg_password() -> str:
    """Résout le mot de passe PostgreSQL depuis DB_CONFIG ou les variables d'environnement.
    Priorité : DB_CONFIG dict → POSTGRES_PASSWORD → AIRFLOW__DATABASE__PASSWORD → fallback 'admin123'.
    Returns:
        str: Le mot de passe PostgreSQL résolu."""

    if isinstance(DB_CONFIG, dict) and DB_CONFIG.get("password"):
        return DB_CONFIG["password"]
    return os.getenv("POSTGRES_PASSWORD") or os.getenv("AIRFLOW__DATABASE__PASSWORD") or "admin123"

def _pg_attach_string() -> str:
    """Construit la chaîne de connexion DSN pour attacher PostgreSQL dans DuckDB.

    Ouvre une connexion psycopg2 temporaire pour extraire les paramètres DSN,
    puis la ferme immédiatement.

    Returns:
        str: Chaîne de connexion au format DuckDB ATTACH (dbname user password host port).
    """
    conn = get_db_connection()
    try:
        p = conn.get_dsn_parameters()
        return (
            f"dbname={p['dbname']} user={p['user']} "
            f"password={_pg_password()} host={p['host']} port={p['port']}"
        )
    finally:
        conn.close()

def _open_duck() -> duckdb.DuckDBPyConnection:
    os.makedirs("/tmp/duckdb_spill", exist_ok=True)
    con = duckdb.connect(
        database=":memory:",
        config={
            "threads": 1,
            "preserve_insertion_order": False,
        }
    )
    con.execute("SET memory_limit='4GB'")
    con.execute("SET temp_directory='/tmp/duckdb_spill'")
    con.execute("INSTALL postgres; LOAD postgres")
    con.execute(f"ATTACH '{_pg_attach_string()}' AS pg (TYPE POSTGRES)")
    return con

# POSTGRES — bulk settings

_BULK_ON  = ["SET synchronous_commit = OFF", "SET work_mem = '256MB'",
             "SET maintenance_work_mem = '512MB'"]
_BULK_OFF = ["SET synchronous_commit = ON", "SET work_mem = '4MB'"]

def _bulk_settings(conn, params: list[str]) -> None:
    """Applique une liste de paramètres de session PostgreSQL pour optimiser les insertions bulk.
    Exécute chaque statement SET dans le curseur courant. En cas d'erreur sur un paramètre,
    effectue un rollback et log un warning sans interrompre les autres paramètres.
    Args:
        conn: Connexion psycopg2 active.
        params: Liste de statements SQL SET à exécuter (ex: ["SET work_mem = '256MB'"]).
    """
    with conn.cursor() as cur:
        for stmt in params:
            try:
                cur.execute(stmt)
            except Exception as e:
                conn.rollback()
                logger.warning(f"⚠ Param ignoré ({stmt}): {e}")
    conn.commit()

# CONTRAINTES — helpers (products_raw uniquement)

PRODUCTS_CONSTRAINT  = "uq_products_raw_code_updated"
PRODUCTS_UNIQUE_COLS = ["code", "updated_at"]

def _drop_products_constraint(conn) -> bool:
    """Supprime la contrainte d'unicité et l'index associé sur products_raw.

    Supprime la contrainte 'uq_products_raw_code_updated' et l'index
    'products_raw_code_updatedat_uidx' s'ils existent, pour permettre
    les insertions bulk sans vérification de doublon à chaque ligne.
    La contrainte est recréée après le seed via _recreate_products_constraint().

    Args:
        conn: Connexion psycopg2 active.

    Returns:
        bool: True si la contrainte existait et a été supprimée, False sinon.
    """
    with conn.cursor() as cur:
        cur.execute("""
            SELECT 1 FROM pg_constraint
            WHERE conname = %s AND conrelid = 'products_raw'::regclass
        """, (PRODUCTS_CONSTRAINT,))
        existed = cur.fetchone() is not None
        if existed:
            cur.execute(f"ALTER TABLE products_raw DROP CONSTRAINT {PRODUCTS_CONSTRAINT}")

        cur.execute("""
            SELECT 1 FROM pg_indexes
            WHERE indexname = 'products_raw_code_updatedat_uidx'
        """)
        if cur.fetchone():
            cur.execute("DROP INDEX IF EXISTS products_raw_code_updatedat_uidx")
            logger.info("Index products_raw_code_updatedat_uidx supprimé")

    conn.commit()
    return existed

def _recreate_products_constraint(conn) -> None:
    """Déduplique products_raw puis recrée la contrainte d'unicité (code, updated_at).

    Supprime d'abord les doublons en conservant le ctid le plus récent pour chaque
    paire (code, updated_at), puis recrée la contrainte UNIQUE. Appelée après
    la fin de tous les inserts du seed pour garantir l'intégrité des données.

    Args:
        conn: Connexion psycopg2 active.
    """
    with conn.cursor() as cur:
        cur.execute("""
            DELETE FROM products_raw a
            USING products_raw b
            WHERE a.ctid < b.ctid
              AND a.code = b.code
              AND a.updated_at = b.updated_at
        """)
        deleted = cur.rowcount
        if deleted:
            logger.info(f"  🗑 {deleted:,} doublons supprimés de products_raw")
        cur.execute(f"""
            ALTER TABLE products_raw
            ADD CONSTRAINT {PRODUCTS_CONSTRAINT} UNIQUE ({", ".join(PRODUCTS_UNIQUE_COLS)})
        """)
    conn.commit()

# EXPRESSIONS SQL — prices

def _prices_expr(col: str, source_cols: set[str]) -> str:
    """Génère l'expression SQL DuckDB pour mapper une colonne source vers prices_raw.

    Gère les colonnes calculées (_source_url, inserted_at, _ingestion_run_id),
    les colonnes absentes de la source (NULL), et les castings typés
    (BIGINT, DOUBLE, BOOLEAN, DATE, TIMESTAMP). Les colonnes texte subissent
    un nettoyage des caractères NUL (chr(0)).

    Args:
        col: Nom de la colonne cible dans prices_raw.
        source_cols: Ensemble des colonnes disponibles dans le fichier source.

    Returns:
        str: Expression SQL prête à l'emploi dans un SELECT DuckDB.
    """
    if col == "_source_url":
        return f"'{URL_PRICES}' AS _source_url"
    if col == "inserted_at":
        return "CURRENT_TIMESTAMP AS inserted_at"
    if col == "_ingestion_run_id":
        return f"'{uuid.uuid4()}' AS _ingestion_run_id"
    if col not in source_cols:
        return f"NULL::VARCHAR AS {col}"
    if col in PRICES_INT_COLS:
        return f"TRY_CAST({col} AS BIGINT) AS {col}"
    if col in PRICES_NUMERIC_COLS:
        return f"TRY_CAST({col} AS DOUBLE) AS {col}"
    if col in PRICES_BOOL_COLS:
        return f"TRY_CAST({col} AS BOOLEAN) AS {col}"
    if col in PRICES_DATE_COLS:
        return f"TRY_CAST({col} AS DATE) AS {col}"
    if col in PRICES_TS_COLS:
        return f"TRY_CAST({col} AS TIMESTAMP) AS {col}"
    return f"CASE WHEN {col} IS NULL THEN NULL ELSE REPLACE(CAST({col} AS VARCHAR), chr(0), '') END AS {col}"

# EXPRESSIONS SQL — products

def _quote_col(col: str) -> str:
    """Encadre un nom de colonne avec des guillemets doubles si nécessaire.

    Requis pour les colonnes Open Food Facts contenant des tirets, espaces,
    points ou slashes qui sont invalides dans un identifiant SQL non quoté.

    Args:
        col: Nom de colonne brut.

    Returns:
        str: Nom de colonne quoté si nécessaire, sinon inchangé.
    """
    if any(c in col for c in ("-", " ", ".", "/")):
        return f'"{col}"'
    return col

def _products_expr(col: str, source_cols: set[str], source_url: str,
                   extra_cols: list[str], data_source: str) -> str:
    """Génère l'expression SQL DuckDB pour mapper une colonne source vers products_raw.

    Couvre trois catégories :
    - Colonnes techniques calculées (data_source, _source_url, _ingestion_run_id,
      inserted_at, created_api, updated_api, updated_at) : valeurs injectées sans référence source.
    - Colonne extra_data : sérialisation JSON des colonnes non-communes présentes dans la source.
    - Colonnes communes : casting typé (INTEGER, DOUBLE, BOOLEAN, BIGINT) ou nettoyage texte VARCHAR.

    Args:
        col: Nom de la colonne cible dans products_raw.
        source_cols: Ensemble des colonnes disponibles dans le fichier source.
        source_url: URL d'origine du fichier (injectée dans _source_url).
        extra_cols: Liste des colonnes non-communes à sérialiser dans extra_data.
        data_source: Identifiant de la source ('food', 'beauty', 'other').

    Returns:
        str: Expression SQL prête à l'emploi dans un SELECT DuckDB.
    """
    if col == "data_source":
        return f"'{data_source}' AS data_source"
    if col == "_source_url":
        return f"'{source_url}' AS _source_url"
    if col == "_ingestion_run_id":
        return f"'{uuid.uuid4()}' AS _ingestion_run_id"
    if col == "inserted_at":
        return "CURRENT_TIMESTAMP AS inserted_at"
    if col == "created_api":
        return """CASE WHEN TRY_CAST(created_t AS BIGINT) IS NOT NULL
                       THEN to_timestamp(TRY_CAST(created_t AS BIGINT))::TIMESTAMP
                       ELSE NULL END AS created_api"""
    if col == "updated_api":
        return """CASE WHEN TRY_CAST(last_updated_t AS BIGINT) IS NOT NULL
                       THEN to_timestamp(TRY_CAST(last_updated_t AS BIGINT))::TIMESTAMP
                       WHEN TRY_CAST(last_modified_t AS BIGINT) IS NOT NULL
                       THEN to_timestamp(TRY_CAST(last_modified_t AS BIGINT))::TIMESTAMP
                       ELSE NULL END AS updated_api"""
    if col == "updated_at":
        return """COALESCE(
                    CASE WHEN TRY_CAST(last_updated_t AS BIGINT) IS NOT NULL
                         THEN to_timestamp(TRY_CAST(last_updated_t AS BIGINT))::TIMESTAMP END,
                    CASE WHEN TRY_CAST(last_modified_t AS BIGINT) IS NOT NULL
                         THEN to_timestamp(TRY_CAST(last_modified_t AS BIGINT))::TIMESTAMP END,
                    CURRENT_TIMESTAMP
                ) AS updated_at"""

    if col == "extra_data":
        if not extra_cols:
            return "NULL::VARCHAR AS extra_data"
        kv_pairs   = ", ".join(f"'{c}', CAST({_quote_col(c)} AS VARCHAR)" for c in extra_cols)
        null_check = " IS NULL AND ".join(_quote_col(c) for c in extra_cols) + " IS NULL"
        return (
            f"CASE WHEN {null_check} THEN NULL "
            f"ELSE CAST(json_object({kv_pairs}) AS VARCHAR) END AS extra_data"
        )

    if col not in source_cols:
        return f"NULL AS {col}"

    qcol = _quote_col(col)

    if col == "code":
        return f"CAST({qcol} AS VARCHAR) AS code"
    if col in PRODUCTS_INTEGER_COLS:
        return f"TRY_CAST({qcol} AS INTEGER) AS {col}"
    if col in PRODUCTS_DOUBLE_COLS:
        return f"TRY_CAST({qcol} AS DOUBLE) AS {col}"
    if col in PRODUCTS_BOOLEAN_COLS:
        return f"TRY_CAST({qcol} AS BOOLEAN) AS {col}"
    if col in PRODUCTS_BIGINT_COLS:
        return f"TRY_CAST({qcol} AS BIGINT) AS {col}"

    return (
        f"CASE WHEN {qcol} IS NULL THEN NULL "
        f"ELSE REPLACE(CAST({qcol} AS VARCHAR), chr(0), '') END AS {col}"
    )

def build_extra_cols(source_cols: set[str]) -> list[str]:
    """Identifie les colonnes non-communes à sérialiser dans extra_data.

    Exclut les colonnes communes (PRODUCTS_COMMON_COLS), techniques (PRODUCTS_TECHNICAL_COLS)
    et 'code' pour ne conserver que les colonnes spécifiques à chaque source
    (ex: colonnes nutritionnelles spécifiques à Open Food Facts).

    Args:
        source_cols: Ensemble des colonnes disponibles dans le fichier source.

    Returns:
        list[str]: Liste triée des colonnes à inclure dans extra_data.
    """
    excluded = PRODUCTS_COMMON_COLS | PRODUCTS_TECHNICAL_COLS | {"code"}
    return sorted(c for c in source_cols if c not in excluded)

# INSERT — prices

def _insert_prices(parquet_path: str, already_loaded: int) -> int:
    total = pq.ParquetFile(parquet_path).metadata.num_rows
    if already_loaded >= total:
        logger.info("✅ prices_raw déjà complet → skip")
        return 0

    con_light = duckdb.connect(":memory:")
    try:
        desc = con_light.execute(
            f"DESCRIBE SELECT * FROM read_parquet('{parquet_path}')"
        ).fetchall()
    finally:
        con_light.close()

    source_cols = {r[0] for r in desc}
    exprs = [_prices_expr(c, source_cols) for c in PRICES_COLUMNS]

    con = _open_duck()
    try:
        # ── Étape 1 ──
        con.execute("""
            CREATE TEMP TABLE existing_ids AS
            SELECT id AS ex_id, updated AS ex_updated
            FROM pg.public.prices_raw
        """)

        # ── Étape 2 ──
        con.execute(f"""
            INSERT INTO pg.public.prices_raw ({", ".join(PRICES_COLUMNS)})
            SELECT {", ".join(exprs)}
            FROM read_parquet('{parquet_path}') src
            LEFT JOIN existing_ids ex
                ON ex.ex_id      = TRY_CAST(src.id      AS BIGINT)
               AND ex.ex_updated = TRY_CAST(src.updated AS TIMESTAMP)
            WHERE ex.ex_id IS NULL
        """)
        logger.info(f"✅ prices_raw : {total:,} lignes traitées")
        return total - already_loaded
    finally:
        con.close()
        
# INSERT — products parquet (fichier unique)

def _insert_products_parquet_file(part_path: str, source_url: str, data_source: str) -> int:
    """Insère un fichier Parquet de produits dans products_raw via DuckDB → PostgreSQL.

    Ouvre deux connexions DuckDB successives : une légère pour inférer le schéma (DESCRIBE),
    une complète avec pg attaché pour l'insertion. La contrainte d'unicité doit avoir été
    droppée en amont par _drop_products_constraint() pour permettre l'insertion sans vérification.

    Args:
        part_path: Chemin absolu vers le fichier Parquet (ex: food.parquet).
        source_url: URL d'origine du dataset (injectée dans _source_url).
        data_source: Identifiant de la source ('food').

    Returns:
        int: Nombre de lignes dans le fichier Parquet traité.
    """
    con = duckdb.connect(":memory:")
    desc = con.execute(f"DESCRIBE SELECT * FROM read_parquet('{part_path}')").fetchall()
    con.close()

    source_cols = {r[0] for r in desc}
    extra_cols  = build_extra_cols(source_cols)
    exprs = [_products_expr(c, source_cols, source_url, extra_cols, data_source)
             for c in PRODUCTS_COLUMNS]

    con = _open_duck()
    try:
        con.execute(f"""
            INSERT INTO pg.public.products_raw ({", ".join(PRODUCTS_COLUMNS)})
            SELECT {", ".join(exprs)}
            FROM read_parquet('{part_path}') src
            WHERE src.code IS NOT NULL
        """)
        n = pq.ParquetFile(part_path).metadata.num_rows
        logger.info(f"  ✅ {Path(part_path).name} : {n:,} lignes")
        return n
    finally:
        con.close()

# INSERT — products jsonl (fichier unique)

def _insert_products_jsonl_file(jsonl_path: str, source_url: str, data_source: str) -> int:
    """Insère un fichier JSONL de produits dans products_raw via DuckDB → PostgreSQL.

    Tente d'abord d'inférer le schéma avec read_json_auto (sample_size=1000).
    Si le schéma est vide ou réduit à {"json"} (fichier mal structuré), bascule
    automatiquement sur le fallback _insert_products_jsonl_raw() qui utilise json_extract
    colonne par colonne.

    Args:
        jsonl_path: Chemin absolu vers le fichier JSONL (newline-delimited).
        source_url: URL d'origine du dataset (injectée dans _source_url).
        data_source: Identifiant de la source ('beauty', 'other').

    Returns:
        int: Nombre de lignes dans le fichier JSONL traité.
    """
    con = duckdb.connect(":memory:")
    try:
        desc = con.execute(f"""
            DESCRIBE SELECT * FROM read_json_auto(
                '{jsonl_path}',
                format='newline_delimited',
                ignore_errors=true,
                maximum_object_size=16777216,
                sample_size=1000
            )
        """).fetchall()
    except Exception as e:
        logger.warning(f"⚠ DESCRIBE échoué ({e}), tentative avec json_each...")
        desc = []
    finally:
        con.close()

    source_cols = {r[0] for r in desc}

    if not source_cols or source_cols == {"json"}:
        logger.warning(f"⚠ Schéma non inféré pour {jsonl_path}, utilisation de json_extract")
        return _insert_products_jsonl_raw(jsonl_path, source_url, data_source)

    extra_cols = build_extra_cols(source_cols)
    exprs = [_products_expr(c, source_cols, source_url, extra_cols, data_source)
             for c in PRODUCTS_COLUMNS]

    con = _open_duck()
    try:
        con.execute(f"""
            INSERT INTO pg.public.products_raw ({", ".join(PRODUCTS_COLUMNS)})
            SELECT {", ".join(exprs)}
            FROM read_json_auto(
                '{jsonl_path}',
                format='newline_delimited',
                ignore_errors=true,
                maximum_object_size=16777216,
                sample_size=1000
            ) src
            WHERE src.code IS NOT NULL
        """)
        with open(jsonl_path, "r", errors="ignore") as f:
            total = sum(1 for _ in f)
        logger.info(f"  ✅ {Path(jsonl_path).name} : {total:,} lignes")
        return total
    finally:
        con.close()

def _insert_products_jsonl_raw(jsonl_path: str, source_url: str, data_source: str) -> int:
    # ── 1. Inférer source_cols depuis le premier objet lisible ──
    source_cols: set[str] = set()
    try:
        with open(jsonl_path, "r", errors="ignore") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                obj = json.loads(line)
                source_cols = set(obj.keys())
                break
    except Exception as e:
        logger.warning(f"⚠ Impossible de lire le premier objet JSON ({e}), source_cols vide")

    # ── 2. Construire les expressions via _products_expr ────────
    extra_cols = build_extra_cols(source_cols)
    exprs = [
        _products_expr(c, source_cols, source_url, extra_cols, data_source)
        for c in PRODUCTS_COLUMNS
    ]

    # ── 3. Sous-SELECT : déplie json → colonnes nommées ─────────
    json_extracts = ", ".join(
        f"CAST(json_extract(json, '$.{c}') AS VARCHAR) AS {_quote_col(c)}"
        for c in source_cols
    )
    inner_select = (
        f"SELECT {json_extracts} FROM read_ndjson('{jsonl_path}', ignore_errors=true)"
        if json_extracts
        else f"SELECT * FROM read_ndjson('{jsonl_path}', ignore_errors=true)"
    )

    # ── 4. Insérer ──────────────────────────────────────────────
    con = _open_duck()
    try:
        con.execute(f"""
            INSERT INTO pg.public.products_raw ({", ".join(PRODUCTS_COLUMNS)})
            SELECT {", ".join(exprs)}
            FROM ({inner_select}) src
            WHERE src.code IS NOT NULL
        """)
        with open(jsonl_path, "r", errors="ignore") as f:
            total = sum(1 for _ in f)
        logger.info(f"  ✅ {Path(jsonl_path).name} (raw mode) : {total:,} lignes")
        return total
    finally:
        con.close()

# TASKS — wrapper commun

def _run_seed_task(task_name: str, fn) -> None:
    """Wrapper commun pour toutes les tâches seed.

    Gère le chronomètre, le statut et le logging final de manière uniforme.
    La logique métier est entièrement déléguée à fn().

    Args:
        task_name: Nom de la tâche (utilisé dans les logs).
        fn: Callable sans argument contenant la logique métier, doit retourner int (rows_inserted).
    """
    start = time.time()
    rows_inserted = 0
    status = "failed"
    try:
        rows_inserted = fn()
        status = "success"
        logger.info(f"✅ {task_name} terminé : {rows_inserted:,} lignes")
    except Exception as e:
        logger.error(f"❌ {task_name} : {e}", exc_info=True)
        raise
    finally:
        logger.info(f"{task_name} status={status} rows={rows_inserted:,} duration={time.time()-start:.1f}s")


def seed_prices(**context) -> None:
    """Tâche Airflow : charge les prix Open Prices dans prices_raw.

    Vérifie d'abord le nombre de lignes déjà présentes pour éviter un rechargement complet.
    Active les paramètres bulk PostgreSQL avant l'insertion et les restaure ensuite.
    Log le statut, le nombre de lignes et la durée en sortie de tâche.

    Args:
        **context: Contexte Airflow injecté par PythonOperator (non utilisé directement).

    Raises:
        Exception: Toute erreur d'insertion est loggée puis re-raise pour faire échouer la tâche.
    """
    def _run():
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM prices_raw")
            already = cur.fetchone()[0]
        _bulk_settings(conn, _BULK_ON)
        conn.close()

        rows = _insert_prices(PARQUET_PATH_PRICES, already)

        conn = get_db_connection()
        _bulk_settings(conn, _BULK_OFF)
        conn.close()
        return rows

    _run_seed_task("seed_prices", _run)


def seed_food(**context) -> None:
    """Tâche Airflow : charge les produits alimentaires Open Food Facts dans products_raw.

    Lit le fichier food.parquet unique (mode PROD complet).
    Droppe la contrainte d'unicité avant l'insert et la recrée après
    pour optimiser les performances bulk.

    Args:
        **context: Contexte Airflow injecté par PythonOperator (non utilisé directement).

    Raises:
        FileNotFoundError: Si food.parquet n'existe pas dans DATA_PATH.
        Exception: Toute erreur d'insertion est loggée puis re-raise pour faire échouer la tâche.
    """
    def _run():
        food_path = Path(PARQUET_PATH_FOOD)
        if not food_path.exists():
            raise FileNotFoundError(f"Fichier non trouvé : {PARQUET_PATH_FOOD}")
        logger.info(f"▶ Traitement {food_path.name} (PROD complet)…")
        conn = get_db_connection()
        _drop_products_constraint(conn)
        conn.close()
        rows = _insert_products_parquet_file(str(food_path), URL_FOOD, "food")
        conn = get_db_connection()
        _recreate_products_constraint(conn)
        conn.close()
        return rows

    _run_seed_task("seed_food", _run)


def seed_beauty(**context) -> None:
    """Tâche Airflow : charge les produits cosmétiques Open Beauty Facts dans products_raw.

    Charge le fichier JSONL unique beauty.jsonl (mode PROD complet).
    Droppe la contrainte d'unicité avant l'insertion et la recrée après.

    Args:
        **context: Contexte Airflow injecté par PythonOperator (non utilisé directement).

    Raises:
        FileNotFoundError: Si beauty.jsonl n'existe pas dans DATA_PATH.
        Exception: Toute erreur d'insertion est loggée puis re-raise pour faire échouer la tâche.
    """
    def _run():
        beauty_path = Path(JSONL_PATH_BEAUTY)
        if not beauty_path.exists():
            raise FileNotFoundError(f"Fichier non trouvé : {JSONL_PATH_BEAUTY}")
        logger.info(f"▶ Traitement {beauty_path.name} (PROD complet)…")
        conn = get_db_connection()
        _drop_products_constraint(conn)
        conn.close()
        rows = _insert_products_jsonl_file(JSONL_PATH_BEAUTY, URL_BEAUTY, "beauty")
        conn = get_db_connection()
        _recreate_products_constraint(conn)
        conn.close()
        return rows

    _run_seed_task("seed_beauty", _run)


def seed_other(**context) -> None:
    """Tâche Airflow : charge les autres produits Open Products Facts dans products_raw.

    Lit le fichier other.jsonl unique (mode PROD complet).
    Droppe la contrainte d'unicité avant l'insert et la recrée après.

    Args:
        **context: Contexte Airflow injecté par PythonOperator (non utilisé directement).

    Raises:
        FileNotFoundError: Si other.jsonl n'existe pas dans DATA_PATH.
        Exception: Toute erreur d'insertion est loggée puis re-raise pour faire échouer la tâche.
    """
    def _run():
        other_path = Path(JSONL_PATH_OTHER)
        if not other_path.exists():
            raise FileNotFoundError(f"Fichier non trouvé : {JSONL_PATH_OTHER}")
        logger.info(f"▶ Traitement {other_path.name} (PROD complet)…")
        conn = get_db_connection()
        _drop_products_constraint(conn)
        conn.close()
        rows = _insert_products_jsonl_file(JSONL_PATH_OTHER, URL_OTHER, "other")
        conn = get_db_connection()
        _recreate_products_constraint(conn)
        conn.close()
        return rows

    _run_seed_task("seed_other", _run)


# SEED — currency (taux de change ECB + IMF)

def _get_db_connection_currency():
    conn = get_db_connection()
    _bulk_settings(conn, ["SET synchronous_commit = OFF", "SET work_mem = '128MB'"])
    return conn

def _inserer_taux(rows: list[dict], conn) -> int:
    """Déduplique et insère un batch de taux de change dans exchange_rates_raw.
    Trie par source (ECB prioritaire), déduplique sur (rate_date, currency),
    puis insère avec ON CONFLICT DO UPDATE — en n'écrasant pas les taux ECB
    avec des taux IMF de moindre qualité.

    Args:
        rows: Liste de dicts avec clés rate_date, currency, rate_to_eur, source, frequency.
        conn: Connexion psycopg2 active.

    Returns:
        int: Nombre de lignes insérées ou mises à jour.
    """
    if not rows:
        return 0
    df = pd.DataFrame(rows)
    df = df.sort_values("source", ascending=False)
    df = df.drop_duplicates(subset=["rate_date", "currency"], keep="first")
    tuples = [
        tuple(x) for x in df[["rate_date","currency","rate_to_eur","source","frequency"]].to_numpy()
    ]
    with conn.cursor() as cur:
        execute_values(
            cur,
            """
            INSERT INTO exchange_rates_raw (rate_date, currency, rate_to_eur, source, frequency)
            VALUES %s
            ON CONFLICT (rate_date, currency) DO UPDATE
                SET rate_to_eur = EXCLUDED.rate_to_eur,
                    source      = EXCLUDED.source,
                    frequency   = EXCLUDED.frequency
                WHERE exchange_rates_raw.source != 'ECB'
            """,
            tuples,
            page_size=CURRENCY_PAGE_SIZE,
        )
    conn.commit()
    return len(tuples)

def _charger_ecb(conn, date_min=None) -> tuple[int, set]:
    """Télécharge et charge les taux de change historiques de la BCE dans exchange_rates_raw.
    Télécharge le ZIP historique ECB (eurofxref-hist.zip), pivote le CSV wide→long,
    filtre sur TARGET_CURRENCIES et insère par batch de 10 000 lignes.

    Args:
        conn: Connexion psycopg2 active avec paramètres bulk.
        date_min: Date minimale à partir de laquelle charger (incluse). None = tout.

    Returns:
        tuple[int, set]: (nombre de lignes insérées, ensemble des devises couvertes par ECB).
    """
    resp = requests.get(ECB_ZIP_URL, timeout=120)
    resp.raise_for_status()
    with zipfile.ZipFile(io.BytesIO(resp.content)) as z:
        name = next(n for n in z.namelist() if n.endswith(".csv"))
        df = pd.read_csv(z.open(name))
    df.columns = [c.strip() for c in df.columns]
    df.rename(columns={"Date": "rate_date"}, inplace=True)
    df["rate_date"] = pd.to_datetime(df["rate_date"]).dt.date
    if date_min:
        df = df[df["rate_date"] >= date_min]
    currency_cols = [c for c in df.columns if c != "rate_date"]
    df_long = df.melt(id_vars=["rate_date"], value_vars=currency_cols,
                      var_name="currency", value_name="rate_to_eur")
    df_long["currency"]    = df_long["currency"].str.strip().str.upper()
    df_long["rate_to_eur"] = pd.to_numeric(df_long["rate_to_eur"], errors="coerce")
    df_long = df_long.dropna()
    df_long = df_long[df_long["currency"].isin(TARGET_CURRENCIES)]
    df_long["source"]    = "ECB"
    df_long["frequency"] = "daily"
    ecb_currencies = set(df_long["currency"].unique())
    rows = df_long.to_dict("records")
    inserted = sum(
        _inserer_taux(rows[i:i+10_000], conn)
        for i in range(0, len(rows), 10_000)
    )
    logger.info(f"ECB OK: {inserted:,} lignes")
    return inserted, ecb_currencies

def _charger_imf(conn, ecb_currencies: set, date_min=None) -> int:
    """Complète les taux de change manquants via les données FMI.
    Charge uniquement les devises absentes de ECB (TARGET_CURRENCIES - ecb_currencies).
    Convertit les taux USD→EUR via la moyenne mensuelle ECB déjà chargée,
    puis étale le taux mensuel sur tous les jours du mois.

    Args:
        conn: Connexion psycopg2 active avec paramètres bulk.
        ecb_currencies: Ensemble des devises déjà couvertes par ECB (à exclure).
        date_min: Date minimale à partir de laquelle charger (incluse). None = tout.

    Returns:
        int: Nombre de lignes insérées (0 si toutes les devises sont déjà couvertes par ECB)."""
    
    devises_manquantes = TARGET_CURRENCIES - ecb_currencies
    if not devises_manquantes:
        logger.info("IMF skip (tout couvert par ECB)")
        return 0

    df = pd.read_csv(IMF_CSV_URL)
    df.columns = [c.strip().lower() for c in df.columns]
    df.rename(columns={"date": "rate_date", "currency": "currency", "rate": "rate_usd"}, inplace=True)
    df["rate_date"] = pd.to_datetime(df["rate_date"])
    df["currency"]  = df["currency"].astype(str).str.strip().str.upper()
    df["rate_usd"]  = pd.to_numeric(df["rate_usd"], errors="coerce")
    df = df.dropna()
    df = df[df["currency"].isin(devises_manquantes)]
    if date_min:
        df = df[df["rate_date"].dt.date >= date_min]
    if df.empty:
        logger.info("IMF skip (aucune donnée pour les devises manquantes)")
        return 0

    usd = pd.read_sql("""
        SELECT DATE_TRUNC('month', rate_date) AS month_start,
               AVG(rate_to_eur)               AS usd_to_eur
        FROM exchange_rates_raw
        WHERE currency = 'USD' AND source = 'ECB'
        GROUP BY month_start
    """, conn)
    usd["month_start"] = pd.to_datetime(usd["month_start"]).dt.tz_localize(None)
    df["month_start"]  = df["rate_date"].dt.to_period("M").dt.to_timestamp()
    df = df.merge(usd, on="month_start", how="left")
    df["rate_to_eur"] = df["usd_to_eur"] * df["rate_usd"]
    df = df.dropna(subset=["rate_to_eur"])
    df["source"]    = "IMF"
    df["frequency"] = "monthly"

    all_rows = []
    for _, row in df.iterrows():
        yr, mo = row["rate_date"].year, row["rate_date"].month
        first  = date(yr, mo, 1)
        last   = date(yr, mo + 1, 1) - timedelta(days=1) if mo < 12 else date(yr, 12, 31)
        cur_d  = first
        while cur_d <= last:
            all_rows.append({
                "rate_date":   cur_d,
                "currency":    row["currency"],
                "rate_to_eur": row["rate_to_eur"],
                "source":      "IMF",
                "frequency":   "monthly",
            })
            cur_d += timedelta(days=1)

    inserted = sum(
        _inserer_taux(all_rows[i:i+10_000], conn)
        for i in range(0, len(all_rows), 10_000)
    )
    logger.info(f"IMF OK: {inserted:,} lignes")
    return inserted

def seed_currency(**context) -> None:
    """Tâche Airflow : charge les taux de change ECB + FMI dans exchange_rates_raw.
    Skip si exchange_rates_raw est déjà peuplé (idempotent). En premier seed,
    charge d'abord les taux BCE (quotidiens, prioritaires), puis complète
    avec les taux FMI (mensuels) pour les devises non couvertes par BCE.

    Args:
        **context: Contexte Airflow injecté par PythonOperator (non utilisé directement).

    Raises:
        Exception: Toute erreur de chargement est loggée puis re-raise pour faire échouer la tâche.
    """
    start  = time.time()
    status = "failed"
    rows_inserted = 0
    try:
        conn = _get_db_connection_currency()
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM exchange_rates_raw")
            already_seeded = cur.fetchone()[0] > 0

        if not already_seeded:
            logger.info("▶ FIRST SEED currency")
            n_ecb, ecb_currencies = _charger_ecb(conn, DATE_MIN_CURRENCY)
            n_imf = _charger_imf(conn, ecb_currencies, DATE_MIN_CURRENCY)
            rows_inserted = n_ecb + n_imf
        else:
            logger.info("⏭ SKIP seed_currency (déjà peuplé)")

        status = "success"
        conn.close()
        logger.info(f"✅ seed_currency terminé : {rows_inserted:,} lignes")
    except Exception as e:
        logger.error(f"❌ seed_currency : {e}", exc_info=True)
        raise
    finally:
        logger.info(f"seed_currency status={status} rows={rows_inserted:,} duration={time.time()-start:.1f}s")