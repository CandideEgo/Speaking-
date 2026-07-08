"""Tests for Phase 3e — PR propose-back + per-line propagation.

Covers:
- Propose a PR (fork → standard) + admin merge writes the standard body +
  scope="standard" revision.
- Merge propagates to an **unedited** fork → auto-sync + scope="sync" revision,
  no MergeableUpdate.
- Merge propagates to an **edited** fork → line untouched + MergeableUpdate
  marker.
- Apply a MergeableUpdate → fork line syncs to standard's value, marker cleared.
- Withdraw / reject lifecycle.
- Permission gate: owner cannot edit a standard version body directly (403);
  non-owner cannot propose on someone else's fork (403).
"""

from httpx import AsyncClient
from sqlalchemy import select

from app.models.subtitle import Subtitle
from app.models.subtitle_mergeable_update import SubtitleMergeableUpdate
from app.models.subtitle_revision import SubtitleRevision
from app.models.user import User
from app.models.video import Video, VideoReviewStatus, VideoStatus
from app.models.video_standard import VideoStandard


async def _owner_id(db) -> str:
    user = (await db.execute(select(User).where(User.phone == "13800138000"))).scalar_one()
    return user.id


async def _pro_user(db) -> User:
    return (await db.execute(select(User).where(User.phone == "13700137000"))).scalar_one()


async def _make_standard_with_subtitles(db, *, owner_id: str, source_url: str) -> Video:
    v = Video(
        title="Standard",
        source_url=source_url,
        video_source="imported",
        status=VideoStatus.ready,
        is_official=False,
        is_published=False,
        review_status=VideoReviewStatus.draft.value,
        user_id=owner_id,
    )
    db.add(v)
    await db.commit()
    await db.refresh(v)
    for i in range(3):
        db.add(
            Subtitle(
                video_id=v.id,
                start_time=float(i),
                end_time=float(i + 1),
                text_en=f"line {i}",
                text_zh=f"行 {i}",
                sentence_index=i,
            )
        )
    await db.commit()
    db.add(VideoStandard(source_url=v.source_url, canonical_video_id=v.id))
    await db.commit()
    await db.refresh(v)
    return v


async def _make_fork(db, *, standard: Video, owner_user: User) -> Video:
    from app.services.video_seed_service import _fork_video_from

    return await _fork_video_from(db, standard, current_user=owner_user)


async def _sub_id(db, video_id: str, sentence_index: int) -> str:
    sub = (
        await db.execute(
            select(Subtitle).where(Subtitle.video_id == video_id, Subtitle.sentence_index == sentence_index)
        )
    ).scalar_one()
    return sub.id


async def _setup_two_forks(db, url: str, *, pro_user: User):
    """Standard + two forks owned by pro_user: fork1 (edits/proposes), fork2 (passive)."""
    owner = await _owner_id(db)
    standard = await _make_standard_with_subtitles(db, owner_id=owner, source_url=url)
    fork1 = await _make_fork(db, standard=standard, owner_user=pro_user)
    fork2 = await _make_fork(db, standard=standard, owner_user=pro_user)
    return standard, fork1, fork2


class TestProposeAndMerge:
    """PR submission + merge writes the standard body + standard-scope revision."""

    async def test_propose_and_merge_writes_standard(
        self, client: AsyncClient, auth_headers: dict, pro_headers: dict, admin_headers: dict
    ):
        from tests.conftest import TestSessionLocal

        url = "https://www.youtube.com/watch?v=pr_merge_1"
        async with TestSessionLocal() as db:
            owner = await _owner_id(db)
            standard = await _make_standard_with_subtitles(db, owner_id=owner, source_url=url)
            std_id = standard.id
            pro = await _pro_user(db)
            fork = await _make_fork(db, standard=standard, owner_user=pro)
            fork_sub_id = await _sub_id(db, fork.id, 0)

        # Pro edits fork line 0, then proposes.
        await client.patch(
            f"/api/v1/videos/{fork.id}/subtitles/{fork_sub_id}",
            json={"text_zh": "改进"},
            headers=pro_headers,
        )
        resp = await client.post(
            f"/api/v1/videos/{fork.id}/propose",
            json={"title": "Fix line 0", "subtitle_ids": [fork_sub_id]},
            headers=pro_headers,
        )
        assert resp.status_code == 201
        pid = resp.json()["id"]

        # Admin merges.
        resp = await client.post(f"/api/v1/videos/admin/proposals/{pid}/merge", headers=admin_headers)
        assert resp.status_code == 200
        assert resp.json()["status"] == "merged"

        # Standard line 0 now carries fork's value + a scope="standard" revision.
        async with TestSessionLocal() as db:
            std_sub = (
                await db.execute(select(Subtitle).where(Subtitle.video_id == std_id, Subtitle.sentence_index == 0))
            ).scalar_one()
            assert std_sub.text_zh == "改进"
            rev = (
                await db.execute(
                    select(SubtitleRevision).where(
                        SubtitleRevision.subtitle_id == std_sub.id,
                        SubtitleRevision.scope == "standard",
                    )
                )
            ).scalar_one()
            assert rev.after["text_zh"] == "改进"


class TestPropagation:
    """Merge propagates per-line: unedited forks sync, edited forks get a marker."""

    async def test_unedited_fork_auto_syncs(
        self, client: AsyncClient, auth_headers: dict, pro_headers: dict, admin_headers: dict
    ):
        from tests.conftest import TestSessionLocal

        url = "https://www.youtube.com/watch?v=pr_sync_1"
        async with TestSessionLocal() as db:
            pro = await _pro_user(db)
            _, fork1, fork2 = await _setup_two_forks(db, url, pro_user=pro)
            fork1_sub_id = await _sub_id(db, fork1.id, 0)
            fork2_id = fork2.id

        await client.patch(
            f"/api/v1/videos/{fork1.id}/subtitles/{fork1_sub_id}",
            json={"text_zh": "改进"},
            headers=pro_headers,
        )
        pid = (
            await client.post(
                f"/api/v1/videos/{fork1.id}/propose",
                json={"title": "T", "subtitle_ids": [fork1_sub_id]},
                headers=pro_headers,
            )
        ).json()["id"]
        await client.post(f"/api/v1/videos/admin/proposals/{pid}/merge", headers=admin_headers)

        # fork2 (unedited) auto-synced + scope="sync" revision + no marker.
        async with TestSessionLocal() as db:
            fork2_sub = (
                await db.execute(select(Subtitle).where(Subtitle.video_id == fork2_id, Subtitle.sentence_index == 0))
            ).scalar_one()
            assert fork2_sub.text_zh == "改进"
            sync_rev = (
                await db.execute(
                    select(SubtitleRevision).where(
                        SubtitleRevision.subtitle_id == fork2_sub.id,
                        SubtitleRevision.scope == "sync",
                    )
                )
            ).scalar_one()
            assert sync_rev.edited_by is None
            assert sync_rev.after["text_zh"] == "改进"
            mu = (
                await db.execute(
                    select(SubtitleMergeableUpdate).where(SubtitleMergeableUpdate.fork_video_id == fork2_id)
                )
            ).scalar_one_or_none()
            assert mu is None

    async def test_edited_fork_gets_marker(
        self, client: AsyncClient, auth_headers: dict, pro_headers: dict, admin_headers: dict
    ):
        from tests.conftest import TestSessionLocal

        url = "https://www.youtube.com/watch?v=pr_marker_1"
        async with TestSessionLocal() as db:
            pro = await _pro_user(db)
            _, fork1, fork2 = await _setup_two_forks(db, url, pro_user=pro)
            fork1_sub_id = await _sub_id(db, fork1.id, 0)
            fork2_sub_id = await _sub_id(db, fork2.id, 0)
            fork2_id = fork2.id
        await client.patch(
            f"/api/v1/videos/{fork2.id}/subtitles/{fork2_sub_id}",
            json={"text_zh": "fork2自己的"},
            headers=pro_headers,
        )
        # fork1 proposes + admin merges.
        await client.patch(
            f"/api/v1/videos/{fork1.id}/subtitles/{fork1_sub_id}",
            json={"text_zh": "改进"},
            headers=pro_headers,
        )
        pid = (
            await client.post(
                f"/api/v1/videos/{fork1.id}/propose",
                json={"title": "T", "subtitle_ids": [fork1_sub_id]},
                headers=pro_headers,
            )
        ).json()["id"]
        await client.post(f"/api/v1/videos/admin/proposals/{pid}/merge", headers=admin_headers)

        # fork2 line 0 NOT overwritten; a MergeableUpdate marker exists.
        async with TestSessionLocal() as db:
            fork2_sub = (
                await db.execute(select(Subtitle).where(Subtitle.video_id == fork2_id, Subtitle.sentence_index == 0))
            ).scalar_one()
            assert fork2_sub.text_zh == "fork2自己的"  # untouched
            mu = (
                await db.execute(
                    select(SubtitleMergeableUpdate).where(SubtitleMergeableUpdate.fork_video_id == fork2_id)
                )
            ).scalar_one()
            assert mu.fork_subtitle_id == fork2_sub.id


class TestApplyMergeableUpdate:
    """Applying a marker pulls the standard's value onto the fork line."""

    async def test_apply_syncs_and_clears_marker(
        self, client: AsyncClient, auth_headers: dict, pro_headers: dict, admin_headers: dict
    ):
        from tests.conftest import TestSessionLocal

        url = "https://www.youtube.com/watch?v=pr_apply_1"
        async with TestSessionLocal() as db:
            pro = await _pro_user(db)
            _, fork1, fork2 = await _setup_two_forks(db, url, pro_user=pro)
            fork1_sub_id = await _sub_id(db, fork1.id, 0)
            fork2_sub_id = await _sub_id(db, fork2.id, 0)
            fork2_id = fork2.id

        # fork2 edits, fork1 proposes + merges → fork2 gets a marker.
        await client.patch(
            f"/api/v1/videos/{fork2.id}/subtitles/{fork2_sub_id}",
            json={"text_zh": "fork2自己的"},
            headers=pro_headers,
        )
        await client.patch(
            f"/api/v1/videos/{fork1.id}/subtitles/{fork1_sub_id}",
            json={"text_zh": "改进"},
            headers=pro_headers,
        )
        pid = (
            await client.post(
                f"/api/v1/videos/{fork1.id}/propose",
                json={"title": "T", "subtitle_ids": [fork1_sub_id]},
                headers=pro_headers,
            )
        ).json()["id"]
        await client.post(f"/api/v1/videos/admin/proposals/{pid}/merge", headers=admin_headers)

        async with TestSessionLocal() as db:
            mu = (
                await db.execute(
                    select(SubtitleMergeableUpdate).where(SubtitleMergeableUpdate.fork_video_id == fork2_id)
                )
            ).scalar_one()
            mu_id = mu.id

        # Apply the marker.
        resp = await client.post(f"/api/v1/videos/{fork2_id}/mergeable-updates/{mu_id}/apply", headers=pro_headers)
        assert resp.status_code == 200
        assert resp.json()["text_zh"] == "改进"  # standard's value pulled in

        # Marker cleared.
        async with TestSessionLocal() as db:
            mu = (
                await db.execute(
                    select(SubtitleMergeableUpdate).where(SubtitleMergeableUpdate.fork_video_id == fork2_id)
                )
            ).scalar_one_or_none()
            assert mu is None


class TestLifecycle:
    """Withdraw (submitter) + reject (admin)."""

    async def test_withdraw_pending_proposal(self, client: AsyncClient, auth_headers: dict, pro_headers: dict):
        from tests.conftest import TestSessionLocal

        url = "https://www.youtube.com/watch?v=pr_withdraw_1"
        async with TestSessionLocal() as db:
            owner = await _owner_id(db)
            standard = await _make_standard_with_subtitles(db, owner_id=owner, source_url=url)
            pro = await _pro_user(db)
            fork = await _make_fork(db, standard=standard, owner_user=pro)
            fork_sub_id = await _sub_id(db, fork.id, 0)

        await client.patch(
            f"/api/v1/videos/{fork.id}/subtitles/{fork_sub_id}",
            json={"text_zh": "x"},
            headers=pro_headers,
        )
        pid = (
            await client.post(
                f"/api/v1/videos/{fork.id}/propose",
                json={"title": "T", "subtitle_ids": [fork_sub_id]},
                headers=pro_headers,
            )
        ).json()["id"]

        resp = await client.post(f"/api/v1/videos/proposals/{pid}/withdraw", headers=pro_headers)
        assert resp.status_code == 200
        assert resp.json()["status"] == "withdrawn"

    async def test_reject_proposal(
        self, client: AsyncClient, auth_headers: dict, pro_headers: dict, admin_headers: dict
    ):
        from tests.conftest import TestSessionLocal

        url = "https://www.youtube.com/watch?v=pr_reject_1"
        async with TestSessionLocal() as db:
            owner = await _owner_id(db)
            standard = await _make_standard_with_subtitles(db, owner_id=owner, source_url=url)
            pro = await _pro_user(db)
            fork = await _make_fork(db, standard=standard, owner_user=pro)
            fork_sub_id = await _sub_id(db, fork.id, 0)

        await client.patch(
            f"/api/v1/videos/{fork.id}/subtitles/{fork_sub_id}",
            json={"text_zh": "x"},
            headers=pro_headers,
        )
        pid = (
            await client.post(
                f"/api/v1/videos/{fork.id}/propose",
                json={"title": "T", "subtitle_ids": [fork_sub_id]},
                headers=pro_headers,
            )
        ).json()["id"]

        resp = await client.post(
            f"/api/v1/videos/admin/proposals/{pid}/reject",
            json={"reason": "不合适"},
            headers=admin_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "rejected"


class TestPermissionGate:
    """Standard body is admin-only (owner edits → 403); non-owner propose → 403."""

    async def test_owner_cannot_edit_standard_body(self, client: AsyncClient, auth_headers: dict):
        from tests.conftest import TestSessionLocal

        url = "https://www.youtube.com/watch?v=pr_gate_1"
        async with TestSessionLocal() as db:
            owner = await _owner_id(db)
            standard = await _make_standard_with_subtitles(db, owner_id=owner, source_url=url)
            std_sub_id = await _sub_id(db, standard.id, 0)

        # Owner tries the own-subtitle endpoint on their standard-version video.
        resp = await client.patch(
            f"/api/v1/videos/{standard.id}/subtitles/{std_sub_id}",
            json={"text_zh": "x"},
            headers=auth_headers,
        )
        assert resp.status_code == 403

    async def test_non_owner_cannot_propose(self, client: AsyncClient, auth_headers: dict, pro_headers: dict):
        from tests.conftest import TestSessionLocal

        url = "https://www.youtube.com/watch?v=pr_gate_2"
        async with TestSessionLocal() as db:
            owner = await _owner_id(db)
            standard = await _make_standard_with_subtitles(db, owner_id=owner, source_url=url)
            pro = await _pro_user(db)
            fork = await _make_fork(db, standard=standard, owner_user=pro)  # pro owns fork
            fork_sub_id = await _sub_id(db, fork.id, 0)

        # auth_headers (test user) tries to propose on pro's fork.
        resp = await client.post(
            f"/api/v1/videos/{fork.id}/propose",
            json={"title": "T", "subtitle_ids": [fork_sub_id]},
            headers=auth_headers,
        )
        assert resp.status_code == 403
