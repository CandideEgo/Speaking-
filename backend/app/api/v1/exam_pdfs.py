"""真题原卷 PDF 的清单与下载。

**这是个独立 router，没塞进 ``exams.router``。** 后者末尾有一条 catch-all
``GET /{paper_id}``（``api/v1/exams.py``），``/exams/pdfs`` 会被当成 paper_id 吃掉，
命中「试卷不存在」而不是清单 —— 而且顺序上要修好它得把静态路径排在动态路径之前，
等于让一个只读功能去改试卷库的路由表。

Endpoints:
  GET /exam-pdfs?subject=      清单（Bearer；登录用户）
  GET /exam-pdfs/{slug}/file   下载原件（登录；支持 ``?token=``）

**目录穿越**：客户端只给 slug，路径从清单查（见 ``services/exam_pdf_service``），
服务端不拼接任何来自客户端的路径片段。
"""

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import FileResponse

from app.api.dependencies import get_current_user
from app.api.v1.media import _viewer_id_from_request
from app.core.limiter import rate_limit
from app.models.user import User
from app.services import exam_pdf_service

router = APIRouter(prefix="/exam-pdfs", tags=["exam-pdfs"])

# 文件名里不能出现的字符（标题里带 `/` 会让某些客户端把 Content-Disposition
# 的文件名截断成路径）。
_FILENAME_BAD = str.maketrans({c: "_" for c in '\\/:*?"<>|'})


@router.get("")
@rate_limit("60/minute")
async def list_exam_pdfs(
    request: Request,
    subject: str | None = Query(None, description="科目：cet4/cet6/kaoyan/tem4/tem8"),
    current_user: User = Depends(get_current_user),
):
    """原卷清单。``subject`` 缺省返回全部。"""
    items = exam_pdf_service.list_pdfs(subject)
    return {"count": len(items), "items": items}


@router.get("/{slug}/file")
@rate_limit("60/minute")
async def download_exam_pdf(slug: str, request: Request):
    """下载一份原卷 PDF。

    鉴权走 ``?token=`` 或 ``Authorization``，与 ``media.py`` 同一份写法 —— 下载入口
    是 ``<a download>``，发不出请求头，所以必须支持 query token。匿名一律 **401**
    （不是 404）：这里不是存在性保密，是「要登录」，前端才好据此提示去登录。
    """
    if await _viewer_id_from_request(request) is None:
        raise HTTPException(status_code=401, detail="请先登录后再下载")

    found = exam_pdf_service.resolve(slug)
    if found is None:
        raise HTTPException(status_code=404, detail="原件不存在")
    full, rec = found
    # FileResponse 自带 Range / ETag / Last-Modified，非 ASCII 文件名自动走
    # filename*=utf-8''，不需要手写。
    return FileResponse(
        full,
        media_type="application/pdf",
        filename=f"{rec['title'].translate(_FILENAME_BAD)}.pdf",
    )
