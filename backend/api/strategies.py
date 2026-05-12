from fastapi import APIRouter, Header
from typing import Optional
from schemas.strategy import UserStrategyCreate, UserStrategyUpdate
from config.dependencies import auth_service, strategy_service

router = APIRouter(tags=["Strategies"])


@router.get("/api/v1/strategies")
def list_strategies(authorization: Optional[str] = Header(None)):
    """
    Retourne toutes les stratégies visibles par l'utilisateur connecté :
    - stratégies système (communes à tous)
    - stratégies custom créées par cet utilisateur uniquement (is_custom=True)
    L'historique interne (is_custom=False) n'est jamais affiché.
    """
    user = auth_service.get_current_user(authorization)
    return strategy_service.list_all(user.id)


@router.get("/api/v1/strategies/{strategy_id}")
def get_system(strategy_id: str, authorization: Optional[str] = Header(None)):
    """Retourne le détail d'une stratégie système."""
    auth_service.get_current_user(authorization)
    return strategy_service.get_system_strategy(strategy_id)


@router.post("/api/v1/user-strategies", status_code=201)
def create(body: UserStrategyCreate, authorization: Optional[str] = Header(None)):
    """Crée une nouvelle stratégie personnalisée pour l'utilisateur connecté."""
    user = auth_service.get_current_user(authorization)
    return strategy_service.create_user_strategy(body, user.id)


@router.get("/api/v1/user-strategies/{strategy_id}")
def get_user(strategy_id: str, authorization: Optional[str] = Header(None)):
    """Retourne le détail d'une stratégie custom de l'utilisateur connecté."""
    user = auth_service.get_current_user(authorization)
    return strategy_service.get_user_strategy(strategy_id, user.id)


@router.put("/api/v1/user-strategies/{strategy_id}")
def update(strategy_id: str, body: UserStrategyUpdate, authorization: Optional[str] = Header(None)):
    """Met à jour une stratégie custom de l'utilisateur connecté."""
    user = auth_service.get_current_user(authorization)
    return strategy_service.update_user_strategy(strategy_id, body, user.id)


@router.delete("/api/v1/user-strategies/{strategy_id}", status_code=204)
def delete(strategy_id: str, authorization: Optional[str] = Header(None)):
    """Supprime une stratégie custom de l'utilisateur connecté."""
    user = auth_service.get_current_user(authorization)
    strategy_service.delete_user_strategy(strategy_id, user.id)