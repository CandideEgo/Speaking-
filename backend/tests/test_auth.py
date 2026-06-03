"""Tests for authentication endpoints."""
import pytest
from httpx import AsyncClient


class TestRegister:
    async def test_register_creates_user_and_returns_token(
        self, client: AsyncClient
    ):
        resp = await client.post("/api/v1/auth/register", json={
            "email": "newuser@example.com",
            "password": "securepass123",
            "name": "New User",
        })
        assert resp.status_code == 201
        data = resp.json()
        assert "token" in data
        assert data["user"]["email"] == "newuser@example.com"
        assert data["user"]["name"] == "New User"
        assert data["user"]["plan"] == "free"

    async def test_register_duplicate_email_returns_409(
        self, client: AsyncClient, test_user_data: dict
    ):
        # Register first time
        await client.post("/api/v1/auth/register", json=test_user_data)
        # Try again
        resp = await client.post("/api/v1/auth/register", json=test_user_data)
        assert resp.status_code == 409
        assert "already registered" in resp.json()["detail"].lower()

    async def test_register_without_name_succeeds(self, client: AsyncClient):
        resp = await client.post("/api/v1/auth/register", json={
            "email": "noname@example.com",
            "password": "pass123456",
        })
        assert resp.status_code == 201
        assert resp.json()["user"]["name"] is None


class TestLogin:
    async def test_login_with_valid_credentials(
        self, client: AsyncClient, test_user_data: dict, test_password: str
    ):
        # Register first
        await client.post("/api/v1/auth/register", json=test_user_data)
        # Login
        resp = await client.post("/api/v1/auth/login", json={
            "email": test_user_data["email"],
            "password": test_password,
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "token" in data
        assert data["user"]["email"] == test_user_data["email"]

    async def test_login_wrong_password_returns_401(
        self, client: AsyncClient, test_user_data: dict
    ):
        await client.post("/api/v1/auth/register", json=test_user_data)
        resp = await client.post("/api/v1/auth/login", json={
            "email": test_user_data["email"],
            "password": "wrongpassword",
        })
        assert resp.status_code == 401

    async def test_login_nonexistent_user_returns_401(self, client: AsyncClient):
        resp = await client.post("/api/v1/auth/login", json={
            "email": "nobody@example.com",
            "password": "whatever",
        })
        assert resp.status_code == 401


class TestUserProfile:
    async def test_get_me_returns_user(
        self, client: AsyncClient, auth_headers: dict
    ):
        resp = await client.get("/api/v1/users/me", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["email"] == "test@example.com"

    async def test_get_me_without_token_returns_401(self, client: AsyncClient):
        resp = await client.get("/api/v1/users/me")
        assert resp.status_code == 401

    async def test_update_me_level(
        self, client: AsyncClient, auth_headers: dict
    ):
        resp = await client.patch(
            "/api/v1/users/me",
            headers=auth_headers,
            json={"level": "B2"},
        )
        assert resp.status_code == 200
        assert resp.json()["level"] == "B2"

    async def test_update_me_invalid_level(
        self, client: AsyncClient, auth_headers: dict
    ):
        resp = await client.patch(
            "/api/v1/users/me",
            headers=auth_headers,
            json={"level": "D5"},
        )
        assert resp.status_code == 422  # validation error
