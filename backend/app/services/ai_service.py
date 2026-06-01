import json
import logging
from openai import AsyncOpenAI
from app.core.config import get_settings

logger = logging.getLogger(__name__)

settings = get_settings()


class AIService:
    def __init__(self):
        client_kwargs = {"api_key": settings.openai_api_key or "sk-placeholder"}
        if settings.openai_base_url:
            client_kwargs["base_url"] = settings.openai_base_url
        self.client = AsyncOpenAI(**client_kwargs)
        self.model = settings.openai_model

    async def _chat(self, system: str, user: str, temperature: float = 0.3) -> str:
        try:
            resp = await self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
                temperature=temperature,
            )
            return resp.choices[0].message.content or ""
        except Exception:
            logger.exception("LLM call failed")
            return ""

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

    async def pronunciation_feedback(
        self, original: str, user_transcript: str
    ) -> dict:
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

    async def assistant_recommend(
        self, user_level: str, history_summary: str
    ) -> str:
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
