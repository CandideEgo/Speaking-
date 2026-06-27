"""Tests for the speaking evaluation mapping logic (Phase 3 redo).

Covers the rubric→flat-score mapping that was previously broken: the main path
(alignment succeeded → pronunciation_feedback_rubric) returned all-zero scores
because evaluate_speaking read non-existent ``accuracy/fluency/completeness``
keys from the rubric result ``{criteria_scores, overall_feedback}``.
"""

from app.services.speaking_service import (
    DEFAULT_CRITERIA,
    _assemble_criteria_scores,
    _assemble_criteria_scores_from_flat,
    _criterion_score_by_name,
    _map_rubric_to_flat,
)


def test_criterion_score_by_name_case_insensitive():
    criteria = [{"criterion_name": "Accuracy", "score": 88}]
    assert _criterion_score_by_name(criteria, "Accuracy") == 88.0
    assert _criterion_score_by_name(criteria, "accuracy") == 88.0
    assert _criterion_score_by_name(criteria, "Fluency") == 0.0  # missing → 0


def test_map_rubric_to_flat_extracts_all_dimensions():
    """BUG#1 regression: rubric returns {criteria_scores, overall_feedback},
    not {accuracy, fluency, completeness, feedback}. Mapping must extract
    per-criterion scores by name so the main path is no longer all zeros."""
    rubric = {
        "criteria_scores": [
            {"criterion_name": "Accuracy", "score": 90, "feedback": "..."},
            {"criterion_name": "Fluency", "score": 75, "feedback": "..."},
            {"criterion_name": "Completeness", "score": 60, "feedback": "..."},
        ],
        "overall_feedback": "整体表现不错",
    }
    accuracy, fluency, completeness, feedback = _map_rubric_to_flat(rubric)
    assert accuracy == 90.0
    assert fluency == 75.0
    assert completeness == 60.0
    assert feedback == "整体表现不错"


def test_map_rubric_to_flat_missing_criterion_defaults_zero():
    rubric = {
        "criteria_scores": [{"criterion_name": "Accuracy", "score": 50}],
        "overall_feedback": "",
    }
    accuracy, fluency, completeness, feedback = _map_rubric_to_flat(rubric)
    assert accuracy == 50.0
    assert fluency == 0.0  # not returned by LLM → 0
    assert completeness == 0.0
    assert feedback == ""


def test_assemble_criteria_scores_merges_weight_from_default():
    llm_criteria = [
        {"criterion_name": "Accuracy", "score": 90, "feedback": "good"},
        {"criterion_name": "Fluency", "score": 80, "feedback": "ok"},
        {"criterion_name": "Completeness", "score": 70, "feedback": "missed some"},
    ]
    assembled = _assemble_criteria_scores(DEFAULT_CRITERIA, llm_criteria, "summary")
    assert len(assembled) == 3
    assert assembled[0] == {
        "name": "Accuracy",
        "score": 90.0,
        "feedback": "good",
        "weight": 1.0,
    }
    assert assembled[1]["name"] == "Fluency"
    assert assembled[1]["weight"] == 1.0


def test_assemble_criteria_scores_missing_llm_entry_zeros_score():
    """If the LLM omits a criterion, its score is 0 but weight is still merged."""
    llm_criteria = [{"criterion_name": "Accuracy", "score": 90, "feedback": "good"}]
    assembled = _assemble_criteria_scores(DEFAULT_CRITERIA, llm_criteria, "fallback fb")
    by_name = {c["name"]: c for c in assembled}
    assert by_name["Accuracy"]["score"] == 90.0
    assert by_name["Fluency"]["score"] == 0.0
    assert by_name["Fluency"]["feedback"] == "fallback fb"  # falls back to overall


def test_assemble_criteria_scores_from_flat_degraded_path():
    """Degraded path (alignment failed) still produces a consistent
    criteria_scores shape from flat accuracy/fluency/completeness."""
    assembled = _assemble_criteria_scores_from_flat(
        DEFAULT_CRITERIA, accuracy=88, fluency=77, completeness=66, feedback="keep going"
    )
    assert len(assembled) == 3
    by_name = {c["name"]: c for c in assembled}
    assert by_name["Accuracy"]["score"] == 88.0
    assert by_name["Fluency"]["score"] == 77.0
    assert by_name["Completeness"]["score"] == 66.0
    assert all(c["feedback"] == "keep going" for c in assembled)
    assert all(c["weight"] == 1.0 for c in assembled)
