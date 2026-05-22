from airflow import DAG
from airflow.operators.python import PythonOperator
from airflow.operators.bash import BashOperator
from airflow.providers.postgres.operators.postgres import PostgresOperator
from airflow.utils.dates import days_ago
from datetime import datetime, timedelta
import os

def _fetch_and_insert_prices(**context):
    from utils.tasks_daily import fetch_and_insert_prices
    fetch_and_insert_prices(**context)

def _fetch_and_insert_delta_products(**context):
    from utils.tasks_daily import fetch_and_insert_delta_products
    fetch_and_insert_delta_products(**context)

def _update_currency_daily(**context):
    from utils.tasks_daily import update_currency_daily
    update_currency_daily(**context)

default_args = {
    "owner"           : os.environ.get("AIRFLOW_DAG_OWNER", "airflow"),
    "depends_on_past" : False,
    "retries"         : int(os.environ.get("AIRFLOW_DEFAULT_RETRIES", 1)),
    "retry_delay"     : timedelta(minutes=int(os.environ.get("AIRFLOW_RETRY_DELAY_MINUTES", 5))),
    "email_on_failure": False,
    "email_on_retry"  : False,
}

with DAG(
    dag_id="dag_data_enrichment",
    start_date=days_ago(1),
    schedule_interval="@daily",
    catchup=True,
    default_args=default_args,
    max_active_runs=1,
) as dag:

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
        task_id="currency_daily",
        python_callable=_update_currency_daily,
        execution_timeout=timedelta(minutes=30),
    )

    t4 = BashOperator(
        task_id="run_sqlmesh_transformation",
        bash_command="""
        set -euo pipefail
        cd /opt/airflow/sqlmesh

        echo "[1/3] Sync exchange rates..."
        sqlmesh run prod --ignore-cron \
            --select-model 'bronze.exchange_rates_raw'

        echo "[2/3] Run incremental models..."
        sqlmesh run prod --ignore-cron \
            --select-model 'bronze.prices_raw' \
            --select-model 'silver.prices' \
            --select-model 'silver.prices_errors'

        echo "[3/3] Run FULL + weekly models..."
        sqlmesh run prod \
            --select-model 'silver.store' \
            --select-model 'silver.magasin' \
            --select-model 'silver.temps' \
            --select-model 'silver.prices_recovery' \
            --select-model 'silver.brand' \
            --select-model 'silver.category' \
            --select-model 'silver.product_category' \
            --select-model 'silver.products' \
            --select-model 'bronze.products_raw' \
            --select-model 'gold.dm_store_network' \
            --select-model 'gold.dm_pricing_performance' \
            --select-model 'gold.dm_market_positioning'
        """,
        execution_timeout=timedelta(hours=2),
        retries=1,
        retry_delay=timedelta(minutes=5),
    )
    
    t1 >> t2 >> t3 >> t4