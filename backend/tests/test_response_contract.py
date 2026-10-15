"""Response-shape snapshot: what each endpoint actually returns, field by field.

Why this file exists
--------------------
``tests/`` pins status codes and error codes in ~200 places, but nothing pinned
*which fields a card endpoint returns*. Three later batches of
``docs/architecture-fix-plan-2026-10.md`` (error contract, card projector,
fossil cleanup) change response bodies — without this file every one of those
changes would have to be reviewed by eye.

This snapshot deliberately records **today's shape, including the parts that
are inconsistent** (four hand-written card serializers, ``response_model=dict``
endpoints whose item type is unbound). Its value is that the mess becomes
diffable: after this file lands, a changed contract can only show up as a
change here, and each line of that diff has to be justified.

Reading the failures
--------------------
If you changed a response on purpose, update the literal here in the same
commit. If the snapshot disagrees with reality and you did not mean to change
anything, the snapshot is right and the code is wrong.

The four card endpoints below return **four different key sets** for what the
UI renders as one card. That is not an oversight in this file — it is the
defect batch 2 exists to collapse, pinned so the collapse is reviewable.
"""

from app.models.favorite import UserFavorite
from app.models.video import Video, VideoReviewStatus, VideoStatus

_FEED = "/api/v1/browse/feed"
_PUBLIC = "/api/v1/videos/public"
_RANKINGS = "/api/v1/videos/rankings"
_FAVORITES = "/api/v1/videos/favorites"
_ADMIN_FEEDBACK = "/api/v1/admin/feedback"

# --- recorded shapes -------------------------------------------------------
# sorted(keys) of the paginated envelope every list endpoint reuses.
_ENVELOPE_KEYS = ["has_more", "items", "page", "page_size", "total"]

# GET /browse/feed — services/browse._video_to_dict
_FEED_ITEM_KEYS = [
    "channel_name",
    "channel_slug",
    "created_at",
    "description",
    "difficulty_level",
    "duration",
    "favorite_count",
    "id",
    "is_official",
    "like_count",
    "status",
    "thumbnail_url",
    "title",
    "topic_tags",
    "video_source",
    "view_count",
]

# GET /videos/public — the only card served through a real response_model
# (PaginatedResponse[VideoResponse]), so its shape is enforced at runtime.
_PUBLIC_ITEM_KEYS = [
    "channel_cover_url",
    "channel_name",
    "channel_slug",
    "created_at",
    "description",
    "difficulty_level",
    "duration",
    "error_message",
    "ext_like_count",
    "ext_view_count",
    "favorite_count",
    "forked_from",
    "id",
    "is_demo",
    "is_official",
    "is_published",
    "like_count",
    "processing_mode",
    "processing_progress",
    "processing_step",
    "rejection_reason",
    "review_status",
    "score",
    "score_updated_at",
    "source_url",
    "status",
    "storage_mode",
    "thumbnail_url",
    "title",
    "topic_tags",
    "upload_date",
    "video_source",
    "video_url_1080p",
    "video_url_480p",
    "video_url_720p",
    "view_count",
    "vocabulary_density",
    "wpm",
    "yt_video_id",
]

# GET /videos/rankings — services/ranking_service._serialize. Adds the ranking
# metric but drops the feed's `description`; there is no single card shape.
_RANKINGS_ITEM_KEYS = [
    "channel_name",
    "channel_slug",
    "created_at",
    "difficulty_level",
    "duration",
    "favorite_count",
    "id",
    "is_official",
    "like_count",
    "metric",
    "published_at",
    "status",
    "thumbnail_url",
    "title",
    "topic_tags",
    "video_source",
    "view_count",
]

# GET /videos/favorites — inline dict in api/v1/videos.py. Shares almost nothing
# with the other three beyond the common core: it is the only one carrying
# `favorited_at` / `has_note` / `note_excerpt`, and the only card missing
# `status` / `is_official` / `video_source` / `created_at`.
_FAVORITES_ITEM_KEYS = [
    "channel_name",
    "channel_slug",
    "description",
    "difficulty_level",
    "duration",
    "favorite_count",
    "favorited_at",
    "has_note",
    "id",
    "like_count",
    "note_excerpt",
    "storage_mode",
    "thumbnail_url",
    "title",
    "topic_tags",
    "view_count",
]


async def _make_video(db, *, title: str = "snapshot") -> Video:
    v = Video(
        title=title,
        source_url=f"https://contract.test/{title}",
        video_source="imported",
        status=VideoStatus.ready,
        is_official=True,
        is_published=True,
        review_status=VideoReviewStatus.published.value,
        topic_tags="tech",
        difficulty_level="B1",
        duration=120.0,
        video_url_720p=f"/media/{title}.mp4",
    )
    db.add(v)
    await db.commit()
    await db.refresh(v)
    return v


async def _seed_one_card(client, db, auth_headers) -> Video:
    """One published video, favorited by the authenticated user."""
    video = await _make_video(db)
    me = (await client.get("/api/v1/users/me", headers=auth_headers)).json()
    db.add(UserFavorite(user_id=me["id"], video_id=video.id))
    await db.commit()
    return video


class TestCardShapes:
    """The four card endpoints, pinned independently so a drift names its site."""

    async def test_browse_feed(self, client, db_session, auth_headers):
        await _seed_one_card(client, db_session, auth_headers)
        body = (await client.get(_FEED)).json()
        assert sorted(body.keys()) == _ENVELOPE_KEYS
        assert sorted(body["items"][0].keys()) == _FEED_ITEM_KEYS

    async def test_videos_public(self, client, db_session, auth_headers):
        await _seed_one_card(client, db_session, auth_headers)
        body = (await client.get(_PUBLIC)).json()
        assert sorted(body.keys()) == _ENVELOPE_KEYS
        assert sorted(body["items"][0].keys()) == _PUBLIC_ITEM_KEYS

    async def test_videos_rankings(self, client, db_session, auth_headers):
        await _seed_one_card(client, db_session, auth_headers)
        body = (await client.get(_RANKINGS, params={"scope": "latest"})).json()
        assert sorted(body[0].keys()) == _RANKINGS_ITEM_KEYS

    async def test_videos_favorites(self, client, db_session, auth_headers):
        await _seed_one_card(client, db_session, auth_headers)
        body = (await client.get(_FAVORITES, headers=auth_headers)).json()
        assert sorted(body.keys()) == _ENVELOPE_KEYS
        assert sorted(body["items"][0].keys()) == _FAVORITES_ITEM_KEYS

    async def test_admin_feedback_dict_endpoint(self, client, db_session, admin_headers):
        """``response_model=dict`` sites have no enforced shape at all.

        The envelope here is missing `total`, which every other list endpoint
        returns — exactly the kind of drift an unbound response model allows.
        """
        resp = await client.get(_ADMIN_FEEDBACK, headers=admin_headers)
        assert resp.status_code == 200
        assert sorted(resp.json().keys()) == ["has_more", "items", "page", "page_size"]


class TestCardShapesHaveDiverged:
    """Documents the divergence batch 2 collapses — not an endorsement of it.

    If one of these starts failing because the four serializers were unified,
    that is the intended outcome: delete the test in the same commit that
    updates the key sets above.
    """

    def test_favorites_is_not_the_feed_shape(self):
        assert set(_FAVORITES_ITEM_KEYS) != set(_FEED_ITEM_KEYS)

    def test_rankings_is_not_the_feed_shape(self):
        assert set(_RANKINGS_ITEM_KEYS) != set(_FEED_ITEM_KEYS)

    def test_public_carries_the_whole_model(self):
        # The one endpoint with a real response_model returns ~2.4x the fields.
        assert len(_PUBLIC_ITEM_KEYS) > 2 * len(_FEED_ITEM_KEYS)


class TestErrorEnvelopeShapes:
    """``(status, code)`` pairs for the error paths the plan touches.

    batch 1 replaces the message-sniffing that produces these codes; the codes
    themselves must not move. ``detail`` is asserted as "present" rather than
    by value: it is the human-readable half and is allowed to change wording.
    """

    async def test_missing_bearer_token(self, client):
        resp = await client.get("/api/v1/users/me")
        assert resp.status_code == 401
        body = resp.json()
        assert body["code"] == "HTTP_401"
        assert sorted(body.keys()) == ["code", "detail", "message"]

    async def test_missing_video_is_404(self, client):
        """Produced today by `if "not found" in msg.lower()` in videos.py."""
        resp = await client.get("/api/v1/videos/does-not-exist")
        assert resp.status_code == 404
        assert resp.json()["code"] == "HTTP_404"

    async def test_unknown_ranking_scope_is_422(self, client):
        resp = await client.get(_RANKINGS, params={"scope": "nope"})
        assert resp.status_code == 422
        assert resp.json()["code"] == "HTTP_422"

    async def test_request_validation_error_is_envelope(self, client):
        resp = await client.get(_PUBLIC, params={"page": 0})
        assert resp.status_code == 422
        body = resp.json()
        assert body["code"] == "VALIDATION_ERROR"
        assert isinstance(body["detail"], list)
