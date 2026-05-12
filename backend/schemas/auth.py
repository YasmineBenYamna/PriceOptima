from pydantic import BaseModel, EmailStr, validator

class RegisterBody(BaseModel):
    """Schéma de validation pour l'inscription d'un utilisateur."""
    full_name:    str
    work_mail:    EmailStr
    company_name: str
    password:     str

    @validator("password")
    def password_min(cls, v):
        """Vérifie que le mot de passe contient au moins 6 caractères."""
        if len(v) < 6:
            raise ValueError("Mot de passe : 6 caractères minimum")
        return v

class LoginBody(BaseModel):
    """Schéma de validation pour la connexion d'un utilisateur."""
    work_mail: EmailStr
    password:  str