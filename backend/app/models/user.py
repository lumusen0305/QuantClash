import uuid
from datetime import datetime
from sqlalchemy import String, Enum, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from app.models.base import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    tier: Mapped[str] = mapped_column(
        Enum("free", "basic", "premium", name="user_tier"),
        default="free",
        nullable=False,
    )
    stripe_customer_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    analyses: Mapped[list["Analysis"]] = relationship("Analysis", back_populates="user")
    daily_quotas: Mapped[list["DailyQuota"]] = relationship("DailyQuota", back_populates="user")
    watchlist: Mapped[list["Watchlist"]] = relationship("Watchlist", back_populates="user")
    strategies: Mapped[list["Strategy"]] = relationship("Strategy", back_populates="user")
