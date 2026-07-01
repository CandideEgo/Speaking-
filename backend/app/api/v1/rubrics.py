import logging

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.dependencies import get_admin_user, get_current_user
from app.core.database import get_db
from app.core.limiter import rate_limit
from app.models.rubric import RubricCriterion, SpeakingRubric
from app.models.user import RoleType, User
from app.schemas.rubric import RubricCreate, RubricCriterionResponse, RubricResponse, RubricUpdate

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/rubrics", tags=["rubrics"])


def _serialize_criteria(criteria: list[RubricCriterion]) -> list[dict]:
    return [
        {
            "id": c.id,
            "name": c.name,
            "description": c.description,
            "weight": c.weight,
            "sort_order": c.sort_order,
        }
        for c in criteria
    ]


def _rubric_to_response(rubric: SpeakingRubric) -> RubricResponse:
    return RubricResponse(
        id=rubric.id,
        name=rubric.name,
        description=rubric.description,
        is_default=rubric.is_default,
        criteria=[
            RubricCriterionResponse(
                id=c.id,
                name=c.name,
                description=c.description,
                weight=c.weight,
                sort_order=c.sort_order,
            )
            for c in rubric.criteria
        ],
        created_at=rubric.created_at.isoformat() if rubric.created_at else "",
    )


async def _reload_rubric(db: AsyncSession, rubric_id: str) -> SpeakingRubric:
    """Re-fetch a rubric with its criteria freshly loaded.

    Expires the identity map first so a previously-loaded (and possibly
    mutated) relationship is not served from cache — important after
    create/update where criteria were added or replaced.
    """
    db.expire_all()
    result = await db.execute(
        select(SpeakingRubric).options(selectinload(SpeakingRubric.criteria)).where(SpeakingRubric.id == rubric_id)
    )
    return result.scalar_one()


async def _invalidate_rubric_cache():
    """Delete rubric cache keys from Redis using the shared async client."""
    try:
        from app.core.redis import get_redis

        r = await get_redis()
        await r.delete("rubrics:all", "rubrics:default")
    except Exception:
        logger.warning("Failed to invalidate rubric cache", exc_info=True)


@router.get("")
@rate_limit("30/minute")
async def list_rubrics(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(SpeakingRubric).options(selectinload(SpeakingRubric.criteria)).order_by(SpeakingRubric.is_default.desc())
    )
    rubrics = result.scalars().all()
    return [
        {
            "id": r.id,
            "name": r.name,
            "description": r.description,
            "is_default": r.is_default,
            "criteria": _serialize_criteria(r.criteria),
        }
        for r in rubrics
    ]


@router.get("/default")
@rate_limit("30/minute")
async def get_default_rubric(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(SpeakingRubric).options(selectinload(SpeakingRubric.criteria)).where(SpeakingRubric.is_default == True)
    )
    rubric = result.scalar_one_or_none()
    if not rubric:
        return None
    return {
        "id": rubric.id,
        "name": rubric.name,
        "description": rubric.description,
        "is_default": rubric.is_default,
        "criteria": _serialize_criteria(rubric.criteria),
    }


@router.post("", response_model=RubricResponse, status_code=status.HTTP_201_CREATED)
@rate_limit("10/minute")
async def create_rubric(
    request: Request,
    body: RubricCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_admin_user),
):
    rubric = SpeakingRubric(
        name=body.name,
        description=body.description,
    )
    db.add(rubric)
    await db.flush()

    for c in body.criteria:
        criterion = RubricCriterion(
            rubric_id=rubric.id,
            name=c.name,
            description=c.description,
            weight=c.weight,
            sort_order=c.sort_order,
        )
        db.add(criterion)

    await db.commit()

    # Reload with criteria
    rubric = await _reload_rubric(db, rubric.id)
    await _invalidate_rubric_cache()
    return _rubric_to_response(rubric)


@router.put("/{rubric_id}", response_model=RubricResponse)
@rate_limit("10/minute")
async def update_rubric(
    request: Request,
    rubric_id: str,
    body: RubricUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_admin_user),
):
    result = await db.execute(
        select(SpeakingRubric).options(selectinload(SpeakingRubric.criteria)).where(SpeakingRubric.id == rubric_id)
    )
    rubric = result.scalar_one_or_none()
    if not rubric:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rubric not found")

    if body.name is not None:
        rubric.name = body.name
    if body.description is not None:
        rubric.description = body.description

    if body.criteria is not None:
        # Delete existing criteria and replace
        for existing_c in rubric.criteria:
            await db.delete(existing_c)
        await db.flush()

        for c in body.criteria:
            criterion = RubricCriterion(
                rubric_id=rubric.id,
                name=c.name,
                description=c.description,
                weight=c.weight,
                sort_order=c.sort_order,
            )
            db.add(criterion)

    await db.commit()

    # Reload with criteria
    rubric = await _reload_rubric(db, rubric_id)
    await _invalidate_rubric_cache()
    return _rubric_to_response(rubric)


@router.delete("/{rubric_id}", status_code=status.HTTP_204_NO_CONTENT)
@rate_limit("10/minute")
async def delete_rubric(
    request: Request,
    rubric_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_admin_user),
):
    result = await db.execute(select(SpeakingRubric).where(SpeakingRubric.id == rubric_id))
    rubric = result.scalar_one_or_none()
    if not rubric:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rubric not found")

    if rubric.is_default:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete the default rubric",
        )

    await db.delete(rubric)
    await db.commit()
    await _invalidate_rubric_cache()


@router.post("/{rubric_id}/set-default", response_model=RubricResponse)
@rate_limit("10/minute")
async def set_default_rubric(
    request: Request,
    rubric_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_admin_user),
):
    result = await db.execute(select(SpeakingRubric).where(SpeakingRubric.id == rubric_id))
    rubric = result.scalar_one_or_none()
    if not rubric:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rubric not found")

    # Unset current default
    current_default = await db.execute(select(SpeakingRubric).where(SpeakingRubric.is_default == True))
    for r in current_default.scalars().all():
        r.is_default = False

    rubric.is_default = True
    await db.commit()

    # Reload with criteria
    rubric = await _reload_rubric(db, rubric_id)
    await _invalidate_rubric_cache()
    return _rubric_to_response(rubric)
