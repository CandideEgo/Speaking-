import logging

from app.tasks.celery_app import celery_app
from app.services.comment_service import CommentService

logger = logging.getLogger(__name__)


@celery_app.task(bind=True, max_retries=2)
def analyze_video_comments(self, video_id: str, youtube_video_id: str):
    """Asynchronously fetch and analyze comments for a video.

    Steps:
        1. Fetch comments from YouTube Data API
        2. Store in video_comments table
        3. Run quality analysis
        4. Store results in video_comment_stats
    """
    import asyncio
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
                        "No comments fetched for video %s", video_id
                    )
                    return

                # Step 2: Analyze
                stats = await service.analyze_video_comments(db, video_id)
                if stats:
                    logger.info(
                        "Comment analysis complete for video %s: score=%d",
                        video_id,
                        stats.overall_quality_score,
                    )
                else:
                    logger.warning(
                        "Comment analysis produced no stats for video %s",
                        video_id,
                    )
            except Exception as e:
                logger.exception(
                    "Comment analysis failed for video %s", video_id
                )
                raise self.retry(exc=e)

    try:
        asyncio.run(_process())
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(_process())
        finally:
            loop.close()
