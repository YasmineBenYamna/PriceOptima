from models.job import Job
from typing import Optional


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

    def find_by_id(self, job_id: str, user_id: str):
        """Recherche un job par son id et l'id de l'utilisateur propriétaire."""
        with self._db.session_scope() as session:
            job = session.query(Job).filter(
                Job.id == job_id, Job.user_id == user_id
            ).first()
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

    def delete(self, job: Job):
        """Supprime un job de la base de données."""
        with self._db.session_scope() as session:
            session.delete(session.merge(job))