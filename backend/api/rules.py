from fastapi import APIRouter, Header, Query
from typing import Optional
from schemas.rule import RuleUpdate, CustomRuleCreate
from config.dependencies import auth_service, rule_service, db_manager

router = APIRouter(prefix="/api/v1/rules", tags=["Rules"])


@router.get("")
def list_rules(
    authorization: Optional[str] = Header(None),
    is_system:     Optional[bool] = Query(None),
    active:        Optional[bool] = Query(None),
    name:          Optional[str]  = Query(None),
):
    """
    Retourne les règles visibles par l'utilisateur connecté.
    Filtres optionnels : is_system, active, name.
    """
    user = auth_service.get_current_user(authorization)
    return rule_service.list_all_rules(user.id, db_manager, is_system=is_system, active=active, name=name)


@router.post("/custom", status_code=201)
def create_custom_rule(body: CustomRuleCreate, authorization: Optional[str] = Header(None)):
    """Crée une nouvelle règle personnalisée."""
    user = auth_service.get_current_user(authorization)
    return rule_service.create_custom_rule(body, user.id, db_manager)


@router.get("/{rule_id}")
def get_rule(rule_id: str, authorization: Optional[str] = Header(None)):
    """Retourne une règle système par son identifiant."""
    auth_service.get_current_user(authorization)
    return rule_service.get_rule(rule_id)


@router.put("/{rule_id}")
def update_rule(rule_id: str, body: RuleUpdate, authorization: Optional[str] = Header(None)):
    """Met à jour les paramètres ou le statut d'une règle système."""
    auth_service.get_current_user(authorization)
    return rule_service.update_rule(rule_id, body)