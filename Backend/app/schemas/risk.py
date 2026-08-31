from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

RiskSeverity = Literal["LOW", "MODERATE", "HIGH"]
RiskLevel = Literal["LOW", "MODERATE", "HIGH", "INSUFFICIENT_DATA"]


class RiskSignal(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    signal_type: str
    severity: RiskSeverity
    title: str
    message: str
    evidence: dict[str, Any] = Field(default_factory=dict)
    transaction_id: int | None = None


class RiskMetrics(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    total_income: Decimal
    total_spending: Decimal
    net_cash_flow: Decimal
    monthly_average_spending: Decimal | None = None
    monthly_average_income: Decimal | None = None
    discretionary_spending_ratio: float | None = None
    top_category_concentration: float | None = None
    months_analyzed: int = 0
    total_transactions_analyzed: int = 0


class RiskReportResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    account_id: int
    currency: str
    overall_level: RiskLevel
    score: int | None = None
    score_description: str | None = None
    metrics: RiskMetrics
    signals: list[RiskSignal] = Field(default_factory=list)
    unavailable_signals: list[str] = Field(default_factory=list)
    disclaimer: str
    generated_at: datetime
