from pydantic import BaseModel, validator
from typing import List, Optional

class RuleCoeff(BaseModel):
    """Schéma représentant une règle avec son coefficient dans une stratégie."""
    rule_id:     str
    coefficient: float

    @validator("coefficient")
    def coeff_range(cls, v):
        """Vérifie que le coefficient est compris entre 0 et 1."""
        if not (0 <= v <= 1):
            raise ValueError("Coefficient entre 0 et 1")
        return v

class UserStrategyCreate(BaseModel):
    """Schéma de validation pour la création d'une stratégie utilisateur."""
    base_strategy_id: Optional[str] = None
    name:             str
    description:      Optional[str] = None
    rules:            List[RuleCoeff]

class UserStrategyUpdate(BaseModel):
    """Schéma de validation pour la mise à jour d'une stratégie utilisateur."""
    name:        Optional[str]             = None
    description: Optional[str]             = None
    rules:       Optional[List[RuleCoeff]] = None