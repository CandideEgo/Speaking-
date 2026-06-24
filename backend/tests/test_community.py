"""Tests for the community API (/api/v1/community) — posts, comments, likes, follows."""

from httpx import AsyncClient

from app.models.user import PlanType, RoleType, User
from tests.conftest import TestSessionLocal, hash_password


async def _make_user(email: str) -> str:
    async with TestSessionLocal() as db:
        u = User(
            email=email,
            hashed_password=hash_password("Pass123!"),
            name=email.split("@")[0],
            level="B1",
            plan=PlanType.free,
            role=RoleType.user,
        )
        db.add(u)
        await db.commit()
        await db.refresh(u)
        return u.id


class TestPosts:
    async def test_create_post_requires_auth(self, client: AsyncClient):
        resp = await client.post(
            "/api/v1/community/posts",
            json={"post_type": "text", "content": "hello"},
        )
        assert resp.status_code == 401

    async def test_create_post(self, client: AsyncClient, auth_headers: dict):
        resp = await client.post(
            "/api/v1/community/posts",
            headers=auth_headers,
            json={"post_type": "text", "content": "My first post!"},
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["content"] == "My first post!"
        assert data["post_type"] == "text"
        assert data["like_count"] == 0
        assert data["is_liked"] is False

    async def test_create_post_invalid_type(self, client: AsyncClient, auth_headers: dict):
        resp = await client.post(
            "/api/v1/community/posts",
            headers=auth_headers,
            json={"post_type": "bogus", "content": "x"},
        )
        assert resp.status_code == 422

    async def test_delete_own_post(self, client: AsyncClient, auth_headers: dict):
        pid = (
            await client.post(
                "/api/v1/community/posts",
                headers=auth_headers,
                json={"post_type": "text", "content": "to delete"},
            )
        ).json()["id"]
        resp = await client.delete(f"/api/v1/community/posts/{pid}", headers=auth_headers)
        assert resp.status_code == 204

    async def test_delete_nonexistent_post_404(self, client: AsyncClient, auth_headers: dict):
        resp = await client.delete("/api/v1/community/posts/nonexistent", headers=auth_headers)
        assert resp.status_code == 404

    async def test_delete_other_users_post_403(self, client: AsyncClient, auth_headers: dict):
        # Post as auth_headers user
        pid = (
            await client.post(
                "/api/v1/community/posts",
                headers=auth_headers,
                json={"post_type": "text", "content": "mine"},
            )
        ).json()["id"]
        # Try to delete as a different user
        from app.core.security import create_token

        other_id = await _make_user("deleter@example.com")
        other_headers = {"Authorization": f"Bearer {create_token(other_id)}"}
        resp = await client.delete(f"/api/v1/community/posts/{pid}", headers=other_headers)
        assert resp.status_code == 403


class TestPostLikes:
    async def test_toggle_like(self, client: AsyncClient, auth_headers: dict):
        pid = (
            await client.post(
                "/api/v1/community/posts",
                headers=auth_headers,
                json={"post_type": "text", "content": "like me"},
            )
        ).json()["id"]
        # Like
        resp = await client.post(f"/api/v1/community/posts/{pid}/like", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["liked"] is True
        # Unlike (toggle)
        resp = await client.post(f"/api/v1/community/posts/{pid}/like", headers=auth_headers)
        assert resp.json()["liked"] is False

    async def test_like_nonexistent_post_404(self, client: AsyncClient, auth_headers: dict):
        resp = await client.post("/api/v1/community/posts/nonexistent/like", headers=auth_headers)
        assert resp.status_code == 404


class TestComments:
    async def test_add_and_list_comment(self, client: AsyncClient, auth_headers: dict):
        pid = (
            await client.post(
                "/api/v1/community/posts",
                headers=auth_headers,
                json={"post_type": "text", "content": "comment here"},
            )
        ).json()["id"]

        resp = await client.post(
            f"/api/v1/community/posts/{pid}/comments",
            headers=auth_headers,
            json={"content": "Nice post!"},
        )
        assert resp.status_code == 201
        cid = resp.json()["id"]

        resp = await client.get(f"/api/v1/community/posts/{pid}/comments", headers=auth_headers)
        assert resp.status_code == 200
        comments = resp.json()
        assert len(comments) == 1
        assert comments[0]["id"] == cid
        assert comments[0]["content"] == "Nice post!"

    async def test_delete_own_comment(self, client: AsyncClient, auth_headers: dict):
        pid = (
            await client.post(
                "/api/v1/community/posts",
                headers=auth_headers,
                json={"post_type": "text", "content": "p"},
            )
        ).json()["id"]
        cid = (
            await client.post(
                f"/api/v1/community/posts/{pid}/comments",
                headers=auth_headers,
                json={"content": "c"},
            )
        ).json()["id"]
        resp = await client.delete(f"/api/v1/community/comments/{cid}", headers=auth_headers)
        assert resp.status_code == 204

    async def test_comment_like_toggle(self, client: AsyncClient, auth_headers: dict):
        pid = (
            await client.post(
                "/api/v1/community/posts",
                headers=auth_headers,
                json={"post_type": "text", "content": "p"},
            )
        ).json()["id"]
        cid = (
            await client.post(
                f"/api/v1/community/posts/{pid}/comments",
                headers=auth_headers,
                json={"content": "c"},
            )
        ).json()["id"]
        resp = await client.post(f"/api/v1/community/comments/{cid}/like", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["liked"] is True

    async def test_report_comment(self, client: AsyncClient, auth_headers: dict):
        pid = (
            await client.post(
                "/api/v1/community/posts",
                headers=auth_headers,
                json={"post_type": "text", "content": "p"},
            )
        ).json()["id"]
        cid = (
            await client.post(
                f"/api/v1/community/posts/{pid}/comments",
                headers=auth_headers,
                json={"content": "spammy"},
            )
        ).json()["id"]
        resp = await client.post(
            f"/api/v1/community/comments/{cid}/report",
            headers=auth_headers,
            json={"reason": "spam"},
        )
        assert resp.status_code == 201
        assert resp.json()["reason"] == "spam"


class TestFollows:
    async def test_follow_and_unfollow(self, client: AsyncClient, auth_headers: dict):
        target_id = await _make_user("target@example.com")
        # Follow
        resp = await client.post(f"/api/v1/community/follow/{target_id}", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["following"] is True
        # Following list should include target
        resp = await client.get("/api/v1/community/following", headers=auth_headers)
        assert resp.status_code == 200
        assert any(u["user"]["id"] == target_id for u in resp.json()["items"])

        # Unfollow (toggle)
        resp = await client.post(f"/api/v1/community/follow/{target_id}", headers=auth_headers)
        assert resp.json()["following"] is False

    async def test_follow_self_rejected(self, client: AsyncClient, auth_headers: dict):
        me = (await client.get("/api/v1/users/me", headers=auth_headers)).json()
        resp = await client.post(f"/api/v1/community/follow/{me['id']}", headers=auth_headers)
        assert resp.status_code == 400

    async def test_followers_list(self, client: AsyncClient, auth_headers: dict):
        from app.core.security import create_token

        me = (await client.get("/api/v1/users/me", headers=auth_headers)).json()
        # another user follows me
        follower_id = await _make_user("follower@example.com")
        follower_headers = {"Authorization": f"Bearer {create_token(follower_id)}"}
        await client.post(f"/api/v1/community/follow/{me['id']}", headers=follower_headers)

        resp = await client.get("/api/v1/community/followers", headers=auth_headers)
        assert resp.status_code == 200
        assert any(u["user"]["id"] == follower_id for u in resp.json()["items"])


class TestFeed:
    async def test_feed_anonymous_works(self, client: AsyncClient):
        resp = await client.get("/api/v1/community/feed")
        assert resp.status_code == 200
        assert "items" in resp.json()

    async def test_feed_authenticated(self, client: AsyncClient, auth_headers: dict):
        # Create a post, then fetch the feed
        await client.post(
            "/api/v1/community/posts",
            headers=auth_headers,
            json={"post_type": "text", "content": "feed test"},
        )
        resp = await client.get("/api/v1/community/feed", headers=auth_headers)
        assert resp.status_code == 200
        assert "items" in resp.json()
