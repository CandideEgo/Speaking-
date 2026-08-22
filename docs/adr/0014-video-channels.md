# ADR-0014: 视频频道（官方策展维度）— Channel 实体表

- **Status**: Accepted - 2026-08-20

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
