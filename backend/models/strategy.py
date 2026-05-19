from sqlalchemy import Column, String, Boolean, Float, ForeignKey, DateTime, Text
from sqlalchemy.orm import relationship
from config.database import Base
from datetime import datetime
import uuid


class Strategy(Base):
    __tablename__ = "strategies"

    id          = Column(String,   primary_key=True)
    name        = Column(String,   nullable=False)
    description = Column(Text)
    created_at  = Column(DateTime, default=datetime.utcnow)
    rules       = relationship("StrategyRule", back_populates="strategy",
                               cascade="all, delete", lazy="joined")


class StrategyRule(Base):
    __tablename__ = "strategy_rules"

    id          = Column(String, primary_key=True, default=lambda: str(uuid.uuid4())[:8])
    strategy_id = Column(String, ForeignKey("strategies.id"), nullable=False)
    rule_id     = Column(String, ForeignKey("rules.id"),      nullable=False)
    coefficient = Column(Float,  nullable=False)
    strategy    = relationship("Strategy", back_populates="rules")
    rule        = relationship("Rule",     lazy="joined")


class UserStrategy(Base):
    __tablename__ = "user_strategies"

    id               = Column(String,   primary_key=True, default=lambda: str(uuid.uuid4())[:8])
    user_id          = Column(String,   ForeignKey("users.id"),      nullable=False)
    base_strategy_id = Column(String,   ForeignKey("strategies.id"), nullable=True)
    name             = Column(String,   nullable=False)
    description      = Column(Text)
    is_custom        = Column(Boolean,  default=False)
    created_at       = Column(DateTime, default=datetime.utcnow)
    rules            = relationship("UserStrategyRule", back_populates="user_strategy",
                                cascade="all, delete", lazy="joined")


class UserStrategyRule(Base):
    __tablename__ = "user_strategy_rules"

    id               = Column(String, primary_key=True, default=lambda: str(uuid.uuid4())[:8])
    user_strategy_id = Column(String, ForeignKey("user_strategies.id"), nullable=False)
    rule_id          = Column(String, ForeignKey("rules.id"),           nullable=False)
    coefficient      = Column(Float,  nullable=False)
    user_strategy    = relationship("UserStrategy", back_populates="rules")
    rule             = relationship("Rule",         lazy="joined")
