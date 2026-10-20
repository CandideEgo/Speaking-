"""公共首页编辑内容读取（``GET /api/v1/browse/home-editorial``）。

契约 §4/§5：无鉴权、**无响应缓存**（每次读库，发布/下线立即生效），只返回已发布
且来源仍有效的内容；``editorial == null`` 表示没有可用的新编排，首页整块退回既有
``browse/featured + learning metadata`` 流程。草稿、生成错误、prompt 永不出现。
"""

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.limiter import rate_limit
from app.schemas.home_content import HomeEditorialResponse
from app.services import home_content_service

router = APIRouter(prefix="/browse", tags=["browse"])


@router.get("/home-editorial", response_model=HomeEditorialResponse)
@rate_limit("30/minute")
async def home_editorial(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """已发布的首页编辑内容；没有有效内容时回 ``{"editorial": null}``。"""
    page = await home_content_service.resolve_public_page(db)
    return HomeEditorialResponse(editorial=page)
