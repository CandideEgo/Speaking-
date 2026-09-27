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

DEC-054 — body archived verbatim → [decisions-2026-09.md](archive/decisions-2026-09.md)

## 2026-09-27 — 知识层双层定价与正向循环（细化 DEC-054）

DEC-055 — body archived verbatim → [decisions-2026-09.md](archive/decisions-2026-09.md)

## 2026-09-27 — 训练流程选择题化：废弃「认识/不认识」，连对两次毕业 + 题型轮换

DEC-056 — body archived verbatim → [decisions-2026-09.md](archive/decisions-2026-09.md)

## 2026-09-27 — 复习调度替换 SM-2：错误次数分档直接决定间隔

**Problem**: SM-2 由「记住质量评分」驱动（interval = 1/6/interval × ease_factor），而本产品作答是客观对错（随 DEC-056 选择题化），不存在 quality 评分输入；ease_factor 的隐式状态机对用户不可解释，也没有「昨天错得多的词今天优先」的机制。

**Decision**: ① `interval_days` / `next_review_at` 按错误次数分档直接计算：本轮内答错过→次日；本轮内一次没错→3 天；复习时答错→回次日且 `wrong_count += 1`；此后全对且 `wrong_count = 0` 走 3→7→16→35 天，全对但 `wrong_count ≥ 1` 走 2→5→12→25 天，`wrong_count ≥ 3` 间隔上限压到 7 天。② 保留 SM-2 全部列，`ease_factor` 不再参与计算（留作兼容/显示）。③ 复习队列排序改为：昨天错过的优先 → `wrong_count` 降序 → 到期时间升序。④ review 端点补写 `wrong_count` / `last_wrong_at`。

**Reason**: 错误次数是产品已有的客观信号，直接映射间隔消除 ease_factor 隐式状态；分档表可被表驱动测试逐条验证（演化公式做不到等价验证）；「昨天错得最多最先出现」把复习预算优先花在最脆弱的记忆上。

## 2026-09-27 — 支付验签默认 fail-closed，dev 旁路须显式 opt-out（审计 H12）

**Problem**: `payment_verify_signature` 与 `env` 的默认值（False / development）叠加时，支付回调签名验证被整体旁路；「开支付 + 忘配 ENV + 忘配验签」三个默认值里有两个不安全，安全态势依赖配置纪律而不是默认安全。

**Decision**: `payment_verify_signature` 默认翻为 `True`。development 联调要跳过验签必须显式 `PAYMENT_VERIFY_SIGNATURE=false`（既有 warning 日志保留）；production 分支本就不读该 flag、一律强制验签。`.env.example` 补注释说明口径。

**Reason**: 旁路是「多条件与」结构，把其中唯一一个可独立安全化的条件从默认 False 翻为默认 True，使剩余旁路前提（env=development 且显式 opt-out）必然是有人有意为之；配置安全的通用原则是「安全能力默认开，关闭必须留痕」。ICP 解封前 `payments_enabled=False` 使该变更对现状零影响，正是改默认值的无痛窗口。

## 2026-09-28 — 搜索改用内联 tsvector，不建 `search_vector` 列

**Problem**: `GET /api/v1/videos/search` 500——`services/search_service.py` 引用的 `Video.search_vector` 列从未存在：ORM 模型、Alembic 迁移、开发库三处都没有，模块 docstring 却声称它由 PostgreSQL 触发器维护。一条 `curl` 即可复现。

**Options**: A) 补列 + 触发器 + 回填/维护任务；B) PostgreSQL 上按查询内联构造 tsvector，其他方言（SQLite 测试）退化为纯 ILIKE。

**Decision**: B。同时删除 `rebuild_video_search_vector()` 与那条不实的 docstring。

**Reason**: 物化路径要新造迁移、触发器与维护机具（本仓库从未有过），当前数据量下没有收益。**代价**：FTS 表达式没有 GIN 索引可用，只能顺序扫描。

## 2026-09-28 — 通知 WebSocket 的 JWT 改走子协议，删除 `?token=`

**Problem**: 通知 WebSocket 用 `?token=<JWT>` 传凭证，查询串会落进 uvicorn 与反向代理的访问日志——长期令牌因此被写进日志。

**Decision**: 凭证改走 `Sec-WebSocket-Protocol: bearer, <JWT>`；服务端只回显通用的 `bearer` 标记（RFC 6455），token 缺失或无效时以策略违规码 1008 关闭；保留 auth cookie 回退，`?token=` 路径删除。

**Reason**: 凭证不进 URL 就不会进日志，而浏览器的 WebSocket 构造函数不允许自定义请求头，子协议是握手期唯一能携带凭证的位置。**代价**：前后端必须同时上线，旧 `?token=` 调用方直接断连。

## 2026-09-28 — 生产必须显式配置 `REDIS_URL`（fail-fast）

**Problem**: `redis_url` 带有可用的 localhost 默认值，于是生产守卫 `if not self.redis_url` 永远不会成立——生产漏配 `REDIS_URL` 时会静默用本机 Redis 做限流存储与 Celery broker。

**Decision**: 生产守卫改为同时要求该字段被显式提供（`"redis_url" not in self.model_fields_set` 即拒绝启动）；`docs/operations/PRODUCTION.md` 的生产环境模板本就把 `REDIS_URL` 列为必填。

**Reason**: 有默认值的安全相关配置项，只有「是否被显式提供」能区分有意与遗漏。**代价**：漏配的生产环境改为拒绝启动（有意为之）。
