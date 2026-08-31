from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
from datetime import datetime, timezone
from typing import Generator

from fastapi import Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import User

SECRET_KEY = os.getenv("SECRET_KEY", "development-secret-key-finsight-change-in-production")
AUTH_COOKIE_NAME = "finsight_session"
COOKIE_MAX_AGE_SECONDS = 7 * 24 * 3600  # 7 days


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    iterations = 600000
    derived = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        iterations,
    )
    return f"pbkdf2_sha256${iterations}${salt}${derived.hex()}"


def verify_password(password: str, hashed_password: str) -> bool:
    try:
        parts = hashed_password.split("$")
        if len(parts) != 4 or parts[0] != "pbkdf2_sha256":
            return False
        iterations = int(parts[1])
        salt = parts[2]
        expected_hash = parts[3]
        derived = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            salt.encode("utf-8"),
            iterations,
        )
        return hmac.compare_digest(derived.hex(), expected_hash)
    except Exception:
        return False


def _b64_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("utf-8").rstrip("=")


def _b64_decode(data_str: str) -> bytes:
    padding = 4 - (len(data_str) % 4)
    if padding != 4:
        data_str += "=" * padding
    return base64.urlsafe_b64decode(data_str)


def create_access_token(user_id: int, email: str, expires_in_seconds: int = COOKIE_MAX_AGE_SECONDS) -> str:
    header = {"alg": "HS256", "typ": "JWT"}
    now = int(datetime.now(timezone.utc).timestamp())
    payload = {
        "user_id": user_id,
        "email": email,
        "iat": now,
        "exp": now + expires_in_seconds,
    }
    header_b64 = _b64_encode(json.dumps(header, separators=(",", ":")).encode("utf-8"))
    payload_b64 = _b64_encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    signing_input = f"{header_b64}.{payload_b64}".encode("utf-8")
    signature = hmac.new(SECRET_KEY.encode("utf-8"), signing_input, hashlib.sha256).digest()
    sig_b64 = _b64_encode(signature)
    return f"{header_b64}.{payload_b64}.{sig_b64}"


def decode_access_token(token: str) -> dict | None:
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return None
        header_b64, payload_b64, sig_b64 = parts
        signing_input = f"{header_b64}.{payload_b64}".encode("utf-8")
        expected_sig = hmac.new(SECRET_KEY.encode("utf-8"), signing_input, hashlib.sha256).digest()
        provided_sig = _b64_decode(sig_b64)
        if not hmac.compare_digest(expected_sig, provided_sig):
            return None
        payload = json.loads(_b64_decode(payload_b64).decode("utf-8"))
        now = int(datetime.now(timezone.utc).timestamp())
        if payload.get("exp", 0) < now:
            return None
        return payload
    except Exception:
        return None


def set_auth_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=AUTH_COOKIE_NAME,
        value=token,
        max_age=COOKIE_MAX_AGE_SECONDS,
        httponly=True,
        samesite="lax",
        secure=False,
        path="/",
    )


def clear_auth_cookie(response: Response) -> None:
    response.delete_cookie(
        key=AUTH_COOKIE_NAME,
        path="/",
        httponly=True,
        samesite="lax",
    )


def get_db() -> Generator[Session, None, None]:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


def get_current_user(
    request: Request,
    session: Session = Depends(get_db),
) -> User:
    token = request.cookies.get(AUTH_COOKIE_NAME)
    if not token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header[7:].strip()

    if not token:
        raise HTTPException(
            status_code=401,
            detail="Authentication required.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = decode_access_token(token)
    if not payload or "user_id" not in payload:
        raise HTTPException(
            status_code=401,
            detail="Session expired or invalid.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = session.get(User, payload["user_id"])
    if user is None:
        raise HTTPException(
            status_code=401,
            detail="User no longer exists.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user
