from __future__ import annotations

import math
from datetime import datetime, timezone
from decimal import Decimal
from typing import Sequence

from app.models.account import Account
from app.models.transaction import Transaction
from app.schemas.analytics import AccountAnalyticsResponse
from app.schemas.risk import (
    RiskLevel,
    RiskMetrics,
    RiskReportResponse,
    RiskSeverity,
    RiskSignal,
)

DISCRETIONARY_CATEGORIES = {
    "Shopping",
    "Entertainment",
    "Food & Dining",
    "Travel",
}

DISCLAIMER_TEXT = (
    "FinSight Risk Engine provides deterministic financial pattern awareness and anomaly detection "
    "based solely on imported transaction records. It does not constitute a credit score, "
    "solvency guarantee, or professional financial advice."
)


def _compute_median_and_iqr(values: list[Decimal]) -> tuple[Decimal, Decimal, Decimal]:
    """
    Computes (median, Q1, Q3) for a sorted list of Decimals.
    """
    n = len(values)
    if n == 0:
        return Decimal("0.00"), Decimal("0.00"), Decimal("0.00")

    def _percentile(p: float) -> Decimal:
        k = (n - 1) * p
        f = math.floor(k)
        c = math.ceil(k)
        if f == c:
            return values[int(k)]
        d0 = values[f] * Decimal(str(c - k))
        d1 = values[c] * Decimal(str(k - f))
        return d0 + d1

    median = _percentile(0.5)
    q1 = _percentile(0.25)
    q3 = _percentile(0.75)
    return round(median, 2), round(q1, 2), round(q3, 2)


def compute_account_risk(
    account: Account,
    transactions: Sequence[Transaction],
    analytics: AccountAnalyticsResponse,
) -> RiskReportResponse:
    """
    Computes deterministic, evidence-based financial risk patterns and anomalies
    for a specific account.
    """
    account_id = account.id
    currency = account.currency
    now_utc = datetime.now(timezone.utc)

    total_transactions = len(transactions)
    debit_transactions = [
        tx for tx in transactions if tx.amount < Decimal("0.00")
    ]
    recurring_debit_transactions = [
        tx for tx in debit_transactions if tx.is_recurring
    ]

    total_income = analytics.total_income
    total_spending = analytics.total_spending
    net_cash_flow = analytics.net_cash_flow
    monthly_trend = analytics.monthly_trend
    months_count = len(monthly_trend)

    # Empty / Insufficient data guard
    if total_transactions == 0:
        metrics = RiskMetrics(
            total_income=Decimal("0.00"),
            total_spending=Decimal("0.00"),
            net_cash_flow=Decimal("0.00"),
            monthly_average_spending=None,
            monthly_average_income=None,
            discretionary_spending_ratio=None,
            top_category_concentration=None,
            months_analyzed=0,
            total_transactions_analyzed=0,
        )
        return RiskReportResponse(
            account_id=account_id,
            currency=currency,
            overall_level="INSUFFICIENT_DATA",
            score=None,
            score_description=None,
            metrics=metrics,
            signals=[],
            unavailable_signals=[
                "All anomaly and risk signals require recorded account transactions.",
            ],
            disclaimer=DISCLAIMER_TEXT,
            generated_at=now_utc,
        )

    signals: list[RiskSignal] = []
    unavailable_signals: list[str] = []

    # -------------------------------------------------------------
    # Metric Calculations
    # -------------------------------------------------------------
    monthly_avg_spending: Decimal | None = None
    monthly_avg_income: Decimal | None = None
    if months_count > 0:
        monthly_avg_spending = round(total_spending / Decimal(months_count), 2)
        monthly_avg_income = round(total_income / Decimal(months_count), 2)

    # Discretionary spending ratio
    discretionary_spending = Decimal("0.00")
    for item in analytics.spending_by_category:
        if item.category in DISCRETIONARY_CATEGORIES:
            discretionary_spending += item.amount

    discretionary_ratio: float | None = None
    if total_spending > Decimal("0.00"):
        discretionary_ratio = round(
            float((discretionary_spending / total_spending) * 100), 1
        )

    top_concentration: float | None = None
    if analytics.spending_by_category and total_spending > Decimal("0.00"):
        top_concentration = round(analytics.spending_by_category[0].percentage, 1)

    metrics = RiskMetrics(
        total_income=total_income,
        total_spending=total_spending,
        net_cash_flow=net_cash_flow,
        monthly_average_spending=monthly_avg_spending,
        monthly_average_income=monthly_avg_income,
        discretionary_spending_ratio=discretionary_ratio,
        top_category_concentration=top_concentration,
        months_analyzed=months_count,
        total_transactions_analyzed=total_transactions,
    )

    # -------------------------------------------------------------
    # 1. UNUSUAL TRANSACTION DETECTION (Percentile & Multiplier)
    # -------------------------------------------------------------
    if len(debit_transactions) >= 5:
        debit_amounts = sorted([abs(tx.amount) for tx in debit_transactions])
        median_debit, q1, q3 = _compute_median_and_iqr(debit_amounts)
        iqr = q3 - q1
        # Statistical outlier threshold: Q3 + 1.5 * IQR or 3x median baseline
        outlier_threshold = max(q3 + Decimal("1.5") * iqr, median_debit * Decimal("3.0"))

        unusual_txs = [
            tx
            for tx in debit_transactions
            if abs(tx.amount) >= outlier_threshold
            and (median_debit == 0 or abs(tx.amount) >= median_debit * Decimal("2.5"))
        ]
        # Sort by largest amount descending, take top 3
        unusual_txs.sort(key=lambda t: abs(t.amount), reverse=True)
        for tx in unusual_txs[:3]:
            amount_val = abs(tx.amount)
            ratio = float(amount_val / median_debit) if median_debit > 0 else 0.0
            severity: RiskSeverity = "HIGH" if ratio >= 5.0 else "MODERATE"
            desc = (tx.description or "Unknown Merchant").strip()
            tx_date_str = tx.transaction_date.strftime("%Y-%m-%d")

            signals.append(
                RiskSignal(
                    id=f"unusual_tx_{tx.id}",
                    signal_type="UNUSUAL_TRANSACTION",
                    severity=severity,
                    title="Unusually Large Transaction",
                    message=(
                        f"Debit of {currency} {amount_val:,.2f} on {tx_date_str} at '{desc}' "
                        f"is {ratio:.1f}x higher than your historical median debit ({currency} {median_debit:,.2f})."
                    ),
                    evidence={
                        "transaction_id": tx.id,
                        "amount": str(amount_val),
                        "currency": currency,
                        "description": desc,
                        "transaction_date": tx_date_str,
                        "category": tx.category or "Other",
                        "median_debit_baseline": str(median_debit),
                        "multiplier_of_median": f"{ratio:.1f}x",
                        "outlier_threshold": str(outlier_threshold),
                    },
                    transaction_id=tx.id,
                )
            )
    else:
        unavailable_signals.append(
            "Unusual transaction detection requires at least 5 debit transactions to establish a reliable baseline."
        )

    # -------------------------------------------------------------
    # 2. SPENDING SPIKE DETECTION (Month-over-Month Comparison)
    # -------------------------------------------------------------
    if months_count >= 2:
        latest_month_item = monthly_trend[-1]
        previous_month_items = monthly_trend[:-1]
        latest_spending = latest_month_item.spending

        prev_spending_sum = sum(
            (m.spending for m in previous_month_items), Decimal("0.00")
        )
        baseline_avg_spending = prev_spending_sum / Decimal(len(previous_month_items))

        if baseline_avg_spending > Decimal("0.00"):
            nominal_diff = latest_spending - baseline_avg_spending
            pct_increase = float((nominal_diff / baseline_avg_spending) * 100)

            # Flag if spending jumped by at least 25% and at least 500 nominal currency units
            if pct_increase >= 25.0 and nominal_diff >= Decimal("500.00"):
                severity: RiskSeverity = "HIGH" if pct_increase >= 50.0 else "MODERATE"
                signals.append(
                    RiskSignal(
                        id=f"spending_spike_{latest_month_item.month}",
                        signal_type="SPENDING_SPIKE",
                        severity=severity,
                        title="Monthly Spending Spike",
                        message=(
                            f"Spending in {latest_month_item.month} ({currency} {latest_spending:,.2f}) "
                            f"increased by {pct_increase:.1f}% compared with your prior monthly baseline average "
                            f"({currency} {baseline_avg_spending:,.2f})."
                        ),
                        evidence={
                            "latest_month": latest_month_item.month,
                            "latest_spending": str(latest_spending),
                            "baseline_spending": str(round(baseline_avg_spending, 2)),
                            "nominal_increase": str(round(nominal_diff, 2)),
                            "percentage_increase": round(pct_increase, 1),
                            "currency": currency,
                            "prior_months_analyzed": len(previous_month_items),
                        },
                    )
                )
    else:
        unavailable_signals.append(
            "Monthly spending spike comparison requires at least 2 completed monthly periods."
        )

    # -------------------------------------------------------------
    # 3. CASH FLOW DEFICIT / RISK
    # -------------------------------------------------------------
    if months_count >= 1:
        # Check consecutive negative cash flow months leading up to the latest month
        consecutive_neg_months = 0
        for m in reversed(monthly_trend):
            if m.net_cash_flow < Decimal("0.00"):
                consecutive_neg_months += 1
            else:
                break

        if consecutive_neg_months >= 2:
            # Persistent multi-month deficit
            deficit_severity: RiskSeverity = (
                "HIGH"
                if net_cash_flow < Decimal("0.00") and consecutive_neg_months >= 3
                else "MODERATE"
            )
            signals.append(
                RiskSignal(
                    id="cash_flow_persistent_deficit",
                    signal_type="CASH_FLOW_RISK",
                    severity=deficit_severity,
                    title="Persistent Cash Flow Deficit",
                    message=(
                        f"Outflows have exceeded inflows across {consecutive_neg_months} consecutive months. "
                        f"Cumulative net cash flow stands at {currency} {net_cash_flow:,.2f}."
                    ),
                    evidence={
                        "consecutive_deficit_months": consecutive_neg_months,
                        "cumulative_net_cash_flow": str(net_cash_flow),
                        "total_income": str(total_income),
                        "total_spending": str(total_spending),
                        "currency": currency,
                    },
                )
            )
        elif consecutive_neg_months == 1 and net_cash_flow < Decimal("0.00"):
            # Single negative month
            latest_m = monthly_trend[-1]
            signals.append(
                RiskSignal(
                    id=f"cash_flow_deficit_{latest_m.month}",
                    signal_type="CASH_FLOW_RISK",
                    severity="LOW",
                    title="Monthly Cash Flow Deficit",
                    message=(
                        f"Spending exceeded income in {latest_m.month} by "
                        f"{currency} {abs(latest_m.net_cash_flow):,.2f}."
                    ),
                    evidence={
                        "month": latest_m.month,
                        "month_income": str(latest_m.income),
                        "month_spending": str(latest_m.spending),
                        "month_deficit": str(abs(latest_m.net_cash_flow)),
                        "currency": currency,
                    },
                )
            )

    # -------------------------------------------------------------
    # 4. CATEGORY CONCENTRATION
    # -------------------------------------------------------------
    if (
        total_spending > Decimal("0.00")
        and len(debit_transactions) >= 3
        and analytics.spending_by_category
    ):
        top_cat = analytics.spending_by_category[0]
        # Ignore transfer categories for concentration alerts if marked as Transfer
        if top_cat.category != "Transfer" and top_cat.percentage >= 50.0:
            severity: RiskSeverity = "MODERATE" if top_cat.percentage >= 70.0 else "LOW"
            signals.append(
                RiskSignal(
                    id=f"concentration_{top_cat.category.lower().replace(' ', '_')}",
                    signal_type="CATEGORY_CONCENTRATION",
                    severity=severity,
                    title="High Category Concentration",
                    message=(
                        f"'{top_cat.category}' accounts for {top_cat.percentage:.1f}% "
                        f"({currency} {top_cat.amount:,.2f}) of your total spending."
                    ),
                    evidence={
                        "category": top_cat.category,
                        "category_spending": str(top_cat.amount),
                        "category_percentage": top_cat.percentage,
                        "total_spending": str(total_spending),
                        "currency": currency,
                    },
                )
            )

    # -------------------------------------------------------------
    # 5. DISCRETIONARY SPENDING RATIO
    # -------------------------------------------------------------
    if (
        total_spending > Decimal("0.00")
        and len(debit_transactions) >= 3
        and discretionary_ratio is not None
        and discretionary_ratio >= 50.0
    ):
        severity: RiskSeverity = "MODERATE" if discretionary_ratio >= 70.0 else "LOW"
        signals.append(
            RiskSignal(
                id="discretionary_spending_exposure",
                signal_type="DISCRETIONARY_SPENDING",
                severity=severity,
                title="Discretionary Spending Exposure",
                message=(
                    f"Discretionary categories (Shopping, Entertainment, Food & Dining, Travel) "
                    f"represent {discretionary_ratio:.1f}% ({currency} {discretionary_spending:,.2f}) "
                    f"of your total spending."
                ),
                evidence={
                    "discretionary_categories": sorted(list(DISCRETIONARY_CATEGORIES)),
                    "discretionary_amount": str(discretionary_spending),
                    "total_spending": str(total_spending),
                    "discretionary_ratio": discretionary_ratio,
                    "currency": currency,
                },
            )
        )

    # -------------------------------------------------------------
    # 6. RECURRING PAYMENT CREEP
    # -------------------------------------------------------------
    if len(recurring_debit_transactions) >= 2:
        # Group recurring debits by merchant or description
        recurring_by_name: dict[str, list[Transaction]] = {}
        for tx in recurring_debit_transactions:
            key = (tx.description or "Recurring Item").strip().upper()
            recurring_by_name.setdefault(key, []).append(tx)

        creep_detected = False
        for _key, r_txs in recurring_by_name.items():
            if len(r_txs) >= 2:
                # Sort chronologically
                r_txs_sorted = sorted(r_txs, key=lambda t: t.transaction_date)
                prev_tx = r_txs_sorted[-2]
                latest_tx = r_txs_sorted[-1]
                prev_amt = abs(prev_tx.amount)
                latest_amt = abs(latest_tx.amount)
                display_name = (latest_tx.description or prev_tx.description or "Recurring Merchant").strip()

                if prev_amt > Decimal("0.00") and latest_amt > prev_amt * Decimal("1.15"):
                    creep_detected = True
                    increase_pct = float(((latest_amt - prev_amt) / prev_amt) * 100)
                    signals.append(
                        RiskSignal(
                            id=f"recurring_creep_{latest_tx.id}",
                            signal_type="RECURRING_PAYMENT_CREEP",
                            severity="MODERATE",
                            title="Recurring Payment Increase",
                            message=(
                                f"Recurring debit for '{display_name}' increased by {increase_pct:.1f}% "
                                f"(from {currency} {prev_amt:,.2f} on {prev_tx.transaction_date.strftime('%Y-%m-%d')} "
                                f"to {currency} {latest_amt:,.2f} on {latest_tx.transaction_date.strftime('%Y-%m-%d')})."
                            ),
                            evidence={
                                "merchant": display_name,
                                "previous_amount": str(prev_amt),
                                "previous_date": prev_tx.transaction_date.strftime("%Y-%m-%d"),
                                "current_amount": str(latest_amt),
                                "current_date": latest_tx.transaction_date.strftime("%Y-%m-%d"),
                                "increase_percentage": round(increase_pct, 1),
                                "currency": currency,
                            },
                            transaction_id=latest_tx.id,
                        )
                    )
        if not creep_detected:
            # We inspected recurring data but found no creeps
            pass
    else:
        unavailable_signals.append(
            "Recurring payment anomaly tracking is inactive because no recurring transaction series "
            "(is_recurring=True) was detected in this account."
        )

    # -------------------------------------------------------------
    # 7. MULTI-MONTH CASH FLOW TREND
    # -------------------------------------------------------------
    if months_count >= 3:
        # Check if consecutive net flows are continuously deteriorating
        nets = [m.net_cash_flow for m in monthly_trend]
        is_deteriorating = all(
            nets[i] < nets[i - 1] for i in range(1, len(nets))
        )
        if is_deteriorating:
            signals.append(
                RiskSignal(
                    id="cash_flow_trend_deteriorating",
                    signal_type="CASH_FLOW_TREND",
                    severity="MODERATE" if nets[-1] < Decimal("0.00") else "LOW",
                    title="Deteriorating Cash Flow Trajectory",
                    message=(
                        f"Net monthly cash flow has declined across {months_count} consecutive months "
                        f"(from {currency} {nets[0]:,.2f} down to {currency} {nets[-1]:,.2f})."
                    ),
                    evidence={
                        "months": [m.month for m in monthly_trend],
                        "monthly_net_flows": [str(n) for n in nets],
                        "direction": "DETERIORATING",
                        "currency": currency,
                    },
                )
            )
    else:
        unavailable_signals.append(
            "Multi-month cash flow trajectory analysis requires at least 3 completed monthly periods."
        )

    # -------------------------------------------------------------
    # OVERALL LEVEL & DETERMINISTIC SCORE
    # -------------------------------------------------------------
    high_count = sum(1 for s in signals if s.severity == "HIGH")
    mod_count = sum(1 for s in signals if s.severity == "MODERATE")
    low_count = sum(1 for s in signals if s.severity == "LOW")

    if high_count >= 1:
        overall_level: RiskLevel = "HIGH"
    elif mod_count >= 1:
        overall_level: RiskLevel = "MODERATE"
    else:
        overall_level = "LOW"

    # Deterministic 0-100 stability index
    # Base: 100, High: -25, Moderate: -10, Low: -5
    score_raw = 100 - (high_count * 25 + mod_count * 10 + low_count * 5)
    score = max(0, min(100, score_raw))
    score_description = (
        "Stability Index (0-100) derived deterministically from detected pattern severities: "
        f"Base 100 - ({high_count} High x 25) - ({mod_count} Moderate x 10) - ({low_count} Low x 5)."
    )

    return RiskReportResponse(
        account_id=account_id,
        currency=currency,
        overall_level=overall_level,
        score=score,
        score_description=score_description,
        metrics=metrics,
        signals=signals,
        unavailable_signals=unavailable_signals,
        disclaimer=DISCLAIMER_TEXT,
        generated_at=now_utc,
    )
