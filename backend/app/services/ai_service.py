import json
import logging
import threading

import openai
from openai import NOT_GIVEN, AsyncOpenAI

from app.core.config import get_settings

logger = logging.getLogger(__name__)

settings = get_settings()


class AIServiceError(Exception):
    """Raised when an LLM call fails after all retries are exhausted."""


class AIService:
    def __init__(self):
        client_kwargs = {"api_key": settings.openai_api_key or "sk-placeholder"}
        if settings.openai_base_url:
            client_kwargs["base_url"] = settings.openai_base_url
        self.client = AsyncOpenAI(**client_kwargs)
        self.model = settings.openai_model

    async def _chat(self, system: str, user: str, temperature: float = 0.3, response_format: dict | None = None) -> str:
        try:
            resp = await self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
                temperature=temperature,
                response_format=response_format if response_format else NOT_GIVEN,
            )
            content = resp.choices[0].message.content
            if content is None:
                return ""
            return content
        except openai.APIStatusError as e:
            logger.error(f"AI API error: {e.status_code} - {e.message}")
            raise AIServiceError(f"AI service error: {e.status_code}") from e
        except openai.APIConnectionError as e:
            logger.error(f"AI connection error: {e}")
            raise AIServiceError("AI service unavailable") from e
        except Exception as e:
            logger.error(f"Unexpected AI error: {e}")
            raise AIServiceError(f"AI service error: {e!s}") from e

    async def translate_batch(self, texts: list[str]) -> list[str | None]:
        if not texts:
            return []

        payload = json.dumps(texts, ensure_ascii=False)
        system = (
            "You are a translator. Translate each English sentence into natural Chinese. "
            "Return a JSON array of strings. Keep the same order. If a sentence doesn't need "
            "translation (e.g., it's just a sound), return empty string."
        )
        user = f"Translate:\n{payload}\nReturn JSON array only."

        result = await self._chat(system, user)
        try:
            return json.loads(self._extract_json(result))
        except json.JSONDecodeError:
            return [None] * len(texts)

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
        except json.JSONDecodeError:
            return []

    async def pronunciation_feedback(self, original: str, user_transcript: str) -> dict:
        system = (
            "You are an English pronunciation coach for Chinese learners. Compare the original "
            "sentence with what the user actually said. Identify specific pronunciation errors, "
            "missing words, and give actionable advice in Chinese. "
            "Return JSON: { accuracy: 0-100, fluency: 0-100, completeness: 0-100, feedback: string }."
        )
        user_msg = f"Original: {original}\nUser said: {user_transcript}"
        result = await self._chat(system, user_msg)
        try:
            return json.loads(self._extract_json(result))
        except json.JSONDecodeError:
            return {"accuracy": 0, "fluency": 0, "completeness": 0, "feedback": "评分失败"}

    async def pronunciation_feedback_rubric(
        self,
        original: str,
        user_transcript: str,
        rubric_criteria: list[dict],
        mode: str,
        word_scores=None,
        metrics=None,
    ) -> dict:
        """Score speaking against a rubric with multiple criteria.

        rubric_criteria: list of dicts [{name, description, weight}]
        mode: "read_aloud" | "shadowing" | "free_speaking"
        Returns: {criteria_scores: [{criterion_name, score, feedback}], overall_feedback: string}
        Falls back to pronunciation_feedback on failure.
        """
        criteria_desc = "\n".join(
            f"- {c['name']} (weight {c.get('weight', 1.0)}): {c.get('description', '')}" for c in rubric_criteria
        )

        if mode == "read_aloud":
            mode_instruction = (
                "The user is reading aloud from a reference text. Compare the user's transcript "
                "against the original text. Focus on pronunciation accuracy, word omissions, "
                "substitutions, and insertions. Score each criterion based on how closely the "
                "user's speech matches the original."
            )
            user_msg = f"Original text: {original}\nUser said: {user_transcript}"
        elif mode == "shadowing":
            mode_instruction = (
                "The user is shadowing (repeating after) a reference text. Focus on rhythm, "
                "intonation, pace matching, and natural flow. The user should sound like they "
                "are echoing the original speaker. Score each criterion based on how well the "
                "user matches the rhythm and prosody of the original."
            )
            user_msg = f"Reference text: {original}\nUser said: {user_transcript}"
        elif mode == "free_speaking":
            mode_instruction = (
                "The user is speaking freely on a topic. There is no reference text to compare "
                "against. Evaluate coherence, grammar, vocabulary range, and fluency based solely "
                "on the user's transcript. Score each criterion based on the quality of the "
                "free speech output."
            )
            user_msg = f"User's free speech: {user_transcript}"
        else:
            mode_instruction = "Evaluate the user's speaking attempt against the given criteria."
            user_msg = f"Original: {original}\nUser said: {user_transcript}"

        system = (
            "You are an English speaking assessment coach for Chinese learners. "
            f"Mode: {mode}\n\n"
            f"{mode_instruction}\n\n"
            f"Rubric criteria:\n{criteria_desc}\n\n"
            "Score each criterion independently on a scale of 0-100. Provide specific, "
            "actionable feedback in Chinese for each criterion.\n\n"
            "Return JSON:\n"
            "{\n"
            '  "criteria_scores": [\n'
            '    {"criterion_name": "<name>", "score": <0-100>, "feedback": "<Chinese feedback>"},\n'
            "    ...\n"
            "  ],\n"
            '  "overall_feedback": "<2-3 sentence summary in Chinese>"\n'
            "}"
        )

        result = await self._chat(system, user_msg)
        try:
            parsed = json.loads(self._extract_json(result))
            # Validate structure
            if "criteria_scores" not in parsed or "overall_feedback" not in parsed:
                raise ValueError("Missing required keys in rubric response")
            return parsed
        except (json.JSONDecodeError, ValueError):
            logger.warning("Rubric scoring failed, falling back to basic feedback")
            fallback = await self.pronunciation_feedback(original, user_transcript)
            # Convert fallback to rubric format
            criteria_scores = []
            for c in rubric_criteria:
                name = c["name"]
                if name.lower() in ("accuracy", "pronunciation"):
                    score = fallback.get("accuracy", 0)
                elif name.lower() in ("fluency", "rhythm", "pace"):
                    score = fallback.get("fluency", 0)
                elif name.lower() in ("completeness", "coverage"):
                    score = fallback.get("completeness", 0)
                else:
                    score = (
                        fallback.get("accuracy", 0) + fallback.get("fluency", 0) + fallback.get("completeness", 0)
                    ) / 3
                criteria_scores.append(
                    {
                        "criterion_name": name,
                        "score": round(score, 1),
                        "feedback": fallback.get("feedback", ""),
                    }
                )
            return {
                "criteria_scores": criteria_scores,
                "overall_feedback": fallback.get("feedback", "评分失败"),
            }

    async def free_speaking_feedback(self, user_transcript: str, topic: str | None = None) -> dict:
        """Evaluate free speech without a reference text.

        Focuses on fluency, coherence, grammar, and vocabulary.
        Returns: { fluency: 0-100, feedback: string }
        """
        topic_hint = (
            f"\nTopic/prompt: {topic}"
            if topic
            else "\nNo specific topic was given — evaluate general speaking quality."
        )

        system = (
            "You are an English speaking coach for Chinese learners. The user is speaking "
            "freely without a reference text. Evaluate their speech based on:\n"
            "- Fluency: natural rhythm, pace, smoothness, lack of hesitation\n"
            "- Coherence: logical flow, connected ideas\n"
            "- Grammar: correct sentence structure and tense usage\n"
            "- Vocabulary: range and appropriateness of word choice\n\n"
            "Return JSON:\n"
            "{\n"
            '  "fluency": <0-100>,\n'
            '  "feedback": "<detailed feedback in Chinese, 2-4 sentences, with specific suggestions>"\n'
            "}"
        )
        user_msg = f"User's free speech: {user_transcript}{topic_hint}"
        result = await self._chat(system, user_msg)
        try:
            return json.loads(self._extract_json(result))
        except json.JSONDecodeError:
            return {"fluency": 0, "feedback": "评分失败，请重试"}

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
        except json.JSONDecodeError:
            return []

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
        except (AIServiceError, json.JSONDecodeError):
            return {
                "definition": "",
                "translation": "",
                "part_of_speech": "",
                "ipa": "",
                "example_sentences": [],
                "collocations": [],
                "difficulty_level": "B1",
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
        except (AIServiceError, json.JSONDecodeError):
            return []


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
