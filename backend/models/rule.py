from sqlalchemy import Column, String, Boolean, JSON, DateTime, Text, ForeignKey
from config.database import Base
from datetime import datetime
import uuid


def gen_id():
    """Génère un identifiant court basé sur UUID."""
    return str(uuid.uuid4())[:8]


class Rule(Base):
    """Modèle représentant une règle de pricing système."""

    __tablename__ = "rules"

    id          = Column(String,   primary_key=True, default=gen_id)
    name        = Column(String,   nullable=False)
    description = Column(Text)
    params      = Column(JSON,     default={})
    is_system   = Column(Boolean,  default=True)
    active      = Column(Boolean,  default=True)
    created_at  = Column(DateTime, default=datetime.utcnow)


class CustomRule(Base):
    """
    Règle de pricing créée par un utilisateur.
    Le user fournit une formule personnalisée et une description.
    """

    __tablename__ = "custom_rules"

    id          = Column(String,   primary_key=True, default=gen_id)
    user_id     = Column(String,   ForeignKey("users.id"), nullable=False)
    name        = Column(String,   nullable=False)
    description = Column(Text)
    formula     = Column(Text,     nullable=False)
    active      = Column(Boolean,  default=True)
    created_at  = Column(DateTime, default=datetime.utcnow)