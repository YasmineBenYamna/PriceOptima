from pydantic import BaseModel
from typing import List, Optional

class JobCreate(BaseModel):
    """Schéma de validation pour la création d'un job de pricing."""
    strategy_name:      str
    schedule:           Optional[str]      = None
    eans:               Optional[List[str]] = None
    category:           Optional[str]      = None
    brand:              Optional[str]      = None
    limit:              Optional[int]      = 50000
    system_strategy_id: Optional[str]      = None
    user_strategy_id:   Optional[str]      = None