"""The one projector behind every video card the API serves.

Why this file exists
--------------------
The same card was hand-built in four places — ``browse._video_to_dict``,
``ranking_service._serialize``, the inline dict in the favorites endpoint, and
the takedown-candidate list — and the field sets drifted apart. The feed
carried ``description``; rankings dropped it and added ``metric``; favorites
carried ``note_excerpt`` / ``has_note`` / ``favorited_at`` and dropped
``status`` / ``is_official`` / ``video_source`` / ``created_at``. None of that
was a decision — it was four people adding a field where they happened to need
one, so "what does a card contain" had four answers.

Here it has one answer. ``scope`` names the differences that are *real*:

- ``feed``   — list/feed cards (home, browse, rankings, search, unlock list).
  Description truncated, owner-only fields blanked.
- ``card``   — a list card belonging to ``viewer`` (favorites). Same as
  ``feed`` plus the favorite/note annotations that only that list carries.
- ``detail`` — the single-video page. Full description, media URLs gated by
  ``playable``, owner-only fields visible to the owner.

The admin surface is deliberately *not* a scope: it already has one
constructor (``VideoAdminResponse.model_validate``) over a model that is a
superset of ``VideoResponse``, so adding an ``admin`` branch here would be a
second home for the same fact.

Two things this function owns that used to be nobody's job:

- **Description truncation.** ``CARD_DESCRIPTION_LIMIT`` exists so a page of 20
  cards does not balloon on YouTube-sized blurbs; the detail page needs the
  full text. ``scope`` is what tells the two apart.
- **Blanked owner-only fields.** ``error_message`` can name internal pipeline
  paths and ``rejection_reason`` is the operator's note back to a UGC author;
  both are for the owner (and the admin) only. Every card used to *omit* these
  keys, which is why nothing ever had to blank them — now that every card
  carries the full model, the blanking is mandatory rather than incidental.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Literal

from app.schemas.video import CARD_DESCRIPTION_LIMIT, VideoResponse
from app.services.video_access import is_video_owner

if TYPE_CHECKING:
    from datetime import datetime

    from app.models.user import User
    from app.models.video import Video

#: Which surface is asking. See the module docstring for what each one changes.
Scope = Literal["feed", "card", "detail"]

#: Version of the *serialized* card shape — part of every Redis key that stores
#: one (``browse:feed:*``, ``browse:featured:*``, ``rankings:snapshot:*``).
#:
#: Those caches hold plain dicts, and the routes now validate what they read
#: (``response_model=VideoResponse``). A payload written by an older shape is
#: therefore not "slightly stale", it is a **500** — the legacy 17-key rankings
#: snapshot has no ``source_url``, which the model requires. The TTLs do not save
#: us either: a rankings snapshot lives 48h.
#:
#: So the key carries the shape, and an old entry becomes unreachable the moment
#: the shape changes — it just ages out. **Bump this in the same commit as any
#: change to what a card serializes to.** Renaming or adding a key is enough.
#: (Cache invalidation patterns use the family prefix and a trailing ``*``, e.g.
#: ``browse:feed:*``, so the version has to sit after the family, not before it.)
CARD_SHAPE_VERSION = "3"

#: Scopes that show the full description (everything else truncates a card).
_FULL_DESCRIPTION_SCOPES: frozenset[str] = frozenset({"detail"})


def serialize_video_card(
    v: Video,
    *,
    scope: Scope,
    viewer: User | None = None,
    channel_slug: str | None = None,
    channel_cover_url: str | None = None,
    playable: bool = True,
    note: str | None = None,
    favorited_at: datetime | None = None,
    metric: int | None = None,
) -> VideoResponse:
    """Project a ``Video`` row into the card shape for ``scope``.

    ``channel_slug`` / ``channel_cover_url`` are parameters rather than lookups:
    paged callers resolve them for a whole page in one query (see
    ``channel_slug_map``), and a per-row query here would turn a 20-card page
    into 20 queries.

    ``viewer`` decides the owner-only fields. Pass it whenever the caller knows
    who is asking; a caller that omits it gets the blanked form, which is the
    safe default.

    ``playable`` mirrors the detail endpoint's lock/offline rule: when False the
    media URLs are withheld so the client renders a locked or 「已下架」 state
    instead of a player that is guaranteed to 404. The media *route* enforces
    access independently (``api/v1/media.py``), so withholding here is a UX
    choice, not the security boundary.
    """
    card = VideoResponse.model_validate(v)
    card.channel_slug = channel_slug
    card.channel_cover_url = channel_cover_url
    if metric is not None:
        card.metric = metric
    if scope == "card":
        card.note_excerpt = _excerpt(note)
        card.has_note = bool(note)
        card.favorited_at = favorited_at.isoformat() if favorited_at else None

    if scope in _FULL_DESCRIPTION_SCOPES:
        card.description = v.description
    else:
        card.description = v.description[:CARD_DESCRIPTION_LIMIT] if v.description else None

    if playable is False:
        card.video_url_480p = None
        card.video_url_720p = None
        card.video_url_1080p = None

    # Owner-only fields. `scope in _FULL_DESCRIPTION_SCOPES` is not the rule:
    # the detail page shows these to the owner only, so it needs the same check
    # as a card does.
    if not is_video_owner(v, viewer):
        card.rejection_reason = None
        card.error_message = None

    return card


def video_card_payload(v: Video, channel_slug: str | None = None) -> dict:
    """One browse card as a plain dict — the service-level entry point.

    Lives here (not in ``api/v1/browse.py``) so service-layer callers — e.g.
    ``channel_service`` rendering an author page — can build the same card
    without importing the HTTP layer. A service importing ``app.api`` is an
    inverted dependency: it closes an import cycle back to the routes.

    ``channel_slug`` (author page link, ADR-0014 rev.) is passed in by callers
    that resolved the video's channel - keep it a parameter rather than a
    per-row query so paged feeds resolve slugs in one batch.

    Dumped to a dict because callers sit behind ``@cached`` and the payload
    goes straight into Redis as JSON.
    """
    return serialize_video_card(v, scope="feed", channel_slug=channel_slug).model_dump()


def _excerpt(note: str | None, limit: int = 60) -> str | None:
    """The first ``limit`` characters of a note, ellipsised when cut.

    Favorites cards show why a video was saved, not the whole note.
    """
    if not note or not note.strip():
        return None
    return note[:limit] + "…" if len(note) > limit else note
