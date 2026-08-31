from __future__ import annotations

import unittest
from datetime import datetime, timezone
from decimal import Decimal
from unittest.mock import MagicMock

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.analytics import compute_account_analytics
from app.auth import create_access_token, hash_password, verify_password
from app.categorizer import categorize_transaction, is_valid_category
from app.database import Base
from app.hdfc_xls_parser import parse_hdfc_xls
from app.main import (
    create_account,
    get_account_analytics,
    get_account_risk,
    get_account_transactions,
    get_authenticated_user_accounts,
    update_transaction_category,
)
from app.models import Account, Merchant, MerchantRule, Transaction, User
from app.schemas.account import AccountCreate
from app.schemas.transaction import TransactionCategoryUpdate

# In-memory SQLite for regression suite
reg_engine = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
RegSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=reg_engine)


class TestFullRegression(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        Base.metadata.create_all(bind=reg_engine)

    @classmethod
    def tearDownClass(cls):
        Base.metadata.drop_all(bind=reg_engine)

    def setUp(self):
        self.session: Session = RegSessionLocal()
        self.user = User(id=1, email="tester@finsight.local", password_hash=hash_password("Pass1234!"))
        self.session.add(self.user)
        self.session.flush()

        self.account = Account(
            id=10,
            user_id=self.user.id,
            name="Primary Checking",
            account_type="checking",
            institution="HDFC Bank",
            currency="INR",
        )
        self.session.add(self.account)
        self.session.flush()

        self.session.commit()

    def tearDown(self):
        self.session.query(MerchantRule).delete()
        self.session.query(Transaction).delete()
        self.session.query(Merchant).delete()
        self.session.query(Account).delete()
        self.session.query(User).delete()
        self.session.commit()
        self.session.close()

    def test_auth_hashing_and_verification(self):
        pwd = "SecurePassword2026!"
        h = hash_password(pwd)
        self.assertTrue(verify_password(pwd, h))
        self.assertFalse(verify_password("WrongPassword", h))

    def test_account_creation_and_listing(self):
        new_acc_payload = AccountCreate(
            name="Savings Account",
            account_type="savings",
            institution="State Bank",
            currency="INR",
        )
        created = create_account(
            payload=new_acc_payload,
            current_user=self.user,
            session=self.session,
        )
        self.assertEqual(created.name, "Savings Account")
        self.assertEqual(created.user_id, self.user.id)

        accounts = get_authenticated_user_accounts(
            current_user=self.user,
            session=self.session,
        )
        self.assertEqual(len(accounts), 2)

    def test_transaction_listing_and_category_update(self):
        tx = Transaction(
            id=100,
            account_id=self.account.id,
            amount=Decimal("-450.00"),
            currency="INR",
            transaction_date=datetime(2026, 8, 1, tzinfo=timezone.utc),
            description="UBER INDIA",
            category="Other",
            transaction_type="debit",
        )
        self.session.add(tx)
        self.session.commit()

        txs = get_account_transactions(
            account_id=self.account.id,
            limit=50,
            current_user=self.user,
            session=self.session,
        )
        self.assertEqual(len(txs), 1)
        self.assertEqual(txs[0].category, "Other")

        # Update category
        update_payload = TransactionCategoryUpdate(category="Transportation")
        updated_tx = update_transaction_category(
            transaction_id=100,
            payload=update_payload,
            current_user=self.user,
            session=self.session,
        )
        self.assertEqual(updated_tx.category, "Transportation")

    def test_categorizer_and_analytics(self):
        self.assertTrue(is_valid_category("Food & Dining"))
        self.assertFalse(is_valid_category("Cryptocurrency"))

        cat = categorize_transaction("SWIGGY BANGALORE", "debit", Decimal("-620.00"))
        self.assertEqual(cat, "Food & Dining")

        # Analytics
        analytics = get_account_analytics(
            account_id=self.account.id,
            current_user=self.user,
            session=self.session,
        )
        self.assertIsNotNone(analytics)
        self.assertEqual(analytics.account_id, self.account.id)

    def test_risk_endpoint_regression(self):
        # Add 5 transactions so risk engine can compute baseline
        for i in range(1, 6):
            self.session.add(
                Transaction(
                    id=500 + i,
                    account_id=self.account.id,
                    amount=Decimal("-500.00"),
                    currency="INR",
                    transaction_date=datetime(2026, 8, i, tzinfo=timezone.utc),
                    description=f"Item {i}",
                    category="Food & Dining",
                    transaction_type="debit",
                )
            )
        self.session.commit()

        risk_report = get_account_risk(
            account_id=self.account.id,
            current_user=self.user,
            session=self.session,
        )
        self.assertEqual(risk_report.account_id, self.account.id)
        self.assertIn(risk_report.overall_level, ("LOW", "MODERATE", "HIGH"))
        self.assertIsNotNone(risk_report.score)
        self.assertIn("FinSight Risk Engine", risk_report.disclaimer)


if __name__ == "__main__":
    unittest.main()
