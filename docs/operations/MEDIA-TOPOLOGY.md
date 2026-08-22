# 媒体分发拓扑与封面修复（任务 3）

> 状态：2026-08 更新。仓库内事实已核实；服务器侧游离配置待 SSH 诊断确认（见下方 runbook）。

## 仓库内事实（source of truth）

```
浏览器 ──/media/...──> 源站 nginx (nginx.ssl.conf L115-147)
                          │ proxy_pass http://backend（7d 缓存，shadowing 除外）
                          ▼
                     backend 容器
                          │ app/api/v1/media.py（range-aware，支持 206 拖动）
                          ▼
                   本地媒体卷 LOCAL_MEDIA_PATH
                     ├── {video_id}.mp4 / _480p / _720p / _1080p（发布态门禁）
                     ├── {video_id}_thumb.{jpg,png,webp}（封面，2026-08 起 ingest 本地化）
                     └── shadowing/{user_id}/（owner-only JWT）
```

- 仓库中**不存在**任何指向 HK VPS 的 `/media/` 代理配置。旧文档「媒体存 HK VPS、
  源站 nginx 代理」的说法没有仓库内配置支撑（REVIEW-2026-08-14 §214 已指出）。
- 外部封面（ytimg/hdslb 等）：
  - **2026-08 之前**入库的视频：`thumbnail_url` 为外部 URL，渲染期经
    `/media/proxy`（`api/v1/media.py`，走 `HTTP_PROXY` 出口）抓取——这是封面故障面。
  - **2026-08 之后**：ingest 时 `services/thumbnail_service.localize_video_thumbnail`
    下载到 `media/{video_id}_thumb{ext}` 并写本地路径，渲染期零外部依赖。

## 修复操作（2026-08）

1. 存量回填：`python scripts/backfill_local_thumbnails.py`
   （`--dry-run` 预览；`--proxy` 指定出口；服务器直连不通时在有外网的机器上跑，
   产物 rsync 回服务器后再跑 `--update-db-only`）。失败清单落 `tmp/thumbnail_failures.txt`。
2. 增量根治：已接入 `tasks/video_processing.py` 的 extracting 步骤。
3. `/media/proxy` 端点保留（兼容尚未回填的行），但不再是封面的主链路。

## 服务器侧诊断 runbook（只读）

```bash
# 1. DB 中封面形态分布
docker compose exec postgres psql -U <user> -d <db> -c \
 "SELECT CASE WHEN thumbnail_url LIKE 'http%' THEN 'external' ELSE 'local' END AS kind,
         COUNT(*) FROM videos GROUP BY kind;"

# 2. 仓库外 nginx 配置（找 HK 代理痕迹）
nginx -T 2>/dev/null | grep -B2 -A25 "location /media"

# 3. 实测两类封面
curl -sI "https://seeword.top/media/<某本地>_thumb.jpg" | head -3
curl -sI "https://seeword.top/media/proxy?url=<某外部封面URL>" | head -3

# 4. 代理出口与错误日志
grep HTTP_PROXY backend/.env
docker compose logs backend 2>&1 | grep -i "proxy\|Upstream" | tail -50
```

判定：proxy 502/超时 → 跑回填脚本；`/media/` 本地路径 404 且 `nginx -T` 显示
代理到 HK → 媒体在 HK，按「HK 到期迁移预案」处理。诊断发现仓库外配置后，
**必须收编进 `nginx.ssl.conf` 或删除**，不允许继续游离。

## HK 到期迁移预案（占位）

HK VPS 同时承载两条关键依赖，到期即全站事故，届时需整体迁移（本次只修封面，不动入口）：

1. **`seeword.top` SSL 反代入口** —— 需把证书与入口迁到剩余服务器或新节点，
   DNS 切换窗口内双跑。
2. **GPU worker 回调中转**（见 `GPU-WORKER-SETUP.md`）—— 转写管线的回调路由
   随入口一起迁；`TRANSCRIPTION_CALLBACK_URL` 同步改。

迁移清单待诊断确认实际拓扑后补全。
