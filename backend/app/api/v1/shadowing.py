"""Authenticated compatibility routes for retired recording features.

Each (path, method) is a distinct function so FastAPI/OpenAPI gets a unique
operation id. Stacking several methods on one function made the generated
operation ids collide (invalid OpenAPI for code generators/schema validators).
"""

from fastapi import APIRouter, Depends, Request

from app.api.dependencies import get_current_user
from app.models.user import User
from app.services.retired_features import feature_gone

router = APIRouter(prefix="/shadowing", tags=["shadowing"])


@router.get("/attempts")
async def list_shadowing_attempts(request: Request, current_user: User = Depends(get_current_user)):
    feature_gone()


@router.post("/attempts")
async def create_shadowing_attempt(request: Request, current_user: User = Depends(get_current_user)):
    feature_gone()


@router.patch("/attempts/{attempt_id}")
async def update_shadowing_attempt(request: Request, attempt_id: str, current_user: User = Depends(get_current_user)):
    feature_gone()


@router.delete("/attempts/{attempt_id}")
async def delete_shadowing_attempt(request: Request, attempt_id: str, current_user: User = Depends(get_current_user)):
    feature_gone()


@router.get("/stats")
async def shadowing_stats(request: Request, current_user: User = Depends(get_current_user)):
    feature_gone()
