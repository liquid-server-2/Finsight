from __future__ import annotations

from decimal import Decimal
from pydantic import BaseModel, ConfigDict


class CategoryBreakdownItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    category: str
    amount: Decimal
    percentage: float


class MonthlyTrendItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    month: str
    income: Decimal
    spending: Decimal
    net_cash_flow: Decimal


class AccountAnalyticsResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    account_id: int
    currency: str
    total_income: Decimal
    total_spending: Decimal
    net_cash_flow: Decimal
    transaction_count: int
    average_transaction_amount: Decimal
    top_spending_category: str | None
    top_spending_category_amount: Decimal | None
    spending_by_category: list[CategoryBreakdownItem]
    income_by_category: list[CategoryBreakdownItem]
    monthly_trend: list[MonthlyTrendItem]
