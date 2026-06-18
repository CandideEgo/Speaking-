import re

from app.models.video import Platform


def detect_platform(url: str) -> Platform:
    url_lower = url.lower()
    if "youtube.com" in url_lower or "youtu.be" in url_lower:
        return Platform.youtube
    if "bilibili.com" in url_lower or "b23.tv" in url_lower:
        return Platform.bilibili
    if "douyin.com" in url_lower or "v.douyin.com" in url_lower:
        return Platform.douyin
    if "tiktok.com" in url_lower:
        return Platform.tiktok
    if "twitter.com" in url_lower or "x.com" in url_lower:
        return Platform.twitter
    if "instagram.com" in url_lower:
        return Platform.instagram
    return Platform.other


def extract_youtube_video_id(url: str) -> str | None:
    """Extract YouTube video ID from a URL.

    Supports youtube.com/watch?v=, youtu.be/, youtube.com/embed/,
    and youtube.com/shorts/ URLs.
    """
    patterns = [
        r'(?:youtube\.com/watch\?v=|youtu\.be/|youtube\.com/embed/|youtube\.com/shorts/)([A-Za-z0-9_-]{11})',
    ]
    for p in patterns:
        m = re.search(p, url)
        if m:
            return m.group(1)
    return None
