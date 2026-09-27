# Handoff: S8 集合详情页两栏 + 已掌握/取消标记 + 返回与 tab 状态 + 过筛告知

- Owner: `vocab-learning`
- Status: done
- Planner acceptance: 集合详情页两栏卡片且一键已掌握（徽标即时翻转）；已掌握的词能取消标记；返回按钮回到「词库 · 视频集合」tab（tab 状态进 URL）；过筛页出现告知文案；DailyHero 不再提 SM-2；四道本地门全绿（mypy 与基线比对差集为空）。

## 任务

设计文档 §7.1–7.3 落地：集合详情页行式列表 → 两栏卡片（单词 + IPA + 释义 + 已掌握 + 回到对应句子）；新增 unmark 端点支持取消标记；页头返回 + `/vocabulary` 的 topTab/libraryTab 写进 URL；过筛页补「不计入学习计划」告知；DailyHero 文案与新算法对齐。

## 已完成

- `backend/app/services/vocab_set_service.py` — 新增 `unmark_learned`（见关键决策 1 的 mastery 口径）：集合词 `known/learned → unknown`、清 `learned_at`，词行 `mastery_level → learning`、`interval_days = 1`、`next_review_at = now + 1 天`；非 mastered 词的 unmark 是幂等 no-op。`_emit_closure_event` 加**每集合至多一次**守卫（按既有事件的 `set_id` metadata 判重，无需新列）：unmark 重开集合后再学完不再重复发 learned_words 事件 / 重复计 `today_words_learned`。
- `backend/app/api/v1/vocab_sets.py` — 新增 `POST /api/v1/vocab-sets/{set_id}/words/{set_word_id}/unmark`（30/min），响应形状与 learned/sieve 一致：`{status, completed, mastered_count, total}`；未知集合/词/他人集合 → 404。
- `backend/tests/test_vocab_sets.py` — 新增 `TestUnmarkLearned` 6 条：状态与词行翻转断言、闭环→取消→重学恰好 1 条 learned_words 事件且 `today_words_learned` 不翻倍、unmark 后的词不在当日新词/复习队列、pending 词 unmark 幂等（mastery 仍 new、`next_review_at` 仍 None）、他人集合 404。
- `frontend/src/app/(main)/vocabulary/sets/[id]/page.tsx` — `divide-y` 行式列表 → `grid grid-cols-1 md:grid-cols-2 gap-3.5` 卡片（`Card variant="outline"`：单词 + IPA + 词性 + 释义 + 状态 Badge + 底部操作行）。「标为已掌握」走现成 `POST …/learned`，「取消标记」走新 unmark 端点，`statusOverrides`/`masteredDelta` 就地翻转徽标与页头 `已掌握 N/M · pct`，不整页重拉；「回到对应句子」保留（`watchSentenceHref`，仅 `subtitle_id` 存在时显示）；**无删除按钮**。页头新增面包屑返回链接「词库 · 视频集合」→ `/vocabulary?tab=library&sub=sets`。
- `frontend/src/app/(main)/vocabulary/page.tsx` — `topTab`/`libraryTab` 从组件 state 改为 URL query 派生（`tab=library&sub=sets|words`；today 是默认态不占 query），切换用 `router.replace(..., { scroll: false })`；`useSearchParams` 用法与 favorites/browse 同款（本页直接使用，构建通过）。
- `frontend/src/app/(main)/vocabulary/sets/[id]/sieve/page.tsx` — 判定按钮下新增告知文案「标为『会』的词不计入学习计划，不会再出现在训练队列里」。行为零改动。
- `frontend/src/components/vocabulary/DailyHero.tsx` — 「按 SM-2 间隔推送」→「按错误次数安排复习」（与 DEC-057 口径一致）。
- `frontend/src/app/(main)/vocabulary/drill/page.tsx` — 仅注释同步（4 处 SM-2 表述改为 DEC-057 分档表述），代码零改动。

## 契约变更

- 新增端点 `POST /api/v1/vocab-sets/{set_id}/words/{set_word_id}/unmark`，响应 `{status: VocabSetWordStatus, completed: bool, mastered_count: int, total: int}`（与 learned/sieve 同形状）。无 schema 文件（端点返回裸 dict），前端未入 `types/index.ts`（不在本票文件边界），响应类型内联在 `sets/[id]/page.tsx`（`SetWordMutationResponse`）。若后续「全部单词」页也要取消标记，可在 `api/v1/vocabulary.py` 加词行级 unmark 复用同一 mastery 口径。
- 其余契约文件（`backend/app/schemas/video.py`、`core/config.py`、`api/dependencies.py`、`frontend/src/lib/api.ts`/`createApiClient.ts`、`frontend/src/types/index.ts`）：**无**。
- 数据库 schema：**无变更**。

## 关键决策

- **unmark 的 mastery 口径按 `build_daily_session` 反推**：新词队列只取 `mastery == new`（恢复成 new 会立刻把词推回**当日**新词队列，违背票面「不进当日新词队列」）；复习队列只取到期且 `mastery ∉ {new, mastered}`。故取 `learning + 次日到期`：两个当日队列都不进，次日以干净词身份进复习（`interval_days=1`，DEC-057 阶梯第一个严格大于 1 的档是 3 天，衔接自然）。不触碰 `wrong_count`/`ease_factor`/S6 调度语义。
- **闭环事件每集合至多一次**：unmark 会把已闭环集合重开（unknown≥1），此后的 sieve/learned 再闭环会走 `was_completed=False` 分支重复发事件。守卫放在 `_emit_closure_event`（按事件 metadata 的 `set_id` 判重），同时覆盖 sieve_judge 与 mark_learned 两条再闭环路径，且不需要给 `VocabSet` 加列（models 不在本票边界）。测试断言 `today_words_learned` 不翻倍。
- **「已掌握」按钮语义 = 现成 `mark_learned`**（置 `learned` + mastered）；unmark 是它的逆（回 `unknown` = 待学清单），过筛页的「我已学会」闭环流程不受影响。
- **调用方影响分析（Gate 0）**：`unmark_learned` 为新函数无存量调用方；`_emit_closure_event` 的调用方（`sieve_judge`、`mark_learned`）签名不变，仅新增判重读查询，两者现有测试全数通过；`/vocabulary` 页 tab 派生只改状态来源（state→URL），无其它组件消费这两个 state；`sets/[id]` 页重写不改动 `useVocabSetDetail`/`watchSentenceHref` 契约。无 HIGH 风险。
- 文案反查：`grep -rn "回看原句|回到对应句子|SM-2" e2e/ src/` —— e2e **零匹配**（无旧断言）；src 中「回看原句」「回到对应句子」均为合法现役文案。残留 SM-2 文案均在**本票文件边界外**（见遗留 3）。

## 遗留

- **门禁 1 结果**：前端 `npx tsc --noEmit` exit 0；`npm run test:unit` exit 0（108 passed）；`npm run lint` exit 0（10 个存量 warning，0 error）；`npm run format:check` exit 0；`npm run build` exit 0。后端 `pytest tests/ -q` exit 0；`ruff check` / `ruff format --check` exit 0（test 文件先被 format 修了一次再过）；mypy（venv 2.3.1）原始 exit 1 为存量 53 个 file:code 对，与 `.mypy-baseline` 双向差集均为空，未加 baseline 行。
- e2e 未跑（本机 Postgres/Docker 仍未恢复，同 T2；本票改动了集合详情页布局，screenshot-matrix 的 /vocabulary 快照不受 tab query 影响）。
- **边界外残留的 SM-2 旧文案**（不在本票允许文件清单，未动）：`app/(main)/layout.tsx:7`（SEO metadata）、`app/(main)/practice/page.tsx:296`、`components/auth/AuthCard.tsx:7`；另有注释级残留 `hooks/useStudySession.ts:32`、`hooks/usePractice.ts:58`、`types/index.ts:574`。建议 T5 收尾时顺手清。
- `frontend/src/types/index.ts` 若后续要承载 unmark 响应类型，可把 `SetWordMutationResponse`（内联于 sets/[id]/page.tsx）收编进去。
- 本票未提交（按约定由 planner 串行提交）；树上仍叠着 S4–S7 的未提交改动，验收时按文件清单区分。
