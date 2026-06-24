import structlog

from app.services.comment_service import CommentService
from app.tasks.async_helpers import run_async
from app.tasks.celery_app import celery_app

logger = structlog.get_logger()


@celery_app.task(bind=True, autoretry_for=(Exception,), retry_backoff=True, retry_backoff_max=60, max_retries=3)
def analyze_video_comments(self, video_id: str):
    """Asynchronously analyze stored comments for a video.

    Steps:
        1. Run quality analysis on existing stored comments
        2. Store results in video_comment_stats
    """
    from app.core.database import async_session

    async def _process():
        async with async_session() as db:
            service = CommentService()
            try:
                # Analyze existing stored comments
                stats = await service.analyze_video_comments(db, video_id)
                if stats:
                    logger.info(
                        "Comment analysis complete for video",
                        video_id=video_id,
                        overall_quality_score=stats.overall_quality_score,
                    )
                else:
                    logger.warning(
                        "Comment analysis produced no stats for video (no stored comments)",
                        video_id=video_id,
                    )
            except Exception as e:
                logger.exception("Comment analysis failed for video", video_id=video_id)
                raise self.retry(exc=e) from e

    run_async(_process())
