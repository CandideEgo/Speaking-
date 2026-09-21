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

**Problem**: 内测上线需要四块新能力，且彼此耦合：① 首页排行（最新/本周热播/本周收藏）② 词汇学习闭环（收词 → 集合 → 过筛 → 闭环）③ 内测期免费开放全功能、不引入 Pro 概念 ④ 内容存储三态与下线释放空间。需求见 `docs/requirements/REQUIREMENTS-launch-internal-test.md`（产品方逐项确认，为最高优先级输入）。

**Options**: 学习闭环状态机 A) 沿用 SM-2 四态 B) 新建独立三态体系 C) 三态对外 + SM-2 对内；收词数据 A) 复用 `Vocabulary` 平铺 + 按 `video_id` 聚合 B) 新建 `vocab_sets` 双表；下线 A) 物理删除 video 行 B) 行保留 dormant + 状态翻转。

**Decision**:
1. **排行**（未编 ADR，实现见 commit d86fa2d）：新增 `videos.published_at`（回填 `COALESCE(reviewed_at, created_at)`，`_publish_video` 幂等写入）；`GET /videos/rankings?scope=latest|weekly_views|weekly_favorites`（各前 20）。热播 = `behavior_events` 的 play/complete 近 7 天按 `session_id` 去重计数；收藏 = `user_favorites.created_at` 近 7 天计数（需求 §3.1 指定，**无新埋点**）。Redis 快照读穿 + `snapshot-rankings` 每日 beat 刷新。
2. **学习闭环**（[ADR-0019](../docs/adr/0019-vocab-set-quick-sieve-loop.md)）：`vocab_sets`（user×video×exam_level 唯一）+ `vocab_set_words`（引用 Vocabulary + position + 流程状态 pending/known/unknown/learned）。**掌握态仍归 Vocabulary**，集合只存引用与集合内进度；对外三态（reviewing 并入学习中展示，后端不迁数据）。收词只读 ECDICT（**禁用 `enrich_word`，那是 AI 路径**）。闭环需 `POST .../learned` 显式标记待学清单，`completed` = 无 pending 且无 unknown。配套行为变更：**mastered 退出复习队列**（due 过滤 4 处）。
3. **内测免费开放**（实施按 `docs/progress/FREE-TIER-ASSESSMENT-2026-09.md`）：媒体门对所有登录用户放行（匿名仅 `is_demo`）；详情不再遮蔽字幕/URL；`/unlock`、`/unlocked`、`/unlocked-ids` 退役为放行/空载荷（不写 `user_video_unlocks`）；停用 3 个 Pro beat；前端删 paywall 组件与 4 个 Pro 页（`/upgrade` `/pricing` `/redeem` `/checkout` → redirect）。**保留**登录墙、shadowing owner-only、`plan`/`RedeemCode` 表 dormant。
4. **存储三态**（[ADR-0020](../docs/adr/0020-storage-modes-and-takedown.md)）：`videos.storage_mode`（local/proxy/offline，proxy 仅留值不实现 —— §5.4 优先级 3）。下线 = `is_published=False` + `storage_mode='offline'` + 清 URL + 删媒体（**缩略图保留**），**行保留 dormant** 以避开 `vocabulary`/`UserFavorite` 的 CASCADE；隐藏复用既有 `is_published` 过滤，仅媒体门/收藏夹/详情三处显式处理。

**Reason**: 排行复用既有字段与 BehaviorEvent，零新埋点即可上（但「最新」需补 `published_at`，因 Video 原本没有该列）。集合表只存引用让「集合 = 按视频聚合的视图」成立且可重建，掌握态单一事实来源不被污染。三态对外 + SM-2 对内让「闭环终点可定义」与「现有复习引擎不拆」同时成立。行保留式下线是唯一能同时满足「释放空间」与「学习记录不断链」的方案。

**Trade-offs**:
- **mastered 退出复习队列是行为变更**：存量已 mastered 的词不再日常复现。语义更诚实（已掌握 = 终点），但削弱长期间隔复现；Pro 二期高级复习算法需显式定义 mastered 的复现策略。
- 集合进度无冗余计数列，靠聚合查询（量级小，可接受）；换得集合可任意重建。
- 内测期免费 = 收入为零，唯一随用户量增长的成本是媒体带宽/存储（见 FREE-TIER-ASSESSMENT §五）。
- proxy 模式仅占位，未解决「不下载」的版权路径；ADR-0017 的版权风险不变。
- `_FakeRedis` 补 `scan_iter` 后才暴露/覆盖「缓存失效」路径；此前 fail-open 会静默吞掉 AttributeError。
- 验证：后端 735 passed（含 +15 排行 / +24 集合闭环 / +13 下线）；三支端到端冒烟 31+18+24 全通过；前端 tsc/eslint/vitest/build 全绿；mypy 77 基线。
- 未做：proxy 实现、公开落地页、海报视觉稿（运营物料）、Proxy 二期的 Pro 差异项。

---

## 2026-09-19 — 周榜改自然周口径 + 首页卡片信息密度（简介 / 总播放 / 收藏）

**Problem**: DEC-037 第 1 点周榜采用「当前时刻滚动近 7 天」窗口，产品方内测前拍板改为自然周（与「本周热播 / 本周收藏」文案和用户心智一致，周一固定换榜）；同时首页视频卡片只有标题 + 频道 + 分类，用户无法在 feed 里判断内容，也看不到视频的总播放 / 收藏（站内 `Video.view_count` 早已计数但列表接口从未下发）。本条修订 DEC-037 第 1 点的窗口口径，其余三点不变。

**Options**: 周窗口 A) 维持滚动 7 天 B) 自然周（时区按 UTC / 用户本地 / 北京固定）；卡片简介 A) 不加 B) 标题下两行截断简介；指标 A) 只显示周增量（排行榜已有）B) 卡片显示累计总播放 / 收藏。

**Decision**:
1. **自然周**：`ranking_service.current_week_start_utc()` 返回 Asia/Shanghai（UTC+8 固定偏移，中国无夏令时；Windows 无 tzdata 故不用 zoneinfo）周一 00:00 折算的 UTC 时刻，weekly_views / weekly_favorites 两处 since 统一使用，删除滚动 `_WEEK`。`snapshot-rankings` beat 从 UTC 01:23 改为 UTC 16:30（北京每日 00:30），周一换榜快照滞后 ≤30 分钟。测试改为不依赖运行当天星期几的固定窗口口径，并新增 ±7 天边界遍历用例。
2. **卡片信息密度**：`Video.description` 为读取 `external_meta["description"]` 的 ORM property（本地视频 / 未抽取为 None）；`VideoResponse` 新增 `view_count`（站内 complete 事件累计，区别于 YouTube 侧 `ext_view_count`）与 `description`，均有默认值以兼容旧缓存 JSON。列表路径（推荐 home/category、browse、channel、favorites）统一下发，简介在序列化层截断到 `CARD_DESCRIPTION_LIMIT=200`；详情接口保留全文。前端 `VideoCard` 标题下新增两行简介（无则不占位）与播放（Eye）/ 收藏（Bookmark）指标行（万级格式化，0 正常显示，字段缺省不渲染），指标行独立于自定义 footer。

**Reason**: 「本周」在中文语境默认指自然周，滚动窗口会让用户困惑「为什么周一榜单没变」；固定周一换榜可预期、可解释。累计计数是最基础的社会证明与选片依据，周增量只在排行榜有意义；简介两行让用户不点进详情即可筛内容，直接服务内测留存。

**Trade-offs**:
- 北京 00:00~00:30 之间周榜快照仍是上周（≤30 分钟滞后）；Redis 故障读穿实时计算用新窗口，二者可能短暂不一致。
- 简介覆盖率取决于 `external_meta` 回填（本地视频与早期数据为 None，卡片不渲染简介、不报错）；上线前应跑 `scripts/backfill_external_meta.py` 或抽查填充率。
- feed 缓存（推荐 60s / browse 300s / 详情 300s）内旧载荷无新字段，schema 默认值兜底、自然过期。
- legacy 列表端点（/videos/public、UGC community feed）经 model_validate 携带未截断全文简介，但当前无前端消费方，未做截断。

---

## 2026-09-20 — 部署形态定稿（异地构建 + 传镜像）+ 迁移归属权收敛到 backend

**Problem**: 生产机规格 2C/1.6GB、`/opt/speaking` 无 `.git`，**无法就地构建**：`docker compose build` 打满内存并把宿主机冻住（2026-09-20 实测）。同时三个容器（backend / celery / celery-beat）共用同一镜像入口，启动时各自跑 `alembic upgrade head`——上线时实际撞出唯一约束冲突（celery 容器 `duplicate key`），而 entrypoint 是 fail-open 设计（迁移失败也继续启动），终态是否正确全靠时序运气。文档侧同样失真：RUNBOOK §1.1、PRODUCTION.md §5、`deploy.sh` / `deploy-oneclick.sh` / `deploy.yml.template` 都写着 `git pull` + 就地 build 这套已不成立的流程。

**Options**: 部署 A) 服务器就地构建 B) 异地构建 + 传镜像（`docker save | gzip` → rsync → `docker load`）C) CI 构建 + 镜像仓库；迁移归属 A) 每个容器各自迁移（现状）B) 只 backend 迁移、其余容器跳过并排在 backend 健康之后 C) 独立迁移 job / init container + 锁。

**Decision**:
1. **部署 = B**：本地构建 `linux/amd64` 镜像 → `docker save` → rsync（可断点续传）→ 服务器 `docker load` → `up -d --remove-orphans`。服务器只承载运行时文件（compose / nginx conf / `.env` / `backend/data` 822MB bind mount），源码目录不参与运行。选项 C 需要额外凭据与带宽，暂不引入。
2. **迁移归属 = B**：`entrypoint.sh` 增加 `RUN_MIGRATIONS` 开关（默认 1，保持原语义）；compose 给 celery / celery-beat 设 `RUN_MIGRATIONS=0` 并让两者 `depends_on backend: service_healthy`。显式 `migrate-only` 覆盖该开关，供部署时先把迁移跑完。
3. **flower 改 `profiles: ["monitoring"]`**：不再随 `up -d` 起床（此前会被顺带拉起，仅绑 loopback 且用默认口令 `admin:flower`）。
4. **文档收敛到单一来源**：RUNBOOK §1.1 重写为标准流程（含 `pre-deploy` 镜像标签回滚、禁止 `docker compose down`）；PRODUCTION.md §5.1/5.2 改为指向它；`deploy.sh` / `deploy-oneclick.sh` / `deploy.yml.template` 标注失效。

**Reason**: 服务器规格决定它只能是运行时载体，构建必须发生在有 CPU / 内存的地方——把构建移出生产机同时消除了「构建压垮站点」与「镜像来源与源码不同步」两类风险，并且镜像可以在上线前先核对 sha256。迁移是 schema 的单写者操作，最小可行的互斥不是加锁而是**指定唯一写者 + 启动排序**：比 advisory lock / 独立迁移容器成本低，也不依赖迁移本身可并发。

**Trade-offs**:
- 传镜像约 424MB / 约 17 分钟（400KB/s），比 `git pull` 慢；换来构建不发生在生产机、产物可校验。
- celery / celery-beat 现在依赖 backend 健康：backend 起不来时队列不再消费（过去会照常启动）。这是刻意的（schema 未就绪时消费更糟），代价是故障面扩大。
- `RUN_MIGRATIONS=0` 只管「谁迁移」，不改变 fail-open 语义：迁移失败的可见性仍依赖 backend 日志与 `/health`。
- flower 由默认启动改为按需启动，监控数据不再连续。
- 未做：CI 构建 + 镜像仓库、GPU worker 镜像的同等流程、迁移前自动 pg 备份。

---

## 2026-09-20 — 知识层归档机制 + stale 提醒检查

**Problem**: `decisions.md` 正好卡在上限（51164 B = limit），下一条决策只能靠 `--budget-refresh` 放行——一次刷新就把"顶格"变成常态；同时检查层只能抓机械漂移，"改了已记录模块该复查哪篇文档"仍靠人记，知识层 skill 里"尚未实现"的那条一直悬着
**Options**: A) 调高上限放行；B) 最老一期正文原样迁入 `archive/`、原处留 stub、上限下调；C) 让检查层在改动已记录模块时硬失败，逼出复查
**Decision**: B，并新增第 7 项检查 `stale`。按模块在 `knowledge-stamps.json` 记录 `verified` 日期与代码摘要（sha256，CRLF 归一，排除检查器自身状态文件）；摘要有变即打印需要复查的文档与刷新命令。提醒只提示（退出码 0），`--strict` 才拦；stamps 里的空洞——未知模块、有文档却无 stamp——直接判失败
**Reason**: 上限是纪律不是目标：刷新一次就把顶格变成常态，而归档把正文留在可查的位置、把顶格压力还给未来。提醒若做成硬门禁，换来的多半是 `--stamp-refresh` 被机械执行，而不是文档真被读一遍；所以要拦就只拦"提醒已失效"这一件事——那才是它会静默失效的方式
**Trade-offs**: 归档正文冻结，内部 markdown 链接仍按 `.agent/` 相对路径写（`.agent/archive/` 豁免全部检查）；`stale` 的通知会在改动已记录模块后持续显示，直到有人复查并刷新对应 stamp，代价是噪音、收益是它不会被忘掉；粒度沿用 `modules.json`，宽模块（`backend-services`、`api-v1`）会比窄模块更常触发

---

## 2026-09-20 — 首页排行块并入筛选栏排序（修订 DEC-037 呈现层）

**Problem**: 首页独立「排行」区块（DEC-037）独占一屏、与下方 feed 割裂。产品方拍板：排行融入分类筛选栏，「热播 / 最新 / 推荐」变成对整个首页视频网格排序的开关，不单独开区；分类同时改为可展开按钮。
**Options**: A) 排序复用 `/videos/rankings`（各 scope 前 20，零后端改动）——但与分类/难度筛选不组合、无分页、至多 20 条，回答不了「这个分类里的热播是什么」；B) `/browse/feed` 加 `sort` 参数。
**Decision**: B。`sort=latest|hot`（默认 latest，行为不变）；hot = 站内总播放 `view_count` DESC（与周榜 behavior_events 去重口径刻意不同源，周榜仍是 `/videos/rankings` 唯一职责）；缓存 key 加 `{sort}` 段（`invalidate_browse_cache` 的 `browse:feed:*` 模式天然覆盖）。首页删 `RankingBlock`，新 `HomeFilterBar` = 分类下拉 + 排序下拉（推荐/热播/最新，底部留「完整榜单」链到保留的 `/rankings` 页）+ 难度 pills。`usePlatformFeed` 增 `sort` 状态：仅「推荐 + 全部分类 + 全部难度」走个性化 `/recommendations/home`，其余一律走 feed。
**Reason**: 只有 feed 加参数能让排序、筛选、分页三者组合；周榜口径（自然周 + session 去重）是为榜单防刷设计的，feed 排序要的是覆盖全量的稳定序。
**Trade-offs**: 首页「推荐」语义双重（分类 all 的标签与排序选项同名，源自 home 覆盖 all 标签的旧约定），分类按钮以「分类 / 分类 · X」呈现消歧；feed「最新」按 `created_at`，与榜单「最新」按 `published_at`（DEC-037 回填列）略有差异；`RankingBlock.tsx` 删除，`useRankings`/`RankingRow` 仍服务 `/rankings` 页。

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
