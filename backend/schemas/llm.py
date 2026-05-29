from pydantic import BaseModel, field_validator
from typing import Optional, List, Union, Dict, Any


class LLMSuggestRequest(BaseModel):
    category: Optional[Union[str, List[str]]] = None
    brand:    Optional[Union[str, List[str]]] = None

    @field_validator("category", "brand", mode="before")
    @classmethod
    def normalize_to_list_or_none(cls, v):
        if v is None:
            return None
        if isinstance(v, str):
            v = [v]
        cleaned = [x.strip() for x in v if x and x.strip()]
        return cleaned if cleaned else None


class RuleInStrategy(BaseModel):
    rule_id:     Optional[str] = None   # ← custom rules ont rule_id=None
    rule_name:   str
    coefficient: float
    params:      Dict[str, Any] = {}
    is_new:      bool = False
    description: Optional[str] = None  # ← sinon Pydantic ignore le champ
    formula:     Optional[str] = None  # ← idem

class LLMSuggestResponse(BaseModel):
    recommended_strategy_id:   str
    recommended_strategy_name: str
    is_custom:                 bool
    confidence_score:          Optional[float] = None
    rules:                     List[RuleInStrategy]
    reasoning:                 Dict[str, Any] = {}
    explanation:               str = ""
    context_used:              Dict[str, Any] = {}
    adjusted_by_guard: bool = False