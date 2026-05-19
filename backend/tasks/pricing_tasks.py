from celery_app import celery
from config.dependencies import job_service
import logging

logger = logging.getLogger("pricing_tasks")


@celery.task(bind=True, name="tasks.run_pricing_job")
def run_pricing_job(self, job_id: str, body_dict: dict, user_id: str, company_name: str):
    """
    Tâche Celery : exécute le calcul de pricing en arrière-plan.
    - job_id : ID du job déjà créé en base avec status='pending'
    - body_dict : payload du job (eans, category, brand, strategy ids...)
    - user_id : ID de l'utilisateur
    - company_name : nom de la société pour le calcul
    """
    from schemas.job import JobCreate
    from models.job import Job
    from config.dependencies import job_repo
    from datetime import datetime

    logger.info(f"[Celery] Starting pricing job {job_id} for user {user_id}")

    # Marquer le job comme running
    try:
        job = job_repo.find_by_id(job_id)
        if job:
            job.status = "running"
            job_repo.update_status(job_id, "running")
    except Exception as e:
        logger.warning(f"Could not set job to running: {e}")

    try:
        body = JobCreate(**body_dict)
        result = job_service.execute_job(job_id, body, user_id, company_name)
        logger.info(f"[Celery] Job {job_id} completed: {result.get('total_processed')} products")
        return result
    except Exception as e:
        logger.error(f"[Celery] Job {job_id} failed: {e}")
        job_repo.update_status(job_id, "failed")
        raise