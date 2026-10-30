"""Account lifecycle tasks (P1-7 / A08): async data export + 30-day deletion purge.

Two families:

- ``build_user_export`` — assemble a ZIP for one ``DataExportTask``. The
  dataset inventory lives in :mod:`app.services.account_data` so it can be
  tested independently of Celery; it covers profile / preferences / vocabulary /
  learning records+events+profile / favorites / notes / sentence favorites /
  channel subscriptions / likes / unlocks / vocab sets / study sessions /
  listening attempts / exam attempts+answers / orders / payment ledger /
  notifications / feedback / mastery+milestone history / behavior events /
  uploaded videos, plus the on-disk originals (avatar, uploaded video files,
  historical shadowing audio). Failures retry a bounded number of times and
  notify the user once they give up.
- ``purge_deleted_accounts`` — daily sweep for accounts whose 30-day window
  elapsed. Deletes personal data, keeps official catalog videos, anonymizes
  behavior events and the external payment ledger, then deletes the user row
  (the moment the phone number is released). Disk cleanup is recorded in
  ``media_cleanup_tasks`` inside the same transaction and drained afterwards;
  ``retry_media_cleanup`` (beat, every 15 minutes) retries anything that failed,
  so a locked file cannot become a permanent leak.

Both tasks open their own sessions via ``async_session`` so they run on the
shared celery-asyncio loop (``run_async``). Task bodies accept an optional
aware-UTC ``now`` as a test seam.
"""

import csv
import io
import json
from datetime import UTC, datetime
from pathlib import Path

import structlog

from app.services import account_data
from app.tasks.async_helpers import run_async
from app.tasks.celery_app import celery_app

logger = structlog.get_logger()


def _csv_bytes(rows: list[dict]) -> bytes:
    """Serialize rows to a BOM-prefixed UTF-8 CSV (Excel-friendly Chinese)."""
    if not rows:
        return "﻿".encode()
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=list(rows[0].keys()))
    writer.writeheader()
    for row in rows:
        writer.writerow(
            {
                key: (
                    ""
                    if value is None
                    else json.dumps(value, ensure_ascii=False)
                    if isinstance(value, (dict, list))
                    else value
                )
                for key, value in row.items()
            }
        )
    return buf.getvalue().encode("utf-8")


def _json_bytes(value) -> bytes:
    return json.dumps(value, ensure_ascii=False, indent=2, default=str).encode("utf-8")


_README = """SeeWord 数据导出包
=================

本包包含你在 SeeWord 的账号数据：
  profile.json                 账号资料（不含密码哈希）
  preferences.json             学习与通知偏好
  learning_profile.json        学习档案与连续天数
  vocabulary.*                 单词本
  learning_records.*           视频学习记录
  learning_events.*            学习事件（完成视频、学词、练习等）
  vocab_sets.json              词汇集与每个词的过筛状态
  study_sessions.json          词汇训练轮次与每题状态
  favorites.* / notes.*        收藏与笔记
  sentence_favorites.json      句子收藏
  channel_subscriptions.json   频道订阅
  video_likes.json / video_unlocks.json  点赞与解锁记录
  listening_sessions.*         听力练习与判分结果
  exam_sessions.json           试卷作答（含逐题快照与你的答案）
  videos.json                  你上传的视频元数据
  orders.*                     站内订单
  payments.json                站外收款记录（不含第三方原始表单内容）
  notifications.*              站内通知
  feedbacks.*                  你提交的反馈
  mastery_snapshots.json       掌握度历史快照
  user_milestones.json         成就记录
  behavior_events.*            观看与操作行为事件
  media/                       头像、上传视频文件与历史跟读音频原件

说明：
- 导出由账号本人发起，只包含该账号自己的数据。
- 手机号与账号标识属于账号资料；金数据付款记录只导出金额、档位、状态与
  交易号，不包含第三方表单原始内容。
- 下载链接一次性、15 分钟内有效。
"""


async def _build_export(task_id: str) -> dict:
    """Build the ZIP for one export task. Raises on any failure (caller retries)."""
    import zipfile

    from app.core.config import get_settings
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

        data, media_entries = await account_data.gather_export(db, user)

        media_root = Path(get_settings().local_media_path).resolve()
        out_dir = media_root / "exports" / user.id
        out_dir.mkdir(parents=True, exist_ok=True)
        zip_path = out_dir / f"{task.id}.zip"

        with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
            for key in account_data.EXPORT_ORDER:
                payload = data.get(key)
                zf.writestr(f"{key}.json", _json_bytes(payload))
                if key in account_data.CSV_SECTIONS and isinstance(payload, list):
                    zf.writestr(f"{key}.csv", _csv_bytes(payload))
            for source, arcname in media_entries:
                zf.write(source, arcname)
            zf.writestr("README.txt", _README)

        size = zip_path.stat().st_size
        # Relative to the media root — the download endpoint joins it back.
        task.file_path = zip_path.relative_to(media_root).as_posix()
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


async def _purge_user(db, user) -> None:
    """Delete one expired account; record media cleanup in the same transaction."""
    from sqlalchemy import delete as sa_delete
    from sqlalchemy import select
    from sqlalchemy import update as sa_update

    from app.core.database import Base
    from app.models.behavior import BehaviorEvent
    from app.models.data_export import DataExportTask
    from app.models.user import User as UserModel
    from app.models.video import Video

    # 1. Disk paths to delete, collected before the rows go away. The rows are
    #    written inside this transaction; if it rolls back, no cleanup happens.
    videos = (await db.execute(select(Video).where(Video.user_id == user.id))).scalars().all()
    export_paths = [
        fp
        for fp in (
            (await db.execute(select(DataExportTask.file_path).where(DataExportTask.user_id == user.id)))
            .scalars()
            .all()
        )
        if fp
    ]
    files, dirs = account_data.cleanup_paths(user, videos, list(export_paths))
    await account_data.enqueue_media_cleanup(db, user.id, files, dirs)

    # 2. Behavior events survive as aggregate stats, without the account link.
    await db.execute(sa_update(BehaviorEvent).where(BehaviorEvent.user_id == user.id).values(user_id=None))

    # 3. The external payment ledger is the accounting source of truth; keep the
    #    money fields, drop the account link, phone and raw third-party payload.
    await account_data.anonymize_payment_ledger(db, user.id)

    # 4. Official catalog videos are not the uploader's personal data — keep
    #    them, detach the account. User-uploaded (non-official) videos go with
    #    the account; their subtitles/dispatches cascade.
    official_ids = [video.id for video in videos if video.is_official]
    if official_ids:
        await db.execute(sa_update(Video).where(Video.id.in_(official_ids)).values(user_id=None))
    user_video_ids = [video.id for video in videos if not video.is_official]
    if user_video_ids:
        await db.execute(sa_delete(Video).where(Video.id.in_(user_video_ids)))

    # 5. Every remaining table with a user_id FK to users.id, children before
    #    parents. The excluded ones were handled above; DB-level ON DELETE
    #    CASCADE covers nested rows (exam answers, study items, …).
    user_scoped = [
        t
        for t in Base.metadata.sorted_tables
        if t.name not in account_data.PURGE_EXCLUDED_TABLES
        and "user_id" in t.columns
        and any(fk.target_fullname == "users.id" for fk in t.columns["user_id"].foreign_keys)
    ]
    for table in reversed(user_scoped):
        await db.execute(sa_delete(table).where(table.columns["user_id"] == user.id))

    # 6. Delete the user row — this is where the phone number is released.
    await db.execute(sa_delete(UserModel).where(UserModel.id == user.id))
    await db.commit()

    # 7. Drain the media queue now; failures stay pending for the beat retry.
    result = await account_data.process_media_cleanup(db, limit=500)
    logger.info(
        "account_purged",
        user_id=user.id,
        media_files=len(files),
        media_dirs=len(dirs),
        **result,
    )


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

        # Sweep anything a previous run could not delete (locked files, a host
        # restart mid-cleanup). This is what makes the cleanup retryable.
        try:
            await account_data.process_media_cleanup(db)
            await account_data.prune_media_cleanup(db)
        except Exception:
            await db.rollback()
            logger.exception("media_cleanup_sweep_failed")
    return purged


async def _drain_media_cleanup(limit: int) -> dict:
    from app.core.database import async_session

    async with async_session() as db:
        result = await account_data.process_media_cleanup(db, limit=limit)
        pruned = await account_data.prune_media_cleanup(db)
    return {**result, "pruned": pruned}


@celery_app.task
def retry_media_cleanup(limit: int = 200):
    """Beat: retry account-deletion media cleanup that failed (A08)."""
    try:
        return run_async(_drain_media_cleanup(limit))
    except Exception:
        logger.exception("retry_media_cleanup failed")
        return {"processed": 0, "done": 0, "failed": 0, "pruned": 0}


@celery_app.task
def purge_deleted_accounts(now: datetime | None = None):
    """Daily sweep: finalize every account whose 30-day window has elapsed."""
    try:
        return run_async(_purge_due(now))
    except Exception:
        logger.exception("purge_deleted_accounts failed")
        return 0
