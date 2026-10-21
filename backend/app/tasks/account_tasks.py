"""Account lifecycle tasks (P1-7): async data export + 30-day deletion purge.

Two families:

- ``build_user_export`` — assemble a ZIP for one ``DataExportTask``: structured
  JSON + CSV for profile / vocabulary / shadowing / learning records /
  notification preferences / behavior events, plus the original avatar and
  shadowing audio files. On success the user gets an in-app notification with a
  link back to the export page; failures retry a bounded number of times and
  notify the user once they give up.
- ``purge_deleted_accounts`` — daily sweep for accounts whose 30-day window
  elapsed. Deletes personal data and user-generated media (avatar, shadowing
  recordings, uploaded video media), anonymizes ``behavior_events`` by nulling
  ``user_id`` (kept for aggregate stats), then deletes the user row — which is
  the moment the phone number is released (封禁/试用绕过防线靠它维持整个冷静期).

Both tasks open their own sessions via ``async_session`` so they run on the
shared celery-asyncio loop (``run_async``). Task bodies accept an optional
aware-UTC ``now`` as a test seam.
"""

import csv
import io
import json
import uuid
from datetime import UTC, date, datetime
from pathlib import Path

import structlog

from app.tasks.async_helpers import run_async
from app.tasks.celery_app import celery_app

logger = structlog.get_logger()


def _media_root() -> Path:
    from app.core.config import get_settings

    return Path(get_settings().local_media_path).resolve()


def _resolve_media(url: str | None) -> Path | None:
    """Map a stored ``/media/...`` URL to an on-disk path inside the media root.

    Returns None for empty URLs or paths that resolve outside the media root
    (defensive — media URLs are server-written, but this must never read an
    arbitrary path).
    """
    if not url or not url.startswith("/media/"):
        return None
    base = _media_root()
    candidate = (base / url[len("/media/") :]).resolve()
    try:
        candidate.relative_to(base)
    except ValueError:
        return None
    return candidate if candidate.is_file() else None


def _iso(value: datetime | date | None) -> str | None:
    """ISO-8601 字符串；``None`` 原样返回。

    调用点全是 ``Mapped[datetime]`` / ``Mapped[datetime | None]`` 的时间列，
    所以这里把参数标成真正的类型，``value.isoformat()`` 就不再是 ``Any``
    （原先参数没标注类型，才需要 ``hasattr``/``str()`` 兜底）。
    """
    if value is None:
        return None
    return value.isoformat()


def _csv_bytes(rows: list[dict]) -> bytes:
    """Serialize rows to a BOM-prefixed UTF-8 CSV (Excel-friendly Chinese)."""
    if not rows:
        return "\ufeff".encode()
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=list(rows[0].keys()))
    writer.writeheader()
    for row in rows:
        writer.writerow({k: ("" if v is None else v) for k, v in row.items()})
    return buf.getvalue().encode("utf-8")


def _json_bytes(value) -> bytes:
    return json.dumps(value, ensure_ascii=False, indent=2, default=str).encode("utf-8")


async def _gather_export(db, user) -> dict:
    """Collect every dataset for the archive. Read-only."""
    from sqlalchemy import select

    from app.models.behavior import BehaviorEvent
    from app.models.learning import LearningRecord, SpeakingAttempt, Vocabulary
    from app.models.preferences import DEFAULT_NOTIFICATION_PREFS, UserPreferences
    from app.models.shadowing import ShadowingAttempt

    vocabulary = (
        (
            await db.execute(
                select(Vocabulary).where(Vocabulary.user_id == user.id).order_by(Vocabulary.created_at.asc())
            )
        )
        .scalars()
        .all()
    )
    shadowing = (
        (
            await db.execute(
                select(ShadowingAttempt)
                .where(ShadowingAttempt.user_id == user.id)
                .order_by(ShadowingAttempt.created_at.asc())
            )
        )
        .scalars()
        .all()
    )
    learning_records = (
        (
            await db.execute(
                select(LearningRecord)
                .where(LearningRecord.user_id == user.id)
                .order_by(LearningRecord.created_at.asc())
            )
        )
        .scalars()
        .all()
    )
    # Frozen speaking attempts are still the user's data if any exist historically.
    speaking_attempts = (
        (await db.execute(select(SpeakingAttempt).where(SpeakingAttempt.user_id == user.id))).scalars().all()
    )
    behavior_events = (
        (
            await db.execute(
                select(BehaviorEvent).where(BehaviorEvent.user_id == user.id).order_by(BehaviorEvent.server_ts.asc())
            )
        )
        .scalars()
        .all()
    )
    prefs = (await db.execute(select(UserPreferences).where(UserPreferences.user_id == user.id))).scalar_one_or_none()

    notification_prefs = DEFAULT_NOTIFICATION_PREFS.copy()
    if prefs is not None and isinstance(prefs.notification_preferences, dict):
        notification_prefs.update(prefs.notification_preferences)

    return {
        "vocabulary": vocabulary,
        "shadowing": shadowing,
        "learning_records": learning_records,
        "speaking_attempts": speaking_attempts,
        "behavior_events": behavior_events,
        "notification_preferences": {
            "notification_preferences": notification_prefs,
            "daily_goal_type": prefs.daily_goal_type if prefs else None,
            "daily_goal_value": prefs.daily_goal_value if prefs else None,
            "reminder_enabled": prefs.reminder_enabled if prefs else None,
            "reminder_time": prefs.reminder_time if prefs else None,
            "reminder_timezone": prefs.reminder_timezone if prefs else None,
        },
    }


async def _build_export(task_id: str) -> dict:
    """Build the ZIP for one export task. Raises on any failure (caller retries)."""
    import zipfile

    from sqlalchemy import select

    from app.core.database import async_session
    from app.models.data_export import DataExportTask
    from app.models.user import User

    async with async_session() as db:
        task = await db.get(DataExportTask, task_id)
        if task is None:
            logger.warning("build_user_export_missing_task", task_id=task_id)
            return {"status": "missing"}
        task.status = "running"
        await db.commit()

        user = await db.get(User, task.user_id)
        if user is None:
            task.status = "failed"
            task.error = "用户不存在"
            await db.commit()
            return {"status": "failed"}

        data = await _gather_export(db, user)

        profile = {
            "id": user.id,
            "phone": user.phone,
            "name": user.name,
            "level": user.level,
            "plan": user.plan.value if hasattr(user.plan, "value") else user.plan,
            "plan_expires_at": _iso(user.plan_expires_at),
            "plan_source": user.plan_source,
            "role": user.role.value if hasattr(user.role, "value") else user.role,
            "onboarding_completed": user.onboarding_completed,
            "native_language": user.native_language,
            "gender": user.gender,
            "bio": user.bio,
            "timezone": user.timezone,
            "avatar_url": user.avatar_url,
            "created_at": _iso(user.created_at),
            "last_active_at": _iso(user.last_active_at),
        }
        vocab_rows = [
            {
                "word": v.word,
                "translation": v.translation,
                "definition": v.definition,
                "part_of_speech": v.part_of_speech,
                "ipa": v.ipa,
                "mastery_level": v.mastery_level,
                "exam_level": v.exam_level,
                "review_count": v.review_count,
                "correct_count": v.correct_count,
                "wrong_count": v.wrong_count,
                "next_review_at": _iso(v.next_review_at),
                "first_seen_at": _iso(v.first_seen_at),
                "created_at": _iso(v.created_at),
            }
            for v in data["vocabulary"]
        ]
        shadow_rows = [
            {
                "id": s.id,
                "video_id": s.video_id,
                "subtitle_id": s.subtitle_id,
                "audio_url": s.audio_url,
                "duration_ms": s.duration_ms,
                "is_satisfied": s.is_satisfied,
                "created_at": _iso(s.created_at),
            }
            for s in data["shadowing"]
        ]
        record_rows = [
            {
                "id": r.id,
                "video_id": r.video_id,
                "words_learned": r.words_learned,
                "quiz_score": r.quiz_score,
                "completed": r.completed,
                "time_spent_seconds": r.time_spent_seconds,
                "progress_percentage": r.progress_percentage,
                "created_at": _iso(r.created_at),
            }
            for r in data["learning_records"]
        ]
        behavior_rows = [
            {
                "id": e.id,
                "event_type": e.event_type,
                "video_id": e.video_id,
                "client_ts": e.client_ts,
                "server_ts": _iso(e.server_ts),
                "event_payload": json.dumps(e.event_payload, ensure_ascii=False) if e.event_payload else None,
            }
            for e in data["behavior_events"]
        ]

        out_dir = _media_root() / "exports" / user.id
        out_dir.mkdir(parents=True, exist_ok=True)
        zip_path = out_dir / f"{task.id}.zip"

        with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
            zf.writestr("profile.json", _json_bytes(profile))
            zf.writestr("vocabulary.json", _json_bytes(vocab_rows))
            zf.writestr("vocabulary.csv", _csv_bytes(vocab_rows))
            zf.writestr("shadowing.json", _json_bytes(shadow_rows))
            zf.writestr("shadowing.csv", _csv_bytes(shadow_rows))
            zf.writestr("learning_records.json", _json_bytes(record_rows))
            zf.writestr("learning_records.csv", _csv_bytes(record_rows))
            zf.writestr("notification_preferences.json", _json_bytes(data["notification_preferences"]))
            zf.writestr("behavior_events.json", _json_bytes(behavior_rows))
            zf.writestr("behavior_events.csv", _csv_bytes(behavior_rows))
            zf.writestr(
                "README.txt",
                "SeeWord 数据导出包。\n"
                "包含个人资料、词汇、跟读记录、学习记录、通知偏好与行为事件；\n"
                "media/ 目录下为头像与跟读录音原件。\n",
            )

            # Media originals: avatar + shadowing recordings (stored by URL).
            avatar_path = _resolve_media(user.avatar_url)
            if avatar_path is not None:
                zf.write(avatar_path, f"media/avatar/{avatar_path.name}")
            for s in data["shadowing"]:
                audio_path = _resolve_media(s.audio_url)
                if audio_path is not None:
                    zf.write(audio_path, f"media/shadowing/{audio_path.name}")

        size = zip_path.stat().st_size
        # Relative to the media root — the download endpoint joins it back.
        task.file_path = str(zip_path.relative_to(_media_root()))
        task.size_bytes = size
        task.status = "ready"
        task.error = None
        await db.commit()

        from app.services.notification_service import create_notification

        await create_notification(
            user_id=user.id,
            type="system",
            title="数据导出已完成",
            message="你的数据导出包已就绪，可在「我的 → 账号安全」下载（链接 15 分钟内有效）。",
            db=db,
            related_url="/profile?tab=settings",
        )
        await db.commit()
        logger.info("data_export_ready", export_task_id=task.id, size_bytes=size)
        return {"status": "ready", "size_bytes": size}


async def _mark_export_failure(task_id: str, error: str, *, final: bool) -> None:
    from app.core.database import async_session
    from app.models.data_export import DataExportTask

    async with async_session() as db:
        task = await db.get(DataExportTask, task_id)
        if task is None:
            return
        task.attempts = (task.attempts or 0) + 1
        task.error = error[:2000]
        if final:
            task.status = "failed"
        await db.commit()
        if final:
            from app.services.notification_service import create_notification

            await create_notification(
                user_id=task.user_id,
                type="system",
                title="数据导出失败",
                message="导出多次尝试后仍未成功，请稍后在「我的 → 账号安全」重试。",
                db=db,
                related_url="/profile?tab=settings",
            )
            await db.commit()


@celery_app.task(bind=True, max_retries=3, default_retry_delay=30)
def build_user_export(self, task_id: str):
    """Celery entry point for the async export (retries a few times)."""
    try:
        return run_async(_build_export(task_id))
    except Exception as exc:  # retry/notify boundary
        final = self.request.retries >= self.max_retries
        logger.exception("build_user_export_failed", export_task_id=task_id, final=final)
        run_async(_mark_export_failure(task_id, str(exc), final=final))
        if not final:
            raise self.retry(exc=exc) from exc
        return {"status": "failed"}


# ── 30-day deletion purge ───────────────────────────────────────────

# Files whose names are derived from the user id itself (the shadowing folder),
# plus the fixed per-user subtrees we always clear.
_USER_MEDIA_SUBDIRS = ("exports",)


async def _purge_user(db, user) -> None:
    """Delete one expired account's data; anonymize behavior events."""
    from sqlalchemy import delete as sa_delete
    from sqlalchemy import select
    from sqlalchemy import update as sa_update

    from app.core.database import Base
    from app.models.behavior import BehaviorEvent
    from app.models.data_export import DataExportTask
    from app.models.shadowing import ShadowingAttempt
    from app.models.user import User as UserModel

    # 1. Collect media to delete before the rows go away.
    media_paths: list[Path] = []
    avatar_path = _resolve_media(user.avatar_url)
    if avatar_path is not None:
        media_paths.append(avatar_path)
    shadow_urls = (
        (await db.execute(select(ShadowingAttempt.audio_url).where(ShadowingAttempt.user_id == user.id)))
        .scalars()
        .all()
    )
    for url in shadow_urls:
        p = _resolve_media(url)
        if p is not None:
            media_paths.append(p)
    export_paths = [
        _media_root() / fp
        for fp in (
            (await db.execute(select(DataExportTask.file_path).where(DataExportTask.user_id == user.id)))
            .scalars()
            .all()
        )
        if fp
    ]

    # 2. Anonymize behavior events — they must survive as aggregate stats.
    await db.execute(sa_update(BehaviorEvent).where(BehaviorEvent.user_id == user.id).values(user_id=None))

    # 3. Delete every user-scoped table, children before parents. Metadata's
    #    topological order guarantees a FK-safe reverse walk for the tables that
    #    carry a ``user_id`` pointing at ``users.id``; DB-level ON DELETE
    #    CASCADE cover nested rows (vocab_set_words, plan items, …) on Postgres.
    user_scoped = [
        t
        for t in Base.metadata.sorted_tables
        if t.name != "users"
        and "user_id" in t.columns
        and any(fk.target_fullname == "users.id" for fk in t.columns["user_id"].foreign_keys)
    ]
    for table in reversed(user_scoped):
        await db.execute(sa_delete(table).where(table.columns["user_id"] == user.id))

    # 4. Delete the user row — this is where the phone number is released.
    #    用映射类本身（而不是 ``UserModel.__table__``）：SQLAlchemy 2.0 里
    #    ``delete(实体)`` 是正规写法，且生成的 SQL 与 Core 写法一致
    #    （``DELETE FROM users WHERE users.id = ?``），而 ``__table__`` 的静态
    #    类型是 ``FromClause``（为 join 继承准备），传给 ``delete()`` 就不被接受。
    await db.execute(sa_delete(UserModel).where(UserModel.id == user.id))
    await db.commit()

    # 5. Best-effort media + export ZIP cleanup, then the per-user directory.
    for path in [*media_paths, *export_paths]:
        try:
            path.unlink(missing_ok=True)
        except OSError:
            logger.warning("account_purge_media_unlink_failed", path=str(path))
    for subdir in _USER_MEDIA_SUBDIRS:
        _rmtree(_media_root() / subdir / user.id)
    _rmtree(_media_root() / "shadowing" / user.id)
    logger.info("account_purged", user_id=user.id, media_files=len(media_paths))


def _rmtree(path: Path) -> None:
    import shutil

    try:
        base = _media_root()
        resolved = path.resolve()
        resolved.relative_to(base)
    except (ValueError, OSError):
        return
    if resolved.is_dir():
        shutil.rmtree(resolved, ignore_errors=True)


async def _purge_due(now: datetime | None = None) -> int:
    from sqlalchemy import select

    from app.core.database import async_session
    from app.models.user import User

    now_utc = now or datetime.now(UTC)
    purged = 0
    async with async_session() as db:
        users = (
            (
                await db.execute(
                    select(User).where(
                        User.deletion_scheduled_at.is_not(None),
                        User.deletion_scheduled_at <= now_utc,
                    )
                )
            )
            .scalars()
            .all()
        )
        for user in users:
            try:
                await _purge_user(db, user)
                purged += 1
            except Exception:
                await db.rollback()
                logger.exception("account_purge_failed", user_id=user.id)
    return purged


@celery_app.task
def purge_deleted_accounts(now: datetime | None = None):
    """Daily sweep: finalize every account whose 30-day window has elapsed."""
    try:
        return run_async(_purge_due(now))
    except Exception:
        logger.exception("purge_deleted_accounts failed")
        return 0
