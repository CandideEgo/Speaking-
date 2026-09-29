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
> **Archived bodies**: entry text that no longer constrains today's code moves verbatim to
> `archive/decisions-YYYY-MM.md`, and its heading stays here as a stub pointing at it. Retirement is
> triggered by status, not by a size ceiling (DEC-062). Nothing is reordered and no ID is reassigned
> — see `scripts/check-knowledge/README.md`.

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

## 2026-09-29 — 知识层体积治理：单文件上限降为目标，索引按状态收敛（修订 DEC-054/055）

**Problem**: 体积治理成了反向棘轮。DEC-054 把「每次压缩后下调该文件 limit」当作正循环的可见产出，`decisions.md` 的上限在 09-20 至 09-25 六天内走了 44032 → 36864 → 32768 → 24576 B；单文件余量被压到一句话以内（索引 +43 B、`state.md` +94 B），而承载它们的 tier 还空着 5–6 KB。上限在写入那一刻生效，最省事的应对是「写短」或「不写」，而这两种损失没有任何检查能发现。索引更无解：它必须与 append-only 的正文逐条对应，因此必然增长，已被迫抬两次上限。

**Options**: A) 维持现状、按需抬 ceiling；B) 只把单文件上限改成警告；C) 改计价口径——唯一硬门是 tier，单文件降为目标，索引只列仍生效的决策，归档由状态触发。

**Decision**: C。① `budget` 只对 tier 与两个 glob 失败，单文件超目标只打印通知；`--budget-refresh` 不再改写单文件 limit。② 索引只列仍生效的决策，退役者在末尾 `Retired N — …` 行点名，`index` 检查校验「每条正文要么有一行、要么被点名」。③ 归档触发从「撞上限」改为「不再约束今天的代码」，与年龄无关。④ 写入标准改为按行计价 + 三类准入（约束 / 指针 / 仍生效的决策），细则见 `scripts/check-knowledge/README.md`。

**Reason**: 一次会话真正付出的成本由 tier 计量，单文件字节只是它的代理量，而代理量在写入那一刻变成「把话说短」的激励；索引改成「仍生效的约束表」后随退役自然收缩，不再需要抬上限。**代价**：单文件不再有硬门，长期靠 tier 与写入标准约束；`--strict` 可把目标超限升级为失败，留给想要门的人。

## 2026-09-29 — 目录归属：顶层按「存放种类」划分，物料与知识分离（layout 检查）

**Problem**: 顶层目录是两次一次性活动（`prototypes/`、`seeword-beta-assets/`）加一个杂物抽屉（`docs/` 的 8 个子目录里只有 3 个在 `.agent/README.md` 的层表里有名字）叠出来的。知识层规定了「一个事实一个家」，却没规定「一种文件一个目录」，于是每做完一件事就在顶层留一个目录：86 个 tracked 文件（设计稿、HTML 原型、发布图）既不是知识也不是代码，其中 `docs/mockups/` 没有任何文档引用它。

**Options**: A) 只写一份目录说明，文件不动；B) 按「谁在用」归位（物料进 `docs/design/`、`docs/reports/` 并入 `docs/progress/`），并加一个检查防止顶层重新长乱；C) 顺手删掉无人引用的 `docs/mockups/` 与 `prototypes/`（git 历史仍可找回）。

**Decision**: B。① 三条原则写进 `wiki/guides/repository-layout.md`：顶层目录＝存放种类；位置由读取频率决定（沿用 DEC-055 的定价）；根目录只放工具要求必须在根的文件。② `docs/design/` 收物料（`mockups/`、`prototypes/`、`beta-launch/`），`docs/reports/` 并入 `docs/progress/`。③ 新增 `layout` 检查：「tracked 顶层条目未登记」与「登记了却已无 tracked 文件」都判失败。④ 刻意不动：部署文件留根（生产实际执行的路径）、已落地方案留 `docs/plans/`（被 ADR 与 handoff 大量引用）、`backend/` 运行时目录不改名（改名等于改应用配置与线上 volume）。

**Reason**: 目录是给人找东西用的，判据只能是「谁在用」；物料不是知识——没人靠读海报做决定，所以它不该参与知识层的链接与体积规则。检查只查顶层，因为它只能诚实判断顶层：嵌套规则写在文档里，比一个假装懂得更多的检查有用。**代价**：`docs/` 仍是 7 个子目录，子目录归属只靠文档约束；本次不删除任何文件，选项 C 留作下一步。

## 2026-09-29 — 口播原话的入库与分流：内容冻结、段落全覆盖（`inbox/` + `captures` 检查）

**Problem**: 想法以口播形式进来，一次一大坨、混着「要决策的」与「直接能做的」，而全仓没有一个地方存原话——它只活在那次会话里，出了会话不可达。于是两种损失无人发现：整理时被顺手改顺（原始措辞、口误、前后矛盾都消失），以及整条想法被漏掉而没人知道它存在过。`docs/requirements/` 存的是整理好的产品意图，`docs/plans/` 存的是已成形的方案，两者都假定「原话已被正确理解」，而这一步此前没有任何东西在看着。

**Options**: A) 原话写进 `docs/requirements/`，靠纪律不删改；B) 原话单独一层，内容用摘要封存、段落用剪切标记全覆盖，二者都进机器检查；C) 每次整理后把「我改了什么」列给你看（人审，无机器保证）。

**Decision**: B。① 顶层新增 `inbox/`（layer `input`），一个 capture 一个目录；格式契约、七个封闭处置词与检查清单见 `inbox/README.md`（本条目不复述）。② `--capture-seal` 记录**正文去掉标记与空白后的 sha256**：格式随便改，改一个字就失败，且封存后内容真的变了时命令**拒绝**重签。③ 新增第八道门 `captures`。④ `raw.md` 是全仓唯一豁免 `refs` 的文件——不可编辑的内容配不上一个它不可能通过的检查。⑤ 「先审问再开工」那类不进本仓（`docs/plans/agent技能线-落地方案-2026-09.md` §3 P4 已否决 Grill Me 式技能）：到达时是四十个想法而不是一个，审问因此降级为粗剪之后只针对 `decide`/`clarify` 段的定向追问。

**Reason**: 原话是素材不是知识：不可编辑、天生冗长、唯一用途是被引用。把「不可编辑」做成 sha256、把「不许漏」做成「每段恰有一行 + 封闭词表」，比任何「请勿改写原话」的散文约定结实——后者正是本仓反复验证会腐烂的东西。**代价**：多一层目录与一道门；封存后要修订原话必须另起一张 capture；全仓 `id#Sxx` 笔误会拦提交。

## 2026-09-29 — 技能层采用 mattpocock/skills，仓库按其 setup 初始化（不采用自建编排层）

**Problem**: 想法到落地之间缺的是连接件，不是容器。`inbox/`（DEC-064）只解决了原话存哪；`docs/agents/{issue-tracker,triage-labels,domain}.md` 三份是为**从未安装**的技能写的配置（`triage-labels.md` 自称「The skills speak in terms of…」、`issue-tracker.md` 写「`/triage` reads this flag」），全仓没有执行者；`WORKFLOW.md` §6 引用不存在的 `/verify`，§7 那张 `bug/feature/refactor/security/blocked` 与 `triage-labels.md`、与 GitHub 实际标签是三家不同词。同日的口播需求（`inbox/2026-09-29-01-口播需求管线/`）要求「想法 → 整理 → 决策/执行分流 → 分派」，当时的产出是自建编排层方案（`docs/plans/编排层-落地方案-2026-09.md`：四道缝 + frontier + 认领 + 关闭）。

**Options**: A) 按自建方案落四道缝（本地 markdown 队列 + `handoff` 门 + `/dispatch` `/accept`）；B) 装 mattpocock/skills 全套 38 个技能，走它的 `/grill-with-docs → /to-spec → /to-tickets → /implement` 主流程，仓库按 `/setup-matt-pocock-skills` 初始化；C) 两者都做。

**Decision**: B。① 装到**全局**（`~/.agents/skills` 真实文件 + `~/.claude/skills` junction，`npx skills update` 升级），**本仓不留技能副本**——避开 38 个目录进版本控制，也避开 `layout` 检查与体积预算。② 激活三份配置：`issue-tracker.md` 换成当前 GitHub 模板（补上整节 `## Wayfinding operations`：map / 子票 / 原生 `blocked_by` 依赖边 / frontier 查询 / 认领 = assignee / resolve = close）；`domain.md` 换模板并加一行本仓注记（术语表真身在 `.agent/context.md`，根 `CONTEXT.md` 只是指针）；`triage-labels.md` 与 seed 逐字一致，不动。③ GitHub 上补齐 `needs-info` / `ready-for-agent` / `ready-for-human` 与 `wayfinder:*` 五枚——`/triage` 按名字贴标签、不负责创建。④ `WORKFLOW.md` §7 标签表收敛为指针（词表的家 = `triage-labels.md`）；§6 的 `/verify` 改指 `wiki/guides/release-checklist.md`。⑤ 偏离 skill 字面规则一处：它要求「有 `CLAUDE.md` 就写它」，本仓 `CLAUDE.md` 只有三行重定向，`## Agent skills` 块留在 `AGENTS.md`。⑥ 自建方案不删，状态改为未采用。

**Reason**: 那套缺的从来不是模型（节点/边/frontier/认领/关闭），是**没人强制**；本仓的判据是「能变成检查的才进门」，而工作流本身还没跑过——先冻结一版自建约定，等于先冻结一版猜测。跑几轮才知道本仓真正该机器化的是哪条缝（最可疑的两处：`/wayfinder` 的 frontier、`/implement` 不关票）。**代价**：技能在仓外，换机器要重装（仓内的锚是 `docs/agents/*.md`）；关票是手工步骤，下游解锁靠人记得；阻塞边与 frontier **没有检查在看着**——这是最可能要回收的一处。

## 2026-09-29 — 知识层分层：冷仓单目录、热层瘦身、索引层（99 个文件一次搬迁）

**Problem**: 知识层的三个用途住在同一个平面里——每会话必读的事实、改代码前要看的约束、出事才查的历史。判据是「当初谁写的」而不是「多久读一次」，于是沉淀知识有两个家（`wiki/` 与 `docs/`），`.agent/` 同时装热事实（state/invariants）与历史档案（archive、decisions 正文）。实测：99 个知识性 markdown、约 994 KB，其中每会话真正要读的只有 65,645 B。两处后果：新知识没有稳定落点，只能靠记忆决定写哪；读的人（或 agent）要一条旧事实时没有入口——`wiki/INDEX.md` 手写二十来条、`decisions-index.md` 只覆盖决策，其余六十多个文件只存在于文件系统里，等于靠 grep 考古。

**Options**: A) 保持现状，只写一份「哪层放什么」的说明；B) 物理合并——所有记录过去的知识搬进一个冷仓目录 `knowledge/`，热层只留每会话必读的几份，冷仓入口加一层机器可检的索引；C) 只把「每会话读」的几份收进热层，其余不动。

**Decision**: B。① 冷仓 = `knowledge/` 一棵树装全部历史：`wiki/`（architecture / problems / guides）、`adr/`、`plans/`、`progress/`、`requirements/`、`operations/`、`archive/`、`inbox/`、`decisions.md` + `decisions-index.md`、`system-map.md`、`CHANGELOG.md`。② 热层 = `AGENTS.md`、`CONTEXT.md`、`.agent/`（README 分层标准 / state / invariants / owners / handoffs 在飞票）；`.agent/context.md` 的内容升为根 `CONTEXT.md`（术语表真身，与 domain-docs 约定同址，指针层取消），`system-map.md` 退冷（改代码前才读）。③ 准入标准取代收录习惯：热层三条全中才留（每会话都读 / 现在为真 / 影响下一步动作），凡过去时一律退冷。④ `knowledge/INDEX.md` 是唯一入口，一个文件一行；两个方向都由机器检查——每个文件恰好一行、每行路径都存在。⑤ **搬，不删**：文件内容一个字节不改地搬；`docs/design/`（物料：海报、原型、发布图）与 `docs/agents/`（技能按固定路径读的配置）刻意留在原地，于是 `docs/` 的语义收敛为「工具按固定路径找的文件 + 物料」。⑥ 全仓 521 处路径引用按前缀重写；`.agent/archive/`、`inbox/*/raw.md`、`docs/design/` 与本次方案文件不参与重写（冻结记录 / 封存原话 / 物料 / 设计记录本身要写旧路径），`CHANGELOG.md` 与 `decisions*.md` 只改链接目标、不改正文——搬迁对历史条目只做了路径字符串的字面替换，顺序、日期、标题、语义一字未动。⑦ 新增 `scripts/check-knowledge/paths.json`：检查器读的所有位置集中在一份配置，且**配置里的路径不存在即失败**。

**Reason**: 判据只有一条站得住：读它的频率。按「谁写的」划分，沉淀知识永远有两个家；按频率划分，每个事实只有一个落点。而「需要的时候再查」不是态度，它要入口——没有索引的冷仓等于遗忘，所以索引的双向一致性必须是机器检查而不是纪律。**代价**：一次全仓大搬迁；`paths.json` 成为新的单点（忘了维护它门会变红，这是故意的方向，因为改名的旧行为是让门**静默失效**）；`knowledge/` 与 `scripts/check-knowledge/` 同词不同义，读路径时要看清前缀。

## 2026-09-29 — 取消知识层的字节上限与目标，改为一套分层标准（修订 DEC-062）

**Problem**: 体积治理成了反向棘轮。DEC-054/055 把「压缩后下调该文件上限」当作正循环的可见产出，`decisions.md` 的上限在六天内走了 44032 → 36864 → 32768 → 24576 B，单文件余量压到一句话以内（索引 +43 B、state.md +94 B），而承载它们的 tier 还空着 5–6 KB。DEC-062 把单文件上限降为「目标」并加了一句 `[target] … shrink or move at the next maintain round`——目标在写入那一刻照样生效，最省事的应对仍然是「把话说短」或「干脆不写」，而这两种损失没有任何检查看得见。用户的判据更直接：不该设上限，该定标准。

**Options**: A) 保留目标通知，只改文案；B) 保留 tier 作为唯一的硬门，其余降为报告；C) 彻底取消字节判定——机器只报数，判据改成「这条事实放对层了吗」。

**Decision**: C。① 删除 `scripts/check-knowledge/knowledge-budget.json`、`budget` 门、`--budget-refresh` 与 `--budget-report`，新增只报不判的 `--size-report`（热层逐文件、冷仓逐子目录加文件数与总数）。② 归档触发不再是「撞上限」，而是「这条决策不再约束今天的代码」，与字节、与年龄都无关。③ 写入标准落在 `.agent/README.md`：热层三问（每会话都读 / 现在为真 / 影响下一步动作）、冷仓索引契约、一条事实一个家、事实过期是「搬」不是「删」。④ 判据转移后冷仓能不能用只取决于索引，于是 `index` 门的双向检查成为新的承重项。⑤ `--strict` 仍在，但它现在只把 `stale` 提醒升级为失败。

**Reason**: 上限管的是「一句话写多长」，标准管的是「一条事实放哪」。前者可以靠删字作弊且无人发现，后者的作弊（漏登记、死链）会被索引检查抓住。体积仍然印出来——它是仪表，不是门：仪表让人看见趋势，门只会让人把话说短。**代价**：知识层不再有任何自动的体积刹车，长期只靠分层标准约束；真需要门的那天，加之前先证明它拦下的是错误而不是长句子。
