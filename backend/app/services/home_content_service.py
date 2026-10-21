"""首页编辑内容服务——草稿 / 不可变版本 / 单例布局 / 公共读取 / 生成状态机。

契约：``docs/home-editorial-content-implementation-2026-10.md``（§1–5 是本文件的
实施范围）。API 路由只做解析与调用，所有规则收敛在这里。

四条不可破坏的不变量（改代码前先读）：

1. **内容与位置分开**：布局只存 ``content_revision_id``（+ 稳定
   expression_id/scenario_id），所以重新生成/编辑草稿永远不影响线上。
2. **已发布版本只追加**：发布产生新的 ``HomeContentRevision``，从不原地修改；
   草稿坏了可以靠历史版本恢复，线上内容也不会被写坏。
3. **来源指纹**：``compute_source_fingerprint`` 覆盖有序字幕 ID + sentence_index +
   start/end（3 位小数）+ text_en + text_zh。发布、公共读取、生成写回都重算比对，
   字幕被改/重排/重新转写后旧引用自动失效，不依赖逐个写入入口挂钩子。
4. **公共接口不缓存**：``resolve_public_page`` 每次读库，发布/下线立即生效；
   旧兜底（``browse/featured``）继续走它自己的缓存与既有失效链路。

生成任务（Celery，``app/tasks/home_content_tasks.py`` 由 backend-ai 负责）通过这些
钩子与本模块交互；它们**自己 commit**，调用方不要再包事务：

    claim = await claim_generation(db, video_id, actor_id, expected_revision=..., overwrite=...)
    await enqueue_generation(db, claim)          # 入队失败会置 failed 并抛 503
    # worker 侧：
    ctx = await load_generation_context(db, generation_id)   # None = 已被取代/取消
    if ctx is None: return
    ... 生成 payload ...
    await complete_generation(db, generation_id, payload, model=..., prompt_version=...,
                              usage=..., calls=...)
    # 失败：await fail_generation(db, generation_id, code, message)
"""

from __future__ import annotations

import hashlib
import logging
import re
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING

from pydantic import ValidationError
from sqlalchemy import Update, select, update
from sqlalchemy.exc import IntegrityError

from app.core.errors import AppError, ErrorCode
from app.models.channel import Channel
from app.models.home_content import (
    HomeContentDraft,
    HomeContentGenerationStatus,
    HomeContentRevision,
    HomePageConfig,
)
from app.models.subtitle import Subtitle
from app.models.user import User
from app.models.video import Video
from app.schemas.home_content import (
    HomeContentCandidate,
    HomeContentGeneration,
    HomeContentGenerationCoverage,
    HomeContentGenerationUsage,
    HomeContentRevisionSummary,
    HomeContentSlotPosition,
    HomeContentVideoState,
    HomeEditorialClip,
    HomeEditorialContent,
    HomeEditorialExpression,
    HomeEditorialExpressionSlot,
    HomeEditorialInteraction,
    HomeEditorialInteractionOption,
    HomeEditorialPage,
    HomeEditorialScenario,
    HomeEditorialScenarioSlot,
    HomeEditorialSentence,
    HomeEditorialVideoSlot,
    HomeLayoutIssue,
    HomeLayoutPlacement,
    HomeLayoutPreview,
    HomeLayoutState,
)
from app.schemas.home_content import (
    HomeContentDraft as HomeContentDraftSchema,
)
from app.services import ecdict
from app.services.discovery_service import public_video_filters
from app.services.video_card import serialize_video_card

if TYPE_CHECKING:
    from collections.abc import Iterable, Sequence
    from typing import Protocol

    from sqlalchemy.ext.asyncio import AsyncSession

    from app.schemas.video import VideoResponse

    class SubtitleLike(Protocol):
        """``collect_issues`` 需要的最小字幕形状（ORM ``Subtitle`` 与生成侧只读行都满足）。

        frozen dataclass 的属性是只读的，所以这里用只读 property 声明——否则生成侧
        的 ``SubtitleLine``（frozen dataclass）无法通过结构化类型检查。
        """

        @property
        def id(self) -> str: ...

        @property
        def sentence_index(self) -> int: ...

        @property
        def start_time(self) -> float: ...

        @property
        def end_time(self) -> float: ...

        @property
        def text_en(self) -> str: ...

        @property
        def text_zh(self) -> str | None: ...


logger = logging.getLogger(__name__)

#: queued/running 超过这个秒数视为卡死，标 failed TIMEOUT（可重试）。
GENERATION_STALE_SECONDS = 900
#: 布局单例行主键。
LAYOUT_SINGLETON_ID = "singleton"
#: 布局里最多几条次推。
MAX_SECONDARY = 2
#: 场景卡最多几条。
MAX_SCENARIOS = 3
#: 草稿/版本 payload 的 schema 版本。
CONTENT_SCHEMA_VERSION = 1
#: 发布时若没取到来源标签的缺省值。
DEFAULT_SOURCE_LABEL = "SeeWord"

#: 位置在展示顺序上的先后（用于把 revision 的多个位置稳定排序）。
POSITION_ORDER: tuple[HomeContentSlotPosition, ...] = ("lead", "secondary", "expression", "scenario")

#: 词边界匹配用的字符类：英文 + 数字 + 撇号/连字符都算词内字符。
_WORD_CHAR = "A-Za-z0-9'’"

#: 「先查后插」撞唯一约束时的重试次数（并发建草稿/建布局单例行）。
_INSERT_ATTEMPTS = 3
#: 版本号分配撞唯一约束时的重试次数（并发发布抢到同一个 version）。
_VERSION_ALLOC_ATTEMPTS = 3


def empty_layout() -> dict:
    """空布局常量（与契约 §2 一致）。"""
    return {"lead": None, "secondary": [], "expression": None, "scenarios": []}


# ---------------------------------------------------------------------------
# 小工具
# ---------------------------------------------------------------------------


def _now() -> datetime:
    return datetime.now(UTC)


def _as_utc(value: datetime) -> datetime:
    """SQLite 读回的是 naive datetime，统一按 UTC 处理后再比较。"""
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def _iso(value: datetime | None) -> str | None:
    return value.isoformat() if value is not None else None


def _issue(field_name: str, code: str, message: str) -> HomeLayoutIssue:
    return HomeLayoutIssue(field=field_name, code=code, message=message)


# ---------------------------------------------------------------------------
# 并发控制：乐观锁的统一出口
# ---------------------------------------------------------------------------
#
# 本模块所有「读-改-写」都走**条件 UPDATE + rowcount 判定**（和 ``claim_generation``
# 的生成占位去重同一套写法）：
#
# - 判定与写入是**同一条语句**，所以「读到旧值 → 校验通过 → 写回」之间不再有窗口；
#   两个管理员同时保存不可能都成功，后到的那个拿到 409，而不是静默覆盖对方。
# - 不用 ``SELECT ... FOR UPDATE``：本项目的默认测试库是内存 SQLite，``FOR UPDATE``
#   在那里被静默忽略（见 tests/conftest.py），条件 UPDATE 在两种库上都真的生效，
#   也更容易被测试钉住。
# - 不用「先 SELECT 再 UPDATE」的两段式：判定必须落在写入的那条语句上，否则
#   TOCTOU 窗口照旧存在。


def _revision_conflict(message: str) -> AppError:
    """乐观锁冲突 → 409 + ``HOME_CONTENT_REVISION_CONFLICT``（前端按 code 分支）。"""
    return AppError(409, ErrorCode.HOME_CONTENT_REVISION_CONFLICT, message)


async def _cas_update(db: AsyncSession, statement: Update, message: str) -> None:
    """执行条件 UPDATE；命中 0 行 = 期间被别处改过 → 409。

    冲突时**先回滚本次事务**再抛错：调用方可能已经写了别的行（例如发布路径上的
    版本插入），留着半套写入比直接失败更危险。
    """
    result = await db.execute(statement)
    if result.rowcount == 0:
        await db.rollback()
        raise _revision_conflict(message)


# ---------------------------------------------------------------------------
# 来源指纹
# ---------------------------------------------------------------------------


def compute_source_fingerprint(subtitles: Iterable[Subtitle]) -> str:
    """sha256(有序字幕 ID + sentence_index + 起止 3 位小数 + 中英文原文)。

    契约 §1.3：这个指纹是「内容版本仍然对得上字幕」的唯一判据。时间取 3 位
    小数是为了忽略浮点尾差（0.1ms 级的重新量化不应该让整个发布失效），同时保留
    所有影响引用正确性的信息。返回 64 位十六进制字符串。
    """
    ordered = sorted(subtitles, key=lambda item: (item.sentence_index, item.id))
    lines = [
        "|".join(
            (
                subtitle.id,
                str(subtitle.sentence_index),
                f"{float(subtitle.start_time):.3f}",
                f"{float(subtitle.end_time):.3f}",
                subtitle.text_en or "",
                subtitle.text_zh or "",
            )
        )
        for subtitle in ordered
    ]
    return hashlib.sha256("\n".join(lines).encode("utf-8")).hexdigest()


async def _load_subtitles(db: AsyncSession, video_id: str) -> list[Subtitle]:
    result = await db.execute(
        select(Subtitle).where(Subtitle.video_id == video_id).order_by(Subtitle.sentence_index, Subtitle.id)
    )
    return list(result.scalars().all())


async def current_source_fingerprint(db: AsyncSession, video_id: str) -> tuple[str, list[Subtitle]]:
    """当前视频字幕指纹 + 有序字幕行（一次查询，调用方两样都要）。"""
    subtitles = await _load_subtitles(db, video_id)
    return compute_source_fingerprint(subtitles), subtitles


# ---------------------------------------------------------------------------
# 草稿结构 / 引用校验（草稿宽松、发布严格）
# ---------------------------------------------------------------------------


def _parse_draft(payload: object) -> HomeContentDraftSchema:
    """把 DB 里的 dict / 请求里的模型统一成 HomeContentDraft；非法抛 ValidationError。"""
    if isinstance(payload, HomeContentDraftSchema):
        return payload
    return HomeContentDraftSchema.model_validate(payload)


def _try_parse_draft(payload: object) -> HomeContentDraftSchema | None:
    """宽松解析：DB 里的历史 payload 若与当前 schema 不兼容，返回 None 而不是 500。"""
    if payload is None:
        return None
    try:
        return _parse_draft(payload)
    except ValidationError:
        return None


def _normalize_text(text: str) -> str:
    return " ".join(text.split())


def _phrase_present(phrase: str, text: str) -> bool:
    """大小写不敏感、按词边界判断 phrase 是否真实出现在字幕原文里。"""
    needle = re.escape(_normalize_text(phrase))
    if not needle:
        return False
    pattern = rf"(?<![{_WORD_CHAR}]){needle}(?![{_WORD_CHAR}])"
    return re.search(pattern, _normalize_text(text), re.IGNORECASE) is not None


def _word_of_phrase(word: str, phrase: str) -> bool:
    """``word`` 必须等于 phrase 本身，或是 phrase 里的单个词。"""
    word_norm = _normalize_text(word).lower()
    phrase_norm = _normalize_text(phrase).lower()
    if word_norm == phrase_norm:
        return True
    tokens = re.findall(rf"[{_WORD_CHAR}]+", phrase_norm)
    return word_norm in tokens


def collect_issues(
    payload: HomeContentDraftSchema | dict | None,
    subtitles: Sequence[SubtitleLike],
    strict: bool,
) -> list[HomeLayoutIssue]:
    """草稿/发布校验，返回字段级问题列表（空 = 通过）。

    ``strict=False``（保存草稿）：结构与长度已在 Pydantic 层校验；这里只查
    「引用是否真属于该视频、短语是否真在字幕里、片段顺序是否合法」。
    ``strict=True``（发布 / AI 写回）：额外要求 headline/dek 非空、clip 非空、
    1–3 条表达、互动 2–3 个选项。
    """
    if payload is None:
        if strict:
            return [_issue("payload", "REQUIRED", "尚未保存草稿内容")]
        return []
    if isinstance(payload, dict):
        try:
            draft = _parse_draft(payload)
        except ValidationError as exc:
            return [
                _issue(
                    ".".join(str(part) for part in error.get("loc", ())), "SCHEMA_INVALID", error.get("msg", "结构非法")
                )
                for error in exc.errors()
            ]
    else:
        draft = payload

    issues: list[HomeLayoutIssue] = []
    subtitle_map = {subtitle.id: subtitle for subtitle in subtitles}

    for index, subtitle_id in enumerate(draft.evidence_subtitle_ids):
        if subtitle_id not in subtitle_map:
            issues.append(_issue(f"evidence_subtitle_ids[{index}]", "SUBTITLE_NOT_IN_VIDEO", "引用的字幕不属于该视频"))

    if draft.clip is not None:
        start = subtitle_map.get(draft.clip.start_subtitle_id)
        end = subtitle_map.get(draft.clip.end_subtitle_id)
        if start is None or end is None:
            issues.append(_issue("clip", "SUBTITLE_NOT_IN_VIDEO", "片段起止字幕不属于该视频"))
        elif start.sentence_index > end.sentence_index or float(end.end_time) <= float(start.start_time):
            issues.append(
                _issue("clip", "CLIP_ORDER_INVALID", "片段起始句必须早于或等于结束句，且结束时间大于开始时间")
            )

    for index, expression in enumerate(draft.expressions):
        field_name = f"expressions[{index}]"
        subtitle = subtitle_map.get(expression.subtitle_id)
        if subtitle is None:
            issues.append(_issue(f"{field_name}.subtitle_id", "SUBTITLE_NOT_IN_VIDEO", "表达引用的字幕不属于该视频"))
            continue
        if not _phrase_present(expression.phrase, subtitle.text_en or ""):
            issues.append(_issue(f"{field_name}.phrase", "PHRASE_NOT_IN_SUBTITLE", "短语没有真实出现在该句字幕原文里"))
        if expression.word is not None and not _word_of_phrase(expression.word, expression.phrase):
            issues.append(
                _issue(f"{field_name}.word", "WORD_NOT_IN_PHRASE", "收词 word 必须是 phrase 的单个词或 phrase 本身")
            )

    if draft.interaction is not None:
        if strict and not 2 <= len(draft.interaction.options) <= 3:
            issues.append(_issue("interaction.options", "OPTIONS_COUNT", "互动需要 2–3 个选项"))
        if strict and not draft.interaction.question.strip():  # 已被 schema 保证，防御式保留
            issues.append(_issue("interaction.question", "REQUIRED", "互动问题不能为空"))

    for index, scenario in enumerate(draft.scenarios):
        if scenario.subtitle_id is not None and scenario.subtitle_id not in subtitle_map:
            issues.append(
                _issue(f"scenarios[{index}].subtitle_id", "SUBTITLE_NOT_IN_VIDEO", "场景锚定的字幕不属于该视频")
            )

    if strict:
        if not draft.headline.strip():
            issues.append(_issue("headline", "REQUIRED", "发布需要编辑标题"))
        if not draft.dek.strip():
            issues.append(_issue("dek", "REQUIRED", "发布需要推荐理由"))
        if draft.clip is None:
            issues.append(_issue("clip", "REQUIRED", "发布需要选择真实片段"))
        if not 1 <= len(draft.expressions) <= 3:
            issues.append(_issue("expressions", "REQUIRED", "发布需要 1–3 条表达"))
        if len(draft.scenarios) > MAX_SCENARIOS:
            issues.append(_issue("scenarios", "TOO_MANY", f"场景最多 {MAX_SCENARIOS} 条"))

    return issues


# ---------------------------------------------------------------------------
# 展示 DTO 解析（公共接口与后台预览共用）
# ---------------------------------------------------------------------------


def _sentence_dto(subtitle: Subtitle) -> HomeEditorialSentence:
    return HomeEditorialSentence(
        subtitle_id=subtitle.id,
        sentence_index=int(subtitle.sentence_index),
        text_en=subtitle.text_en or "",
        text_zh=subtitle.text_zh,
        start_time=float(subtitle.start_time),
        end_time=float(subtitle.end_time),
    )


def resolve_sentences(
    payload: HomeContentDraftSchema | dict | None, subtitles: Sequence[Subtitle]
) -> list[HomeEditorialSentence]:
    """该内容版本引用到的全部字幕：依据 + 片段范围 + 表达句 + 场景锚定句。"""
    draft = _try_parse_draft(payload) if not isinstance(payload, HomeContentDraftSchema) else payload
    subtitle_map = {subtitle.id: subtitle for subtitle in subtitles}
    wanted: set[str] = set()
    if draft is not None:
        wanted.update(draft.evidence_subtitle_ids)
        if draft.clip is not None:
            start = subtitle_map.get(draft.clip.start_subtitle_id)
            end = subtitle_map.get(draft.clip.end_subtitle_id)
            if start is not None and end is not None:
                low, high = sorted((start.sentence_index, end.sentence_index))
                wanted.update(subtitle.id for subtitle in subtitles if low <= subtitle.sentence_index <= high)
        wanted.update(expression.subtitle_id for expression in draft.expressions)
        wanted.update(scenario.subtitle_id for scenario in draft.scenarios if scenario.subtitle_id)
    selected = [subtitle for subtitle in subtitles if subtitle.id in wanted]
    selected.sort(key=lambda item: (item.sentence_index, item.id))
    return [_sentence_dto(subtitle) for subtitle in selected]


def resolve_clip(
    payload: HomeContentDraftSchema | dict | None, subtitles: Sequence[Subtitle]
) -> HomeEditorialClip | None:
    """按字幕 ID 解析片段时间；引用不合法（顺序/缺失）时返回 None。"""
    draft = _try_parse_draft(payload) if not isinstance(payload, HomeContentDraftSchema) else payload
    if draft is None or draft.clip is None:
        return None
    subtitle_map = {subtitle.id: subtitle for subtitle in subtitles}
    start = subtitle_map.get(draft.clip.start_subtitle_id)
    end = subtitle_map.get(draft.clip.end_subtitle_id)
    if start is None or end is None:
        return None
    if start.sentence_index > end.sentence_index or float(end.end_time) <= float(start.start_time):
        return None
    return HomeEditorialClip(
        start_subtitle_id=start.id,
        end_subtitle_id=end.id,
        start_time=float(start.start_time),
        end_time=float(end.end_time),
        duration=round(float(end.end_time) - float(start.start_time), 3),
    )


def _word_timing(words: Iterable[dict] | None, token: str) -> tuple[float | None, float | None]:
    """在 WhisperX 词级时间戳里找 ``token``；找不到返回 (None, None)（不显示「听这个词」）。"""
    if not words or not token:
        return None, None
    target = re.sub(rf"[^ {_WORD_CHAR}]", "", token.lower())
    for entry in words:
        if not isinstance(entry, dict):
            continue
        word = re.sub(rf"[^ {_WORD_CHAR}]", "", str(entry.get("word", "")).lower())
        if word and word == target:
            try:
                return float(entry["start"]), float(entry["end"])
            except (KeyError, TypeError, ValueError):
                return None, None
    return None, None


def _dictionary_fields(word: str | None) -> tuple[str | None, str | None]:
    """词典里的 (音标, 中文释义)；没有词典/查不到就 (None, None)，绝不伪造。"""
    if not word:
        return None, None
    entry = ecdict.lookup(word) if ecdict.is_available() else None
    if not entry:
        return None, None
    phonetic = entry.get("phonetic") or None
    translation = (entry.get("translation") or "").strip() or None
    return phonetic, translation


def _resolve_expressions(
    payload: HomeContentDraftSchema | dict | None, subtitles: Sequence[Subtitle]
) -> list[HomeEditorialExpression]:
    draft = _try_parse_draft(payload) if not isinstance(payload, HomeContentDraftSchema) else payload
    if draft is None:
        return []
    subtitle_map = {subtitle.id: subtitle for subtitle in subtitles}
    resolved: list[HomeEditorialExpression] = []
    for expression in draft.expressions:
        subtitle = subtitle_map.get(expression.subtitle_id)
        if subtitle is None:
            continue
        lookup_key = expression.word or (
            _normalize_text(expression.phrase) if " " not in _normalize_text(expression.phrase) else None
        )
        phonetic, dictionary_gloss = _dictionary_fields(lookup_key)
        word_start, word_end = _word_timing(subtitle.words, expression.word or expression.phrase)
        resolved.append(
            HomeEditorialExpression(
                id=expression.id,
                subtitle_id=expression.subtitle_id,
                phrase=expression.phrase,
                word=expression.word,
                gloss_zh=expression.gloss_zh or dictionary_gloss,
                note_zh=expression.note_zh,
                phonetic=phonetic,
                word_start_time=word_start,
                word_end_time=word_end,
                sentence=_sentence_dto(subtitle),
            )
        )
    return resolved


def _resolve_interaction(payload: HomeContentDraftSchema | dict | None) -> HomeEditorialInteraction | None:
    draft = _try_parse_draft(payload) if not isinstance(payload, HomeContentDraftSchema) else payload
    if draft is None or draft.interaction is None:
        return None
    return HomeEditorialInteraction(
        id=draft.interaction.id,
        question=draft.interaction.question,
        options=[
            HomeEditorialInteractionOption(id=option.id, label=option.label, feedback=option.feedback)
            for option in draft.interaction.options
        ],
    )


def _resolve_scenarios(
    payload: HomeContentDraftSchema | dict | None, subtitles: Sequence[Subtitle]
) -> list[HomeEditorialScenario]:
    draft = _try_parse_draft(payload) if not isinstance(payload, HomeContentDraftSchema) else payload
    if draft is None:
        return []
    subtitle_map = {subtitle.id: subtitle for subtitle in subtitles}
    resolved: list[HomeEditorialScenario] = []
    for scenario in draft.scenarios:
        anchor = subtitle_map.get(scenario.subtitle_id) if scenario.subtitle_id else None
        resolved.append(
            HomeEditorialScenario(
                id=scenario.id,
                situation_zh=scenario.situation_zh,
                prompt_zh=scenario.prompt_zh,
                reply_en=scenario.reply_en,
                reply_zh=scenario.reply_zh,
                sentence=_sentence_dto(anchor) if anchor is not None else None,
            )
        )
    return resolved


def _content_dto(
    *,
    payload: HomeContentDraftSchema,
    revision_id: str,
    video_id: str,
    version: int,
    published_at: str | None,
    source_label: str | None,
    subtitles: Sequence[Subtitle],
) -> HomeEditorialContent:
    return HomeEditorialContent(
        content_revision_id=revision_id,
        video_id=video_id,
        version=version,
        headline=payload.headline,
        dek=payload.dek,
        topic_label=payload.topic_label,
        source_label=source_label or DEFAULT_SOURCE_LABEL,
        published_at=published_at,
        clip=resolve_clip(payload, subtitles),
        expressions=_resolve_expressions(payload, subtitles),
        interaction=_resolve_interaction(payload),
        scenarios=_resolve_scenarios(payload, subtitles),
        sentences=resolve_sentences(payload, subtitles),
    )


# ---------------------------------------------------------------------------
# 数据加载（管理员读取 / 公共读取共用）
# ---------------------------------------------------------------------------


async def _get_video(db: AsyncSession, video_id: str) -> Video:
    video = (await db.execute(select(Video).where(Video.id == video_id))).scalar_one_or_none()
    if video is None:
        raise AppError(404, ErrorCode.NOT_FOUND, "视频不存在")
    return video


async def _public_video_ids(db: AsyncSession, video_ids: Iterable[str]) -> set[str]:
    ids = list(dict.fromkeys(video_ids))
    if not ids:
        return set()
    result = await db.execute(select(Video.id).where(Video.id.in_(ids), *public_video_filters()))
    return set(result.scalars().all())


async def _is_publicly_visible(db: AsyncSession, video_id: str) -> bool:
    """复用 discovery_service.public_video_filters()（契约 §1.5，不另抄 SQL 条件）。"""
    return bool(await _public_video_ids(db, [video_id]))


async def _video_cards(db: AsyncSession, videos: Sequence[Video]) -> tuple[dict[str, VideoResponse], dict[str, str]]:
    """批量得到 (video_id → 卡片, video_id → 来源标签)。"""
    if not videos:
        return {}, {}
    # 惰性 import：channel_service 顶层 import 了 api.v1.browse。
    from app.services.channel_service import channel_slugs_for

    slug_map = await channel_slugs_for(db, videos)
    channel_ids = {video.channel_ref for video in videos if video.channel_ref}
    channel_names: dict[str, str] = {}
    if channel_ids:
        rows = (await db.execute(select(Channel.id, Channel.name).where(Channel.id.in_(channel_ids)))).all()
        channel_names = {row[0]: row[1] for row in rows}
    cards: dict[str, VideoResponse] = {}
    labels: dict[str, str] = {}
    for video in videos:
        cards[video.id] = serialize_video_card(
            video,
            scope="feed",
            channel_slug=slug_map.get(video.channel_ref) if video.channel_ref else None,
        )
        labels[video.id] = (channel_names.get(video.channel_ref) if video.channel_ref else None) or DEFAULT_SOURCE_LABEL
    return cards, labels


async def _subtitles_by_video(db: AsyncSession, video_ids: Iterable[str]) -> dict[str, list[Subtitle]]:
    ids = list(dict.fromkeys(video_ids))
    if not ids:
        return {}
    result = await db.execute(
        select(Subtitle)
        .where(Subtitle.video_id.in_(ids))
        .order_by(Subtitle.video_id, Subtitle.sentence_index, Subtitle.id)
    )
    grouped: dict[str, list[Subtitle]] = {video_id: [] for video_id in ids}
    for subtitle in result.scalars().all():
        grouped.setdefault(subtitle.video_id, []).append(subtitle)
    return grouped


def _layout_revision_ids(layout: HomeLayoutPlacement) -> list[str]:
    ids: list[str] = []
    if layout.lead is not None:
        ids.append(layout.lead.content_revision_id)
    ids.extend(ref.content_revision_id for ref in layout.secondary)
    if layout.expression is not None:
        ids.append(layout.expression.content_revision_id)
    ids.extend(ref.content_revision_id for ref in layout.scenarios)
    return list(dict.fromkeys(ids))


async def _load_layout_data(db: AsyncSession, layout: HomeLayoutPlacement) -> _LayoutData:
    revision_ids = _layout_revision_ids(layout)
    data = _LayoutData()
    if not revision_ids:
        return data
    revisions = (
        (await db.execute(select(HomeContentRevision).where(HomeContentRevision.id.in_(revision_ids)))).scalars().all()
    )
    data.revisions = {revision.id: revision for revision in revisions}
    video_ids = list(dict.fromkeys(revision.video_id for revision in revisions))
    public = await db.execute(select(Video).where(Video.id.in_(video_ids), *public_video_filters()))
    public_videos = list(public.scalars().all())
    data.public_videos = {video.id: video for video in public_videos}
    data.cards, data.labels = await _video_cards(db, public_videos)
    data.subtitles = await _subtitles_by_video(db, video_ids)
    data.fingerprints = {video_id: compute_source_fingerprint(subs) for video_id, subs in data.subtitles.items()}
    return data


class _LayoutData:
    """布局引用的数据快照（revision / 公共视频 / 卡片 / 字幕 / 指纹 / 来源标签）。"""

    __slots__ = ("cards", "fingerprints", "labels", "public_videos", "revisions", "subtitles")

    def __init__(self) -> None:
        self.revisions: dict[str, HomeContentRevision] = {}
        self.public_videos: dict[str, Video] = {}
        self.cards: dict[str, VideoResponse] = {}
        self.subtitles: dict[str, list[Subtitle]] = {}
        self.fingerprints: dict[str, str] = {}
        self.labels: dict[str, str] = {}

    def is_valid(self, revision: HomeContentRevision) -> bool:
        """来源指纹一致 + 视频当前公共可见（否则该版本暂时失效）。"""
        if revision.video_id not in self.public_videos:
            return False
        return self.fingerprints.get(revision.video_id) == revision.source_fingerprint

    def payload(self, revision: HomeContentRevision) -> HomeContentDraftSchema | None:
        return _try_parse_draft(revision.payload)


# ---------------------------------------------------------------------------
# 管理员：视频状态 / 草稿 / 发布 / 恢复 / 预览
# ---------------------------------------------------------------------------


async def _get_draft(db: AsyncSession, video_id: str) -> HomeContentDraft | None:
    return (
        await db.execute(select(HomeContentDraft).where(HomeContentDraft.video_id == video_id))
    ).scalar_one_or_none()


async def _get_or_create_draft(db: AsyncSession, video_id: str) -> HomeContentDraft:
    """取草稿；没有就建一行（每视频一份）。

    并发建行会撞唯一约束（``video_id``）：输的那笔重读对方建好的行，不把
    ``IntegrityError`` 泄成 500。先查后插的窗口用 SAVEPOINT 包住，撞了只回滚
    这一段插入，不动整个事务。
    """
    draft = await _get_draft(db, video_id)
    if draft is not None:
        return draft
    for _ in range(_INSERT_ATTEMPTS):
        candidate = HomeContentDraft(
            video_id=video_id,
            payload=None,
            schema_version=CONTENT_SCHEMA_VERSION,
            revision=0,
            status=HomeContentGenerationStatus.IDLE,
            generation_calls=0,
        )
        try:
            async with db.begin_nested():
                db.add(candidate)
                await db.flush()
            return candidate
        except IntegrityError:
            if candidate in db:  # SAVEPOINT 回滚后仍挂在 session 上的残留对象
                db.expunge(candidate)
            existing = await _get_draft(db, video_id)
            if existing is not None:
                return existing
            # 对方还没提交：重试（INSERT 会等到对方提交后再判定唯一约束）。
    raise AppError(409, ErrorCode.CONFLICT, "草稿初始化冲突，请重试")


async def _get_config(db: AsyncSession) -> HomePageConfig | None:
    return (
        await db.execute(select(HomePageConfig).where(HomePageConfig.id == LAYOUT_SINGLETON_ID))
    ).scalar_one_or_none()


async def _get_or_create_config(db: AsyncSession) -> HomePageConfig:
    """取布局单例行；没有就建（``id='singleton'``，主键即天然去重）。

    并发建行撞主键时重读对方建好的行（同 :func:`_get_or_create_draft`）。
    """
    config = await _get_config(db)
    if config is not None:
        return config
    for _ in range(_INSERT_ATTEMPTS):
        candidate = HomePageConfig(id=LAYOUT_SINGLETON_ID, revision=0, draft_layout=empty_layout())
        try:
            async with db.begin_nested():
                db.add(candidate)
                await db.flush()
            return candidate
        except IntegrityError:
            if candidate in db:
                db.expunge(candidate)
            existing = await _get_config(db)
            if existing is not None:
                return existing
    raise AppError(409, ErrorCode.CONFLICT, "首页编排初始化冲突，请重试")


def _parse_layout(raw: object) -> HomeLayoutPlacement:
    if raw is None:
        return HomeLayoutPlacement()
    try:
        return HomeLayoutPlacement.model_validate(raw)
    except ValidationError:
        return HomeLayoutPlacement()


def _stale_generation(draft: HomeContentDraft) -> bool:
    started = draft.generation_started_at
    if started is None:
        return False
    return _now() - _as_utc(started) > timedelta(seconds=GENERATION_STALE_SECONDS)


def _expire_stale_generation(draft: HomeContentDraft) -> bool:
    """把超时的 queued/running 标 failed TIMEOUT；返回是否改动（调用方 commit）。"""
    if draft.status not in HomeContentGenerationStatus.ACTIVE:
        return False
    if not _stale_generation(draft):
        return False
    draft.status = HomeContentGenerationStatus.FAILED
    draft.active_generation_id = None
    draft.generation_error_code = ErrorCode.HOME_CONTENT_TIMEOUT
    draft.generation_error_message = "生成任务超时，请重试"
    draft.generation_finished_at = _now()
    return True


def _generation_dto(draft: HomeContentDraft | None) -> HomeContentGeneration | None:
    if draft is None:
        return None
    generation_id = draft.active_generation_id or draft.last_generation_id
    if not generation_id:
        return None
    status = draft.status
    if status not in HomeContentGenerationStatus.ACTIVE and status not in HomeContentGenerationStatus.TERMINAL:
        status = HomeContentGenerationStatus.IDLE
    usage = None
    if isinstance(draft.generation_usage, dict):
        usage = HomeContentGenerationUsage(
            prompt_tokens=draft.generation_usage.get("prompt_tokens"),
            completion_tokens=draft.generation_usage.get("completion_tokens"),
        )
    return HomeContentGeneration(
        generation_id=generation_id,
        status=status,  # type: ignore[arg-type]
        started_at=_iso(draft.generation_started_at),
        finished_at=_iso(draft.generation_finished_at),
        error_code=draft.generation_error_code,
        error_message=draft.generation_error_message,
        model=draft.generation_model,
        prompt_version=draft.generation_prompt_version,
        usage=usage,
        coverage=(
            HomeContentGenerationCoverage.model_validate(draft.generation_coverage)
            if isinstance(draft.generation_coverage, dict)
            else None
        ),
    )


async def _positions_map(db: AsyncSession, layout: HomeLayoutPlacement | None) -> dict[str, list[str]]:
    """已发布布局里 revision_id → 位置列表（用于后台展示「当前在哪些位置」）。"""
    if layout is None:
        return {}
    positions: dict[str, list[str]] = {}

    def add(revision_id: str | None, position: HomeContentSlotPosition) -> None:
        if revision_id is None:
            return
        bucket = positions.setdefault(revision_id, [])
        if position not in bucket:
            bucket.append(position)

    if layout.lead is not None:
        add(layout.lead.content_revision_id, "lead")
    for secondary_ref in layout.secondary:
        add(secondary_ref.content_revision_id, "secondary")
    if layout.expression is not None:
        add(layout.expression.content_revision_id, "expression")
    for scenario_ref in layout.scenarios:
        add(scenario_ref.content_revision_id, "scenario")
    return positions


def _sorted_positions(positions: Iterable[str]) -> list[HomeContentSlotPosition]:
    known = [position for position in POSITION_ORDER if position in positions]
    return known  # type: ignore[return-value]


async def _user_names(db: AsyncSession, user_ids: Iterable[str | None]) -> dict[str, str]:
    ids = [user_id for user_id in dict.fromkeys(user_ids) if user_id]
    if not ids:
        return {}
    rows = (await db.execute(select(User.id, User.name).where(User.id.in_(ids)))).all()
    return {row[0]: row[1] for row in rows if row[0]}


async def _revision_summaries(
    db: AsyncSession,
    video: Video,
    fingerprint: str,
    position_map: dict[str, list[str]],
) -> list[HomeContentRevisionSummary]:
    revisions = (
        (
            await db.execute(
                select(HomeContentRevision)
                .where(HomeContentRevision.video_id == video.id)
                .order_by(HomeContentRevision.version.desc())
            )
        )
        .scalars()
        .all()
    )
    names = await _user_names(db, (revision.published_by for revision in revisions))
    summaries: list[HomeContentRevisionSummary] = []
    for revision in revisions:
        payload = _try_parse_draft(revision.payload)
        summaries.append(
            HomeContentRevisionSummary(
                id=revision.id,
                version=revision.version,
                headline=payload.headline if payload is not None else "",
                dek=payload.dek if payload is not None else "",
                published_at=_iso(revision.published_at),
                published_by_name=names.get(revision.published_by) if revision.published_by else None,
                source_changed=revision.source_fingerprint != fingerprint,
                positions=_sorted_positions(position_map.get(revision.id, [])),
                expression_ids=[expression.id for expression in payload.expressions] if payload else [],
                scenario_ids=[scenario.id for scenario in payload.scenarios] if payload else [],
            )
        )
    return summaries


async def get_video_state(db: AsyncSession, video_id: str) -> HomeContentVideoState:
    """后台视频详情：草稿、最近生成、历史版本、当前位置（契约 §4 表）。"""
    video = await _get_video(db, video_id)
    fingerprint, _ = await current_source_fingerprint(db, video_id)
    draft = await _get_draft(db, video_id)
    if draft is not None and _expire_stale_generation(draft):
        await db.commit()
    config = await _get_config(db)
    published_layout = _parse_layout(config.published_layout) if config is not None else None
    position_map = await _positions_map(db, published_layout)
    revision_summaries = await _revision_summaries(db, video, fingerprint, position_map)
    draft_payload = _try_parse_draft(draft.payload) if draft is not None else None
    positions: list[HomeContentSlotPosition] = []
    for summary in revision_summaries:
        for position in summary.positions:
            if position not in positions:
                positions.append(position)
    return HomeContentVideoState(
        video_id=video.id,
        video_title=video.title,
        publicly_visible=await _is_publicly_visible(db, video.id),
        source_fingerprint=fingerprint,
        draft=draft_payload,
        draft_revision=draft.revision if draft is not None else 0,
        source_changed=bool(draft is not None and draft.source_fingerprint and draft.source_fingerprint != fingerprint),
        generation=_generation_dto(draft),
        revisions=revision_summaries,
        positions=_sorted_positions(positions),
    )


async def get_generation_state(db: AsyncSession, video_id: str) -> HomeContentGeneration | None:
    """轻量轮询接口：只读最近一次生成任务，并顺手做超时恢复。"""
    await _get_video(db, video_id)
    draft = await _get_draft(db, video_id)
    if draft is not None and _expire_stale_generation(draft):
        await db.commit()
    return _generation_dto(draft)


async def save_draft(
    db: AsyncSession,
    video_id: str,
    payload: HomeContentDraftSchema,
    expected_revision: int,
    actor_id: str | None,
) -> HomeContentVideoState:
    """保存草稿（乐观锁）。逻辑上不改变已发布内容。"""
    await _get_video(db, video_id)
    fingerprint, subtitles = await current_source_fingerprint(db, video_id)
    if not subtitles:
        raise AppError(422, ErrorCode.HOME_CONTENT_NO_SUBTITLES, "该视频没有字幕，无法制作首页内容")
    draft = await _get_or_create_draft(db, video_id)
    if draft.revision != expected_revision:
        raise _revision_conflict("内容已在别处修改，请刷新后重试")
    issues = collect_issues(payload, subtitles, strict=False)
    if issues:
        raise AppError(
            422,
            ErrorCode.HOME_CONTENT_INVALID,
            "草稿内容校验失败",
            detail=[issue.model_dump() for issue in issues],
        )
    # 乐观锁的原子判定：条件 UPDATE（WHERE revision = expected_revision）。
    # 上面读到的 draft.revision 可能已经过期（另一个管理员刚保存过），所以判定
    # 必须落在写入这条语句上，而不是靠内存里那份快照。
    await _cas_update(
        db,
        update(HomeContentDraft)
        .where(
            HomeContentDraft.id == draft.id,
            HomeContentDraft.revision == expected_revision,
        )
        .values(
            payload=payload.model_dump(mode="json"),
            schema_version=CONTENT_SCHEMA_VERSION,
            revision=expected_revision + 1,
            source_fingerprint=fingerprint,
            updated_by=actor_id,
            updated_at=_now(),
        ),
        "内容已在别处修改，请刷新后重试",
    )
    # Core UPDATE 不经过 ORM：identity map 里还是旧 payload / 旧 revision，
    # 不显式重读的话后面的 get_video_state 会读到旧值。
    await db.refresh(draft)
    await db.commit()
    return await get_video_state(db, video_id)


async def publish_content(
    db: AsyncSession,
    video_id: str,
    expected_revision: int,
    place: str | None,
    actor_id: str | None,
) -> dict:
    """校验并创建不可变版本；可选在同事务内替换首页位置（「发布并替换主推」）。"""
    video = await _get_video(db, video_id)
    # 布局乐观锁的基准：请求开始时编排的 revision。发布期间别人改过编排
    # （保存草稿/发布/回滚），下面的布局条件 UPDATE 就会失配 → 409。
    config_snapshot = await _get_config(db)
    expected_config_revision = config_snapshot.revision if config_snapshot is not None else 0
    fingerprint, subtitles = await current_source_fingerprint(db, video_id)
    if not subtitles:
        raise AppError(422, ErrorCode.HOME_CONTENT_NO_SUBTITLES, "该视频没有字幕，无法发布首页内容")
    draft = await _get_draft(db, video_id)
    if draft is None or draft.payload is None:
        raise AppError(422, ErrorCode.HOME_CONTENT_INVALID, "该视频还没有草稿，无法发布")
    if draft.revision != expected_revision:
        raise _revision_conflict("内容已在别处修改，请刷新后重试")
    if draft.source_fingerprint != fingerprint:
        raise AppError(
            422,
            ErrorCode.HOME_CONTENT_SOURCE_CHANGED,
            "视频字幕已变更，请重新核对内容后再发布",
            detail=[_issue("source_fingerprint", "SOURCE_CHANGED", "草稿依据的字幕已变化").model_dump()],
        )
    payload = _parse_draft(draft.payload)
    issues = collect_issues(payload, subtitles, strict=True)
    if issues:
        raise AppError(
            422,
            ErrorCode.HOME_CONTENT_INVALID,
            "发布校验失败",
            detail=[issue.model_dump() for issue in issues],
        )
    if not await _is_publicly_visible(db, video.id):
        raise AppError(
            422,
            ErrorCode.HOME_CONTENT_VIDEO_NOT_PUBLIC,
            "视频当前不满足公共可见条件，不能发布到首页（可先完成发布/上线）",
            detail=[_issue("video_id", "VIDEO_NOT_PUBLIC", "视频未公开或已下线").model_dump()],
        )

    # 草稿乐观锁的原子判定：条件 UPDATE（WHERE revision = expected_revision）。
    # 顺带把同一视频的并发发布串行化（行锁持有到提交），后面的版本号分配因此
    # 不会撞唯一约束。revision 自赋值 = 不改草稿内容，只做判定 + 取行锁；
    # updated_at 显式写出（该列有 onupdate 默认值）。
    await _cas_update(
        db,
        update(HomeContentDraft)
        .where(
            HomeContentDraft.id == draft.id,
            HomeContentDraft.revision == expected_revision,
        )
        .values(revision=expected_revision, updated_at=_now()),
        "内容已在别处修改，请刷新后重试",
    )
    revision = await _allocate_revision(
        db,
        video_id=video.id,
        payload=payload,
        fingerprint=fingerprint,
        draft=draft,
        actor_id=actor_id,
    )

    layout_revision: int | None = None
    if place in ("lead", "secondary"):
        layout_revision = await _place_content(  # type: ignore[arg-type]
            db,
            revision,
            video.id,
            place,
            actor_id,
            expected_config_revision=expected_config_revision,
        )
    await db.commit()
    return {"revision_id": revision.id, "version": revision.version, "layout_revision": layout_revision}


async def _next_version(db: AsyncSession, video_id: str) -> int:
    """下一个可用版本号（同一视频从 1 递增）。"""
    latest_version = (
        await db.execute(
            select(HomeContentRevision.version)
            .where(HomeContentRevision.video_id == video_id)
            .order_by(HomeContentRevision.version.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    return (latest_version or 0) + 1


async def _allocate_revision(
    db: AsyncSession,
    *,
    video_id: str,
    payload: HomeContentDraftSchema,
    fingerprint: str,
    draft: HomeContentDraft,
    actor_id: str | None,
) -> HomeContentRevision:
    """分配版本号并插入不可变版本（已发布版本只追加）。

    版本号取 ``max(version)+1``：没有行锁时两个并发发布会算到同一个号，撞唯一
    约束 ``(video_id, version)``。这里用 SAVEPOINT 包住 INSERT，撞了就重算重试；
    重试仍失败则 409——绝不把 ``IntegrityError`` 泄成 500 ``INTERNAL_ERROR``。
    """
    for _ in range(_VERSION_ALLOC_ATTEMPTS):
        revision = HomeContentRevision(
            video_id=video_id,
            version=await _next_version(db, video_id),
            payload=payload.model_dump(mode="json"),
            schema_version=CONTENT_SCHEMA_VERSION,
            source_fingerprint=fingerprint,
            generation_model=draft.generation_model,
            generation_prompt_version=draft.generation_prompt_version,
            generated_by=draft.generated_by,
            generated_at=draft.generated_at,
            published_by=actor_id,
            published_at=_now(),
        )
        try:
            async with db.begin_nested():
                db.add(revision)
                await db.flush()
            return revision
        except IntegrityError:
            if revision in db:  # SAVEPOINT 回滚后仍挂在 session 上的残留对象
                db.expunge(revision)
    raise _revision_conflict("发布冲突，请刷新后重试")


async def _revision_video_map(db: AsyncSession, revision_ids: Iterable[str]) -> dict[str, str]:
    ids = list(dict.fromkeys(revision_ids))
    if not ids:
        return {}
    rows = (
        await db.execute(
            select(HomeContentRevision.id, HomeContentRevision.video_id).where(HomeContentRevision.id.in_(ids))
        )
    ).all()
    return {row[0]: row[1] for row in rows}


def _layout_without_video(layout: dict, video_id: str, video_by_revision: dict[str, str]) -> dict:
    """去掉布局里属于 ``video_id`` 的位置（主次不重复），返回新 dict。"""
    cleaned = dict(layout)
    lead = cleaned.get("lead")
    if isinstance(lead, dict) and video_by_revision.get(lead.get("content_revision_id", "")) == video_id:
        cleaned["lead"] = None
    cleaned["secondary"] = [
        ref
        for ref in cleaned.get("secondary") or []
        if video_by_revision.get(ref.get("content_revision_id", "")) != video_id
    ]
    return cleaned


async def _place_content(
    db: AsyncSession,
    revision: HomeContentRevision,
    video_id: str,
    place: str,
    actor_id: str | None,
    *,
    expected_config_revision: int | None = None,
) -> int:
    """把已发布版本放进首页位置（主推/次推）。

    布局乐观锁：配置行也走条件 UPDATE（``WHERE revision = 读到的 revision``），
    与 :func:`publish_layout` 同一套标准——别人刚改过编排时返回 409，而不是
    静默覆盖别人的编排草稿。``expected_config_revision`` 由调用方在请求开始
    时取好（``publish_content``），这样「请求期间编排被改过」也能被发现。
    """
    config = await _get_or_create_config(db)
    expected_revision = config.revision if expected_config_revision is None else expected_config_revision
    published = config.published_layout or empty_layout()
    draft_layout = config.draft_layout or empty_layout()
    all_revision_ids = set(_layout_revision_ids(_parse_layout(published)))
    all_revision_ids.add(revision.id)
    video_by_revision = await _revision_video_map(db, all_revision_ids)
    video_by_revision[revision.id] = video_id

    published = _layout_without_video(published, video_id, video_by_revision)
    draft_layout = _layout_without_video(draft_layout, video_id, video_by_revision)
    if place == "lead":
        published["lead"] = {"content_revision_id": revision.id}
        draft_layout["lead"] = {"content_revision_id": revision.id}
    else:
        secondary = published.get("secondary") or []
        if len(secondary) >= MAX_SECONDARY:
            raise AppError(
                422,
                ErrorCode.HOME_CONTENT_LAYOUT_INVALID,
                f"次推位置已满（最多 {MAX_SECONDARY} 条），请先在首页编排里调整",
                detail=[_issue("secondary", "POSITION_FULL", "次推位置已满").model_dump()],
            )
        published["secondary"] = [*secondary, {"content_revision_id": revision.id}]
        draft_secondary = [ref for ref in (draft_layout.get("secondary") or [])]
        # 草稿布局与线上保持一致；替换/去重已在上面做过。
        draft_layout["secondary"] = [*draft_secondary, {"content_revision_id": revision.id}]
    now = _now()
    new_revision = expected_revision + 1
    await _cas_update(
        db,
        update(HomePageConfig)
        .where(
            HomePageConfig.id == LAYOUT_SINGLETON_ID,
            HomePageConfig.revision == expected_revision,
        )
        .values(
            previous_published_layout=config.published_layout,
            published_layout=published,
            draft_layout=draft_layout,
            revision=new_revision,
            published_revision=new_revision,
            updated_by=actor_id,
            updated_at=now,
            published_by=actor_id,
            published_at=now,
        ),
        "首页编排已在别处修改，请刷新后重试",
    )
    return new_revision


async def restore_draft(
    db: AsyncSession,
    video_id: str,
    revision_id: str,
    expected_revision: int,
    actor_id: str | None,
) -> HomeContentVideoState:
    """把指定历史版本复制为新草稿（不改变线上内容）。"""
    await _get_video(db, video_id)
    _, subtitles = await current_source_fingerprint(db, video_id)
    if not subtitles:
        raise AppError(422, ErrorCode.HOME_CONTENT_NO_SUBTITLES, "该视频没有字幕，无法制作首页内容")
    draft = await _get_or_create_draft(db, video_id)
    if draft.revision != expected_revision:
        raise _revision_conflict("内容已在别处修改，请刷新后重试")
    revision = (
        await db.execute(
            select(HomeContentRevision).where(
                HomeContentRevision.id == revision_id,
                HomeContentRevision.video_id == video_id,
            )
        )
    ).scalar_one_or_none()
    if revision is None:
        raise AppError(404, ErrorCode.NOT_FOUND, "指定的历史版本不存在")
    payload = _try_parse_draft(revision.payload)
    if payload is None:
        raise AppError(422, ErrorCode.HOME_CONTENT_INVALID, "该历史版本内容与当前结构不兼容，无法复制")
    # 乐观锁的原子判定：条件 UPDATE（WHERE revision = expected_revision）。
    await _cas_update(
        db,
        update(HomeContentDraft)
        .where(
            HomeContentDraft.id == draft.id,
            HomeContentDraft.revision == expected_revision,
        )
        .values(
            payload=revision.payload,
            schema_version=revision.schema_version or CONTENT_SCHEMA_VERSION,
            # 保留历史版本的来源指纹：字幕若已变化，后台会显示「来源已变更」并阻止发布，
            # 直到管理员重新核对保存或重新生成（任务文档 §8）。
            source_fingerprint=revision.source_fingerprint,
            revision=expected_revision + 1,
            updated_by=actor_id,
            updated_at=_now(),
        ),
        "内容已在别处修改，请刷新后重试",
    )
    await db.refresh(draft)
    await db.commit()
    return await get_video_state(db, video_id)


async def preview_video(db: AsyncSession, video_id: str) -> HomeLayoutPreview:
    """草稿预览：返回与公共接口同形的 page；issues 是发布会被拒绝的问题。"""
    video = await _get_video(db, video_id)
    _, subtitles = await current_source_fingerprint(db, video_id)
    draft = await _get_draft(db, video_id)
    payload = _try_parse_draft(draft.payload) if draft is not None else None
    if payload is None:
        return HomeLayoutPreview(
            page=None,
            issues=[_issue("payload", "DRAFT_EMPTY", "该视频还没有草稿，生成或手动保存后即可预览")],
        )
    issues = collect_issues(payload, subtitles, strict=True)
    cards, labels = await _video_cards(db, [video])
    content = _content_dto(
        payload=payload,
        revision_id=f"draft-{video.id}",
        video_id=video.id,
        version=0,
        published_at=None,
        source_label=labels.get(video.id),
        subtitles=subtitles,
    )
    expression_slot = None
    if content.expressions:
        expression_slot = HomeEditorialExpressionSlot(
            content_revision_id=content.content_revision_id,
            expression_id=content.expressions[0].id,
            headline=content.headline,
            topic_label=content.topic_label,
            video=cards[video.id],
            expression=content.expressions[0],
        )
    scenario_slots = [
        HomeEditorialScenarioSlot(
            content_revision_id=content.content_revision_id,
            scenario_id=scenario.id,
            video=cards[video.id],
            scenario=scenario,
        )
        for scenario in content.scenarios[:MAX_SCENARIOS]
    ]
    page = HomeEditorialPage(
        layout_revision=0,
        published_at=None,
        lead=HomeEditorialVideoSlot(content=content, video=cards[video.id]),
        secondary=[],
        expression=expression_slot,
        scenarios=scenario_slots,
    )
    return HomeLayoutPreview(page=page, issues=issues)


# ---------------------------------------------------------------------------
# 管理员：首页布局
# ---------------------------------------------------------------------------


async def _validate_layout(db: AsyncSession, layout: HomeLayoutPlacement) -> list[HomeLayoutIssue]:
    """布局字段级校验：引用存在、来源未变、视频公共可见、主次不重复。"""
    revision_ids = _layout_revision_ids(layout)
    issues: list[HomeLayoutIssue] = []
    if not revision_ids:
        return issues
    data = await _load_layout_data(db, layout)
    video_ids = [revision.video_id for revision in data.revisions.values()]
    public_ids = await _public_video_ids(db, video_ids)

    def check(field_name: str, revision_id: str) -> HomeContentRevision | None:
        revision = data.revisions.get(revision_id)
        if revision is None:
            issues.append(_issue(field_name, "REVISION_NOT_FOUND", "引用的内容版本不存在"))
            return None
        if revision.video_id not in public_ids:
            issues.append(_issue(field_name, "VIDEO_NOT_PUBLIC", "视频当前不可公开展示（未公开或已下线）"))
            return revision
        if data.fingerprints.get(revision.video_id) != revision.source_fingerprint:
            issues.append(_issue(field_name, "SOURCE_CHANGED", "内容版本依据的字幕已变更，请重新核对后发布"))
        return revision

    lead_revision = None
    if layout.lead is not None:
        lead_revision = check("lead", layout.lead.content_revision_id)

    seen_videos: set[str] = set()
    if lead_revision is not None:
        seen_videos.add(lead_revision.video_id)
    for index, secondary_ref in enumerate(layout.secondary):
        field_name = f"secondary[{index}]"
        if index >= MAX_SECONDARY:
            issues.append(_issue(field_name, "TOO_MANY", f"次推最多 {MAX_SECONDARY} 条"))
            continue
        revision = check(field_name, secondary_ref.content_revision_id)
        if revision is None:
            continue
        if revision.video_id in seen_videos:
            issues.append(_issue(field_name, "DUPLICATE_VIDEO", "主推与次推不能是同一视频"))
            continue
        seen_videos.add(revision.video_id)

    if layout.expression is not None:
        expression_revision = check("expression", layout.expression.content_revision_id)
        if expression_revision is not None:
            expression_payload = data.payload(expression_revision)
            expression_ids = (
                {expression.id for expression in expression_payload.expressions} if expression_payload else set()
            )
            if layout.expression.expression_id not in expression_ids:
                issues.append(_issue("expression", "EXPRESSION_NOT_FOUND", "该内容版本里没有这条表达"))

    for index, scenario_ref in enumerate(layout.scenarios):
        field_name = f"scenarios[{index}]"
        if index >= MAX_SCENARIOS:
            issues.append(_issue(field_name, "TOO_MANY", f"场景最多 {MAX_SCENARIOS} 条"))
            continue
        revision = check(field_name, scenario_ref.content_revision_id)
        if revision is not None:
            scenario_payload = data.payload(revision)
            scenario_ids = {scenario.id for scenario in scenario_payload.scenarios} if scenario_payload else set()
            if scenario_ref.scenario_id not in scenario_ids:
                issues.append(_issue(field_name, "SCENARIO_NOT_FOUND", "该内容版本里没有这个场景"))
    return issues


async def _build_page(
    layout: HomeLayoutPlacement,
    data: _LayoutData,
    *,
    layout_revision: int,
    published_at: str | None,
) -> HomeEditorialPage | None:
    """按布局 + 数据快照构造展示页（主推缺失时次推可提升，全失效返回 None）。"""
    ordered_revisions: list[HomeContentRevision] = []
    seen_videos: set[str] = set()
    candidates = []
    if layout.lead is not None:
        candidates.append(layout.lead.content_revision_id)
    candidates.extend(ref.content_revision_id for ref in layout.secondary)
    for revision_id in candidates:
        revision = data.revisions.get(revision_id)
        if revision is None or not data.is_valid(revision):
            continue
        if revision.video_id in seen_videos:
            continue
        if data.payload(revision) is None:
            continue
        seen_videos.add(revision.video_id)
        ordered_revisions.append(revision)
    if not ordered_revisions:
        return None

    def video_slot(revision: HomeContentRevision) -> HomeEditorialVideoSlot | None:
        video = data.public_videos.get(revision.video_id)
        card = data.cards.get(revision.video_id)
        payload = data.payload(revision)
        if video is None or card is None or payload is None:
            return None
        content = _content_dto(
            payload=payload,
            revision_id=revision.id,
            video_id=revision.video_id,
            version=revision.version,
            published_at=_iso(revision.published_at),
            source_label=data.labels.get(revision.video_id),
            subtitles=data.subtitles.get(revision.video_id, []),
        )
        return HomeEditorialVideoSlot(content=content, video=card)

    lead_slot = video_slot(ordered_revisions[0])
    if lead_slot is None:
        return None
    secondary_slots: list[HomeEditorialVideoSlot] = []
    for revision in ordered_revisions[1 : 1 + MAX_SECONDARY]:
        slot = video_slot(revision)
        if slot is not None:
            secondary_slots.append(slot)

    expression_slot = None
    if layout.expression is not None:
        expression_revision = data.revisions.get(layout.expression.content_revision_id)
        if expression_revision is not None and data.is_valid(expression_revision):
            expression_payload = data.payload(expression_revision)
            expression_card = data.cards.get(expression_revision.video_id)
            if expression_payload is not None and expression_card is not None:
                expression = next(
                    (
                        item
                        for item in _resolve_expressions(
                            expression_payload, data.subtitles.get(expression_revision.video_id, [])
                        )
                        if item.id == layout.expression.expression_id
                    ),
                    None,
                )
                if expression is not None:
                    expression_slot = HomeEditorialExpressionSlot(
                        content_revision_id=expression_revision.id,
                        expression_id=expression.id,
                        headline=expression_payload.headline,
                        topic_label=expression_payload.topic_label,
                        video=expression_card,
                        expression=expression,
                    )

    scenario_slots: list[HomeEditorialScenarioSlot] = []
    for scenario_ref in layout.scenarios:
        if len(scenario_slots) >= MAX_SCENARIOS:
            break
        scenario_revision = data.revisions.get(scenario_ref.content_revision_id)
        if scenario_revision is None or not data.is_valid(scenario_revision):
            continue
        scenario_payload = data.payload(scenario_revision)
        scenario_card = data.cards.get(scenario_revision.video_id)
        if scenario_payload is None or scenario_card is None:
            continue
        scenario = next(
            (
                item
                for item in _resolve_scenarios(scenario_payload, data.subtitles.get(scenario_revision.video_id, []))
                if item.id == scenario_ref.scenario_id
            ),
            None,
        )
        if scenario is None:
            continue
        scenario_slots.append(
            HomeEditorialScenarioSlot(
                content_revision_id=scenario_revision.id,
                scenario_id=scenario.id,
                video=scenario_card,
                scenario=scenario,
            )
        )

    return HomeEditorialPage(
        layout_revision=layout_revision,
        published_at=published_at,
        lead=lead_slot,
        secondary=secondary_slots,
        expression=expression_slot,
        scenarios=scenario_slots,
    )


async def resolve_public_page(db: AsyncSession) -> HomeEditorialPage | None:
    """公共读取：每次读库、不缓存；无有效主推时返回 None（首页走旧兜底）。"""
    config = await _get_config(db)
    if config is None:
        return None
    layout = _parse_layout(config.published_layout)
    if layout.lead is None:
        return None
    data = await _load_layout_data(db, layout)
    return await _build_page(
        layout,
        data,
        layout_revision=config.published_revision or config.revision,
        published_at=_iso(config.published_at),
    )


async def _candidate_pool(db: AsyncSession, position_map: dict[str, list[str]]) -> list[HomeContentCandidate]:
    revisions = (
        (
            await db.execute(
                select(HomeContentRevision).order_by(
                    HomeContentRevision.published_at.desc(), HomeContentRevision.version.desc()
                )
            )
        )
        .scalars()
        .all()
    )
    if not revisions:
        return []
    video_ids = list(dict.fromkeys(revision.video_id for revision in revisions))
    videos = (await db.execute(select(Video).where(Video.id.in_(video_ids)))).scalars().all()
    video_map = {video.id: video for video in videos}
    public_ids = await _public_video_ids(db, video_ids)
    subtitles = await _subtitles_by_video(db, video_ids)
    fingerprints = {video_id: compute_source_fingerprint(subs) for video_id, subs in subtitles.items()}
    candidates: list[HomeContentCandidate] = []
    for revision in revisions:
        video = video_map.get(revision.video_id)
        payload = _try_parse_draft(revision.payload)
        candidates.append(
            HomeContentCandidate(
                content_revision_id=revision.id,
                video_id=revision.video_id,
                video_title=video.title if video is not None else "",
                thumbnail_url=video.thumbnail_url if video is not None else None,
                duration=video.duration if video is not None else None,
                difficulty_level=video.difficulty_level if video is not None else None,
                topic_label=payload.topic_label if payload is not None else None,
                headline=payload.headline if payload is not None else "",
                dek=payload.dek if payload is not None else "",
                published_at=_iso(revision.published_at),
                source_changed=fingerprints.get(revision.video_id) != revision.source_fingerprint,
                publicly_visible=revision.video_id in public_ids,
                expression_ids=[expression.id for expression in payload.expressions] if payload else [],
                scenario_ids=[scenario.id for scenario in payload.scenarios] if payload else [],
                positions=_sorted_positions(position_map.get(revision.id, [])),
            )
        )
    return candidates


async def get_layout_state(db: AsyncSession) -> HomeLayoutState:
    config = await _get_config(db)
    draft_layout = _parse_layout(config.draft_layout) if config is not None else HomeLayoutPlacement()
    # 未发布/无上一版时必须是 None（TS 契约 HomeLayoutState.published_layout 可空），
    # 不能把 None 摊平成空布局——否则前端无法区分「空编排」与「从未发布」。
    published_layout = (
        _parse_layout(config.published_layout) if config is not None and config.published_layout is not None else None
    )
    previous_layout = (
        _parse_layout(config.previous_published_layout)
        if config is not None and config.previous_published_layout is not None
        else None
    )
    position_map = await _positions_map(db, published_layout)
    issues = await _validate_layout(db, draft_layout)
    page = None
    if published_layout is not None and published_layout.lead is not None:
        data = await _load_layout_data(db, published_layout)
        page = await _build_page(
            published_layout,
            data,
            layout_revision=0,
            published_at=None,
        )
    return HomeLayoutState(
        draft_layout=draft_layout,
        published_layout=published_layout,
        previous_published_layout=previous_layout,
        revision=config.revision if config is not None else 0,
        published_revision=config.published_revision if config is not None else None,
        published_active=page is not None,
        updated_at=_iso(config.updated_at) if config is not None else None,
        published_at=_iso(config.published_at) if config is not None else None,
        candidates=await _candidate_pool(db, position_map),
        issues=issues,
    )


async def save_layout_draft(
    db: AsyncSession,
    layout: HomeLayoutPlacement,
    expected_revision: int,
    actor_id: str | None,
) -> HomeLayoutState:
    """保存布局草稿（乐观锁）。允许保存「还没排好」的草稿，问题在发布时拦截。"""
    config = await _get_or_create_config(db)
    if config.revision != expected_revision:
        raise _revision_conflict("布局已在别处修改，请刷新后重试")
    # 乐观锁的原子判定：条件 UPDATE（WHERE revision = expected_revision）。
    await _cas_update(
        db,
        update(HomePageConfig)
        .where(
            HomePageConfig.id == LAYOUT_SINGLETON_ID,
            HomePageConfig.revision == expected_revision,
        )
        .values(
            draft_layout=layout.model_dump(mode="json"),
            revision=expected_revision + 1,
            updated_by=actor_id,
            updated_at=_now(),
        ),
        "布局已在别处修改，请刷新后重试",
    )
    await db.refresh(config)
    await db.commit()
    return await get_layout_state(db)


async def publish_layout(db: AsyncSession, expected_revision: int, actor_id: str | None) -> dict:
    """校验并原子发布整版布局（不暴露半套内容）。"""
    config = await _get_or_create_config(db)
    if config.revision != expected_revision:
        raise _revision_conflict("布局已在别处修改，请刷新后重试")
    layout = _parse_layout(config.draft_layout)
    issues = await _validate_layout(db, layout)
    if issues:
        raise AppError(
            422,
            ErrorCode.HOME_CONTENT_LAYOUT_INVALID,
            "布局校验失败",
            detail=[issue.model_dump() for issue in issues],
        )
    now = _now()
    new_revision = expected_revision + 1
    # 乐观锁的原子判定：条件 UPDATE（WHERE revision = expected_revision）。
    await _cas_update(
        db,
        update(HomePageConfig)
        .where(
            HomePageConfig.id == LAYOUT_SINGLETON_ID,
            HomePageConfig.revision == expected_revision,
        )
        .values(
            previous_published_layout=config.published_layout,
            published_layout=layout.model_dump(mode="json"),
            revision=new_revision,
            published_revision=new_revision,
            published_by=actor_id,
            published_at=now,
            updated_by=actor_id,
            updated_at=now,
        ),
        "布局已在别处修改，请刷新后重试",
    )
    await db.refresh(config)
    await db.commit()
    return {"layout_revision": new_revision}


async def rollback_layout(db: AsyncSession, expected_revision: int, actor_id: str | None) -> dict:
    """恢复上一发布布局。

    - ``previous_published_layout`` 为 null = 「没有上一版」，不是「上一版已失效」：
      允许原子地清空发布布局、回到旧首页兜底（``published_layout=null``），并把当前
      发布布局存进 previous 以便再次「前进」。返回 ``cleared=true``。
    - 有上一版时重新检查来源与可见性；引用已失效则 409 拒绝，不暴露半套内容。
    """
    config = await _get_or_create_config(db)
    if config.revision != expected_revision:
        raise _revision_conflict("布局已在别处修改，请刷新后重试")

    if config.previous_published_layout is None:
        now = _now()
        new_revision = expected_revision + 1
        await _cas_update(
            db,
            update(HomePageConfig)
            .where(
                HomePageConfig.id == LAYOUT_SINGLETON_ID,
                HomePageConfig.revision == expected_revision,
            )
            .values(
                previous_published_layout=config.published_layout,
                published_layout=None,
                revision=new_revision,
                published_revision=new_revision,
                published_by=actor_id,
                published_at=now,
                updated_by=actor_id,
                updated_at=now,
            ),
            "布局已在别处修改，请刷新后重试",
        )
        await db.refresh(config)
        await db.commit()
        return {"layout_revision": new_revision, "cleared": True}

    previous = _parse_layout(config.previous_published_layout)
    issues = await _validate_layout(db, previous)
    if issues:
        raise AppError(
            409,
            ErrorCode.HOME_CONTENT_ROLLBACK_INVALID,
            "上一版布局已不可恢复：内容来源或视频可见性发生变化，请重新编排",
            detail=[issue.model_dump() for issue in issues],
        )
    now = _now()
    new_revision = expected_revision + 1
    # 乐观锁的原子判定：条件 UPDATE（WHERE revision = expected_revision）。
    await _cas_update(
        db,
        update(HomePageConfig)
        .where(
            HomePageConfig.id == LAYOUT_SINGLETON_ID,
            HomePageConfig.revision == expected_revision,
        )
        .values(
            previous_published_layout=config.published_layout,
            published_layout=previous.model_dump(mode="json"),
            revision=new_revision,
            published_revision=new_revision,
            published_by=actor_id,
            published_at=now,
            updated_by=actor_id,
            updated_at=now,
        ),
        "布局已在别处修改，请刷新后重试",
    )
    await db.refresh(config)
    await db.commit()
    return {"layout_revision": new_revision, "cleared": False}


async def preview_layout(db: AsyncSession) -> HomeLayoutPreview:
    """整版预览：用 draft_layout 尽力构造 page，issues 是发布会被拒绝的问题。"""
    config = await _get_config(db)
    layout = _parse_layout(config.draft_layout) if config is not None else HomeLayoutPlacement()
    issues = await _validate_layout(db, layout)
    data = await _load_layout_data(db, layout)
    page = await _build_page(layout, data, layout_revision=0, published_at=None)
    return HomeLayoutPreview(page=page, issues=issues)


# ---------------------------------------------------------------------------
# 生成任务状态机（Celery 侧钩子；这些函数自己 commit）
# ---------------------------------------------------------------------------


@dataclass(slots=True)
class GenerationClaim:
    """``claim_generation`` 的结果：要么新建任务，要么复用既有有效任务。"""

    generation_id: str
    video_id: str
    reused: bool
    draft_revision: int
    source_fingerprint: str


@dataclass(slots=True)
class GenerationContext:
    """worker 生成所需的一切；``subtitles`` 是按 sentence_index 排序的 ORM 行。"""

    generation_id: str
    video_id: str
    video_title: str
    draft_revision: int
    source_fingerprint: str
    subtitles: list[Subtitle] = field(default_factory=list)
    existing_payload: dict | None = None


async def claim_generation(
    db: AsyncSession,
    video_id: str,
    actor_id: str | None,
    *,
    expected_revision: int | None = None,
    overwrite: bool = False,
    model: str | None = None,
    prompt_version: str | None = None,
) -> GenerationClaim:
    """原子占位一个生成任务；有有效任务时返回 ``reused=True``（不重复计费）。

    - 乐观锁：传了 ``expected_revision`` 就必须等于当前草稿 revision（409）。
    - 已有草稿且未确认覆盖 → 409 HOME_CONTENT_OVERWRITE_CONFIRM（先保留旧内容）。
    - 卡死的 queued/running（超过 ``GENERATION_STALE_SECONDS``）先标 failed TIMEOUT
      再重新占位，任务不会永久卡在 generating。
    """
    await _get_video(db, video_id)
    fingerprint, subtitles = await current_source_fingerprint(db, video_id)
    if not subtitles:
        raise AppError(422, ErrorCode.HOME_CONTENT_NO_SUBTITLES, "该视频没有字幕，无法生成首页内容")
    draft = await _get_or_create_draft(db, video_id)
    if expected_revision is not None and draft.revision != expected_revision:
        raise AppError(409, ErrorCode.HOME_CONTENT_REVISION_CONFLICT, "内容已在别处修改，请刷新后重试")

    if draft.active_generation_id:
        stale = _expire_stale_generation(draft)
        if not stale:
            if draft.generation_source_fingerprint is None:
                # 兼容历史行：没有指纹就按当前值补上，任务仍可继续。
                draft.generation_source_fingerprint = fingerprint
                draft.generation_draft_revision = draft.generation_draft_revision or draft.revision
                await db.commit()
            return GenerationClaim(
                generation_id=draft.active_generation_id,
                video_id=video_id,
                reused=True,
                draft_revision=draft.generation_draft_revision or draft.revision,
                source_fingerprint=draft.generation_source_fingerprint or fingerprint,
            )
        await db.commit()

    if draft.payload is not None and not overwrite:
        raise AppError(
            409,
            ErrorCode.HOME_CONTENT_OVERWRITE_CONFIRM,
            "该视频已有草稿，重新生成会覆盖现有内容；确认后请带 overwrite=true 重试",
            detail=[_issue("payload", "OVERWRITE_CONFIRM", "已有草稿，需要确认覆盖").model_dump()],
        )

    generation_id = str(uuid.uuid4())
    now = _now()
    values = {
        "active_generation_id": generation_id,
        "last_generation_id": generation_id,
        "status": HomeContentGenerationStatus.QUEUED,
        "generation_started_at": now,
        "generation_finished_at": None,
        "generation_error_code": None,
        "generation_error_message": None,
        "generation_draft_revision": draft.revision,
        "generation_source_fingerprint": fingerprint,
        "generation_model": model,
        "generation_prompt_version": prompt_version,
        "generation_usage": None,
        "generation_coverage": None,
        "generation_calls": 0,
        "generated_by": actor_id,
        "generated_at": now,
    }
    result = await db.execute(
        update(HomeContentDraft)
        .where(
            HomeContentDraft.video_id == video_id,
            HomeContentDraft.active_generation_id.is_(None),
        )
        .values(**values)
    )
    if result.rowcount == 0:
        # 并发落败：另一个请求刚占了位，按既有任务返回（不重复生成）。
        await db.rollback()
        current = await _get_draft(db, video_id)
        if current is not None and current.active_generation_id:
            return GenerationClaim(
                generation_id=current.active_generation_id,
                video_id=video_id,
                reused=True,
                draft_revision=current.generation_draft_revision or current.revision,
                source_fingerprint=current.generation_source_fingerprint or fingerprint,
            )
        raise AppError(409, ErrorCode.CONFLICT, "生成任务占位失败，请重试")
    # Core UPDATE 不经过 ORM，identity map 里还是旧值：commit 前刷新，避免调用方
    # 在同一 session 里读到 active_generation_id=None 的陈旧草稿。
    await db.refresh(draft)
    await db.commit()
    return GenerationClaim(
        generation_id=generation_id,
        video_id=video_id,
        reused=False,
        draft_revision=draft.revision,
        source_fingerprint=fingerprint,
    )


async def enqueue_generation(db: AsyncSession, claim: GenerationClaim) -> None:
    """把任务投到云端 Celery 队列；入队失败必须可见、可重试（503 + failed 状态）。"""
    try:
        from app.tasks.home_content_tasks import generate_home_content_draft

        generate_home_content_draft.apply_async(args=[claim.generation_id], task_id=claim.generation_id)
    except Exception as exc:
        logger.warning("home_content enqueue failed generation=%s exc=%s", claim.generation_id, exc)
        await fail_generation(
            db,
            claim.generation_id,
            ErrorCode.HOME_CONTENT_ENQUEUE_FAILED,
            "生成任务入队失败，请稍后重试",
        )
        raise AppError(
            503,
            ErrorCode.HOME_CONTENT_ENQUEUE_FAILED,
            "生成任务入队失败，请稍后重试",
        ) from exc


async def load_generation_context(
    db: AsyncSession, generation_id: str, *, mark_running: bool = True
) -> GenerationContext | None:
    """worker 读取生成上下文；返回 None 表示该任务已被取代/取消，应直接退出。"""
    draft = (
        await db.execute(select(HomeContentDraft).where(HomeContentDraft.active_generation_id == generation_id))
    ).scalar_one_or_none()
    if draft is None:
        return None
    video = (await db.execute(select(Video).where(Video.id == draft.video_id))).scalar_one_or_none()
    if video is None:
        await fail_generation(db, generation_id, ErrorCode.NOT_FOUND, "视频已不存在")
        return None
    subtitles = await _load_subtitles(db, draft.video_id)
    if mark_running and draft.status == HomeContentGenerationStatus.QUEUED:
        draft.status = HomeContentGenerationStatus.RUNNING
        await db.commit()
    return GenerationContext(
        generation_id=generation_id,
        video_id=video.id,
        video_title=video.title,
        draft_revision=draft.generation_draft_revision or draft.revision,
        source_fingerprint=draft.generation_source_fingerprint or compute_source_fingerprint(subtitles),
        subtitles=subtitles,
        existing_payload=draft.payload,
    )


async def complete_generation(
    db: AsyncSession,
    generation_id: str,
    payload: HomeContentDraftSchema | dict,
    *,
    model: str | None = None,
    prompt_version: str | None = None,
    usage: dict | None = None,
    coverage: dict | None = None,
    calls: int = 0,
) -> bool:
    """worker 成功写回：三重断言（任务 ID / 草稿 revision / 来源指纹）后才替换 payload。

    写回是**条件 UPDATE**（``WHERE id AND active_generation_id AND revision``）：
    判定与写入在同一条语句里，管理员在本函数读到草稿之后、提交之前保存草稿，
    也不会被 AI 结果盖掉（rowcount == 0 → 判冲突）。

    返回 True = 已写回；False = 有冲突或输出非法，此时草稿已被标 failed 并保留旧
    内容（调用方不需要再调 ``fail_generation``）。绝不覆盖管理员的新修改。
    """
    draft = (
        await db.execute(select(HomeContentDraft).where(HomeContentDraft.active_generation_id == generation_id))
    ).scalar_one_or_none()
    if draft is None:
        return False
    try:
        parsed = _parse_draft(payload)
        issues = collect_issues(parsed, await _load_subtitles(db, draft.video_id), strict=True)
    except ValidationError as exc:
        message = "; ".join(
            f"{'.'.join(str(part) for part in error.get('loc', ()))}: {error.get('msg', 'invalid')}"
            for error in exc.errors()
        )
        await fail_generation(db, generation_id, ErrorCode.HOME_CONTENT_AI_INVALID, f"AI 输出结构非法：{message}")
        return False
    if issues:
        await fail_generation(
            db,
            generation_id,
            ErrorCode.HOME_CONTENT_AI_INVALID,
            "AI 输出未通过校验：" + issues[0].message,
        )
        return False

    fingerprint = compute_source_fingerprint(await _load_subtitles(db, draft.video_id))
    if draft.generation_draft_revision is not None and draft.revision != draft.generation_draft_revision:
        await fail_generation(
            db,
            generation_id,
            ErrorCode.HOME_CONTENT_CONFLICT,
            "生成期间草稿已被修改，结果未写回",
        )
        return False
    if draft.generation_source_fingerprint and fingerprint != draft.generation_source_fingerprint:
        await fail_generation(
            db,
            generation_id,
            ErrorCode.HOME_CONTENT_SOURCE_CHANGED,
            "生成期间视频字幕已变更，结果未写回",
        )
        return False

    now = _now()
    values: dict[str, object] = {
        "payload": parsed.model_dump(mode="json"),
        "schema_version": CONTENT_SCHEMA_VERSION,
        "revision": draft.revision + 1,
        "source_fingerprint": fingerprint,
        "status": HomeContentGenerationStatus.SUCCEEDED,
        "active_generation_id": None,
        "last_generation_id": generation_id,
        "generation_finished_at": now,
        "generation_error_code": None,
        "generation_error_message": None,
        "generation_usage": usage,
        "generation_coverage": coverage,
        "generation_calls": max(int(calls or 0), 0),
        "updated_by": draft.generated_by,
        "updated_at": now,
    }
    if model is not None:
        values["generation_model"] = model
    if prompt_version is not None:
        values["generation_prompt_version"] = prompt_version
    # 写回用**条件 UPDATE**：判定与写入是同一条语句，SELECT 之后管理员再保存草稿
    # 也不会被覆盖（rowcount == 0 = 期间草稿变了 → 冲突）。这里校验的 revision 是
    # 本函数读到的那个快照值——它可能已经过期，正因如此才要把判定写进 WHERE。
    result = await db.execute(
        update(HomeContentDraft)
        .where(
            HomeContentDraft.id == draft.id,
            HomeContentDraft.active_generation_id == generation_id,
            HomeContentDraft.revision == draft.revision,
        )
        .values(**values)
    )
    if result.rowcount == 0:
        # 草稿在生成期间被改过：保留管理员的内容，把任务标成冲突失败。
        await db.rollback()
        await fail_generation(
            db,
            generation_id,
            ErrorCode.HOME_CONTENT_CONFLICT,
            "生成期间草稿已被修改，结果未写回",
        )
        return False
    await db.commit()
    return True


async def fail_generation(db: AsyncSession, generation_id: str, code: str, message: str) -> bool:
    """把当前任务标 failed（保留旧 payload / revision）；不是当前任务则返回 False。

    条件 UPDATE（``WHERE active_generation_id = generation_id``）：占位已经被
    换成新任务时，这一笔不会把新任务误标成失败。
    """
    result = await db.execute(
        update(HomeContentDraft)
        .where(HomeContentDraft.active_generation_id == generation_id)
        .values(
            status=HomeContentGenerationStatus.FAILED,
            last_generation_id=generation_id,
            active_generation_id=None,
            generation_error_code=(code or "UNKNOWN")[:40],
            generation_error_message=(message or "生成失败")[:500],
            generation_finished_at=_now(),
        )
    )
    if result.rowcount == 0:
        return False
    await db.commit()
    return True


async def sweep_stale_generations(db: AsyncSession | None = None) -> int:
    """巡检兜底：把超过 ``GENERATION_STALE_SECONDS`` 的 queued/running 标 failed TIMEOUT。

    Celery beat 调用时不传 ``db``（自己开 session）；返回处理条数。
    """
    if db is None:
        from app.core.database import get_async_session_maker

        maker = get_async_session_maker()
        async with maker() as session:
            return await sweep_stale_generations(session)
    drafts = (
        (
            await db.execute(
                select(HomeContentDraft).where(HomeContentDraft.status.in_(list(HomeContentGenerationStatus.ACTIVE)))
            )
        )
        .scalars()
        .all()
    )
    swept = 0
    for draft in drafts:
        if _expire_stale_generation(draft):
            swept += 1
    if swept:
        await db.commit()
    return swept


__all__ = [
    "CONTENT_SCHEMA_VERSION",
    "GENERATION_STALE_SECONDS",
    "LAYOUT_SINGLETON_ID",
    "GenerationClaim",
    "GenerationContext",
    "claim_generation",
    "collect_issues",
    "complete_generation",
    "compute_source_fingerprint",
    "current_source_fingerprint",
    "empty_layout",
    "enqueue_generation",
    "fail_generation",
    "get_generation_state",
    "get_layout_state",
    "get_video_state",
    "load_generation_context",
    "preview_layout",
    "preview_video",
    "publish_content",
    "publish_layout",
    "resolve_clip",
    "resolve_public_page",
    "resolve_sentences",
    "restore_draft",
    "rollback_layout",
    "save_draft",
    "save_layout_draft",
    "sweep_stale_generations",
]
