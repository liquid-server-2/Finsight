from __future__ import annotations

from datetime import datetime
from pydantic import BaseModel, ConfigDict


class MerchantRuleCreate(BaseModel):
    category: str


class MerchantRuleResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    merchant_id: int
    merchant_name: str
    category: str
    created_at: datetime
    updated_at: datetime
