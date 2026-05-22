from fastapi import HTTPException
from jose import jwt, JWTError
from datetime import datetime, timedelta
from typing import Optional
from sqlalchemy import text
from models.user import User
from config.settings import SECRET_KEY, ALGORITHM, TOKEN_EXPIRE_MINUTES
import bcrypt


class AuthService:
    """
    Gère l'authentification : inscription, connexion,
    génération et vérification des tokens JWT.
    """

    def __init__(self, user_repo):
        """
        Args:
            user_repo: Instance de UserRepository
        """
        self._user_repo = user_repo

    def _hash_password(self, password: str) -> str:
        """Hache un mot de passe avec bcrypt."""
        return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

    def _verify_password(self, plain: str, hashed: str) -> bool:
        """Vérifie qu'un mot de passe correspond à son hash."""
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))

    def _create_token(self, user_id: str) -> str:
        """Génère un token JWT pour un utilisateur."""
        exp = datetime.utcnow() + timedelta(minutes=TOKEN_EXPIRE_MINUTES)
        return jwt.encode({"sub": user_id, "exp": exp}, SECRET_KEY, algorithm=ALGORITHM)

    def _check_store_exists(self, company_name: str, db_manager) -> bool:
        """Vérifie si le magasin de l'utilisateur existe dans la base marché."""
        try:
            with db_manager.market_conn() as conn:
                result = conn.execute(
                    text("SELECT COUNT(*) FROM public.prices_raw WHERE location_osm_name ILIKE :name"),
                    {"name": f"%{company_name}%"}
                )
                return result.fetchone()[0] > 0
        except Exception:
            return False
    def _resolve_magasin_id(self, company_name: str, db_manager) -> str | None:
        try:
            with db_manager.market_conn() as conn:
                result = conn.execute(
                    text("""
                        SELECT magasin_id
                        FROM silver.magasin
                        WHERE nom_enseigne ILIKE :name
                        LIMIT 1
                    """),
                    {"name": f"%{company_name}%"}
                )
                row = result.fetchone()
                return row[0] if row else None
        except Exception:
            return None
    def register(self, body, db_manager) -> dict:
        """Inscrit un nouvel utilisateur et retourne un token JWT."""
        if self._user_repo.find_by_email(body.work_mail):
            raise HTTPException(status_code=400, detail="Email déjà utilisé")
        magasin_id = self._resolve_magasin_id(body.company_name, db_manager) 
        user = User(
            full_name    = body.full_name,
            work_mail    = body.work_mail,
            company_name = body.company_name,
            password     = self._hash_password(body.password),
            magasin_id   = magasin_id
        )
        user = self._user_repo.create(user)
        try:
            store_found = self._check_store_exists(body.company_name, db_manager)
        except Exception:
            store_found = False
        return {
            "access_token": self._create_token(user.id),
            "token_type":   "bearer",
            "user": {
                "id":           user.id,
                "full_name":    user.full_name,
                "company_name": user.company_name,
                "magasin_id":   user.magasin_id,
                "work_mail":    user.work_mail,
                "store_found":  store_found,
                "message":      f"Magasin '{body.company_name}' {'trouvé' if store_found else 'non trouvé — calcul basé sur prix marché'}."
            }
        }

    def login(self, body) -> dict:
        """Authentifie un utilisateur et retourne un token JWT."""
        user = self._user_repo.find_by_email(body.work_mail)
        if not user or not self._verify_password(body.password, user.password):
            raise HTTPException(status_code=401, detail="Email ou mot de passe incorrect")
        return {
            "access_token": self._create_token(user.id),
            "token_type":   "bearer",
            "user": {
                "id":           user.id,
                "full_name":    user.full_name,
                "company_name": user.company_name,
                "magasin_id":   user.magasin_id,
                "work_mail":    user.work_mail
            }
        }

    def get_current_user(self, authorization: Optional[str] = None):
        """Décode le token JWT et retourne l'utilisateur courant."""
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Token manquant ou invalide")
        token = authorization.split(" ")[1]
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            user_id = payload.get("sub")
            if not user_id:
                raise HTTPException(status_code=401, detail="Token invalide")
        except JWTError:
            raise HTTPException(status_code=401, detail="Token invalide ou expiré")
        user = self._user_repo.find_by_id(user_id)
        if not user:
            raise HTTPException(status_code=401, detail="Utilisateur introuvable")
        return user