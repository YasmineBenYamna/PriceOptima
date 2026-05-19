from sqlalchemy import Column, String, DateTime
from config.database import Base
from datetime import datetime
import uuid


class User(Base):
    __tablename__ = "users"

    id           = Column(String,   primary_key=True, default=lambda: str(uuid.uuid4())[:8])
    full_name    = Column(String,   nullable=False)
    work_mail    = Column(String,   unique=True, nullable=False)
    company_name = Column(String,   nullable=False)
    password     = Column(String,   nullable=False)
    magasin_id   = Column(String,   nullable=True)
    created_at   = Column(DateTime, default=datetime.utcnow)