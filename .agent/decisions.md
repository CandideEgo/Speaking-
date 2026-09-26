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

DEC-049 — body archived verbatim → [decisions-2026-09.md](archive/decisions-2026-09.md)


## 2026-09-25 — 行为事件的镜像副作用统一以 LearningRecord 为前提；未知 video_id 置 NULL

DEC-050 — body archived verbatim → [decisions-2026-09.md](archive/decisions-2026-09.md)


## 2026-09-25 — 未知 ENV 值 fail-closed，保留 development 作为默认

DEC-051 — body archived verbatim → [decisions-2026-09.md](archive/decisions-2026-09.md)


## 2026-09-25 — 首页 feed 加「收藏最多 / 本周收藏」排序（修订 DEC-041 的「刻意不同源」条款）

DEC-052 — body archived verbatim → [decisions-2026-09.md](archive/decisions-2026-09.md)


## 2026-09-25 — 训练轮次落库 + 每日配额 + 加练（`study_sessions` / `study_session_items`）

DEC-053 — body archived verbatim → [decisions-2026-09.md](archive/decisions-2026-09.md)


## 2026-09-27 — 知识层写入密度与余量阶梯（DEC-040 的运行细则）

**Problem**: 必读层全部逼近上限（invariants 100%、system-map 99.8%、context 99.7%、state 98.4%，tier `before_code_change` 仅剩 12B），而「记什么、记多细、到顶怎么办」此前全靠临场判断——要么停写（写入时就丢信息），要么反射式 `--budget-refresh`（DEC-040 警告过：上限因此失效）。

**Decision**: 标准落 `scripts/check-knowledge/README.md`（§ Write density and the growth ladder），三条硬规则：
1. **密度**：准入仍是 AGENTS.md 三问；各文件只收自己一类事实（state 只记在途、decisions 一条 ≤1.5KB、wiki/problems 只收复发性陷阱）；详细程度 = 最小完整信息（定位 + 为什么 + 何时可疑）。
2. **余量**：常青文件 ceiling = 大小 + 10%，到顶只收不放；追加型（decisions/index）= 大小 + 2~3 条，到顶走归档轮；wiki 单页 8KB 到顶拆页；tier `session_total` 只降不升。
3. **阶梯**：绿 <85% 正常写；黄 85–95% 写前自审 + maintain 时修剪；红 >95% 按序 收缩/迁移 → 归档轮 → `--budget-refresh`（仅新主题域等结构性增长，理由写进提交信息）。收缩一律是移动不是删除（archive/ 冻结、CHANGELOG 承接、wiki 过期标 deprecated）——防丢信息靠冷层，不靠扩容。

**Reason**: 阶梯把「临界要不要扩」从判断题变成程序题：扩容合法当且仅当前两步被证明不可行。余量按文件生命周期定（编辑型文件余量小、追加型靠归档阀），比统一百分比更贴合实际增长方式。

**Tooling**: `check_knowledge.py --budget-report` 打印全部 ceiling 用量与分区，是黄红区的监测入口；每轮 `/knowledge-maintain` 跑一次。

## 2026-09-27 — 知识层双层定价与正向循环（细化 DEC-054）

**Problem**: DEC-054 定了密度与阶梯，但四点仍模糊：详略没有统一判据；必读与沉淀只是隐含在 tier 里没有明说；收缩时质量会不会掉没有底线；系统如何持续变好（而不只是停止增长）没有机制。

**Decision**: ① **双层定价**：必读热层 = `tier:session_total` 五文件，每字节每会话付费；其余皆沉淀层，按需读取。**详略由读取频率决定**——同一事实热层只留压缩形 + 指针，展开形写 wiki/；热层一条事实超过两行就是「去 wiki 写展开形」的信号，而不是把热文件写长。② **正向循环**：每轮 maintain/verify 按 观察（`--budget-report` + stale）→ 修复（阶梯 + verify 级修订）→ 棘轮（收缩成功后手动下调该文件 limit 并记 `_history`）→ 目标（`_targets`，红区计数→0、session_total→32768B）运转；只升不降的 ceiling 说明循环没在转。③ **质量底线恒定**：收缩是 verify 级编辑——离开热层的事实必须先落冷层，警告与陷阱随事实一起走，留下的必须仍是「为什么」而非「是什么」。④ `--budget-report` 标注 `[S]`/`[B]` 热层归属，双层在监控输出里可见。

**Reason**: 读取频率是同时解释「为什么要预算」和「为什么要详略」的唯一变量，用它统一定价消除两套标准并存；棘轮把「不断优化」变成可观察的量（limit 单调下降、红区收敛），循环靠机制不靠自觉。
