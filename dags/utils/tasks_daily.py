import gzip
import math
import time
import requests
import numpy as np
import pandas as pd
import os
import orjson
import psycopg2.extras
from datetime import datetime, timedelta, timezone
from typing import Optional
from psycopg2.extras import execute_values
from psycopg2.extensions import ISOLATION_LEVEL_DEFAULT
from utils.common import (
    get_db_connection,
    PRICES_COLUMNS,      # ← utilisé pour construire les INSERT
    PRICES_INT_COLS,     
    PRICES_NUMERIC_COLS,
    PRICES_BOOL_COLS,
    PRICES_DATE_COLS,
    PRICES_TS_COLS,
    PRODUCTS_FLAT_COLS,
    PRODUCTS_INSERT_COLS
)
from psycopg2.extras import execute_values
import logging

CURRENCY_API_URL = "https://api.currencyfreaks.com/latest?apikey=5b6c4d670a024678b965bfe7b5f45a0d"

# CONFIGURATION — GLOBAL

HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; OpenPricesPipeline/1.0; +https://github.com/openfoodfacts)",
}
MAX_RETRIES     = 10
RETRY_WAIT_BASE = 10 # un backoff — on recule progressivement

# CONFIGURATION — PRICES

API_URL             = "https://prices.openfoodfacts.org/api/v1/prices"
PAGE_SIZE           = 100
INSERT_EVERY        = 20
WATERMARK_DELTA_MIN = 60
MAX_EMPTY_BATCHES   = 3

# CONFIGURATION — DELTA PRODUCTS

DELTA_SOURCES = {
    "food":   "https://static.openfoodfacts.org/data/delta/index.txt",
    "beauty": "https://static.openbeautyfacts.org/data/delta/index.txt",
    "other":  "https://static.openproductsfacts.org/data/delta/index.txt",
}
DELTA_BASE_URLS = {
    "food":   "https://static.openfoodfacts.org/data/delta/",
    "beauty": "https://static.openbeautyfacts.org/data/delta/",
    "other":  "https://static.openproductsfacts.org/data/delta/",
}
PRODUCTS_CHUNK_SIZE       = 5_000
PRODUCTS_PAGE_SIZE_SQL    = 2_000
GZ_READ_CHUNK_KB          = 256
WATERMARK_DELTA_PRODUCTS_SEC = 300

# UTILITAIRES COMMUNS
def remove_nul(val):
    """Supprime les caractères NUL (\x00) qui cassent PostgreSQL"""
    if isinstance(val, str):  return val.replace("\x00", "")
    if isinstance(val, list): return [remove_nul(v) for v in val]
    if isinstance(val, dict): return {k: remove_nul(v) for k, v in val.items()}
    return val

def clean_nat(val):
    if val is None:
        return None
    try:
        if pd.isna(val):
            return None
    except (TypeError, ValueError):
        pass
    return val

def clean_value(val): 
    """Sans cette fonction, psycopg2 ne saurait pas quoi faire des types numpy/pandas et lèverait des ProgrammingError.
    """
    val = clean_nat(val)
    if val is None:
        return None
    if isinstance(val, str):
        val = val.replace("\x00", "")
        if val.strip() == "":
            return None
    if isinstance(val, dict):
        return orjson.dumps(remove_nul(val)).decode("utf-8")
    if isinstance(val, list):
        cleaned = [remove_nul(v) for v in val]
        if any(isinstance(i, dict) for i in cleaned):
            return orjson.dumps(cleaned).decode("utf-8")
        return str(cleaned) if cleaned else None
    if isinstance(val, np.integer):   return int(val)
    if isinstance(val, np.floating):  return None if np.isnan(val) else float(val)
    if isinstance(val, np.bool_):     return bool(val)
    if isinstance(val, pd.Timestamp): return val.to_pydatetime()
    return val

def normalize_updated_at(ts_unix) -> Optional[datetime]:
    try:
        if ts_unix is None or (isinstance(ts_unix, float) and math.isnan(ts_unix)): #je lis du Parquet via PyArrow avec iter_batches(). Quand PyArrow convertit une colonne entière nullable en Python, les valeurs manquantes deviennent float('nan') — pas None en fait dans le daily c'est pas utilisable dans ce cas 
            return None
        return datetime.fromtimestamp(int(ts_unix), tz=timezone.utc)
    except Exception:
        return None

def ensure_all_constraints(conn, targets=None):
    available = {
        "prices": (
            "prices_raw",
            "prices_raw_id_updated_uidx",
            "CREATE UNIQUE INDEX IF NOT EXISTS prices_raw_id_updated_uidx ON prices_raw (id, updated)",
        ),
        "products": (
            "products_raw",
            "products_raw_code_updatedat_uidx",
            "CREATE UNIQUE INDEX IF NOT EXISTS products_raw_code_updatedat_uidx ON products_raw (code, updated_at)",
        ),
    }

    if targets is None:
        targets = ["prices", "products"]
    conn.rollback()
    for target in targets:
        table, name, ddl = available[target]

        with conn.cursor() as cur:
            cur.execute("""
                SELECT indisvalid
                FROM pg_index
                JOIN pg_class ON pg_class.oid = pg_index.indexrelid
                WHERE relname = %s
            """, (name,))
            row = cur.fetchone()

        if row is None:
            print(f"Index {name} absent → création automatique...")
            conn.rollback()
            conn.set_isolation_level(0)
            with conn.cursor() as cur:
                cur.execute(ddl)
            conn.set_isolation_level(ISOLATION_LEVEL_DEFAULT)
            print(f"Index {name} créé ✓")
        elif not row[0]:
            print(f"Index {name} INVALID → reconstruction...")
            conn.rollback()
            conn.set_isolation_level(0)
            with conn.cursor() as cur:
                cur.execute(f"DROP INDEX IF EXISTS {name}")
                cur.execute(ddl)
            conn.set_isolation_level(ISOLATION_LEVEL_DEFAULT)
            print(f"Index {name} reconstruit ✓")

        else:
            print(f"Index {name} présent et valide ✓")            

# UTILITAIRES PRICES

def parse_timestamp(ts):
    """Convertit un timestamp ISO 8601 (str) en datetime UTC Python.
    Retourne None si la valeur est absente ou vide.
    Différence avec normalize_updated_at() :
    - normalize_updated_at() traite les timestamps Unix (int/float)
      ex: last_modified_t = 1710500000
    - parse_timestamp() traite les timestamps texte ISO 8601
      ex: last_modified_datetime = "2024-03-15T10:30:00Z"
    Les deux retournent un datetime UTC aware, compatible TIMESTAMPTZ PostgreSQL.
    """
    if not ts:
        return None
    # Python < 3.11 ne reconnaît pas "Z" comme suffixe UTC dans fromisoformat()
    # On remplace "Z" par "+00:00" qui est compris par toutes les versions Python
    # Si ts n'a pas de "Z", replace() ne fait rien → sans effet secondaire
    dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
    # Cas défensif : si le timestamp n'a aucune timezone (ex: "2024-03-15T10:30:00")
    # fromisoformat() retourne un datetime naive (tzinfo=None)
    # On force UTC pour garantir la cohérence avec les autres timestamps du pipeline
    # et éviter les décalages lors de l'insert en TIMESTAMPTZ PostgreSQL
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt

def parse_date(val) -> Optional[str]:
    """
    Extrait la partie date (YYYY-MM-DD) d'une valeur quelconque.
    Retourne une str, pas un datetime — pour les colonnes DATE ou VARCHAR PostgreSQL.
    Différence avec parse_timestamp() et normalize_updated_at() :
    - Ces deux fonctions retournent un datetime UTC (pour TIMESTAMPTZ)
    - parse_date() retourne juste "2024-03-15" en str (pour DATE/VARCHAR)
    - À utiliser pour les champs date sans heure : created_date, expiration_date...
    """
    if val is None:
        return None
    try:
        return val[:10] if isinstance(val, str) and len(val) >= 10 else str(val)
    except Exception:
        return None

def cast_price_value(val, col: str):
    val = clean_value(val)
    if val is None:
        return None
    try:
        if col in PRICES_INT_COLS:     return int(float(val))
        if col in PRICES_NUMERIC_COLS: return float(val)
        if col in PRICES_BOOL_COLS:
            if isinstance(val, bool):  return val
            return str(val).lower() in ("true", "1", "yes")
        if col in PRICES_DATE_COLS:    return parse_date(val)
        if col in PRICES_TS_COLS:      return parse_timestamp(val)
    except Exception:
        return None
    return val

def get_resume_page() -> int:
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT value FROM pipeline_state WHERE key = 'prices_resume_page'"
        )
        row = cursor.fetchone()
        cursor.close()
        conn.close()
        return int(row[0]) if row else 1
    except Exception:
        return 1

def set_resume_page(page: int, conn=None, close_after=False):
    try:
        if conn is None:
            conn = get_db_connection()
            close_after = True

        # reset défensif pour éviter les “InFailedSqlTransaction”
        conn.rollback()

        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO pipeline_state (key, value, updated_at)
            VALUES ('prices_resume_page', %s, NOW())
            ON CONFLICT (key) DO UPDATE
              SET value = EXCLUDED.value, updated_at = NOW()
        """, (str(page),))
        conn.commit()
        cursor.close()
        if close_after:
            conn.close()
    except Exception as e:
        print(f"set_resume_page erreur : {e}")
        
def get_last_created() -> Optional[datetime]:
    conn   = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT MAX(created)
        FROM prices_raw
        WHERE created IS NOT NULL
    """)
    result = cursor.fetchone()[0]
    cursor.close()
    conn.close()
    return result

# Récupère le watermark prices persisté lors du dernier run réussi
def get_persisted_watermark_prices() -> Optional[datetime]:
    """
    Retourne le watermark prices sauvegardé dans pipeline_state.
    Permet de détecter si MAX(created) n'a pas avancé depuis le dernier run
    (= run précédent a échoué avant tout INSERT) et de réinitialiser
    resume_page à 1 pour éviter de sauter des pages.
    """
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT value FROM pipeline_state WHERE key = 'prices_last_watermark'"
        )
        row = cursor.fetchone()
        cursor.close()
        conn.close()
        if row and row[0]:
            return datetime.fromisoformat(row[0])
        return None
    except Exception:
        return None

def set_persisted_watermark_prices(watermark: datetime, conn):
    try:
        conn.rollback()  # ← reset toute transaction pendante / abortée
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO pipeline_state (key, value, updated_at)
            VALUES ('prices_last_watermark', %s, NOW())
            ON CONFLICT (key) DO UPDATE
              SET value = EXCLUDED.value, updated_at = NOW()
        """, (watermark.isoformat(),))
        conn.commit()
        cursor.close()
    except Exception as e:
        print(f"set_persisted_watermark_prices erreur : {e}")
        conn.rollback()  # ← ne pas laisser la connexion en état aborted

# MAPPING API → prices_raw

def flatten_api_record(rec: dict) -> dict:
    row = {}
    direct_fields = [
        "id", "type", "product_code", "product_name", "category_tag",
        "labels_tags", "origins_tags", "price", "price_is_discounted",
        "price_without_discount", "discount_type", "price_per", "currency",
        "date", "receipt_quantity", "owner", "source", "created", "updated",
        "duplicate_of", "owner_comment", "tags", "product_id",
    ]
    for field in direct_fields:
        row[field] = rec.get(field)

    loc = rec.get("location") or {}
    row["location_id"]                       = loc.get("id")
    row["location_type"]                     = loc.get("type")
    row["location_osm_id"]                   = loc.get("osm_id")   or rec.get("location_osm_id")
    row["location_osm_type"]                 = loc.get("osm_type") or rec.get("location_osm_type")
    row["location_osm_name"]                 = loc.get("osm_name")
    row["location_osm_display_name"]         = loc.get("osm_display_name")
    row["location_osm_tag_key"]              = loc.get("osm_tag_key")
    row["location_osm_tag_value"]            = loc.get("osm_tag_value")
    row["location_osm_brand"]                = loc.get("osm_brand")
    row["location_osm_address_postcode"]     = loc.get("osm_address_postcode")
    row["location_osm_address_city"]         = loc.get("osm_address_city")
    row["location_osm_address_country"]      = loc.get("osm_address_country")
    row["location_osm_address_country_code"] = loc.get("osm_address_country_code")
    row["location_osm_lat"]                  = loc.get("osm_lat")
    row["location_osm_lon"]                  = loc.get("osm_lon")
    row["location_osm_version"]              = loc.get("osm_version")
    row["location_website_url"]              = loc.get("website_url")
    row["location_price_count"]              = loc.get("price_count")
    row["location_source"]                   = loc.get("source")
    row["location_created"]                  = loc.get("created")
    row["location_updated"]                  = loc.get("updated")

    proof = rec.get("proof") or {}
    row["proof_id"]                              = proof.get("id")
    row["proof_file_path"]                       = proof.get("file_path")
    row["proof_mimetype"]                        = proof.get("mimetype")
    row["proof_type"]                            = proof.get("type")
    row["proof_date"]                            = proof.get("date")
    row["proof_currency"]                        = proof.get("currency")
    row["proof_receipt_price_count"]             = proof.get("receipt_price_count")
    row["proof_receipt_price_total"]             = proof.get("receipt_price_total")
    row["proof_receipt_online_delivery_costs"]   = proof.get("receipt_online_delivery_costs")
    row["proof_ready_for_price_tag_validation"]  = proof.get("ready_for_price_tag_validation")
    row["proof_owner_consumption"]               = proof.get("owner_consumption")
    row["proof_owner"]                           = proof.get("owner")
    row["proof_source"]                          = proof.get("source")
    row["proof_created"]                         = proof.get("created")
    row["proof_updated"]                         = proof.get("updated")
    row["proof_image_md5_hash"]                  = proof.get("image_md5_hash")
    row["proof_image_thumb_path"]                = proof.get("image_thumb_path")
    row["proof_prediction_count"]                = proof.get("prediction_count")

    row["_source_url"] = "api_daily"
    return row

def map_api_record(rec: dict) -> Optional[dict]:
    try:
        if rec.get("id") is None:
            return None
        return flatten_api_record(rec)
    except Exception as e:
        print(f"   Mapping échoué id={rec.get('id')}: {e}")
        return None

# INSERT prices_raw

def inserer_prices_flat(rows: list[dict], conn) -> int:
    if not rows:
        return 0
    cursor   = conn.cursor()
    cols_str = ", ".join(PRICES_COLUMNS)
    sql = f"""
        INSERT INTO prices_raw ({cols_str})
        VALUES %s
        ON CONFLICT (id, updated) DO NOTHING
    """
    tuples = [
        tuple(cast_price_value(row.get(col), col) for col in PRICES_COLUMNS)
        for row in rows
    ]
    execute_values(cursor, sql, tuples, page_size=2000)
    inserted = cursor.rowcount
    conn.commit()
    cursor.close()
    return inserted

# FETCH PAGE PRICES

def fetch_page(params: dict) -> Optional[dict]:
    for attempt in range(MAX_RETRIES):
        try:
            response = requests.get(
                API_URL, params=params, timeout=30,
                headers=HEADERS,
            )
            response.raise_for_status()
            return response.json()
        except Exception as e:
            wait = RETRY_WAIT_BASE * (attempt + 1)
            print(f"   Retry {attempt + 1}/{MAX_RETRIES} ({wait}s): {e}")
            if attempt < MAX_RETRIES - 1:
                time.sleep(wait)
    return None

# TASK 1 : FETCH & INSERT PRICES

def fetch_and_insert_prices(**context):
    start_time        = time.time()
    rows_inserted     = 0
    rows_ignored      = 0
    rows_rejected     = 0
    status            = "failed"
    error_message     = None
    conn              = None
    consecutive_empty = 0
    try:
        last_created = get_last_created()
        if last_created is None:
            raise Exception("prices_raw vide — lancer pipeline_seed d'abord")

        if last_created.tzinfo is None:
            last_created = last_created.replace(tzinfo=timezone.utc)

        watermark = last_created - timedelta(minutes=WATERMARK_DELTA_MIN)
        print(f" Watermark (created__gte) : {watermark}")
        print(f"   MAX(created) en base   : {last_created}")

        # Protection désync resume_page / watermark
        # Si le watermark n'a pas avancé depuis le run précédent,
        # c'est que le run précédent a échoué avant tout INSERT.
        # On réinitialise resume_page à 1 pour ne pas sauter de pages.
        persisted_wm = get_persisted_watermark_prices()
        resume_page  = get_resume_page()

        if persisted_wm is not None:
            if persisted_wm.tzinfo is None:
                persisted_wm = persisted_wm.replace(tzinfo=timezone.utc)
            if watermark <= persisted_wm and resume_page > 1:
                print(
                    f" [C4] Watermark identique au run précédent ({persisted_wm}) "
                    f"et resume_page={resume_page} → reset à page 1 "
                    f"(run précédent probablement échoué avant INSERT)"
                )
                resume_page = 1
            else:
                print(f" Page de reprise : {resume_page}")
        else:
            print(f" Page de reprise : {resume_page} (premier run)")

        conn   = get_db_connection()
        ensure_all_constraints(conn, targets=["prices"])
        cursor = conn.cursor()
        cursor.execute("SET synchronous_commit = off")
        cursor.execute("SET work_mem = '64MB'")
        conn.commit()
        cursor.close()

        # Persiste le watermark utilisé dans ce run
        set_persisted_watermark_prices(watermark, conn)

        params = {
            "created__gte": watermark.strftime("%Y-%m-%dT%H:%M:%S"),
            "size":         PAGE_SIZE,
            "page":         resume_page,
            "order_by":     "-created",
        }

        total_pages        = None
        batch              = []
        pages_since_insert = 0

        while True:
            data = fetch_page(params)
            if not data or "items" not in data:
                raise Exception(f"Réponse invalide page {params['page']}")

            if total_pages is None:
                total_pages = data.get("pages", 1)
                total_items = data.get("total", 0)
                print(f" {total_items} nouveaux items / {total_pages} pages")
                if total_items == 0:
                    print(" Aucune nouvelle donnée depuis le watermark")
                    status = "success"
                    conn.close()
                    return

            current_page = params["page"]
            is_last      = current_page >= total_pages

            for item in data["items"]:
                items_list = item if isinstance(item, list) else [item]
                for sub in items_list:
                    row = map_api_record(sub)
                    if row:
                        batch.append(row)
                    else:
                        rows_rejected += 1

            print(f" Page {current_page}/{total_pages} | batch={len(batch)}")
            pages_since_insert += 1

            if pages_since_insert >= INSERT_EVERY or is_last:
                if batch:
                    n             = inserer_prices_flat(batch, conn)
                    ignored       = len(batch) - n
                    rows_inserted += n
                    rows_ignored  += ignored
                    consecutive_empty = 0
                    print(f"    +{n} insérés | {ignored} doublons ignorés")
                else:
                    consecutive_empty += 1
                    print(f"     batch vide ({consecutive_empty}/{MAX_EMPTY_BATCHES})")
                    if consecutive_empty >= MAX_EMPTY_BATCHES:
                        set_resume_page(1, conn)
                        break

                batch              = []
                pages_since_insert = 0
                set_resume_page(current_page + 1, conn)

            if is_last:
                set_resume_page(1, conn)
                break

            params["page"] += 1

        conn.close()
        print(f"\n PRICES DAILY : +{rows_inserted:,} insérés | {rows_ignored:,} doublons | {rows_rejected:,} rejetés")
        status = "success"

    except Exception as e:
        error_message = str(e)
        print(f" Erreur : {e}")
        if conn:
            try: conn.rollback(); conn.close()
            except: pass
        raise

# WATERMARK PRODUCTS
def get_max_last_modified(source: str) -> Optional[int]:
    """
    Retourne MAX(last_modified_t) pour la source donnée,
    avec une marge de sécurité de WATERMARK_DELTA_PRODUCTS_SEC secondes
    pour capturer les items en bordure de fenêtre temporelle.
    [C3] Marge de sécurité ajoutée
    """
    conn   = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT MAX(last_modified_t)
        FROM products_raw
        WHERE data_source = %s
          AND last_modified_t IS NOT NULL
    """, (source,))
    row = cursor.fetchone()
    cursor.close()
    conn.close()
    val = row[0] if row else None
    if val is None:
        return None
    if isinstance(val, datetime):
        raw_ts = int(val.timestamp())
    else:
        try:
            raw_ts = int(float(val))
        except Exception:
            return None

    # [C3] Recule le watermark de WATERMARK_DELTA_PRODUCTS_SEC secondes
    watermark_ts = raw_ts - WATERMARK_DELTA_PRODUCTS_SEC
    wm_dt = datetime.fromtimestamp(watermark_ts, tz=timezone.utc)
    raw_dt = datetime.fromtimestamp(raw_ts, tz=timezone.utc)
    print(
        f"   Watermark products [{source}] : {wm_dt} "
        f"(MAX={raw_dt}, marge={WATERMARK_DELTA_PRODUCTS_SEC}s)"
    )
    return watermark_ts

# INDEX DELTA
def fetch_index(index_url: str) -> list[str]:
    for attempt in range(MAX_RETRIES):
        try:
            resp = requests.get(index_url, timeout=30, headers=HEADERS)
            resp.raise_for_status()
            files = [
                line.strip()
                for line in resp.text.splitlines()
                if line.strip().endswith(".json.gz")
            ]
            return sorted(files)
        except Exception as e:
            wait = RETRY_WAIT_BASE * (attempt + 1)
            print(f"   fetch_index retry {attempt+1}/{MAX_RETRIES} ({wait}s): {e}")
            if attempt < MAX_RETRIES - 1:
                time.sleep(wait)
    raise Exception(f"Impossible de récupérer l'index : {index_url}")

def parse_timestamps_from_filename(filename: str) -> tuple[Optional[int], Optional[int]]:
    try:
        stem     = filename.replace(".json.gz", "")
        parts    = stem.split("_")
        ts_fin   = int(parts[-1])
        ts_debut = int(parts[-2])
        return ts_debut, ts_fin
    except Exception:
        return None, None

def filter_delta_files(files: list[str], watermark_ts: Optional[int]) -> list[str]:
    if watermark_ts is None:
        print("   Watermark None → tous les fichiers retenus")
        return files
    kept = []
    for f in files:
        _, ts_fin = parse_timestamps_from_filename(f)
        if ts_fin is not None and ts_fin > watermark_ts:
            kept.append(f)
    return kept

# REPRISE PAR FICHIER DELTA
def get_last_processed_delta(source: str) -> Optional[str]:
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT value FROM pipeline_state WHERE key = %s",
            (f"delta_last_file_{source}",)
        )
        row = cursor.fetchone()
        cursor.close()
        conn.close()
        return row[0] if row else None
    except Exception:
        return None

def set_last_processed_delta(source: str, filename: str, conn):
    try:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO pipeline_state (key, value, updated_at)
            VALUES (%s, %s, NOW())
            ON CONFLICT (key) DO UPDATE
                SET value      = EXCLUDED.value,
                    updated_at = NOW()
        """, (f"delta_last_file_{source}", filename))
        conn.commit()
        cursor.close()
    except Exception as e:
        print(f"   set_last_processed_delta erreur : {e}")

# STREAMING JSONL.GZ — download curl avec reprise automatique
def download_gz(url: str, tmp_path: str):
    """Remplace subprocess curl — pas de fork, pas de PID mismatch."""
    with requests.get(url, stream=True, timeout=1800, headers=HEADERS) as r:
        r.raise_for_status()
        with open(tmp_path, "wb") as f:
            for chunk in r.iter_content(chunk_size=256 * 1024):
                if chunk:
                    f.write(chunk)
                    
# Exception custom pour distinguer corruption gz vs autres erreurs
# Permet de décider si on doit re-télécharger ou juste abandonner
class GzCorruptError(Exception):
    pass

def stream_jsonl_gz(url: str):
    """
    Télécharge et parse un fichier JSONL.gz avec reprise partielle (Range header).
    
    CORRECTION : _parse_lines_from_file raise maintenant GzCorruptError
    si une corruption est détectée pendant la lecture du corps du fichier.
    Avant : l'erreur gz remontait comme Exception générique et le fichier
    cache corrompu restait dans /tmp → le retry suivant relisait le même
    fichier cassé sans re-télécharger.
    Après : process_delta_file catch GzCorruptError, supprime le cache,
    et force un re-téléchargement propre.
    """
    fname    = url.split("/")[-1]
    tmp_path = f"/tmp/{fname}"

    for attempt in range(MAX_RETRIES):
        try:
            headers     = dict(HEADERS)
            size_before = os.path.getsize(tmp_path) if os.path.exists(tmp_path) else 0
            if size_before > 0:
                headers["Range"] = f"bytes={size_before}-"
                mode = "ab"
            else:
                mode = "wb"

            print(f"      download attempt {attempt+1}/{MAX_RETRIES} "
                  f"(reprise depuis {size_before/1_048_576:.1f} MB)...")

            with requests.get(url, stream=True, timeout=1800, headers=headers) as r:
                if r.status_code == 416:
                    print(f"      ✓ Fichier déjà complet (416)")
                    break
                r.raise_for_status()
                with open(tmp_path, mode) as f:
                    for chunk in r.iter_content(chunk_size=256 * 1024):
                        if chunk:
                            f.write(chunk)

            size_after = os.path.getsize(tmp_path)
            print(f"      ✓ Download complet : {size_after/1_048_576:.1f} MB")
            break

        except Exception as e:
            print(f"      erreur attempt {attempt+1}: {e}")
            time.sleep(RETRY_WAIT_BASE * (attempt + 1))
    else:
        size = os.path.getsize(tmp_path) if os.path.exists(tmp_path) else 0
        if size < 1000:
            print(f"      Fichier vide après {MAX_RETRIES} tentatives → skip")
            return
        print(f"      Download incomplet ({size/1_048_576:.0f} MB) → lecture partielle")

    if not os.path.exists(tmp_path) or os.path.getsize(tmp_path) < 1000:
        return

    # Validation du header gz uniquement — ne détecte pas les corruptions
    # au milieu du fichier, mais évite de lancer le parsing sur un non-gz
    try:
        with gzip.open(tmp_path, "rb") as gz:
            gz.read(10)
    except Exception as e:
        print(f"      Fichier corrompu ({e}) → suppression et skip")
        os.remove(tmp_path)
        return

    def _parse_lines_from_file(path):
        with gzip.open(path, "rb") as gz:
            remainder = b""
            while True:
                try:
                    chunk = gz.read(GZ_READ_CHUNK_KB * 1024)
                except (OSError, EOFError, Exception) as e:
                    # CORRECTION : raise GzCorruptError au lieu de silencieusement
                    # stopper — permet à process_delta_file de savoir que c'est
                    # une corruption gz et de décider de re-télécharger
                    raise GzCorruptError(f"Corruption gz pendant lecture : {e}") from e
                if not chunk:
                    break
                block = remainder + chunk
                lines = block.split(b"\n")
                remainder = lines[-1]
                for raw_line in lines[:-1]:
                    raw_line = raw_line.strip()
                    if not raw_line:
                        continue
                    try:
                        yield orjson.loads(raw_line)
                    except Exception:
                        continue
            if remainder.strip():
                try:
                    yield orjson.loads(remainder.strip())
                except Exception:
                    pass

    yield from _parse_lines_from_file(tmp_path)

    try:
        os.remove(tmp_path)
    except Exception:
        pass

# MAPPING JSONL DELTA → row products_raw

def map_jsonl_item_to_row(
    item: dict,
    source: str,
    source_url: str,
    watermark_ts: Optional[int] = None,
) -> tuple[Optional[dict], str]:
    """
    Transforme un item JSONL (dict) en row prête pour products_raw.

    Retourne (row, reason) où reason indique pourquoi la row est None :
      - "ok"           : row valide
      - "no_code"      : code absent ou invalide
      - "watermark"    : last_modified_t <= watermark (déjà en base)
      - "no_timestamp" : last_modified_t ET created_t tous les deux absents/invalides

    [C1] Fallback sur created_t si last_modified_t est NULL
    [C2] Reason explicite pour chaque type de rejet
    """
    code = str(item.get("code", "")).strip()[:50]
    if not code or code == "None":
        return None, "no_code"

    lmt = item.get("last_modified_t")

    # Filtre watermark : on skip les records déjà vus
    if watermark_ts is not None and lmt is not None:
        try:
            if int(lmt) <= watermark_ts:
                return None, "watermark"
        except Exception:
            pass

    # [C1] updated_at : last_modified_t en priorité, created_t en fallback
    # Avant : si lmt=None → updated_at=None → rejet silencieux
    # Après  : on tente created_t, rejet seulement si les deux sont absents
    updated_at = normalize_updated_at(lmt)
    used_fallback = False
    if updated_at is None:
        fallback_ts = item.get("created_t")
        updated_at  = normalize_updated_at(fallback_ts)
        if updated_at is not None:
            used_fallback = True
        else:
            # Les deux timestamps sont absents → rejet
            return None, "no_timestamp"

    # Colonnes plates connues → flat, reste → extra_data JSONB
    flat  = {k: remove_nul(item[k]) for k in PRODUCTS_FLAT_COLS if k in item}
    extra = {
        k: remove_nul(v)
        for k, v in item.items()
        if k not in PRODUCTS_FLAT_COLS and v is not None
    }

    row = {
        **flat,
        "data_source": source,
        "updated_at":  updated_at,
        "extra_data":  extra if extra else None,
        "_source_url": source_url,
    }

    # [C2] Tag informatif dans _source_url pour tracer l'usage du fallback
    if used_fallback:
        row["_source_url"] = source_url + "_fallback_created_t"

    return row, "ok"

# INSERT products_raw

def inserer_products_flat(rows: list[dict], conn) -> int:
    """Insère une liste de rows dans products_raw. ON CONFLICT (code, updated_at) DO NOTHING — append-only, pas d'update."""
    if not rows:
        return 0

    cursor   = conn.cursor()
    cols_str = ", ".join(PRODUCTS_INSERT_COLS)
    sql      = f"""
        INSERT INTO products_raw ({cols_str})
        VALUES %s
        ON CONFLICT (code, updated_at) DO NOTHING"""
        
    tuples = []
    for row in rows:
        t = []
        for col in PRODUCTS_INSERT_COLS:
            val = row.get(col)
            if col == "extra_data" and isinstance(val, dict):
                val = psycopg2.extras.Json(remove_nul(val))
            else:
                val = clean_value(val)
            t.append(val)
        tuples.append(tuple(t))

    execute_values(cursor, sql, tuples, page_size=PRODUCTS_PAGE_SIZE_SQL)
    inserted = cursor.rowcount
    conn.commit()
    cursor.close()
    return inserted

# TRAITEMENT D'UN FICHIER DELTA

MAX_GZ_RETRIES = 3 

def process_delta_file(
    filename: str,
    base_url: str,
    source: str,
    conn,
    file_num: int,
    total_files: int,
    watermark_ts: Optional[int] = None,
) -> tuple[int, int]:
    """
    Traite un fichier delta JSONL.gz :
    1. Stream HTTP → map → batch → INSERT products_raw
    2. Marque le fichier comme traité dans pipeline_state (reprise)

    [C2] Compteurs explicites par type de rejet :
         - skipped_wm      : filtrés par watermark (déjà en base)
         - rejected_no_ts  : rejetés car lmt ET created_t absents
         - rejected_no_code: rejetés car code absent/invalide
         - fallback_count  : sauvés grâce au fallback created_t

    Retry avec re-téléchargement forcé sur GzCorruptError.
    Avant : une corruption gz en milieu de fichier causait un return immédiat,
    les rows après le point de corruption étaient perdues définitivement,
    et le fichier cache corrompu restait dans /tmp pour le retry suivant.
    Après : on catch GzCorruptError séparément, on supprime le cache /tmp,
    et on retente jusqu'à MAX_GZ_RETRIES fois avec un téléchargement propre.
    Les rows déjà insérées avant la corruption sont protégées par ON CONFLICT.
    """
    url        = base_url + filename
    source_url = f"delta_{source}_{filename}"

    print(f"   [{file_num}/{total_files}] {filename}")

    total_inserted   = 0
    total_rejected   = 0

    for gz_attempt in range(MAX_GZ_RETRIES):

        # Réinitialise les compteurs à chaque tentative — les rows déjà
        # insérées lors d'une tentative précédente seront ignorées proprement
        # par ON CONFLICT (code, updated_at) DO NOTHING
        inserted       = 0
        skipped_wm     = 0
        rejected_no_ts = 0
        rejected_no_code = 0
        fallback_count = 0
        batch          = []
        items_seen     = 0
        t_start        = time.time()

        if gz_attempt > 0:
            print(f"      [gz_retry {gz_attempt+1}/{MAX_GZ_RETRIES}] nouvelle tentative...")

        try:
            for item in stream_jsonl_gz(url):
                items_seen += 1

                row, reason = map_jsonl_item_to_row(
                    item, source, source_url, watermark_ts=watermark_ts
                )

                if row is None:
                    if reason == "watermark":
                        skipped_wm += 1
                    elif reason == "no_timestamp":
                        rejected_no_ts += 1
                    elif reason == "no_code":
                        rejected_no_code += 1
                    continue

                if row.get("_source_url", "").endswith("_fallback_created_t"):
                    fallback_count += 1

                batch.append(row)

                if len(batch) >= PRODUCTS_CHUNK_SIZE:
                    n         = inserer_products_flat(batch, conn)
                    inserted += n
                    print(f"      +{n} insérés dans products_raw (total fichier : {inserted:,})")
                    batch = []

            # Dernier batch résiduel
            if batch:
                n         = inserer_products_flat(batch, conn)
                inserted += n
                print(f"      +{n} insérés dans products_raw (dernier batch)")

            # Pas d'exception → fichier traité proprement, on sort du retry loop
            total_inserted = inserted
            total_rejected = rejected_no_ts + rejected_no_code
            break

        except GzCorruptError as e:
            # Corruption gz détectée pendant la lecture du corps du fichier
            # (ex: "Error -3 invalid block type", "Not a gzipped file")
            print(f"      Corruption gz attempt {gz_attempt+1}/{MAX_GZ_RETRIES}: {e}")

            # Sauve les rows du batch en cours avant de tout perdre
            if batch:
                try:
                    n         = inserer_products_flat(batch, conn)
                    inserted += n
                    print(f"      +{n} insérés (batch partiel de secours)")
                    batch = []
                except Exception as e2:
                    print(f"      Batch de secours échoué : {e2}")
                    conn.rollback()

            total_inserted += inserted  # accumule les inserts partiels des tentatives précédentes

            if gz_attempt < MAX_GZ_RETRIES - 1:
                # Supprime le fichier cache corrompu pour forcer un
                # re-téléchargement propre à la prochaine tentative.
                # Sans cette suppression, stream_jsonl_gz reprendrait
                # depuis le fichier corrompu déjà en /tmp via Range header.
                tmp_path = f"/tmp/{filename}"
                if os.path.exists(tmp_path):
                    os.remove(tmp_path)
                    print(f"      Cache /tmp supprimé → re-téléchargement au prochain attempt")
                time.sleep(10)
            else:
                # Toutes les tentatives épuisées — fichier définitivement
                # corrompu côté Open Food Facts, on passe au fichier suivant
                print(
                    f"      Fichier définitivement corrompu après {MAX_GZ_RETRIES} tentatives "
                    f"→ {total_inserted:,} rows récupérées, reste perdu"
                )
                total_rejected = rejected_no_ts + rejected_no_code

        except Exception as e:
            # Erreur non-gz (réseau, DB, timeout...) : comportement original
            # On ne re-télécharge pas, on sauve le batch partiel et on sort
            print(f"      Erreur fichier {filename}: {e}")
            print(f"      → Batch partiel sauvé si possible, fichier sera retenté")

            if batch:
                try:
                    n         = inserer_products_flat(batch, conn)
                    inserted += n
                    print(f"      +{n} insérés (batch partiel de secours)")
                except Exception as e2:
                    print(f"      Batch de secours échoué : {e2}")
                    conn.rollback()

            total_inserted = inserted
            total_rejected = rejected_no_ts + rejected_no_code
            # Pas de set_last_processed_delta ici → fichier sera retenté au prochain run
            return total_inserted, total_rejected

    elapsed = round(time.time() - t_start, 1)

    if items_seen == 0:
        print(f"      0 items reçus (403 / fichier expiré / vide) → marqué traité")
    else:
        print(
            f"      ✓ {total_inserted:,} insérés | "
            f"{skipped_wm:,} skip watermark | "
            f"{fallback_count:,} sauvés via fallback created_t | "
            f"{rejected_no_ts:,} rejetés (no_timestamp) | "
            f"{rejected_no_code:,} rejetés (no_code) | "
            f"{elapsed}s"
        )
        if rejected_no_ts > 0:
            pct_rejected = round(rejected_no_ts / items_seen * 100, 1)
            print(
                f"      INFO : {rejected_no_ts:,} produits sans last_modified_t ni created_t "
                f"({pct_rejected}% des items) — fiches incomplètes [{source}]"
            )

    # Marque le fichier comme traité seulement si on arrive ici
    # (pas de return anticipé sur erreur non-gz)
    set_last_processed_delta(source, filename, conn)
    return total_inserted, total_rejected

# TASK 2 : FETCH & INSERT DELTA PRODUCTS
def fetch_and_insert_delta_products(**context):
    """ Pour chaque source (food / beauty / other) :
    1. Calcule watermark = MAX(last_modified_t) - marge depuis products_raw
    2. Récupère l'index des fichiers delta disponibles
    3. Filtre les fichiers dont ts_fin > watermark
    4. Reprend depuis le dernier fichier traité (pipeline_state)
    5. Stream + map + INSERT products_raw via process_delta_file()"""
    start_time     = time.time()
    total_inserted = 0
    total_rejected = 0
    total_skipped  = 0
    status         = "failed"
    error_message  = None
    conn           = None
    try:
        conn   = get_db_connection()
        ensure_all_constraints(conn, targets=["products"])
        cursor = conn.cursor()
        cursor.execute("SET synchronous_commit = off")
        cursor.execute("SET work_mem = '64MB'")
        conn.commit()
        cursor.close()

        for source, index_url in DELTA_SOURCES.items():
            print(f"\n{'─' * 60}")
            print(f" SOURCE : {source.upper()}")
            print(f"{'─' * 60}")

            # [C3] Watermark avec marge de sécurité (log inclus dans get_max_last_modified)
            watermark_ts = get_max_last_modified(source)
            if watermark_ts is None:
                print(" Watermark : None (source vide en base)")

            all_files = fetch_index(index_url)
            print(f" Fichiers dans l'index       : {len(all_files)}")

            to_process = filter_delta_files(all_files, watermark_ts)
            skipped_wm = len(all_files) - len(to_process)
            total_skipped += skipped_wm
            print(f" Après filtre watermark      : {len(to_process)} fichiers (skip={skipped_wm})")

            if not to_process:
                print(f" Aucun nouveau fichier delta pour {source} → skip")
                set_last_processed_delta(source, "", conn)
                continue

            last_done = get_last_processed_delta(source)
            if last_done and last_done in to_process:
                resume_idx     = to_process.index(last_done) + 1
                total_skipped += resume_idx
                to_process     = to_process[resume_idx:]
                print(f" Reprise après               : {last_done}")
                print(f" Fichiers restants           : {len(to_process)}")
            else:
                print(f" Pas de reprise en cours")

            if not to_process:
                print(f" Déjà tout traité pour {source} → skip")
                continue

            base_url   = DELTA_BASE_URLS[source]
            src_insert = 0
            src_reject = 0
            n_total    = len(to_process)

            for i, fname in enumerate(to_process, start=1):
                n_ins, n_rej = process_delta_file(
                    fname, base_url, source, conn,
                    file_num=i, total_files=n_total,
                    watermark_ts=watermark_ts,
                )
                src_insert += n_ins
                src_reject += n_rej

            set_last_processed_delta(source, "", conn)
            total_inserted += src_insert
            total_rejected += src_reject
            print(f"\n {source.upper()} terminé : +{src_insert:,} insérés | {src_reject:,} rejetés")

        conn.close()
        status = "success"
        print(
            f"\n DELTA PRODUCTS : "
            f"+{total_inserted:,} insérés | "
            f"{total_rejected:,} rejetés | "
            f"{total_skipped} skip watermark"
        )

    except Exception as e:
        error_message = str(e)
        print(f" Erreur : {e}")
        if conn:
            try: conn.rollback(); conn.close()
            except: pass
        raise
        
def daily_currency(**context):
    logging.info("Début de daily_currency")
    conn = get_db_connection()
    cur = conn.cursor()

    try:

        # API call CurrencyFreaks
        response = requests.get(CURRENCY_API_URL, timeout=10)
        response.raise_for_status()

        data = response.json()

        rates = data.get("rates", {})
        base = data.get("base", "USD")

        usd_to_eur = float(rates.get("EUR"))

        today = datetime.utcnow().date()
        exchange_rows = []

        for currency, rate in rates.items():
            rate = float(rate)

            # conversion usd to eur
            rate_to_eur = rate / usd_to_eur

            exchange_rows.append((
                today,
                currency.upper(),
                rate_to_eur,
                "CurrencyFreaks",
                "daily"
            ))

        # déduplication
        exchange_dict = {}
        for row in exchange_rows:
            key = (row[0], row[1])
            exchange_dict[key] = row

        exchange_rows = list(exchange_dict.values())

        # insert
        if exchange_rows:
            execute_values(cur, """
                INSERT INTO exchange_rates_raw
                (rate_date, currency, rate_to_eur, source, frequency)
                VALUES %s
                ON CONFLICT (rate_date, currency) DO UPDATE
                SET rate_to_eur = EXCLUDED.rate_to_eur,
                    source = EXCLUDED.source,
                    frequency = EXCLUDED.frequency
            """, exchange_rows)

            conn.commit()
            logging.info(f"{len(exchange_rows)} taux insérés avec CurrencyFreaks")

    except Exception:
        logging.exception("Erreur dans daily_currency")

    finally:
        cur.close()
        conn.close()
        logging.info("Connexion DB fermée")

# Airflow alias
def update_currency_daily(**kwargs):
    return daily_currency(**kwargs)