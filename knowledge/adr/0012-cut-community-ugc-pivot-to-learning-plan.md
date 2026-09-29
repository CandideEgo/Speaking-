# ADR-0012: 产品定位收敛 - 砍社区 UGC，转向 AI 学习计划

- **Status**: Accepted - 2026-07-23
- **Supersedes**: ADR-0001（"视频词汇学习 + 社区 UGC 并重"中的"社区 UGC"一条腿）

## Context

ADR-0001 把核心价值定为"视频词汇学习 + 社区 UGC"两条腿并行。实践数周后暴露：

- 社区 UGC 不解决英语学习核心问题（找到内容 / 理解视频 / 记住词汇 / 持续学习），却带来审核运营成本与系统复杂度：posts/post_likes/user_comments/comment_likes/comment_reports/follows 6 张表、4 处通知触发、admin 审核块、creator 中心、propose-back PR 机制。
- 社区与推荐/学习闭环耦合：`VideoLike` / `like_count` / `is_featured` 被推荐系统读取，社区改动会波及推荐，增加风险。
- 真正能形成长期英语能力提升的闭环是"目标 → 计划 → 观看 → 词汇 → 练习 → 复习 → 调整"，社区在其中不起作用。

新北极星指标：**用户每周完成多少次完整学习循环**（观看 + 词汇学习 + 练习 + 复习）。

## Decision

1. **砍社交社区**：删除 posts / post_likes / user_comments / comment_likes / comment_reports / follows 6 张表及全部相关 API / service / 前端。**保留 `VideoLike`**（视频点赞，从 `community_service` 迁出到 `video_like_service`），因其喂推荐 `like_count` / `is_featured`、运营成本近零、watch 页点赞按钮依赖。
2. **砍用户面 UGC**：删除用户上传 / 创作者中心 / 审核工作流 / propose-back。**保留**管理员 seed + 管线 + fork/标准版去重机制（ADR-0006，dormant）+ `is_published` / `is_official` / `auto_publish` / `forked_from`。
3. **新核心**：转向 `UserLearningProfile` + AI `LearningPlan`（规则系统 + AI）+ `LearningEvent` / `WordMastery` 数据闭环 + 视频学习元数据，驱动个性化学习路线与推荐升级。ADR-0011 的 `behavior_events` P0 阻塞项由 `LearningEvent` 落地解锁。

## Consequences

- 产品从"视频学习社区"转为"**AI 驱动的英语学习 Netflix + Anki**"。
- ADR-0001 的"社区 UGC"一条腿移除；"视频词汇学习"一条腿保留并强化为完整学习闭环。
- ADR-0004（UGC admin-triggered）事实失效，保留为历史记录；用户面 UGC 入口整体移除。
- ADR-0006（fork / 标准版）机制代码保留 dormant，无活跃调用方（用户提交已移除）；未来学习计划若需"加入我的库"可复用。
- 推荐系统（ADR-0011）输入信号：`like_count` / `is_featured` 保留（VideoLike 在），新增 `WordMastery` / `LearningEvent` 学习信号逐步替代社区行为信号。
- 沉没成本：Phase 4 社区对齐、actor-aware 通知去重的社区触发部分废弃；通知去重机制本身保留（非社区通知仍用）。
- 删表不可逆 → 实施前 `pg_dump` 备份；drop 仅限 6 张纯社区表，`video_likes` 与 Video UGC 列保留 dormant 以降不可逆性。
