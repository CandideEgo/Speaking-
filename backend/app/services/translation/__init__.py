"""Pluggable translation engine for subtitle translation.

Usage::

    from app.services.translation import get_translation_service

    service = get_translation_service()
    results = await service.translate_batch(["Hello", "Goodbye"])

Engine selection is controlled by ``TRANSLATION_ENGINE`` in .env.
If ``TRANSLATION_FALLBACK_ENGINE`` is set, failures fall back automatically.
"""

import copy
import json
import threading

import structlog
from openai import AsyncOpenAI

from app.core.config import get_settings
from .engines import EngineConfig, BUILTIN_ENGINES, DEFAULT_TRANSLATION_PROMPT
from .json_sanitizer import sanitize_json

logger = structlog.get_logger()


class TranslationService:
    """Pluggable translation service using OpenAI-compatible engines.

    Always obtain via ``get_translation_service()`` — never instantiate directly.
    """

    def __init__(self) -> None:
        settings = get_settings()
        self._engine_name = settings.translation_engine or "agnes"
        self._fallback_name = settings.translation_fallback_engine or None
        self._batch_size = settings.translation_batch_size or 20

        self._engine = self._resolve_engine(self._engine_name, settings)
        self._fallback = (
            self._resolve_engine(self._fallback_name, settings)
            if self._fallback_name
            else None
        )

        # Create AsyncOpenAI client for each engine
        self._client = self._make_client(self._engine)
        self._fallback_client = (
            self._make_client(self._fallback) if self._fallback else None
        )

        logger.info(
            "TranslationService initialized",
            engine=self._engine.label,
            fallback=self._fallback.label if self._fallback else None,
            batch_size=self._batch_size,
        )

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def translate_batch(self, texts: list[str]) -> list[str | None]:
        """Translate a batch of English texts to Chinese.

        Falls back to the fallback engine if the primary fails to produce
        valid JSON with the correct number of results.
        """
        if not texts:
            return []

        result = await self._call_engine(self._client, self._engine, texts)
        if result is not None:
            return result

        # Try fallback
        if self._fallback and self._fallback_client:
            logger.warning(
                "Primary translation engine failed, trying fallback",
                primary=self._engine.name,
                fallback=self._fallback.name,
            )
            result = await self._call_engine(
                self._fallback_client, self._fallback, texts
            )
            if result is not None:
                return result

        # Both failed
        logger.error("All translation engines failed", count=len(texts))
        return [None] * len(texts)

    @property
    def engine_name(self) -> str:
        """Active engine name (for logging / diagnostics)."""
        return self._engine_name

    @property
    def batch_size(self) -> int:
        """Configured batch size."""
        return self._batch_size

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    async def _call_engine(
        self, client: AsyncOpenAI, engine: EngineConfig, texts: list[str]
    ) -> list[str | None] | None:
        """Call one engine. Returns parsed list or ``None`` on failure."""
        payload = json.dumps(texts, ensure_ascii=False)
        system = engine.system_prompt or DEFAULT_TRANSLATION_PROMPT
        user = f"Translate:\n{payload}\nReturn JSON array only."

        try:
            resp = await client.chat.completions.create(
                model=engine.model,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
                temperature=engine.temperature,
            )
            raw = resp.choices[0].message.content or ""
            cleaned = sanitize_json(raw)
            parsed = json.loads(cleaned)

            if isinstance(parsed, list) and len(parsed) == len(texts):
                return parsed

            # Length mismatch — log and treat as failure
            logger.warning(
                "Translation result length mismatch",
                engine=engine.name,
                expected=len(texts),
                got=len(parsed) if isinstance(parsed, list) else "not a list",
            )
            # If we got *more* results than expected, truncate
            if isinstance(parsed, list) and len(parsed) > len(texts):
                return parsed[: len(texts)]
            return None

        except json.JSONDecodeError as exc:
            logger.warning(
                "Translation JSON parse error",
                engine=engine.name,
                error=str(exc),
                raw_preview=raw[:200] if "raw" in dir() else "",
            )
            return None
        except Exception as exc:
            logger.warning(
                "Translation engine call failed",
                engine=engine.name,
                error=str(exc),
            )
            return None

    @staticmethod
    def _resolve_engine(name: str, settings) -> EngineConfig:
        """Look up an ``EngineConfig`` by name and fill in credentials from settings.

        Returns a **copy** so the original ``BUILTIN_ENGINES`` entry stays pristine.
        """
        if name not in BUILTIN_ENGINES:
            raise ValueError(
                f"Unknown translation engine: {name!r}. "
                f"Available: {list(BUILTIN_ENGINES.keys())}"
            )

        cfg = copy.deepcopy(BUILTIN_ENGINES[name])

        # Fill credentials from settings based on engine name
        if name == "hy_mt2":
            cfg.api_key = settings.translation_hymt2_api_key or cfg.api_key
        elif name == "qwen":
            cfg.api_key = settings.translation_qwen_api_key or cfg.api_key
        elif name == "agnes":
            # Backward compatibility: fall back to existing OPENAI_* vars
            cfg.base_url = cfg.base_url or settings.openai_base_url
            cfg.model = cfg.model or settings.openai_model
            cfg.api_key = cfg.api_key or settings.openai_api_key
        elif name == "custom":
            cfg.base_url = settings.translation_custom_base_url or cfg.base_url
            cfg.model = settings.translation_custom_model or cfg.model
            cfg.api_key = settings.translation_custom_api_key or cfg.api_key

        # Validate required fields
        if not cfg.api_key:
            raise ValueError(
                f"Translation engine {name!r} has no API key configured. "
                f"Set the appropriate TRANSLATION_*_API_KEY in .env."
            )
        if not cfg.base_url:
            raise ValueError(
                f"Translation engine {name!r} has no base_url configured. "
                f"Set the appropriate TRANSLATION_*_BASE_URL in .env."
            )
        if not cfg.model:
            raise ValueError(
                f"Translation engine {name!r} has no model configured. "
                f"Set the appropriate TRANSLATION_*_MODEL in .env."
            )

        return cfg

    @staticmethod
    def _make_client(engine: EngineConfig) -> AsyncOpenAI:
        """Create an ``AsyncOpenAI`` client for the given engine config."""
        kwargs: dict = {
            "api_key": engine.api_key,
            "timeout": 30.0,
        }
        if engine.base_url:
            kwargs["base_url"] = engine.base_url
        return AsyncOpenAI(**kwargs)


# ------------------------------------------------------------------
# Thread-safe singleton (same pattern as get_ai_service)
# ------------------------------------------------------------------

_translation_service: TranslationService | None = None
_singleton_lock = threading.Lock()


def get_translation_service() -> TranslationService:
    """Return the shared ``TranslationService`` singleton.

    Use this everywhere instead of creating ``TranslationService()`` instances,
    so a single set of ``AsyncOpenAI`` clients is reused across the process.
    Thread-safe for Celery workers that may call from multiple threads.
    """
    global _translation_service
    if _translation_service is None:
        with _singleton_lock:
            # Double-checked locking
            if _translation_service is None:
                _translation_service = TranslationService()
    return _translation_service


def reset_translation_service() -> None:
    """Reset the singleton (for testing or config hot-reload)."""
    global _translation_service
    with _singleton_lock:
        _translation_service = None
