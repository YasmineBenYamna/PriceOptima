from fastapi import APIRouter, Header
from typing import Optional
from schemas.strategy import UserStrategyCreate, UserStrategyUpdate
from config.dependencies import auth_service, strategy_service

router = APIRouter(tags=["Strategies"])


# ─── System strategies ────────────────────────────────────────────────────────

@router.get("/api/v1/strategies")
def list_strategies(authorization: Optional[str] = Header(None)):
    """
    Retourne toutes les strategies visibles par l'utilisateur connecte :
    - strategies systeme (communes a tous)
    - strategies custom creees par cet utilisateur uniquement (is_custom=True)
    L'historique interne (is_custom=False) n'est jamais affiche.
    """
    user = auth_service.get_current_user(authorization)
    return strategy_service.list_all(user.id)


@router.get("/api/v1/strategies/{strategy_id}")
def get_system(strategy_id: str, authorization: Optional[str] = Header(None)):
    """Retourne le detail d'une strategie systeme."""
    auth_service.get_current_user(authorization)
    return strategy_service.get_system_strategy(strategy_id)


# ─── User strategies ──────────────────────────────────────────────────────────
# IMPORTANT: routes sans parametre de chemin DOIVENT etre declarees AVANT
# les routes avec {strategy_id}, sinon FastAPI traite "user-strategies" comme
# un strategy_id et repond 405 Method Not Allowed.

@router.get("/api/v1/user-strategies")
def list_user_strategies(authorization: Optional[str] = Header(None)):
    """
    Retourne les strategies de l'utilisateur connecte avec is_custom=True.
    Les strategies avec is_custom=False (presets utilises) ne sont pas retournees
    car elles ne doivent pas apparaitre dans l'interface utilisateur.
    """
    user = auth_service.get_current_user(authorization)
    return strategy_service.list_user_strategies(user.id)


@router.post("/api/v1/user-strategies", status_code=201)
def create(body: UserStrategyCreate, authorization: Optional[str] = Header(None)):
    """Cree une nouvelle strategie personnalisee pour l'utilisateur connecte."""
    user = auth_service.get_current_user(authorization)
    return strategy_service.create_user_strategy(body, user.id)


@router.get("/api/v1/user-strategies/{strategy_id}")
def get_user(strategy_id: str, authorization: Optional[str] = Header(None)):
    """Retourne le detail d'une strategie de l'utilisateur connecte."""
    user = auth_service.get_current_user(authorization)
    return strategy_service.get_user_strategy(strategy_id, user.id)


@router.put("/api/v1/user-strategies/{strategy_id}")
def update(strategy_id: str, body: UserStrategyUpdate, authorization: Optional[str] = Header(None)):
    """Met a jour une strategie custom de l'utilisateur connecte."""
    user = auth_service.get_current_user(authorization)
    return strategy_service.update_user_strategy(strategy_id, body, user.id)


@router.delete("/api/v1/user-strategies/{strategy_id}", status_code=204)
def delete(strategy_id: str, authorization: Optional[str] = Header(None)):
    """Supprime une strategie custom de l'utilisateur connecte."""
    user = auth_service.get_current_user(authorization)
    strategy_service.delete_user_strategy(strategy_id, user.id)