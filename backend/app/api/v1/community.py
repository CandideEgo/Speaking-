"""Community channel — curated English-learning content feeds."""

from app.api.v1.feed_base import FeedConfig, create_feed_router

router = create_feed_router(FeedConfig(
    prefix="/community",
    tag="community",
    feed_doc="Paginated content feed — Community-curated English learning videos.",
    error_label="Community",
    categories=[
        {"id": "all", "label": "All", "query": "best English learning video"},
        {"id": "ted", "label": "TED Talks", "query": "TED talk inspiring English"},
        {"id": "interview", "label": "Interviews", "query": "insightful interview English learning"},
        {"id": "news", "label": "News", "query": "BBC NNP English news clear speech"},
        {"id": "vlog", "label": "Vlogs", "query": "English vlog authentic daily life"},
        {"id": "educational", "label": "Educational", "query": "English lesson teaching tips"},
        {"id": "movie", "label": "Movie Clips", "query": "classic movie scene English"},
        {"id": "tech", "label": "Tech", "query": "tech review explainer English"},
    ],
))
