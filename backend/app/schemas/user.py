from pydantic import BaseModel, EmailStr, Field, field_serializer, field_validator
from datetime import datetime


class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: str | None = Field(default=None, max_length=100)

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        if len(v) > 128:
            raise ValueError("Password too long")
        return v


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserUpdate(BaseModel):
    name: str | None = None
    level: str | None = None

    @field_validator("level")
    @classmethod
    def validate_level(cls, v: str | None) -> str | None:
        if v is not None and v.upper() not in ("A1", "A2", "B1", "B2", "C1", "C2"):
            raise ValueError("Level must be one of: A1, A2, B1, B2, C1, C2")
        return v.upper() if v else v


class UserResponse(BaseModel):
    id: str
    email: str
    name: str | None
    level: str | None
    plan: str
    role: str | None = None
    created_at: datetime

    @field_serializer("created_at")
    def serialize_created_at(self, v: datetime) -> str:
        return v.isoformat()

    model_config = {"from_attributes": True}


class TokenResponse(BaseModel):
    token: str
    user: UserResponse
