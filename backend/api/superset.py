import httpx
import os
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from config.dependencies import auth_service

router = APIRouter(prefix="/api/v1/superset", tags=["superset"])

SUPERSET_URL = os.getenv("SUPERSET_URL", "http://superset:8088")
SUPERSET_ADMIN_USER = os.getenv("SUPERSET_ADMIN_USERNAME", "admin")
SUPERSET_ADMIN_PASS = os.getenv("SUPERSET_ADMIN_PASSWORD", "admin123")
DASHBOARD_ID = os.getenv("SUPERSET_DASHBOARD_ID", "")

security = HTTPBearer()

@router.get("/token")
async def get_guest_token(
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    user = auth_service.get_current_user(
        authorization=f"Bearer {credentials.credentials}"
    )

    try:
        async with httpx.AsyncClient(base_url=SUPERSET_URL, timeout=30.0) as client:

            r_login = await client.post(
                "/api/v1/security/login",
                json={
                    "username": SUPERSET_ADMIN_USER,
                    "password": SUPERSET_ADMIN_PASS,
                    "provider": "db",
                    "refresh": False,
                },
            )
            r_login.raise_for_status()
            access_token = r_login.json()["access_token"]

            r_csrf = await client.get(
                "/api/v1/security/csrf_token/",
                headers={"Authorization": f"Bearer {access_token}"},
            )
            r_csrf.raise_for_status()
            csrf_token = r_csrf.json()["result"]

            r_guest = await client.post(
                "/api/v1/security/guest_token/",
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "X-CSRFToken": csrf_token,
                    "Referer": SUPERSET_URL,
                },
                json={
                    "resources": [{"type": "dashboard", "id": DASHBOARD_ID}],
                    "rls": [],
                    "user": {
                        "username": user.company_name,
                        "first_name": user.full_name,
                        "last_name": "",
                    },
                },
            )
            r_guest.raise_for_status()
            return {"guest_token": r_guest.json()["token"]}

    except httpx.HTTPStatusError as e:
        raise HTTPException(
            status_code=502,
            detail=f"Superset error {e.response.status_code}: {e.response.text}"
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Internal error while generating Superset guest token: {str(e)}"
        )