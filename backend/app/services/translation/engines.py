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
    batch_size: int = 0  # Per-engine override; 0 = use global translation_batch_size


# Default system prompt — same as the original AIService.translate_batch prompt
DEFAULT_TRANSLATION_PROMPT = (
    "You are a translator. Translate each English sentence into natural Chinese. "
    "Return a JSON array of strings. Keep the same order. If a sentence doesn't need "
    "translation (e.g., it's just a sound), return empty string."
)

# Hy-MT2 has a tendency to merge multiple sentences into one translation.
# A stricter prompt enforces one-to-one mapping.
HYMT2_TRANSLATION_PROMPT = (
    "You are a sentence-by-sentence translator. "
    "For EACH input sentence, output EXACTLY ONE Chinese translation. "
    "Never combine or merge multiple sentences into one translation. "
    "The output JSON array MUST have the same length as the input. "
    "If the input has N sentences, you MUST output exactly N translations. "
    "If a sentence doesn't need translation (e.g., it's just a sound), return an empty string for that entry."
)


BUILTIN_ENGINES: dict[str, EngineConfig] = {
    "hy_mt2": EngineConfig(
        name="hy_mt2",
        base_url="https://maas-api.cn-huabei-1.xf-yun.com/v2",
        model="xophunyuan7bmt",
        label="Hy-MT2-7B (iFLYTEK)",
        system_prompt=HYMT2_TRANSLATION_PROMPT,
        batch_size=5,
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
        batch_size=5,
    ),
    "glm": EngineConfig(
        name="glm",
        base_url="https://maas-coding-api.cn-huabei-1.xf-yun.com/v2",
        model="xopglm51",
        label="GLM (iFLYTEK coding)",
        batch_size=5,
    ),
    "custom": EngineConfig(
        name="custom",
        base_url="",
        model="",
        api_key="",
        label="Custom Endpoint",
    ),
}
