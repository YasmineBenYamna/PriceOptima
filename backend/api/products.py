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
    """
    Retourne les infos produit pour une liste d'EANs.
    Pas de prix dans la réponse — le prix est résolu au moment du calcul.
    """
    auth_service.get_current_user(authorization)
    return product_service.get_by_eans(body.eans)


@router.post("/import-csv")
def import_csv_route(
    file: UploadFile = File(...),
    authorization: Optional[str] = Header(None)
):
    """
    Importe des EANs depuis un fichier CSV.
    Format attendu : une colonne 'ean', 'EAN', ou 'code'. Pas de colonne prix.
    """
    auth_service.get_current_user(authorization)
    return product_service.import_csv(file.file.read().decode("utf-8"))


@router.get("/categories")
def categories(authorization: Optional[str] = Header(None)):
    """Retourne la liste des catégories disponibles avec leur nombre de produits."""
    auth_service.get_current_user(authorization)
    return product_service.get_categories()


@router.get("/by-category/{category}")
def by_category(
    category: str,
    limit: int = Query(50),
    authorization: Optional[str] = Header(None)
):
    """Retourne les produits d'une catégorie donnée."""
    auth_service.get_current_user(authorization)
    return product_service.get_by_category(category, limit)


@router.get("/brands")
def brands(
    limit: int = Query(50),
    authorization: Optional[str] = Header(None)
):
    """Retourne la liste des marques disponibles avec leur nombre de produits."""
    auth_service.get_current_user(authorization)
    return product_service.get_brands(limit)


@router.get("/by-brand/{brand}")
def by_brand(
    brand: str,
    limit: int = Query(50),
    authorization: Optional[str] = Header(None)
):
    """Retourne les produits d'une marque donnée."""
    auth_service.get_current_user(authorization)
    return product_service.get_by_brand(brand, limit)