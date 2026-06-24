"""Download YouTube video audio using Playwright directly.

Uses Playwright to intercept network requests and extract the audio stream URL,
then downloads it directly with ffmpeg.
"""

import argparse
import asyncio
import logging
import subprocess
import sys
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


async def download_youtube_audio(video_id: str, output_path: str):
    """Download YouTube audio using Playwright to intercept the audio stream."""
    try:
        from playwright.async_api import async_playwright
    except ImportError:
        logger.error("Playwright not installed. Run: pip install playwright && playwright install")
        return False

    audio_url = None

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            viewport={"width": 1280, "height": 720},
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        )

        page = await context.new_page()

        # Intercept network requests to find audio stream
        async def handle_route(route, request):
            nonlocal audio_url
            url = request.url
            # Look for audio stream URLs (googlevideo.com with itag for audio)
            if "googlevideo.com" in url and (
                "itag=25" in url or "itag=140" in url or "itag=251" in url or "audio" in url
            ):
                if not audio_url:
                    audio_url = url
                    logger.info("Found audio stream URL")
            await route.continue_()

        await page.route("**/*", handle_route)

        # Navigate to the video
        logger.info(f"Navigating to video: {video_id}")
        await page.goto(f"https://www.youtube.com/watch?v={video_id}", wait_until="networkidle")

        # Wait a bit for network requests
        await asyncio.sleep(5)

        # Also try to extract from page
        try:
            # Get ytInitialPlayerResponse from page
            player_response = await page.evaluate("""
                () => {
                    if (window.ytInitialPlayerResponse) {
                        return window.ytInitialPlayerResponse;
                    }
                    return null;
                }
            """)

            if player_response and "streamingData" in player_response:
                streaming_data = player_response["streamingData"]
                formats = streaming_data.get("adaptiveFormats", []) + streaming_data.get("formats", [])
                for fmt in formats:
                    mime = fmt.get("mimeType", "")
                    if "audio" in mime:
                        audio_url = fmt.get("url") or fmt.get("signatureCipher")
                        if audio_url:
                            logger.info(f"Found audio URL from player response: itag={fmt.get('itag')}")
                            break
        except Exception as e:
            logger.warning(f"Could not extract from player response: {e}")

        await browser.close()

    if not audio_url:
        logger.error("Could not find audio stream URL")
        return False

    # Download with ffmpeg
    logger.info(f"Downloading audio to: {output_path}")
    cmd = [
        "ffmpeg",
        "-y",
        "-i",
        audio_url,
        "-vn",
        "-acodec",
        "pcm_s16le",
        "-ar",
        "16000",
        "-ac",
        "1",
        output_path,
    ]

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=300,
        )
        if result.returncode != 0:
            logger.error(f"ffmpeg failed: {result.stderr[:500]}")
            return False

        if not Path(output_path).exists():
            logger.error("Output file not found after download")
            return False

        size = Path(output_path).stat().st_size
        logger.info(f"Audio downloaded: {output_path} ({size} bytes)")
        return True

    except subprocess.TimeoutExpired:
        logger.error("Download timed out")
        return False
    except Exception as e:
        logger.error(f"Download failed: {e}")
        return False


def main():
    parser = argparse.ArgumentParser(description="Download YouTube audio via Playwright")
    parser.add_argument("video_id", help="YouTube video ID")
    parser.add_argument("--output", default="./youtube_audio.wav", help="Output WAV file path")
    args = parser.parse_args()

    success = asyncio.run(download_youtube_audio(args.video_id, args.output))
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
