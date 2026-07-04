# Phase 4 遗留 Backlog — B2（删除）+ B3（sticky mini-player）

> 承接 `REDESIGN-2026-07.md` Phase 4 遗留 backlog。B1 暂不做。
> 决策：B2 走 Route A（彻底删，含 drop 表 + 迁移）；B2 热力图整块删；B3 完成移动端 sticky mini-player。
> 约定（CLAUDE.md）：改 symbol 前跑 `gitnexus_impact`（已跑，见下）；提交前跑 `gitnexus_detect_changes()`；HIGH/CRITICAL 风险须先警告。

## 前置：impact 分析结论（已跑）

| 目标 symbol | 直接调用方 | 风险 |
|---|---|---|
| `get_user_stats` | `ai.py:assistant_summary` + `users.py:get_my_stats` | LOW |
| `get_streak_info` | `users.py:get_my_streak` | LOW |
| `get_activity_calendar` | `users.py:get_my_activity` | LOW |
| `update_streak` | 仅 `scripts/backfill_daily_activities.py`（脚本，一并删） | LOW |
| 4 个 `record_*_activity` | 零调用方（纯孤儿） | LOW |

前端 grep：`/users/me/streak`、`/users/me/stats` **零消费方**（4.9 已删 homepage bento）；`/users/me/activity` 唯一消费方是 `/history` 的 `ActivityHeatmap`（本次删）。`/ai/assistant/summary`+`/ai/assistant/recommend` 前端零消费方（属 AI 功能，不删端点，仅拆依赖）。

边界结论：
- `User.last_active_at` **从未被写入**（grep 无赋值），但 `admin_service` 读它算"活跃用户"——既存 bug，非 B2 范围，**列保留**。
- `streak_count`/`longest_streak` 仅 activity_service 读写，admin 不读 → 删后变死列，**保留为冻结列**（避免迁移+契约抖动，与 SpeakingAttempt 冻结模式一致）。
- activity_service **无测试引用**（grep 无），删函数无测试清理。

---

## B2 — Route A：删 streak/activity 死代码

### 后端

1. **删 `backend/app/services/activity_service.py` 整文件**。所有函数均死：4 recorder + `update_streak` + `get_streak_info` + `get_activity_calendar` + `get_user_stats` + helpers（`_check_goal_met`/`_update_avg`/`_today`/`get_or_create_daily_activity`）。

2. **`backend/app/api/v1/users.py`**：删 3 个端点
   - `GET /me/activity`（L230-245）
   - `GET /me/streak`（L248-260）
   - `GET /me/stats`（L263-276）
   - 删 import L24 `from app.services.activity_service import ...`

3. **`backend/app/api/v1/ai.py`**：重构 `assistant_summary`（L30-58）拆掉 `get_user_stats` 依赖
   - 删 import L10
   - `stats` 字典改为内联真实数据源：`vocabulary_count`（L41 已有）+ `videos_watched`（L44-47 已有）+ `current_level`（L50 已有）。删 frozen speaking 指标（accuracy/fluency/completeness/trend）——本就过期失真。
   - `ai.assistant_daily_summary(stats)` 收到更精简、真实的字典。

4. **删 `backend/app/models/daily_activity.py` 整文件**（模型随表 drop）。

5. **`backend/app/models/user.py`**：删 `daily_activities` relationship（L80）。**保留** `streak_count`/`longest_streak`/`last_active_at` 三列（冻结，见边界结论）。

6. **删 `backend/scripts/backfill_daily_activities.py` 整文件**（仅依赖 update_streak + DailyActivity，随删）。

7. **`backend/app/schemas/user.py`**：删 4 个未用 response schema（端点均无 `response_model=`，返回裸 dict，确认未用后删）
   - `UserStatsResponse`（L172-180）
   - `StreakInfoResponse`（L183-189）
   - `DailyActivityResponse`（L192-203）
   - `ActivityCalendarResponse`（L206-209）
   - **保留** `UserResponse.streak_count`/`longest_streak`/`last_active_at`（L107-109，冻结列 + admin 读 last_active_at）。
   - 实施时先 grep 这 4 个 schema 名确认无其他引用再删。

8. **新 alembic 迁移**：drop `daily_activities` 表
   - `down_revision` = 当前 head（实施时 `alembic heads` 确认）
   - `upgrade()`：`op.drop_table('daily_activities')`（UniqueConstraint 随表 drop）
   - `downgrade()`：重建表（回滚安全）
   - 命名：`drop_daily_activities.py`

### 前端

9. **`frontend/src/app/(main)/history/page.tsx`**：删热力图区块
   - 删 `activityCalendar` state（L24-25）+ `/users/me/activity` fetch effect（L50-62）
   - 删月份导航 state（`year`/`month`/`prevMonth`/`nextMonth`/`monthNames`，L20-96）——仅热力图用
   - 删热力图 Card 区块（L116-151）
   - 删 imports：`ActivityHeatmap`、`ActivityCalendar` 类型、`Calendar`/`ChevronLeft`/`ChevronRight` 图标（若仅热力图用）
   - **保留** 视频学习记录列表（LearningRecord，真实数据）+ 其分页
   - /history 页头部"学习记录"标题保留

10. **删 `frontend/src/components/dashboard/ActivityHeatmap.tsx` 整文件**。

11. **`frontend/src/types/index.ts`**：删 3 个死类型
    - `StreakInfo`（L252-259，无消费方）
    - `DailyActivity`（L261-273，仅 ActivityHeatmap 用）
    - `ActivityCalendar`（L275-277，仅 /history 用）
    - **保留** `User.streak_count`/`longest_streak`（L13-14，冻结）+ `AdminUser.last_active_at`/`speaking_attempts`（admin 读）

### B2 验证
- `cd backend && pytest tests/ -v`（应全过，无测试引用 activity_service）
- `cd backend && alembic upgrade head`（本地验证迁移可应用）
- `cd backend && ruff check`
- `cd frontend && npx tsc --noEmit`（前端类型删除后类型门禁）
- `gitnexus_detect_changes()`（确认仅波及 assistant_summary + users 路由流程，无残留 streak/activity 流程）

---

## B3 — 移动端 sticky mini-player

### 新 hook

12. **`frontend/src/hooks/useMediaQuery.ts`**（新建，通用，SSR-safe）
    - `useMediaQuery(query: string): boolean`
    - `useEffect` 内 `window.matchMedia`，监听 `change` 事件；初始 `false`（SSR 安全，挂载后纠正）。风格对齐 `useTheme.ts` 的裸 matchMedia 用法。

13. **`frontend/src/hooks/useStickyPip.ts`**（新建）
    - `useStickyPip(slotRef: RefObject<HTMLElement>, enabled: boolean): { isPip: boolean; dismissed: boolean; dismiss: () => void }`
    - `IntersectionObserver` 观察 `slotRef`，`rootMargin: "0px 0px -80% 0px"`（slot 离开顶部 20% 视口 → `isPip=true`）
    - `dismissed` 状态 + `dismiss()` 关闭；slot 重新进入（`isPip` 变 false）时自动重置 `dismissed=false`（重新武装）
    - `enabled=false` 时直接返回 `isPip=false`（桌面禁用）
    - SSR-safe（observer 仅在 useEffect 内创建）

### 应用

14. **`frontend/src/app/(main)/my-videos/[id]/page.tsx`**（B3 主目标）
    - `slotRef` 加在 `aspect-video` div（L319）
    - `const isMobile = useMediaQuery("(max-width: 1023px)")`
    - `const { isPip, dismissed, dismiss } = useStickyPip(slotRef, isMobile && !!video.video_url_720p)`
    - `<video>`（L321-326）className 条件化：`isPip && !dismissed` 时加 `fixed bottom-4 right-4 z-50 w-[160px] max-w-[40vw] h-auto rounded-lg shadow-2xl`；否则 `w-full h-full`
    - `aspect-video` 父级保留布局槽（video 浮为 fixed 时页面不塌陷——aspect-video div 维持自身盒尺寸）
    - mini-player 右上角加小 × 关闭按钮（绝对定位，`dismiss()`）
    - **关键**：`<video>` DOM 节点不变（复用 `videoElRef`），播放状态天然保持；`seekTo`/`SubtitleEditor` 仍指向同一节点
    - 桌面 `lg:sticky lg:top-6`（L318）不变

15. **`frontend/src/app/(main)/watch/[id]/page.tsx`**（一并加，同一 hook）
    - `slotRef` 加在播放器 `aspect-video` div（L420）
    - 同上 `useMediaQuery` + `useStickyPip`，gate 于 `isMobile && playbackMode === "ready"`
    - `<video>`（L422-434）className 条件化同上；`onTimeUpdate` 等 props 不变
    - 桌面右侧字幕面板 `lg:sticky`（L578）不变

### B3 验证
- `cd frontend && npx tsc --noEmit`
- `cd frontend && npm run build`
- 手测：移动视口（<1024px）下滚过播放器 → 右下角 mini-player 浮现、播放连续；× 可关；滚回播放器 → 复原；桌面（≥1024px）无此行为，保持原 sticky。

---

## 执行顺序与提交

- **先 B2**（后端死代码 + 迁移 + 前端类型清理）→ 验证 → commit → `gitnexus_detect_changes()`
- **后 B3**（纯前端，新 hook + 两页接入）→ 验证 → commit → `gitnexus_detect_changes()`
- 两个 commit 独立，便于回滚。B2 风险高于 B3（含迁移），先做先验证。

## 风险
- **B2 迁移**：生产部署须跑 `alembic upgrade head` drop `daily_activities`。drop 不可逆，但表内仅冻结的 historical speaking 活动快照，无代码读、无用户面影响。downgrade 重建表保证回滚。
- **B2 `assistant_summary`**：LLM 摘要丢失 speaking 指标输入（本就 frozen/失真），改为 vocab+watch 真实数据。端点保留，无前端消费方，影响面小。
- **B3**：纯前端，无后端/迁移风险。`<video>` 节点不变保证播放连续。IntersectionObserver SSR-safe。
