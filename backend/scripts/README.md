# Backend Scripts

本目录包含后端运维和一次性脚本，不应被应用代码直接导入。

## 脚本列表

| 脚本 | 用途 | 运行方式 |
|------|------|----------|
| `seed_official_videos.py` | 向数据库植入官方视频种子数据（幂等，按 source_url 去重） | `python -m scripts.seed_official_videos` |
| `seed_local_video.py` | 植入本地视频文件种子 | `python -m scripts.seed_local_video` |
| `reprocess_official_videos.py` | 批量重处理官方视频 | `python -m scripts.reprocess_official_videos` |
| `batch_process_seeded.py` | 批量触发已 seed 视频的处理 | `python -m scripts.batch_process_seeded` |
| `retranscribe_video.py` | 重新转录指定视频的字幕 | `python -m scripts.retranscribe_video` |
| `recover_video.py` | 恢复异常状态的视频 | `python -m scripts.recover_video` |
| `start_gpu_worker.py` | 启动本地 GPU 转录 worker（transcription_gpu 队列） | `python -m scripts.start_gpu_worker` |
| `create_admin.py` | 创建/提升管理员账号 | `python -m scripts.create_admin` |
| `download_ecdict.py` | 下载 ECDICT 词典数据库（~30MB，gitignored） | `python -m scripts.download_ecdict` |
| `ingest_exam_papers.py` | 导入考试真题语料（exam_corpus） | `python -m scripts.ingest_exam_papers` |
| `backfill_difficulty.py` | 回填视频难度评级 | `python -m scripts.backfill_difficulty` |
| `backfill_word_annotations.py` | 回填词汇标注/注释 | `python -m scripts.backfill_word_annotations` |
| `precompute_global_word_notes.py` | 预计算全局 AI 词注释 | `python -m scripts.precompute_global_word_notes` |
| `precompute_global_word_notes_dual.py` | 双引擎并发版词注释预计算 | `python -m scripts.precompute_global_word_notes_dual` |
| `prewarm_and_practice.py` | 词注释预热与练习题生成运维 | `python -m scripts.prewarm_and_practice` |
| `download_youtube_audio.py` | 下载 YouTube 视频音频 | `python -m scripts.download_youtube_audio` |
| `get_youtube_cookies.py` | 获取 YouTube Cookie 用于认证 | `python -m scripts.get_youtube_cookies` |
| `refresh_youtube_cookies.py` | 自动刷新 YouTube Cookie（playwright --persistent + yt-dlp 验证） | `python -m scripts.refresh_youtube_cookies` |

## 注意事项

- 运行脚本前确保已在 `backend/` 目录下激活虚拟环境
- 大部分脚本需要数据库连接，确保 `.env` 配置正确
- `download_youtube_audio.py` / `get_youtube_cookies.py` 依赖 Playwright，
  **仅本地手动运行**——Playwright 不在运行镜像里（见 `requirements-dev.txt`）。
  首次使用需：`pip install -r requirements-dev.txt && playwright install chromium`
