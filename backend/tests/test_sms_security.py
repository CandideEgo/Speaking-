"""SMS dev-fake security + Dypnsapi integration tests.

The dev-fake path exists so local dev / CI can run phone flows without
Aliyun credentials. A production box missing SMS credentials must fail
closed (verify always rejects) — accepting a publicly-known fixed code
would let anyone log into / reset any phone account.

Production send/verify go through Aliyun Dypnsapi (SendSmsVerifyCode /
CheckSmsVerifyCode); the code is generated AND verified by Aliyun, so
nothing is stored locally and the fixed dev code must never be accepted.
"""

import types

import pytest

import app.services.sms_service as sms_svc


def _settings(env: str, sms_enabled: bool, ak: str, sk: str):
    return types.SimpleNamespace(
        env=env,
        sms_login_enabled=sms_enabled,
        aliyun_sms_access_key=ak,
        aliyun_sms_secret_key=sk,
        aliyun_sms_sign_name="速通互联验证码",
        aliyun_sms_template_register="100001",
        aliyun_sms_template_change_phone="100002",
        aliyun_sms_template_reset_password="100003",
        sms_code_expire_seconds=300,
    )


class _Model:
    def __init__(self, verify_result: str = "PASS"):
        self.verify_result = verify_result


class _Body:
    def __init__(self, code: str = "OK", message: str = "成功", model: _Model | None = None):
        self.code = code
        self.message = message
        self.model = model


class _Resp:
    def __init__(self, body: _Body):
        self.body = body


class _FakeDypnsClient:
    """Records calls; send_result / check_result control API outcomes."""

    def __init__(self, send_ok: bool = True, check_pass: bool = False):
        self.send_calls: list = []
        self.check_calls: list = []
        self._send_ok = send_ok
        self._check_pass = check_pass
        self.check_raises: Exception | None = None

    async def send_sms_verify_code_with_options_async(self, request, runtime):
        self.send_calls.append(request)
        return _Resp(_Body(code="OK" if self._send_ok else "isv.ERROR", message="ok"))

    async def check_sms_verify_code_with_options_async(self, request, runtime):
        self.check_calls.append(request)
        if self.check_raises is not None:
            raise self.check_raises
        if self._check_pass:
            return _Resp(_Body(code="OK", model=_Model(verify_result="PASS")))
        return _Resp(_Body(code="OK", model=_Model(verify_result="FAIL")))


@pytest.fixture
def prod_no_sms(monkeypatch):
    """Production with missing/disabled SMS credentials (misconfiguration)."""
    monkeypatch.setattr(sms_svc, "get_settings", lambda: _settings("production", False, "", ""))
    monkeypatch.setattr(sms_svc, "get_sms_client", lambda: _FakeDypnsClient())
    yield


@pytest.fixture
def prod_sms_ok(monkeypatch):
    """Production with valid credentials; Aliyun client faked."""
    monkeypatch.setattr(sms_svc, "get_settings", lambda: _settings("production", True, "LTAIx", "secret"))
    client = _FakeDypnsClient(send_ok=True, check_pass=True)
    monkeypatch.setattr(sms_svc, "get_sms_client", lambda: client)
    monkeypatch.setattr(sms_svc, "_ensure_sdk", lambda: None)
    yield client


@pytest.fixture
def dev_no_sms(monkeypatch):
    """Development without credentials — dev-fake is legitimately on."""
    monkeypatch.setattr(sms_svc, "get_settings", lambda: _settings("development", False, "", ""))
    yield


async def test_dev_fake_disabled_in_production(prod_no_sms):
    assert sms_svc._dev_fake_enabled() is False


async def test_dev_fake_enabled_in_dev(dev_no_sms):
    assert sms_svc._dev_fake_enabled() is True


async def test_verify_rejects_fixed_code_in_production(prod_no_sms):
    # Aliyun never sent anything for this phone — fixed code must not pass.
    assert await sms_svc.verify_code("13800138000", "1234", purpose="register") is False


async def test_verify_rejects_wrong_code_in_production(prod_no_sms):
    assert await sms_svc.verify_code("13800138000", "482913", purpose="register") is False


async def test_verify_accepts_fixed_code_in_dev(dev_no_sms):
    # Dev-fake regression guard: local dev still works.
    assert await sms_svc.verify_code("13800138000", "1234", purpose="register") is True


async def test_verify_rejects_wrong_code_in_dev(dev_no_sms):
    assert await sms_svc.verify_code("13800138000", "000000", purpose="register") is False


async def test_verify_checks_with_aliyun_and_passes(prod_sms_ok):
    assert await sms_svc.verify_code("13800138000", "123456", purpose="register") is True
    req = prod_sms_ok.check_calls[0]
    assert req.phone_number == "13800138000"
    assert req.verify_code == "123456"


async def test_verify_fail_closed_when_aliyun_errors(prod_sms_ok):
    prod_sms_ok.check_raises = RuntimeError("network down")
    assert await sms_svc.verify_code("13800138000", "123456", purpose="register") is False


async def test_send_code_uses_dypnsapi_in_production(prod_sms_ok, fake_redis):
    """Production send must go through Dypnsapi with ##code## placeholder —
    Aliyun generates the code, so nothing (and definitely not "1234") is
    stored locally."""
    await sms_svc.send_verify_code("13800138000", purpose="register")
    req = prod_sms_ok.send_calls[0]
    assert req.phone_number == "13800138000"
    assert req.sign_name == "速通互联验证码"
    assert req.template_code == "100001"
    assert "##code##" in req.template_param
    assert req.code_type == 1
    assert req.valid_time == 300

    stored = fake_redis._store.get("sms:code:13800138000:register")
    assert stored is None, "production must not store the code locally"
    assert "1234" not in fake_redis._store.values()


async def test_send_code_raises_on_aliyun_error(prod_sms_ok):
    prod_sms_ok._send_ok = False
    with pytest.raises(RuntimeError):
        await sms_svc.send_verify_code("13800138000", purpose="register")


def test_mask_phone():
    """Phone numbers must be masked in logs (PIPL) — keep first 3 + last 4."""
    from app.core.logging import mask_phone

    assert mask_phone("13800138000") == "138****8000"
    assert mask_phone("12345") == "***"
    assert mask_phone("") == "***"
    assert mask_phone(None) == "***"


def test_dypnsapi_sdk_importable():
    """Regression guard for the Dypnsapi migration.

    sms_service lazily imports the Dypnsapi SDK on the first send/verify, so a
    missing package only explodes at runtime (the historical drift where
    requirements.txt still pinned the old Dysmsapi SDK shipped in CI unnoticed
    — send-code 502 in production). The runtime requirements must install it.
    """
    from alibabacloud_dypnsapi20170525 import models  # noqa: F401
    from alibabacloud_dypnsapi20170525.client import Client  # noqa: F401
    from alibabacloud_tea_openapi import models as tea_models  # noqa: F401
    from alibabacloud_tea_util import models as tea_util_models  # noqa: F401

    assert Client is not None and models is not None


# ---------------------------------------------------------------------------
# Per-phone send cooldown (endpoint-level, Redis TTL semantics)
# ---------------------------------------------------------------------------


async def test_sms_send_code_cooldown_blocks_resend(client, fake_redis):
    """A second send within the 60s cooldown window is rejected (429)."""
    resp1 = await client.post(
        "/api/v1/auth/sms/send-code",
        json={"phone": "13800138001", "purpose": "register"},
    )
    assert resp1.status_code == 200, resp1.text

    resp2 = await client.post(
        "/api/v1/auth/sms/send-code",
        json={"phone": "13800138001", "purpose": "register"},
    )
    assert resp2.status_code == 429


async def test_sms_send_code_cooldown_is_per_purpose(client, fake_redis):
    """Cooldown keys are per (phone, purpose) — a different purpose is not
    blocked by an existing cooldown on the same phone."""
    resp1 = await client.post(
        "/api/v1/auth/sms/send-code",
        json={"phone": "13800138003", "purpose": "register"},
    )
    assert resp1.status_code == 200, resp1.text

    resp2 = await client.post(
        "/api/v1/auth/sms/send-code",
        json={"phone": "13800138003", "purpose": "reset_password"},
    )
    assert resp2.status_code == 200, resp2.text


async def test_sms_send_code_cooldown_expires(client, fake_redis):
    """After the cooldown TTL elapses, sending is allowed again."""
    await client.post(
        "/api/v1/auth/sms/send-code",
        json={"phone": "13800138002", "purpose": "register"},
    )
    key = "sms:cooldown:13800138002:register"
    assert await fake_redis.exists(key)

    # Simulate the 60s cooldown elapsing (monotonic expiry already passed).
    fake_redis._expires[key] = 0

    resp = await client.post(
        "/api/v1/auth/sms/send-code",
        json={"phone": "13800138002", "purpose": "register"},
    )
    assert resp.status_code == 200, resp.text
    # And the cooldown is armed again for the next window.
    assert await fake_redis.exists(key)
