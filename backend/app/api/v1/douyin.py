"""Douyin channel — short-form English-learning content feeds."""

from app.api.v1.feed_base import FeedConfig, create_feed_router

router = create_feed_router(FeedConfig(
    prefix="/douyin",
    tag="douyin",
    feed_doc="Paginated content feed — Douyin-style short English learning videos.",
    error_label="Douyin",
    categories=[
        {"id": "all", "label": "全部", "query": "English learning short video"},
        {"id": "spoken", "label": "口语表达", "query": "English speaking expression"},
        {"id": "slang", "label": "地道俚语", "query": "English slang idioms"},
        {"id": "pronunciation", "label": "发音技巧", "query": "English pronunciation tips"},
        {"id": "vocabulary", "label": "词汇积累", "query": "English vocabulary building"},
        {"id": "culture", "label": "英美文化", "query": "British American culture English"},
        {"id": "daily", "label": "日常英语", "query": "daily English phrases"},
    ],
))
