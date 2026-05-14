from pydantic import BaseModel, validator
from typing import List

class EANsBody(BaseModel):
    """Schéma de validation pour une recherche par liste d'EANs."""
    eans: List[str]

    @validator("eans")
    def not_empty(cls, v):
        if not v:
            raise ValueError("Liste d'EANs vide")
        return [e.strip() for e in v if e.strip()]