"""Tests for the LLM provider registry (``app/services/llm_provider.py``).

These pin the config contract the video pipeline (translation / word notes /
classification) and homepage draft generation rely on: which provider is
active, which model each task resolves to, and which models count as free.
A provider switch must stay a pure env change — no code edit, no call-site edit.
"""

from __future__ import annotations

import pytest

from app.core.config import Settings
from app.services.llm_provider import (
    COMMANDCODE_DEFAULT_BASE_URL,
    COMMANDCODE_FREE_MODELS,
    DEFAULT_COMMANDCODE_MODEL,
    TASK_CLASSIFICATION,
    TASK_DEFAULT,
    TASK_EDITORIAL,
    TASK_TRANSLATION,
    TASK_WORD_NOTES,
    ProviderSpec,
    audit_free_catalog,
    build_client_kwargs,
    catalog_lookup,
    free_model_ids,
    is_free_model_id,
    mask_secret,
    model_spec_from_payload,
    provider_headers,
    provider_summary,
    resolve_model,
    resolve_provider,
)

# 明显伪造的 provider key：形状与真 key 一致（``user_`` 前缀 + 32 位），
# 但**不含任何真实片段**。真 key 一旦进仓库，推送前就必须轮换；
# 而历史里那 37 字符片段仍然是泄露，换掉字面量不等于撤销泄露。
FAKE_COMMANDCODE_KEY = "user_FAKE0000fake1111FAKE2222fake3333"


def _settings(**overrides) -> Settings:
    """Build ``Settings`` from explicit kwargs only (no repo ``.env``).

    ``ENV=testing`` keeps ``model_post_init`` out of the production branches;
    callers that assert "no key" pass the empty strings themselves.
    """
    base = dict(
        _env_file=None,
        env="testing",
        # Non-development builds reject the dev default and require ≥32 chars
        # (config guard added in the 2026-10-24 audit); keep the fixture valid.
        jwt_secret="test-secret-for-pytest-at-least-32-chars",
        database_url="postgresql+asyncpg://u:p@localhost/db",
        openai_api_key="",
        commandcode_api_key="",
    )
    base.update(overrides)
    return Settings(**base)


# ---------------------------------------------------------------------------
# Free-model identification
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "model_id",
    [
        "minimax/minimax-m3.1-flash:free",
        "reflection/beam:free",
        "poolside/laguna-s-2.1-free",
        "stealth/glyph-cluster:free",
        "some-provider/anything-free",
    ],
)
def test_free_suffix_markers_are_detected(model_id: str):
    assert is_free_model_id(model_id) is True


@pytest.mark.parametrize(
    "model_id",
    [
        "minimax/minimax-m3.1-flash",  # paid twin of the free default
        "deepseek/deepseek-v4.1-flash",
        "meta/muse-spark-open",
        "gpt-5.5",
        "free-but-not-last-segment/free-model",
    ],
)
def test_paid_ids_are_not_free(model_id: str):
    assert is_free_model_id(model_id) is False


def test_default_model_is_a_catalogued_free_model():
    spec = catalog_lookup(DEFAULT_COMMANDCODE_MODEL)
    assert spec is not None and spec.free is True
    assert free_model_ids()[0] == DEFAULT_COMMANDCODE_MODEL


def test_free_catalog_entries_carry_provenance():
    for spec in COMMANDCODE_FREE_MODELS:
        assert spec.free is True
        assert spec.context_window > 0
        assert spec.source.startswith("https://commandcode.ai/")
    # The daily-capped stealth model must stay visible as such: batch work
    # (word notes) cannot be pointed at it without hitting the cap.
    glyph = catalog_lookup("stealth/glyph-cluster:free")
    assert glyph is not None and glyph.daily_limit == 100


# ---------------------------------------------------------------------------
# Provider resolution
# ---------------------------------------------------------------------------


def test_commandcode_key_wins_over_legacy_openai():
    s = _settings(commandcode_api_key="cc-key", openai_api_key="legacy-key")
    provider = resolve_provider(s)
    assert provider is not None
    assert provider.name == "commandcode"
    assert provider.base_url == COMMANDCODE_DEFAULT_BASE_URL
    assert provider.model == DEFAULT_COMMANDCODE_MODEL
    assert provider.api == "openai-completions"
    assert provider.timeout == float(s.llm_call_timeout)


def test_empty_commandcode_key_falls_back_to_openai():
    s = _settings(
        openai_api_key="legacy-key",
        openai_base_url="https://legacy.example/v1",
        openai_model="legacy-model",
    )
    provider = resolve_provider(s)
    assert provider is not None
    assert provider.name == "openai-compatible"
    assert provider.base_url == "https://legacy.example/v1"
    assert provider.model == "legacy-model"


def test_no_keys_means_no_provider():
    assert resolve_provider(_settings()) is None


def test_custom_base_url_and_model_override_defaults():
    s = _settings(
        commandcode_api_key="cc-key",
        commandcode_base_url="https://proxy.internal/provider/v1/",
        commandcode_model="reflection/beam:free",
    )
    provider = resolve_provider(s)
    assert provider is not None
    assert provider.base_url == "https://proxy.internal/provider/v1/"
    assert provider.model == "reflection/beam:free"
    assert provider.models_url == "https://proxy.internal/provider/v1/models"


# ---------------------------------------------------------------------------
# Task → model routing
# ---------------------------------------------------------------------------


def test_tasks_default_to_the_provider_model():
    s = _settings(commandcode_api_key="cc-key")
    for task in (TASK_DEFAULT, TASK_TRANSLATION, TASK_WORD_NOTES, TASK_CLASSIFICATION, TASK_EDITORIAL):
        assert resolve_model(s, task) == DEFAULT_COMMANDCODE_MODEL


def test_task_override_wins_without_touching_other_tasks():
    s = _settings(commandcode_api_key="cc-key", llm_model_editorial="reflection/beam:free")
    assert resolve_model(s, TASK_EDITORIAL) == "reflection/beam:free"
    assert resolve_model(s, TASK_TRANSLATION) == DEFAULT_COMMANDCODE_MODEL


def test_unknown_task_falls_back_to_default_model():
    s = _settings(commandcode_api_key="cc-key", commandcode_model="reflection/beam:free")
    assert resolve_model(s, "not-a-task") == "reflection/beam:free"


def test_model_resolution_without_provider_returns_legacy_model():
    s = _settings(openai_model="gpt-4o")
    assert resolve_model(s, TASK_TRANSLATION) == "gpt-4o"


# ---------------------------------------------------------------------------
# Client kwargs / ZDR header
# ---------------------------------------------------------------------------


def _provider(**overrides) -> ProviderSpec:
    base = dict(
        name="commandcode",
        api="openai-completions",
        base_url=COMMANDCODE_DEFAULT_BASE_URL,
        api_key="cc-key",
        model=DEFAULT_COMMANDCODE_MODEL,
        timeout=90.0,
    )
    base.update(overrides)
    return ProviderSpec(**base)


def test_build_client_kwargs_matches_openai_sdk_contract():
    kwargs = build_client_kwargs(_provider(timeout=42.0))
    assert kwargs["api_key"] == "cc-key"
    assert kwargs["base_url"] == COMMANDCODE_DEFAULT_BASE_URL
    assert kwargs["timeout"] == 42.0
    assert "default_headers" not in kwargs  # ZDR is opt-in


def test_zdr_header_only_when_explicitly_enabled():
    assert provider_headers(_provider(zdr=True)) == {"x-cmd-zdr": "1"}
    assert provider_headers(_provider(zdr=False)) == {}
    # The legacy provider has no Command Code ZDR switch.
    legacy = _provider(name="openai-compatible", zdr=True)
    assert provider_headers(legacy) == {}
    assert build_client_kwargs(_provider(zdr=True))["default_headers"] == {"x-cmd-zdr": "1"}


def test_mask_secret_never_leaks_raw_key():
    # 明显伪造的 key：形状与真 key 一致（``user_`` 前缀 + 32 位），但**不含任何真实片段**。
    # 真 key 一旦进仓库，推送前就必须轮换，而历史里那份片段仍然是泄露。
    raw = FAKE_COMMANDCODE_KEY
    masked = mask_secret(raw)
    assert masked.startswith("user_F")
    assert masked.endswith("3333")
    assert raw not in masked
    # 中段必须被抹掉，只留前缀 6 位与后缀 4 位。
    assert "FAKE0000fake1111" not in masked
    assert mask_secret("short") == "***"
    assert mask_secret("") == ""


# ---------------------------------------------------------------------------
# Live /models mapping + catalog audit
# ---------------------------------------------------------------------------


def test_curated_model_keeps_catalog_metadata():
    spec = model_spec_from_payload(
        {
            "id": "minimax/minimax-m3.1-flash:free",
            "name": "MiniMax M3.1 Flash",
            "context_length": 1_000_000,
            "supported_endpoints": ["/chat/completions"],
        }
    )
    assert spec.zdr is True
    assert spec.daily_limit is None
    assert spec.free is True
    assert "pricing-limits" in spec.source


def test_unknown_model_is_mapped_from_payload():
    free_spec = model_spec_from_payload({"id": "newco/new-model:free", "context_length": 128000})
    assert free_spec.free is True
    assert free_spec.context_window == 128_000
    paid_spec = model_spec_from_payload({"id": "openai/gpt-x", "name": "GPT X"})
    assert paid_spec.free is False
    assert paid_spec.context_window == 0


def test_audit_reports_withdrawn_and_new_free_models():
    remote = [
        model_spec_from_payload({"id": DEFAULT_COMMANDCODE_MODEL}),
        model_spec_from_payload({"id": "brand/new:free"}),
    ]
    audit = audit_free_catalog(remote)
    assert DEFAULT_COMMANDCODE_MODEL not in audit["missing"]
    assert "reflection/beam:free" in audit["missing"]
    assert audit["uncatalogued_free"] == ["brand/new:free"]


def test_provider_summary_masks_the_key():
    s = _settings(commandcode_api_key=FAKE_COMMANDCODE_KEY)
    summary = provider_summary(s)
    assert summary["configured"] is True
    assert FAKE_COMMANDCODE_KEY not in str(summary)
    assert set(summary["tasks"]) == {TASK_TRANSLATION, TASK_WORD_NOTES, TASK_CLASSIFICATION, TASK_EDITORIAL}


# ---------------------------------------------------------------------------
# Service wiring (AIService / TranslationService)
# ---------------------------------------------------------------------------


def test_ai_service_uses_commandcode_provider(monkeypatch):
    from app.services import ai_service as mod

    monkeypatch.setattr(mod.settings, "commandcode_api_key", "cc-key")
    monkeypatch.setattr(mod.settings, "commandcode_base_url", COMMANDCODE_DEFAULT_BASE_URL)
    monkeypatch.setattr(mod.settings, "commandcode_model", DEFAULT_COMMANDCODE_MODEL)
    monkeypatch.setattr(mod.settings, "commandcode_zdr", False)

    service = mod.AIService()
    assert service.provider is not None and service.provider.name == "commandcode"
    assert service.client is not None
    assert str(service.client.base_url).rstrip("/") == COMMANDCODE_DEFAULT_BASE_URL
    assert service.model == DEFAULT_COMMANDCODE_MODEL


def test_ai_service_falls_back_to_legacy_openai(monkeypatch):
    from app.services import ai_service as mod

    monkeypatch.setattr(mod.settings, "commandcode_api_key", "")
    monkeypatch.setattr(mod.settings, "openai_api_key", "legacy-key")
    monkeypatch.setattr(mod.settings, "openai_base_url", "https://legacy.example/v1")
    monkeypatch.setattr(mod.settings, "openai_model", "legacy-model")

    service = mod.AIService()
    assert service.provider is not None and service.provider.name == "openai-compatible"
    assert str(service.client.base_url).rstrip("/") == "https://legacy.example/v1"
    assert service.model == "legacy-model"


def test_ai_service_starts_keyless_for_tests_and_ci(monkeypatch):
    """No key must not crash import/construction — the call fails loudly later."""
    from app.services import ai_service as mod

    monkeypatch.setattr(mod.settings, "commandcode_api_key", "")
    monkeypatch.setattr(mod.settings, "openai_api_key", "")

    service = mod.AIService()
    assert service.client is None
    assert service.provider is None


def test_translation_commandcode_engine_resolves_from_settings(monkeypatch):
    from app.core.config import get_settings
    from app.services.translation import TranslationService
    from app.services.translation.engines import BUILTIN_ENGINES

    assert "commandcode" in BUILTIN_ENGINES
    s = get_settings()
    monkeypatch.setattr(s, "commandcode_api_key", "cc-key")
    monkeypatch.setattr(s, "commandcode_base_url", COMMANDCODE_DEFAULT_BASE_URL)
    monkeypatch.setattr(s, "commandcode_model", DEFAULT_COMMANDCODE_MODEL)
    monkeypatch.setattr(s, "llm_model_translation", "")
    monkeypatch.setattr(s, "commandcode_zdr", False)

    cfg = TranslationService._resolve_engine("commandcode", s)
    assert cfg.api_key == "cc-key"
    assert cfg.base_url == COMMANDCODE_DEFAULT_BASE_URL
    assert cfg.model == DEFAULT_COMMANDCODE_MODEL
    assert cfg.headers == {}


def test_translation_commandcode_engine_honours_translation_model_override(monkeypatch):
    from app.core.config import get_settings
    from app.services.translation import TranslationService

    s = get_settings()
    monkeypatch.setattr(s, "commandcode_api_key", "cc-key")
    monkeypatch.setattr(s, "llm_model_translation", "reflection/beam:free")
    monkeypatch.setattr(s, "commandcode_zdr", True)

    cfg = TranslationService._resolve_engine("commandcode", s)
    assert cfg.model == "reflection/beam:free"
    assert cfg.headers == {"x-cmd-zdr": "1"}


def test_translation_commandcode_engine_requires_a_key(monkeypatch):
    from app.core.config import get_settings
    from app.core.errors import ServiceUnavailableError
    from app.services.translation import TranslationService

    s = get_settings()
    monkeypatch.setattr(s, "commandcode_api_key", "")
    with pytest.raises(ServiceUnavailableError, match="COMMANDCODE_API_KEY"):
        TranslationService._resolve_engine("commandcode", s)
