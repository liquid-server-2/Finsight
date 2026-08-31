from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.merchant import Merchant
    from app.models.user import User


class MerchantRule(Base):
    __tablename__ = "merchant_rules"
    __table_args__ = (
        UniqueConstraint("user_id", "merchant_id", name="uq_user_merchant_rule"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"), nullable=False, index=True
    )
    merchant_id: Mapped[int] = mapped_column(
        ForeignKey("merchants.id"), nullable=False, index=True
    )
    category: Mapped[str] = mapped_column(String(100), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    user: Mapped[User] = relationship(back_populates="merchant_rules")
    merchant: Mapped[Merchant] = relationship(back_populates="user_rules")
