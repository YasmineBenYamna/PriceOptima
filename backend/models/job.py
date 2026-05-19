from sqlalchemy import Column, String, Float, Integer, JSON, ForeignKey, DateTime
from config.database import Base
from datetime import datetime
import uuid

def gen_id():
    """Génère un identifiant court basé sur UUID."""
    return str(uuid.uuid4())[:8]

class Job(Base):
    """Modèle représentant un job d'exécution de pricing en masse."""

    __tablename__ = "jobs"

    id               = Column(String,   primary_key=True, default=gen_id)
    user_id          = Column(String,   ForeignKey("users.id"),           nullable=False)
    user_strategy_id = Column(String,   ForeignKey("user_strategies.id"), nullable=True)
    strategy_name    = Column(String,   nullable=False)
    status           = Column(String,   default="pending")
    schedule         = Column(String,   nullable=True)
    total_processed  = Column(Integer,  default=0)
    prices_updated   = Column(Integer,  default=0)
    average_delta    = Column(Float,    default=0)
    runtime_seconds  = Column(Integer,  default=0)
    results          = Column(JSON,     default=[])
    errors           = Column(JSON,     default=[])
    price_changes    = Column(JSON,     default=[])
    created_at       = Column(DateTime, default=datetime.utcnow)
    last_run_at      = Column(DateTime, nullable=True)