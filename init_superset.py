"""
init_superset.py
Lance au démarrage du container Superset :
  1. Initialise la DB Superset
  2. Crée l'admin
  3. Crée la connexion PostgreSQL (retail_pricing)
  4. Crée les 4 datasets SQL
"""

import os
import time
import subprocess
import sys

# ─── Install psycopg2 si absent ───────────────────────────────────────────────
subprocess.run(
    [sys.executable, "-m", "pip", "install", "psycopg2-binary", "--quiet"],
    check=False
)

# ─── Variables ────────────────────────────────────────────────────────────────
DB_HOST     = os.environ.get("DATABASE_HOST", "postgres")
DB_PORT     = os.environ.get("DATABASE_PORT", "5432")
DB_USER     = os.environ.get("DATABASE_USER", "postgres")
DB_PASSWORD = os.environ.get("DATABASE_PASSWORD", "admin123")
MARKET_DB   = os.environ.get("MARKET_DB_NAME", "retail_pricing")
SUPERSET_DB = os.environ.get("DATABASE_DB", "superset_db")

ADMIN_USERNAME = os.environ.get("ADMIN_USERNAME", "admin")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "admin123")
ADMIN_EMAIL    = os.environ.get("ADMIN_EMAIL", "admin@datapricer.com")

# ─── Attendre PostgreSQL ──────────────────────────────────────────────────────
def wait_for_postgres():
    import psycopg2
    print("⏳ Attente PostgreSQL...")
    for i in range(30):
        try:
            conn = psycopg2.connect(
                host=DB_HOST, port=DB_PORT,
                user=DB_USER, password=DB_PASSWORD,
                dbname="airflow_db"
            )
            conn.close()
            print("✅ PostgreSQL disponible")
            return
        except Exception:
            time.sleep(2)
    raise Exception("❌ PostgreSQL non disponible après 60s")

# ─── Créer la base superset_db si elle n'existe pas ──────────────────────────
def create_superset_db():
    import psycopg2
    from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT
    try:
        conn = psycopg2.connect(
            host=DB_HOST, port=DB_PORT,
            user=DB_USER, password=DB_PASSWORD,
            dbname="airflow_db"
        )
        conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
        cur = conn.cursor()
        cur.execute(f"SELECT 1 FROM pg_database WHERE datname='{SUPERSET_DB}'")
        if not cur.fetchone():
            cur.execute(f"CREATE DATABASE {SUPERSET_DB}")
            print(f"✅ Base {SUPERSET_DB} créée")
        else:
            print(f"✅ Base {SUPERSET_DB} existe déjà")
        cur.close()
        conn.close()
    except Exception as e:
        print(f"⚠️  create_superset_db: {e}")

# ─── Init Superset (db migrate + create admin) ────────────────────────────────
def init_superset():
    print("🔧 Migration DB Superset...")
    subprocess.run(["superset", "db", "upgrade"], check=True)

    print("🔧 Init Superset...")
    subprocess.run(["superset", "init"], check=True)

    print("🔧 Création admin...")
    subprocess.run([
        "superset", "fab", "create-admin",
        "--username", ADMIN_USERNAME,
        "--firstname", "Admin",
        "--lastname",  "Admin",
        "--email",     ADMIN_EMAIL,
        "--password",  ADMIN_PASSWORD,
    ], check=False)  # check=False car erreur si admin existe déjà
    print("✅ Admin prêt")

# ─── Créer connexion DB + datasets via SQLAlchemy/Superset Python API ─────────
def create_datasets():
    # Import Superset après migration
    from superset import create_app
    from superset.extensions import db
    from superset.models.core import Database
    from superset.connectors.sqla.models import SqlaTable

    app = create_app()

    DATASETS = [
        {
            "name": "ds_store_network",
            "sql": """
SELECT
  f.date_id,
  f.nb_stores_total,
  f.nb_stores_actifs,
  f.created_at,
  m.nom_enseigne,
  m.country_code,
  m.country,
  m.department,
  m.network_tier,
  m.nb_stores_geolocated,
  m.pct_geo_coverage,
  m.avg_store_completeness,
  t.date_jour,
  t.jour,
  t.mois,
  t.mois_nom,
  t.trimestre,
  t.trimestre_label,
  t.annee,
  t.is_weekend
FROM gold.dm_store_network f
LEFT JOIN silver.magasin m ON f.magasin_id = m.magasin_id
LEFT JOIN silver.temps   t ON f.date_id    = t.date_id
""",
        },
        {
            "name": "ds_pricing_performance",
            "sql": """
SELECT
  f.nb_prices,
  f.avg_price_eur,
  f.ipp_global,
  f.ipp_category,
  f.ipp_brand,
  f.price_evolution_pct_mom,
  f.indice_saisonnier_category,
  f.indice_saisonnier_brand,
  m.nom_enseigne,
  m.network_tier,
  m.country_code,
  c.category_tag,
  c.category_name,
  c.lang_prefix         AS category_lang,
  b.brand_tag,
  b.brand_name,
  t.date_jour,
  t.mois,
  t.mois_nom,
  t.trimestre,
  t.trimestre_label,
  t.annee
FROM gold.dm_pricing_performance f
LEFT JOIN silver.magasin  m ON f.magasin_id  = m.magasin_id
LEFT JOIN silver.category c ON f.category_id = c.category_id
LEFT JOIN silver.brand    b ON f.brand_id    = b.brand_id
LEFT JOIN silver.temps    t ON f.date_id     = t.date_id
""",
        },
        {
            "name": "ds_market_positioning",
            "sql": """
SELECT
  f.nb_prices,
  f.avg_price_eur,
  f.taux_promo_global,
  f.taux_promo_category,
  f.taux_promo_brand,
  f.rang_category,
  f.rang_brand,
  f.indice_saisonnier_marche_global,
  f.indice_saisonnier_marche_cat,
  f.indice_saisonnier_marche_brand,
  f.ecart_saisonnier_cat,
  f.ecart_saisonnier_brand,
  f.mois_pic_global,
  f.mois_creux_global,
  f.mois_pic_cat,
  f.mois_creux_cat,
  f.mois_pic_brand,
  f.mois_creux_brand,
  m.nom_enseigne,
  m.network_tier,
  m.country_code,
  c.category_tag,
  c.category_name,
  b.brand_tag,
  b.brand_name,
  t.date_jour,
  t.mois,
  t.mois_nom,
  t.trimestre,
  t.trimestre_label,
  t.annee
FROM gold.dm_market_positioning f
LEFT JOIN silver.magasin  m ON f.magasin_id  = m.magasin_id
LEFT JOIN silver.category c ON f.category_id = c.category_id
LEFT JOIN silver.brand    b ON f.brand_id    = b.brand_id
LEFT JOIN silver.temps    t ON f.date_id     = t.date_id
""",
        },
        {
            "name": "ds_store_geo",
            "sql": """
SELECT
  s.store_id,
  s.store_name,
  s.latitude,
  s.longitude,
  s.nom_magasin          AS enseigne,
  s.city,
  s.country_code,
  s.department_code,
  m.network_tier,
  m.nom_enseigne,
  COUNT(p.price_eur)     AS nb_prices_total
FROM silver.store s
LEFT JOIN silver.magasin m ON s.magasin_id = m.magasin_id
LEFT JOIN silver.prices  p ON s.store_id   = p.store_id
WHERE s.latitude  IS NOT NULL
  AND s.longitude IS NOT NULL
GROUP BY
  s.store_id, s.store_name, s.latitude, s.longitude,
  s.nom_magasin, s.city, s.country_code, s.department_code,
  m.network_tier, m.nom_enseigne
""",
        },
    ]

    with app.app_context():
        # Connexion PostgreSQL retail_pricing
        conn_str = (
            f"postgresql+psycopg2://{DB_USER}:{DB_PASSWORD}"
            f"@{DB_HOST}:{DB_PORT}/{MARKET_DB}"
        )

        database = db.session.query(Database).filter_by(
            database_name="retail_pricing"
        ).first()

        if not database:
            database = Database(
                database_name="retail_pricing",
                sqlalchemy_uri=conn_str,
                expose_in_sqllab=True,
                allow_run_async=True,
                allow_ctas=True,
                allow_cvas=True,
                allow_dml=True,
            )
            db.session.add(database)
            db.session.commit()
            print("✅ Connexion retail_pricing créée")
        else:
            print("✅ Connexion retail_pricing existe déjà")

        # Créer les datasets
        for ds in DATASETS:
            existing = db.session.query(SqlaTable).filter_by(
                table_name=ds["name"]
            ).first()

            if not existing:
                table = SqlaTable(
                    table_name=ds["name"],
                    sql=ds["sql"].strip(),
                    database_id=database.id,
                    schema=None,
                )
                db.session.add(table)
                db.session.commit()
                print(f"✅ Dataset '{ds['name']}' créé")
            else:
                print(f"✅ Dataset '{ds['name']}' existe déjà")

    print("\n🎉 Superset initialisé avec succès !")
    print(f"   → http://localhost:8088")
    print(f"   → Login: {ADMIN_USERNAME} / {ADMIN_PASSWORD}")


# ─── Main ─────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    wait_for_postgres()
    create_superset_db()
    init_superset()
    create_datasets()