#!/bin/bash
set -e
pip install psycopg2-binary --quiet
python /app/init_superset.py
exec gunicorn --bind 0.0.0.0:8088 --workers 2 --worker-class gthread --threads 4 --timeout 120 --limit-request-line 0 --limit-request-field_size 0 "superset.app:create_app()"