"""Mechanized architecture invariants.

Each test names the invariant it protects — the rule text lives in `.agent/invariants.md`. The
point of putting them in code is that reintroducing a removed shape of the system fails a test
instead of passing review because a reviewer did not remember.
"""

from __future__ import annotations

import pytest

from app.main import app

STATE_CHANGING = {"POST", "PUT", "PATCH", "DELETE"}
VIDEO_PREFIX = "/api/v1/videos"

# State-changing video routes that belong to the *user*, not to content management. They must
# still require a logged-in user (see the second test) — they just do not need admin rights.
# Anything that creates or mutates video content must NOT be listed here.
USER_SIDE_ENGAGEMENT: dict[str, str] = {
    f"{VIDEO_PREFIX}/{{video_id}}/like": "a user's own like",
    f"{VIDEO_PREFIX}/{{video_id}}/favorite": "a user's own favorite",
    f"{VIDEO_PREFIX}/{{video_id}}/unlock": "a user's own unlock record",
    f"{VIDEO_PREFIX}/{{video_id}}/note": "a user's own note on a video (UserNote, scoped by user_id)",
}


def _dependency_names(dependant) -> set[str]:
    names: set[str] = set()
    stack = [dependant]
    while stack:
        dependency = stack.pop()
        name = getattr(dependency.call, "__name__", "")
        if name:
            names.add(name)
        stack.extend(dependency.dependencies)
    return names


def _state_changing_video_routes() -> list[tuple[str, set[str], set[str]]]:
    found = []
    for route in app.routes:
        methods = getattr(route, "methods", set()) & STATE_CHANGING
        path = getattr(route, "path", "")
        if methods and path.startswith(VIDEO_PREFIX):
            found.append((path, methods, _dependency_names(route.dependant)))
    return found


class TestVideoProcessingIsOperatorTriggered:
    """INV-003: video processing is admin/catalog-triggered only — there is no user submit path."""

    def test_state_changing_video_routes_require_admin(self):
        """Every mutation of video content is admin-guarded.

        A new unguarded mutation fails here. If a route is legitimately user-side, add it to
        USER_SIDE_ENGAGEMENT with a reason rather than loosening this test.
        """
        unguarded = [
            (path, sorted(methods))
            for path, methods, dependencies in _state_changing_video_routes()
            if path not in USER_SIDE_ENGAGEMENT and "get_admin_user" not in dependencies
        ]
        assert not unguarded, f"state-changing video routes without admin auth: {unguarded}"

    def test_user_side_video_routes_require_a_logged_in_user(self):
        """The user-side exceptions are still authenticated, not open."""
        unauthenticated = [
            path
            for path, _, dependencies in _state_changing_video_routes()
            if path in USER_SIDE_ENGAGEMENT and "get_current_user" not in dependencies
        ]
        assert not unauthenticated, f"user-side video routes with no auth at all: {unauthenticated}"

    def test_no_bare_post_videos_route(self):
        """`POST /api/v1/videos` was the user submit-URL endpoint — removed in DEC-025."""
        registered = {
            (method, getattr(route, "path", "")) for route in app.routes for method in getattr(route, "methods", set())
        }
        assert ("POST", VIDEO_PREFIX) not in registered

    @pytest.mark.parametrize(
        "fragment",
        ["/upload", "/fork", "/propose", "/begin-edit", "/submit-review", "/user-seed"],
    )
    def test_removed_submission_routes_stay_removed(self, fragment):
        """DEC-025 removed the user submission surface; none of it may reappear."""
        offenders = [getattr(route, "path", "") for route in app.routes if fragment in getattr(route, "path", "")]
        assert not offenders, f"removed '{fragment}' routes reappeared: {offenders}"
