"""Punctuation restoration for WhisperX ASR output.

When the ASR model (especially smaller ones like "base") produces text without
punctuation, NLTK Punkt inside whisperx.align() cannot split segments into
sentences. This module restores punctuation using deepmultilingualpunctuation
BEFORE alignment, so that align() produces correct sentence-level segments.

Pipeline:
    ASR (no punctuation) → restore_punctuation() → align() → correct sentences

The punctuation model is a lightweight singleton (~500MB on first download,
cached locally after that). Prediction adds <1s per segment.
"""

import logging
import re
from threading import Lock

logger = logging.getLogger(__name__)

# --- Punctuation model singleton ---
_punctuation_model = None
_punctuation_lock = Lock()


def _load_punctuation_model():
    """Lazy-load the punctuation restoration model (singleton with failure sentinel).

    Uses double-checked locking for thread safety. On load failure, sets
    the sentinel to False so subsequent calls skip retrying.
    """
    global _punctuation_model
    if _punctuation_model is not None:
        return _punctuation_model if _punctuation_model is not False else None

    with _punctuation_lock:
        if _punctuation_model is not None:
            return _punctuation_model if _punctuation_model is not False else None

        try:
            _patch_deepmultilingualpunctuation()
            from deepmultilingualpunctuation import PunctuationModel
            _punctuation_model = PunctuationModel()
            logger.info("Punctuation restoration model loaded successfully")
        except Exception as exc:
            logger.warning(
                f"Punctuation restoration model unavailable: {exc}. "
                "Segments will be aligned without punctuation restoration."
            )
            _punctuation_model = False

    return _punctuation_model if _punctuation_model is not False else None


def _patch_deepmultilingualpunctuation():
    """Monkey-patch deepmultilingualpunctuation for transformers compatibility.

    Version 1.0.1 uses the deprecated 'grouped_entities=False' parameter
    which was removed in transformers 5.x. Replace with 'aggregation_strategy="none"'.
    """
    try:
        import deepmultilingualpunctuation.punctuationmodel as pm
        import inspect

        source = inspect.getsource(pm.PunctuationModel.__init__)
        if "grouped_entities" in source:
            source = source.replace("grouped_entities=False", 'aggregation_strategy="none"')
            code_obj = compile(source, pm.__file__, "exec")
            ns = dict(pm.__dict__)
            exec(code_obj, ns)
            pm.PunctuationModel.__init__ = ns["PunctuationModel"].__init__
            logger.info("Patched deepmultilingualpunctuation for transformers compatibility")
    except Exception:
        pass  # If patching fails, the import will fail and we fall back gracefully


def _predict_punctuation_labels(texts: list[str]) -> list[list[str]]:
    """Predict punctuation label for each word in each text.

    Args:
        texts: List of word lists (each string is space-separated words).

    Returns:
        List of label lists. Each label is "." "," "?" "!" or "0" (no punctuation).
        Falls back to all "0" on failure.
    """
    pm = _load_punctuation_model()
    if not pm:
        return [["0"] * len(t.split()) for t in texts]

    results = []
    for text in texts:
        try:
            # Strip existing punctuation before prediction (avoids confusing the model)
            clean_words = [re.sub(r"(?<!\d)[.,;:!?](?!\d)", "", w) for w in text.split()]
            if not clean_words:
                results.append(["0"])
                continue

            predicted = pm.predict(clean_words)
            if len(predicted) == len(clean_words):
                results.append([p[1] for p in predicted])
            else:
                logger.warning(
                    f"Punctuation label count mismatch: "
                    f"{len(predicted)} vs {len(clean_words)}"
                )
                results.append(["0"] * len(clean_words))
        except Exception as exc:
            logger.warning(f"Punctuation prediction failed: {exc}")
            results.append(["0"] * len(text.split()))

    return results


def restore_punctuation(segments: list[dict]) -> list[dict]:
    """Restore punctuation in ASR segments before alignment.

    Takes the raw ASR output (which may lack punctuation) and uses
    deepmultilingualpunctuation to predict punctuation for each word.
    The predicted punctuation is appended to the word text and the
    segment text is regenerated.

    This MUST be called BEFORE whisperx.align() so that NLTK Punkt
    inside align() can split segments into proper sentences.

    Args:
        segments: List of segment dicts from model.transcribe().
            Each: {"start": float, "end": float, "text": str, "words": [...]}

    Returns:
        The same segments list with punctuation restored in word texts
        and segment texts. Modified in-place and returned for convenience.
    """
    if not segments:
        return segments

    # Collect word texts per segment for batch prediction
    segment_word_texts = []
    for seg in segments:
        words = seg.get("words", [])
        if words:
            word_str = " ".join(w.get("word", "").strip() for w in words)
        else:
            word_str = seg.get("text", "").strip()
        segment_word_texts.append(word_str)

    # Predict punctuation labels
    all_labels = _predict_punctuation_labels(segment_word_texts)

    sentence_end_labels = {".", "?", "!", "。", "？", "！"}

    # Apply predicted punctuation back to words and rebuild segment texts
    for seg, labels in zip(segments, all_labels):
        words = seg.get("words", [])
        if not words or not labels:
            continue

        new_text_parts = []
        for i, w in enumerate(words):
            word_text = w.get("word", "").strip()
            if i < len(labels):
                label = labels[i]
                # Append predicted punctuation if the word doesn't already end with it
                if label != "0" and not word_text.endswith(label):
                    word_text += label
                w["word"] = word_text
            new_text_parts.append(word_text)

        # Rebuild segment text from words
        seg["text"] = " ".join(new_text_parts)

    return segments
