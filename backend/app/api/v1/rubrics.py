from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.core.database import get_db
from app.models.rubric import SpeakingRubric, RubricCriterion
from app.core.limiter import rate_limit

router = APIRouter(prefix='/rubrics', tags=['rubrics'])


def _serialize_criteria(criteria: list[RubricCriterion]) -> list[dict]:
    return [
        {
            'id': c.id,
            'name': c.name,
            'description': c.description,
            'weight': c.weight,
            'sort_order': c.sort_order,
        }
        for c in criteria
    ]


@router.get('')
@rate_limit("30/minute")
async def list_rubrics(request: Request, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(SpeakingRubric)
        .options(selectinload(SpeakingRubric.criteria))
        .order_by(SpeakingRubric.is_default.desc())
    )
    rubrics = result.scalars().all()
    return [
        {
            'id': r.id,
            'name': r.name,
            'description': r.description,
            'is_default': r.is_default,
            'criteria': _serialize_criteria(r.criteria),
        }
        for r in rubrics
    ]


@router.get('/default')
@rate_limit("30/minute")
async def get_default_rubric(request: Request, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(SpeakingRubric)
        .options(selectinload(SpeakingRubric.criteria))
        .where(SpeakingRubric.is_default == True)
    )
    rubric = result.scalar_one_or_none()
    if not rubric:
        return None
    return {
        'id': rubric.id,
        'name': rubric.name,
        'description': rubric.description,
        'is_default': rubric.is_default,
        'criteria': _serialize_criteria(rubric.criteria),
    }