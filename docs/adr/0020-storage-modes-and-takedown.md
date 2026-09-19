# ADR-0020: 内容存储三态与半自动下线

- **Status**: Accepted - 2026-09-19

## Context

SeeWord 的视频媒体目前**全部是本地自托管**（catalog promote / admin seed 下载转码到 `LOCAL_MEDIA_PATH`）。内测上线要求（`docs/requirements/REQUIREMENTS-launch-internal-test.md` §5）给出内容三态，其中两件事是新的：

1. **下线释放空间**：上线 N 天后播放/收藏/完成率都低的视频，应当能隐藏并删除媒体文件释放磁盘，但**学习记录不能断链**——用户收藏夹和词汇集合里还指着它。
2. **代理播放（proxy）**：不下载媒体、播放器走外部源，零存储。

关键约束：`vocabulary.video_id` 与 `UserFavorite.video_id` 都是 `ondelete=CASCADE`——**物理删除视频行会连带删掉用户攒下的词与收藏**。这直接决定了下线必须是「行保留」而非「行删除」。

另外，"隐ying" 这件事如果靠逐个修改 12 处可见性查询去加过滤条件，漏一处就会泄漏。

## Decision

**1. 三态用单列表达，proxy 只留值不实现**

`videos.storage_mode`（`String(10)`，`server_default='local'`，索引）：`local` / `proxy` / `offline`。存字符串而非原生 enum，理由是跨 SQLite（测试）与 Postgres（生产）迁移回填一致（同 `Video.review_status` 的既有约定）。**proxy 按需求 §5.4 优先级 3 定位为「远期/占位」——本期只保留取值，不实现下载/代理播放链路。**

**2. 下线 = 状态翻转，不删行、不逐个改查询**

`takedown_video` 做四件事：`is_published=False`、`storage_mode='offline'`、清空 `video_url_*`、删除本地媒体文件（`_delete_media_files`，补齐它此前漏掉的裸 `{video_id}.mp4`）。

隐藏靠**复用既有的 `is_published` 过滤**——feed / browse / 推荐 / 搜索 / 频道 / 排行这 12 处查询本来就都带 `is_published=True`，因此无需逐个补条件。只有三处需要显式处理：

- **媒体门**（`media.py::_video_media_allowed`）：offline 一律不给流（管理员仍可预览复核）。此时文件多已删除，但门控不能依赖文件系统状态。
- **收藏夹**（`GET /videos/favorites`）：**刻意不加发布态过滤**，保留入口并下发 `storage_mode`，前端渲染「已下架」角标（§5.3 明确要求）。
- **视频详情**：offline 时 `video_url_*` 置空但**字幕与词标注照常下发**——点词仍可用，学习记录不断链。

**3. 缩略图保留**

下线只删视频媒体（`{id}.mp4` / `_raw` / `_480p` / `_720p` / `_1080p`），**保留 `{id}_thumb.*`**：收藏夹与集合卡片仍要渲染缩略图，几十 KB 不值得为它牺牲整个入口。

**4. 半自动：阈值建议 + 管理员确认**

`GET /videos/admin/takedown-suggestions` 按 config 阈值（`takedown_min_age_days=30` / `takedown_min_views=100` / `takedown_min_favorites=5`）列出冷门老视频，按热度升序；`POST /videos/admin/{id}/takedown` 由管理员逐个确认。**只建议，不自动执行**——自动删除不可逆，且阈值在冷启动期数据稀缺时不可靠。

## Consequences

- 下线不可逆的部分只有媒体文件；状态可回滚（重新 `storage_mode='local'` + `localize` 重下），学习记录全程无损。
- 因为不删行，`vocabulary.video_id` / `UserFavorite.video_id` 的 CASCADE 永远不会被触发，**无需外键迁移**。
- `takedown_suggestions` 的阈值在内容量少时几乎不会命中（需要「上线 30 天 + 播放 < 100」），内测初期属于安全网而非日常工具。
- `_FakeRedis` 补了 `scan_iter`：此前缓存失效在测试里静默失败（fail-open 吞掉 AttributeError），会掩盖「下架后仍出现在 feed」这类回归——补上后该断言才真正有效。
- 验证：+13 测试（`tests/test_video_takedown.py`），全量 735 passed；端到端冒烟 24/24（`scripts/smoke_takedown.py`：建议 → 确认 → 隐藏/释放 → 收藏标注 → 学习记录保留）；迁移 `i4j5k6l7m8n9`（← `h3i4j5k6l7m8`）。

## 关联

- ADR-0017（Catalog 候选池）：promote 仍走完整下载管线；**版权风险不因存储三态改变**，proxy 模式若落地可作为「不下载」的合规路径，故与 §5.4 的排期绑定。
- `docs/operations/MEDIA-TOPOLOGY.md`：媒体落盘与 nginx `/media` 拓扑。
- 需求 §6：代理视频的字幕/点词第一期不做。
