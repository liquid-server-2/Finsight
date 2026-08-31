import re
from datetime import datetime

from pydantic import BaseModel, ConfigDict, field_validator


class UserRegister(BaseModel):
    email: str
    password: str

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        value = value.strip().lower()
        if not value:
            raise ValueError("Email must not be empty.")
        if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", value):
            raise ValueError("Invalid email address format.")
        return value

    @field_validator("password")
    @classmethod
    def validate_password(cls, value: str) -> str:
        if len(value) < 8:
            raise ValueError("Password must be at least 8 characters long.")
        if len(value.strip()) == 0:
            raise ValueError("Password must not be only whitespace.")
        return value


class UserLogin(BaseModel):
    email: str
    password: str

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        value = value.strip().lower()
        if not value:
            raise ValueError("Email must not be empty.")
        return value

    @field_validator("password")
    @classmethod
    def validate_password(cls, value: str) -> str:
        if not value:
            raise ValueError("Password must not be empty.")
        return value


class UserCreate(BaseModel):
    email: str

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        value = value.strip().lower()
        if not value:
            raise ValueError("must not be empty")
        return value


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    created_at: datetime
