from __future__ import annotations

import csv
import io
import re
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation

from fastapi import Depends, FastAPI, File, HTTPException, Query, Request, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import case, func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.analytics import compute_account_analytics
from app.auth import (
    clear_auth_cookie,
    create_access_token,
    get_current_user,
    get_db,
    hash_password,
    set_auth_cookie,
    verify_password,
)
from app.categorizer import (
    SUPPORTED_CATEGORIES,
    categorize_transaction,
    is_valid_category,
)
from app.database import SessionLocal, engine
from app.hdfc_xls_parser import parse_hdfc_xls
from app.models import Account, Merchant, MerchantRule, Transaction, User
from app.risk import compute_account_risk
from app.schemas.account import AccountCreate, AccountResponse, AccountSummaryResponse
from app.schemas.analytics import AccountAnalyticsResponse
from app.schemas.merchant_rule import MerchantRuleCreate, MerchantRuleResponse
from app.schemas.risk import RiskReportResponse
from app.schemas.transaction import TransactionCategoryUpdate, TransactionResponse
from app.schemas.user import UserCreate, UserLogin, UserRegister, UserResponse

app = FastAPI(title="FinSight API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
    ],
    allow_origin_regex=r"^http://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def normalize_merchant_name(description: str) -> str:
    normalized = re.sub(r"[^A-Z0-9\s]", "", description.upper())
    return " ".join(normalized.split())


def parse_transaction_date(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed


def validation_error(row_number: int, reason: str) -> dict[str, int | str]:
    return {"row": row_number, "reason": reason}


@app.on_event("startup")
def check_database_connection():
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
    except Exception:
        raise RuntimeError("Database connectivity check failed.") from None


@app.get("/")
def read_root():
    return {"message": "FinSight API is running"}


# ==========================================
# AUTHENTICATION ENDPOINTS (/api/auth)
# ==========================================

@app.post("/api/auth/register", response_model=UserResponse, status_code=201)
def register_user(payload: UserRegister, session: Session = Depends(get_db)):
    existing_user = session.scalar(select(User).where(User.email == payload.email))
    if existing_user is not None:
        raise HTTPException(status_code=409, detail="Email already registered.")

    user = User(
        email=payload.email,
        password_hash=hash_password(payload.password),
    )
    session.add(user)
    try:
        session.commit()
        session.refresh(user)
        return UserResponse.model_validate(user)
    except IntegrityError:
        session.rollback()
        raise HTTPException(status_code=409, detail="Email already registered.") from None
    except Exception:
        session.rollback()
        raise HTTPException(status_code=500, detail="User registration failed.") from None


@app.post("/api/auth/login", response_model=UserResponse)
def login_user(payload: UserLogin, response: Response, session: Session = Depends(get_db)):
    user = session.scalar(select(User).where(User.email == payload.email))
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    token = create_access_token(user_id=user.id, email=user.email)
    set_auth_cookie(response, token)
    return UserResponse.model_validate(user)


@app.get("/api/auth/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    return UserResponse.model_validate(current_user)


@app.post("/api/auth/logout")
def logout_user(response: Response):
    clear_auth_cookie(response)
    return {"message": "Logged out successfully."}


# ==========================================
# ACCOUNT ENDPOINTS (/api/accounts)
# ==========================================

@app.get("/api/accounts", response_model=list[AccountResponse])
def get_authenticated_user_accounts(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
):
    statement = (
        select(Account)
        .where(Account.user_id == current_user.id)
        .order_by(Account.id.asc())
    )
    accounts = session.scalars(statement).all()
    return [AccountResponse.model_validate(acc) for acc in accounts]


@app.get("/api/users/{user_id}/accounts", response_model=list[AccountResponse])
def get_user_accounts(
    user_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
):
    if user_id != current_user.id:
        raise HTTPException(
            status_code=403, detail="Forbidden: You cannot access another user's accounts."
        )

    statement = (
        select(Account)
        .where(Account.user_id == current_user.id)
        .order_by(Account.id.asc())
    )
    accounts = session.scalars(statement).all()
    return [AccountResponse.model_validate(acc) for acc in accounts]


@app.post("/api/accounts", response_model=AccountResponse, status_code=201)
def create_account(
    payload: AccountCreate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
):
    account = Account(
        user_id=current_user.id,
        name=payload.name,
        account_type=payload.account_type,
        institution=payload.institution,
        currency=payload.currency,
    )
    session.add(account)
    try:
        session.commit()
        session.refresh(account)
        return AccountResponse.model_validate(account)
    except Exception:
        session.rollback()
        raise HTTPException(status_code=500, detail="Account creation failed.") from None


@app.get(
    "/api/accounts/{account_id}/transactions",
    response_model=list[TransactionResponse],
)
def get_account_transactions(
    account_id: int,
    limit: int = Query(default=50, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
):
    account = session.get(Account, account_id)
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found.")

    if account.user_id != current_user.id:
        raise HTTPException(
            status_code=403, detail="Forbidden: You do not have access to this account."
        )

    statement = (
        select(Transaction)
        .where(Transaction.account_id == account_id)
        .order_by(Transaction.transaction_date.desc(), Transaction.id.desc())
        .limit(limit)
    )
    transactions = session.scalars(statement).all()
    return [TransactionResponse.model_validate(tx) for tx in transactions]


@app.patch(
    "/api/transactions/{transaction_id}/category",
    response_model=TransactionResponse,
)
def update_transaction_category(
    transaction_id: int,
    payload: TransactionCategoryUpdate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
):
    if not is_valid_category(payload.category):
        raise HTTPException(
            status_code=422,
            detail=f"Invalid category. Must be one of: {', '.join(SUPPORTED_CATEGORIES)}",
        )

    statement = (
        select(Transaction)
        .join(Account, Transaction.account_id == Account.id)
        .where(Transaction.id == transaction_id)
    )
    transaction = session.scalar(statement)
    if transaction is None:
        raise HTTPException(status_code=404, detail="Transaction not found.")

    account = session.get(Account, transaction.account_id)
    if account is None or account.user_id != current_user.id:
        raise HTTPException(
            status_code=403,
            detail="Forbidden: You do not have permission to modify this transaction.",
        )

    transaction.category = payload.category.strip()
    session.commit()
    session.refresh(transaction)
    return TransactionResponse.model_validate(transaction)


@app.get(
    "/api/accounts/{account_id}/summary",
    response_model=AccountSummaryResponse,
)
def get_account_summary(
    account_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
):
    account = session.get(Account, account_id)
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found.")

    if account.user_id != current_user.id:
        raise HTTPException(
            status_code=403, detail="Forbidden: You do not have access to this account."
        )

    statement = (
        select(
            func.coalesce(
                func.sum(case((Transaction.amount > 0, Transaction.amount), else_=0)),
                0,
            ).label("total_income"),
            func.coalesce(
                func.sum(case((Transaction.amount < 0, func.abs(Transaction.amount)), else_=0)),
                0,
            ).label("total_spending"),
            func.coalesce(
                func.sum(Transaction.amount),
                0,
            ).label("net_cash_flow"),
            func.count(Transaction.id).label("transaction_count"),
        )
        .where(Transaction.account_id == account_id)
    )
    row = session.execute(statement).one()
    return AccountSummaryResponse(
        account_id=account.id,
        currency=account.currency,
        total_income=row.total_income,
        total_spending=row.total_spending,
        net_cash_flow=row.net_cash_flow,
        transaction_count=row.transaction_count,
    )


@app.get(
    "/api/accounts/{account_id}/analytics",
    response_model=AccountAnalyticsResponse,
)
def get_account_analytics(
    account_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
):
    account = session.get(Account, account_id)
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found.")

    if account.user_id != current_user.id:
        raise HTTPException(
            status_code=403, detail="Forbidden: You do not have access to this account."
        )

    statement = (
        select(Transaction)
        .where(Transaction.account_id == account_id)
        .order_by(Transaction.transaction_date.asc(), Transaction.id.asc())
    )
    transactions = session.scalars(statement).all()

    return compute_account_analytics(account=account, transactions=transactions)


@app.get(
    "/api/accounts/{account_id}/risk",
    response_model=RiskReportResponse,
)
def get_account_risk(
    account_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
):
    account = session.get(Account, account_id)
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found.")

    if account.user_id != current_user.id:
        raise HTTPException(
            status_code=403, detail="Forbidden: You do not have access to this account."
        )

    statement = (
        select(Transaction)
        .where(Transaction.account_id == account_id)
        .order_by(Transaction.transaction_date.asc(), Transaction.id.asc())
    )
    transactions = session.scalars(statement).all()

    analytics = compute_account_analytics(account=account, transactions=transactions)
    return compute_account_risk(account=account, transactions=transactions, analytics=analytics)


@app.post("/api/transactions/import")
async def import_transactions(
    account_id: int,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
):
    account = session.get(Account, account_id)
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found.")

    if account.user_id != current_user.id:
        raise HTTPException(
            status_code=403, detail="Forbidden: You do not have access to this account."
        )

    try:
        file_bytes = await file.read()
    finally:
        await file.close()

    filename = (file.filename or "").lower()
    is_xls = filename.endswith(".xls") or file_bytes.startswith(b"\xd0\xcf\x11\xe0")

    validated_rows: list[dict[str, Any]] = []
    errors: list[dict[str, Any]] = []

    if is_xls:
        validated_rows, errors = parse_hdfc_xls(file_bytes)
    else:
        try:
            csv_text = file_bytes.decode("utf-8-sig")
        except UnicodeDecodeError:
            raise HTTPException(
                status_code=422,
                detail="File format not recognized. Please upload a valid UTF-8 CSV or HDFC Bank .xls statement.",
            ) from None

        reader = csv.DictReader(io.StringIO(csv_text, newline=""), strict=True)
        required_columns = {"date", "description", "amount"}
        fieldnames = set(reader.fieldnames or [])
        missing_columns = sorted(required_columns - fieldnames)

        if missing_columns:
            return JSONResponse(
                status_code=422,
                content={
                    "imported_count": 0,
                    "failed_count": 1,
                    "errors": [
                        validation_error(
                            1, f"Missing required column(s): {', '.join(missing_columns)}"
                        )
                    ],
                },
            )

        row_number = 1
        try:
            for row_number, row in enumerate(reader, start=2):
                date_value = (row.get("date") or "").strip()
                description = (row.get("description") or "").strip()
                amount_value = (row.get("amount") or "").strip()
                currency = (row.get("currency") or "INR").strip().upper()

                if not date_value:
                    errors.append(validation_error(row_number, "date is required."))
                    continue

                try:
                    transaction_date = parse_transaction_date(date_value)
                except ValueError:
                    errors.append(validation_error(row_number, "date must be ISO 8601 format."))
                    continue

                if not description:
                    errors.append(validation_error(row_number, "description is required."))
                    continue

                try:
                    amount = Decimal(amount_value)
                except (InvalidOperation, ValueError):
                    errors.append(validation_error(row_number, "amount must be a valid decimal."))
                    continue

                if not amount.is_finite():
                    errors.append(validation_error(row_number, "amount must be finite."))
                    continue

                if amount == 0:
                    errors.append(validation_error(row_number, "amount cannot be zero."))
                    continue

                if len(currency) != 3 or not currency.isalpha():
                    errors.append(validation_error(row_number, "currency must be a three-letter code."))
                    continue

                normalized_merchant_name = normalize_merchant_name(description)
                if not normalized_merchant_name:
                    errors.append(
                        validation_error(row_number, "description does not contain a merchant name.")
                    )
                    continue

                validated_rows.append(
                    {
                        "amount": amount,
                        "currency": currency,
                        "description": description,
                        "merchant_name": normalized_merchant_name,
                        "transaction_date": transaction_date,
                        "transaction_type": "debit" if amount < 0 else "credit",
                    }
                )
        except csv.Error:
            errors.append(validation_error(row_number, "CSV format is invalid."))

    if errors:
        return JSONResponse(
            status_code=422,
            content={
                "imported_count": 0,
                "failed_count": len(errors),
                "errors": errors,
            },
        )

    try:
        # Pre-fetch user's merchant category rules for priority mapping
        user_rules_map: dict[int, str] = {
            rule.merchant_id: rule.category
            for rule in session.scalars(
                select(MerchantRule).where(MerchantRule.user_id == current_user.id)
            ).all()
        }

        merchant_cache: dict[str, Merchant] = {}
        for row in validated_rows:
            normalized_name = row["merchant_name"]
            merchant = merchant_cache.get(normalized_name)

            if merchant is None:
                merchant = session.scalar(
                    select(Merchant).where(Merchant.normalized_name == normalized_name)
                )
                if merchant is None:
                    merchant = Merchant(
                        name=row["description"], normalized_name=normalized_name
                    )
                    session.add(merchant)
                    session.flush()
                merchant_cache[normalized_name] = merchant

            # 1. User merchant rule takes highest priority
            if merchant.id in user_rules_map:
                category = user_rules_map[merchant.id]
            else:
                # 2. Deterministic categorizer fallback
                category = categorize_transaction(
                    description=row["description"],
                    transaction_type=row["transaction_type"],
                    amount=row["amount"],
                )

            session.add(
                Transaction(
                    account_id=account_id,
                    merchant=merchant,
                    amount=row["amount"],
                    currency=row["currency"],
                    transaction_date=row["transaction_date"],
                    description=row["description"],
                    category=category,
                    transaction_type=row["transaction_type"],
                )
            )
        session.commit()
    except Exception:
        session.rollback()
        raise HTTPException(status_code=500, detail="Transaction import failed.") from None

    return {"imported_count": len(validated_rows), "failed_count": 0, "errors": []}


@app.get("/api/merchant-rules", response_model=list[MerchantRuleResponse])
def get_merchant_rules(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
):
    statement = (
        select(MerchantRule, Merchant)
        .join(Merchant, MerchantRule.merchant_id == Merchant.id)
        .where(MerchantRule.user_id == current_user.id)
        .order_by(Merchant.name.asc())
    )
    results = session.execute(statement).all()
    return [
        MerchantRuleResponse(
            id=rule.id,
            user_id=rule.user_id,
            merchant_id=rule.merchant_id,
            merchant_name=merchant.name,
            category=rule.category,
            created_at=rule.created_at,
            updated_at=rule.updated_at,
        )
        for rule, merchant in results
    ]


@app.put("/api/merchant-rules/{merchant_id}", response_model=MerchantRuleResponse)
def upsert_merchant_rule(
    merchant_id: int,
    payload: MerchantRuleCreate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
):
    if not is_valid_category(payload.category):
        raise HTTPException(
            status_code=422,
            detail=f"Invalid category. Must be one of: {', '.join(SUPPORTED_CATEGORIES)}",
        )

    merchant = session.get(Merchant, merchant_id)
    if merchant is None:
        raise HTTPException(status_code=404, detail="Merchant not found.")

    # Verify merchant is associated with at least one transaction in an account owned by current_user
    user_tx_exists = session.scalar(
        select(Transaction.id)
        .join(Account, Transaction.account_id == Account.id)
        .where(
            Transaction.merchant_id == merchant_id,
            Account.user_id == current_user.id,
        )
        .limit(1)
    )
    if not user_tx_exists:
        raise HTTPException(
            status_code=403,
            detail="Forbidden: Merchant is not associated with any of your transactions.",
        )

    statement = select(MerchantRule).where(
        MerchantRule.user_id == current_user.id,
        MerchantRule.merchant_id == merchant_id,
    )
    rule = session.scalar(statement)
    if rule is None:
        rule = MerchantRule(
            user_id=current_user.id,
            merchant_id=merchant_id,
            category=payload.category.strip(),
        )
        session.add(rule)
    else:
        rule.category = payload.category.strip()

    session.commit()
    session.refresh(rule)

    return MerchantRuleResponse(
        id=rule.id,
        user_id=rule.user_id,
        merchant_id=rule.merchant_id,
        merchant_name=merchant.name,
        category=rule.category,
        created_at=rule.created_at,
        updated_at=rule.updated_at,
    )


@app.delete("/api/merchant-rules/{merchant_id}")
def delete_merchant_rule(
    merchant_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
):
    statement = select(MerchantRule).where(
        MerchantRule.user_id == current_user.id,
        MerchantRule.merchant_id == merchant_id,
    )
    rule = session.scalar(statement)
    if rule is None:
        raise HTTPException(status_code=404, detail="Merchant rule not found.")

    session.delete(rule)
    session.commit()
    return {"message": "Merchant rule deleted successfully."}
