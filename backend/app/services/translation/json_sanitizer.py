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
    """Replace CJK brackets used as JSON delimiters with straight quotes.

    **Important**: Chinese curly double-quotes (U+201C/U+201D) often appear
    *inside* translated text values and must NOT be turned into ASCII ``"``,
    because that would clash with JSON string delimiters and break parsing.
    We replace them with guillemets (``«»``) instead — visually similar,
    safe inside JSON strings, and acceptable in Chinese text.

    CJK corner brackets ``「」`` are sometimes used *as* array-element
    delimiters (Hy-MT2-7B quirk), so those DO get mapped to ASCII ``"``.
    """
    # CJK corner brackets → straight double-quotes (they act as JSON delimiters)
    text = text.replace("「", '"').replace("」", '"')
    # CJK white corner brackets → straight double-quotes
    text = text.replace("『", '"').replace("』", '"')
    # Full-width quotation mark → straight double-quote
    text = text.replace("＂", '"')
    # Chinese curly double-quotes inside text → guillemets (safe in JSON strings)
    text = text.replace("“", "«").replace("”", "»")
    # Chinese curly single-quotes → straight single-quotes
    text = text.replace("‘", "'").replace("’", "'")
    # Full-width comma (Chinese ，) between " and " → ASCII comma
    # e.g. "...text"，"next..." → "...text","next..."
    text = re.sub(r'"，"', '","', text)
    # Also handle the case where CJK brackets were turned into quotes,
    # leaving adjacent "" without comma.
    text = text.replace('""', '","')
    return text


def _extract_json_array(text: str) -> str:
    """Find the outermost ``[...]`` in *text*, ignoring surrounding prose.

    Also escapes literal newlines inside JSON string values so that
    ``json.loads`` can parse multi-line output from engines like GLM
    that embed unescaped ``\\n`` in translation text.
    """
    start = text.find("[")
    end = text.rfind("]")
    if start != -1 and end > start:
        text = text[start : end + 1]
    # Escape literal newlines inside string values.
    # Walk the string: when inside a double-quoted value, replace
    # bare \\n with the two-char escape sequence \\\\n.
    result = []
    in_string = False
    i = 0
    while i < len(text):
        ch = text[i]
        if in_string:
            if ch == "\\" and i + 1 < len(text):
                # Already-escaped sequence — keep as-is
                result.append(ch)
                result.append(text[i + 1])
                i += 2
                continue
            if ch == '"':
                in_string = False
            elif ch == "\n":
                result.append("\\n")
                i += 1
                continue
        else:
            if ch == '"':
                in_string = True
        result.append(ch)
        i += 1
    return "".join(result)
