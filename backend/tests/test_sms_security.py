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
