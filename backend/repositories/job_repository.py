from models.job import Job
from models.price_result import PriceResult
from typing import Optional
from datetime import datetime


class JobRepository:
    """Accès aux données des jobs de pricing dans la base applicative."""

    def __init__(self, db_manager):
        self._db = db_manager

    def find_by_user(self, user_id: str, status: Optional[str] = None):
        """Retourne les jobs d'un utilisateur, filtrable par statut."""
        with self._db.session_scope() as session:
            q = session.query(Job).filter(Job.user_id == user_id)
            if status:
                q = q.filter(Job.status == status)
            jobs = q.order_by(Job.created_at.desc()).all()
            for j in jobs:
                session.expunge(j)
            return jobs

    def find_by_id(self, job_id: str) -> Optional[Job]:
        """Recherche un job par son id."""
        with self._db.session_scope() as session:
            job = session.query(Job).filter(Job.id == job_id).first()
            if job:
                session.expunge(job)
            return job

    def create(self, job: Job) -> Job:
        """Crée un nouveau job et retourne l'instance persistée."""
        with self._db.session_scope() as session:
            session.add(job)
            session.flush()
            session.refresh(job)
            session.expunge(job)
            return job

    def delete(self, job_id: str) -> bool:
        """Supprime un job et ses price_results associés."""
        with self._db.session_scope() as session:
            job = session.query(Job).filter(Job.id == job_id).first()
            if not job:
                return False

            session.query(PriceResult).filter(
                PriceResult.job_id == job_id
            ).delete(synchronize_session=False)

            session.delete(job)
            return True

    def update_status(self, job_id: str, status: str):
        """Met à jour uniquement le statut d'un job (pending → running → completed/failed)."""
        with self._db.session_scope() as session:
            job = session.query(Job).filter(Job.id == job_id).first()
            if job:
                job.status = status

    def update_job_results(
        self,
        job_id: str,
        status: str,
        total_processed: int,
        prices_updated: int,
        average_delta: float,
        runtime_seconds: int,
        results: list,
        errors: list,
        price_changes: list,
        last_run_at: datetime,
    ):
        """Met à jour le job après exécution par le worker Celery."""
        with self._db.session_scope() as session:
            job = session.query(Job).filter(Job.id == job_id).first()
            if job:
                job.status          = status
                job.total_processed = total_processed
                job.prices_updated  = prices_updated
                job.average_delta   = average_delta
                job.runtime_seconds = runtime_seconds
                job.results         = results
                job.errors          = errors
                job.price_changes   = price_changes
                job.last_run_at     = last_run_at