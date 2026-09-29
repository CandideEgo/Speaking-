# ADR-0003: 移除口语进度追踪；dashboard 改建为非口语数据

- **Status**: Accepted — 2026-07-03
- **Depends on**: ADR-0002（砍评分）

## Context

口语 stats / streak / 每日目标 / 统计面板全部依赖评分数据（`SpeakingAttempt` 写入 → `record_speaking_activity` → `update_streak` / `update_learning_record` / `DailyActivity`）。ADR-0002 砍掉评分后，这些失去数据源。用户决策：**口语相关 stats / streak / 目标全删**；dashboard **改建为非口语数据**。

录音为纯回放、零留存（ADR-0002），所以**录音不产生任何数据**，无法喂给 dashboard。

## Decision

**移除（口语专属）**：
- `LearningPrefsTab.tsx` / `onboarding/page.tsx` 中 `speaking_attempts` 目标类型选项
- dashboard 的 `StatsGrid`"跟读次数"卡、`ActivityHeatmap` speaking 数据、`DailyGoalProgress` speaking 目标、`RecentActivityTimeline`"次跟读"标签
- admin `stats/page.tsx` 口语趋势图、`users/page.tsx`"口语练习次数"列
- `community/ShareToCommunityDialog.tsx` 的 `speaking_share` post type（引用 `speakingAttemptId`）
- `types/index.ts` 中 `SpeakingAttempt` / `SpeakingResult` / `speaking_attempts` 字段（~12 个 interface）

**改建 `/dashboard`**：热力图 / 时间线 / 统计卡改接**非口语学习活动**——SM-2 词汇复习 + 视频观看（`DailyActivity` 非 speaking 列）。统计卡改为：词汇复习数、视频观看数、观看时长等。

**streak / 每日目标**：若 streak 有词汇/观看等其他来源（`update_streak` 是否从 vocab/watch 调用需验证），主 streak 存活；只移除 speaking 专属目标类型。

## Consequences

- dashboard 失去口语指标，转为词汇+观看指标。
- ⚠️ **关键依赖**：`DailyActivity` 必须追踪 vocab/watch 活动，否则 dashboard 无数据可接。**实现时先验证** `DailyActivity` schema 与写入点；若无非口语活动数据，fallback = 删除 `/dashboard`（学习记录靠 `/history` 页）。
- admin 统计页 / 用户页移除口语列。
- `SpeakingAttempt` 表历史数据保留只读（ADR-0002），但不再出现在任何 UI。
- streak 闭环若失去 speaking 且无其他来源，需在实现时补 vocab/watch → streak 的写入。
