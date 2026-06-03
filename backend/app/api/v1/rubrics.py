from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.models.rubric import SpeakingRubric, RubricCriterion

router = APIRouter(prefix='/rubrics', tags=['rubrics'])


@router.get('')
async def list_rubrics(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(SpeakingRubric).order_by(SpeakingRubric.is_default.desc())
    )
    rubrics = result.scalars().all()
    out = []
    for r in rubrics:
        crit_result = await db.execute(
            select(RubricCriterion)
            .where(RubricCriterion.rubric_id == r.id)
            .order_by(RubricCriterion.sort_order)
        )
        criteria = crit_result.scalars().all()
        out.append({
            'id': r.id,
            'name': r.name,
            'description': r.description,
            'is_default': r.is_default,
            'criteria': [
                {
                    'id': c.id,
                    'name': c.name,
                    'description': c.description,
                    'weight': c.weight,
                    'sort_order': c.sort_order,
                }
                for c in criteria
            ],
        })
    return out


@router.get('/default')
async def get_default_rubric(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(SpeakingRubric).where(SpeakingRubric.is_default == True)
    )
    rubric = result.scalar_one_or_none()
    if not rubric:
        return None
    crit_result = await db.execute(
        select(RubricCriterion)
        .where(RubricCriterion.rubric_id == rubric.id)
        .order_by(RubricCriterion.sort_order)
    )
    criteria = crit_result.scalars().all()
    return {
        'id': rubric.id,
        'name': rubric.name,
        'description': rubric.description,
        'is_default': rubric.is_default,
        'criteria': [
            {
                'id': c.id,
                'name': c.name,
                'description': c.description,
                'weight': c.weight,
                'sort_order': c.sort_order,
            }
            for c in criteria
        ],
    }