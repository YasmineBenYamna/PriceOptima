from pydantic import BaseModel, validator
from typing import List, Optional


class CalculateRequest(BaseModel):
    """
    Schéma pour le calcul de prix d'un produit.
    Exactement un seul scope doit être fourni : ean, category, ou brand.
    """
    ean:                Optional[str] = None
    category:           Optional[str] = None
    brand:              Optional[str] = None
    system_strategy_id: Optional[str] = None
    user_strategy_id:   Optional[str] = None

    @validator("ean", pre=True, always=True)
    def strip_ean(cls, v):
        """Supprime les espaces autour de l'EAN."""
        if v and v.strip() == "":
            return None
        return v.strip() if v else None

    @validator("category", pre=True, always=True)
    def strip_category(cls, v):
        """Supprime les espaces et convertit vide en None."""
        if v and v.strip() == "":
            return None
        return v.strip() if v else None

    @validator("brand", pre=True, always=True)
    def strip_brand(cls, v):
        """Supprime les espaces et convertit vide en None."""
        if v and v.strip() == "":
            return None
        return v.strip() if v else None

    @validator("brand", always=True)
    def exactly_one_scope(cls, brand, values):
        """Vérifie qu'exactement un scope est fourni parmi ean, category, brand."""
        ean      = values.get("ean")
        category = values.get("category")

        scopes = [s for s in [ean, category, brand] if s]

        if len(scopes) == 0:
            raise ValueError("Vous devez fournir exactement un scope : ean, category, ou brand")
        if len(scopes) > 1:
            raise ValueError("Choisissez un seul scope : ean OU category OU brand — pas plusieurs")
        return brand


class BatchRequest(BaseModel):
    """
    Schéma pour le calcul de prix en lot.
    Exactement un seul scope doit être fourni : eans, category, ou brand.
    """
    eans:               Optional[List[str]] = None
    category:           Optional[str]       = None
    brand:              Optional[str]       = None
    limit:              Optional[int]       = 50
    system_strategy_id: Optional[str]       = None
    user_strategy_id:   Optional[str]       = None

    @validator("category", pre=True, always=True)
    def strip_category(cls, v):
        """Supprime les espaces et convertit vide en None."""
        if v and v.strip() == "":
            return None
        return v.strip() if v else None

    @validator("brand", pre=True, always=True)
    def strip_brand(cls, v):
        """Supprime les espaces et convertit vide en None."""
        if v and v.strip() == "":
            return None
        return v.strip() if v else None

    @validator("brand", always=True)
    def exactly_one_scope(cls, brand, values):
        """Vérifie qu'exactement un scope est fourni parmi eans, category, brand."""
        eans     = values.get("eans") or []
        category = values.get("category")

        scopes = []
        if eans:     scopes.append("eans")
        if category: scopes.append("category")
        if brand:    scopes.append("brand")

        if len(scopes) == 0:
            raise ValueError("Vous devez fournir exactement un scope : eans, category, ou brand")
        if len(scopes) > 1:
            raise ValueError("Choisissez un seul scope : eans OU category OU brand — pas plusieurs")
        return brand


class ProductInput(BaseModel):
    """Usage interne uniquement."""
    id:    str
    price: float