from sqlalchemy import Column, String, Float, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from config.database import Base
from datetime import datetime
import uuid


class PriceResult(Base):
    """Stocke les prix calculés par job pour chaque produit."""

    __tablename__ = "price_results"

    id             = Column(String,   primary_key=True, default=lambda: str(uuid.uuid4()))  # ← String
    job_id         = Column(String,   ForeignKey("jobs.id"),  nullable=False)                # ← String
    user_id        = Column(String,             ForeignKey("users.id"),  nullable=False)
    strategy_name  = Column(String,             nullable=False)
    scope_type     = Column(String,             nullable=True)   # 'ean', 'category', 'brand'
    scope_value    = Column(String,             nullable=True)   # valeur du scope
    product_ean    = Column(String,             nullable=False)
    original_price = Column(Float,              nullable=True)
    final_price    = Column(Float,              nullable=False)
    price_change   = Column(Float,              nullable=True)
    change_pct     = Column(Float,              nullable=True)
    currency       = Column(String,             default="EUR")
    computed_at    = Column(DateTime,           default=datetime.utcnow)