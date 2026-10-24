"""Response-shape snapshot: what each endpoint actually returns, field by field.

Why this file exists
--------------------
``tests/`` pins status codes and error codes in ~200 places, but nothing pinned
*which fields a card endpoint returns*. Three later batches of
``docs/architecture-fix-plan-2026-10.md`` (error contract, card projector,
fossil cleanup) change response bodies — without this file every one of those
changes would have to be reviewed by eye.

This snapshot recorded **today's shape, including the parts that were
inconsistent** (four hand-written card serializers, ``response_model=dict``
endpoints whose item type is unbound), so that a changed contract could only
show up as a change here, with each line of that diff justified.

批 1（错误契约）与批 2（卡片 projector）已按此线落地：前者换掉了决定状态码的
消息嗅探，后者把四份手写卡片合并成一份。批 5（化石清理）仍会动这里的契约。

Reading the failures
--------------------
If you changed a response on purpose, update the literal here in the same
commit. If the snapshot disagrees with reality and you did not mean to change
anything, the snapshot is right and the code is wrong.
"""

from datetime import UTC, datetime, timedelta

from app.models.favorite import UserFavorite, UserNote
from app.models.video import Video, VideoReviewStatus, VideoStatus

_FEED = "/api/v1/browse/feed"
_PUBLIC = "/api/v1/videos/public"
_RANKINGS = "/api/v1/videos/rankings"
_FAVORITES = "/api/v1/videos/favorites"
_TAKEDOWN = "/api/v1/videos/admin/takedown-suggestions"
_ADMIN_FEEDBACK = "/api/v1/admin/feedback"

# --- recorded shapes -------------------------------------------------------
# sorted(keys) of the paginated envelope every list endpoint reuses.
_ENVELOPE_KEYS = ["has_more", "items", "page", "page_size", "total"]

# Every card endpoint — /browse/feed, /videos/public, /videos/rankings,
# /videos/favorites, /videos/admin/takedown-suggestions — now serves this one
# shape, built by app/services/video_card.serialize_video_card. 批 2 之前这四处
# 各有一份手写 dict（browse 的 _video_to_dict、ranking_service 的 _serialize、
# /videos/favorites 的内联 dict、下架候选列表），字段集互不相同（feed 有
# description，rankings 换成 metric，favorites 有 note_excerpt 但缺
# status/is_official/video_source/created_at）。四份字面量合并成这一份，是那批
# 改动的结果，也是它唯一要守住的东西。
#
# VideoResponse 的全部字段。`metric`/`note_excerpt`/`has_note`/
# `favorited_at` 只有填充它们的 scope 会给出非 null 值，键始终在。
_CARD_ITEM_KEYS = [
    "channel_cover_url",
    "channel_name",
    "channel_slug",
    "created_at",
    "description",
    "difficulty_level",
    "duration",
    "error_message",
    "exam_word_count",
    "ext_like_count",
    "ext_view_count",
    "favorite_count",
    "favorited_at",
    "forked_from",
    "has_note",
    "id",
    "is_demo",
    "is_official",
    "is_published",
    "like_count",
    "metric",
    "note_excerpt",
    "processing_mode",
    "processing_progress",
    "processing_step",
    "published_at",
    "rejection_reason",
    "review_status",
    "sample_text_en",
    "sample_text_zh",
    "score",
    "score_updated_at",
    "source_url",
    "status",
    "storage_mode",
    "subtitle_count",
    "thumbnail_url",
    "title",
    "title_zh",
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
    """The four card endpoints, pinned — they now share one shape by construction.

    Batch 2 collapsed four hand-written serializers into
    ``services/video_card.serialize_video_card``, so these four assertions
    compare against the *same* literal. They stay four tests on purpose: a
    failure then names the endpoint that drifted, which is the whole reason the
    snapshot exists.
    """

    async def test_browse_feed(self, client, db_session, auth_headers):
        await _seed_one_card(client, db_session, auth_headers)
        body = (await client.get(_FEED)).json()
        assert sorted(body.keys()) == _ENVELOPE_KEYS
        assert sorted(body["items"][0].keys()) == _CARD_ITEM_KEYS

    async def test_videos_public(self, client, db_session, auth_headers):
        await _seed_one_card(client, db_session, auth_headers)
        body = (await client.get(_PUBLIC)).json()
        assert sorted(body.keys()) == _ENVELOPE_KEYS
        assert sorted(body["items"][0].keys()) == _CARD_ITEM_KEYS

    async def test_videos_rankings(self, client, db_session, auth_headers):
        await _seed_one_card(client, db_session, auth_headers)
        body = (await client.get(_RANKINGS, params={"scope": "latest"})).json()
        assert sorted(body[0].keys()) == _CARD_ITEM_KEYS

    async def test_videos_favorites(self, client, db_session, auth_headers):
        await _seed_one_card(client, db_session, auth_headers)
        body = (await client.get(_FAVORITES, headers=auth_headers)).json()
        assert sorted(body.keys()) == _ENVELOPE_KEYS
        assert sorted(body["items"][0].keys()) == _CARD_ITEM_KEYS

    async def test_admin_takedown_suggestions(self, client, db_session, admin_headers):
        """批 2 的第四处、也是最后一处手写卡片 dict。

        管理员表格只读其中几列（title / view_count / favorite_count / created_at），
        旧 dict 就只拼了这 8 个键 —— 但「建议下线」这一行没有理由跟别的卡片长得
        不一样。种子要满足端点自己的阈值：上线超过 takedown_min_age_days 天，
        且 view_count / favorite_count 都低于阈值。
        """
        video = await _make_video(db_session, title="cold")
        video.created_at = datetime.now(UTC) - timedelta(days=45)
        await db_session.commit()

        body = (await client.get(_TAKEDOWN, headers=admin_headers)).json()
        assert [i["title"] for i in body["items"]] == ["cold"]
        assert sorted(body["items"][0].keys()) == _CARD_ITEM_KEYS

    async def test_admin_feedback_dict_endpoint(self, client, db_session, admin_headers):
        """``response_model=dict`` sites have no enforced shape at all.

        The envelope here is missing `total`, which every other list endpoint
        returns — exactly the kind of drift an unbound response model allows.
        """
        resp = await client.get(_ADMIN_FEEDBACK, headers=admin_headers)
        assert resp.status_code == 200
        assert sorted(resp.json().keys()) == ["has_more", "items", "page", "page_size"]


class TestCardScopesDifferByValueNotByShape:
    """批 2 的 scope 只改取值，不改键集 —— 这是它跟「四处各写一份」的分界。

    键集由上面那条 `_CARD_ITEM_KEYS` 统一钉住；这里钉住三处真正有差别的取值，
    否则「统一」会退化成「把该藏的也一起发了」。
    """

    async def test_feed_truncates_description_while_detail_does_not(self, client, db_session, auth_headers):
        """CARD_DESCRIPTION_LIMIT 是卡片与详情页的分界线，不是随手加的护栏。"""
        from app.schemas.video import CARD_DESCRIPTION_LIMIT

        long_blurb = "x" * (CARD_DESCRIPTION_LIMIT + 80)
        video = await _make_video(db_session)
        video.external_meta = {"description": long_blurb}
        await db_session.commit()

        card = (await client.get(_FEED)).json()["items"][0]
        assert card["description"] == "x" * CARD_DESCRIPTION_LIMIT

        detail = (await client.get(f"/api/v1/videos/{video.id}")).json()
        assert detail["description"] == long_blurb

    async def test_owner_only_fields_are_blanked_for_other_viewers(self, client, db_session, auth_headers):
        """error_message names internal pipeline failures; rejection_reason is
        the operator's note to a UGC author. Neither is for the public.

        Before 批 2 these keys were simply *absent* from the card dicts, so
        nothing had to blank them. Now every card carries the full model, which
        makes the blanking load-bearing rather than incidental.
        """
        video = await _make_video(db_session, title="errored")
        video.error_message = "ffmpeg died at /srv/seeword/tmp/xyz"
        video.rejection_reason = "封面不合适"
        await db_session.commit()

        card = (await client.get(_FEED)).json()["items"][0]
        assert card["error_message"] is None
        assert card["rejection_reason"] is None

    async def test_favorites_annotations_are_filled_only_there(self, client, db_session, auth_headers):
        """note_excerpt / has_note / favorited_at belong to the favorites scope."""
        video = await _make_video(db_session, title="noted")
        me = (await client.get("/api/v1/users/me", headers=auth_headers)).json()
        db_session.add(UserFavorite(user_id=me["id"], video_id=video.id))
        db_session.add(UserNote(user_id=me["id"], video_id=video.id, content="重点在 12 分钟那段"))
        await db_session.commit()

        fav = (await client.get(_FAVORITES, headers=auth_headers)).json()["items"][0]
        assert fav["note_excerpt"] == "重点在 12 分钟那段"
        assert fav["has_note"] is True
        assert fav["favorited_at"] is not None

        feed = (await client.get(_FEED)).json()["items"][0]
        assert feed["note_excerpt"] is None
        assert feed["has_note"] is False
        assert feed["favorited_at"] is None


class TestErrorEnvelopeShapes:
    """``(status, code)`` pairs for the error paths the plan touches.

    batch 1 replaced the message-sniffing that produced these responses. The
    **status codes must not move** — a 404 stays a 404, because a moved status
    means the service -> class mapping is wrong. The ``code`` string is a
    different matter, and it splits in two:

    - paths that still raise ``HTTPException`` (存量 150 处，route bodies and
      the auth dependency) keep the transport-shaped ``HTTP_{status}``;
    - paths whose failure now comes from a service ``DomainError`` name the
      reason instead (``NOT_FOUND``, ``CONFLICT``, ``SERVICE_UNAVAILABLE`` …).

    Which one a path is can only be told by reading it, so each test below
    states which side it is on.

    ``detail`` is asserted as "present" rather than by value: it is the
    human-readable half and is allowed to change wording.
    """

    async def test_missing_bearer_token(self, client):
        resp = await client.get("/api/v1/users/me")
        assert resp.status_code == 401
        body = resp.json()
        assert body["code"] == "HTTP_401"
        assert sorted(body.keys()) == ["code", "detail", "message"]

    async def test_missing_video_is_404(self, client):
        """Stays `HTTP_404` — this 404 was never sniffed out of a message.

        `GET /videos/{id}` gets ``None`` back from ``_get_video_detail`` and
        raises ``HTTPException`` in the route body itself, so it is on the
        legacy side and keeps the transport code. 批 1c removed the
        *service-raises-ValueError / router-substring-matches-it* tier; this
        route was never part of it.

        The reason-naming half of 批 1c is pinned where it actually happened,
        on a path that does come from a service: the 503 in
        `test_pending_processing.py` (`SERVICE_UNAVAILABLE`). Both sides keep
        their status code.
        """
        resp = await client.get("/api/v1/videos/does-not-exist")
        assert resp.status_code == 404
        assert resp.json()["code"] == "HTTP_404"

    async def test_unknown_ranking_scope_is_422_validation_error(self, client):
        """业务参数非法与 pydantic 校验共用 422 + VALIDATION_ERROR。

        旧实现在路由里 ``HTTPException(422, ...)``，code 是 ``HTTP_422``，前端无法
        按 code 区分「字段格式错」与「业务参数非法」。现在只有一种 422 code。
        """
        resp = await client.get(_RANKINGS, params={"scope": "nope"})
        assert resp.status_code == 422
        assert resp.json()["code"] == "VALIDATION_ERROR"

    async def test_request_validation_error_is_envelope(self, client):
        resp = await client.get(_PUBLIC, params={"page": 0})
        assert resp.status_code == 422
        body = resp.json()
        assert body["code"] == "VALIDATION_ERROR"
        assert isinstance(body["detail"], list)


class TestOpenApiResponseModels:
    """声明了 ``response_model`` 的端点必须在 OpenAPI 里指向**具体**模型。

    ``response_model=PaginatedResponse`` 少写泛型参数时，OpenAPI 里的 ``items``
    会退化成无类型（前端 / 生成的客户端都拿不到字段），而运行时看起来一切正常
    —— 所以只能在这里钉住。2026-10 全站重构把 ``/videos/admin`` 收成
    ``PaginatedResponse[VideoAdminResponse]``，并给通知偏好端点补上了
    ``NotificationPreferencesResponse``。
    """

    @staticmethod
    def _schema(path: str, method: str) -> dict:
        from app.main import create_app

        return create_app().openapi()["paths"][path][method]["responses"]["200"]["content"]["application/json"][
            "schema"
        ]

    def test_admin_video_list_is_typed(self):
        assert self._schema("/api/v1/videos/admin", "get")["$ref"].endswith("PaginatedResponse_VideoAdminResponse_")

    def test_exam_routes_have_typed_models(self):
        """BE-07: exam paper/wrong/attempt lists and stats must be typed."""
        assert self._schema("/api/v1/exams", "get")["$ref"].endswith("ExamPaperListResponse")
        assert self._schema("/api/v1/exams/wrong", "get")["$ref"].endswith("PaginatedResponse_ExamWrongItem_")
        assert self._schema("/api/v1/exams/attempts", "get")["$ref"].endswith("PaginatedResponse_ExamAttemptItem_")
        assert self._schema("/api/v1/exams/attempts/{session_id}", "get")["$ref"].endswith("ExamAttemptDetailResponse")

    def test_discovery_subscription_and_favorite_routes_are_typed(self):
        """BE-07: discovery subscription/favorite routes used untyped dicts."""
        assert self._schema("/api/v1/discovery/subscriptions", "get")["type"] == "array"
        assert self._schema("/api/v1/discovery/subscriptions/{slug}", "put")["$ref"].endswith("SubscriptionState")
        assert self._schema("/api/v1/discovery/sentence-favorites", "get")["$ref"].endswith(
            "PaginatedResponse_SentenceFavoriteItem_"
        )
        assert self._schema("/api/v1/discovery/sentence-favorites/{subtitle_id}", "put")["$ref"].endswith(
            "SentenceFavoriteStatus"
        )

    def test_channel_routes_have_typed_models(self):
        """BE-07: channel directory and detail used to return untyped dicts."""
        assert self._schema("/api/v1/channels", "get")["$ref"].endswith("PaginatedResponse_ChannelCard_")
        assert self._schema("/api/v1/channels/{slug}", "get")["$ref"].endswith("ChannelDetailResponse")

    def test_listening_routes_have_typed_models(self):
        """The newest feature routes must appear in OpenAPI with concrete items."""
        assert self._schema("/api/v1/listening/videos", "get")["$ref"].endswith("PaginatedResponse_ListeningVideoCard_")
        assert self._schema("/api/v1/listening/sessions", "get")["$ref"].endswith(
            "PaginatedResponse_ListeningSessionSummary_"
        )
        for method in ("post",):
            assert self._schema("/api/v1/listening/sessions", method)["$ref"].endswith("ListeningSessionResponse")

    def test_all_paginated_responses_have_typed_items(self):
        """Every ``PaginatedResponse[...]`` in the OpenAPI must type its items.

        Regression for BE-07: four admin/catalog lists (and
        ``/videos/{id}/vocabulary``) used bare or ``dict`` item types, so the
        OpenAPI showed ``items: {}`` and generated clients could not see fields.
        """
        from app.main import create_app

        schemas = create_app().openapi()["components"]["schemas"]
        assert "PaginatedResponse" not in schemas, "bare PaginatedResponse leaked into OpenAPI"
        paginated = {name: schema for name, schema in schemas.items() if name.startswith("PaginatedResponse_")}
        assert paginated, "expected at least one typed paginated response"
        for name, schema in paginated.items():
            items = schema["properties"]["items"]
            assert items.get("type") == "array", name
            assert items.get("items"), f"{name} has untyped items"
            assert items["items"].get("$ref") != "#/components/schemas/dict", f"{name} still uses dict items"

    def test_notification_preferences_are_typed(self):
        for method in ("get", "put"):
            ref = self._schema("/api/v1/notifications/preferences", method)["$ref"]
            assert ref.endswith("NotificationPreferencesResponse"), method

    def test_notification_list_omits_owner_id(self):
        from app.main import create_app

        schemas = create_app().openapi()["components"]["schemas"]
        assert "user_id" not in schemas["NotificationResponse"]["properties"]
