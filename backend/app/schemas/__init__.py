# Schemas — 统一导出
# 按领域分组, 方便外部 from app.schemas import Xxx

# ── 用户与认证 ──
# ── 评论 ──
from app.schemas.comment import (
    CommentCreate,
    CommentResponse,
    CommentStatsResponse,
    CommentUpdate,
    VideoWithCommentScoreResponse,
)
from app.schemas.community import (
    CommentCreate as CommunityCommentCreate,
)
from app.schemas.community import (
    CommentResponse as CommunityCommentResponse,
)

# ── 社区 ──
from app.schemas.community import (
    FollowResponse,
    PostCreate,
    PostResponse,
    ReportCreate,
    UserProfileBrief,
)

# ── 邀请码 ──
from app.schemas.invite import (
    InviteCodeGenerate,
    InviteCodeRedeem,
    InviteCodeResponse,
    RedeemResponse,
)

# ── 学习记录 ──
from app.schemas.learning import (
    LearningRecordListResponse,
    LearningRecordResponse,
    SaveProgressRequest,
    SaveProgressResponse,
    VideoInfoInRecord,
)

# ── 通知 ──
from app.schemas.notification import (
    NotificationPreferencesResponse,
    NotificationPreferencesUpdate,
    NotificationResponse,
    UnreadCountResponse,
)

# ── 通用分页 ──
from app.schemas.pagination import (
    PaginatedResponse,
    PaginationParams,
)

# ── 支付 ──
from app.schemas.payment import (
    CreateOrderRequest,
    CreateOrderResponse,
    OrderStatusResponse,
    PaymentStatusResponse,
)

# ── 评分标准 ──
from app.schemas.rubric import (
    CriterionScoreResponse,
    RubricCreate,
    RubricCriterionCreate,
    RubricCriterionResponse,
    RubricResponse,
    RubricUpdate,
)

# ── 口语练习 ──
from app.schemas.speaking import (
    CriterionScore,
    FreePracticeResponse,
    SpeakingAttemptResponse,
    SpeakingSubmitResponse,
    WordScore,
)
from app.schemas.user import (
    ActivityCalendarResponse,
    ChangePasswordRequest,
    DailyActivityResponse,
    ForgotPasswordRequest,
    LogoutRequest,
    MessageResponse,
    OnboardingRequest,
    RefreshRequest,
    RefreshResponse,
    ResetPasswordRequest,
    StreakInfoResponse,
    TokenResponse,
    UserCreate,
    UserLogin,
    UserPreferencesResponse,
    UserPreferencesUpdate,
    UserResponse,
    UserStatsResponse,
    UserUpdate,
)

# ── 视频 ──
from app.schemas.video import (
    SubtitleResponse,
    SubtitleSearchResult,
    SubtitleSnippet,
    VideoCreate,
    VideoDetailResponse,
    VideoResponse,
    VideoStatusResponse,
)

# ── 词汇 ──
from app.schemas.vocabulary import (
    QuizAnswerItem,
    QuizGenerateRequest,
    QuizItemResult,
    QuizQuestionResponse,
    QuizSubmitRequest,
    QuizSubmitResponse,
    VocabularyEnrichResponse,
    VocabularyResponse,
    VocabularyStatsResponse,
)
