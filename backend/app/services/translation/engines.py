"""Translation engine definitions.

Each engine is an OpenAI-compatible ``chat/completions`` endpoint.
``BUILTIN_ENGINES`` is a dict registry keyed by engine name.

Adding a new engine
-------------------
1. Add an entry to ``BUILTIN_ENGINES`` below.
2. Add ``translation_<name>_api_key`` to ``Settings`` in ``config.py``.
3. Add an ``elif`` branch in ``TranslationService._resolve_engine()``.
4. Set ``TRANSLATION_ENGINE=<name>`` in ``.env``.
"""

from dataclasses import dataclass


@dataclass
class EngineConfig:
    """Configuration for a single translation engine."""

    name: str  # Unique key, e.g. "hy_mt2"
    base_url: str  # OpenAI-compatible base URL
    model: str  # Model name sent in API request
    api_key: str = ""  # API key (populated from settings at runtime)
    temperature: float = 0.3  # LLM temperature for translation
    system_prompt: str = ""  # Override default prompt if non-empty
    label: str = ""  # Human-readable label for logging


# Default system prompt — same as the original AIService.translate_batch prompt
DEFAULT_TRANSLATION_PROMPT = (
    "You are a translator. Translate each English sentence into natural Chinese. "
    "Return a JSON array of strings. Keep the same order. If a sentence doesn't need "
    "translation (e.g., it's just a sound), return empty string."
)


BUILTIN_ENGINES: dict[str, EngineConfig] = {
    "hy_mt2": EngineConfig(
        name="hy_mt2",
        base_url="https://maas-api.cn-huabei-1.xf-yun.com/v2",
        model="xophunyuan7bmt",
        label="Hy-MT2-7B (iFLYTEK)",
    ),
    "qwen": EngineConfig(
        name="qwen",
        base_url="https://maas-api.cn-huabei-1.xf-yun.com/v2",
        model="xopqwen36v35b",
        label="Qwen3.6-35B (iFLYTEK)",
    ),
    "agnes": EngineConfig(
        name="agnes",
        # base_url / model / api_key are populated from OPENAI_* settings
        # for backward compatibility
        base_url="",
        model="",
        api_key="",
        label="Agnes 2.0 Flash",
    ),
    "custom": EngineConfig(
        name="custom",
        base_url="",
        model="",
        api_key="",
        label="Custom Endpoint",
    ),
}
