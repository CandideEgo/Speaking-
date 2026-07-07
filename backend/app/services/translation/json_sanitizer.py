"""Robust JSON sanitizer for LLM translation output.

Different translation engines return JSON in slightly different formats:
- Hy-MT2-7B mixes Chinese curly quotes ("“"/"”") and CJK brackets ("「"/"」")
- Some engines wrap output in markdown code fences (```json ... ```)
- Some add prose before/after the JSON array

This module provides a pure ``sanitize_json()`` function that normalises all
known quirks so ``json.loads()`` can reliably parse the result.
"""

import re


def sanitize_json(raw: str) -> str:
    """Clean LLM output and return a JSON-parseable string.

    Steps:
      1. Strip markdown code fences.
      2. Replace Chinese/CJK quotes with straight double-quotes.
      3. Extract the outermost JSON array ``[...]`` from surrounding prose.

    Returns:
        Cleaned string suitable for ``json.loads()``.

    Raises:
        json.JSONDecodeError: if the result is still not valid JSON.
    """
    text = raw.strip()

    # Step 1: Remove markdown fences (```json ... ``` or ``` ... ```)
    text = _strip_fences(text)

    # Step 2: Normalise quote characters
    text = _normalise_quotes(text)

    # Step 3: Extract the outermost JSON array
    text = _extract_json_array(text)

    return text


# ------------------------------------------------------------------
# Internal helpers
# ------------------------------------------------------------------

_FENCE_RE = re.compile(
    r"^```(?:json|JSON)?\s*\n?(.*?)\n?\s*```$",
    re.DOTALL,
)


def _strip_fences(text: str) -> str:
    """Remove ````json ... ```` or ```` ... ```` wrapping."""
    m = _FENCE_RE.match(text)
    if m:
        return m.group(1).strip()
    return text


def _normalise_quotes(text: str) -> str:
    """Replace curly / CJK quotes with straight ASCII equivalents.

    Some engines (notably Hy-MT2-7B) use CJK ``「」`` as array-element
    delimiters instead of standard JSON ``","``. After normalising ``「`` →
    ``"`` and ``」`` → ``"``, adjacent ``""`` appear which break JSON parsing.
    We fix that by inserting the missing comma.

    Hy-MT2-7B also sometimes uses Chinese comma ``，`` (U+FF0C) between
    array elements instead of ASCII ``,``. We normalise those too.
    """
    # Chinese curly double-quotes → straight double-quotes
    text = text.replace("“", '"').replace("”", '"')
    # Chinese curly single-quotes → straight single-quotes
    text = text.replace("‘", "'").replace("’", "'")
    # CJK corner brackets → straight double-quotes
    text = text.replace("「", '"').replace("」", '"')
    # CJK white corner brackets → straight double-quotes
    text = text.replace("『", '"').replace("』", '"')
    # Full-width quotation mark → straight double-quote
    text = text.replace("＂", '"')
    # Full-width comma (Chinese ，) between " and " → ASCII comma
    # e.g. "...text"，"next..." → "...text","next..."
    text = re.sub(r'"，"', '","', text)
    # Also handle the case where _normalise_quotes already turned CJK
    # brackets into quotes, leaving adjacent "" without comma.
    text = text.replace('""', '","')
    return text


def _extract_json_array(text: str) -> str:
    """Find the outermost ``[...]`` in *text*, ignoring surrounding prose."""
    start = text.find("[")
    end = text.rfind("]")
    if start != -1 and end > start:
        return text[start : end + 1]
    # Let json.loads report the error
    return text
