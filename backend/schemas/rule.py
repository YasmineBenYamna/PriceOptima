from pydantic import BaseModel, validator
from typing import Optional


class RuleUpdate(BaseModel):
    """Schéma pour la mise à jour d'une règle système."""
    active: Optional[bool] = None
    params: Optional[dict] = None

class CustomRuleCreate(BaseModel):
    """
    Schéma pour la création d'une règle custom par un utilisateur.
    Le user fournit une formule et une description.
    """
    name:        str
    description: Optional[str] = None
    formula:     str

    @validator("name")
    def name_not_empty(cls, v):
        """Vérifie que le nom n'est pas vide."""
        if not v or not v.strip():
            raise ValueError("Le nom de la règle ne peut pas être vide")
        return v.upper()

    @validator("formula")
    def formula_not_empty(cls, v):
        """Vérifie que la formule ne peut pas être vide."""
        if not v or not v.strip():
            raise ValueError("La formule ne peut pas être vide")
        return v.strip()

    class Config:
        json_schema_extra = {
            "example": {
                "name":        "MA REGLE CUSTOM",
                "description": "Applique une remise de 5% sur le prix moyen du marché",
                "formula":     "market_average * 0.95",
            }
        }