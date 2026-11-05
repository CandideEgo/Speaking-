"""Seed original content only in the dedicated, disposable UI acceptance DB."""

import asyncio
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "backend"))
sys.path.insert(0, str(ROOT / "backend" / "tests"))

from sqlalchemy import select

import app.models  # noqa: F401
from app.core.database import get_async_session_maker
from app.core.security import hash_password
from app.models.teaching import ExamAnalysisRevision
from app.models.user import User
from app.models.v2_runtime import TeachingAccessGrant
from teaching_fixtures import seed_original_content


async def main():
    url = os.environ.get("DATABASE_URL", "")
    if not url.endswith("@127.0.0.1:15433/seeword_v2_ui") or os.environ.get("ENV") != "testing":
        raise RuntimeError("Refusing to seed outside the dedicated V2 UI test database")
    async with get_async_session_maker()() as db:
        user = await db.scalar(select(User).where(User.phone == "13900009991"))
        if user is None:
            user = User(phone="13900009991", hashed_password=hash_password("V2-ui-only-2026!"), name="V2 原创内容验收", onboarding_completed=True)
            db.add(user)
            await db.flush()
        grant = await db.get(TeachingAccessGrant, user.id)
        if grant is None:
            db.add(TeachingAccessGrant(user_id=user.id))
        revision = await db.scalar(select(ExamAnalysisRevision).limit(1))
        if revision is None:
            user, revision, question, _ = await seed_original_content(db, existing_user=user)
        await db.commit()
        print(json.dumps({"user_id": user.id, "content_revision_id": revision.id, "question_id": revision.question_id, "test_only": True}))


if __name__ == "__main__":
    asyncio.run(main())
