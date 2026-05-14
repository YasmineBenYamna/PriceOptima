from pydantic import BaseModel, field_validator
from typing import Optional, List, Union


class LLMSuggestRequest(BaseModel):
    """
    Requête de suggestion de stratégie LLM.
    Fournir au moins category ou brand (ou les deux).

    Formats acceptés pour category et brand :
    - Une seule valeur  : "Snacks"
    - Plusieurs valeurs : ["Snacks", "Boissons"]
    - Non fourni        : null / absent
    """
    category: Optional[Union[str, List[str]]] = None
    brand:    Optional[Union[str, List[str]]] = None

    @field_validator("category", "brand", mode="before")
    @classmethod
    def normalize_to_list_or_none(cls, v):
        """Normalise str → [str], filtre les valeurs vides."""
        if v is None:
            return None
        if isinstance(v, str):
            v = [v]
        cleaned = [x.strip() for x in v if x and x.strip()]
        return cleaned if cleaned else None