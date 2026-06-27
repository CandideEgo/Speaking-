#!/usr/bin/env python
"""Download the ECDICT SQLite database to backend/data/ecdict.db.

ECDICT (skywind3000/ECDICT, MIT) ships a ~30MB SQLite dump ``stardict.db`` of
~770k English entries with CET/高考/考研/雅思/托福/GRE tags, phonetics,
definitions, and inflection data. It is the word list underpinning the exam
vocabulary feature (see app/services/ecdict.py).

Usage:
    python scripts/download_ecdict.py            # download if missing
    python scripts/download_ecdict.py --force    # re-download even if present
"""

from __future__ import annotations

import argparse
import io
import os
import sys
import urllib.request
import zipfile
from pathlib import Path

# Release 1.0.28 — ecdict-sqlite-28.zip contains stardict.db.
URL = "https://github.com/skywind3000/ECDICT/releases/download/1.0.28/ecdict-sqlite-28.zip"
DEST = Path(__file__).resolve().parents[1] / "data" / "ecdict.db"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--force", action="store_true", help="re-download even if present")
    args = parser.parse_args()

    if DEST.exists() and not args.force:
        print(f"[skip] {DEST} already exists (use --force to re-download)")
        return 0

    DEST.parent.mkdir(parents=True, exist_ok=True)
    print(f"[download] {URL}")

    # Respect proxy env vars (HTTP_PROXY/HTTPS_PROXY) explicitly — urllib's
    # default opener does read them, but building a ProxyHandler ourselves
    # guarantees it works behind a corporate/local proxy and follows the
    # GitHub release -> objects.githubusercontent.com redirect.
    proxies: dict[str, str] = {}
    for var in ("HTTP_PROXY", "http_proxy", "HTTPS_PROXY", "https_proxy"):
        val = os.environ.get(var)
        if val:
            scheme = "https" if var.lower().startswith("https") else "http"
            proxies.setdefault(scheme, val)
    opener = urllib.request.build_opener(
        urllib.request.ProxyHandler(proxies) if proxies else urllib.request.ProxyHandler({})
    )
    try:
        with opener.open(URL, timeout=120) as resp:
            data = resp.read()
    except Exception as exc:
        print(f"[error] download failed: {exc}", file=sys.stderr)
        return 1

    print(f"[extract] -> {DEST}")
    with zipfile.ZipFile(io.BytesIO(data)) as zf:
        names = [n for n in zf.namelist() if n.lower().endswith(".db")]
        if not names:
            print("[error] no .db file found in archive", file=sys.stderr)
            return 1
        with zf.open(names[0]) as src, open(DEST, "wb") as dst:
            dst.write(src.read())

    print(f"[done] {DEST} ({DEST.stat().st_size // 1024} KB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
