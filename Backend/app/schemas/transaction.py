from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict


class TransactionCategoryUpdate(BaseModel):
    category: str


class TransactionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    account_id: int
    merchant_id: int | None
    amount: Decimal
    currency: str
    transaction_date: datetime
    description: str | None
    category: str | None
    transaction_type: str
    is_recurring: bool
    created_at: datetime