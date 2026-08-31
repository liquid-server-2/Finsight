from __future__ import annotations

from collections import defaultdict
from decimal import Decimal
from typing import Sequence

from app.models.account import Account
from app.models.transaction import Transaction
from app.schemas.analytics import (
    AccountAnalyticsResponse,
    CategoryBreakdownItem,
    MonthlyTrendItem,
)


def compute_account_analytics(
    account: Account,
    transactions: Sequence[Transaction],
) -> AccountAnalyticsResponse:
    """
    Computes comprehensive financial analytics for an account.
    All calculations use Decimal for exact monetary precision.
    """
    account_id = account.id
    currency = account.currency

    transaction_count = len(transactions)
    if transaction_count == 0:
        return AccountAnalyticsResponse(
            account_id=account_id,
            currency=currency,
            total_income=Decimal("0.00"),
            total_spending=Decimal("0.00"),
            net_cash_flow=Decimal("0.00"),
            transaction_count=0,
            average_transaction_amount=Decimal("0.00"),
            top_spending_category=None,
            top_spending_category_amount=None,
            spending_by_category=[],
            income_by_category=[],
            monthly_trend=[],
        )

    total_income = Decimal("0.00")
    total_spending = Decimal("0.00")
    total_abs_volume = Decimal("0.00")

    spending_cat_map: dict[str, Decimal] = defaultdict(lambda: Decimal("0.00"))
    income_cat_map: dict[str, Decimal] = defaultdict(lambda: Decimal("0.00"))

    # month_key -> {"income": Decimal, "spending": Decimal}
    monthly_data: dict[str, dict[str, Decimal]] = defaultdict(
        lambda: {"income": Decimal("0.00"), "spending": Decimal("0.00")}
    )

    for tx in transactions:
        amount = tx.amount
        abs_amount = abs(amount)
        total_abs_volume += abs_amount

        # Category from DB or fallback to 'Other'
        category = (tx.category.strip() if tx.category and tx.category.strip() else "Other")

        # Month string YYYY-MM
        month_key = tx.transaction_date.strftime("%Y-%m")

        if amount > 0:
            total_income += amount
            income_cat_map[category] += amount
            monthly_data[month_key]["income"] += amount
        elif amount < 0:
            total_spending += abs_amount
            spending_cat_map[category] += abs_amount
            monthly_data[month_key]["spending"] += abs_amount

    net_cash_flow = total_income - total_spending
    average_transaction_amount = round(total_abs_volume / Decimal(transaction_count), 2)

    # 1. Spending by Category Breakdown
    spending_by_category: list[CategoryBreakdownItem] = []
    for cat, cat_amount in spending_cat_map.items():
        percentage = (
            round(float((cat_amount / total_spending) * 100), 2)
            if total_spending > 0
            else 0.0
        )
        spending_by_category.append(
            CategoryBreakdownItem(
                category=cat,
                amount=cat_amount,
                percentage=percentage,
            )
        )
    # Sort descending by amount
    spending_by_category.sort(key=lambda x: x.amount, reverse=True)

    # Top spending category
    top_spending_category: str | None = None
    top_spending_category_amount: Decimal | None = None
    if spending_by_category and spending_by_category[0].amount > 0:
        top_spending_category = spending_by_category[0].category
        top_spending_category_amount = spending_by_category[0].amount

    # 2. Income by Category Breakdown
    income_by_category: list[CategoryBreakdownItem] = []
    for cat, cat_amount in income_cat_map.items():
        percentage = (
            round(float((cat_amount / total_income) * 100), 2)
            if total_income > 0
            else 0.0
        )
        income_by_category.append(
            CategoryBreakdownItem(
                category=cat,
                amount=cat_amount,
                percentage=percentage,
            )
        )
    income_by_category.sort(key=lambda x: x.amount, reverse=True)

    # 3. Monthly Trend (chronologically ascending)
    monthly_trend: list[MonthlyTrendItem] = []
    for month_key in sorted(monthly_data.keys()):
        m_income = monthly_data[month_key]["income"]
        m_spending = monthly_data[month_key]["spending"]
        m_net = m_income - m_spending
        monthly_trend.append(
            MonthlyTrendItem(
                month=month_key,
                income=m_income,
                spending=m_spending,
                net_cash_flow=m_net,
            )
        )

    return AccountAnalyticsResponse(
        account_id=account_id,
        currency=currency,
        total_income=total_income,
        total_spending=total_spending,
        net_cash_flow=net_cash_flow,
        transaction_count=transaction_count,
        average_transaction_amount=average_transaction_amount,
        top_spending_category=top_spending_category,
        top_spending_category_amount=top_spending_category_amount,
        spending_by_category=spending_by_category,
        income_by_category=income_by_category,
        monthly_trend=monthly_trend,
    )
