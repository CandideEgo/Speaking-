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
