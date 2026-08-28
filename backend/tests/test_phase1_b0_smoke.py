"""Phase 1 B0 smoke tests — verify new endpoints register in the right order
and the schema/model changes are in place. Does NOT hit the database.
"""

from app.api.v1 import learning, videos


def test_favorites_route_registered_before_dynamic_video_id():
    """The static /favorites path must be matched before /{video_id} —
    otherwise FastAPI treats "favorites" as a video_id and returns 404.
    """
    paths = [r.path for r in videos.router.routes if hasattr(r, "path")]
    fav_idx = paths.index("/videos/favorites")
    dyn_idx = paths.index("/videos/{video_id}")
    assert fav_idx < dyn_idx, (
        f"/videos/favorites (pos {fav_idx}) must come BEFORE "
        f"/videos/{{video_id}} (pos {dyn_idx}); FastAPI uses registration order"
    )


def test_phase1_video_endpoints_registered():
    paths = {r.path for r in videos.router.routes if hasattr(r, "path")}
    assert "/videos/favorites" in paths
    assert "/videos/{video_id}/vocabulary" in paths
    assert "/videos/{video_id}/shadowing-sentences" in paths


def test_phase1_learning_stats_endpoints_registered():
    paths = {r.path for r in learning.router.routes if hasattr(r, "path")}
    assert "/learning/stats/weekly" in paths
    assert "/learning/stats/event-distribution" in paths
    assert "/learning/stats/heatmap" in paths


def test_vocabulary_model_has_subtitle_id():
    from app.models.learning import Vocabulary

    assert hasattr(Vocabulary, "subtitle_id"), "Vocabulary.subtitle_id required for D3b drill 回看原句"


def test_notification_prefs_defaults_include_phase1_keys():
    from app.models.preferences import DEFAULT_NOTIFICATION_PREFS

    assert "vocabulary_reminder_time" in DEFAULT_NOTIFICATION_PREFS
    assert DEFAULT_NOTIFICATION_PREFS["vocabulary_reminder_time"] == "20:00"
    assert "streak_warning_enabled" in DEFAULT_NOTIFICATION_PREFS
    assert DEFAULT_NOTIFICATION_PREFS["streak_warning_enabled"] is True


def test_vocabulary_response_schema_includes_subtitle_id():
    from app.schemas.vocabulary import VocabularyResponse

    fields = set(VocabularyResponse.model_fields.keys())
    assert "subtitle_id" in fields, "VocabularyResponse must include subtitle_id for D3b"
