from airflow import DAG
from airflow.operators.python import PythonOperator
from airflow.operators.empty import EmptyOperator
from airflow.operators.bash import BashOperator
from airflow.utils.dates import days_ago
from datetime import datetime, timedelta



def _fetch_and_insert_prices(**context):
    from utils.tasks_daily import fetch_and_insert_prices
    fetch_and_insert_prices(**context)

def _fetch_and_insert_delta_products(**context):
    from utils.tasks_daily import fetch_and_insert_delta_products
    fetch_and_insert_delta_products(**context)

def _compute_coverage_stats(**context):
    from utils.tasks_daily import compute_coverage_stats
    compute_coverage_stats(**context)

def _update_currency_daily(**context):
    from utils.tasks_daily import update_currency_daily # ← import différé pour éviter les dépendances inutiles
    update_currency_daily(**context)

default_args = {
    "owner": "airflow",
    "depends_on_past": False,
    "retries": 1,
    "retry_delay": timedelta(minutes=5),
}

with DAG(
    dag_id="dag_data_enrichment",
    start_date=days_ago(1),
    schedule_interval="@daily",
    catchup=False,
    default_args=default_args,
    max_active_runs=1,
) as dag:

    start = EmptyOperator(task_id="start")

    t1 = PythonOperator(
        task_id="fetch_and_insert_prices",
        python_callable=_fetch_and_insert_prices,
        execution_timeout=timedelta(hours=6),
    )

    t2 = PythonOperator(
        task_id="fetch_and_insert_delta_products",
        python_callable=_fetch_and_insert_delta_products,
        trigger_rule="all_done",
        execution_timeout=timedelta(hours=12),
        retries=2,
        retry_delay=timedelta(minutes=2),
    )

    t3 = PythonOperator(
        task_id="compute_coverage_stats",
        python_callable=_compute_coverage_stats,
        execution_timeout=timedelta(minutes=30),
    )

    t4 = PythonOperator(
        task_id="currency_daily",
        python_callable=_update_currency_daily,  # wrapper différé
        execution_timeout=timedelta(minutes=30),
    )

    t5 = BashOperator(
    task_id="run_sqlmesh_transformation",
    bash_command=(
        "cd /opt/airflow/sqlmesh && "
        "sqlmesh clean && "          # ← purge le cache corrompu
        "sqlmesh run --skip-janitor"
    ),
    execution_timeout=timedelta(hours=2),
)
    start >> t1 >> t2 >> t3 >> t4 >> t5