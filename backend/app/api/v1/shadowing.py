"""Authenticated compatibility routes for retired recording features."""

from fastapi import APIRouter, Depends, Request

from app.api.dependencies import get_current_user
from app.models.user import User
from app.services.retired_features import feature_gone

router = APIRouter(prefix="/shadowing", tags=["shadowing"])


@router.api_route("/attempts", methods=["GET", "POST"])
@router.api_route("/attempts/{attempt_id}", methods=["PATCH", "DELETE"])
@router.get("/stats")
async def retired_shadowing(request: Request, current_user: User = Depends(get_current_user)):
    feature_gone()
