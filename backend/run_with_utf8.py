import builtins
import sys

# Monkey-patch open() to use UTF-8 for .env files
_original_open = builtins.open


def _patched_open(file, mode="r", *args, **kwargs):
    if isinstance(file, str) and file.endswith(".env"):
        kwargs["encoding"] = "utf-8"
    return _original_open(file, mode, *args, **kwargs)


builtins.open = _patched_open

# Now import and run uvicorn
import uvicorn

from app.main import app

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
