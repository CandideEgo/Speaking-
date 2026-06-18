import structlog

from app.tasks.celery_app import celery_app
from app.tasks.async_helpers import run_async
from app.services.comment_service import CommentService

logger = structlog.get_logger()


@celery_app.task(bind=True, autoretry_for=(Exception,), retry_backoff=True, retry_backoff_max=60, max_retries=3)
def analyze_video_comments(self, video_id: str, youtube_video_id: str):
    """Asynchronously fetch and analyze comments for a video.

    Steps:
        1. Fetch comments from YouTube Data API
        2. Store in video_comments table
        3. Run quality analysis
        4. Store results in video_comment_stats
    """
    from app.core.database import async_session

    async def _process():
        async with async_session() as db:
            service = CommentService()
            try:
                # Step 1: Fetch and store comments
                comments = await service.fetch_and_store_comments(
                    db, video_id, youtube_video_id, max_results=100
                )
                if not comments:
                    logger.warning(
                        "No comments fetched for video", video_id=video_id
                    )
                    return

                # Step 2: Analyze
                stats = await service.analyze_video_comments(db, video_id)
                if stats:
                    logger.info(
                        "Comment analysis complete for video",
                        video_id=video_id,
                        overall_quality_score=stats.overall_quality_score,
                    )
                else:
                    logger.warning(
                        "Comment analysis produced no stats for video",
                        video_id=video_id,
                    )
            except Exception as e:
                logger.exception(
                    "Comment analysis failed for video", video_id=video_id
                )
                raise self.retry(exc=e)

    run_async(_process())
