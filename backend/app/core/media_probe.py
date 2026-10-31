"""Local media probing helpers (ffprobe/ffmpeg) for the cloud backend.

``get_video_duration`` used to live in
``app/services/transcription/audio_extractor.py``. That module moved to the
standalone ``gpu-worker/`` component (GPU 转录 worker) when the project was
split, but the cloud still needs a duration read for locally uploaded videos
(``process_video`` head) and for ``scripts/backfill_video_duration.py``.
"""

import shutil
import subprocess


def get_video_duration(video_path: str) -> float:
    """Get video/audio duration in seconds using ffprobe.

    Args:
        video_path: Path to video or audio file

    Returns:
        Duration in seconds (0.0 when ffprobe fails or the value is unparsable).
    """
    ffprobe_path = shutil.which("ffprobe") or "ffprobe"
    cmd = [
        ffprobe_path,
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        video_path,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    if result.returncode != 0:
        return 0.0
    try:
        return float(result.stdout.strip())
    except ValueError:
        return 0.0
