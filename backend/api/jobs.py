from fastapi import APIRouter, HTTPException, Query, Header
from typing import Optional
from schemas.job import JobCreate
from config.dependencies import auth_service, job_service, job_repo

router = APIRouter(prefix="/api/v1/jobs", tags=["Jobs"])

def _serialize_job(j) -> dict:
    """Convertit un job en dict sérialisable pour les réponses API."""
    return {
        "id":              j.id,
        "job_number":      f"JOB-{j.id[:6].upper()}",
        "strategy_name":   j.strategy_name,
        "status":          j.status,
        "schedule":        j.schedule,
        "total_processed": j.total_processed,
        "prices_updated":  j.prices_updated,
        "average_delta":   j.average_delta,
        "runtime_seconds": j.runtime_seconds,
        "created_at":      str(j.created_at),
        "last_run_at":     str(j.last_run_at) if j.last_run_at else None,
    }

@router.get("")
def list_jobs(status: Optional[str] = Query(None), authorization: Optional[str] = Header(None)):
    """Retourne la liste des jobs de l'utilisateur avec statistiques."""
    user     = auth_service.get_current_user(authorization)
    jobs     = job_repo.find_by_user(user.id, status)
    all_jobs = job_repo.find_by_user(user.id)
    return {
        "stats": {
            "total_active":   len([j for j in all_jobs if j.status in ("running", "scheduled", "pending")]),
            "running":        len([j for j in all_jobs if j.status == "running"]),
            "completed_24h":  len([j for j in all_jobs if j.status == "completed"]),
            "failed":         len([j for j in all_jobs if j.status == "failed"]),
        },
        "jobs":  [_serialize_job(j) for j in jobs],
        "total": len(jobs),
    }

@router.get("/{job_id}")
def get_job(job_id: str, authorization: Optional[str] = Header(None)):
    """Retourne le détail d'un job."""
    user = auth_service.get_current_user(authorization)
    job  = job_repo.find_by_id(job_id)
    if not job:                    raise HTTPException(status_code=404, detail="Job introuvable")
    if job.user_id != user.id:     raise HTTPException(status_code=403, detail="Forbidden")

    pcs       = job.price_changes or []
    total_pc  = len(pcs) or 1
    markdown  = len([p for p in pcs if (p.get("change_pct") or 0) < 0])
    markup    = len([p for p in pcs if (p.get("change_pct") or 0) > 0])
    unchanged = total_pc - markdown - markup

    return {
        **_serialize_job(job),
        "price_changes": pcs,
        "errors":        job.errors or [],
        "execution_timeline": [
            {"step": "Fetch Products",        "status": "completed"},
            {"step": "Apply Pricing Rules",   "status": "completed" if job.status != "failed" else "failed"},
            {"step": "Compute Optimal Prices","status": "completed" if job.status == "completed" else "pending"},
            {"step": "Save Results",          "status": "completed" if job.status == "completed" else "pending"},
        ],
        "distribution": {
            "markdown_pct":  round(markdown  / total_pc * 100),
            "markup_pct":    round(markup    / total_pc * 100),
            "unchanged_pct": round(unchanged / total_pc * 100),
        },
    }

@router.post("", status_code=201)
def post_job(body: JobCreate, authorization: Optional[str] = Header(None)):
    """Crée et exécute un nouveau job de pricing."""
    user = auth_service.get_current_user(authorization)
    return job_service.create_job(body, user.id, user.company_name)

@router.delete("/{job_id}", status_code=204)
def del_job(job_id: str, authorization: Optional[str] = Header(None)):
    """Supprime un job de l'utilisateur connecté."""
    user = auth_service.get_current_user(authorization)
    job = job_repo.find_by_id(job_id)

    if not job:
        raise HTTPException(status_code=404, detail="Job introuvable")
    if job.user_id != user.id:
        raise HTTPException(status_code=403, detail="Forbidden")

    deleted = job_repo.delete(job_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Job introuvable")
    return