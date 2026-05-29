from fastapi import HTTPException
from datetime import datetime
from models.job import Job
from models.price_result import PriceResult
import logging
import uuid

logger = logging.getLogger("job_service")


class JobService:
    """Gère la création et l'exécution des jobs de pricing en masse."""

    def __init__(self, job_repo, strategy_service, pricing_service):
        self._job_repo         = job_repo
        self._strategy_service = strategy_service
        self._pricing_service  = pricing_service

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _resolve_scope(self, body):
        """Valide et retourne les flags de scope depuis le body."""
        has_eans     = bool(body.eans and len(body.eans) > 0)
        has_category = bool(body.category and body.category.strip())
        has_brand    = bool(body.brand and body.brand.strip())
        if not has_eans and not has_category and not has_brand:
            raise HTTPException(
                status_code=400,
                detail="Fournir au moins un scope : eans, category ou brand"
            )
        return has_eans, has_category, has_brand

    def _build_scope_label(self, body, has_eans, has_category, has_brand, ean_count=0):
        if has_eans:
            return f"eans:{ean_count} products", "ean",     f"{ean_count} EANs"
        elif has_category:
            return f"category:{body.category}", "category", body.category
        else:
            return f"brand:{body.brand}",       "brand",    body.brand

    def _save_price_results(self, job_id, user_id, strategy_name, scope_type, scope_value, results):
        """Persiste les prix calculés dans la table price_results."""
        with self._job_repo._db.session_scope() as session:
            for r in results:
                pr = PriceResult(
                    id             = str(uuid.uuid4()),
                    job_id         = job_id,
                    user_id        = user_id,
                    strategy_name  = strategy_name,
                    scope_type     = scope_type,
                    scope_value    = scope_value,
                    product_ean    = r["product_id"],
                    original_price = r.get("original_price"),
                    final_price    = r["final_price"],
                    price_change   = r.get("price_change"),
                    change_pct     = r.get("change_pct"),
                    currency       = "EUR",
                    computed_at    = datetime.utcnow(),
                )
                session.add(pr)
            logger.info(f"Saved {len(results)} price_results for job {job_id}")

    # ── API publique ──────────────────────────────────────────────────────────

    def create_job(self, body, user_id: str, company_name: str) -> dict:
        """
        Crée un job en base avec status='pending' et l'enqueue dans Celery.
        Retourne immédiatement — le calcul se fait en arrière-plan.
        """
        has_eans, has_category, has_brand = self._resolve_scope(body)

        strategy      = self._strategy_service.resolve_strategy(
            body.system_strategy_id, body.user_strategy_id, user_id
        )
        strategy_name = strategy.name
        scope, _, _   = self._build_scope_label(body, has_eans, has_category, has_brand)

        # Créer le job en base avec status=pending
        job = Job(
            user_id          = user_id,
            user_strategy_id = strategy.id,
            strategy_name    = strategy_name,
            status           = "pending",
            schedule         = getattr(body, 'schedule', None),
            total_processed  = 0,
            prices_updated   = 0,
            average_delta    = 0.0,
            runtime_seconds  = 0,
            results          = [],
            errors           = [],
            price_changes    = [],
            last_run_at      = datetime.utcnow()
        )
        job = self._job_repo.create(job)
        logger.info(f"Job created id={job.id} status=pending")

        # Enqueue dans Celery
        try:
            from tasks.pricing_tasks import run_pricing_job
            run_pricing_job.delay(
                job_id       = job.id,
                body_dict    = body.model_dump(),
                user_id      = user_id,
                company_name = company_name,
            )
            logger.info(f"Job {job.id} enqueued in Celery")
        except Exception as e:
            logger.warning(f"Celery unavailable ({e}), running synchronously")
            self.execute_job(job.id, body, user_id, company_name)

        return {
            "id":            job.id,
            "job_number":    f"JOB-{job.id[:6].upper()}",
            "strategy_name": strategy_name,
            "scope":         scope,
            "status":        "pending",
        }

    def execute_job(self, job_id: str, body, user_id: str, company_name: str) -> dict:
        """
        Exécute réellement le calcul de pricing.
        Appelé par le worker Celery (ou en fallback synchrone si Celery down).
        """
        has_eans, has_category, has_brand = self._resolve_scope(body)

        strategy      = self._strategy_service.resolve_strategy(
            body.system_strategy_id, body.user_strategy_id, user_id
        )
        strategy_name = strategy.name

        # Résoudre les EANs
        try:
            ean_list = self._pricing_service.get_products_for_scope(
                body.eans     if has_eans     else None,
                body.category if has_category else None,
                body.brand    if has_brand    else None,
                body.limit or 50,
                company_name=company_name
            )
        except HTTPException as e:
            self._job_repo.update_status(job_id, "failed")
            raise e
        except Exception as e:
            self._job_repo.update_status(job_id, "failed")
            raise HTTPException(status_code=500, detail=f"Erreur résolution scope : {str(e)}")

        if not ean_list:
            self._job_repo.update_status(job_id, "failed")
            raise HTTPException(status_code=404, detail="Aucun produit trouvé pour ce scope.")

        scope, scope_type, scope_value = self._build_scope_label(
            body, has_eans, has_category, has_brand, ean_count=len(ean_list)
        )

        # Calcul pricing
        start_time                     = datetime.utcnow()
        results, errors, price_changes = [], [], []

        for ean in ean_list:
            try:
                r   = self._pricing_service.compute_price(ean, strategy, company_name=company_name)
                pct = r.get("change_pct", 0)
                results.append({
                    "product_id":     r["product_id"],
                    "original_price": r["original_price"],
                    "final_price":    r["final_price"],
                    "price_change":   r["price_change"],
                    "change_pct":     pct,
                    "contributions":  r["contributions"],
                    "strategy_name":  strategy_name,
                })
                price_changes.append({
                    "product_id":     ean,
                    "old_price":      r["original_price"],
                    "new_price":      r["final_price"],
                    "change_pct":     pct,
                    "strategy_triggered": strategy_name
                })
            except Exception as e:
                logger.warning(f"compute_price failed for EAN {ean}: {e}")
                errors.append({"ean": ean, "error": str(e)})

        runtime        = int((datetime.utcnow() - start_time).total_seconds())
        prices_updated = len([p for p in price_changes if (p.get("change_pct") or 0) != 0])
        avg_delta      = round(
            sum(p["change_pct"] for p in price_changes) / len(price_changes), 2
        ) if price_changes else 0.0
        status_job     = "completed" if results else "failed"

        # Mettre à jour le job en base
        self._job_repo.update_job_results(
            job_id          = job_id,
            status          = status_job,
            total_processed = len(results),
            prices_updated  = prices_updated,
            average_delta   = avg_delta,
            runtime_seconds = runtime,
            results         = results,
            errors          = errors,
            price_changes   = price_changes,
            last_run_at     = datetime.utcnow(),
        )
        logger.info(f"Job {job_id} done: status={status_job}, processed={len(results)}")

        try:
            self._save_price_results(
                job_id        = job_id,
                user_id       = user_id,
                strategy_name = strategy_name,
                scope_type    = scope_type,
                scope_value   = scope_value,
                results       = results,
            )
        except Exception as e:
            logger.error(f"Failed to save price_results: {e}")

        return {
            "id":              job_id,
            "status":          status_job,
            "total_processed": len(results),
            "prices_updated":  prices_updated,
            "average_delta":   avg_delta,
            "runtime_seconds": runtime,
        }