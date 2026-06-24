# Import all models in dependency order so SQLAlchemy can resolve relationships
from app.models.comment import VideoComment, VideoCommentStats
from app.models.community import CommentLike, CommentReport, Follow, Post, PostLike, UserComment
from app.models.daily_activity import DailyActivity
from app.models.invite import InviteCode
from app.models.learning import LearningRecord, SpeakingAttempt, Vocabulary
from app.models.notification import Notification
from app.models.order import Order
from app.models.password_reset import PasswordResetToken
from app.models.preferences import UserPreferences
from app.models.rubric import RubricCriterion, SpeakingAttemptScore, SpeakingRubric
from app.models.subtitle import Subtitle
from app.models.user import User
from app.models.video import Video
