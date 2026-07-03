"""Proposal service — PR propose-back flow + per-line propagation.

Fork holders propose subtitle edits back to the URL's standard version (决议 1).
Admins merge/reject; submitters withdraw (决议 8). On merge, changes are written
to the standard body line-by-line (writing ``scope="standard"`` SubtitleRevisions),
then propagated to direct forks: unedited lines auto-sync (``scope="sync"``
revision), edited lines get a SubtitleMergeableUpdate marker (决议 2).

v1: propagation flows only to direct forks (``forked_from = standard``); fork-of-
fork uses the manual mergeable-update apply endpoint. Sync (non-Celery) — fine
while fork counts are small.
"""

from datetime import UTC, datetime

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import commit_refresh
from app.models.subtitle import Subtitle
from app.models.subtitle_change_proposal import SubtitleChangeProposal
from app.models.subtitle_mergeable_update import SubtitleMergeableUpdate
from app.models.subtitle_revision import SubtitleRevision
from app.models.video import Video, VideoStatus
from app.services.subtitle_edit_service import AUDITED_FIELDS, _snapshot, _write_revision

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _load_owned_video(db: AsyncSession, video_id: str, *, user_id: str) -> Video:
    result = await db.execute(select(Video).where(Video.id == video_id))
    video = result.scalar_one_or_none()
    if video is None:
        raise ValueError("Video not found")
    if video.user_id != user_id:
        raise ValueError("Not the video owner")
    return video


async def _load_subtitles_by_index(db: AsyncSession, video_id: str) -> dict[int, Subtitle]:
    result = await db.execute(select(Subtitle).where(Subtitle.video_id == video_id).order_by(Subtitle.sentence_index))
    return {s.sentence_index: s for s in result.scalars().all()}


def _proposal_to_dict(p: SubtitleChangeProposal) -> dict:
    return {
        "id": p.id,
        "standard_video_id": p.standard_video_id,
        "source_url": p.source_url,
        "submitted_by": p.submitted_by,
        "title": p.title,
        "body": p.body,
        "changes": p.changes,
        "status": p.status,
        "reviewed_by": p.reviewed_by,
        "reviewed_at": p.reviewed_at.isoformat() if p.reviewed_at else None,
        "rejection_reason": p.rejection_reason,
        "merged_at": p.merged_at.isoformat() if p.merged_at else None,
        "created_at": p.created_at.isoformat() if p.created_at else None,
    }


def _mergeable_to_dict(m: SubtitleMergeableUpdate) -> dict:
    return {
        "id": m.id,
        "fork_video_id": m.fork_video_id,
        "fork_subtitle_id": m.fork_subtitle_id,
        "sentence_index": m.sentence_index,
        "standard_revision_id": m.standard_revision_id,
        "proposal_id": m.proposal_id,
        "created_at": m.created_at.isoformat() if m.created_at else None,
    }


# ---------------------------------------------------------------------------
# PR submit / merge / reject / withdraw
# ---------------------------------------------------------------------------


async def propose_subtitle_changes(
    db: AsyncSession,
    fork_video_id: str,
    *,
    title: str,
    body: str | None,
    subtitle_ids: list[str],
    submitted_by: str,
) -> SubtitleChangeProposal:
    """Submit a PR proposing the fork's edits back to the standard body.

    For each ``subtitle_id``, diffs the fork's current value against the
    standard's same-``sentence_index`` value and keeps only fields that differ.
    ``before`` is the standard's current value, ``after`` is the fork's value.
    """
    fork = await _load_owned_video(db, fork_video_id, user_id=submitted_by)
    if fork.forked_from is None:
        raise ValueError("Video is not a fork — only forks can propose changes back")

    from app.services.video_seed_service import _find_standard_for_url

    standard = await _find_standard_for_url(db, fork.source_url)
    if standard is None:
        raise ValueError("No standard version exists for this URL yet")

    fork_result = await db.execute(
        select(Subtitle).where(Subtitle.id.in_(subtitle_ids), Subtitle.video_id == fork_video_id)
    )
    fork_subs = {s.id: s for s in fork_result.scalars().all()}
    if len(fork_subs) != len(subtitle_ids):
        raise ValueError("Some subtitles not found in this video")

    std_by_index = await _load_subtitles_by_index(db, standard.id)

    changes = []
    for sid in subtitle_ids:
        fork_sub = fork_subs[sid]
        std_sub = std_by_index.get(fork_sub.sentence_index)
        if std_sub is None:
            continue  # standard no longer has this line; skip
        before = {}
        after = {}
        for field in AUDITED_FIELDS:
            f_val = getattr(fork_sub, field)
            s_val = getattr(std_sub, field)
            if f_val != s_val:
                before[field] = s_val
                after[field] = f_val
        if before:
            changes.append({"sentence_index": fork_sub.sentence_index, "before": before, "after": after})

    if not changes:
        raise ValueError("No changes to propose — fork matches standard on all selected lines")

    proposal = SubtitleChangeProposal(
        standard_video_id=standard.id,
        source_url=fork.source_url,
        submitted_by=submitted_by,
        title=title,
        body=body,
        changes=changes,
        status="pending",
    )
    db.add(proposal)
    await commit_refresh(db, proposal)
    return proposal


async def merge_proposal(db: AsyncSession, proposal_id: str, *, reviewed_by: str) -> SubtitleChangeProposal:
    """Merge a PR: write changes to the standard body, then propagate to forks."""
    result = await db.execute(select(SubtitleChangeProposal).where(SubtitleChangeProposal.id == proposal_id))
    proposal = result.scalar_one_or_none()
    if proposal is None:
        raise ValueError("Proposal not found")
    if proposal.status != "pending":
        raise ValueError(f"Proposal is not pending (current: {proposal.status})")

    std_result = await db.execute(select(Video).where(Video.id == proposal.standard_video_id))
    standard = std_result.scalar_one_or_none()
    if standard is None:
        raise ValueError("Standard video not found")

    std_by_index = await _load_subtitles_by_index(db, standard.id)

    merged_changes = []
    for change in proposal.changes:
        std_sub = std_by_index.get(change["sentence_index"])
        if std_sub is None:
            continue  # line gone from standard; skip
        before_snap = _snapshot(std_sub)
        for field, new_value in change["after"].items():
            setattr(std_sub, field, new_value)
        after_snap = _snapshot(std_sub)
        await _write_revision(db, std_sub, before_snap, after_snap, edited_by=reviewed_by, scope="standard")
        merged_changes.append(change)

    await db.commit()

    # Propagate to direct forks (forked_from = standard).
    await _propagate_to_forks(db, standard, merged_changes, proposal.id)

    now = datetime.now(UTC)
    proposal.status = "merged"
    proposal.reviewed_by = reviewed_by
    proposal.reviewed_at = now
    proposal.merged_at = now
    await commit_refresh(db, proposal)
    return proposal


async def reject_proposal(
    db: AsyncSession, proposal_id: str, *, reviewed_by: str, reason: str
) -> SubtitleChangeProposal:
    result = await db.execute(select(SubtitleChangeProposal).where(SubtitleChangeProposal.id == proposal_id))
    proposal = result.scalar_one_or_none()
    if proposal is None:
        raise ValueError("Proposal not found")
    if proposal.status != "pending":
        raise ValueError(f"Proposal is not pending (current: {proposal.status})")
    proposal.status = "rejected"
    proposal.reviewed_by = reviewed_by
    proposal.reviewed_at = datetime.now(UTC)
    proposal.rejection_reason = reason
    await commit_refresh(db, proposal)
    return proposal


async def withdraw_proposal(db: AsyncSession, proposal_id: str, *, submitted_by: str) -> SubtitleChangeProposal:
    result = await db.execute(select(SubtitleChangeProposal).where(SubtitleChangeProposal.id == proposal_id))
    proposal = result.scalar_one_or_none()
    if proposal is None:
        raise ValueError("Proposal not found")
    if proposal.submitted_by != submitted_by:
        raise ValueError("Only the submitter can withdraw a proposal")
    if proposal.status != "pending":
        raise ValueError(f"Only pending proposals can be withdrawn (current: {proposal.status})")
    proposal.status = "withdrawn"
    await commit_refresh(db, proposal)
    return proposal


# ---------------------------------------------------------------------------
# Propagation (决议 2 — per-line)
# ---------------------------------------------------------------------------


async def _propagate_to_forks(db: AsyncSession, standard: Video, merged_changes: list[dict], proposal_id: str) -> None:
    """Flow a merged PR's changes to direct forks.

    For each fork (``forked_from = standard``), for each merged line:
    - if the fork has NO ``scope="fork"`` revision on that line → auto-sync the
      new value and write a ``scope="sync"`` revision;
    - else → upsert a SubtitleMergeableUpdate marker (owner decides later).
    """
    forks_result = await db.execute(
        select(Video).where(Video.forked_from == standard.id, Video.status == VideoStatus.ready)
    )
    forks = forks_result.scalars().all()
    if not forks:
        return

    std_by_index = await _load_subtitles_by_index(db, standard.id)

    for fork in forks:
        fork_by_index = await _load_subtitles_by_index(db, fork.id)
        for change in merged_changes:
            fork_sub = fork_by_index.get(change["sentence_index"])
            if fork_sub is None:
                continue
            std_sub = std_by_index.get(change["sentence_index"])
            if std_sub is None:
                continue

            user_edit_result = await db.execute(
                select(SubtitleRevision)
                .where(
                    SubtitleRevision.subtitle_id == fork_sub.id,
                    SubtitleRevision.scope == "fork",
                )
                .limit(1)
            )
            has_user_edit = user_edit_result.scalar_one_or_none() is not None

            if not has_user_edit:
                # Auto-sync: apply the standard's new values to the fork line.
                before_snap = _snapshot(fork_sub)
                for field, new_value in change["after"].items():
                    setattr(fork_sub, field, new_value)
                after_snap = _snapshot(fork_sub)
                await _write_revision(db, fork_sub, before_snap, after_snap, edited_by=None, scope="sync")
            else:
                # Marker: find the standard-scope revision just written for this line.
                std_rev_result = await db.execute(
                    select(SubtitleRevision)
                    .where(
                        SubtitleRevision.subtitle_id == std_sub.id,
                        SubtitleRevision.scope == "standard",
                    )
                    .order_by(SubtitleRevision.created_at.desc())
                    .limit(1)
                )
                std_rev = std_rev_result.scalar_one_or_none()
                if std_rev is None:
                    continue
                # Upsert: replace any existing marker for this fork subtitle.
                await db.execute(
                    delete(SubtitleMergeableUpdate).where(SubtitleMergeableUpdate.fork_subtitle_id == fork_sub.id)
                )
                db.add(
                    SubtitleMergeableUpdate(
                        fork_video_id=fork.id,
                        fork_subtitle_id=fork_sub.id,
                        sentence_index=fork_sub.sentence_index,
                        standard_revision_id=std_rev.id,
                        proposal_id=proposal_id,
                    )
                )
        await db.commit()


# ---------------------------------------------------------------------------
# Listing + mergeable updates
# ---------------------------------------------------------------------------


async def list_proposals(
    db: AsyncSession,
    *,
    status: str | None = None,
    submitted_by: str | None = None,
    standard_video_id: str | None = None,
    page: int = 1,
    page_size: int = 50,
) -> dict:
    page = max(1, page)
    page_size = max(1, min(page_size, 200))
    offset = (page - 1) * page_size

    stmt = select(SubtitleChangeProposal)
    if status:
        stmt = stmt.where(SubtitleChangeProposal.status == status)
    if submitted_by:
        stmt = stmt.where(SubtitleChangeProposal.submitted_by == submitted_by)
    if standard_video_id:
        stmt = stmt.where(SubtitleChangeProposal.standard_video_id == standard_video_id)
    stmt = stmt.order_by(SubtitleChangeProposal.created_at.desc()).offset(offset).limit(page_size + 1)

    result = await db.execute(stmt)
    rows = result.scalars().all()
    has_more = len(rows) > page_size
    items = rows[:page_size]
    return {"items": [_proposal_to_dict(p) for p in items], "has_more": has_more}


async def list_mergeable_updates(db: AsyncSession, fork_video_id: str) -> list[dict]:
    result = await db.execute(
        select(SubtitleMergeableUpdate).where(SubtitleMergeableUpdate.fork_video_id == fork_video_id)
    )
    return [_mergeable_to_dict(m) for m in result.scalars().all()]


async def apply_mergeable_update(db: AsyncSession, fork_video_id: str, update_id: str, *, user_id: str) -> Subtitle:
    """Apply one mergeable update: pull the standard's value onto the fork line.

    Writes a ``scope="sync"`` revision (so the line still doesn't count as
    user-edited for future propagation) and clears the marker.
    """
    await _load_owned_video(db, fork_video_id, user_id=user_id)

    result = await db.execute(
        select(SubtitleMergeableUpdate).where(
            SubtitleMergeableUpdate.id == update_id,
            SubtitleMergeableUpdate.fork_video_id == fork_video_id,
        )
    )
    update = result.scalar_one_or_none()
    if update is None:
        raise ValueError("Mergeable update not found")

    rev_result = await db.execute(select(SubtitleRevision).where(SubtitleRevision.id == update.standard_revision_id))
    rev = rev_result.scalar_one_or_none()
    if rev is None:
        raise ValueError("Standard revision not found")

    sub_result = await db.execute(select(Subtitle).where(Subtitle.id == update.fork_subtitle_id))
    fork_sub = sub_result.scalar_one_or_none()
    if fork_sub is None:
        raise ValueError("Subtitle not found")

    before_snap = _snapshot(fork_sub)
    for field, new_value in rev.after.items():
        setattr(fork_sub, field, new_value)
    after_snap = _snapshot(fork_sub)
    # scope="sync" — user pulled the standard's value, not a free-form edit, so
    # this line still doesn't count as "动过" for future propagation.
    await _write_revision(db, fork_sub, before_snap, after_snap, edited_by=user_id, scope="sync")

    await db.execute(delete(SubtitleMergeableUpdate).where(SubtitleMergeableUpdate.id == update_id))
    await commit_refresh(db, fork_sub)
    return fork_sub
