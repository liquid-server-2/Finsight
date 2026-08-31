from __future__ import annotations

import unittest
from datetime import datetime, timezone
from decimal import Decimal
from unittest.mock import MagicMock

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.auth import create_access_token, get_current_user
from app.database import Base
from app.main import get_account_risk
from app.models import Account, Transaction, User

# In-memory SQLite database for isolated API tests
test_engine = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)


class TestRiskApi(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        Base.metadata.create_all(bind=test_engine)

    @classmethod
    def tearDownClass(cls):
        Base.metadata.drop_all(bind=test_engine)

    def setUp(self):
        self.session: Session = TestingSessionLocal()

        # Seed 2 distinct users
        self.user_a = User(id=101, email="user_a@finsight.local", password_hash="hash_a")
        self.user_b = User(id=102, email="user_b@finsight.local", password_hash="hash_b")
        self.session.add_all([self.user_a, self.user_b])
        self.session.flush()

        # Seed accounts for each user
        self.account_a = Account(
            id=201,
            user_id=self.user_a.id,
            name="User A Account",
            account_type="checking",
            institution="Bank A",
            currency="INR",
        )
        self.account_b = Account(
            id=202,
            user_id=self.user_b.id,
            name="User B Account",
            account_type="checking",
            institution="Bank B",
            currency="INR",
        )
        self.session.add_all([self.account_a, self.account_b])
        self.session.flush()

        # Seed transactions for User A
        self.session.add_all([
            Transaction(
                id=301,
                account_id=self.account_a.id,
                amount=Decimal("50000.00"),
                currency="INR",
                transaction_date=datetime(2026, 7, 1, tzinfo=timezone.utc),
                description="Salary",
                category="Income",
                transaction_type="credit",
            ),
            Transaction(
                id=302,
                account_id=self.account_a.id,
                amount=Decimal("-25000.00"),
                currency="INR",
                transaction_date=datetime(2026, 7, 15, tzinfo=timezone.utc),
                description="Shopping Mall",
                category="Shopping",
                transaction_type="debit",
            ),
        ])

        # Seed transactions for User B (different amounts & categories)
        self.session.add_all([
            Transaction(
                id=401,
                account_id=self.account_b.id,
                amount=Decimal("100000.00"),
                currency="INR",
                transaction_date=datetime(2026, 7, 1, tzinfo=timezone.utc),
                description="User B Income",
                category="Income",
                transaction_type="credit",
            ),
            Transaction(
                id=402,
                account_id=self.account_b.id,
                amount=Decimal("-1000.00"),
                currency="INR",
                transaction_date=datetime(2026, 7, 10, tzinfo=timezone.utc),
                description="User B Dining",
                category="Food & Dining",
                transaction_type="debit",
            ),
        ])
        self.session.commit()

        # Generate auth tokens
        self.token_a = create_access_token(user_id=self.user_a.id, email=self.user_a.email)
        self.token_b = create_access_token(user_id=self.user_b.id, email=self.user_b.email)

    def tearDown(self):
        self.session.query(Transaction).delete()
        self.session.query(Account).delete()
        self.session.query(User).delete()
        self.session.commit()
        self.session.close()

    def test_11_unauthenticated_request_rejected(self):
        """Scenario 11: Unauthenticated request (no token / invalid token) raises 401."""
        req_no_token = MagicMock()
        req_no_token.cookies = {}
        req_no_token.headers = {}
        with self.assertRaises(HTTPException) as cm:
            get_current_user(request=req_no_token, session=self.session)
        self.assertEqual(cm.exception.status_code, 401)

        req_invalid = MagicMock()
        req_invalid.cookies = {"finsight_session": "invalid.jwt.token"}
        req_invalid.headers = {}
        with self.assertRaises(HTTPException) as cm_invalid:
            get_current_user(request=req_invalid, session=self.session)
        self.assertEqual(cm_invalid.exception.status_code, 401)

    def test_12_cross_user_account_returns_403(self):
        """Scenario 12: User B requesting User A's account risk raises 403 Forbidden."""
        with self.assertRaises(HTTPException) as cm:
            get_account_risk(
                account_id=self.account_a.id,
                current_user=self.user_b,
                session=self.session,
            )
        self.assertEqual(cm.exception.status_code, 403)
        self.assertIn("Forbidden", cm.exception.detail)

    def test_13_user_a_risk_isolated_from_user_b(self):
        """Scenario 13: User A's risk calculation only includes User A's transactions."""
        report = get_account_risk(
            account_id=self.account_a.id,
            current_user=self.user_a,
            session=self.session,
        )

        self.assertEqual(report.account_id, self.account_a.id)
        # Total income should be User A's 50,000 (isolated from User B's 100,000)
        self.assertEqual(report.metrics.total_income, Decimal("50000.00"))
        self.assertEqual(report.metrics.total_spending, Decimal("25000.00"))
        self.assertEqual(report.metrics.total_transactions_analyzed, 2)

    def test_missing_account_returns_404(self):
        """Request for non-existent account raises 404 Not Found."""
        with self.assertRaises(HTTPException) as cm:
            get_account_risk(
                account_id=999999,
                current_user=self.user_a,
                session=self.session,
            )
        self.assertEqual(cm.exception.status_code, 404)


if __name__ == "__main__":
    unittest.main()
