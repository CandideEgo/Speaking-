# Technical Decisions

> Append-only decision log. **Never edit or reorder an existing entry** — an entry records what
> was true and why at that moment. To change course, append a new entry and mark the old one
> `superseded by DEC-0xx` in `decisions-index.md`.
>
> Entry format: `## <date> — <title>`, then `**Problem** / **Options** / **Decision** / **Reason** /
> **Trade-offs**`, plus `**ADR**` when a record exists. Older entries legitimately omit `**Options**`.
>
> **Navigation**: read `decisions-index.md` first (ID → date → title → ADR → status), then open the
> one entry you need. Do not read this file end to end — it is the largest file in the knowledge
> layer and grows with every decision.
>
> IDs live in the index, assigned in file order (append order, not date order). 9 dates repeat, so
> date alone does not identify an entry — cite the `DEC-` ID.
>
> **Archived bodies**: when this file reaches its size ceiling, the oldest era's entry text moves
> verbatim to `archive/decisions-YYYY-MM.md`, and its heading stays here as a stub pointing at it.
> Nothing is reordered and no ID is reassigned — see `scripts/check-knowledge/README.md`.

## 2026-07-03 — Product positioning: video vocabulary + community UGC

DEC-001 — body archived verbatim → [decisions-2026-07.md](archive/decisions-2026-07.md)

---

## 2026-07-03 — Recording changed to playback-only

DEC-002 — body archived verbatim → [decisions-2026-07.md](archive/decisions-2026-07.md)

---

## 2026-07-03 — UGC pipeline admin-triggered

DEC-003 — body archived verbatim → [decisions-2026-07.md](archive/decisions-2026-07.md)

---

## 2026-07-03 — Unified frontend component library

DEC-004 — body archived verbatim → [decisions-2026-07.md](archive/decisions-2026-07.md)

---

## 2026-07-03 — Standard version + Fork + Propose-back

DEC-005 — body archived verbatim → [decisions-2026-07.md](archive/decisions-2026-07.md)

---

## 2026-07-03 — Redemption code 4-state machine

DEC-006 — body archived verbatim → [decisions-2026-07.md](archive/decisions-2026-07.md)

---

## 2026-07-03 — Recommendation system planning

DEC-007 — body archived verbatim → [decisions-2026-07.md](archive/decisions-2026-07.md)

---

## 2026-07-20 — Frontend-backend unification

DEC-008 — body archived verbatim → [decisions-2026-07.md](archive/decisions-2026-07.md)

---

## 2026-07-19 — Dark mode via CSS semantic tokens

DEC-009 — body archived verbatim → [decisions-2026-07.md](archive/decisions-2026-07.md)

---

## 2026-07-22 — Actor-aware notification dedup

DEC-010 — body archived verbatim → [decisions-2026-07.md](archive/decisions-2026-07.md)

---

## 2026-07-23 — Quality safety net: fail-fast vs fail-through

DEC-011 — body archived verbatim → [decisions-2026-07.md](archive/decisions-2026-07.md)

---

## 2026-07-23 — Translation retry: exponential backoff vs circuit breaker

DEC-012 — body archived verbatim → [decisions-2026-07.md](archive/decisions-2026-07.md)

---

## 2026-07-23 — Fork indicator display strategy: where and why

DEC-013 — body archived verbatim → [decisions-2026-07.md](archive/decisions-2026-07.md)

---

## 2026-07-23 — Video status response: subtitle_count for resume hint

DEC-014 — body archived verbatim → [decisions-2026-07.md](archive/decisions-2026-07.md)

---

## 2026-07-23 — Word_levels preservation: compute-on-null vs always-recompute

DEC-015 — body archived verbatim → [decisions-2026-07.md](archive/decisions-2026-07.md)

---

## 2026-07-24 — Video storage: HK VPS file server vs OSS vs source station local

DEC-016 — body archived verbatim → [decisions-2026-07.md](archive/decisions-2026-07.md)

---

## 2026-07-24 — ADR-0012: Cut social community UGC, pivot to AI learning plan

DEC-017 — body archived verbatim → [decisions-2026-07.md](archive/decisions-2026-07.md)

---

## 2026-07-24 — LearningEvent vs BehaviorEvent: separate models

DEC-018 — body archived verbatim → [decisions-2026-07.md](archive/decisions-2026-07.md)

---

## 2026-07-24 — WordMastery: enhance Vocabulary vs new table

DEC-019 — body archived verbatim → [decisions-2026-07.md](archive/decisions-2026-07.md)

---

## 2026-07-24 — UX design direction: Apple HIG + Material Design + Linear principles

DEC-020 — body archived verbatim → [decisions-2026-07.md](archive/decisions-2026-07.md)

---

## 2026-08-14 — 全站审查修复：关键决策

DEC-021 — body archived verbatim → [decisions-2026-08.md](archive/decisions-2026-08.md)

---

## 2026-08-14 — JWT 库从 python-jose 迁移到 PyJWT

DEC-022 — body archived verbatim → [decisions-2026-08.md](archive/decisions-2026-08.md)

---

## 2026-08-14 — 跟读（Shadowing）录音持久化（正式化既有事实）

DEC-023 — body archived verbatim → [decisions-2026-08.md](archive/decisions-2026-08.md)

---

## 2026-08-28 — 会员模型：登录墙 + Free 解锁制（D0）

DEC-024 — body archived verbatim → [decisions-2026-08.md](archive/decisions-2026-08.md)

---

## 2026-08-28 — D0b 产品瘦身：下线 AI 助手 / 评论 / UGC / 学习计划（f855613）

DEC-025 — body archived verbatim → [decisions-2026-08.md](archive/decisions-2026-08.md)

---

## 2026-08-29 — D6 提醒调度：单条每小时扫描 + 用户本地时间匹配（Phase 2）

DEC-026 — body archived verbatim → [decisions-2026-08.md](archive/decisions-2026-08.md)

---

## 2026-08-29 — D9 周报：不可变快照 + 周一 00:00 UTC beat（Phase 2）

DEC-027 — body archived verbatim → [decisions-2026-08.md](archive/decisions-2026-08.md)

---

## 2026-08-30 — D10 跟读体验增强：逐句模式 + 波形对比 + 时间线（Phase 3）

DEC-028 — body archived verbatim → [decisions-2026-08.md](archive/decisions-2026-08.md)

---

## 2026-09-08 — 翻译引擎统一为火山引擎 ARK (ark-code-latest)

DEC-029 — body archived verbatim → [decisions-2026-09.md](archive/decisions-2026-09.md)

---

## 2026-09-09 — YouTube anti-bot：POT provider + 代理中继（48 条批量上线）

DEC-030 — body archived verbatim → [decisions-2026-09.md](archive/decisions-2026-09.md)

---

## 2026-09-09 — 批量驱动与 worker 必须服务化托管（NSSM）

DEC-031 — body archived verbatim → [decisions-2026-09.md](archive/decisions-2026-09.md)

---

## 2026-09-09 — 上线验证判据：feed 排名不算、mp4 404 才算

DEC-032 — body archived verbatim → [decisions-2026-09.md](archive/decisions-2026-09.md)

---

## 2026-08-30 — D12 可访问性：浅层落地（Lighthouse 96/100，超 90 达标线）

DEC-033 — body archived verbatim → [decisions-2026-09.md](archive/decisions-2026-09.md)

---

## 2026-08-30 — §10 待拍板 4 项（用户拍板）

DEC-034 — body archived verbatim → [decisions-2026-09.md](archive/decisions-2026-09.md)

---

## 2026-08-30 — 频道升级为全量作者页 Auto-Channel（ADR-0014 修订）

DEC-035 — body archived verbatim → [decisions-2026-09.md](archive/decisions-2026-09.md)

---

## 2026-09-08 — 视频候选池 Catalog（抓取发现与逐条策展解耦）

DEC-036 — body archived verbatim → [decisions-2026-09.md](archive/decisions-2026-09.md)

---

## 2026-09-19 — 内测上线四件套（排行 / 学习闭环 / 免费开放 / 存储三态）

DEC-037 — body archived verbatim → [decisions-2026-09.md](archive/decisions-2026-09.md)

---

## 2026-09-19 — 周榜改自然周口径 + 首页卡片信息密度（简介 / 总播放 / 收藏）

DEC-038 — body archived verbatim → [decisions-2026-09.md](archive/decisions-2026-09.md)

---

## 2026-09-20 — 部署形态定稿（异地构建 + 传镜像）+ 迁移归属权收敛到 backend

DEC-039 — body archived verbatim → [decisions-2026-09.md](archive/decisions-2026-09.md)

---

## 2026-09-20 — 知识层归档机制 + stale 提醒检查

DEC-040 — body archived verbatim → [decisions-2026-09.md](archive/decisions-2026-09.md)

---

## 2026-09-20 — 首页排行块并入筛选栏排序（修订 DEC-037 呈现层）

DEC-041 — body archived verbatim → [decisions-2026-09.md](archive/decisions-2026-09.md)

---

## 2026-09-21 — LLM 视频自动分类与分级 + 分级颜色目标优先

DEC-042 — body archived verbatim → [decisions-2026-09.md](archive/decisions-2026-09.md)

---

## 2026-09-21 — 视频难度校准：习得级别 + 超纲率（修订 DEC-042 的难度兜底）

DEC-043 — body archived verbatim → [decisions-2026-09.md](archive/decisions-2026-09.md)

---

## 2026-09-21 — 点词分级渲染：`/gloss/static` + `/gloss/enrich` 两级端点

DEC-044 — body archived verbatim → [decisions-2026-09.md](archive/decisions-2026-09.md)

---

## 2026-09-21 — 榜单页改版：TopPodium + RankingRow 重写

DEC-045 — body archived verbatim → [decisions-2026-09.md](archive/decisions-2026-09.md)

---

## 2026-09-22 — 发现→频道 + 词汇本→单词训练（百词斩式两段训练流）

DEC-046 — body archived verbatim → [decisions-2026-09.md](archive/decisions-2026-09.md)

---

## 2026-09-22 — 默认头像的男女由用户自选，而不是按 id 指派

DEC-047 — body archived verbatim → [decisions-2026-09.md](archive/decisions-2026-09.md)

---

## 2026-09-22 — 默认头像改为跟随用户的性别（修订 DEC-047 的插画选择机制）

DEC-048 — body archived verbatim → [decisions-2026-09.md](archive/decisions-2026-09.md)

---

## 2026-09-25 — Catalog promote 改为幂等复用：行锁 + 记录链接 + URL 级回收

**Problem**: `promote_item` 只看 `published`。对已在流水线中的候选再点一次 promote，`seed_video` 的去重只认 `ready`/`ready_subtitles` → 第二条 official `Video` + 第二次 `process_video`（重复内容 + 白烧一次 GPU）。守卫的读与写之间也无锁，并发请求都会通过。

**Options**: A) 连 `processing` 一起拒绝（AI 审查的原始建议）；B) 行锁 + 复用记录的 `promoted_video_id`；C) B，且判据扩展为「该 `source_url` 下任何非 error 的 official Video」。

**Decision**: C。复用顺序：记录链接（非 error）→ 该 URL 的 `ready`/`ready_subtitles` → 该 URL 其他非 error 在途状态 → 才 `seed_video`；被 URL 回收时补写 `promoted_video_id`/`promoted_at`。

**Reason**: A 会封死唯一恢复路径——`CatalogStatus.error` 从不落库（读时派生），拒绝 `processing` 等于让卡住的候选永远无法重新 promote。B 不够：`seed_video` 内部的 `commit_refresh` 会在临界区内提交并**提前释放条目行锁**，之后到达的请求读到 `promoted_video_id IS NULL` 仍会再播一次；而 video 行的提交与锁释放同属一个事务、原子可见，故改为读「已提交的 `videos` 表」即关闭窗口。

**Trade-offs**:
- `mark_item` 仍是无锁读，PATCH 落在在途窗口里可能被覆盖（丢策展状态，不产生重复视频）。
- URL 级回收跳过 `validate_video_url`（首次 seed 已校验），也不改既有 video 的 `auto_publish`。

## 2026-09-25 — 行为事件的镜像副作用统一以 LearningRecord 为前提；未知 video_id 置 NULL

**Problem**: `complete` 的 `view_count + 1` 与 `completed_video` 学习事件发出都在 `if record:` 之外 → 登录用户 POST 一个 `complete` 就能给任意视频刷播放完成数并制造学习事件（进而驱动 profile 计数、连续天数、里程碑）。同时客户端 `video_id` 无校验，而 `behavior_events.video_id` 带 FK：悬空 id 在 flush 时抛 `IntegrityError` → 500，整批事件一起丢。

**Options**: A) 校验存在性，未知即 4xx；B) 校验后置 NULL，事件照记，端点保持 200。

**Decision**: B（一次批量一次 `IN` 查询），镜像副作用（`record.completed`、`progress_percentage`、`view_count`、学习事件发出）全部收进 `if record:`。

**Reason**: 行为事件是分析数据；视频下架后前端仍会 flush，若因一个悬空 id 返 4xx，客户端无法修复，丢的是同批全部无关事件。`LearningRecord` 恰是「用户首次打开该视频」时创建的，`if record:` 就是「真的看过」的现成判据，也让该分支自洽。

**Trade-offs**:
- 「发 `complete` 但从未打开视频」从此只记原始事件、无副作用；真实播放不受影响（打开即建 record）。
- `video_id` 指向「存在但已下架」的视频仍按存在处理，与 FK 的 `ondelete SET NULL` 一致。
- 重复 POST `complete` 仍重复计数——ADR 的「播放完成次数（非去重人数）」语义，靠 120/min 限流兜住。

## 2026-09-25 — 未知 ENV 值 fail-closed，保留 development 作为默认

**Problem**: `env` 只认字面 `"development"`/`"production"`，其他值（`staging`/`prod`/`test`）**同时**跳过 development 默认与生产守卫 → `jwt_secret`/`database_url` 保持空值、能用空 key 签 JWT；而默认值恰是 `"development"`，线上漏配一个变量即静默降级。

**Options**: A) 白名单 + 未知值 `RuntimeError`，保留 `development` 默认；B) A 再进一步：不设 `ENV` 直接拒绝启动。

**Decision**: A。白名单 `("development","testing","production")`，`prod` 折叠为 `production`，大小写/空白归一化后写回 `settings.env`，未知值 fail-closed；`jwt_secret`/`database_url` 守卫移出可被跳过的 `"production"` 分支。

**Reason**: 零配置启动是既有契约，而「未设置即拒绝」会把环境变量缺失从生产问题扩大成开发阻塞。**「未设置」与「设成未知值」是两件事**：前者是有意默认，后者是明确错误配置，必须 fail-closed。归一化是为了不让下游 `settings.env == "production"` 的一串判断（HSTS/CSP、JSON 日志、mock 支付路由、限流）被拼写差异绕过。

**Trade-offs**:
- 线上若**完全不设** `ENV` 仍以 development 运行（含 dev 支付签名旁路与 mock 支付路由）；缓解只能靠部署侧显式注入（`docker-compose.prod.yml`、`deploy*.sh`、CI 均已写），进程环境无法从仓库自证。

## 2026-09-25 — 首页 feed 加「收藏最多 / 本周收藏」排序（修订 DEC-041 的「刻意不同源」条款）

**Problem**: 首页排序只有 `latest`/`hot`，产品方要求把排行榜已有的「本周收藏」也搬进首页排序（设计文档 §2.2）。但 DEC-041 定 `hot` 时明确写过「feed 排序与周榜去重口径刻意不同源，周榜仍是 `/videos/rankings` 唯一职责」——`weekly_favorite` 一旦进 feed，后半句不再成立，需要重新裁决「周榜口径能否有第二个消费者」。

**Options**: A) feed 直接复用排行榜快照（零后端改动，但快照只有固定 Top-20、不与分类/难度组合、无分页）；B) feed 的 `sort` 加值、周界调用 `ranking_service.current_week_start_utc()`，缓存仍走 `browse:feed:*`；C) 在 browse 里另写一套周界与聚合，保持与周榜彻底独立。

**Decision**: B。`sort` 扩为 `latest|hot|favorite|weekly_favorite`；`favorite` 用去规范化列 `Video.favorite_count`（不 `COUNT(*)`）；`weekly_favorite` 用 `LEFT JOIN (SELECT video_id, COUNT(*) FROM user_favorites WHERE created_at >= 本周一 GROUP BY video_id)`，排序 `metric DESC NULLS LAST, created_at DESC, id DESC`。周界**只**经 `current_week_start_utc()` 取，不在 browse 重写。DEC-041 的其余部分（feed 加 `sort`、首页删 `RankingBlock`）不变；`hot` 仍是站内总播放、仍与 `weekly_views` 不同源。

**Reason**: A 回答不了「这个分类里的本周收藏是什么」——feed 是带筛选的分页列表，需要能排序的 SQL；C 会让「本周」出现第二个定义，两个页面迟早漂移，而 DEC-038 已把周界收敛成一个函数。feed 用 `LEFT JOIN` 而非排行榜的 `INNER JOIN`：feed 是浏览列表，没有本周收藏的视频必须仍能翻到，排在尾部。

**Trade-offs**:
- 同一时点两个页面的 Top-20 可能不同：feed 缓存 TTL 300s，周榜快照由 beat 每日重算（最长滞后约 24h）。口径一致、快照不一致，是「复用口径不复用缓存」的既定取舍。
- feed 缓存的 key 不含周次，跨周瞬间最多 5 分钟仍显示上周顺序（`@cached` key 结构本次不动）。
- 两个新排序以 `Video.id` 收尾做唯一 tiebreak：收藏数大量并列（多数视频为 0），没有唯一末位键时 OFFSET 分页会重复/漏行。`latest`/`hot` 保留原排序，其并列不稳定性未修。
- 不加 `user_favorites(created_at)` 索引（视频表小、全表排序可接受）；实测需要再加即为迁移。

## 2026-09-25 — 训练轮次落库 + 每日配额 + 加练（`study_sessions` / `study_session_items`）

**Problem**: 词汇训练进度只活在 React state（`drill/page.tsx` 的 `learnIndex/learned`，「再来一组」是 `window.location.reload()`），刷新或跳去视频再回来就从零开始；每日学习量硬编码在路由里（15 新 + 20 复习），用户不能调；`user_learning_profiles.today_words_learned` 列存在但词汇流程从不写事件，所以「今日已学」永远是 0。同时 S5（选择题化）需要「每词在本轮的连对计数」、S6（错误次数驱动的复习间隔）需要「累计答错次数」，这两个事实必须落库才有 SQL 可用。

**Options**: A) 进度留在客户端（localStorage / 内存），零后端改动；B) 新增两张表 `study_sessions` + `study_session_items`（每词一行），`Vocabulary` 加 `wrong_count`/`last_wrong_at`，`UserLearningProfile` 加 `daily_new_target`/`daily_review_target`；C) 只加一张 `study_sessions`，把词列表塞进 JSON 列。

**Decision**: B。配额是**全局一个设置**（不是每视频一份），范围 5~100，默认新词 10 / 复习 20，落 `UserLearningProfile`；轮次 `kind ∈ {daily, extra}`、`status ∈ {active, finished, abandoned}`，`local_date` 用用户本地日（复用学习事件那套本地日判定）；加练 = 结束当前轮后新建 `kind=extra` 轮，取词只看 `mastery_level = new` 并排除近 1 天轮次已排过的词。

**Reason**: A 回答不了本片的验收——换页回来要续上、`today_words_learned` 要真的长——而且 S6 需要能按 `wrong_count` 排序的 SQL。C 把「每词一行」压成 JSON 后，连对计数与 `wrong_in_round` 无法用 UPDATE 表达，也无法按词查询（S6 的复习优先级要 `ORDER BY wrong_count DESC`）。两张表让「反复作答是 UPDATE 而非追加」成为主键级事实（`uq_study_session_item`），存储上限是词数 × 轮数而不是作答次数。

**Trade-offs**:
- 配额在轮次创建时快照（`target_count` 落库）：改配额只影响**之后**开的轮次，不会中途改变正在做的这一轮的大小。
- 只续**今日**的未完成轮；昨天的 active 轮在下一次开轮时被标记 `abandoned`。今日训练是一天的剂量，续昨天的队会让今天的配额凭空消失。
- 保留期 30 天，在 `finish_session` 的同一事务里删该用户更早的轮次明细（先显式删 items 再删 sessions——测试跑在 SQLite 上，FK 级联不生效）。**不引入定时任务**：为一张只在用户学习时才增长的表加周期任务，活动件比问题本身多。
- 作答仍是「一次请求写 1~2 行 UPDATE」（原本每次点「认识/不认识」也各写一次库），不是新的写入模式。
- `POST /{word_id}/review` 的 SM-2 quality 由 4 统一为 5（答错仍 2），且该端点现在**没有仓内调用方**（drill 改走轮次作答），保留为兼容入口。
- 「近 1 天轮次已排过的词」这层排除只是兜底（主机制是答过的词会离开 `mastery_level = new` 池），用于作答请求失败时该词不被重复排进加练轮，顺带跨过午夜边界。
