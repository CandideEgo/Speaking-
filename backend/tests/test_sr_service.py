"""Unit tests for the spaced repetition interval calculators.

``TestCalculateNextReview`` pins the frozen SM-2 function — it survives only
for the legacy practice-submit path (``practice_service.submit_practice_results``).
The product's scheduling is the error-count band table (S6, DEC-057), covered
by ``TestReviewIntervalBands`` (pure table) and ``TestApplyReviewBands``
(through ``vocabulary_service.apply_review``, the single write path).
"""

from datetime import UTC, datetime, timedelta

import pytest

from app.models.learning import Vocabulary
from app.services.sr_service import calculate_next_review, calculate_review_interval
from app.services.vocabulary_service import QUALITY_CORRECT, QUALITY_WRONG, apply_review


class TestCalculateNextReview:
    def test_first_correct_review_returns_1_day(self):
        interval, _ef, count = calculate_next_review(quality=4, review_count=0, ease_factor=2.5, interval_days=0)
        assert interval == 1
        assert count == 1

    def test_second_correct_review_returns_6_days(self):
        interval, _ef, count = calculate_next_review(quality=4, review_count=1, ease_factor=2.5, interval_days=1)
        assert interval == 6
        assert count == 2

    def test_third_correct_review_uses_ease_factor(self):
        interval, _ef, count = calculate_next_review(quality=4, review_count=2, ease_factor=2.5, interval_days=6)
        assert interval == round(6 * 2.5)  # 15
        assert count == 3

    def test_incorrect_response_resets_interval(self):
        interval, _ef, count = calculate_next_review(quality=1, review_count=5, ease_factor=2.5, interval_days=30)
        assert interval == 1
        assert count == 0

    def test_perfect_quality_increases_ease_factor(self):
        _, ef, _ = calculate_next_review(quality=5, review_count=1, ease_factor=2.5, interval_days=1)
        assert ef > 2.5  # EF should increase

    def test_poor_quality_decreases_ease_factor(self):
        _, ef, _ = calculate_next_review(quality=2, review_count=5, ease_factor=2.5, interval_days=30)
        assert ef < 2.5  # EF should decrease

    def test_ease_factor_never_below_1_3(self):
        _interval, ef, _count = calculate_next_review(quality=0, review_count=5, ease_factor=1.3, interval_days=30)
        assert ef == 1.3

    def test_invalid_quality_raises_error(self):
        with pytest.raises(ValueError):
            calculate_next_review(quality=6, review_count=0, ease_factor=2.5, interval_days=0)

        with pytest.raises(ValueError):
            calculate_next_review(quality=-1, review_count=0, ease_factor=2.5, interval_days=0)


class TestReviewIntervalBands:
    """设计 §5.4 的间隔分档表，表驱动（S6，DEC-057）。"""

    @pytest.mark.parametrize(
        ("correct", "wrong_count", "interval_days", "wrong_recent", "expected"),
        [
            # 情形 1：本轮内答错过 → 次日（其后答对也回到次日）
            (True, 1, 1, True, 1),
            (False, 1, 3, True, 1),
            # 情形 2：本轮内一次没错 → 3 天后
            (True, 0, 0, False, 3),
            # 情形 3：复习时答错 → 回到次日（wrong_count += 1 在 apply_review 落库）
            (False, 1, 7, False, 1),
            (False, 0, 16, False, 1),
            # 情形 4：全对且 wrong_count = 0 → 3 → 7 → 16 → 35
            (True, 0, 3, False, 7),
            (True, 0, 7, False, 16),
            (True, 0, 16, False, 35),
            (True, 0, 35, False, 35),
            # 情形 5：全对但 wrong_count ≥ 1 → 2 → 5 → 12 → 25
            (True, 1, 1, False, 2),
            (True, 2, 2, False, 5),
            (True, 1, 5, False, 12),
            (True, 2, 12, False, 25),
            (True, 1, 25, False, 25),
            # 情形 6：wrong_count ≥ 3 → 间隔上限 7 天
            (True, 3, 1, False, 2),
            (True, 3, 5, False, 7),
            (True, 4, 7, False, 7),
            (True, 5, 12, False, 7),
        ],
    )
    def test_band_table(self, correct, wrong_count, interval_days, wrong_recent, expected):
        assert (
            calculate_review_interval(
                correct=correct,
                wrong_count=wrong_count,
                interval_days=interval_days,
                wrong_recent=wrong_recent,
            )
            == expected
        )


def _vocab(**overrides) -> Vocabulary:
    fields = dict(
        word="bandword",
        review_count=0,
        ease_factor=2.5,
        interval_days=0,
        wrong_count=0,
        correct_count=0,
    )
    fields.update(overrides)
    return Vocabulary(**fields)


class TestApplyReviewBands:
    """apply_review 是复习状态的唯一写入口；这里验证分档表经过它的落库行为。"""

    def test_clean_round_word_schedules_three_days(self):
        vocab = _vocab()
        now = datetime.now(UTC)
        interval, next_at = apply_review(vocab, QUALITY_CORRECT, now=now)
        assert interval == 3
        assert next_at == now + timedelta(days=3)
        assert vocab.wrong_count == 0
        assert vocab.last_wrong_at is None

    def test_wrong_in_round_keeps_next_day_even_after_correct(self):
        now = datetime.now(UTC)
        vocab = _vocab()
        apply_review(vocab, QUALITY_WRONG, now=now)
        assert vocab.interval_days == 1
        apply_review(vocab, QUALITY_CORRECT, now=now + timedelta(minutes=5))
        assert vocab.interval_days == 1
        assert vocab.wrong_count == 1

    def test_wrong_review_writes_wrong_count_and_last_wrong_at(self):
        now = datetime.now(UTC)
        vocab = _vocab(interval_days=7, review_count=3)
        interval, _next_at = apply_review(vocab, QUALITY_WRONG, now=now)
        assert interval == 1
        assert vocab.wrong_count == 1
        assert vocab.last_wrong_at == now
        assert vocab.next_review_at == now + timedelta(days=1)

    def test_clean_ladder_climbs_3_7_16_35(self):
        now = datetime.now(UTC)
        vocab = _vocab()
        for expected in (3, 7, 16, 35, 35):
            interval, _next_at = apply_review(vocab, QUALITY_CORRECT, now=now)
            assert interval == expected
        assert vocab.wrong_count == 0

    def test_error_ladder_climbs_2_5_12_25(self):
        now = datetime.now(UTC)
        vocab = _vocab(
            wrong_count=1,
            interval_days=1,
            review_count=2,
            last_wrong_at=now - timedelta(days=3),
        )
        for expected in (2, 5, 12, 25, 25):
            interval, _next_at = apply_review(vocab, QUALITY_CORRECT, now=now)
            assert interval == expected
        assert vocab.wrong_count == 1

    def test_error_ladder_caps_at_seven_days_from_three_wrongs(self):
        now = datetime.now(UTC)
        vocab = _vocab(
            wrong_count=3,
            interval_days=5,
            review_count=6,
            last_wrong_at=now - timedelta(days=3),
        )
        for expected in (7, 7):
            interval, _next_at = apply_review(vocab, QUALITY_CORRECT, now=now)
            assert interval == expected

    def test_wrong_review_does_not_reset_review_count_to_new(self):
        now = datetime.now(UTC)
        vocab = _vocab(review_count=4)
        apply_review(vocab, QUALITY_WRONG, now=now)
        assert vocab.review_count == 5
        # 复习时答错必须明日在复习队列重现（mastery ≥ learning），不能回落成新词
        assert vocab.mastery_level == "reviewing"

    def test_ease_factor_is_no_longer_touched(self):
        now = datetime.now(UTC)
        vocab = _vocab(ease_factor=2.7)
        apply_review(vocab, QUALITY_CORRECT, now=now)
        apply_review(vocab, QUALITY_WRONG, now=now)
        assert vocab.ease_factor == 2.7
