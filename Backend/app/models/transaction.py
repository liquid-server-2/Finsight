from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Numeric, String, false, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.account import Account
    from app.models.merchant import Merchant


class Transaction(Base):
    __tablename__ = "transactions"
    __table_args__ = (Index("ix_transactions_account_date", "account_id", "transaction_date"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id"), nullable=False)
    merchant_id: Mapped[int | None] = mapped_column(
        ForeignKey("merchants.id"), nullable=True, index=True
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, server_default="INR")
    transaction_date: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
    description: Mapped[str | None] = mapped_column(String(500), nullable=True)
    category: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    transaction_type: Mapped[str] = mapped_column(String(50), nullable=False)
    is_recurring: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=false()
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    account: Mapped[Account] = relationship(back_populates="transactions")
    merchant: Mapped[Merchant | None] = relationship(back_populates="transactions")
