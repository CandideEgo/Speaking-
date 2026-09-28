"""Regression tests for the ``ENV`` guard in ``Settings.model_post_init``.

An unrecognized ``ENV`` used to match neither the development defaults nor the
production guards, so the app booted with an empty ``jwt_secret`` (JWTs signed
with an empty key, i.e. forgeable) and no guard at all. These tests pin the
fail-closed behavior: unknown values refuse to start, and the non-development
guard cannot be skipped by any accepted value.
"""

import pytest

from app.core.config import Settings


def _settings(**overrides) -> Settings:
    """Build ``Settings`` from the explicit kwargs only.

    ``_env_file=None`` disables the repo's ``.env`` dotenv source so the
    assertions do not depend on the developer's local file. ``os.environ`` still
    applies — tests that assert a value is *missing* must clear it themselves
    (see ``test_production_rejects_defaulted_redis_url``).
    """
    return Settings(_env_file=None, **overrides)


class TestEnvValueGuard:
    def test_unknown_env_refuses_to_start(self):
        with pytest.raises(RuntimeError, match="ENV"):
            _settings(env="staging")

    def test_empty_env_refuses_to_start(self):
        with pytest.raises(RuntimeError, match="ENV"):
            _settings(env="")

    def test_case_variant_is_normalized(self):
        """A casing slip must not skip every downstream ``env == "production"`` check."""
        s = _settings(
            env="Production",
            jwt_secret="s",
            database_url="postgresql+asyncpg://u:p@localhost/db",
            redis_url="redis://localhost:6379/0",
            openai_api_key="k",
            transcription_callback_secret="c",
        )
        assert s.env == "production"

    def test_prod_alias_is_normalized(self):
        """``prod`` is accepted because payment_provider already treats it as production."""
        s = _settings(
            env="prod",
            jwt_secret="s",
            database_url="postgresql+asyncpg://u:p@localhost/db",
            redis_url="redis://localhost:6379/0",
            openai_api_key="k",
            transcription_callback_secret="c",
        )
        assert s.env == "production"


class TestSecretGuards:
    def test_production_rejects_empty_jwt_secret(self):
        with pytest.raises(RuntimeError, match="JWT_SECRET"):
            _settings(env="production", jwt_secret="", database_url="postgresql+asyncpg://u:p@localhost/db")

    def test_production_rejects_empty_database_url(self):
        with pytest.raises(RuntimeError, match="DATABASE_URL"):
            _settings(env="production", jwt_secret="s", database_url="")

    def test_production_rejects_missing_transcription_callback_secret(self):
        with pytest.raises(RuntimeError, match="TRANSCRIPTION_CALLBACK_SECRET"):
            _settings(
                env="production",
                jwt_secret="s",
                database_url="postgresql+asyncpg://u:p@localhost/db",
                redis_url="redis://localhost:6379/0",
                openai_api_key="k",
            )

    def test_production_rejects_defaulted_redis_url(self, monkeypatch):
        """``REDIS_URL`` has a working localhost default, so production must set it explicitly.

        The guard fires when ``redis_url`` was never *set* (``model_fields_set``),
        and an environment variable counts as set — so CI's ``REDIS_URL`` for the
        rest of the suite would satisfy it silently. Clear it for this test.
        """
        monkeypatch.delenv("REDIS_URL", raising=False)
        with pytest.raises(RuntimeError, match="REDIS_URL"):
            _settings(
                env="production",
                jwt_secret="s",
                database_url="postgresql+asyncpg://u:p@localhost/db",
                openai_api_key="k",
                transcription_callback_secret="c",
            )

    def test_testing_rejects_empty_jwt_secret(self):
        """``ENV=testing`` must not be a way around the empty-secret guard."""
        with pytest.raises(RuntimeError, match="JWT_SECRET"):
            _settings(env="testing", jwt_secret="", database_url="postgresql+asyncpg://u:p@localhost/db")

    def test_testing_rejects_empty_database_url(self):
        with pytest.raises(RuntimeError, match="DATABASE_URL"):
            _settings(env="testing", jwt_secret="s", database_url="")

    def test_development_keeps_the_local_defaults(self):
        s = _settings(env="development", jwt_secret="", database_url="")
        assert s.jwt_secret == "dev_secret_change_in_production"
        assert s.database_url == "postgresql+asyncpg://seeword:seeword_dev@localhost:5432/seeword"

    def test_development_keeps_explicit_values(self):
        s = _settings(env="development", jwt_secret="mine", database_url="postgresql+asyncpg://u:p@db/x")
        assert (s.jwt_secret, s.database_url) == ("mine", "postgresql+asyncpg://u:p@db/x")


class TestPaymentSignatureDefault:
    """审计 H12：验签必须默认 fail-closed，dev 旁路只能显式开启。"""

    def test_verify_signature_defaults_on(self):
        # production 无旁路路径（_verify_* 只看 development 分支），无需构造。
        for env in ("development", "testing"):
            assert _settings(env=env).payment_verify_signature is True, env

    def test_dev_bypass_requires_explicit_opt_out(self, monkeypatch):
        """默认下无 sign 的回调走验签并失败；显式 False 才旁路（带 warning）。"""
        from app.services import alipay_payment

        monkeypatch.setattr(alipay_payment.settings, "env", "development")
        monkeypatch.setattr(alipay_payment.settings, "payment_verify_signature", True)
        assert alipay_payment._verify_alipay_signature({}) is False

        monkeypatch.setattr(alipay_payment.settings, "payment_verify_signature", False)
        assert alipay_payment._verify_alipay_signature({}) is True
