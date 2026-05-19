FROM apache/airflow:2.8.0-python3.10

USER root
RUN apt-get update && apt-get install -y \
    g++ \
    build-essential \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

USER airflow

# Désinstalle les providers Google lourds installés par défaut
RUN pip uninstall -y apache-airflow-providers-google \
    apache-airflow-providers-microsoft-azure \
    apache-airflow-providers-amazon \
    || true

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt