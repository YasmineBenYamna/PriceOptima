from sqlalchemy import Column, String, Boolean, JSON, DateTime, Text, ForeignKey
from config.database import Base
from datetime import datetime
import uuid


class Rule(Base):
    __tablename__ = "rules"

    id          = Column(String,   primary_key=True, default=lambda: str(uuid.uuid4())[:8])
    name        = Column(String,   nullable=False)
    description = Column(Text)
    params      = Column(JSON,     default=dict)
    is_system   = Column(Boolean,  default=True)
    active      = Column(Boolean,  default=True)
    created_at  = Column(DateTime, default=datetime.utcnow)


class CustomRule(Base):
    __tablename__ = "custom_rules"

    id          = Column(String,   primary_key=True, default=lambda: str(uuid.uuid4())[:8])
    user_id     = Column(String,   ForeignKey("users.id"), nullable=False)
    name        = Column(String,   nullable=False)
    description = Column(Text)
    formula     = Column(Text,     nullable=False)
    active      = Column(Boolean,  default=True)
    created_at  = Column(DateTime, default=datetime.utcnow)