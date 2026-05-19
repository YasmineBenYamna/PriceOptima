# file: dag_seed.py
"""
DAG pipeline_seed — AUTOMATISÉ
"""

import json
from datetime import datetime, timedelta

from airflow import DAG
from airflow.operators.python import PythonOperator
from airflow.operators.trigger_dagrun import TriggerDagRunOperator
from airflow.operators.bash import BashOperator
from airflow.providers.postgres.operators.postgres import PostgresOperator

SCHEMA_CONFIG_PATH = "/opt/airflow/dags/config/schema_config.json"

def _build_create_tables_sql(schema_path: str) -> str:
    with open(schema_path) as f:
        schema = json.load(f)
    statements = []
    for table_name, table_def in schema.items():
        cols = table_def.get("columns", {})
        constraints = table_def.get("constraints", [])
        col_defs = [f"    {col} {dtype}" for col, dtype in cols.items()]
        all_defs = col_defs + [f"    {c}" for c in constraints]
        ddl = (
            f"CREATE TABLE IF NOT EXISTS {table_name} (\n"
            + ",\n".join(all_defs)
            + "\n);"
        )
        statements.append(ddl)
    return "\n\n".join(statements)

CREATE_TABLES_SQL = _build_create_tables_sql(SCHEMA_CONFIG_PATH)

def _seed_prices(**context):
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
    "email_on_failure": True,
    "email_on_retry": False,
    "retries": 2,
    "retry_delay": timedelta(minutes=5),
    "retry_exponential_backoff": True,
    "max_retry_delay": timedelta(minutes=30),
}

with DAG(
    dag_id="pipeline_seed",
    start_date=datetime(2024, 1, 1),
    schedule_interval=None,
    catchup=False,
    is_paused_upon_creation=False,
    default_args=default_args,
    tags=["seed", "init"],
) as dag:

    t_create_tables = PostgresOperator(
        task_id="create_tables",
        postgres_conn_id="postgres_retail",
        sql=CREATE_TABLES_SQL,
        autocommit=True,
    )

    # ── 2. Init SQLMesh (réparation de l'état uniquement) ────
    t_init_sqlmesh = BashOperator(
        task_id="init_sqlmesh",
        bash_command="""
            cd /opt/airflow/sqlmesh &&
            mkdir -p logs &&
            python3 /opt/airflow/sqlmesh/repair_sqlmesh.py
        """,
        execution_timeout=timedelta(minutes=10),
    )

    t_seed_prices = PythonOperator(
        task_id="seed_prices",
        python_callable=_seed_prices,
        execution_timeout=timedelta(hours=8),
    )

    t_seed_food = PythonOperator(
        task_id="seed_food",
        python_callable=_seed_food,
        execution_timeout=timedelta(hours=6),
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


    # ── 9. Transformations SQLMesh ────────────────────────────
    t_sqlmesh = BashOperator(
    task_id="run_sqlmesh_transformation",
    bash_command="""
        cd /opt/airflow/sqlmesh &&
        mkdir -p logs &&
        sqlmesh plan prod --no-prompts --auto-apply &&
        sqlmesh run prod --skip-janitor
    """,
    execution_timeout=timedelta(hours=2),
    )
    
    t_trigger = TriggerDagRunOperator(
        task_id="trigger_daily",
        trigger_dag_id="dag_data_enrichment",
        wait_for_completion=False,
    )

(
    t_create_tables
    >> t_init_sqlmesh
    >> t_seed_prices
    >> t_seed_food
    >> t_seed_beauty
    >> t_seed_other
    >> t_seed_currency
    >> t_sqlmesh
    >> t_trigger
)