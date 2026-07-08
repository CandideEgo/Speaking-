# Import all models in dependency order so SQLAlchemy can resolve relationships
from app.models.behavior import BehaviorEvent
from app.models.comment import VideoComment, VideoCommentStats
from app.models.community import CommentLike, CommentReport, Follow, Post, PostLike, UserComment, VideoLike
from app.models.exam_corpus import ExamSentence, ExamSentenceWord, ExamWordFreq
from app.models.favorite import UserFavorite, UserNote
from app.models.invite import InviteCode
from app.models.learning import LearningRecord, SpeakingAttempt, Vocabulary
from app.models.notification import Notification
from app.models.order import Order
from app.models.practice import VideoPracticeQuestion
from app.models.preferences import UserPreferences
from app.models.subtitle import Subtitle
from app.models.subtitle_change_proposal import SubtitleChangeProposal
from app.models.subtitle_mergeable_update import SubtitleMergeableUpdate
from app.models.subtitle_resegment_snapshot import SubtitleResegmentSnapshot
from app.models.subtitle_revision import SubtitleRevision
from app.models.user import User
from app.models.video import Video
from app.models.video_score import VideoScore
from app.models.video_standard import VideoStandard
from app.models.word_note import WordAINote
