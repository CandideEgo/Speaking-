"""首页编辑内容的 Pydantic schema（契约唯一事实源之一）。

两套 DTO，别混用：

1. **草稿 / 请求**（``HomeContentDraft`` 及其子结构）——管理员保存与 AI 生成的
   载荷。**草稿宽松**：允许空 headline/dek、无 clip、0 条表达；结构与长度在
   这里拦下（422），引用是否真属于该视频、短语是否真在字幕里由
   ``services.home_content_service.collect_issues`` 校验（需要数据库）。
2. **展示 DTO**（``HomeEditorialPage`` 及其子结构）——公共接口与后台预览共用
   同一形状，对应 ``frontend/src/types/homeContent.ts``。字段名/可空性一一对应，
   改这里必须同步改那个 TS 文件（它归 Lead，不要自己改）。

管理员 DTO（``HomeContentVideoState`` / ``HomeLayoutState`` / 候选池）同样与 TS
一一对应。
"""

from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from app.schemas.video import VideoResponse

#: 稳定 ID（列表内唯一）的格式：小写字母/数字开头，可带连字符，最长 48。
ID_PATTERN = r"^[a-z0-9][a-z0-9-]{0,47}$"

#: 生成状态机的取值（与 models.HomeContentGenerationStatus 对齐）。
HomeContentGenerationStatus = Literal["idle", "queued", "running", "succeeded", "failed"]
#: 一条内容版本可能被摆在的位置。
HomeContentSlotPosition = Literal["lead", "secondary", "expression", "scenario"]


def _clean_optional(value: str | None) -> str | None:
    """可选字符串：strip 后为空 → None（UI 的空输入框语义）。"""
    if value is None:
        return None
    value = value.strip()
    return value or None


def _clean_required(value: str) -> str:
    """必填字符串：只 strip，不把空串变 None（长度规则交给 Field / 服务层）。"""
    return value.strip()


# ---------------------------------------------------------------------------
# 草稿（保存与 AI 生成共用；宽松）
# ---------------------------------------------------------------------------


class HomeContentClipRef(BaseModel):
    """片段的起止字幕 ID；时间由服务端按字幕解析，不接受客户端传时间。"""

    start_subtitle_id: str = Field(min_length=1, max_length=36)
    end_subtitle_id: str = Field(min_length=1, max_length=36)


class HomeContentDraftExpression(BaseModel):
    id: str = Field(pattern=ID_PATTERN)
    subtitle_id: str = Field(min_length=1, max_length=36)
    phrase: str = Field(min_length=1, max_length=200)
    # 收词入口用单词；短语时为 null。必须有值时才校验它属于 phrase（服务层）。
    word: str | None = Field(default=None, max_length=80)
    gloss_zh: str | None = Field(default=None, max_length=200)
    note_zh: str | None = Field(default=None, max_length=300)

    @field_validator("phrase", mode="before")
    @classmethod
    def _clean_phrase(cls, value: object) -> object:
        return _clean_required(value) if isinstance(value, str) else value

    @field_validator("word", "gloss_zh", "note_zh", mode="before")
    @classmethod
    def _clean_optional_fields(cls, value: object) -> object:
        return _clean_optional(value) if isinstance(value, str) else value

    @field_validator("phrase")
    @classmethod
    def _phrase_required(cls, value: str) -> str:
        if not value:
            raise ValueError("表达必须包含选中的词或短语")
        return value


class HomeContentDraftScenario(BaseModel):
    id: str = Field(pattern=ID_PATTERN)
    situation_zh: str = Field(min_length=1, max_length=40)
    prompt_zh: str = Field(min_length=1, max_length=120)
    reply_en: str = Field(min_length=1, max_length=300)
    reply_zh: str = Field(min_length=1, max_length=300)
    # 可锚定到真实字幕语境；教学例句本身不要求出现在字幕里。
    subtitle_id: str | None = Field(default=None, max_length=36)

    @field_validator("situation_zh", "prompt_zh", "reply_en", "reply_zh", mode="before")
    @classmethod
    def _clean_required_fields(cls, value: object) -> object:
        return _clean_required(value) if isinstance(value, str) else value

    @field_validator("subtitle_id", mode="before")
    @classmethod
    def _clean_optional_field(cls, value: object) -> object:
        return _clean_optional(value) if isinstance(value, str) else value


class HomeContentDraftInteractionOption(BaseModel):
    id: str = Field(pattern=ID_PATTERN)
    label: str = Field(min_length=1, max_length=60)
    feedback: str = Field(min_length=1, max_length=300)

    @field_validator("label", "feedback", mode="before")
    @classmethod
    def _clean_required_fields(cls, value: object) -> object:
        return _clean_required(value) if isinstance(value, str) else value


class HomeContentDraftInteraction(BaseModel):
    id: str = Field(pattern=ID_PATTERN)
    question: str = Field(min_length=1, max_length=120)
    # 草稿允许只写 1 个选项（不完整）；发布要求 2–3（服务层严格校验）。
    options: list[HomeContentDraftInteractionOption] = Field(default_factory=list, max_length=3)

    @field_validator("question", mode="before")
    @classmethod
    def _clean_question(cls, value: object) -> object:
        return _clean_required(value) if isinstance(value, str) else value

    @model_validator(mode="after")
    def _unique_option_ids(self) -> "HomeContentDraftInteraction":
        ids = [option.id for option in self.options]
        if len(ids) != len(set(ids)):
            raise ValueError("互动选项 id 重复")
        return self


class HomeContentDraft(BaseModel):
    """一条视频的可编辑内容（草稿允许不完整，发布前由服务层严格校验）。"""

    headline: str = Field(default="", max_length=32)
    dek: str = Field(default="", max_length=80)
    topic_label: str | None = Field(default=None, max_length=12)
    evidence_subtitle_ids: list[str] = Field(default_factory=list, max_length=6)
    clip: HomeContentClipRef | None = None
    expressions: list[HomeContentDraftExpression] = Field(default_factory=list, max_length=3)
    interaction: HomeContentDraftInteraction | None = None
    scenarios: list[HomeContentDraftScenario] = Field(default_factory=list, max_length=3)

    @field_validator("headline", "dek", mode="before")
    @classmethod
    def _clean_required_fields(cls, value: object) -> object:
        return _clean_required(value) if isinstance(value, str) else value

    @field_validator("topic_label", mode="before")
    @classmethod
    def _clean_topic_label(cls, value: object) -> object:
        return _clean_optional(value) if isinstance(value, str) else value

    @model_validator(mode="after")
    def _unique_ids(self) -> "HomeContentDraft":
        for name, items in (
            ("evidence_subtitle_ids", self.evidence_subtitle_ids),
            ("expressions", [item.id for item in self.expressions]),
            ("scenarios", [item.id for item in self.scenarios]),
        ):
            if len(items) != len(set(items)):
                raise ValueError(f"{name} 中存在重复 ID")
        return self


# ---------------------------------------------------------------------------
# 展示 DTO —— 公共接口与后台预览共用（对应 frontend/src/types/homeContent.ts）
# ---------------------------------------------------------------------------


class HomeEditorialSentence(BaseModel):
    """真实字幕句：时间/原文/译文都由服务端按 subtitle_id 读库填充。"""

    subtitle_id: str
    sentence_index: int
    text_en: str
    text_zh: str | None = None
    start_time: float
    end_time: float


class HomeEditorialExpression(BaseModel):
    id: str
    subtitle_id: str
    phrase: str
    word: str | None = None
    gloss_zh: str | None = None
    note_zh: str | None = None
    # 音标优先来自词典；缺失时为 None（不伪造）。
    phonetic: str | None = None
    # 按字幕词级时间戳解析；缺时间戳时为 None（前端此时不显示「听这个词」）。
    word_start_time: float | None = None
    word_end_time: float | None = None
    sentence: HomeEditorialSentence


class HomeEditorialInteractionOption(BaseModel):
    id: str
    label: str
    feedback: str


class HomeEditorialInteraction(BaseModel):
    id: str
    question: str
    options: list[HomeEditorialInteractionOption]


class HomeEditorialScenario(BaseModel):
    id: str
    situation_zh: str
    prompt_zh: str
    reply_en: str
    reply_zh: str
    # 场景锚定的真实字幕语境；无则 None。reply_en 是教学例句，不是视频原话。
    sentence: HomeEditorialSentence | None = None


class HomeEditorialClip(BaseModel):
    start_subtitle_id: str
    end_subtitle_id: str
    start_time: float
    end_time: float
    duration: float


class HomeEditorialContent(BaseModel):
    content_revision_id: str
    video_id: str
    version: int
    headline: str
    dek: str
    topic_label: str | None = None
    # 来源标签（频道名，缺省 "SeeWord"）。
    source_label: str | None = None
    published_at: str | None = None
    clip: HomeEditorialClip | None = None
    expressions: list[HomeEditorialExpression] = Field(default_factory=list)
    interaction: HomeEditorialInteraction | None = None
    scenarios: list[HomeEditorialScenario] = Field(default_factory=list)
    # 该版本引用的全部字幕（依据 + 片段 + 表达 + 场景），供「看原文」。
    sentences: list[HomeEditorialSentence] = Field(default_factory=list)


class HomeEditorialVideoSlot(BaseModel):
    content: HomeEditorialContent
    # 视频事实（与列表卡片同一形状）；媒体鉴权、封面、时长都读它。
    video: VideoResponse


class HomeEditorialExpressionSlot(BaseModel):
    content_revision_id: str
    expression_id: str
    headline: str
    topic_label: str | None = None
    video: VideoResponse
    expression: HomeEditorialExpression


class HomeEditorialScenarioSlot(BaseModel):
    content_revision_id: str
    scenario_id: str
    video: VideoResponse
    scenario: HomeEditorialScenario


class HomeEditorialPage(BaseModel):
    layout_revision: int = 0
    published_at: str | None = None
    lead: HomeEditorialVideoSlot | None = None
    secondary: list[HomeEditorialVideoSlot] = Field(default_factory=list)
    expression: HomeEditorialExpressionSlot | None = None
    scenarios: list[HomeEditorialScenarioSlot] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# 管理员 DTO（对应 TS 的 HomeContentVideoState / HomeLayoutState / 候选池）
# ---------------------------------------------------------------------------


class HomeContentGenerationUsage(BaseModel):
    prompt_tokens: int | None = None
    completion_tokens: int | None = None


class HomeContentGenerationCoverage(BaseModel):
    """实际提交给模型的字幕覆盖度；不把估算字符数冒充 token 用量。"""

    mode: Literal["single", "segmented"]
    ai_calls: int = Field(ge=0)
    total_sentences: int = Field(ge=0)
    covered_sentences: int = Field(ge=0)
    planned_segments: int = Field(ge=0)
    segments_sent: int = Field(ge=0)
    truncated: bool = False
    is_full_coverage: bool = False
    covered_ranges: list[tuple[int, int]] = Field(default_factory=list)


class HomeContentGeneration(BaseModel):
    """最近一次生成任务（含已结束的），后台据此轮询与展示失败原因。"""

    generation_id: str
    status: HomeContentGenerationStatus
    started_at: str | None = None
    finished_at: str | None = None
    error_code: str | None = None
    error_message: str | None = None
    model: str | None = None
    prompt_version: str | None = None
    usage: HomeContentGenerationUsage | None = None
    coverage: HomeContentGenerationCoverage | None = None


class HomeContentRevisionSummary(BaseModel):
    id: str
    version: int
    headline: str
    dek: str
    published_at: str | None = None
    published_by_name: str | None = None
    # 该版本存下的来源指纹与当前字幕不一致 → 不可再用于布局/公共展示。
    source_changed: bool = False
    # 该版本当前被摆在哪些位置。
    positions: list[HomeContentSlotPosition] = Field(default_factory=list)
    expression_ids: list[str] = Field(default_factory=list)
    scenario_ids: list[str] = Field(default_factory=list)


class HomeContentVideoState(BaseModel):
    video_id: str
    video_title: str
    # 视频是否满足公共可见条件（发布时强制校验）。
    publicly_visible: bool = False
    # 当前视频字幕指纹，供前端展示「来源已变更」。
    source_fingerprint: str = ""
    draft: HomeContentDraft | None = None
    # 草稿乐观锁 revision；无草稿时 0。
    draft_revision: int = 0
    # 草稿依据的来源指纹与当前不一致。
    source_changed: bool = False
    generation: HomeContentGeneration | None = None
    revisions: list[HomeContentRevisionSummary] = Field(default_factory=list)
    positions: list[HomeContentSlotPosition] = Field(default_factory=list)


class HomeLayoutLeadRef(BaseModel):
    content_revision_id: str = Field(min_length=1, max_length=36)


class HomeLayoutExpressionRef(BaseModel):
    content_revision_id: str = Field(min_length=1, max_length=36)
    expression_id: str = Field(pattern=ID_PATTERN)


class HomeLayoutScenarioRef(BaseModel):
    content_revision_id: str = Field(min_length=1, max_length=36)
    scenario_id: str = Field(pattern=ID_PATTERN)


class HomeLayoutPlacement(BaseModel):
    """首页布局：只引用已发布版本 id（+ 稳定 expression_id/scenario_id）。"""

    lead: HomeLayoutLeadRef | None = None
    secondary: list[HomeLayoutLeadRef] = Field(default_factory=list)
    expression: HomeLayoutExpressionRef | None = None
    scenarios: list[HomeLayoutScenarioRef] = Field(default_factory=list)


class HomeContentCandidate(BaseModel):
    """编排页候选池：只列已发布版本；来源/可见性失效的也列出（带标记，不可选）。"""

    content_revision_id: str
    video_id: str
    video_title: str
    thumbnail_url: str | None = None
    duration: float | None = None
    difficulty_level: str | None = None
    topic_label: str | None = None
    headline: str
    dek: str
    published_at: str | None = None
    source_changed: bool = False
    publicly_visible: bool = False
    expression_ids: list[str] = Field(default_factory=list)
    scenario_ids: list[str] = Field(default_factory=list)
    positions: list[HomeContentSlotPosition] = Field(default_factory=list)


class HomeLayoutIssue(BaseModel):
    """字段级问题：field 形如 ``lead`` / ``secondary[0]`` / ``scenarios[1]``。"""

    field: str
    code: str
    message: str


class HomeLayoutState(BaseModel):
    draft_layout: HomeLayoutPlacement = Field(default_factory=HomeLayoutPlacement)
    published_layout: HomeLayoutPlacement | None = None
    previous_published_layout: HomeLayoutPlacement | None = None
    revision: int = 0
    published_revision: int | None = None
    # 发布布局当前是否还有可用内容（公开接口是否走新首页）。
    published_active: bool = False
    updated_at: str | None = None
    published_at: str | None = None
    candidates: list[HomeContentCandidate] = Field(default_factory=list)
    # 当前 draft_layout 的字段级问题；发布会被拒绝。
    issues: list[HomeLayoutIssue] = Field(default_factory=list)


class HomeLayoutPreview(BaseModel):
    """两个 preview 接口的统一形状：page 由草稿/布局尽力构造。"""

    page: HomeEditorialPage | None = None
    issues: list[HomeLayoutIssue] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# 请求 / 响应 envelope
# ---------------------------------------------------------------------------


class HomeContentDraftSaveRequest(BaseModel):
    payload: HomeContentDraft
    expected_revision: int = Field(ge=0)


class HomeContentGenerateRequest(BaseModel):
    expected_revision: int | None = Field(default=None, ge=0)
    overwrite: bool = False


class HomeContentPublishRequest(BaseModel):
    expected_revision: int = Field(ge=0)
    # 发布时顺带把该内容版本放进首页位置（「发布并替换主推」）。
    place: Literal["lead", "secondary"] | None = None


class HomeContentRestoreDraftRequest(BaseModel):
    revision_id: str = Field(min_length=1, max_length=36)
    expected_revision: int = Field(ge=0)


class HomeLayoutDraftSaveRequest(BaseModel):
    layout: HomeLayoutPlacement
    expected_revision: int = Field(ge=0)


class HomeLayoutPublishRequest(BaseModel):
    expected_revision: int = Field(ge=0)


class HomeContentGenerationResponse(BaseModel):
    """202/200：`reused=true` 表示已有有效任务，未重复生成（不重复计费）。"""

    generation: HomeContentGeneration
    reused: bool = False


class HomeContentGenerationEnvelope(BaseModel):
    generation: HomeContentGeneration | None = None


class HomeContentPublishResponse(BaseModel):
    revision_id: str
    version: int
    layout_revision: int | None = None


class HomeEditorialResponse(BaseModel):
    editorial: HomeEditorialPage | None = None


class HomeLayoutPublishResponse(BaseModel):
    layout_revision: int
    # 恢复上一版时才有意义：True = 没有上一版，已原子清空发布布局（回到旧首页兜底）；
    # False = 恢复到了真实上一版布局。发布接口不带该字段（前端按存在与否处理）。
    cleared: bool | None = None


__all__ = [
    "ID_PATTERN",
    "HomeContentCandidate",
    "HomeContentClipRef",
    "HomeContentDraft",
    "HomeContentDraftExpression",
    "HomeContentDraftInteraction",
    "HomeContentDraftInteractionOption",
    "HomeContentDraftSaveRequest",
    "HomeContentDraftScenario",
    "HomeContentGenerateRequest",
    "HomeContentGeneration",
    "HomeContentGenerationEnvelope",
    "HomeContentGenerationResponse",
    "HomeContentGenerationStatus",
    "HomeContentGenerationUsage",
    "HomeContentPublishRequest",
    "HomeContentPublishResponse",
    "HomeContentRestoreDraftRequest",
    "HomeContentRevisionSummary",
    "HomeContentSlotPosition",
    "HomeContentVideoState",
    "HomeEditorialClip",
    "HomeEditorialContent",
    "HomeEditorialExpression",
    "HomeEditorialExpressionSlot",
    "HomeEditorialInteraction",
    "HomeEditorialInteractionOption",
    "HomeEditorialPage",
    "HomeEditorialResponse",
    "HomeEditorialScenario",
    "HomeEditorialScenarioSlot",
    "HomeEditorialSentence",
    "HomeEditorialVideoSlot",
    "HomeLayoutDraftSaveRequest",
    "HomeLayoutExpressionRef",
    "HomeLayoutIssue",
    "HomeLayoutLeadRef",
    "HomeLayoutPlacement",
    "HomeLayoutPreview",
    "HomeLayoutPublishRequest",
    "HomeLayoutPublishResponse",
    "HomeLayoutScenarioRef",
    "HomeLayoutState",
]
