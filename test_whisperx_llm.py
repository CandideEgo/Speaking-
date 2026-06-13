"""Test two alternative sentence-segmentation approaches:
1. WhisperX (forced alignment + sentence segmentation)
2. LLM punctuation restoration on faster-whisper word timestamps
"""

import asyncio
import os
import re
from pathlib import Path

# --- Configuration ---
AUDIO_PATH = "C:/Users/Administrator/Speaking/backend/tmp_audio.wav"
OUTPUT_DIR = Path("C:/Users/Administrator/Speaking/backend")

OPENAI_API_KEY = "sk-rb3NrV4Cipz8D3zpVL0Xcxo28oe5gCy42tcDIIg5laf7yrI5"
OPENAI_BASE_URL = "https://apihub.agnes-ai.com/v1"
OPENAI_MODEL = "agnes-2.0-flash"


def format_time(seconds: float) -> str:
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    return f"{h:02d}:{m:02d}:{s:02d}"


# ---------------------------------------------------------------------------
# Approach 1: WhisperX
# ---------------------------------------------------------------------------
def run_whisperx():
    import torch
    import whisperx

    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"WhisperX using device: {device}")

    model = whisperx.load_model("large-v3", device, compute_type="int8")
    audio = whisperx.load_audio(AUDIO_PATH)

    result = model.transcribe(audio, batch_size=1)
    print(f"WhisperX ASR language: {result.get('language')}")

    model_a, metadata = whisperx.load_align_model(
        language_code=result["language"], device=device
    )
    result = whisperx.align(result["segments"], model_a, metadata, audio, device)

    lines = []
    for seg in result["segments"]:
        start = format_time(seg["start"])
        end = format_time(seg["end"])
        text = seg["text"].strip()
        lines.append(f"[{start} -> {end}] {text}")

    out_path = OUTPUT_DIR / "tmp_audio_whisperx.md"
    out_path.write_text("\n\n".join(lines), encoding="utf-8")
    print(f"WhisperX output saved to: {out_path}")
    return out_path


# ---------------------------------------------------------------------------
# Approach 2: faster-whisper + LLM punctuation restoration
# ---------------------------------------------------------------------------
def transcribe_with_words():
    import torch
    from faster_whisper import WhisperModel

    device = "cuda" if torch.cuda.is_available() else "cpu"
    model = WhisperModel("large-v3", device=device, compute_type="int8")
    segments, _ = model.transcribe(
        AUDIO_PATH,
        beam_size=5,
        word_timestamps=True,
        condition_on_previous_text=False,
    )
    words = []
    for seg in segments:
        if seg.words:
            words.extend(seg.words)
    return words


def restore_punctuation_with_llm(raw_text: str) -> str:
    from openai import OpenAI

    client = OpenAI(api_key=OPENAI_API_KEY, base_url=OPENAI_BASE_URL)

    prompt = (
        "You are a punctuation-restoration assistant. "
        "Add appropriate punctuation (periods, commas, question marks, etc.) "
        "to the following transcribed spoken text. "
        "Preserve the original words exactly. "
        "Do not add or remove words. "
        "Return ONLY the punctuated text, split into natural sentences by line breaks.\n\n"
        f"{raw_text}"
    )

    resp = client.chat.completions.create(
        model=OPENAI_MODEL,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.0,
        max_tokens=2048,
    )
    return resp.choices[0].message.content.strip()


def align_sentences_to_words(sentences: list[str], words: list) -> list[str]:
    """Map each punctuated sentence to its word timestamps via simple word matching."""
    import difflib

    word_texts = [w.word.strip().lower() for w in words]
    lines = []
    word_idx = 0

    for sent in sentences:
        clean_sent = re.sub(r"[^\w\s']+", "", sent)
        sent_tokens = [t.lower() for t in clean_sent.split() if t]
        if not sent_tokens:
            continue

        # Find the best matching contiguous span of words.
        best_i = None
        best_ratio = 0.0
        for i in range(word_idx, len(word_texts) - len(sent_tokens) + 1):
            span = word_texts[i : i + len(sent_tokens)]
            ratio = difflib.SequenceMatcher(None, sent_tokens, span).ratio()
            if ratio > best_ratio:
                best_ratio = ratio
                best_i = i

        if best_i is None or best_ratio < 0.5:
            # Fallback: append without timestamp
            lines.append(f"[?? -> ??] {sent.strip()}")
            continue

        start = words[best_i].start
        end = words[best_i + len(sent_tokens) - 1].end
        lines.append(f"[{format_time(start)} -> {format_time(end)}] {sent.strip()}")
        word_idx = best_i + len(sent_tokens)

    return lines


def run_llm_approach():
    words = transcribe_with_words()
    raw_text = " ".join(w.word.strip() for w in words)
    print(f"Raw word count: {len(words)}")

    punctuated = restore_punctuation_with_llm(raw_text)
    sentences = [s.strip() for s in punctuated.split("\n") if s.strip()]
    print(f"LLM returned {len(sentences)} sentences")

    lines = align_sentences_to_words(sentences, words)
    out_path = OUTPUT_DIR / "tmp_audio_llm_punctuation.md"
    out_path.write_text("\n\n".join(lines), encoding="utf-8")
    print(f"LLM output saved to: {out_path}")
    return out_path


async def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    print("=" * 60)
    print("Approach 2: faster-whisper + LLM punctuation restoration")
    print("=" * 60)
    try:
        run_llm_approach()
    except Exception as exc:
        print(f"LLM approach failed: {exc}")

    print("\n" + "=" * 60)
    print("Approach 1: WhisperX")
    print("=" * 60)
    try:
        run_whisperx()
    except Exception as exc:
        print(f"WhisperX failed: {exc}")


if __name__ == "__main__":
    asyncio.run(main())
