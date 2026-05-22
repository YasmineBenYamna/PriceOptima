from fastapi import APIRouter, Header
from typing import Optional
from schemas.auth import RegisterBody, LoginBody
from config.dependencies import auth_service, db_manager

router = APIRouter(prefix="/api/v1", tags=["Auth"])

@router.post("/auth/register", status_code=201)
def register(body: RegisterBody):
    """Inscrit un nouvel utilisateur et retourne un token JWT."""
    return auth_service.register(body, db_manager)

@router.post("/auth/login")
def login(body: LoginBody):
    """Authentifie un utilisateur et retourne un token JWT."""
    return auth_service.login(body)

@router.get("/auth/me")
def me(authorization: Optional[str] = Header(None)):
    """Retourne les informations de l'utilisateur connecté."""
    user = auth_service.get_current_user(authorization)
    return {"id": user.id, "full_name": user.full_name, "company_name": user.company_name, "work_mail": user.work_mail}