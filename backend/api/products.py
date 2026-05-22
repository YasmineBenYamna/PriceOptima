from fastapi import APIRouter, UploadFile, File, Query, Header
from typing import Optional
from schemas.product import EANsBody
from config.dependencies import auth_service, product_service

router = APIRouter(prefix="/api/v1/products", tags=["Products"])


@router.get("/search")
def search(
    q: str = Query("", min_length=0),
    limit: int = Query(20),
    authorization: Optional[str] = Header(None)
):
    auth_service.get_current_user(authorization)
    return product_service.search(q, limit)


@router.post("/by-eans")
def by_eans(body: EANsBody, authorization: Optional[str] = Header(None)):
    auth_service.get_current_user(authorization)
    return product_service.get_by_eans(body.eans)


@router.post("/import-csv")
def import_csv_route(
    file: UploadFile = File(...),
    authorization: Optional[str] = Header(None)
):
    auth_service.get_current_user(authorization)
    return product_service.import_csv(file.file.read().decode("utf-8"))


@router.get("/categories")
def categories(authorization: Optional[str] = Header(None)):
    user = auth_service.get_current_user(authorization)  # ← user au lieu de juste valider
    return product_service.get_categories(magasin_id=user.magasin_id)  # ← filtre magasin


@router.get("/by-category/{category}")
def by_category(
    category: str,
    limit: int = Query(50),
    authorization: Optional[str] = Header(None)
):
    user = auth_service.get_current_user(authorization)
    return product_service.get_by_category(category, user.magasin_id, limit)  # ← magasin_id ajouté


@router.get("/brands")
def brands(
    limit: int = Query(50),
    authorization: Optional[str] = Header(None)
):
    user = auth_service.get_current_user(authorization)
    return product_service.get_brands(limit, magasin_id=user.magasin_id)  # ← filtre magasin


@router.get("/by-brand/{brand}")
def by_brand(
    brand: str,
    limit: int = Query(50),
    authorization: Optional[str] = Header(None)
):
    user = auth_service.get_current_user(authorization)
    return product_service.get_by_brand(brand, user.magasin_id, limit)  # ← magasin_id ajouté