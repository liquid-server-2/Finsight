from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, field_validator


class AccountCreate(BaseModel):
    user_id: int | None = None
    name: str
    account_type: str
    institution: str | None = None
    currency: str = "INR"

    @field_validator("name", "account_type")
    @classmethod
    def validate_non_empty(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("must not be empty")
        return value

    @field_validator("institution")
    @classmethod
    def normalize_institution(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return value.strip() or None

    @field_validator("currency")
    @classmethod
    def validate_currency(cls, value: str) -> str:
        value = value.strip().upper()
        if len(value) != 3 or not value.isalpha():
            raise ValueError("must be a three-letter alphabetic code")
        return value


class AccountResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    name: str
    account_type: str
    institution: str | None
    currency: str
    created_at: datetime


class AccountSummaryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    account_id: int
    currency: str
    total_income: Decimal
    total_spending: Decimal
    net_cash_flow: Decimal
    transaction_count: int
