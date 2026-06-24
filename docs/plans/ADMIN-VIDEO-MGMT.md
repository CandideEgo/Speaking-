# 管理面板 — 视频内容管理

> 目标：完善 admin 管理面板的「视频」能力，从只能 seed 扩展到完整的内容管理 + URL 预览 + 搬运到本地。
>
> 关联方向：用户端只看本地 `/media/` 视频（考虑国内网络），管理端用 URL 预览效果，确认后再搬运到本地。
>
> 现状基础：`frontend/src/app/(main)/admin/page.tsx` 已有「视频 / 兑换码」两个 tab；后端 `get_admin_user` 依赖、seed、邀请码、评分量规增删改、评论分析触发均已就绪。

---

## 背景

当前「视频」tab 太弱：只能粘 URL 种植官方视频（`POST /videos/seed`），无法查看/编辑/下架/搬运。核心缺口是**视频列表 + 编辑 + URL 预览 + 搬运到本地**。

后端 full 处理流程已就绪：`app/tasks/video_processing.py` 的 `process_video`（下载 + 转码 + 字幕 + 翻译），以及 `_download_video` / `_transcode_video` 工具函数可直接复用。

---

## 切片规划（每个可独立交付）

### 切片 1：视频列表 + 筛选

**后端**
- 新增 `GET /api/v1/admin/videos` —— 管理员查看**所有**视频（含 processing / error / 非官方），分页
- 支持筛选：`status`、`is_official`、`is_featured`、关键字
- 注意：现有 `list_public_videos` 只返回官方 ready 视频，不够；新端点用 `get_admin_user` 依赖守卫

**前端**
- admin「视频」tab 改成表格：标题、状态、平台、难度、是否官方/精选、创建时间
- 顶部状态筛选（全部 / processing / ready / error）

**涉及文件**
- `backend/app/api/v1/videos.py`（或新建 `admin.py` 路由）
- `backend/app/services/video_service.py`（新增 `list_all_videos`）
- `frontend/src/app/(main)/admin/page.tsx`

---

### 切片 2：视频编辑

**后端**
- 新增 `PATCH /api/v1/admin/videos/{id}` —— 修改：`title`、`difficulty_level`(CEFR A1-C2)、`topic_tags`、`is_official`(上架/下架)、`is_featured`(精选)
- 新增 `DELETE /api/v1/admin/videos/{id}` —— 下架删除（级联删字幕、媒体文件）

**数据模型**
- `Video` 加 `is_featured: bool`（精选，首页 hero 用）—— 需要 alembic migration
- 可选：`Video.admin_notes: str`（管理员备注）

**前端**
- 行内编辑或弹窗表单，编辑后刷新列表

**涉及文件**
- `backend/app/models/video.py`
- `backend/migrations/versions/`（新 migration）
- `backend/app/api/v1/videos.py` + `video_service.py`
- `frontend/src/app/(main)/admin/page.tsx`

---

### 切片 3：URL 预览 + 搬运到本地（核心）

这是接上「管理端 URL 预览 → 搬运 → 用户端看本地」方向的关键切片。

**后端**
- 新增 `POST /api/v1/admin/videos/{id}/localize` —— 触发现有 `process_video` full 流程
  - 已有 `_download_video`（yt-dlp 下载）+ `_transcode_video`（ffmpeg 多分辨率转码）
  - 基本是组合调用：下载 → 转码 → 填充 `video.video_url_480p/720p/1080p`
  - 复用现有 Redis 进度 pub/sub
- 视频详情端点返回 `video_url_*`（已有）

**前端**
- 视频详情/编辑区：嵌入 URL 预览（YouTube iframe，或原生 `<video>` 若已有本地 URL）
- 旁边「搬运到本地」按钮 → 调 `/localize` → 显示处理中状态
- 搬运完成后预览切换为本地播放

**涉及文件**
- `backend/app/api/v1/videos.py`（新 `/localize` 端点）
- `backend/app/tasks/video_processing.py`（复用，可能加 `localize_video` 任务包装）
- `frontend/src/app/(main)/admin/page.tsx` + 可能新增预览组件

---

### 切片 4：搬运进度 + 状态轮询（体验完善）

**后端**
- 已有 `GET /videos/{id}/status` + Redis 进度（`video:progress:{id}` pub/sub）—— 基本够用，无需大改

**前端**
- 搬运后轮询 `GET /videos/{id}/status`，显示 processing → ready_subtitles → ready
- ready 后自动切到本地播放预览

**涉及文件**
- `frontend/src/app/(main)/admin/page.tsx` + hooks

---

## 数据模型改动汇总

| 字段 | 模型 | 切片 | 说明 |
|------|------|------|------|
| `is_featured: bool` | Video | 2 | 精选标记，首页 hero |
| `admin_notes: str` (可选) | Video | 2 | 管理员备注 |

各字段单独 alembic migration，参考已有 `migrations/versions/` 风格（revision 链：`... → b2d3f4g5h6i7`）。

---

## 新会话起手提示

> 完善管理面板的视频内容管理。参考 `docs/plans/ADMIN-VIDEO-MGMT.md`。现有 `admin/page.tsx` 只有 seed 和兑换码，要做：
> 1. `GET /admin/videos` 列表+筛选（管理员看所有视频含 processing/error）
> 2. `PATCH /admin/videos/{id}` 编辑（title/difficulty/topic_tags/is_official/is_featured）+ `DELETE` 下架
> 3. `POST /admin/videos/{id}/localize` 搬运到本地（复用 `process_video` 的 `_download_video`/`_transcode_video`），前端 URL 预览 + 搬运按钮
> 4. 搬运进度轮询（复用 `GET /videos/{id}/status`）
>
> Video 模型加 `is_featured`。后端 admin 端点用 `get_admin_user` 守卫。先读 `docs/plans/ADMIN-VIDEO-MGMT.md` 和现有 `admin/page.tsx`、`video_processing.py`。

---

## 注意事项

- **测试**：后端新端点配测试（参考 `backend/tests/` 现有风格，用 `admin_headers` fixture）。conftest 已 mock Celery（`process_video.delay` 是 no-op），所以 localize 端点的测试要单独 mock 任务或断言 `delay` 被调用
- **权限**：所有 `/admin/*` 端点必须 `Depends(get_admin_user)`
- **前端权限**：`admin/page.tsx` 已有 `role !== "admin"` 重定向，新功能沿用
- **搬运复用**：不要重写下载/转码逻辑，直接调 `process_video.delay(video_id)` 或抽一个 `localize_video` 任务
