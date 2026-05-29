# file: dag_seed.py
"""
DAG pipeline_seed — AUTOMATISÉ
"""
import psycopg2
import os
import json
from datetime import datetime, timedelta
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT
from airflow import DAG
from airflow.operators.python import PythonOperator
from airflow.operators.trigger_dagrun import TriggerDagRunOperator
from airflow.operators.bash import BashOperator
from airflow.providers.postgres.operators.postgres import PostgresOperator

SCHEMA_CONFIG_PATH = "/opt/airflow/dags/config/schema_config.json"


def build_create_tables_sql(schema_path: str) -> str:
    """Génère les statements CREATE TABLE IF NOT EXISTS depuis schema_config.json."""
    with open(schema_path) as f:
        schema = json.load(f)
    statements = []
    for table_name, table_def in schema.items():
        cols        = table_def.get("columns", {}) # val par defaut dict vide
        constraints = table_def.get("constraints", [])
        col_defs    = [f"    {col} {dtype}" for col, dtype in cols.items()]
        all_defs    = col_defs + [f"    {c}" for c in constraints]
        ddl = (
            f"CREATE TABLE IF NOT EXISTS {table_name} (\n"
            + ",\n".join(all_defs)
            + "\n);"
        )
        statements.append(ddl)
    return "\n\n".join(statements)  # colle toutes les requêtes en un seul script SQL, séparées par une ligne


# ═══════════════════════════════════════════════════════════════
# CREATE DATABASE
# ═══════════════════════════════════════════════════════════════

def create_database():
    """Crée la base retail_pricing si elle n'existe pas encore."""
    conn = psycopg2.connect(
        host    =os.environ["POSTGRES_HOST"],
        port    =int(os.environ.get("POSTGRES_PORT", 5432)),
        user    =os.environ["POSTGRES_USER"],
        password=os.environ["POSTGRES_PASSWORD"],
        dbname  ="postgres",
    )
    # Par défaut, psycopg2 ouvre une transaction automatiquement.
    # Or PostgreSQL interdit CREATE DATABASE dans une transaction.
    # AUTOCOMMIT désactive ce comportement → chaque commande est
    # exécutée directement, sans transaction englobante.
    conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
    with conn.cursor() as cur:
        cur.execute("SELECT 1 FROM pg_database WHERE datname = %s", (os.environ["POSTGRES_DB"],))
        if not cur.fetchone():
            cur.execute(f"CREATE DATABASE {os.environ['POSTGRES_DB']} OWNER {os.environ['POSTGRES_USER']}")
    conn.close()

def _seed_prices(**context):
    """**context est un dictionnaire qu'Airflow injecte automatiquement dans
    chaque fonction appelée par un PythonOperator.
    Il contient plein d'informations sur l'exécution en cours de la tâche."""
    from utils.tasks_seed import seed_prices
    seed_prices(**context)

def _seed_food(**context):
    from utils.tasks_seed import seed_food
    seed_food(**context)

def _seed_beauty(**context):
    from utils.tasks_seed import seed_beauty
    seed_beauty(**context)

def _seed_other(**context):
    from utils.tasks_seed import seed_other
    seed_other(**context)

def _seed_currency(**context):
    from utils.tasks_seed import seed_currency
    seed_currency(**context)


default_args = {
    "owner": "airflow",
    "depends_on_past": False,
    "email_on_failure": False,
    "email_on_retry": False,
    "retries": 2,
    "retry_delay": timedelta(minutes=5),
    "retry_exponential_backoff": True, #Double le delai a chaque reessai (5 min, 10 min...)
    "max_retry_delay": timedelta(minutes=30), # Plafond : jamais plus de 30 minutes entre deux reessais
}

with DAG(
    dag_id="pipeline_seed",
    start_date=datetime(2024, 1, 1), # toujours une date passée et statique
    schedule_interval=None,
    catchup=False,
    is_paused_upon_creation=False, # actif dès la création, pas en pause
    default_args=default_args,
    tags=["seed", "init"],
) as dag:

    initialize_database = PythonOperator(
        task_id="initialize_database",
        python_callable=create_database,
        execution_timeout=timedelta(minutes=2),
    )

    initialize_schema = PostgresOperator(
        task_id="initialize_schema",
        postgres_conn_id="postgres_retail",
        sql=build_create_tables_sql(SCHEMA_CONFIG_PATH),
        autocommit=True, # validé sans attendre COMMIT
    )

    t_seed_prices = PythonOperator(
        task_id="seed_prices",
        python_callable=_seed_prices,
        execution_timeout=timedelta(hours=5),
    )

    t_seed_food = PythonOperator(
        task_id="seed_food",
        python_callable=_seed_food,
        execution_timeout=timedelta(hours=11),
    )

    t_seed_beauty = PythonOperator(
        task_id="seed_beauty",
        python_callable=_seed_beauty,
        execution_timeout=timedelta(hours=4),
    )

    t_seed_other = PythonOperator(
        task_id="seed_other",
        python_callable=_seed_other,
        execution_timeout=timedelta(hours=6),
    )

    t_seed_currency = PythonOperator(
        task_id="seed_currency",
        python_callable=_seed_currency,
        execution_timeout=timedelta(hours=2),
    )
    
    create_source_indexes = PostgresOperator(
        task_id='create_source_indexes',
        postgres_conn_id='postgres_retail',
        sql="""
        -- ================================================================
        -- PRICES_RAW — table la plus lourde, cœur de bronze.prices_raw
        -- ================================================================
        -- SQLMesh filtre par date (INCREMENTAL_BY_TIME_RANGE)
        CREATE INDEX IF NOT EXISTS idx_pr_date
            ON public.prices_raw (date);

        -- SQLMesh joint sur product_code → silver.products
        CREATE INDEX IF NOT EXISTS idx_pr_product_code
            ON public.prices_raw (product_code);

        -- SQLMesh joint sur location_osm_id → silver.store / silver.magasin
        CREATE INDEX IF NOT EXISTS idx_pr_location_osm_id
            ON public.prices_raw (location_osm_id);

        -- Filtre combiné date + product_code (batch INCREMENTAL)
        CREATE INDEX IF NOT EXISTS idx_pr_date_product
            ON public.prices_raw (date, product_code);

        -- Filtre combiné date + location (jointure store × date)
        CREATE INDEX IF NOT EXISTS idx_pr_date_location
            ON public.prices_raw (date, location_osm_id);

        -- Filtre sur currency (jointure exchange_rates)
        CREATE INDEX IF NOT EXISTS idx_pr_currency
            ON public.prices_raw (currency);

        -- ================================================================
        -- PRODUCTS_RAW — jointure via code → bronze.products_raw
        -- ================================================================
        CREATE INDEX IF NOT EXISTS idx_prr_code
            ON public.products_raw (code);

        -- SQLMesh filtre les produits non obsolètes
        CREATE INDEX IF NOT EXISTS idx_prr_obsolete
            ON public.products_raw (obsolete);

        -- Jointure brands_tags → silver.brand
        CREATE INDEX IF NOT EXISTS idx_prr_brands_tags
            ON public.products_raw (brands_tags);

        -- Jointure categories_tags → silver.category
        CREATE INDEX IF NOT EXISTS idx_prr_categories_tags
            ON public.products_raw (categories_tags);
            
        CREATE INDEX IF NOT EXISTS idx_prr_updated_at
            ON public.products_raw (updated_at);

        -- ================================================================
        -- EXCHANGE_RATES_RAW — petite table mais jointure fréquente
        -- ================================================================
        CREATE INDEX IF NOT EXISTS idx_er_currency_date
            ON public.exchange_rates_raw (currency, rate_date);
        """,
        database='retail_pricing',
    )
    t_sqlmesh = BashOperator(
        task_id="run_sqlmesh_transformation",
        bash_command="""
            cd /opt/airflow/sqlmesh &&
            mkdir -p logs &&
            sqlmesh plan prod --no-prompts --auto-apply --restate-model '*' &&
            sqlmesh run prod --skip-janitor
        """,
        execution_timeout=timedelta(hours=30),
    )
    t_trigger = TriggerDagRunOperator(
        task_id="trigger_daily",
        trigger_dag_id="dag_data_enrichment",
        wait_for_completion=False,
    )


(
    initialize_database
    >> initialize_schema
    >> t_seed_prices
    >> t_seed_food
    >> t_seed_beauty
    >> t_seed_other
    >> t_seed_currency
    >> create_source_indexes
    >> t_sqlmesh
    >> t_trigger
)