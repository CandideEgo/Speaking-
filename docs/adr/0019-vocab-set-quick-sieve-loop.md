# ADR-0019: 词汇学习闭环 — 视频集合 + 快速过筛（三态状态机）

- **Status**: Accepted - 2026-09-19

## Context

内测上线需求（`docs/requirements/REQUIREMENTS-launch-internal-test.md` §4）要求把「刷视频顺便学词」做成可留存的闭环：视频页一键收词 → 按视频聚合的词汇集合 → 两档快速过筛 → 学完待学清单 → 集合 100%。核心争议点有三：

1. **状态机不一致**：现有 `Vocabulary.mastery_level` 是四态（`new/learning/reviewing/mastered`），由 SM-2 的 `review_count` 推导；需求要求对外三态（未学 / 学习中 / 已掌握），明确不做「复习中」。
2. **是否新建集合数据**：需求 §4.6 写「新增 `vocab_sets` 与 `vocab_set_words`」，同时要求「集合里的词 = 词汇本里的词，不建两套数据」——字面上矛盾，需要确定状态存哪儿。
3. **闭环终点不可达**：需求 §4.5 定义「学完待学清单 → 全部标记已掌握 → 100%」，但三态下判「不会」的词进入待学清单后，若没有「标记已掌握」的动作，集合永远停在 N-1/N。

## Decision

**1. 集合表只存引用与流程状态，掌握态仍归词汇本**

- `vocab_sets`：`(user_id, video_id, exam_level)` 唯一 + `last_activity_at`。
- `vocab_set_words`：`set_id` → `vocabulary_id`（FK）+ `position`（入集/过筛顺序）+ 流程状态 `pending|known|unknown|learned` + `sieved_at/learned_at`。
- `Vocabulary` 行仍是词的唯一实体（释义/音标/例句/掌握度），集合通过 FK 引用；批量收词时对词汇本里没有的词先建行再引用。**状态是两个维度**：`vocab_set_words.status` 是「本集合内的过筛/学习进度」，`vocabulary.mastery_level` 是「该词的全局掌握态」，前者流转时同步后者（单向升级，不降级）。

**2. 三态对外，SM-2 对内**

- 对外展示与集合进度只用三态：`pending`=未学、`unknown`=学习中（待学清单）、`known|learned`=已掌握。`reviewing` 并入「学习中」展示（仅前端筛选合并 `mastery=learning,reviewing`），后端枚举不迁数据。
- 现有 SM-2 即需求 §2.3 的「基本复习」，内测期原样保留；§4.1 的「高级复习算法」指 Pro 二期的增强调度，不指拆除现有引擎。
- **配套行为变更**：`mastered` 退出复习队列（due 过滤 4 处加 `mastery_level != "mastered"`）。理由是文档三态语义「已掌握 = 闭环终点」；否则过筛判「会」的词会以 `next_review_at IS NULL` 的身份立刻爬回复习队列，三态被架空。

**3. 闭环终点需要显式动作**

- `POST /vocab-sets/{id}/words/{id}/sieve`（两档判定）之后，待学清单的词由 `POST /vocab-sets/{id}/words/{id}/learned` 标记为已掌握。
- 集合 `completed` = **无 `pending` 且无 `unknown`**（不是「过筛走完」）；首个闭环时刻发一条 `LearningEvent(learned_words, value=集合总数)`，跨过终点后再操作不重复发射。

**4. 收词只读本地 ECDICT**

- 批量收词按用户 `UserPreferences.target_exam` 过滤字幕 `word_levels`，逐词 find-or-create，释义走 `ecdict.lookup`（纯本地）。**严禁**复用 `vocabulary_service.enrich_word`——那会走 AI 服务，批量收词会破坏「运行时 AI 只发生在视频处理管线」的架构约束（`.agent/context.md`）。

## Consequences

- 新增 `GET/POST /vocab-sets*` 五个端点；前端词汇本默认「视频集合」视图、「全部单词」兜底，新增集合详情与过筛页（服务端为唯一事实来源，按词保存进度，可随时退出续筛）。
- 掌握态单一事实来源仍是 `Vocabulary`，集合可随时重建而不丢学习记录；代价是集合进度需聚合查询（无冗余计数列）。
- `mastered` 退出复习队列是**有意的行为变更**：存量已达 mastered 的词不再进入日常复习。对「已掌握」的语义更诚实，但削弱了长期间隔复现——如需恢复，Pro 二期的高级复习算法应显式定义 mastered 的复现策略。
- 内测期免费开放（§2.3），集合数量不限；「不限量集合」作为未来 Pro 差异项保留在设计里。
- 验证：+24 测试（`tests/test_vocab_sets.py`），全量 726 passed；端到端冒烟 31/31（`scripts/smoke_vocab_loop.py`：收词 → 集合 → 过筛 → 续筛 → 待学清单 → 闭环）。

## 关联

- ADR-0011（推荐与行为采集）、ADR-0016（可访问性）无直接耦合。
- 领域术语：`.agent/context.md`「学习」章节。
- 需求 §4.6 明确**不复用**已下线的 `LearningPlan` / `LearningPlanItem`（f855613）。
