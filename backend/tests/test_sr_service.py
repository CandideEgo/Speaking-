"""Unit tests for SM-2 spaced repetition algorithm."""

import pytest

from app.services.sr_service import calculate_next_review


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
