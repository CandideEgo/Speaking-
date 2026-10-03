# Decision Index

> IDs are issued in file order (append order; dates repeat), never reassigned; an archived body keeps
> its heading as a stub in `decisions.md`. To add one: append the entry to `decisions.md`, then a row
> with the next free ID.
> Since DEC-062 this table lists only the decisions that still govern the code. A decision that stopped
> applying — `superseded`, or never implemented — loses its row and is named on the `Retired` line at
> the bottom instead, where its body and stub stay on the record.
> The `index` check holds the two together: every entry in `decisions.md` is either a row here or named
> as retired, rows ascend by ID, and each row's date and title match its entry.

| ID | Date | Title | ADR | Status |
|----|------|-------|-----|--------|
| DEC-001 | 2026-07-03 | Product positioning: video vocabulary + community UGC | ADR-0001, ADR-0002 | active |
| DEC-002 | 2026-07-03 | Recording changed to playback-only | ADR-0002 | active |
| DEC-004 | 2026-07-03 | Unified frontend component library | ADR-0005 | active |
| DEC-006 | 2026-07-03 | Redemption code 4-state machine | ADR-0007 | active; user-facing channel retired in 内测期, tables dormant |
| DEC-007 | 2026-07-03 | Recommendation system planning | ADR-0011 | active |
| DEC-008 | 2026-07-20 | Frontend-backend unification | — | active |
| DEC-009 | 2026-07-19 | Dark mode via CSS semantic tokens | — | active |
| DEC-010 | 2026-07-22 | Actor-aware notification dedup | — | active |
| DEC-011 | 2026-07-23 | Quality safety net: fail-fast vs fail-through | — | active |
| DEC-012 | 2026-07-23 | Translation retry: exponential backoff vs circuit breaker | — | active |
| DEC-014 | 2026-07-23 | Video status response: subtitle_count for resume hint | — | active |
| DEC-015 | 2026-07-23 | Word_levels preservation: compute-on-null vs always-recompute | — | active |
| DEC-017 | 2026-07-24 | ADR-0012: Cut social community UGC, pivot to AI learning plan | ADR-0012 | active |
| DEC-018 | 2026-07-24 | LearningEvent vs BehaviorEvent: separate models | — | active |
| DEC-019 | 2026-07-24 | WordMastery: enhance Vocabulary vs new table | — | active |
| DEC-020 | 2026-07-24 | UX design direction: Apple HIG + Material Design + Linear principles | — | active |
| DEC-021 | 2026-08-14 | 全站审查修复：关键决策 | ADR-0013 | active |
| DEC-022 | 2026-08-14 | JWT 库从 python-jose 迁移到 PyJWT | — | active |
| DEC-023 | 2026-08-14 | 跟读（Shadowing）录音持久化（正式化既有事实） | ADR-0013 | active |
| DEC-025 | 2026-08-28 | D0b 产品瘦身：下线 AI 助手 / 评论 / UGC / 学习计划（f855613） | — | active |
| DEC-026 | 2026-08-29 | D6 提醒调度：单条每小时扫描 + 用户本地时间匹配（Phase 2） | — | active |
| DEC-027 | 2026-08-29 | D9 周报：不可变快照 + 周一 00:00 UTC beat（Phase 2） | — | active |
| DEC-028 | 2026-08-30 | D10 跟读体验增强：逐句模式 + 波形对比 + 时间线（Phase 3） | ADR-0015 | active |
| DEC-029 | 2026-09-08 | 翻译引擎统一为火山引擎 ARK (ark-code-latest) | ADR-0018 | active |
| DEC-030 | 2026-09-09 | YouTube anti-bot：POT provider + 代理中继（48 条批量上线） | — | active |
| DEC-031 | 2026-09-09 | 批量驱动与 worker 必须服务化托管（NSSM） | — | active |
| DEC-032 | 2026-09-09 | 上线验证判据：feed 排名不算、mp4 404 才算 | — | active |
| DEC-033 | 2026-08-30 | D12 可访问性：浅层落地（Lighthouse 96/100，超 90 达标线） | ADR-0016 | active |
| DEC-034 | 2026-08-30 | §10 待拍板 4 项（用户拍板） | — | active |
| DEC-035 | 2026-08-30 | 频道升级为全量作者页 Auto-Channel（ADR-0014 修订） | ADR-0014 | active |
| DEC-036 | 2026-09-08 | 视频候选池 Catalog（抓取发现与逐条策展解耦） | ADR-0017 | active |
| DEC-037 | 2026-09-19 | 内测上线四件套（排行 / 学习闭环 / 免费开放 / 存储三态） | ADR-0019, ADR-0020 | active |
| DEC-038 | 2026-09-19 | 周榜改自然周口径 + 首页卡片信息密度（简介 / 总播放 / 收藏） | — | active |
| DEC-039 | 2026-09-20 | 部署形态定稿（异地构建 + 传镜像）+ 迁移归属权收敛到 backend | — | active |
| DEC-040 | 2026-09-20 | 知识层归档机制 + stale 提醒检查 | — | active |
| DEC-041 | 2026-09-20 | 首页排行块并入筛选栏排序（修订 DEC-037 呈现层） | — | active |
| DEC-042 | 2026-09-21 | LLM 视频自动分类与分级 + 分级颜色目标优先 | — | active |
| DEC-043 | 2026-09-21 | 视频难度校准：习得级别 + 超纲率（修订 DEC-042 的难度兜底） | — | active |
| DEC-044 | 2026-09-21 | 点词分级渲染：`/gloss/static` + `/gloss/enrich` 两级端点 | — | active |
| DEC-045 | 2026-09-21 | 榜单页改版：TopPodium + RankingRow 重写 | — | active |
| DEC-046 | 2026-09-22 | 发现→频道 + 词汇本→单词训练（百词斩式两段训练流） | — | active |
| DEC-048 | 2026-09-22 | 默认头像改为跟随用户的性别（修订 DEC-047 的插画选择机制） | — | active |
| DEC-049 | 2026-09-25 | Catalog promote 改为幂等复用：行锁 + 记录链接 + URL 级回收 | — | active |
| DEC-050 | 2026-09-25 | 行为事件的镜像副作用统一以 LearningRecord 为前提；未知 video_id 置 NULL | — | active |
| DEC-051 | 2026-09-25 | 未知 ENV 值 fail-closed，保留 development 作为默认 | — | active |
| DEC-052 | 2026-09-25 | 首页 feed 加「收藏最多 / 本周收藏」排序（修订 DEC-041 的「刻意不同源」条款） | — | active |
| DEC-053 | 2026-09-25 | 训练轮次落库 + 每日配额 + 加练（`study_sessions` / `study_session_items`） | — | active |
| DEC-054 | 2026-09-27 | 知识层写入密度与余量阶梯（DEC-040 的运行细则） | — | active |
| DEC-055 | 2026-09-27 | 知识层双层定价与正向循环（细化 DEC-054） | — | active |
| DEC-056 | 2026-09-27 | 训练流程选择题化：废弃「认识/不认识」，连对两次毕业 + 题型轮换 | — | active |
| DEC-057 | 2026-09-27 | 复习调度替换 SM-2：错误次数分档直接决定间隔 | — | active |
| DEC-058 | 2026-09-27 | 支付验签默认 fail-closed，dev 旁路须显式 opt-out（审计 H12） | — | active |
| DEC-059 | 2026-09-28 | 搜索改用内联 tsvector，不建 `search_vector` 列 | — | active |
| DEC-060 | 2026-09-28 | 通知 WebSocket 的 JWT 改走子协议，删除 `?token=` | — | active |
| DEC-061 | 2026-09-28 | 生产必须显式配置 `REDIS_URL`（fail-fast） | — | active |
| DEC-062 | 2026-09-29 | 知识层体积治理：单文件上限降为目标，索引按状态收敛（修订 DEC-054/055） | — | active |
| DEC-063 | 2026-09-29 | 目录归属：顶层按「存放种类」划分，物料与知识分离（layout 检查） | — | active |
| DEC-064 | 2026-09-29 | 口播原话的入库与分流：内容冻结、段落全覆盖（`inbox/` + `captures` 检查） | — | active |
| DEC-065 | 2026-09-29 | 技能层采用 mattpocock/skills，仓库按其 setup 初始化（不采用自建编排层） | — | active |
| DEC-066 | 2026-09-29 | 知识层分层：冷仓单目录、热层瘦身、索引层（99 个文件一次搬迁） | — | active; 分层判据由 DEC-072 从两层扩展为三层（新增认知层与缝判据） |
| DEC-067 | 2026-09-29 | 取消知识层的字节上限与目标，改为一套分层标准（修订 DEC-062） | — | active; 体积口径由 DEC-072 沿用，未改 |
| DEC-068 | 2026-10-02 | 范围升级要显式：优化类任务不走 wayfinder 地图（关闭 #20，挂起 #25/#29） | ④ superseded by DEC-071（物料改为按零引用删除） | active |
| DEC-069 | 2026-10-02 | 推翻「乙·字幕入画」：观看控制搬进壳的顶栏与底栏（真机证据） | — | active |
| DEC-070 | 2026-10-02 | 移动端播放页 R5「齐平字幕带」：字幕与画框齐平、模式行归文稿卡头；句导航闭包与 dev 指示器修复 | — | active |
| DEC-071 | 2026-10-03 | 仓库瘦身：删零引用物料与死代码，修一条永不执行的 e2e（部分取代 DEC-068 ④） | — | active |
| DEC-072 | 2026-10-03 | 认知系统以 AOCI 为核心：三层、一条缝、一个收尾动作（扩展 DEC-066/067） | — | active |

Retired 6 — DEC-003, DEC-005, DEC-013, DEC-016, DEC-024, DEC-047 — superseded or never implemented; bodies and stubs stay in `decisions.md`.
