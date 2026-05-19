from celery import Celery
import os

BROKER_URL  = os.getenv("CELERY_BROKER_URL",  "redis://redis:6379/0")
RESULT_URL  = os.getenv("CELERY_RESULT_BACKEND", "redis://redis:6379/0")

celery = Celery(
    "price_optima",
    broker=BROKER_URL,
    backend=RESULT_URL,
    include=["tasks.pricing_tasks"],
)

celery.conf.update(
    task_serializer    = "json",
    result_serializer  = "json",
    accept_content     = ["json"],
    timezone           = "UTC",
    enable_utc         = True,
    task_track_started = True,
)