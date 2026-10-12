# AGENTS.md 同构格式版（Kimi 格式逐节对齐）草案 — 2026-10-12

> **状态**：**草案，待拍板**；本文件不改动任何生效规则。**取代** [AGENTS-精简规则-2026-10.md](AGENTS-精简规则-2026-10.md)
> （那份是混合版：保留本仓原有小节，只借参照文档的分节）。
> **参照物**：用户 2026-10-12 提供的 Kimi Code 仓库根 `AGENTS.md`（88 行）。
> **本份的原则**：**格式逐节对齐**——H1 同名、开篇「一句语言规则 + 一段定位」、八节同序、
> `Code Review Rules` 下六个 H3 同构；内容全部换成本仓的真事实。
> **备份**：现 `AGENTS.md` 已逐字节备份在 [AGENTS-2026-10-12.md](../archive/AGENTS-2026-10-12.md)
> （23174 字节，sha256 `2D4C89720EA13CE2719599D19E3B3ECBE6B4663B79DF5A56829CC27076ECF2DF`）。
> **采用方式**：把「附」的代码块整篇写进仓库根 `AGENTS.md`，末尾原样接上现有
> `<!-- aoci:begin -->` … `<!-- aoci:end -->` 区块（103 行 / 13257 字节）。区块**不复制进本文件**：
> 热层不许出现第二份 AOCI 契约，采用时由会话机械拼接。

## 0. 与参照文档的两处不可避免差异

1. **末尾必须保留 AOCI 区块**：本仓 MUST（`.agent/invariants.md`），且 `check_knowledge.py` 的 `cognition` 门
   要求 `AGENTS.md` 恰一对 `aoci:begin` / `aoci:end` 且块 ≥ 200 字符。参照文档没有这一段（它的模型不靠外部认知层）。
2. **`Experimental Features` 一节在本仓没有对应物**，换成 `Removed and Dormant Features`——本仓真有这份清单
   （`.agent/invariants.md` 的「已移除功能不得重新引入」与「休眠但存在不得扩展」两节）。其余七节同名同序。

## 1. 逐节对照

| 参照文档（Kimi） | 本份 | 处理 |
|---|---|---|
| `# Repository-level Agent Guide` + 语言规则 + 定位段 | 同 | H1 同名；定位段换成本仓形态 |
| `Working Principles` | 同 | 换成本仓的热原则，含开场取认知 |
| `Project Map` | 同 | 降到**目录级 + 去哪查**（不搬对象契约） |
| `Environment Requirements` | 同 | 换成本仓真实环境（解释器 / Node / 迁移归属 / 部署形态） |
| `Monorepo Workspace Maintenance` | `Knowledge Layer Maintenance` | 本仓对应物：三层知识系统的维护纪律 |
| `General Coding Rules` | 同 | 只**指认** INV 编号与规则的家，不复述约束正文 |
| `Experimental Features` | `Removed and Dormant Features` | 本仓对应物（见第 0 节第 2 条） |
| `Where to Update Instructions` | 同 | 热层 / 冷仓 / AOCI 的分工 |
| `Workflow Requirements` | 同 | 四道本地门 + 提交 + 部署 + CI |
| `Code Review Rules`（6 个 H3） | 同 | 六个 H3 换成本仓「审查改动 — 六个必问」，案例换成本仓的 |

## 2. 语言与 H1 的两个可选开关

- 正文语言：本份**标题与 H3 保留英文原名**（格式的一部分），正文用中文（本仓用户默认中文，参照文档首行
  也是「Reply in the same language as the user」）。要**全英文**版本说一声。
- H1：本份照抄参照文档的 `# Repository-level Agent Guide`。想用 `# AGENTS.md` 改一行即可。

---

## 附：建议的 AGENTS.md 正文（同构格式，整篇替换用）

```markdown
# Repository-level Agent Guide

与用户交流使用用户所用的语言（本仓用户默认使用中文）。

这是 SeeWord 的单仓库：FastAPI + Celery 后端、Next.js 16 前端，外加跑在另一台机器上的 GPU 转写 worker。
根 `AGENTS.md` 只放热路径规则——项目地图、硬约束、工作流，也就是每个任务都需要知道的东西。**对象级事实不在
这里**（某个文件 / 表是什么、和谁有关系、契约是什么、改它要注意什么），那些在 AOCI 认知层。

## Working Principles

- 从第一性原理出发：以真实需求、代码事实与验证结果为准；目标不清楚就先和用户讨论。
- 代码是唯一事实来源。除非用户明确要求，不要为了理解实现去读普通 Markdown。
- 改动前读目标代码、读最近的约束（`.agent/invariants.md`），并遵守目录树里离你最近的 `AGENTS.md`。
- **开场先取认知**：`aoci_rules` → `aoci_overview`（文件末尾的 AOCI 区块是这份合同的正文）。索引 Dirty / Stale
  时认知仍可读，但不得声称它描述今天的代码，并把机器事实写进 `.agent/state.md`。
- 改动要聚焦：不夹带无关重构，不顺手「修复」不在范围内的东西。
- 提交信息不带 co-author 署名，不暴露 agent 身份。

## Project Map

每条只做「这是什么目录 + 细节去哪查」，不写对象契约（那在 AOCI）。

- `backend/app/api/`：FastAPI 路由与依赖注入入口（`/api/v1`）。路由只做解析与委托，业务在 `services/`；
  每个端点挂哪道鉴权依赖，看 AOCI 里对应路由的条目。
- `backend/app/services/`：领域逻辑。AI 调用的收口点是 `ai_service`，不要在路由里直接建客户端。
- `backend/app/tasks/`：Celery 任务与视频管线（默认队列 + `transcription_gpu` GPU 队列）。改管线前务必读
  `knowledge/wiki/architecture/video-pipeline.md`。
- `backend/app/models/`、`backend/app/schemas/`：ORM 表与对外契约。改契约是跨端变更，先看前端消费点。
- `backend/migrations/`：Alembic 迁移。每个迁移的取舍写在迁移文件里，历史记录在 `knowledge/`。
- `backend/scripts/`：一次性运维脚本。应用代码不得导入它们。
- `frontend/src/app/`：Next.js App Router 页面（`(main)` 用户端、`(admin)` 管理后台）。
- `frontend/src/components/`、`hooks/`、`lib/`、`stores/`：UI 组件、数据 hooks、API 客户端、Zustand store。
- `frontend/e2e/`：Playwright spec；CI 只跑 chromium 项目。
- `knowledge/`：冷仓——为什么这么定、历史、操作程序。入口是 `knowledge/INDEX.md`，**永不整篇读**
  `decisions.md`（先查 `decisions-index.md` 找到那一条）。
- `.agent/`：热层会话契约——`invariants.md`（规则唯一正文）、`state.md`（在飞的事 / 下一步 / 已知问题）、
  `owners.md`（拆任务）、`README.md`（三层与缝判据）。
- `scripts/check-knowledge/`：知识层检查器与它的配置（路径、布局、模块、基线、封存台账）。
- `aoci.txt` / `aoci.meta.txt` / `aoci.code.txt` / `.aoci/`：AOCI 认知资产。只经 AOCI 工具写，永不手改。
- `docs/`：只剩 `agents/`（issue tracker、triage 标签、领域文档）与 `design/`（原型与真机量具）。

## Environment Requirements

- **Python**：后端用 `backend/.venv` 的解释器。Windows 下**必须**带 `PYTHONUTF8=1`，否则 slowapi 按 GBK 读
  `.env`，测试收集阶段就崩。
- **Node**：22（`npm ci`）。`next dev` 会自动重写 `frontend/AGENTS.md`，那是生成物，不要手改。
- **本地基础设施**：`docker compose -f docker-compose.dev.yml up -d`（postgres + redis）；后端 / 前端 / Celery
  在本机原生跑。逐步命令见 `knowledge/wiki/guides/setup.md`。
- **迁移**：只由 backend 一个容器执行（`backend/entrypoint.sh`），其余服务设 `RUN_MIGRATIONS=0`——并发跑
  `alembic upgrade head` 会互相打架。
- **部署**：服务器没有构建能力，一律本地构建镜像 → 传到服务器 `docker load`。禁止在服务器上 build 或
  `git pull`。全流程见 `knowledge/operations/RUNBOOK.md`。

## Knowledge Layer Maintenance

认知分三层，写之前先判「这条事实的家在哪」（判据正文在 `.agent/README.md`）：

- **L0 AOCI**：对象事实。缝判据——能写成「恰好一个受管理对象的属性」→ AOCI；否则 → prose。
- **L1 热层**：`AGENTS.md` / `CONTEXT.md` / `.agent/`，规则与会话契约。
- **L2 冷仓**：`knowledge/`，为什么、历史、程序。

维护纪律：

- 冷仓**新增 / 搬动 / 删除**文件后，必须同步 `knowledge/INDEX.md`：索引要求每个文件恰好一行、每行都真存在
  （漏登记与死链都让检查失败）。
- **受管理对象变化后**，在本次任务最终稳定状态做一次收尾：`aoci_maintain` → 真读对象与证据 → 按机器签发的
  批次**整批** `aoci_update_entry`（不得截取、不得因单请求上限缩减范围）。
- **决策只追加**：`knowledge/decisions.md` 末尾加条目 + `decisions-index.md` 补一行（检查会校验两者的数量、
  顺序、日期与标题一致）。改变主意 = 追加新条目 + 把旧条目在索引里标 `superseded by DEC-0xx`。
- 两套机器检查各管一层、互不替代：`scripts/check-knowledge/check_knowledge.py` 管 prose 层与认知层的**接线**；
  `aoci check` / `aoci verify` 管 L0 的内容绑定。

## General Coding Rules

- **规则的唯一正文是 `.agent/invariants.md`（INV-001~025）**，每条配 why 与强制方式。改代码前读它；本文件
  不复述这些约束——复述就会和正文漂移。
- 路径级禁令的例子：不要建 `frontend/tailwind.config.js` / `.ts`（INV-004）——Tailwind v4 是 CSS-first，
  读 `globals.css`，JS 配置会被静默忽略；颜色走语义 token，不写死色值（INV-017）。
- 不要在路由里直接调 AI 客户端（INV-005）；不要为了让请求更快把 fail-open 的 Redis 包裹改成抛错（INV-002）。
- 不要为了让检查变绿去改检查器、`.mypy-baseline` 或 `knowledge-baseline.json`——那几份是棘轮（只拦新增），
  不是橡皮。
- 小改动直接做；高影响的改动先想清楚架构、取舍与本仓历史，必要时先做一次 `/decision-support`。
- 测试失败若是用户改动导致的，默认先改测试；除非实现确实有 bug，不要为了让旧测试过而改坏实现。
- 不在仓库根留临时或探索性产物（工作笔记、handoff 文档、原型、截图）；临时物放 gitignore 的目录并自己清理。

## Removed and Dormant Features

- **已移除的功能不得重新引入**，**休眠但仍在仓里的东西不得扩展**（包括仍在的列、表、路由与服务）。
  两份清单与逐条理由在 `.agent/invariants.md`；对应的「为什么」在 `knowledge/decisions.md` 的相应条目。
- 新增对外可见能力、改架构、选新技术或做不可逆变更之前：先 `/decision-support`，落一张 DEC，再动手。
- 旧功能只留兼容壳（例如返回 410 的端点、为老客户端保留的字段）时，壳也是契约：删之前先确认没人还在调。

## Where to Update Instructions

- 影响几乎所有任务的硬规则 → 根 `AGENTS.md`（本文件）。
- 只影响某个目录的规则 → 最近的子目录 `AGENTS.md`（如 `frontend/AGENTS.md`）；生成物除外。
- 对象级事实（某文件 / 表是什么、契约、约束）→ **AOCI**，不进 prose。
- 为什么这么定、代价、历史、程序 → 冷仓 `knowledge/`，经 `INDEX.md` 找，按
  `knowledge/wiki/guides/repository-layout.md` 选目录。
- 一条必须持续成立的约束 → `.agent/invariants.md`（它才是正文；别在本文件里写第二份）。
- 指令更新要保持聚焦、有代码事实支撑；写错层是这套系统唯一会累积的坏账。

## Workflow Requirements

- 读代码优先 `rg` / `rg --files`。
- 提交前过本地四道门：后端 `pytest` + `ruff` + `mypy`（基线只拦新增）；前端 `format:check` + `tsc` +
  `vitest` + `lint` + `build`；知识层 `scripts/check-knowledge/check_knowledge.py`。清单与「本地绿 ≠ CI 绿」的
  陷阱表见 `knowledge/wiki/guides/release-checklist.md`。
- 提交信息用 Conventional Commits（`type(scope): description`），scope 表见 `CONTRIBUTING.md`；一次改动一件事。
- 对抗式审查的触发文件：`backend/app/core/security.py`、`backend/app/api/v1/payments.py`、
  `backend/app/api/dependencies.py`（见 `knowledge/plans/WORKFLOW.md`）。
- CI 是三道门：`ci.yml`（backend / frontend / e2e）与 `knowledge.yml`（每次 push 都跑、**故意**不做 paths
  过滤——过滤会留下「只新增一个违禁文件」的盲区）。
- 部署与回滚一律按 `knowledge/operations/RUNBOOK.md`；上线前按它核验终态，而不是看容器 Up。

## Code Review Rules

适用于每个 PR 审查，人或 agent 都算。清单本体是 `.agent/invariants.md` 的「审查改动 — 六个必问」；下面每条
给一个「为什么严重」的判据，本仓案例在 `knowledge/wiki/guides/code-review-principles.md`。

### Enumerate changed behavior, not just bugs

改动前能工作的任何输入——一个配置键、环境变量、请求 / 响应形状、老客户端依赖的字段、GPU worker 按契约实现的
回调——改动后必须行为不变，除非 PR 明确声明了变化。对每一个被删除或收窄的分支、条件、默认值，问「以前谁能
走到它、现在他去哪」；对每一个新条件，问「哪些既有输入现在先命中它」。把分支条件已经移动的路径称为
unchanged，本身就是 finding。

### A flipped default or removed behavior needs a named loss and an escape hatch

躺在旧默认值上的人全都会受影响。要求 PR **点名用户失去的行为**，而不是只写新默认值；要求一个配置 / 环境
变量 / 开关级的逃生口或维护者的显式签字；要求有一条把旧行为钉住的测试。本仓的现成例子：`ENV` 默认是
development，漏配即按 dev 形态运行（支付验签旁路 + mock 支付路由 + 无 HSTS/CSP）。

### Prompt text is behavior

改后端里的提示词——`video_classification` 的分类提示、`services/translation` 各引擎的翻译提示、`word_notes`
的笔记提示、`ai_service` 的出题提示——等于改行为。「没有测试引用这句话」不是没有影响的证据。要求 PR 说清：
谁收到这段文本、它原来在约束什么、谁依赖过它、现在由什么保证。

### Contract files are tripwires

`backend/app/schemas/**`、`api/v1/**` 的响应形状、`frontend/src/types/index.ts`、`api/v1/internal.py` 的回调
契约、`requirements*.txt`、`.mypy-baseline`、`knowledge/INDEX.md` 都是被跨层或仓外消费的东西：GPU worker 在
另一台机器上按回调契约实现，前端按类型文件写页面，CI 按基线判新增错误。它们变化时，要求 PR 点名消费者，
并说明旧版本的一端怎么继续工作。

### Ports and refactors carry the old path's feature inventory

当一次改动替换或绕开既有路径（换 SDK、换算法、换 provider），要求列出旧路径做过什么——认哪些环境变量、
有哪些回退、接受哪些输入——以及每一项在新路径里的落点。静默丢掉的一项就是退化，不是清理。

### Silent failure outranks a crash

让产品静默忽略配置、静默放行动作或静默丢数据的改动，是最严重的一类 finding：用户没有信号可报。本仓高发
区域是 fail-open 的 Redis 包裹、静默降级的对象存储与缩略图、静默丢弃的未知 video 事件，以及守卫写错后
静默 skip 的 e2e 断言。
```
