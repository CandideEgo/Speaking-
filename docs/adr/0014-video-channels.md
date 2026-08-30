# ADR-0014: 视频频道（作者页）- Channel 实体表

- **Status**: Accepted - 2026-08-20；修订 Accepted - 2026-08-30（全量作者页，见文末）

## Context

产品希望提供「视频频道」浏览维度。已核实事实：

- `Video` 已有抓取来的外部元数据 `yt_video_id / channel_id / channel_name / upload_date / ext_*`（ADR-0011 阶段 1）；
- UGC 已砍（ADR-0012）→ 频道只针对官方视频，本质是**官方策展维度**，不是创作者生态；
- 推荐已有 `/recommendations/category/{tag}` 主题维度（feedStore 承接）。

候选方案：

1. **Channel 实体表**（管理员维护）＋ Video 关联；
2. 轻量方案：按抓取的 `channel_name` 聚合，不建表。

方案 2 被否：频道需要排序、封面、简介、启停、slug 路由，聚合方案全部给不了；且 `channel_name` 是抓取文本，拼写不稳定（大小写/后缀差异），不能当身份键。

## Decision

1. **数据模型**：
   - 新表 `channels`：`id / name / slug(唯一) / description / cover_url / sort_order / is_visible / created_at / updated_at`，管理员维护；
   - `videos.channel_ref`：可空 FK → `channels.id`（`SET NULL` on delete）；
   - 抓取字段 `channel_id/channel_name` **保持原样**（上游元数据），`channel_ref` 是站内策展归属，两者映射规则：管理后台创建频道时可登记上游 `channel_id`，ingest/回填时按 `channel_id` 自动挂接。
2. **与 category/tag 的关系（定死）**：频道 = 「内容源」维度，category/tag = 「主题」维度，正交并存；浏览页各自独立入口，不做联动推荐，避免两套浏览体系纠缠。
3. **后端 API**：`GET /channels`（列表，匿名可访问）、`GET /channels/{slug}`（详情＋视频分页）；管理端 CRUD 并入现有 admin 路由组织。
4. **前端**：频道列表页、频道详情页（复用 VideoCard）、浏览页频道区块、watch 页/视频卡频道名入口。
5. **一期不做**：订阅/关注、频道内搜索、频道级统计（需要时另立 ADR）。

## Consequences

- 新增一张 Alembic 迁移（channels 表 + videos.channel_ref 列与索引）。
- 一次性回填脚本按 `channel_id` 把现有官方视频挂到对应 Channel。
- `/media/` 封面本地化（任务 3）同样适用于频道封面：`cover_url` 走 upload 服务落本地卷。
- 频道不参与推荐评分（feed 逻辑零改动，feedStore 不动）。
- 若未来要做订阅/关注，涉及用户关系表与 feed 改造，必须新 ADR。

---

## 修订（2026-08-30）：全量作者页（Auto-Channel）

- **Status**: Accepted - 2026-08-30

### Context（修订动因）

初版落地后用户拍板升级：任何抓取到作者信息的视频，其作者都应像主流流媒体平台一样拥有可浏览的主页，「点作者名进作者页、看本站内该作者全部视频」。策展制下未建档的作者没有主页，覆盖不了该预期。

### Decision（修订内容）

1. **ingest 自动建档**：`channel_service.ensure_channel_for`（find-or-create）。视频入库时按抓取的 `channel_id` 查频道，未注册则自动创建（`is_auto=True`、`is_visible=True`、封面/简介留空）；已注册的策展频道优先，不重复建档。
2. **`channels.is_auto` 列**（迁移 `e0f1g2h3i4j5`）：区分自动建档（true）与管理员手建策展（false）；管理端列表显示「自动/策展」标记，自动频道可被管理员正常编辑装修。`upstream_channel_id` 加唯一索引防并发重复建档（迁移前先合并去重存量重复行）。
3. **自动频道 slug 规则**：`slugify(名称)` 可用则用；中文名等无 ASCII slug 时回退 `upstream_id` 小写（YouTube `UCxxx` 天然唯一且合规）；再撞则追加短 hash 后缀。
4. **频道封面动态兜底**：`cover_url` 为空时（自动频道常态）用该频道最新一条公开视频的 `thumbnail_url`，列表/详情统一生效。yt-dlp 视频 info 拿不到频道头像，不单独建 avatar 字段。
5. **公共列表排序与分页**：`GET /channels` 改分页 envelope（`paginated()`）；策展频道按 `sort_order` 在前，自动频道按视频数 desc 在后；`video_count=0` 的频道隐藏（自动频道至少含触发视频，此规则主要隐藏手建空频道）。浏览页横滑条（ChannelStrip）取前 12。
6. **作者名入口**：`_video_to_dict` / `VideoResponse` / favorites / video detail 补 `channel_slug`（browse feed 顺手补上此前一直缺失的 `channel_name`，修复浏览页卡片作者名恒显 "SeeWord" 的旧问题）；前端 VideoCard 频道名可点（外层卡片是 Link，用受控 span + `router.push` 避免嵌套 `<a>`）、watch 页 meta 细行作者名替换写死的 "SeeWord" 并链到作者页。
7. **回填脚本** `scripts/backfill_auto_channels.py`：存量视频按 `channel_id` 批量补挂（支持 `--dry-run`）。

### 不变项

- 原文 Decision 2（与 category/tag 正交）与「一期不做」清单（订阅/关注、频道内搜索、频道级统计）维持。
- 频道仍不参与推荐评分；挂接频道后失效 browse/home/detail 相关缓存（管理端挂接与回填脚本均已接入）。

### Consequences（修订）

- 全量作者页意味着频道数量 = 作者数量（批量入库后可能数百）；列表靠「策展在前 + 分页」消化，浏览页横滑条限量。
- 自动频道未装修时的观感依赖封面兜底（最新视频缩略图）；运营可在 admin 频道管理里逐步装修重点作者。
- 竞态说明：同作者两视频并发 ingest 可能双双尝试建档，唯一索引拒绝后者，Celery 重试后命中前者，可接受，无需额外锁。
