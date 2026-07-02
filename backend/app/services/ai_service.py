import asyncio
import json
import logging
import re
import threading

import openai
from openai import NOT_GIVEN, AsyncOpenAI

from app.core.config import get_settings

logger = logging.getLogger(__name__)

settings = get_settings()

# Hard timeout (seconds) for a single LLM chat call. Bounds worst-case latency
# so a slow/unreachable endpoint can't hang a request indefinitely.
LLM_TIMEOUT = 60.0


class AIServiceError(Exception):
    """Raised when an LLM call fails after all retries are exhausted."""


def _normalize_sentence(s: str) -> str:
    """Lowercase, strip sentence-ending punctuation, and collapse whitespace.

    Used to grade sentence_building answers structurally: the user's reordered
    tokens should match the expected sentence once punctuation/case are ignored.
    """
    s = (s or "").lower().strip()
    # Strip leading/trailing sentence punctuation (. ! ? , ; :) and quotes.
    s = re.sub(r"^[.\,!?:;\"'` ]+|[.\,!?:;\"'` ]+$", "", s)
    return re.sub(r"\s+", " ", s)


class AIService:
    def __init__(self):
        # Don't construct the client when no key is configured — this keeps
        # module import (e.g. vocabulary_service builds a singleton at import
        # time) working in keyless environments such as tests/CI. Any actual
        # call then fails loudly via _chat instead of silently returning fake
        # zero scores.
        if not settings.openai_api_key:
            self.client = None
            self.model = settings.openai_model
            return
        client_kwargs = {"api_key": settings.openai_api_key}
        if settings.openai_base_url:
            client_kwargs["base_url"] = settings.openai_base_url
        self.client = AsyncOpenAI(**client_kwargs)
        self.model = settings.openai_model
        # Lazy cache of secondary-engine clients (qwen/hy_mt2/custom) used by
        # generate_word_notes_bulk for dual-API concurrent prewarm. Maps engine
        # name -> (AsyncOpenAI, model). "agnes" is NOT cached here; it reuses
        # self.client/self.model.
        self._engine_clients: dict[str, tuple[AsyncOpenAI, str]] = {}

    def _get_engine_client(self, name: str) -> tuple[AsyncOpenAI, str]:
        """Return ``(client, model)`` for an engine, creating it lazily.

        ``agnes`` reuses this service's own client/model. Other names resolve
        through the translation engine registry via the public
        ``TranslationService.resolve_engine_client()`` method so they share
        the same creds/base_url/model as subtitle translation — no hardcoded
        keys. Raises ``AIServiceError`` if an engine is unconfigured.
        """
        if name == "agnes":
            if self.client is None:
                raise AIServiceError("OPENAI_API_KEY not configured (agnes engine)")
            return self.client, self.model
        cached = self._engine_clients.get(name)
        if cached is not None:
            return cached
        # Imported here to avoid a circular import at module load time.
        from app.services.translation import TranslationService

        try:
            client, model = TranslationService.resolve_engine_client(name)
        except ValueError as exc:
            raise AIServiceError(str(exc)) from exc
        self._engine_clients[name] = (client, model)
        return self._engine_clients[name]

    async def _chat(self, system: str, user: str, temperature: float = 0.3, response_format: dict | None = None) -> str:
        if self.client is None:
            raise AIServiceError("OPENAI_API_KEY not configured")
        import time

        t0 = time.monotonic()
        try:
            # Hard timeout: a slow endpoint must not hang the request. 60s is
            # ample for normal chat calls while bounding worst-case latency.
            resp = await self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
                temperature=temperature,
                response_format=response_format if response_format else NOT_GIVEN,
                timeout=LLM_TIMEOUT,
            )
            content = resp.choices[0].message.content
            logger.info("_chat ok model=%s elapsed=%.2fs", self.model, time.monotonic() - t0)
            if content is None:
                return ""
            return content
        except openai.APITimeoutError as e:
            logger.error("_chat TIMEOUT after %.2fs: %s", time.monotonic() - t0, e)
            raise AIServiceError(f"AI service timeout (LLM 未在 {LLM_TIMEOUT:.0f}s 内响应)") from e
        except openai.APIStatusError as e:
            logger.error(f"AI API error: {e.status_code} - {e.message}")
            raise AIServiceError(f"AI service error: {e.status_code}") from e
        except openai.APIConnectionError as e:
            logger.error(f"AI connection error: {e}")
            raise AIServiceError("AI service unavailable") from e
        except Exception as e:
            logger.error(f"Unexpected AI error: {e}")
            raise AIServiceError(f"AI service error: {e!s}") from e

    async def grammar_analyze_batch(self, texts: list[str]) -> list[str | None]:
        if not texts:
            return []

        payload = json.dumps(texts, ensure_ascii=False)
        system = (
            "You are an English grammar teacher for Chinese learners. For each sentence, "
            "identify ONE most noteworthy grammar point worth explaining (in Chinese). "
            "Skip trivial sentences. Return JSON array of strings (or null for no note)."
        )
        user = f"Analyze:\n{payload}\nReturn JSON array only."

        result = await self._chat(system, user)
        try:
            return json.loads(self._extract_json(result))
        except json.JSONDecodeError:
            return [None] * len(texts)

    async def evaluate_difficulty(self, full_text: str) -> str:
        system = (
            "You are an English proficiency evaluator. Read the text and assign a CEFR level: "
            "A1, A2, B1, B2, C1, or C2. Consider vocabulary, sentence complexity, and speech speed "
            "indicators. Return ONLY the level code, nothing else."
        )
        result = await self._chat(system, full_text[:3000])
        level = result.strip().upper()
        if level in ("A1", "A2", "B1", "B2", "C1", "C2"):
            return level
        return "B1"

    async def generate_quiz(self, text: str) -> list[dict]:
        system = (
            "You are an English test generator. Based on the video transcript provided, "
            "generate 3 questions: 1 comprehension multiple-choice, 1 fill-in-the-blank "
            "(listening gap-fill), 1 dictation sentence. "
            "Return JSON array with fields: type (comprehension/fill_blank/dictation), "
            "question (string), options (array of 4 for comprehension), answer (string)."
        )
        result = await self._chat(system, text[:4000])
        try:
            return json.loads(self._extract_json(result))
        except json.JSONDecodeError as e:
            raise AIServiceError("AI 返回测验格式无效") from e

    async def word_context_meaning(self, word: str, sentence: str) -> str:
        system = (
            "You are an English dictionary for Chinese learners. Given a word and the sentence "
            "it appears in, provide: phonetic transcription, the exact meaning in this context "
            "(in Chinese), and one more example sentence. Keep it concise — under 80 Chinese characters."
        )
        user = f"Word: {word}\nSentence: {sentence}"
        return await self._chat(system, user)

    async def extract_difficulty_words(self, sentence: str) -> list[str]:
        """Extract 0-3 challenging words from a sentence for Chinese learners."""
        system = (
            "You are an English teacher specializing in Chinese learners (B1 level). "
            "From the given sentence, extract 0-3 words that are most challenging. "
            "Consider vocabulary rarity, idioms, phrasal verbs. "
            "Return a JSON array of strings. If no challenging words, return []."
        )
        result = await self._chat(system, sentence)
        try:
            parsed = json.loads(self._extract_json(result))
            return parsed if isinstance(parsed, list) else []
        except json.JSONDecodeError as e:
            raise AIServiceError("AI 返回难词列表格式无效") from e

    async def assistant_daily_summary(self, stats: dict) -> str:
        system = (
            "You are a friendly, encouraging English learning coach for Chinese users. "
            "Based on today's learning stats, write a short (2-3 sentences) summary in Chinese. "
            "Be specific about what was practiced and give one suggestion for tomorrow."
        )
        return await self._chat(system, json.dumps(stats, ensure_ascii=False))

    async def assistant_recommend(self, user_level: str, history_summary: str) -> str:
        system = (
            "Based on the user's English level and learning history, write a short "
            "recommendation (in Chinese) for what type of video they should learn next. "
            "Be specific — mention a topic or scenario. Under 50 characters."
        )
        user = f"Level: {user_level}\nHistory: {history_summary}"
        return await self._chat(system, user)

    def _extract_json(self, text: str) -> str:
        """Extract JSON from LLM response, handling markdown code fences."""
        text = text.strip()
        if text.startswith("```"):
            lines = text.split("\n")
            lines = lines[1:] if len(lines) > 1 else lines
            if lines[-1].strip() == "```":
                lines = lines[:-1]
            text = "\n".join(lines)
        return text.strip()

    async def _cache_get(self, key: str) -> str | None:
        try:
            from app.core.redis import get_redis

            redis = get_redis()
            return await redis.get(f"ai_cache:{key}")
        except Exception:
            return None

    async def _cache_set(self, key: str, value: str, ttl: int = 3600) -> None:
        try:
            from app.core.redis import get_redis

            redis = get_redis()
            await redis.setex(f"ai_cache:{key}", ttl, value)
        except Exception:
            pass  # Cache failure is non-critical

    async def enrich_vocabulary_word(self, word: str, context_sentence: str = "") -> dict:
        """Enrich a vocabulary word with AI-generated definitions and usage.

        Results are cached in Redis (7-day TTL).

        Returns:
            Dict with definition, translation, part_of_speech, ipa,
            example_sentences, collocations, difficulty_level.
        """
        import hashlib

        cache_key = hashlib.sha256(f"enrich:{word}".encode()).hexdigest()
        cached = await self._cache_get(f"vocab_enrich:{cache_key}")
        if cached:
            return json.loads(cached)

        system = (
            "You are an English dictionary for Chinese learners. Given a word and optional context sentence, "
            "return JSON with:\n"
            '- "definition": Chinese definition of the word in this context\n'
            '- "translation": Chinese translation\n'
            '- "part_of_speech": noun/verb/adj/adv/prep/conj/etc\n'
            '- "ipa": IPA phonetic transcription\n'
            '- "example_sentences": array of 3 example sentences using the word\n'
            '- "collocations": array of 3 common collocations\n'
            '- "difficulty_level": CEFR level A1-C2\n\n'
            "Return JSON only."
        )
        user = f"Word: {word}\nContext: {context_sentence}" if context_sentence else f"Word: {word}"

        try:
            result = await self._chat(system, user, response_format={"type": "json_object"})
            parsed = json.loads(self._extract_json(result))
            parsed.setdefault("definition", "")
            parsed.setdefault("translation", "")
            parsed.setdefault("part_of_speech", "")
            parsed.setdefault("ipa", "")
            parsed.setdefault("example_sentences", [])
            parsed.setdefault("collocations", [])
            parsed.setdefault("difficulty_level", "B1")
            await self._cache_set(f"vocab_enrich:{cache_key}", json.dumps(parsed, ensure_ascii=False))
            return parsed
        except json.JSONDecodeError as e:
            raise AIServiceError("AI 返回词汇释义格式无效") from e
        # AIServiceError from _chat propagates as-is.

    async def gloss_word_context(self, word: str, context_sentence: str = "") -> dict:
        """Generate context-sensitive learning notes for a word in a subtitle.

        Unlike ``enrich_vocabulary_word`` (word-only cache), this is context-
        sensitive — the same word in different sentences may carry different
        meanings — so the cache key includes the sentence hash. Results live in
        a separate ``word_gloss:`` Redis namespace to stay decoupled.

        Returns a dict with:
            contextual_note: the word's meaning in THIS context (Chinese)
            pitfalls:        common mistakes / confusions for Chinese learners (Chinese)
            knowledge:       etymology / usage extension / collocations (Chinese)
        """
        import hashlib

        cache_key = hashlib.sha256(f"gloss:{word}:{context_sentence}".encode()).hexdigest()
        cached = await self._cache_get(f"word_gloss:{cache_key}")
        if cached:
            return json.loads(cached)

        system = (
            "You are an English learning tutor for Chinese students preparing for CET/高考/考研. "
            "Given a word and the sentence it appears in, return JSON with:\n"
            '- "contextual_note": the exact meaning of the word in THIS context, in Chinese (concise)\n'
            '- "pitfalls": common mistakes or confusions Chinese learners make with this word, in Chinese\n'
            '- "knowledge": a short usage extension — collocation, etymology, or register, in Chinese\n'
            "Keep each field under 120 Chinese characters. Return JSON only."
        )
        user = f"Word: {word}\nSentence: {context_sentence}" if context_sentence else f"Word: {word}"

        try:
            result = await self._chat(system, user, response_format={"type": "json_object"})
            parsed = json.loads(self._extract_json(result))
            parsed.setdefault("contextual_note", "")
            parsed.setdefault("pitfalls", "")
            parsed.setdefault("knowledge", "")
            await self._cache_set(f"word_gloss:{cache_key}", json.dumps(parsed, ensure_ascii=False))
            return parsed
        except json.JSONDecodeError as e:
            raise AIServiceError("AI 返回词汇语境释义格式无效") from e

    async def generate_practice_questions(
        self,
        subtitles_text: str,
        cet_words: list[dict],
        exam_level: str,
        count: int = 5,
        exam_examples: list[str] | None = None,
    ) -> list[dict]:
        """Generate CET/高考/考研 practice questions from a video transcript.

        Produces a mix of content Q&A and word fill-in-the-blank. The
        fill-in-the-blank gaps use words from ``cet_words`` (the target exam
        level), so practicing reinforces the annotated vocabulary. The whole
        transcript is the context for comprehension questions. Optional
        ``exam_examples`` are 真题 (past-paper) sentences the generator may
        adapt into fill-in-the-blank questions for an authentic exam flavor
        (source layer of the 真题 integration).

        Args:
            subtitles_text: concatenated English subtitle lines (the transcript).
            cet_words: list of {word, translation} for the target level — used
                as fill-in-the-blank gaps. May be empty.
            exam_level: canonical level key (e.g. "cet4") for prompt context.
            count: total questions to generate.
            exam_examples: optional 真题 sentences to seed authentic questions.

        Returns:
            list of {type: "qa"|"fill_blank", question, answer, options?, cet_words[]}
        """
        # Trim a long transcript so the prompt stays bounded.
        transcript = (subtitles_text or "").strip()[:6000]
        if not transcript:
            return []

        word_block = (
            "\n".join(f"{i + 1}. {w['word']} ({w.get('translation', '')})" for i, w in enumerate(cet_words))
            if cet_words
            else "(no target-level words available)"
        )
        examples_block = (
            "\n".join(f"- {s}" for s in (exam_examples or [])[:5])
            if exam_examples
            else "(no past-paper examples available)"
        )

        system = (
            "You are an English exam (CET/高考/考研) question generator for Chinese learners. "
            "Given a video transcript and a list of target-level vocabulary, generate practice questions.\n\n"
            "Produce a mix of these types:\n"
            "- qa: a comprehension question about the transcript content. Include answer (a concise "
            "Chinese or English answer). Optionally add options (4 strings) to make it multiple-choice.\n"
            "- fill_blank: a fill-in-the-blank sentence drawn from the transcript, with the gap being a "
            "word from the target vocabulary list. answer is the gap word (its lemma). Optionally add "
            "options (4 strings) for multiple-choice. Add cet_words listing the target words used. "
            "You may adapt a provided past-paper (真题) sentence into a fill-in-the-blank question when it "
            "contains a target word, for an authentic exam flavor.\n"
            "- reading: a short reading-comprehension question. Build a 2-4 sentence passage that "
            "paraphrases or expands on part of the transcript (put it in the passage field), then ask a "
            "comprehension question about it. answer is the answer; options (4 strings) makes it "
            "multiple-choice.\n"
            "- sentence_building: a sentence-building / 造句 question. Take a short sentence from the "
            "transcript, split it into word tokens, and put the shuffled tokens in tokens. answer is "
            "the correct sentence (the tokens in order, space-joined, original punctuation stripped). "
            "Do not include options for this type.\n\n"
            'Return a JSON object {"questions": [ ... ]}. Each question object has: type, question, '
            "answer, options (array or null), cet_words (array or null), passage (string or null, "
            "reading only), tokens (array of strings or null, sentence_building only). Keep questions "
            "answerable from the transcript. Do not reveal the answer in the question text."
        )
        user = (
            f"Exam level: {exam_level}\n"
            f"Number of questions: {count}\n"
            f"Target vocabulary:\n{word_block}\n\n"
            f"Past-paper sentences (may adapt into fill-in-the-blank):\n{examples_block}\n\n"
            f"Transcript:\n{transcript}"
        )

        try:
            result = await self._chat(system, user, response_format={"type": "json_object"})
            parsed = json.loads(self._extract_json(result))
            if isinstance(parsed, list):
                questions = parsed
            elif isinstance(parsed, dict) and "questions" in parsed:
                questions = parsed["questions"]
            else:
                questions = []
            # Normalize fields so callers can rely on their presence.
            normalized = []
            for q in questions:
                if not isinstance(q, dict) or not str(q.get("question", "")).strip():
                    continue
                normalized.append(
                    {
                        "type": q.get("type", "qa"),
                        "question": q["question"],
                        "answer": q.get("answer", ""),
                        "options": q.get("options") or None,
                        "cet_words": q.get("cet_words") or [],
                        "passage": q.get("passage") or None,
                        "tokens": q.get("tokens") or None,
                    }
                )
            return normalized
        except json.JSONDecodeError as e:
            raise AIServiceError("AI 返回练习题格式无效") from e

    async def generate_word_notes_bulk(
        self,
        items: list[dict],
        source: str,
        level: str = "global",
    ) -> list[dict]:
        """Pre-generate AI learning notes for a batch of words in one LLM call.

        Each item is {word, translation, context_sentence?}. The optional
        context_sentence gives the model a video-specific cue (e.g. "She runs
        a company"); when omitted the notes are context-agnostic (global).

        The model is asked for a JSON object {"notes": [...]} aligned to the
        input order, each with {word, contextual_note, pitfalls, knowledge}
        (all short Chinese strings). The returned list is in the same order as
        ``items``; missing entries are filled with empty strings so the caller
        can upsert by position.

        Used by:
          * ``finalize_video.prewarm_notes`` — video:{id} context, batch per video
          * ``scripts/precompute_global_word_notes.py`` — 'global' context,
            one-shot preheat of all ECDICT exam words
        """
        if not items:
            return []
        # Bound the batch so a single prompt stays under the model's context
        # window. 15 fits comfortably with sentence context; bigger batches
        # get worse per-word quality.
        batch_size = 15
        batches = [items[i : i + batch_size] for i in range(0, len(items), batch_size)]

        # Engines to fan out across concurrently (e.g. agnes + qwen). Each
        # engine gets its own concurrency semaphore so we don't hammer one
        # endpoint. Batches are round-robin assigned to engines; results are
        # gathered and flattened in original batch order.
        engines = [e.strip() for e in settings.prewarm_engines.split(",") if e.strip()] or ["agnes"]
        # Per-engine in-flight limit. Shared dict so all batches for an engine
        # funnel through the same gate.
        semaphores: dict[str, asyncio.Semaphore] = {
            e: asyncio.Semaphore(max(1, settings.prewarm_concurrency)) for e in engines
        }

        async def _run(idx: int, batch: list[dict], engine: str) -> tuple[int, list[dict]]:
            # agnes goes through self._chat (so it stays mockable in tests and
            # reuses the service's own client/model); secondary engines bypass
            # _chat and call their own client directly.
            if engine == "agnes":
                client, model = None, None
            else:
                client, model = self._get_engine_client(engine)
            async with semaphores[engine]:
                notes = await self._generate_word_notes_one_batch(batch, source, level, client, model)
            return idx, notes

        tasks = [_run(idx, batch, engines[idx % len(engines)]) for idx, batch in enumerate(batches)]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        out: list[dict] = []
        failures = 0
        for r in results:
            if isinstance(r, Exception):
                failures += 1
                logger.warning("word-notes batch failed (%s); skipping", r)
                continue
            out.extend(r[1])
        if failures:
            logger.warning("prewarm: %d/%d batches failed", failures, len(batches))
        return out

    async def _generate_word_notes_one_batch(
        self,
        batch: list[dict],
        source: str,
        level: str,
        client: AsyncOpenAI | None = None,
        model: str | None = None,
    ) -> list[dict]:
        """One LLM round-trip for a single batch. See ``generate_word_notes_bulk``.

        ``client``/``model`` default to this service's agnes client so the
        dual-engine fan-out in ``generate_word_notes_bulk`` can route a batch
        to a secondary engine (qwen, ...) by passing them explicitly.
        """
        word_block = "\n".join(
            f"{i + 1}. {w['word']} ({w.get('translation', '')})\n   Context: {w.get('context_sentence', '') or '(none)'}"
            for i, w in enumerate(batch)
        )
        if source == "global":
            scope_line = "These are general-purpose notes for any context."
        else:
            scope_line = (
                f"These notes are for the word in the specific video context shown above "
                f"(source: {source}). Adapt the meaning to that context."
            )

        system = (
            "You are an English learning tutor for Chinese students preparing for CET/高考/考研. "
            "For each input word, return JSON with three short Chinese fields.\n\n"
            '- "contextual_note": the word\'s meaning in the given context (1 sentence, under 50 字)\n'
            '- "pitfalls": 1-2 common mistakes Chinese learners make with this word (under 60 字)\n'
            '- "knowledge": 1 short usage tip — collocation, etymology, or register (under 60 字)\n\n'
            'Return a JSON object {"notes": [{"word": ..., "contextual_note": ..., "pitfalls": ..., "knowledge": ...}, ...]} '
            "with exactly one entry per input word, in the same order. Keep Chinese compact."
        )
        user = f"Source: {source}\nLevel: {level}\n{scope_line}\n\nWords:\n{word_block}"

        try:
            if client is not None:
                # Secondary engine (qwen, ...) — bypass self._chat and call
                # the passed client directly so the call uses its own model
                # and endpoint.
                import time as _time

                t0 = _time.monotonic()
                resp = await client.chat.completions.create(
                    model=model or self.model,
                    messages=[
                        {"role": "system", "content": system},
                        {"role": "user", "content": user},
                    ],
                    temperature=0.3,
                    response_format={"type": "json_object"},
                    timeout=LLM_TIMEOUT,
                )
                result = resp.choices[0].message.content or ""
                logger.info("_chat ok model=%s elapsed=%.2fs", model, _time.monotonic() - t0)
            else:
                result = await self._chat(system, user, response_format={"type": "json_object"})
            parsed = json.loads(self._extract_json(result))
            notes = parsed.get("notes") if isinstance(parsed, dict) else None
            if not isinstance(notes, list):
                notes = []
        except json.JSONDecodeError as e:
            raise AIServiceError("AI 返回词汇注释格式无效") from e

        # Align to input order; fill missing entries with empty strings.
        aligned: list[dict] = []
        for i, w in enumerate(batch):
            n = notes[i] if i < len(notes) and isinstance(notes[i], dict) else {}
            aligned.append(
                {
                    "word": w["word"],
                    "level": level,
                    "context_source": source,
                    "contextual_note": str(n.get("contextual_note") or "").strip(),
                    "pitfalls": str(n.get("pitfalls") or "").strip(),
                    "knowledge": str(n.get("knowledge") or "").strip(),
                }
            )
        return aligned

    async def grade_answer(self, question: dict, user_answer: str) -> dict:
        """Grade a single practice-question answer.

        Fill-in-the-blank is graded leniently (lemma / case / tense tolerated);
        open-ended Q&A is graded by the AI for semantic equivalence. Returns
        {correct: bool, explanation: str}.
        """
        ua = (user_answer or "").strip()
        expected = (question.get("answer") or "").strip()

        # sentence_building: grade the token order locally (no AI). Accept the
        # answer if the user's tokens match the expected sentence ignoring case
        # and surrounding punctuation. This is a structural check, not semantic.
        if question.get("type") == "sentence_building" and expected:
            ua_norm = _normalize_sentence(ua)
            exp_norm = _normalize_sentence(expected)
            correct = ua_norm == exp_norm
            return {
                "correct": correct,
                "explanation": f"正确句子：{expected}。" if not correct else f"正确，答案为 {expected}。",
            }

        # fill_blank: lenient local match first — avoids an AI call when obvious.
        if question.get("type") == "fill_blank" and expected:
            ua_norm = ua.lower().replace(" ", "")
            exp_norm = expected.lower().replace(" ", "")
            # Also accept a simple plural/ed/ing/inflexion variation.
            variants = {
                exp_norm,
                exp_norm + "s",
                exp_norm + "es",
                exp_norm + "ed",
                exp_norm + "ing",
                exp_norm.rstrip("s"),
                exp_norm.rstrip("ed"),
                exp_norm.rstrip("ing"),
            }
            if ua_norm in variants:
                return {"correct": True, "explanation": f"正确，答案为 {expected}。"}
            # Multiple-choice fill_blank: exact option match.
            options = question.get("options")
            if options:
                return {
                    "correct": ua.lower() == expected.lower(),
                    "explanation": f"正确答案：{expected}。",
                }

        # Multiple-choice qa: exact (option index already resolved by caller).
        if question.get("options") and expected:
            return {
                "correct": ua.lower() == expected.lower(),
                "explanation": f"正确答案：{expected}。",
            }

        # Open-ended: AI semantic grading.
        system = (
            "You are an English exam grader for Chinese learners. Judge whether the user's answer is "
            "semantically correct for the question. Return JSON: "
            '{"correct": bool, "explanation": a short Chinese explanation}. Be lenient on wording.'
        )
        user = f"Question: {question.get('question', '')}\nReference answer: {expected}\nUser answer: {ua}"
        try:
            result = await self._chat(system, user, response_format={"type": "json_object"})
            parsed = json.loads(self._extract_json(result))
            return {
                "correct": bool(parsed.get("correct", False)),
                "explanation": str(parsed.get("explanation", "")),
            }
        except json.JSONDecodeError:
            # Fall back to a lenient substring match.
            return {
                "correct": expected.lower() in ua.lower() or ua.lower() in expected.lower(),
                "explanation": f"参考答案：{expected}。",
            }

    async def generate_vocab_quiz(self, words: list[dict], quiz_type: str) -> list[dict]:
        """Generate vocabulary quiz questions from a list of words.

        Args:
            words: List of dicts with word, definition, translation.
            quiz_type: "multiple_choice", "spelling", "context_fill", "translation".

        Returns:
            List of question dicts with id, word, quiz_type, question, options, correct_answer_index.
        """
        if not words:
            return []

        word_list = "\n".join(
            f"{i + 1}. {w['word']} — {w.get('definition', '')} ({w.get('translation', '')})"
            for i, w in enumerate(words)
        )

        type_instructions = {
            "multiple_choice": (
                "For each word, create a multiple-choice question where the user must select "
                "the correct Chinese definition. Provide 4 options (1 correct + 3 distractors). "
                "Use definitions from OTHER words in the list as distractors when possible."
            ),
            "spelling": (
                "For each word, show its Chinese definition and the user must type the English word. "
                "Provide a hint (first letter + number of letters, e.g. 'a_______ (8 letters)')."
            ),
            "context_fill": (
                "For each word, create a fill-in-the-blank question using one of its example sentences. "
                "Replace the word with ____ and provide 4 word options (1 correct + 3 distractors)."
            ),
            "translation": (
                "For each word, show the English word and the user must select the correct Chinese translation. "
                "Provide 4 translation options (1 correct + 3 distractors from other words)."
            ),
        }

        instruction = type_instructions.get(quiz_type, type_instructions["multiple_choice"])

        system = (
            f"You are an English vocabulary quiz generator for Chinese learners. "
            f"Given a list of words with definitions and translations, generate quiz questions.\n\n"
            f"{instruction}\n\n"
            "Return a JSON array of objects, each with:\n"
            '- "id": a unique string identifier (use uuid format)\n'
            '- "word": the target word\n'
            '- "quiz_type": the quiz type\n'
            '- "question": the question text\n'
            '- "options": array of 4 strings (for multiple_choice, context_fill, translation types)\n'
            '- "correct_answer_index": index (0-3) of the correct option\n\n'
            "For spelling type, omit 'options' and 'correct_answer_index' and add 'hint' field instead."
        )

        user = f"Words:\n{word_list}\n\nQuiz type: {quiz_type}\nGenerate quiz questions for all words."

        try:
            result = await self._chat(system, user, response_format={"type": "json_object"})
            parsed = json.loads(self._extract_json(result))
            if isinstance(parsed, list):
                return parsed
            if isinstance(parsed, dict) and "questions" in parsed:
                return parsed["questions"]
            return []
        except json.JSONDecodeError as e:
            raise AIServiceError("AI 返回测验格式无效") from e
        # AIServiceError from _chat propagates as-is.


# --- Thread-safe singleton ---

_ai_service: AIService | None = None
_singleton_lock = threading.Lock()


def get_ai_service() -> AIService:
    """Return the shared AIService singleton.

    Use this everywhere instead of creating ``AIService()`` instances,
    so a single ``AsyncOpenAI`` client is reused across the process.
    Thread-safe for Celery workers that may call from multiple threads.
    """
    global _ai_service
    if _ai_service is None:
        with _singleton_lock:
            # Double-checked locking
            if _ai_service is None:
                _ai_service = AIService()
    return _ai_service
