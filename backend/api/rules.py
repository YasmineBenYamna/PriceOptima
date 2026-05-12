from fastapi import APIRouter, Header
from typing import Optional
from schemas.rule import RuleUpdate, CustomRuleCreate
from config.dependencies import auth_service, rule_service, db_manager

router = APIRouter(prefix="/api/v1/rules", tags=["Rules"])


@router.get("")
def list_rules(authorization: Optional[str] = Header(None)):
    """
    Retourne toutes les règles visibles par l'utilisateur connecté :
    - règles système (communes à tous)
    - règles custom créées par cet utilisateur uniquement
    """
    user = auth_service.get_current_user(authorization)
    return rule_service.list_all_rules(user.id, db_manager)


@router.post("/custom", status_code=201)
def create_custom_rule(body: CustomRuleCreate, authorization: Optional[str] = Header(None)):
    """
    Crée une nouvelle règle personnalisée.
    Le user fournit : nom, description, formule, coefficient.
    """
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