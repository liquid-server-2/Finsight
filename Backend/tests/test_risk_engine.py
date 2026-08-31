from __future__ import annotations

import unittest
from datetime import datetime, timezone
from decimal import Decimal

from app.analytics import compute_account_analytics
from app.models.account import Account
from app.models.transaction import Transaction
from app.risk import compute_account_risk


def make_account(account_id: int = 1, currency: str = "INR") -> Account:
    return Account(
        id=account_id,
        user_id=1,
        name="Test Account",
        account_type="checking",
        institution="Demo Bank",
        currency=currency,
    )


def make_tx(
    tx_id: int,
    account_id: int = 1,
    amount: str = "-100.00",
    date_str: str = "2026-08-01",
    description: str = "Merchant",
    category: str = "Food & Dining",
    is_recurring: bool = False,
) -> Transaction:
    amt = Decimal(amount)
    dt = datetime.fromisoformat(f"{date_str}T12:00:00+00:00")
    return Transaction(
        id=tx_id,
        account_id=account_id,
        amount=amt,
        currency="INR",
        transaction_date=dt,
        description=description,
        category=category,
        transaction_type="debit" if amt < 0 else "credit",
        is_recurring=is_recurring,
    )


class TestRiskEngine(unittest.TestCase):
    def test_1_no_transactions_insufficient_data(self):
        """Scenario 1: No transactions -> safe empty state with INSUFFICIENT_DATA."""
        account = make_account()
        transactions: list[Transaction] = []
        analytics = compute_account_analytics(account, transactions)
        report = compute_account_risk(account, transactions, analytics)

        self.assertEqual(report.overall_level, "INSUFFICIENT_DATA")
        self.assertIsNone(report.score)
        self.assertEqual(len(report.signals), 0)
        self.assertGreater(len(report.unavailable_signals), 0)
        self.assertEqual(report.metrics.total_transactions_analyzed, 0)
        self.assertEqual(report.metrics.total_spending, Decimal("0.00"))

    def test_2_one_transaction_no_false_trend(self):
        """Scenario 2: One transaction -> no fabricated trend, insufficient for spike/trend signals."""
        account = make_account()
        transactions = [make_tx(1, amount="-500.00", date_str="2026-08-01")]
        analytics = compute_account_analytics(account, transactions)
        report = compute_account_risk(account, transactions, analytics)

        # 1 transaction cannot establish 5-tx baseline for unusual tx or 2-month baseline for spike
        signal_types = [s.signal_type for s in report.signals]
        self.assertNotIn("UNUSUAL_TRANSACTION", signal_types)
        self.assertNotIn("SPENDING_SPIKE", signal_types)
        self.assertNotIn("CASH_FLOW_TREND", signal_types)
        # Should document unavailable signals
        self.assertTrue(any("at least 5" in s for s in report.unavailable_signals))
        self.assertTrue(any("at least 2" in s for s in report.unavailable_signals))

    def test_3_normal_spending_no_false_alarms(self):
        """Scenario 3: Normal regular spending -> no anomalous spikes or false alerts."""
        account = make_account()
        # 6 uniform transactions across 2 balanced months
        transactions = [
            make_tx(1, amount="50000.00", date_str="2026-07-01", category="Income", description="Salary"),
            make_tx(2, amount="-1000.00", date_str="2026-07-05", category="Food & Dining"),
            make_tx(3, amount="-1100.00", date_str="2026-07-15", category="Transportation"),
            make_tx(4, amount="-1050.00", date_str="2026-07-25", category="Bills & Utilities"),
            make_tx(5, amount="50000.00", date_str="2026-08-01", category="Income", description="Salary"),
            make_tx(6, amount="-1000.00", date_str="2026-08-05", category="Food & Dining"),
            make_tx(7, amount="-1100.00", date_str="2026-08-15", category="Transportation"),
            make_tx(8, amount="-1050.00", date_str="2026-08-25", category="Bills & Utilities"),
        ]
        analytics = compute_account_analytics(account, transactions)
        report = compute_account_risk(account, transactions, analytics)

        self.assertEqual(report.overall_level, "LOW")
        self.assertGreaterEqual(report.score or 0, 90)
        signal_types = [s.signal_type for s in report.signals]
        self.assertNotIn("UNUSUAL_TRANSACTION", signal_types)
        self.assertNotIn("SPENDING_SPIKE", signal_types)
        self.assertNotIn("CASH_FLOW_RISK", signal_types)

    def test_4_large_unusual_transaction_detected(self):
        """Scenario 4: Large transaction relative to user's median -> flags UNUSUAL_TRANSACTION."""
        account = make_account()
        # Baseline median spending is ~500. Then an anomalous 25,000 debit occurs.
        transactions = [
            make_tx(1, amount="-500.00", date_str="2026-08-01", description="Coffee"),
            make_tx(2, amount="-450.00", date_str="2026-08-02", description="Lunch"),
            make_tx(3, amount="-550.00", date_str="2026-08-03", description="Dinner"),
            make_tx(4, amount="-480.00", date_str="2026-08-04", description="Snack"),
            make_tx(5, amount="-520.00", date_str="2026-08-05", description="Groceries"),
            make_tx(6, amount="-25000.00", date_str="2026-08-10", description="Jewelry Store", category="Shopping"),
        ]
        analytics = compute_account_analytics(account, transactions)
        report = compute_account_risk(account, transactions, analytics)

        unusual_signals = [s for s in report.signals if s.signal_type == "UNUSUAL_TRANSACTION"]
        self.assertEqual(len(unusual_signals), 1)
        signal = unusual_signals[0]
        self.assertEqual(signal.severity, "HIGH")
        self.assertEqual(signal.transaction_id, 6)
        self.assertIn("Jewelry Store", signal.message)
        self.assertEqual(signal.evidence["amount"], "25000.00")

    def test_5_spending_spike_signal(self):
        """Scenario 5: Month-over-month spending increases by >= 25% -> SPENDING_SPIKE."""
        account = make_account()
        # Month 1: 5,000 spending
        # Month 2: 12,000 spending (+140% spike)
        transactions = [
            make_tx(1, amount="20000.00", date_str="2026-06-01", category="Income"),
            make_tx(2, amount="-5000.00", date_str="2026-06-15", category="Bills & Utilities"),
            make_tx(3, amount="20000.00", date_str="2026-07-01", category="Income"),
            make_tx(4, amount="-12000.00", date_str="2026-07-15", category="Shopping"),
        ]
        analytics = compute_account_analytics(account, transactions)
        report = compute_account_risk(account, transactions, analytics)

        spike_signals = [s for s in report.signals if s.signal_type == "SPENDING_SPIKE"]
        self.assertEqual(len(spike_signals), 1)
        self.assertEqual(spike_signals[0].severity, "HIGH")
        self.assertEqual(spike_signals[0].evidence["latest_month"], "2026-07")
        self.assertGreater(spike_signals[0].evidence["percentage_increase"], 100.0)

    def test_6_persistent_negative_cash_flow(self):
        """Scenario 6: Outflows consistently exceed inflows across multiple months -> CASH_FLOW_RISK."""
        account = make_account()
        # 3 consecutive deficit months
        transactions = [
            make_tx(1, amount="5000.00", date_str="2026-05-01", category="Income"),
            make_tx(2, amount="-8000.00", date_str="2026-05-10", category="Shopping"),
            make_tx(3, amount="5000.00", date_str="2026-06-01", category="Income"),
            make_tx(4, amount="-9000.00", date_str="2026-06-10", category="Shopping"),
            make_tx(5, amount="5000.00", date_str="2026-07-01", category="Income"),
            make_tx(6, amount="-8500.00", date_str="2026-07-10", category="Shopping"),
        ]
        analytics = compute_account_analytics(account, transactions)
        report = compute_account_risk(account, transactions, analytics)

        deficit_signals = [s for s in report.signals if s.signal_type == "CASH_FLOW_RISK"]
        self.assertGreaterEqual(len(deficit_signals), 1)
        self.assertIn(report.overall_level, ("HIGH", "MODERATE"))
        self.assertIn("consecutive", deficit_signals[0].message.lower())

    def test_7_category_concentration(self):
        """Scenario 7: Dominant category (> 50% of total spending) -> CATEGORY_CONCENTRATION."""
        account = make_account()
        transactions = [
            make_tx(1, amount="-8000.00", date_str="2026-08-01", category="Shopping"),
            make_tx(2, amount="-1000.00", date_str="2026-08-02", category="Food & Dining"),
            make_tx(3, amount="-1000.00", date_str="2026-08-03", category="Transportation"),
        ]
        analytics = compute_account_analytics(account, transactions)
        report = compute_account_risk(account, transactions, analytics)

        conc_signals = [s for s in report.signals if s.signal_type == "CATEGORY_CONCENTRATION"]
        self.assertEqual(len(conc_signals), 1)
        self.assertEqual(conc_signals[0].evidence["category"], "Shopping")
        self.assertEqual(conc_signals[0].evidence["category_percentage"], 80.0)

    def test_8_discretionary_spending_exposure(self):
        """Scenario 8: High discretionary share -> DISCRETIONARY_SPENDING with neutral wording."""
        account = make_account()
        # Shopping + Food & Dining = 85% of spending
        transactions = [
            make_tx(1, amount="-5000.00", date_str="2026-08-01", category="Shopping"),
            make_tx(2, amount="-3500.00", date_str="2026-08-02", category="Food & Dining"),
            make_tx(3, amount="-1500.00", date_str="2026-08-03", category="Bills & Utilities"),
        ]
        analytics = compute_account_analytics(account, transactions)
        report = compute_account_risk(account, transactions, analytics)

        disc_signals = [s for s in report.signals if s.signal_type == "DISCRETIONARY_SPENDING"]
        self.assertEqual(len(disc_signals), 1)
        self.assertEqual(disc_signals[0].evidence["discretionary_ratio"], 85.0)
        # Verify neutral language
        self.assertNotIn("bad", disc_signals[0].message.lower())
        self.assertNotIn("irresponsible", disc_signals[0].message.lower())

    def test_9_insufficient_history_safeguards(self):
        """Scenario 9: Insufficient history -> documented in unavailable_signals."""
        account = make_account()
        transactions = [
            make_tx(1, amount="-100.00", date_str="2026-08-01"),
            make_tx(2, amount="-200.00", date_str="2026-08-02"),
        ]
        analytics = compute_account_analytics(account, transactions)
        report = compute_account_risk(account, transactions, analytics)

        self.assertGreaterEqual(len(report.unavailable_signals), 2)
        # Should NOT fabricate multi-month trends
        self.assertEqual(report.metrics.months_analyzed, 1)

    def test_10_recurring_payment_creep_only_when_reliable_data_exists(self):
        """Scenario 10: Recurring payment signal triggered only on repeated recurring increases."""
        account = make_account()
        # Test 10a: No recurring transactions marked
        txs_no_recurring = [
            make_tx(1, amount="-500.00", is_recurring=False),
            make_tx(2, amount="-500.00", is_recurring=False),
        ]
        report_a = compute_account_risk(
            account, txs_no_recurring, compute_account_analytics(account, txs_no_recurring)
        )
        self.assertTrue(
            any("Recurring payment" in u for u in report_a.unavailable_signals)
        )

        # Test 10b: Recurring subscription marked with a price hike (499 -> 799, +60%)
        txs_with_creep = [
            make_tx(1, amount="-499.00", date_str="2026-06-01", description="Streaming Service", is_recurring=True),
            make_tx(2, amount="-499.00", date_str="2026-07-01", description="Streaming Service", is_recurring=True),
            make_tx(3, amount="-799.00", date_str="2026-08-01", description="Streaming Service", is_recurring=True),
        ]
        report_b = compute_account_risk(
            account, txs_with_creep, compute_account_analytics(account, txs_with_creep)
        )
        creep_signals = [s for s in report_b.signals if s.signal_type == "RECURRING_PAYMENT_CREEP"]
        self.assertEqual(len(creep_signals), 1)
        self.assertIn("Streaming Service", creep_signals[0].message)
        self.assertGreater(creep_signals[0].evidence["increase_percentage"], 50.0)

    def test_14_decimal_monetary_precision_and_no_zero_division(self):
        """Scenario 14: Strict Decimal monetary calculations, no floating point inaccuracies or zero division."""
        account = make_account()
        transactions = [
            make_tx(1, amount="0.00", date_str="2026-08-01", description="Zero tx"),
        ]
        # Shouldn't raise ZeroDivisionError
        analytics = compute_account_analytics(account, transactions)
        report = compute_account_risk(account, transactions, analytics)
        self.assertIsNotNone(report)
        self.assertEqual(report.metrics.total_spending, Decimal("0.00"))


if __name__ == "__main__":
    unittest.main()
