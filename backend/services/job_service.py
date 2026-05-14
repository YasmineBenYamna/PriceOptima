from fastapi import HTTPException
from datetime import datetime
from models.job import Job
from models.price_result import PriceResult
import logging

logger = logging.getLogger("job_service")


class JobService:
    """Gère la création et l'exécution des jobs de pricing en masse."""

    def __init__(self, job_repo, strategy_service, pricing_service):
        self._job_repo         = job_repo
        self._strategy_service = strategy_service
        self._pricing_service  = pricing_service

    def create_job(self, body, user_id: str, company_name: str) -> dict:
        has_eans     = bool(body.eans and len(body.eans) > 0)
        has_category = bool(body.category and body.category.strip())
        has_brand    = bool(body.brand and body.brand.strip())

        if not has_eans and not has_category and not has_brand:
            raise HTTPException(
                status_code=400,
                detail="Fournir au moins un scope : eans, category ou brand"
            )

        # ── Résoudre la stratégie ─────────────────────────────────────────────
        strategy = self._strategy_service.resolve_strategy(
            body.system_strategy_id, body.user_strategy_id, user_id
        )
        logger.info(f"Strategy resolved: {strategy.name} (id={strategy.id})")

        # ── Résoudre les EANs ─────────────────────────────────────────────────
        try:
            ean_list = self._pricing_service.get_products_for_scope(
                body.eans    if has_eans     else None,
                body.category if has_category else None,
                body.brand    if has_brand    else None,
                body.limit or 50,
                company_name=company_name
            )
        except HTTPException as e:
            raise e
        except Exception as e:
            logger.error(f"get_products_for_scope error: {e}")
            raise HTTPException(status_code=500, detail=f"Erreur résolution scope : {str(e)}")

        logger.info(f"Scope resolved: {len(ean_list)} products")

        if not ean_list:
            raise HTTPException(
                status_code=404,
                detail="Aucun produit trouvé pour ce scope."
            )

        # ── Scope label ───────────────────────────────────────────────────────
        if has_eans:
            scope      = f"eans:{len(ean_list)} products"
            scope_type  = "ean"
            scope_value = f"{len(ean_list)} EANs"
        elif has_category:
            scope      = f"category:{body.category}"
            scope_type  = "category"
            scope_value = body.category
        else:
            scope      = f"brand:{body.brand}"
            scope_type  = "brand"
            scope_value = body.brand

        # ── Exécuter le pricing ───────────────────────────────────────────────
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
                    "contributions":  r["contributions"]
                })
                price_changes.append({
                    "product_id":     ean,
                    "old_price":      r["original_price"],
                    "new_price":      r["final_price"],
                    "change_pct":     pct,
                    "rule_triggered": r["contributions"][0]["rule"] if r["contributions"] else "N/A"
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

        logger.info(f"Job finished: {len(results)} ok, {len(errors)} errors, status={status_job}")

        # ── Persister le job ──────────────────────────────────────────────────
        job = Job(
            user_id=user_id,
            user_strategy_id=strategy.id,
            strategy_name=body.strategy_name,
            status=status_job,
            schedule=body.schedule,
            total_processed=len(results),
            prices_updated=prices_updated,
            average_delta=avg_delta,
            runtime_seconds=runtime,
            results=results,
            errors=errors,
            price_changes=price_changes,
            last_run_at=datetime.utcnow()
        )
        job = self._job_repo.create(job)

        # ── Sauvegarder dans price_results ────────────────────────────────────
        try:
            self._save_price_results(
                job_id=job.id,
                user_id=user_id,
                strategy_name=body.strategy_name,
                scope_type=scope_type,
                scope_value=scope_value,
                results=results,
            )
        except Exception as e:
            logger.error(f"Failed to save price_results: {e}")
            # Ne pas faire échouer le job pour ça

        return {
            "id":              job.id,
            "job_number":      f"JOB-{job.id[:6].upper()}",
            "strategy_name":   job.strategy_name,
            "scope":           scope,
            "status":          job.status,
            "total_processed": job.total_processed,
            "prices_updated":  job.prices_updated,
            "average_delta":   job.average_delta,
            "runtime_seconds": job.runtime_seconds,
            "price_changes":   job.price_changes,
            "errors":          job.errors
        }
    



    def _save_price_results(
        self, job_id, user_id, strategy_name,
        scope_type, scope_value, results
    ):
        """Persiste les prix calculés dans la table price_results."""
        from models.price_result import PriceResult
        import uuid

        def gen_id():
            return str(uuid.uuid4())[:8]

        with self._job_repo._db.session_scope() as session:
            for r in results:
                pr = PriceResult(
                    id             = gen_id(),
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