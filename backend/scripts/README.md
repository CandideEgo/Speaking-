# Backend Scripts

本目录包含后端运维和一次性脚本，不应被应用代码直接导入。

## 脚本列表

| 脚本 | 用途 | 运行方式 |
|------|------|----------|
| `backfill_daily_activities.py` | 回填用户每日活动数据 | `python -m scripts.backfill_daily_activities` |
| `download_youtube_audio.py` | 下载 YouTube 视频音频 | `python -m scripts.download_youtube_audio` |
| `get_youtube_cookies.py` | 获取 YouTube Cookie 用于认证 | `python -m scripts.get_youtube_cookies` |
| `refresh_youtube_cookies.py` | 自动刷新 YouTube Cookie（playwright --persistent + yt-dlp 验证） | `python -m scripts.refresh_youtube_cookies` |
| `seed_official_videos.py` | 向数据库植入官方视频种子数据 | `python -m scripts.seed_official_videos` |
| `retranscribe_video.py` | 重新转录指定视频的字幕 | `python -m scripts.retranscribe_video` |

## 注意事项

- 运行脚本前确保已在 `backend/` 目录下激活虚拟环境
- 大部分脚本需要数据库连接，确保 `.env` 配置正确
- `download_youtube_audio.py` / `get_youtube_cookies.py` 依赖 Playwright，
  **仅本地手动运行**——Playwright 不在运行镜像里（见 `requirements-dev.txt`）。
  首次使用需：`pip install -r requirements-dev.txt && playwright install chromium`
