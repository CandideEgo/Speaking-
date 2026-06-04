"""SM-2 Spaced Repetition Algorithm.

Based on the SuperMemo SM-2 algorithm:
https://www.supermemo.com/en/archives1990-2015/english/ol/sm2
"""


def calculate_next_review(
    quality: int,
    review_count: int,
    ease_factor: float,
    interval_days: int,
) -> tuple[int, float, int]:
    """Calculate the next review interval using SM-2.

    Args:
        quality: User self-assessment (0-5). 0=complete blackout, 5=perfect response.
        review_count: Number of times this item has been reviewed.
        ease_factor: Current easiness factor (minimum 1.3, default 2.5).
        interval_days: Current interval in days.

    Returns:
        Tuple of (next_interval_days, new_ease_factor, next_review_count).
    """
    if quality < 0 or quality > 5:
        raise ValueError("Quality must be between 0 and 5")

    if quality >= 3:
        # Correct response
        if review_count == 0:
            next_interval = 1
        elif review_count == 1:
            next_interval = 6
        else:
            next_interval = round(interval_days * ease_factor)

        review_count += 1
    else:
        # Incorrect response — reset
        next_interval = 1
        review_count = 0

    # Update ease factor
    new_ef = ease_factor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
    if new_ef < 1.3:
        new_ef = 1.3

    return next_interval, new_ef, review_count


def get_default_sr_params() -> tuple[int, float, int]:
    """Return default SM-2 parameters for a new item."""
    return 0, 2.5, 0  # interval_days, ease_factor, review_count
