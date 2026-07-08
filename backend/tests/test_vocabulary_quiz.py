"""Tests for vocabulary quiz scoring.

The old ``submit_quiz`` function has been removed — quiz functionality is now
unified into ``practice_service.build_vocabulary_drill`` and
``practice_service.submit_practice_results``.  The skip-prevention rule is
tested via the practice submit endpoint instead.
"""
