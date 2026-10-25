"""Channel response schemas (BE-07).

``GET /channels`` and ``GET /channels/{slug}`` used to return plain dicts with
no OpenAPI contract. Fields mirror ``channel_service._channel_public`` +
``channel_learning.channel_facts`` exactly; a missing key here would silently
drop it from the response, so new service keys must be added here too.
"""

from pydantic import BaseModel

from app.schemas.pagination import PaginatedResponse
from app.schemas.video import VideoResponse


class ChannelDirection(BaseModel):
    id: str
    label: str


class ChannelDifficultyRange(BaseModel):
    min: str
    max: str


class LatestVideo(BaseModel):
    id: str
    title: str
    title_zh: str | None = None
    thumbnail_url: str | None = None
    duration: float | None = None
    published_at: str | None = None
    difficulty_level: str | None = None
    view_count: int = 0
    favorite_count: int = 0
    upload_date: str | None = None
    created_at: str | None = None


class ChannelBase(BaseModel):
    id: str
    name: str
    slug: str
    description: str | None = None
    cover_url: str | None = None
    video_count: int
    positioning_zh: str | None = None
    learning_directions: list[ChannelDirection]
    difficulty_range: ChannelDifficultyRange | None = None
    accent_label: str | None = None
    video_titles: list[str]


class ChannelCard(ChannelBase):
    total_view_count: int
    latest_video: LatestVideo | None = None
    subscriber_count: int
    is_subscribed: bool


class ChannelDetailChannel(ChannelBase):
    total_view_count: int
    follower_count: int | None = None
    is_verified: bool | None = None
    subscriber_count: int
    is_subscribed: bool
    latest_published_at: str | None = None
    recent_video_count: int


class RecommendedStart(BaseModel):
    video: VideoResponse
    basis: str


class ChannelDetailResponse(BaseModel):
    channel: ChannelDetailChannel
    recommended_start: RecommendedStart | None = None
    videos: PaginatedResponse[VideoResponse]


class AdminChannelItem(BaseModel):
    """Admin rows intentionally omit public-card facts (no fact join)."""

    id: str
    name: str
    slug: str
    description: str | None = None
    cover_url: str | None = None
    video_count: int
    upstream_channel_id: str | None = None
    sort_order: int
    is_visible: bool
    is_auto: bool
    created_at: str | None = None


class AdminChannelListResponse(BaseModel):
    items: list[AdminChannelItem]


class ChannelAdminRefResponse(BaseModel):
    id: str
    slug: str
    name: str


class ChannelAttachVideosResponse(BaseModel):
    attached: int
