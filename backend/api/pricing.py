from fastapi import APIRouter, HTTPException, Header
from typing import Optional
from schemas.pricing import CalculateRequest, BatchRequest
from config.dependencies import auth_service, strategy_service, pricing_service

router = APIRouter(prefix="/api/v1/pricing", tags=["Pricing"])


@router.post("/calculate")
def calculate(req: CalculateRequest, authorization: Optional[str] = Header(None)):
    """
    Calcule le prix optimal pour un produit.
    Scope : ean, category, ou brand — un seul à la fois.
    """
    if not req.ean and not req.category and not req.brand:
        raise HTTPException(status_code=400, detail="Fournir ean, category ou brand")

    user     = auth_service.get_current_user(authorization)
    strategy = strategy_service.resolve_strategy(
        req.system_strategy_id, req.user_strategy_id, user.id
    )

    # Résoudre le premier EAN selon le scope
    if req.ean:
        ean = req.ean.strip()
    else:
        ean_list = pricing_service.get_products_for_scope(
            None, req.category, req.brand, limit=1,
            company_name=user.company_name
        )
        if not ean_list:
            raise HTTPException(status_code=404, detail="Aucun produit trouvé")
        ean = ean_list[0]

    return pricing_service.compute_price(ean, strategy, company_name=user.company_name)


@router.post("/calculate-batch")
def calculate_batch(req: BatchRequest, authorization: Optional[str] = Header(None)):
    """
    Calcule les prix optimaux pour un ensemble de produits.
    Scope : eans, category, ou brand.
    """
    if not req.eans and not req.category and not req.brand:
        raise HTTPException(status_code=400, detail="Fournir eans, category ou brand")

    user     = auth_service.get_current_user(authorization)
    strategy = strategy_service.resolve_strategy(
        req.system_strategy_id, req.user_strategy_id, user.id
    )
    ean_list = pricing_service.get_products_for_scope(
        req.eans, req.category, req.brand, req.limit or 50,
        company_name=user.company_name
    )

    results, errors = [], []
    for ean in ean_list:
        try:
            results.append(
                pricing_service.compute_price(ean, strategy, company_name=user.company_name)
            )
        except Exception as e:
            errors.append({"ean": ean, "error": str(e)})

    return {
        "strategy_name":   strategy.name,
        "total_processed": len(results),
        "failed":          len(errors),
        "results":         results,
        "errors":          errors
    }