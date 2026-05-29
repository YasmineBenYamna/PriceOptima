import gzip
import math
import time
import requests
import numpy as np
import pandas as pd
import os
import orjson
import psycopg2.extras
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional
from psycopg2.extras import execute_values
from psycopg2.extensions import ISOLATION_LEVEL_DEFAULT

from utils.common import (
    get_db_connection,
    PRICES_COLUMNS,
    PRICES_INT_COLS,
    PRICES_NUMERIC_COLS,
    PRICES_BOOL_COLS,
    PRICES_DATE_COLS,
    PRICES_TS_COLS,
    PRODUCTS_FLAT_COLS,
    PRODUCTS_INSERT_COLS,
)

# ── CONFIGURATION ──────────────────────────────────────────────────────────────

CURRENCY_API_URL = "https://api.currencyfreaks.com/latest?apikey=5b6c4d670a024678b965bfe7b5f45a0d"

HEADERS         = {"User-Agent": "Mozilla/5.0 (compatible; OpenPricesPipeline/1.0; +https://github.com/openfoodfacts)"}
MAX_RETRIES     = 10
RETRY_WAIT_BASE = 10

API_URL             = "https://prices.openfoodfacts.org/api/v1/prices"
PAGE_SIZE           = 100
INSERT_EVERY        = 20
WATERMARK_DELTA_MIN = 60
MAX_EMPTY_BATCHES   = 3
MAX_GZ_RETRIES      = 3
GZ_READ_CHUNK_KB    = 256

PRODUCTS_CHUNK_SIZE          = 5_000
PRODUCTS_PAGE_SIZE_SQL       = 2_000
WATERMARK_DELTA_PRODUCTS_SEC = 300

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

# ── UTILITAIRES COMMUNS ────────────────────────────────────────────────────────

def remove_nul(val):
    """Supprime les caractères NUL (\x00) qui cassent PostgreSQL."""
    if isinstance(val, str):  return val.replace("\x00", "")
    if isinstance(val, list): return [remove_nul(v) for v in val]
    if isinstance(val, dict): return {k: remove_nul(v) for k, v in val.items()}
    return val

def clean_value(val):
    """Normalise les types numpy/pandas pour psycopg2."""
    if val is None:
        return None
    try:
        if pd.isna(val):
            return None
    except (TypeError, ValueError):
        pass
    if isinstance(val, str):
        val = val.replace("\x00", "")
        return None if val.strip() == "" else val
    if isinstance(val, dict):
        return orjson.dumps(remove_nul(val)).decode("utf-8")
    if isinstance(val, list):
        cleaned = [remove_nul(v) for v in val]
        return orjson.dumps(cleaned).decode("utf-8") if any(isinstance(i, dict) for i in cleaned) else (str(cleaned) or None)
    if isinstance(val, np.integer):   return int(val)
    if isinstance(val, np.floating):  return None if np.isnan(val) else float(val)
    if isinstance(val, np.bool_):     return bool(val)
    if isinstance(val, pd.Timestamp): return val.to_pydatetime()
    return val

def normalize_updated_at(ts_unix) -> Optional[datetime]:
    """
    Convertit un timestamp Unix (int/float) en datetime UTC.
    Les valeurs manquantes PyArrow arrivent comme float('nan'), pas None.
    """
    try:
        if ts_unix is None or (isinstance(ts_unix, float) and math.isnan(ts_unix)):
            return None
        return datetime.fromtimestamp(int(ts_unix), tz=timezone.utc)
    except Exception:
        return None

# ── UTILITAIRES DB ─────────────────────────────────────────────────────────────

def pipeline_state_get(key: str) -> Optional[str]:
    """Lit une valeur dans pipeline_state. Retourne None si absente."""
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("SELECT value FROM pipeline_state WHERE key = %s", (key,))
            row = cur.fetchone()
        conn.close()
        return row[0] if row else None
    except Exception:
        return None

def pipeline_state_set(key: str, value: str, conn=None):
    """
    Upsert dans pipeline_state.
    Si conn est fourni, utilise la connexion existante (pas de close).
    Sinon ouvre et ferme sa propre connexion.
    """
    close = conn is None
    if close:
        conn = get_db_connection()
    try:
        conn.rollback()  # reset défensif contre InFailedSqlTransaction
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO pipeline_state (key, value, updated_at) VALUES (%s, %s, NOW())
                ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
            """, (key, value))
        conn.commit()
    except Exception as e:
        print(f"pipeline_state_set({key}) erreur : {e}")
        conn.rollback()
    finally:
        if close:
            conn.close()

def ensure_all_constraints(conn, targets=None):
    """Vérifie et crée/reconstruit les index uniques si nécessaire."""
    CONSTRAINTS = {
        "prices":   ("prices_raw_id_updated_uidx",      "CREATE UNIQUE INDEX IF NOT EXISTS prices_raw_id_updated_uidx ON prices_raw (id, updated)"),
        "products": ("products_raw_code_updatedat_uidx", "CREATE UNIQUE INDEX IF NOT EXISTS products_raw_code_updatedat_uidx ON products_raw (code, updated_at)"),
    }
    for target in (targets or list(CONSTRAINTS)):
        name, ddl = CONSTRAINTS[target]
        conn.rollback()
        with conn.cursor() as cur:
            cur.execute("""
                SELECT indisvalid FROM pg_index
                JOIN pg_class ON pg_class.oid = pg_index.indexrelid
                WHERE relname = %s
            """, (name,))
            row = cur.fetchone()

        if row is None:
            print(f"Index {name} absent → création...")
            action = "creation"
        elif not row[0]:
            print(f"Index {name} INVALID → reconstruction...")
            action = "reconstruction"
        else:
            print(f"Index {name} présent et valide ✓")
            continue

        conn.rollback()
        conn.set_isolation_level(0)
        with conn.cursor() as cur:
            if action == "reconstruction":
                cur.execute(f"DROP INDEX IF EXISTS {name}")
            cur.execute(ddl)
        conn.set_isolation_level(ISOLATION_LEVEL_DEFAULT)
        print(f"Index {name} ok ✓")

def _open_db_session(targets=None):
    """Ouvre une connexion, vérifie les contraintes, applique les pragmas perf."""
    conn = get_db_connection()
    ensure_all_constraints(conn, targets=targets)
    with conn.cursor() as cur:
        cur.execute("SET synchronous_commit = off")
        cur.execute("SET work_mem = '64MB'")
    conn.commit()
    return conn

# ── UTILITAIRES PRICES ─────────────────────────────────────────────────────────

def parse_timestamp(ts) -> Optional[datetime]:
    """
    Convertit un timestamp ISO 8601 (str) en datetime UTC.
    Différence avec normalize_updated_at() : celle-ci traite les timestamps Unix (int/float),
    parse_timestamp() traite les timestamps texte ISO 8601 ("2024-03-15T10:30:00Z").
    """
    if not ts:
        return None
    # Python < 3.11 ne reconnaît pas "Z" dans fromisoformat() → on remplace par "+00:00"
    dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)

def parse_date(val) -> Optional[str]:
    """
    Extrait la partie date (YYYY-MM-DD). Retourne une str pour les colonnes DATE PostgreSQL.
    Différence avec parse_timestamp : retourne "2024-03-15" et non un datetime.
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
        if col in PRICES_BOOL_COLS:    return val if isinstance(val, bool) else str(val).lower() in ("true", "1", "yes")
        if col in PRICES_DATE_COLS:    return parse_date(val)
        if col in PRICES_TS_COLS:      return parse_timestamp(val)
    except Exception:
        return None
    return val

# Résumé prices — get/set via pipeline_state générique
def get_resume_page() -> int:
    return int(pipeline_state_get("prices_resume_page") or 1)

def set_resume_page(page: int, conn=None):
    pipeline_state_set("prices_resume_page", str(page), conn)

def get_persisted_watermark_prices() -> Optional[datetime]:
    """
    Retourne le watermark prices sauvegardé dans pipeline_state.
    Permet de détecter si MAX(created) n'a pas avancé depuis le dernier run
    (run précédent échoué avant tout INSERT) → reset resume_page à 1.
    """
    val = pipeline_state_get("prices_last_watermark")
    return datetime.fromisoformat(val) if val else None

def set_persisted_watermark_prices(watermark: datetime, conn):
    pipeline_state_set("prices_last_watermark", watermark.isoformat(), conn)

def get_last_created() -> Optional[datetime]:
    conn = get_db_connection()
    with conn.cursor() as cur:
        cur.execute("SELECT MAX(created) FROM prices_raw WHERE created IS NOT NULL")
        result = cur.fetchone()[0]
    conn.close()
    return result

# ── MAPPING API → prices_raw ───────────────────────────────────────────────────

# Champs copiés directement depuis la racine de l'objet API
_PRICE_DIRECT_FIELDS = [
    "id", "type", "product_code", "product_name", "category_tag",
    "labels_tags", "origins_tags", "price", "price_is_discounted",
    "price_without_discount", "discount_type", "price_per", "currency",
    "date", "receipt_quantity", "owner", "source", "created", "updated",
    "duplicate_of", "owner_comment", "tags", "product_id",
]

# Sous-objets imbriqués : (clé_api, préfixe_colonne, champs)
_PRICE_NESTED = [
    ("location", "location_", [
        "id", "type", "osm_id", "osm_type", "osm_name", "osm_display_name",
        "osm_tag_key", "osm_tag_value", "osm_brand", "osm_address_postcode",
        "osm_address_city", "osm_address_country", "osm_address_country_code",
        "osm_lat", "osm_lon", "osm_version", "website_url",
        "price_count", "source", "created", "updated",
    ]),
    ("proof", "proof_", [
        "id", "file_path", "mimetype", "type", "date", "currency",
        "receipt_price_count", "receipt_price_total", "receipt_online_delivery_costs",
        "ready_for_price_tag_validation", "owner_consumption", "owner",
        "source", "created", "updated", "image_md5_hash", "image_thumb_path",
        "prediction_count",
    ]),
]

def flatten_api_record(rec: dict) -> dict:
    row = {f: rec.get(f) for f in _PRICE_DIRECT_FIELDS}
    for api_key, prefix, fields in _PRICE_NESTED:
        obj = rec.get(api_key) or {}
        for f in fields:
            row[f"{prefix}{f}"] = obj.get(f)
    # fallback osm_id/osm_type depuis la racine si absent dans location
    row["location_osm_id"]   = row["location_osm_id"]   or rec.get("location_osm_id")
    row["location_osm_type"] = row["location_osm_type"] or rec.get("location_osm_type")
    row["_source_url"] = "api_daily"
    return row

def map_api_record(rec: dict) -> Optional[dict]:
    if rec.get("id") is None:
        return None
    try:
        return flatten_api_record(rec)
    except Exception as e:
        print(f"   Mapping échoué id={rec.get('id')}: {e}")
        return None

# ── INSERT ─────────────────────────────────────────────────────────────────────

def inserer_prices_flat(rows: list[dict], conn) -> int:
    if not rows:
        return 0
    cols_str = ", ".join(PRICES_COLUMNS)
    tuples   = [tuple(cast_price_value(r.get(c), c) for c in PRICES_COLUMNS) for r in rows]
    with conn.cursor() as cur:
        execute_values(cur,
            f"INSERT INTO prices_raw ({cols_str}) VALUES %s ON CONFLICT (id, updated) DO NOTHING",
            tuples, page_size=2000)
        inserted = cur.rowcount
    conn.commit()
    return inserted

def inserer_products_flat(rows: list[dict], conn) -> int:
    """Append-only — ON CONFLICT (code, updated_at) DO NOTHING."""
    if not rows:
        return 0
    cols_str = ", ".join(PRODUCTS_INSERT_COLS)
    tuples = []
    for row in rows:
        t = []
        for col in PRODUCTS_INSERT_COLS:
            val = row.get(col)
            t.append(
                psycopg2.extras.Json(remove_nul(val)) if col == "extra_data" and isinstance(val, dict)
                else clean_value(val)
            )
        tuples.append(tuple(t))
    with conn.cursor() as cur:
        execute_values(cur,
            f"INSERT INTO products_raw ({cols_str}) VALUES %s ON CONFLICT (code, updated_at) DO NOTHING",
            tuples, page_size=PRODUCTS_PAGE_SIZE_SQL)
        inserted = cur.rowcount
    conn.commit()
    return inserted

def _flush_batch(batch: list, conn) -> int:
    """Insère le batch courant et le vide. Retourne le nombre d'insérés."""
    if not batch:
        return 0
    n = inserer_products_flat(batch, conn)
    batch.clear()
    return n

# ── FETCH ──────────────────────────────────────────────────────────────────────

def fetch_page(params: dict) -> Optional[dict]:
    for attempt in range(MAX_RETRIES):
        try:
            r = requests.get(API_URL, params=params, timeout=30, headers=HEADERS)
            r.raise_for_status()
            return r.json()
        except Exception as e:
            wait = RETRY_WAIT_BASE * (attempt + 1)
            print(f"   Retry {attempt+1}/{MAX_RETRIES} ({wait}s): {e}")
            if attempt < MAX_RETRIES - 1:
                time.sleep(wait)
    return None

def fetch_index(index_url: str) -> list[str]:
    for attempt in range(MAX_RETRIES):
        try:
            resp = requests.get(index_url, timeout=30, headers=HEADERS)
            resp.raise_for_status()
            return sorted(l.strip() for l in resp.text.splitlines() if l.strip().endswith(".json.gz"))
        except Exception as e:
            wait = RETRY_WAIT_BASE * (attempt + 1)
            print(f"   fetch_index retry {attempt+1}/{MAX_RETRIES} ({wait}s): {e}")
            if attempt < MAX_RETRIES - 1:
                time.sleep(wait)
    raise Exception(f"Impossible de récupérer l'index : {index_url}")

# ── WATERMARK PRODUCTS ─────────────────────────────────────────────────────────

def get_max_last_modified(source: str) -> Optional[int]:
    """
    Retourne MAX(last_modified_t) - marge de sécurité pour la source donnée.
    [C3] La marge capture les items en bordure de fenêtre temporelle.
    """
    conn = get_db_connection()
    with conn.cursor() as cur:
        cur.execute("""
            SELECT MAX(last_modified_t) FROM products_raw
            WHERE data_source = %s AND last_modified_t IS NOT NULL
        """, (source,))
        row = cur.fetchone()
    conn.close()
    val = row[0] if row else None
    if val is None:
        return None
    raw_ts = int(val.timestamp()) if isinstance(val, datetime) else int(float(val))
    wm_ts  = raw_ts - WATERMARK_DELTA_PRODUCTS_SEC
    print(f"   Watermark products [{source}] : {datetime.fromtimestamp(wm_ts, tz=timezone.utc)} "
          f"(MAX={datetime.fromtimestamp(raw_ts, tz=timezone.utc)}, marge={WATERMARK_DELTA_PRODUCTS_SEC}s)")
    return wm_ts

def parse_timestamps_from_filename(filename: str) -> tuple[Optional[int], Optional[int]]:
    try:
        parts = filename.replace(".json.gz", "").split("_")
        return int(parts[-2]), int(parts[-1])
    except Exception:
        return None, None

def filter_delta_files(files: list[str], watermark_ts: Optional[int]) -> list[str]:
    if watermark_ts is None:
        print("   Watermark None → tous les fichiers retenus")
        return files
    return [f for f in files
            if (lambda _, ts: ts is not None and ts > watermark_ts)(*parse_timestamps_from_filename(f))]

# Reprise delta — get/set via pipeline_state générique
def get_last_processed_delta(source: str) -> Optional[str]:
    return pipeline_state_get(f"delta_last_file_{source}")

def set_last_processed_delta(source: str, filename: str, conn):
    pipeline_state_set(f"delta_last_file_{source}", filename, conn)

# ── STREAMING JSONL.GZ ─────────────────────────────────────────────────────────

def download_gz(url: str, tmp_path: str):
    """Téléchargement simple (sans reprise). Remplace subprocess curl."""
    with requests.get(url, stream=True, timeout=1800, headers=HEADERS) as r:
        r.raise_for_status()
        with open(tmp_path, "wb") as f:
            for chunk in r.iter_content(chunk_size=256 * 1024):
                if chunk:
                    f.write(chunk)

class GzCorruptError(Exception):
    """Corruption gz détectée pendant la lecture du corps du fichier.
    Distingue la corruption des autres erreurs (réseau, DB) pour décider
    si on doit re-télécharger ou juste abandonner."""
    pass

def stream_jsonl_gz(url: str):
    """
    Télécharge et parse un fichier JSONL.gz avec reprise partielle (Range header).
    Raise GzCorruptError si une corruption est détectée en cours de lecture,
    ce qui permet à process_delta_file de supprimer le cache /tmp et re-télécharger.
    """
    fname    = url.split("/")[-1]
    tmp_path = f"/tmp/{fname}"

    for attempt in range(MAX_RETRIES):
        try:
            size_before = os.path.getsize(tmp_path) if os.path.exists(tmp_path) else 0
            headers = dict(HEADERS)
            if size_before > 0:
                headers["Range"] = f"bytes={size_before}-"
                mode = "ab"
            else:
                mode = "wb"

            print(f"      download attempt {attempt+1}/{MAX_RETRIES} "
                  f"(reprise depuis {size_before/1_048_576:.1f} MB)...")

            with requests.get(url, stream=True, timeout=1800, headers=headers) as r:
                if r.status_code == 416:
                    print("      ✓ Fichier déjà complet (416)")
                    break
                r.raise_for_status()
                with open(tmp_path, mode) as f:
                    for chunk in r.iter_content(chunk_size=256 * 1024):
                        if chunk:
                            f.write(chunk)

            print(f"      ✓ Download complet : {os.path.getsize(tmp_path)/1_048_576:.1f} MB")
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

    # Validation header gz — évite de parser un fichier non-gz
    # (ne détecte pas les corruptions au milieu du fichier)
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
                except Exception as e:
                    # Raise GzCorruptError pour que process_delta_file puisse
                    # supprimer le cache et forcer un re-téléchargement propre
                    raise GzCorruptError(f"Corruption gz pendant lecture : {e}") from e
                if not chunk:
                    break
                lines     = (remainder + chunk).split(b"\n")
                remainder = lines[-1]
                for raw_line in lines[:-1]:
                    raw_line = raw_line.strip()
                    if raw_line:
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

# ── MAPPING JSONL DELTA → products_raw ────────────────────────────────────────

def map_jsonl_item_to_row(
    item: dict,
    source: str,
    source_url: str,
    watermark_ts: Optional[int] = None,
) -> tuple[Optional[dict], str]:
    """
    Transforme un item JSONL en row pour products_raw.
    Retourne (row, reason) :
      "ok"           → row valide
      "no_code"      → code absent ou invalide
      "watermark"    → last_modified_t <= watermark (déjà en base)
      "no_timestamp" → last_modified_t ET created_t absents

    [C1] Fallback sur created_t si last_modified_t est NULL
    [C2] Reason explicite pour chaque type de rejet
    """
    code = str(item.get("code", "")).strip()[:50]
    if not code or code == "None":
        return None, "no_code"

    lmt = item.get("last_modified_t")

    # Filtre watermark — skip les records déjà vus
    if watermark_ts is not None and lmt is not None:
        try:
            if int(lmt) <= watermark_ts:
                return None, "watermark"
        except Exception:
            pass

    # [C1] updated_at : last_modified_t en priorité, created_t en fallback
    updated_at    = normalize_updated_at(lmt)
    used_fallback = False
    if updated_at is None:
        updated_at = normalize_updated_at(item.get("created_t"))
        if updated_at is None:
            return None, "no_timestamp"
        used_fallback = True

    flat  = {k: remove_nul(item[k]) for k in PRODUCTS_FLAT_COLS if k in item}
    extra = {k: remove_nul(v) for k, v in item.items() if k not in PRODUCTS_FLAT_COLS and v is not None}

    row = {
        **flat,
        "data_source": source,
        "updated_at":  updated_at,
        "extra_data":  extra if extra else None,
        # [C2] Tag pour tracer l'usage du fallback created_t
        "_source_url": source_url + ("_fallback_created_t" if used_fallback else ""),
    }
    return row, "ok"

# ── TRAITEMENT D'UN FICHIER DELTA ──────────────────────────────────────────────

def _save_batch_on_error(batch: list, conn) -> int:
    """Tente d'insérer le batch partiel en cas d'erreur. Rollback si échec."""
    if not batch:
        return 0
    try:
        n = inserer_products_flat(batch, conn)
        print(f"      +{n} insérés (batch partiel de secours)")
        batch.clear()
        return n
    except Exception as e2:
        print(f"      Batch de secours échoué : {e2}")
        conn.rollback()
        return 0

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
    2. Marque le fichier comme traité dans pipeline_state

    [C2] Compteurs explicites : skipped_wm, rejected_no_ts, rejected_no_code, fallback_count

    Retry avec re-téléchargement forcé sur GzCorruptError :
    - Catch GzCorruptError → supprime cache /tmp → re-télécharge proprement
    - Les rows déjà insérées sont protégées par ON CONFLICT DO NOTHING
    - Erreurs non-gz (réseau, DB) → sauvegarde batch partiel → return sans marquer traité
      (le fichier sera retenté au prochain run)
    """
    url        = base_url + filename
    source_url = f"delta_{source}_{filename}"
    print(f"   [{file_num}/{total_files}] {filename}")

    total_inserted = 0
    total_rejected = 0
    # Ces variables doivent être accessibles après la boucle for gz_attempt
    items_seen = skipped_wm = fallback_count = rejected_no_ts = rejected_no_code = 0
    t_start    = time.time()

    for gz_attempt in range(MAX_GZ_RETRIES):
        # Réinitialise les compteurs à chaque tentative
        # Les rows déjà insérées seront ignorées proprement par ON CONFLICT
        inserted         = 0
        skipped_wm       = 0
        rejected_no_ts   = 0
        rejected_no_code = 0
        fallback_count   = 0
        items_seen       = 0
        batch            = []
        t_start          = time.time()

        if gz_attempt > 0:
            print(f"      [gz_retry {gz_attempt+1}/{MAX_GZ_RETRIES}] nouvelle tentative...")

        try:
            for item in stream_jsonl_gz(url):
                items_seen += 1
                row, reason = map_jsonl_item_to_row(item, source, source_url, watermark_ts=watermark_ts)

                if row is None:
                    if   reason == "watermark":    skipped_wm       += 1
                    elif reason == "no_timestamp": rejected_no_ts   += 1
                    elif reason == "no_code":      rejected_no_code += 1
                    continue

                if row.get("_source_url", "").endswith("_fallback_created_t"):
                    fallback_count += 1

                batch.append(row)
                if len(batch) >= PRODUCTS_CHUNK_SIZE:
                    n = _flush_batch(batch, conn)
                    inserted += n
                    print(f"      +{n} insérés dans products_raw (total fichier : {inserted:,})")

            # Dernier batch résiduel
            if batch:
                n = _flush_batch(batch, conn)
                inserted += n
                print(f"      +{n} insérés dans products_raw (dernier batch)")

            total_inserted = inserted
            total_rejected = rejected_no_ts + rejected_no_code
            break  # succès — sort du retry loop

        except GzCorruptError as e:
            print(f"      Corruption gz attempt {gz_attempt+1}/{MAX_GZ_RETRIES}: {e}")
            total_inserted += _save_batch_on_error(batch, conn)

            if gz_attempt < MAX_GZ_RETRIES - 1:
                # Supprime le cache corrompu pour forcer un re-téléchargement propre.
                # Sans ça, stream_jsonl_gz reprendrait depuis le fichier cassé via Range header.
                tmp_path = f"/tmp/{filename}"
                if os.path.exists(tmp_path):
                    os.remove(tmp_path)
                    print("      Cache /tmp supprimé → re-téléchargement au prochain attempt")
                time.sleep(10)
            else:
                print(f"      Fichier définitivement corrompu après {MAX_GZ_RETRIES} tentatives "
                      f"→ {total_inserted:,} rows récupérées, reste perdu")
                total_rejected = rejected_no_ts + rejected_no_code

        except Exception as e:
            # Erreur non-gz (réseau, DB, timeout) — pas de re-téléchargement
            print(f"      Erreur fichier {filename}: {e}")
            print(f"      → Batch partiel sauvé si possible, fichier sera retenté")
            total_inserted = inserted + _save_batch_on_error(batch, conn)
            total_rejected = rejected_no_ts + rejected_no_code
            # Pas de set_last_processed_delta → fichier retenté au prochain run
            return total_inserted, total_rejected

    elapsed = round(time.time() - t_start, 1)
    if items_seen == 0:
        print("      0 items reçus (403 / fichier expiré / vide) → marqué traité")
    else:
        print(f"      ✓ {total_inserted:,} insérés | {skipped_wm:,} skip watermark | "
              f"{fallback_count:,} sauvés via fallback created_t | "
              f"{rejected_no_ts:,} rejetés (no_timestamp) | "
              f"{rejected_no_code:,} rejetés (no_code) | {elapsed}s")
        if rejected_no_ts > 0:
            print(f"      INFO : {rejected_no_ts:,} produits sans last_modified_t ni created_t "
                  f"({rejected_no_ts/items_seen*100:.1f}% des items) — fiches incomplètes [{source}]")

    # Marque traité seulement si on arrive ici (pas de return anticipé sur erreur non-gz)
    set_last_processed_delta(source, filename, conn)
    return total_inserted, total_rejected

# ── TASK 1 : FETCH & INSERT PRICES ────────────────────────────────────────────

def fetch_and_insert_prices(**context):
    rows_inserted = rows_ignored = rows_rejected = consecutive_empty = 0
    conn = None
    try:
        last_created = get_last_created()
        if last_created is None:
            raise Exception("prices_raw vide — lancer pipeline_seed d'abord")
        if last_created.tzinfo is None:
            last_created = last_created.replace(tzinfo=timezone.utc)

        watermark    = last_created - timedelta(minutes=WATERMARK_DELTA_MIN)
        persisted_wm = get_persisted_watermark_prices()
        resume_page  = get_resume_page()

        print(f" Watermark (created__gte) : {watermark}")
        print(f"   MAX(created) en base   : {last_created}")

        if persisted_wm is not None:
            if persisted_wm.tzinfo is None:
                persisted_wm = persisted_wm.replace(tzinfo=timezone.utc)
            if watermark <= persisted_wm and resume_page > 1:
                # [C4] Watermark identique = run précédent échoué avant INSERT → reset page
                print(f" [C4] Watermark identique au run précédent ({persisted_wm}) "
                      f"et resume_page={resume_page} → reset à page 1 "
                      f"(run précédent probablement échoué avant INSERT)")
                resume_page = 1
            else:
                print(f" Page de reprise : {resume_page}")
        else:
            print(f" Page de reprise : {resume_page} (premier run)")

        conn = _open_db_session(targets=["prices"])
        set_persisted_watermark_prices(watermark, conn)

        params = {
            "created__gte": watermark.strftime("%Y-%m-%dT%H:%M:%S"),
            "size":         PAGE_SIZE,
            "page":         resume_page,
            "order_by":     "-created",
        }
        total_pages = None
        batch, pages_since_insert = [], 0

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
                    conn.close()
                    return

            current_page = params["page"]
            is_last      = current_page >= total_pages

            for item in data["items"]:
                for sub in (item if isinstance(item, list) else [item]):
                    row = map_api_record(sub)
                    if row: batch.append(row)
                    else:   rows_rejected += 1

            print(f" Page {current_page}/{total_pages} | batch={len(batch)}")
            pages_since_insert += 1

            if pages_since_insert >= INSERT_EVERY or is_last:
                if batch:
                    n = inserer_prices_flat(batch, conn)
                    rows_inserted += n
                    rows_ignored  += len(batch) - n
                    consecutive_empty = 0
                    print(f"    +{n} insérés | {len(batch)-n} doublons ignorés")
                    batch = []
                else:
                    consecutive_empty += 1
                    print(f"     batch vide ({consecutive_empty}/{MAX_EMPTY_BATCHES})")
                    if consecutive_empty >= MAX_EMPTY_BATCHES:
                        set_resume_page(1, conn)
                        break
                pages_since_insert = 0
                set_resume_page(current_page + 1, conn)

            if is_last:
                set_resume_page(1, conn)
                break
            params["page"] += 1

        conn.close()
        print(f"\n PRICES DAILY : +{rows_inserted:,} insérés | {rows_ignored:,} doublons | {rows_rejected:,} rejetés")

    except Exception as e:
        print(f" Erreur : {e}")
        if conn:
            try: conn.rollback(); conn.close()
            except: pass
        raise

# ── TASK 2 : FETCH & INSERT DELTA PRODUCTS ────────────────────────────────────

def fetch_and_insert_delta_products(**context):
    """
    Pour chaque source (food / beauty / other) :
    1. Calcule watermark = MAX(last_modified_t) - marge depuis products_raw
    2. Récupère l'index des fichiers delta disponibles
    3. Filtre les fichiers dont ts_fin > watermark
    4. Reprend depuis le dernier fichier traité (pipeline_state)
    5. Stream + map + INSERT products_raw via process_delta_file()
    """
    total_inserted = total_rejected = total_skipped = 0
    conn = None
    try:
        conn = _open_db_session(targets=["products"])

        for source, index_url in DELTA_SOURCES.items():
            print(f"\n{'─' * 60}\n SOURCE : {source.upper()}\n{'─' * 60}")

            watermark_ts = get_max_last_modified(source)
            if watermark_ts is None:
                print(" Watermark : None (source vide en base)")

            all_files  = fetch_index(index_url)
            to_process = filter_delta_files(all_files, watermark_ts)
            skipped_wm = len(all_files) - len(to_process)
            total_skipped += skipped_wm
            print(f" Fichiers dans l'index       : {len(all_files)}")
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
                print(" Pas de reprise en cours")

            if not to_process:
                print(f" Déjà tout traité pour {source} → skip")
                continue

            base_url = DELTA_BASE_URLS[source]
            src_insert = src_reject = 0
            for i, fname in enumerate(to_process, start=1):
                n_ins, n_rej = process_delta_file(
                    fname, base_url, source, conn,
                    file_num=i, total_files=len(to_process),
                    watermark_ts=watermark_ts,
                )
                src_insert += n_ins
                src_reject += n_rej

            set_last_processed_delta(source, "", conn)
            total_inserted += src_insert
            total_rejected += src_reject
            print(f"\n {source.upper()} terminé : +{src_insert:,} insérés | {src_reject:,} rejetés")

        conn.close()
        print(f"\n DELTA PRODUCTS : +{total_inserted:,} insérés | "
              f"{total_rejected:,} rejetés | {total_skipped} skip watermark")

    except Exception as e:
        print(f" Erreur : {e}")
        if conn:
            try: conn.rollback(); conn.close()
            except: pass
        raise

# ── TASK 3 : CURRENCY ─────────────────────────────────────────────────────────

def daily_currency(**context):
    logging.info("Début de daily_currency")
    conn = get_db_connection()
    cur  = conn.cursor()
    try:
        data       = requests.get(CURRENCY_API_URL, timeout=10).json()
        rates      = data.get("rates", {})
        usd_to_eur = float(rates["EUR"])
        today      = datetime.utcnow().date()

        # Construction + déduplication en une passe via dict
        rows = list({
            (today, currency.upper()): (today, currency.upper(), float(rate) / usd_to_eur, "CurrencyFreaks", "daily")
            for currency, rate in rates.items()
        }.values())

        if rows:
            execute_values(cur, """
                INSERT INTO exchange_rates_raw (rate_date, currency, rate_to_eur, source, frequency)
                VALUES %s
                ON CONFLICT (rate_date, currency) DO UPDATE
                SET rate_to_eur = EXCLUDED.rate_to_eur,
                    source      = EXCLUDED.source,
                    frequency   = EXCLUDED.frequency
            """, rows)
            conn.commit()
            logging.info(f"{len(rows)} taux insérés avec CurrencyFreaks")

    except Exception:
        logging.exception("Erreur dans daily_currency")
    finally:
        cur.close()
        conn.close()
        logging.info("Connexion DB fermée")

# Airflow alias
update_currency_daily = daily_currency