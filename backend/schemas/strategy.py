from pydantic import BaseModel, validator
from typing import List, Optional


class RuleCoeff(BaseModel):
    """Règle avec coefficient pour création/mise à jour."""
    rule_id:     str
    coefficient: float

    @validator("coefficient")
    def coeff_range(cls, v):
        if not (0 <= v <= 1):
            raise ValueError("Coefficient entre 0 et 1")
        return v


class RuleInStrategy(BaseModel):
    """Règle imbriquée dans la réponse d'une stratégie."""
    rule_id:     str
    name:        str
    description: Optional[str] = ""
    coefficient: float
    active:      bool
    params:      dict = {}

    model_config = {"from_attributes": True}


class UserStrategyResponse(BaseModel):
    """Réponse complète d'une stratégie avec règles imbriquées."""
    id:               str
    name:             str
    description:      Optional[str] = ""
    is_custom:        bool
    base_strategy_id: Optional[str] = None
    rules:            List[RuleInStrategy]

    model_config = {"from_attributes": True}


class UserStrategyCreate(BaseModel):
    """Schéma de création d'une stratégie utilisateur."""
    base_strategy_id: Optional[str]  = None
    name:             str
    description:      Optional[str]  = None
    is_custom:        bool           = True   # True = custom créée par user, False = tracking preset
    rules:            List[RuleCoeff]


class UserStrategyUpdate(BaseModel):
    """Schéma de mise à jour d'une stratégie utilisateur."""
    name:        Optional[str]             = None
    description: Optional[str]             = None
    rules:       Optional[List[RuleCoeff]] = None