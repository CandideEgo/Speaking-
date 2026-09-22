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

**Problem**: ① 入库管线从不写 `topic_tags` → 首页/发现页卡片分类 chip 全部兜底显示「综合」；② `difficulty_level` 无 DB 约束，历史脏值（如 "CR"）被 DifficultyBadge 原样透出；③ 分类枚举前后端两份硬编码已漂移（前端 `usePlatformFeed` 缺 speech）；④ 分级高亮颜色取词的最高级（多分级词一律雅思红），与用户所选目标分级无关，选择「四级」时满屏红色造成误判。另：iPhone 观看页 `<video>` 缺 `playsinline` 被 iOS Safari 强制系统全屏，字幕不可见（本次一并修复，纯属性级改动）。

**Options**: 分类方案 A) 规则/关键词匹配 B) LLM 分类（复用现有 ai_service 基建）C) 纯人工打标；写库策略 A) LLM 结果覆盖写 B) topic 覆盖 / difficulty 仅补 NULL；难度兜底 A) LLM 覆盖词级算法 B) LLM 优先、字幕词级算法补 NULL；枚举来源 A) 前后端各维护 B) 收敛单一来源。

**Decision**:
1. **LLM 分类**：新增 `services/video_classification.py`。输入 = 标题 + 描述（`external_meta`）+ 字幕抽样（前 40 条 / 3000 字符截断）；`AIService` 新增公开 `chat_json(system, user)`（JSON mode + fence 剥离 + 对象校验），替代跨服务调用私有 `_chat`。输出校验：topics 白名单（canonical id、小写归一、去重、≤3、主标签在前）、difficulty CEFR 正则（`^[ABC][12]$`，不确定给 null）；全无效抛 `VideoClassificationError`。
2. **写库规则**：`topic_tags` 覆盖写；`difficulty_level` **仅 NULL 时写**（与 `difficulty_service.compute_video_difficulty` 同契约，永不覆盖人工值与词级算法值）。
3. **接入点**：`finalize_video` 新增 `classifying` 步骤（prewarm_notes 旁，进入下载/转码前），Redis steps 集合幂等，`topic_tags` 已存在即跳过；失败 best-effort 不阻断发布。存量数据用 `scripts/backfill_classification.py` 回填（`--dry-run` / `--limit` / `--video-id`），顺带把非法 difficulty 脏值置 NULL 并按「LLM 优先、字幕词级兜底」重填。
4. **枚举收敛**：`TOPIC_CATEGORIES` 归入 `video_classification.py` 作单一来源，`api/v1/browse.py` 导入复用；前端新增 `lib/topicCategories.ts`（id→中文标签），`usePlatformFeed` 补 speech 并改从中派生 tab 列表，`VideoCard` chip 经 `topicLabel` 映射（旧中文自由标签原样透传）；`DifficultyBadge` 对非 A1–C2 值不再渲染。
5. **分级颜色目标优先**：`displayLevel` / `wordHighlightClass`（及后端镜像 `core/exam_levels.display_level`）增加可选 `targetLevel` 参数——词属于所选分级 → 用该分级颜色（选四级 → 蓝色）；否则回退最高级。watch 页 `levelClassFor` 传入 `selectedExamLevel`；`should_display` 高亮范围不变；不传参的调用点（编辑器、词浮层）维持旧语义。

**Reason**: LLM 对标题/描述/字幕语境的理解远优于关键词规则，且 AI 网关/超时/失败归一基建现成；「topic 覆盖 / difficulty 仅 NULL」在保护人工与确定性算法的前提下让步骤幂等、可安全重跑。颜色目标优先符合备考心智（「我在备四级，看到的是四级蓝」），回退最高级保留了「超出目标的词仍高亮」的既有语义。

**Trade-offs**:
- LLM 分类失败时 `topic_tags` 留空，卡片回到「综合」兜底（= 现状），可经回填脚本重试；管线在 AI 故障期间照常发布。
- 新视频难度由 LLM 先填（管线中 classifying 先于 compute_video_difficulty），用内容语境换词表统计的确定性——偏差靠白名单正则与「仅 NULL」约束住。
- `topic_tags` 改存 canonical id 后，存量 admin 中文自由标签不回迁（browse 筛选 ILIKE 行为不变，卡片原样显示）。
- 每视频 1 次 LLM 调用（temperature 0.3），成本可忽略；回填需先 `--dry-run` 人工抽查质量再正式执行。

## 2026-09-21 — 视频难度校准：习得级别 + 超纲率（修订 DEC-042 的难度兜底）

**Problem**: DEC-042 上线后回填 49 支视频，发现 `difficulty_level` 全部为 C2，评级字段没有区分度。诊断：`difficulty_service` 取每个词的**最高**考试级别（`max(level_order)`）再算 p75，而雅思/托福在 `exam_levels` 里 order=6、词表又极大——"词出现在雅思表里" 几乎等价于 "这是常用词"。实测 5 支视频 p75 恒为 6，而阈值表上限是 5.5→C1，故一律落到 C2（`p75` 与 LLM 标签的 Spearman 仅 **+0.076**，等于无信号）。同时 LLM 在 `classifying` 步骤给出的 CEFR 估计（A1–C1 分布）因 "difficulty 仅 NULL 时写" 契约无法落库，所以字段仍是坏值。

**Options**: ① 只调阈值（扩大 p75 映射表）② 让 LLM 接管 `difficulty_level`（`--force-difficulty` 覆盖写）③ 换统计量重做词级算法。统计量候选：max-order 的 p75/p90/均值、min-order 的均值/分位、超纲词占比、覆盖度法（coverage≥T）。

**Decision**:
1. **改用"习得级别"**：每个词取**最低**考试级别（`min(level_order)`）作为习得级别——一个词同时在中考与雅思表里，学习者是在中考阶段认识它的，最低列表才是它真正的难度落点。这是本次失效的根因修复。
2. **统计量改为"超纲率"**：`超纲率 = 习得级别 > 中考(order 1) 的词出现次数 / 有考试标注的词出现次数`。按**出现次数**加权（一个词在 N 句里出现算 N 次，沿用原实现的遍历语义），衡量的是"学习者实际读到的文本里有多少超出初中词表"，而非类型多样性。单词不在任何词表内则不参与统计。
3. **阈值**：`<0.17 → A1`、`<0.26 → A2`、`<0.30 → B1`、`<0.47 → B2`、`<0.55 → C1`、`≥0.55 → C2`。
4. **最小样本量**从 3 提到 **30** 次标注出现（比率在更少的样本上就是噪声）；不足返回 None（卡片不显示难度徽章）。
5. **重算路径**：`scripts/backfill_difficulty.py` 新增 `--recompute`（重跑所有视频，含已有值）。脚本无法区分"算法写入"与"人工编辑"，故 `--recompute` 两者都会覆盖——先 `--dry-run` 看 before → after 再执行。
6. **不改** DEC-042 的写库优先级：管线里 `classifying`（LLM）仍先填 difficulty，词级算法仍是兜底。

**Reason**: 阈值不是拍的，是用 DEC-042 回填时 LLM 给出的 49 条 CEFR 标签做参考集、对 8 个候选统计量各做一遍"最优单调阈值分割"（DP）选出来的：超纲率 MAE **0.245 档**、**75% 精确命中**、**100% 落在一档之内**，第二名（min-order 均值）MAE 0.408。选中的 5 个切点都落在数据的真实空隙里（0.298 B1 / 0.304 B2；0.260 A2 / 0.261 B1；0.138 A1 / 0.205 B1），不是刀尖上的拟合。选超纲率而非纯 min-order 均值，是因为它可解释——"这支视频有多少词超出初中词表"是一句人话，而且 0.14–0.50 的实际跨度足够分档。

**Trade-offs**:
- 参考集是 LLM 标签而非人工标注，且只有 49 条；B1/B2 的界线部分取决于 LLM 自身的判断（它的 B2 也占 21/49）。但 100% 落在一档之内，说明排序是对的，只是档位细粒度受参考集精度限制。
- 新分布仍是 B2 偏多（B2 30 / B1 8 / A2 6 / C1 4 / A1 1）：原生英语语料本来就集中在 B1–B2，这是事实而非缺陷——关键是字段现在能分出 5 档，而不是全部 C2。
- 超纲率依赖 ECDICT 的考试标注质量；标注错误的词会同时影响超纲率与分级高亮。
- 阈值随词表版本漂移：ECDICT 更新后应重跑校准（参考集可从回填日志重建）。

---

## 2026-09-21 — 点词分级渲染：`/gloss/static` + `/gloss/enrich` 两级端点

**Problem**: 点词词卡此前要等最多 4 次串行 DB 往返（真题例句、高频徽标、视频层/全局 × lemma/surface 的笔记查询）才渲染任何内容——ECDICT 释义本在内存里，却排在慢查询之后；`get_best_note` 逐个候选 SELECT，考试词最坏 6 次往返。
**Options**: A) 保持单端点 `/gloss`，只优化 SQL；B) 拆两级——`/gloss/static` 只读 ECDICT（零 DB 往返），`/gloss/enrich` 承担全部 DB 查询；C) 前端骨架屏 + 单次请求。
**Decision**: B。`static` 返回词头/音标/词形/释义/分级；`enrich` 返回真题例句/高频徽标/AI 笔记，`lemma` 由第一级传入（已归一，不重复算）。前端 `useWordLookup` 顺序两次请求，`mergeEnrich` 只覆盖 enrich 拥有的字段，`lastClickedRef` 丢弃过期响应，`enrich` 失败静默（基础释义已展示）。同时 `get_best_note` 把四候选合并为单次 `or_` 查询，按 video:lemma → video:surface → global:lemma → global:surface 取最优（考试词 DB 往返 6→3、非考试词 4→1）。
**Reason**: 延迟来自 DB 而非 ECDICT；拆级让基础词卡不依赖任何 DB 健康度，第二级失败只丢增强内容——沿用 INV-007「词卡无实时 LLM 兜底」的既有契约。
**Trade-offs**: 两级共用 `WordGloss` 响应模型，字段归属只能靠约定：`mergeEnrich` 是唯一执行点，新增词卡字段必须同时决定层级并加进 `mergeEnrich`，否则静默不显示（设计细节见 `wiki/architecture/exam-vocabulary.md`）；点词请求数 1→2（多一次 HTTP 换首屏时间）；旧 `/gloss` 端点保留但前端已无调用方（仅测试覆盖），属休眠端点，勿再扩展。

---

## 2026-09-21 — 榜单页改版：TopPodium + RankingRow 重写

**Problem**: `/rankings` 页是一张平铺表格——前三名与第 50 名视觉等价，「谁在前面」这个榜单唯一的信号被抹平；三个 scope（latest / weekly_views / weekly_favorites）的右侧指标各自硬编码文案；缩略图无时长、无播放反馈。
**Options**: A) 保持平铺列表只调样式；B) 前三名独立「领奖台」（`TopPodium`：`#1` 横贯大卡 + `#2/#3` 半行并列），第 4 名起用重写的 `RankingRow`；C) 整页卡片网格。
**Decision**: B。`TopPodium` 的 `#1` 走 featured 布局（大缩略图 + `text-2xl/3xl` 指标 + 品牌色描边），`#2/#3` 半行横卡；每卡带 `No.N` 眉标与巨型背景名次水印（`aria-hidden`，纯排版）。`RankingRow` 把名次角标换成大号数字、缩略图换 `VideoThumbnail`（带时长 + hover 播放按钮）、右侧加微标签与比例条（以头名指标为 100%，最小 4%）；指标文案收敛为 `RANKING_METRIC_LABELS: Record<RankingScope, string>` 单一来源，`mode = latest ? "time" : "metric"`。
**Reason**: 榜单的价值是名次差一等要看得出来，而第 4 名之后仍要能快速扫读长尾——领奖台负责前者，列表负责后者；指标文案集中到一个 Record，新增 scope 时不会只改其中一处。
**Trade-offs**: 前三名与其余行是两套渲染路径（`TopPodium` / `RankingRow`），视觉一致性靠共享的 `rankClass` 配色约定维持，新增 scope 要同时改两处；`RankingRow` 的 props 增加 `metricLabel` / `maxMetric`，`maxMetric` 由页面按头名指标传入（比例条是相对榜首而非绝对量）；水印与 hover 播放按钮是装饰，不承载信息。

---

## 2026-09-22 — 发现→频道 + 词汇本→单词训练（百词斩式两段训练流）

**Problem**: 产品导航语义漂移：「发现/浏览」tab 实际承载频道聚合（ChannelStrip 已在顶部），播放页却只有 meta 行一处不起眼的频道名文字链；「词汇本」页是管理视角（集合+单词表格），与「来背单词」的用户心智不符，且无任何每日目标感。
**Options**: A) 只改 tab 文案不动页面；B) 频道：tab 改名「频道」+ 落地页面包屑统一 + 播放页新增频道入口卡（后端 detail 补 `channel_cover_url`）；词汇：「词汇本」改名「单词训练」，`/vocabulary` 改今日 Hero + 词库二级视图，drill 改两段式（新词闪卡 → 到期测验 → 总结）；C) 另起独立背单词路由，不动现有 /vocabulary。
**Decision**: B。新增 `GET /vocabulary/daily-session` 聚合今日队列（new=从未复习按 created_at 升序；due=非 new/mastered 到期按 next_review_at 升序，nulls_first；附 totals）。`/vocabulary` = 今日（Hero：词库掌握环 + 待学/待复习计数 + CTA）/ 词库（集合+全部单词原样迁入）；`/vocabulary/drill` = 阶段机 learn→review→summary：闪卡逐词 `POST /{id}/review`（认识=4/不认识=2），测验段复用 `useVocabularyPractice(due_only)` + `UnifiedPracticePanel`，allGraded 自动 submit 后进总结（Confetti ≥80%、薄弱词列表）；`?video_id=` 深链保持纯测验。播放页频道卡 `ChannelEntry` 挂在播放器正下方，仅 `channel_slug` 存在时渲染。
**Reason**: 命名跟心智走——tab 叫什么，落地页就必须是什么；闪卡先行是因为新词直接进选择题测验没有「首次接触」环节（百词斩的核心循环：先看词自评，再测验）；闪卡作答直接写 SM-2（review 端点现成），测验段零后端改动。
**Trade-offs**: 两个「待复习」数字故意不同：`totals.due_total`（Hero 展示）不含 new 词，`stats.due_count`（徽标红点）折叠 new 词——展示口径对齐复习队列，徽标保持存量语义；`?video_id=` 与两段式共存于 drill 一个路由，靠 videoId 分流；无打卡/连续天数（`UserLearningProfile.today_*` dormant，未造新字段）；闪卡无图片词卡（无图片来源，用语境句替代）。

---

## 2026-09-22 — 默认头像的男女由用户自选，而不是按 id 指派
**Problem**: 默认头像按 `hashSeed(用户 id) % 2` 指派男/女线描插画。`User` 没有性别字段，这个指派与用户本身完全无关：约一半用户被**永久**分配异性插画，且除上传真实头像外没有任何纠正途径——而「不必上传头像」正是默认头像存在的理由。同一版实现还带三处缺陷：加载失败标记是布尔量且不随 `src` 重置（头像 404 后再上传新图仍显示默认图）；插画底色是近白奶油色（实测 `rgb(254,249,230)`，95% 像素亮于 200），落在 `.dark` 的 `#0a0a0a` 画布上是刺眼白盘；`default-avatar-*.png` 实为 1024×1024 JPEG 且 `next/image` 走自定义 loader 不做优化，每页下发约 210KB。

**Options**: A) 改中性插画（无性别信号，但需新美术产出，且与「保留男女插画」的意图相反）；B) 加 `gender` 字段让插画跟随用户的性别；C) 存「用户选中的内置头像」`avatar_preset`，未选择时哈希兜底；D) 取消内置插画，只允许上传（退回首字母/渐变）。

**Decision**: C。新增 `users.avatar_preset`（`"male"` / `"female"`，可空，迁移 `j5k6l7m8n9o0`），`PATCH /users/me` 以 `Literal["male","female"]` 校验；个人资料页「头像」卡片新增「默认头像」二选一（`aria-pressed`），保存即 PATCH。解析优先级：上传的 `avatar_url` > `avatar_preset` > `hashSeed` 兜底，`defaultAvatarUrl(seed, preset)` 是唯一执行点；上传不清除 preset（`avatar_preset` 是「照片没了之后剩什么」）。同批修掉三处缺陷：失败标记改为按 URL 记账、默认插画加 `dark:invert`、资源重编码为 160×160 无损 WebP（约 21KB）。

**Reason**: 插画需要的是「哪一张」，不是「用户是什么性别」。存选择就够，且不必为挑一张卡通图索取性别——该字段一旦存在，就会被未来某个功能当成「用户属性」读走。存选择还让选择权真正归用户：男用户可选女插画、反之亦然，这正是「加男女区分」要的效果，而不是让系统替他断言。保留哈希兜底是为了不让「尚未选择」表现为一个空圈（存量账号行为不变）：代价是这批用户暂时看到一张可能不合心意的临时插画，但资料页就在两屏之内，纠正路径是**显式且持久**的——问题从「永久且不可改」降级为「有默认值、可改」。

**Trade-offs**:
- 未选择的用户仍是「哈希临时指派」。要彻底消除需在首次进入资料页时强制选择，未采纳：给一个低频偏好加阻断式流程不划算。
- 默认头像与用户真实性别可以不一致（设计如此，不是 bug）。
- `avatar_preset` 只有应用层校验（`String(10)` + Pydantic `Literal`），无 DB 级约束——与 `level` / `plan_source` 同形态；新增取值需同步三处：后端 `Literal`、前端 `User.avatar_preset`、`AVATAR_PRESETS`。
- 内置插画只有两张且是位图：`dark:invert`（仅对默认插画生效，用户上传图不动）是务实解，不是语义 token 解；若要设计师级效果，应出暗色专用插画，届时可去掉 invert。

---

## 2026-09-22 — 默认头像改为跟随用户的性别（修订 DEC-047 的插画选择机制）
**Problem**: DEC-047 为了「不索取性别」而存「用户选中的内置插画」（`users.avatar_preset`），并在资料页给了一组「默认头像」二选一。产品方判定这是过度设计：默认头像只是一张占位图，用户随时可以用上传的真实头像取代它，为它单独造一个「选插画」的概念、多一个字段、多一组 UI，收益不抵成本；`avatar_preset` 也不承载任何关于用户的事实，只能服务头像模块本身。

**Options**: A) 维持 DEC-047（`avatar_preset` 选插画）；B) 加 `users.gender`，默认插画跟随性别，删掉插画选择器；C) 回到按 id 哈希指派（可纠正途径只剩上传）。

**Decision**: B。迁移 `j5k6l7m8n9o0` 改写为新增 `users.gender`（`"male"` / `"female"`，可空，无 server_default），`PATCH /users/me` 以 `Literal["male","female"]` 校验；资料页「头像」卡片下的「默认头像」二选一换成「性别」二选一（`aria-pressed`，点击即 PATCH）。解析优先级不变：上传的 `avatar_url` > `gender` > `hashSeed` 兜底，`defaultAvatarUrl(seed, gender)` 仍是唯一执行点；上传不清除 `gender`。前端命名同步：`AvatarPreset` → `AvatarGender`、`AVATAR_PRESETS` → `AVATAR_GENDERS`、`Avatar` 的 `preset` prop → `gender`。

**Reason**: 性别是用户自己的属性，填一次就能被未来任何需要它的地方复用，而 `avatar_preset` 只服务一张占位图——把字段挂在「用户是什么」而不是「系统展示了什么」上，是这两个方案唯一的实质差别。性别是资料里的一格、随时可改，所以 DEC-047 要解决的「约一半用户被永久分配异性插画且无纠正途径」依然被解决，只是纠正入口从「选插画」变成「填性别」。DEC-047 的三处缺陷修复（失败标记按 URL 记账、默认插画 `dark:invert`、资源 210KB → 21KB WebP）与本次机制无关，继续有效。

**Trade-offs**:
- 未填性别的用户仍是「哈希临时指派」，且要纠正它必须先填性别——资料页的提示文案因此分三支（已上传 / 已填性别 / 都没填），逐支说实话。
- 用户不填性别、只想换一张插画时，没有比「填性别」更直接的入口（产品方明确不要这个入口）。
- `gender` 与 `avatar_preset` 一样只有应用层校验（`String(10)` + Pydantic `Literal`），无 DB 级约束——与 `level` / `plan_source` 同形态；新增取值需同步三处：后端 `Literal`、前端 `User.gender`、`AVATAR_GENDERS`。
- `gender` 从此是一个真实的用户属性，会被未来功能读到——这是选择它的理由，也是它比 `avatar_preset` 更需审慎的地方。
