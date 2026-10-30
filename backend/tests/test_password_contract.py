"""密码字符/字节契约（BE-07 / A13）。

bcrypt 只消费前 72 个字节：4.x 静默截断，5.x 直接抛 ``ValueError``。产品的 schema
原本允许 128 个字符，于是 83 字节的「合法」新密码会在 ``hash_password`` 里变成 500；
登录入参根本没有上限，已存在账号的 ``checkpw`` 也可能抛错。

修复后的契约是一条、且只有一个：**新密码最多 72 个 UTF-8 字节**（72 个英文字符或
约 24 个汉字），在 schema 层给出可读的 422；``hash_password`` 拒绝超长而非截断；
``verify_password`` 对历史 hash（bcrypt 4 截断出来的）按前 72 字节比对，让老密码
仍能登录，且错误的长密码是 401 而不是 500。
"""

from __future__ import annotations

import bcrypt
import pytest
from pydantic import ValidationError

from app.core.security import (
    BCRYPT_MAX_PASSWORD_BYTES,
    hash_password,
    validate_password_strength,
    verify_password,
)
from app.schemas.user import ChangePasswordRequest, SmsRegisterRequest, SmsResetPasswordRequest

pytestmark = pytest.mark.unit

#: 72 字节、满足大小写与数字要求：3 个 ASCII + 69 个小写字母。
ASCII_72 = "Aa1" + "x" * (BCRYPT_MAX_PASSWORD_BYTES - 3)
#: 73 字节：把上面再加一个字符。
ASCII_73 = ASCII_72 + "x"
#: 3 + 23×3 = 72 字节，汉字是多字节，字符数只有 26 —— 证明限制的是字节而不是字符。
CJK_72 = "Aa1" + "密" * 23
CJK_75 = "Aa1" + "密" * 24


def _register_payload(password: str | None) -> dict:
    return {"phone": "13800138001", "code": "1234", "password": password}


def _reset_payload(password: str) -> dict:
    return {"phone": "13800138001", "code": "1234", "new_password": password}


class TestSchemaContract:
    def test_72_ascii_bytes_are_accepted(self):
        assert len(ASCII_72.encode()) == 72
        assert SmsRegisterRequest(**_register_payload(ASCII_72)).password == ASCII_72
        assert SmsResetPasswordRequest(**_reset_payload(ASCII_72)).new_password == ASCII_72
        assert ChangePasswordRequest(new_password=ASCII_72).new_password == ASCII_72
        validate_password_strength(ASCII_72)  # no raise

    def test_73_ascii_bytes_are_rejected_by_every_new_password_entry(self):
        assert len(ASCII_73.encode()) == 73
        for payload in (
            lambda: SmsRegisterRequest(**_register_payload(ASCII_73)),
            lambda: SmsResetPasswordRequest(**_reset_payload(ASCII_73)),
            lambda: ChangePasswordRequest(new_password=ASCII_73),
        ):
            with pytest.raises(ValidationError) as excinfo:
                payload()
            assert "72" in str(excinfo.value) and "字节" in str(excinfo.value)

    def test_byte_limit_is_not_a_character_limit(self):
        """26 个汉字 = 72 字节 → 通过；27 个汉字 = 75 字节 → 拒绝，字符数都在 128 以内。"""
        assert len(CJK_72) == 26 and len(CJK_72.encode()) == 72
        validate_password_strength(CJK_72)

        assert len(CJK_75) == 27 and len(CJK_75.encode()) == 75
        with pytest.raises(ValueError, match="字节"):
            validate_password_strength(CJK_75)

    def test_short_password_message_is_unchanged(self):
        with pytest.raises(ValueError, match="至少 8 位"):
            validate_password_strength("Aa1")


class TestHashingContract:
    def test_hash_refuses_long_input_instead_of_truncating(self):
        with pytest.raises(ValueError):
            hash_password(ASCII_73)

    def test_legacy_hash_over_the_truncated_prefix_still_verifies(self):
        """bcrypt 4 存下的是前 72 字节；这类老账号必须还能用原密码登录。"""
        legacy_hash = bcrypt.hashpw(ASCII_72.encode(), bcrypt.gensalt()).decode()

        assert verify_password(ASCII_72 + "totally-ignored-suffix", legacy_hash) is True
        assert verify_password(ASCII_72, legacy_hash) is True

    def test_wrong_long_password_is_false_not_an_exception(self):
        """bcrypt 5 对 >72 字节直接抛 ValueError —— 那会把 401 变成 500。"""
        hashed = hash_password(ASCII_72)

        assert verify_password("Bb2" + "y" * 100, hashed) is False
        assert verify_password("Aa1" + "密" * 30, hashed) is False

    def test_bytes_beyond_the_first_72_are_ignored_as_bcrypt_always_did(self):
        """明确记录兼容语义：比较只认前 72 字节。

        这是 bcrypt 的既成行为（4.x 的静默截断），历史 hash 也只能这样验证。
        新密码在 schema 层就限死 72 字节，所以唯一能触发它的是「正确前缀 +
        故意追加内容」；那既不增加也不需要猜测的熵。
        """
        hashed = hash_password(ASCII_72)

        assert verify_password(ASCII_73, hashed) is True


class TestApiContract:
    async def test_change_password_with_73_bytes_is_a_422_not_a_500(self, client, auth_headers):
        response = await client.post(
            "/api/v1/auth/change-password",
            json={"current_password": "Testpass123!", "new_password": ASCII_73},
            headers=auth_headers,
        )

        assert response.status_code == 422, response.text
        body = response.json()
        assert body["code"] == "VALIDATION_ERROR"
        assert "字节" in str(body["detail"])

    async def test_change_password_to_72_bytes_then_login_with_it(self, client, auth_headers):
        response = await client.post(
            "/api/v1/auth/change-password",
            json={"current_password": "Testpass123!", "new_password": ASCII_72},
            headers=auth_headers,
        )
        assert response.status_code == 200, response.text

        login = await client.post("/api/v1/auth/phone-login", json={"phone": "13800138000", "password": ASCII_72})
        assert login.status_code == 200, login.text

    async def test_phone_login_with_an_over_long_password_is_401_not_500(self, client):
        # 128 个字符（登录入参的上限）但不是合法密码 → 401，而不是 bcrypt 的 500。
        assert len(ASCII_73 + "x" * 55) == 128
        response = await client.post(
            "/api/v1/auth/phone-login", json={"phone": "13800138000", "password": ASCII_73 + "x" * 55}
        )

        assert response.status_code == 401, response.text
        assert response.json()["code"] == "HTTP_401"

    async def test_legacy_long_password_account_can_still_log_in(self, client):
        """历史账号：库里是 72 字节前缀的 hash，用户仍会输入原来的长密码。"""
        from app.models.user import User
        from tests.conftest import TestSessionLocal

        legacy_plain = ASCII_72 + "-legacy-suffix"
        async with TestSessionLocal() as db:
            db.add(
                User(
                    phone="13700137000",
                    hashed_password=bcrypt.hashpw(ASCII_72.encode(), bcrypt.gensalt()).decode(),
                    name="Legacy user",
                )
            )
            await db.commit()

        response = await client.post(
            "/api/v1/auth/phone-login", json={"phone": "13700137000", "password": legacy_plain}
        )

        assert response.status_code == 200, response.text
