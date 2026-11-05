"""Hermetic ffmpeg smoke: synthetic input and temporary media only, no DB/network."""

import asyncio
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

# Allow direct execution from backend/ without installing the application.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import get_settings
from app.services.video_media import get_video_height, is_usable_local_url, transcode_video


async def main() -> None:
    if not shutil.which("ffmpeg") or not shutil.which("ffprobe"):
        raise RuntimeError("ffmpeg and ffprobe must both be on PATH")
    settings = get_settings()
    original_media_path = settings.local_media_path
    with tempfile.TemporaryDirectory(prefix="seeword-media-check-") as folder:
        root = Path(folder)
        settings.local_media_path = str(root / "media")
        try:
            for height, label in [(720, "remux"), (1080, "scale")]:
                source = root / f"source-{height}.mp4"
                subprocess.run(
                    [
                        "ffmpeg",
                        "-v",
                        "error",
                        "-y",
                        "-f",
                        "lavfi",
                        "-i",
                        f"color=c=blue:s={height * 16 // 9}x{height}:r=2",
                        "-t",
                        "1",
                        "-c:v",
                        "libx264",
                        "-pix_fmt",
                        "yuv420p",
                        "-threads",
                        "1",
                        str(source),
                    ],
                    check=True,
                    capture_output=True,
                    timeout=30,
                )
                urls = await transcode_video(str(source), label)
                assert urls == {"720p": f"/media/{label}_720p.mp4"}, urls
                assert await is_usable_local_url(urls["720p"])
                output = Path(settings.local_media_path) / f"{label}_720p.mp4"
                assert await get_video_height(str(output)) == 720
                print(f"PASS {label}: real output, video stream 720p, {output.stat().st_size} bytes")
            published = Path(settings.local_media_path) / "remux_720p.mp4"
            prior = published.read_bytes()
            invalid = root / "broken.mp4"
            invalid.write_bytes(b"invalid video")
            assert await transcode_video(str(invalid), "remux") == {}
            assert published.read_bytes() == prior
            assert list(Path(settings.local_media_path).glob("*.part.mp4")) == []
            print("PASS invalid input: prior rendition preserved, no temporary artifacts")
        finally:
            settings.local_media_path = original_media_path


if __name__ == "__main__":
    asyncio.run(main())
