"""SM-2 Spaced Repetition Algorithm.

Reference: Piotr Woźniak's SuperMemo SM-2 algorithm.
All parameters are explicitly passed and persisted by the caller.

Args:
    quality: 0-5 rating (0=complete blackout, 5=perfect)
    review_count: number of previous reviews for this item
    ease_factor: current ease factor (≥1.3), stored in Vocabulary.ease_factor
    interval_days: current interval in days, stored in Vocabulary.interval_days

Returns:
    (next_interval_days, new_ease_factor, new_review_count)
"""

MIN_EASE_FACTOR = 1.3


def calculate_next_review(
    quality: int,
    review_count: int,
    ease_factor: float = 2.5,
    interval_days: int = 0,
) -> tuple[int, float, int]:
    """Calculate the next review interval using SM-2.

    Parameters
    ----------
    quality : int
        User's recall quality (0-5).
    review_count : int
        Number of times the item has been reviewed.
    ease_factor : float
        Current ease factor (default 2.5 for new items).
    interval_days : int
        Current interval between reviews in days.

    Returns
    -------
    tuple[int, float, int]
        (next_interval_days, new_ease_factor, new_review_count)
    """
    if not 0 <= quality <= 5:
        raise ValueError("Quality must be between 0 and 5")

    # Update ease factor
    new_ef = ease_factor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
    if new_ef < MIN_EASE_FACTOR:
        new_ef = MIN_EASE_FACTOR

    # If quality < 3, reset to the beginning
    if quality < 3:
        new_review_count = 0
        new_interval = 1
    else:
        new_review_count = review_count + 1
        if new_review_count == 1:
            new_interval = 1
        elif new_review_count == 2:
            new_interval = 6
        else:
            new_interval = round(interval_days * new_ef)

    return new_interval, new_ef, new_review_count
