"""SMS dev-fake security: the fixed code "1234" must never work in production.

The dev-fake path exists so local dev / CI can run phone flows without
Aliyun credentials. A production box missing SMS credentials must fail
closed (verify always rejects) — accepting a publicly-known fixed code
would let anyone log into / reset any phone account.
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


@pytest.fixture
def prod_no_sms(monkeypatch):
    """Production with missing/disabled SMS credentials (misconfiguration)."""
    monkeypatch.setattr(sms_svc, "get_settings", lambda: _settings("production", False, "", ""))
    yield


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
    # No code was ever sent (no credentials) — Redis has nothing, fixed code
    # must not be accepted. Fail-closed.
    assert await sms_svc.verify_code("13800138000", "1234", purpose="register") is False


async def test_verify_rejects_real_flow_in_production_without_redis_code(prod_no_sms):
    # Even a "real-looking" code must fail when nothing was stored.
    assert await sms_svc.verify_code("13800138000", "482913", purpose="register") is False


async def test_verify_accepts_fixed_code_in_dev(dev_no_sms):
    # Dev-fake regression guard: local dev still works.
    assert await sms_svc.verify_code("13800138000", "1234", purpose="register") is True


async def test_verify_rejects_wrong_code_in_dev(dev_no_sms):
    assert await sms_svc.verify_code("13800138000", "000000", purpose="register") is False


async def test_send_code_stores_random_code_in_production(prod_no_sms, fake_redis):
    """Production without credentials must NOT use the fixed dev code in Redis.

    send_verify_code would then attempt the real Aliyun send and raise
    RuntimeError (route surfaces 502) — we only assert the stored code is
    not the dev-fake one before that happens.
    """

    # Patch the send client to fail loudly instead of importing the SDK.
    def _boom(*args, **kwargs):
        raise RuntimeError("send failed (no credentials)")

    monkeypatch = pytest.MonkeyPatch()
    monkeypatch.setattr(sms_svc, "get_sms_client", _boom)
    monkeypatch.setattr(sms_svc, "_ensure_sdk", lambda: None)
    try:
        with pytest.raises(RuntimeError):
            await sms_svc.send_verify_code("13800138000", purpose="register")
    finally:
        monkeypatch.undo()

    stored = fake_redis._store.get("sms:code:13800138000:register")
    assert stored is not None
    assert stored != "1234"
