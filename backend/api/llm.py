from fastapi import APIRouter, Header, Response
from fastapi.encoders import jsonable_encoder
from typing import Optional
import json
from schemas.llm import LLMSuggestRequest
from config.dependencies import auth_service, llm_service

router = APIRouter(prefix="/api/v1/pricing", tags=["LLM"])

@router.post("/suggest-strategy")
def suggest_strategy(
    req: LLMSuggestRequest,
    authorization: Optional[str] = Header(None)
):
    user = auth_service.get_current_user(authorization)
    result = llm_service.suggest_strategy(
        category     = req.category,
        brand        = req.brand,
        magasin_id   = user.magasin_id,
        company_name = user.company_name
    )
    return Response(
        content=json.dumps(jsonable_encoder(result), ensure_ascii=False),
        media_type="application/json; charset=utf-8"
    )