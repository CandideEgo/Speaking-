# SeeWord 代码框架梳理与审查报告（2026-10-20）

状态：**审查完成，未修复任何代码**。范围：当前 `master`（HEAD `d6a0b85`，含 4 个未推送 commit）
与工作区全部未跟踪新模块。方法：静态走查 + 实测门禁 + 4 路并行分片审查 + 逐条独立复核。

口径：**代码是事实源**。本报告只记录实测结果；凡与 `CLAUDE.md` / `docs/` 说法不符之处，
以代码为准并单独标注（见 §7 文档漂移）。跑不了的检查写「未执行」并说明原因，不写成通过。

本次审查**没有修改任何生产代码、配置、迁移或数据**。唯一的写入是本文件与
`docs/code-review-2026-10-20-checklist.md`。

---

## 0. 结论提要

整体判断：**骨架健康、核心契约严密，但并发安全与门禁执行存在系统性缺口**。
新增的「首页编辑内容」与「金数据支付」两个功能在**数据正确性**上有真实的数据丢失与
死锁路径，且**当前 master 的 CI 已经是红的**。

| 维度 | 结论 |
|---|---|
| 分层与依赖方向 | 基本正确；service→api 反向 import 3 处，其中 1 处造成真实循环依赖 |
| 契约一致性（前端↔后端） | `types/homeContent.ts` ↔ `schemas/home_content.py` **逐字段一致**；`VideoCard` ↔ `VideoResponse` 40 字段全对齐 |
| 错误响应 envelope | 新代码零违规（无裸 `HTTPException(status,"str")`、无裸 `detail` 返回） |
| 鉴权 | `admin_home_content.py` 12/12 全 `get_admin_user`；`discovery.py` 18 端点鉴权正确；公共读路径无用户私有数据 |
| AI 调用收口 | INV-005 **未被违反**；全仓 `import openai` 仅 2 处且都在 ruff 白名单内 |
| 数据库一致性 | 新增 4 张表结构与 migration **完全一致**（alembic autogenerate 对比实际 DB，0 差异） |
| **并发安全** | **不达标**：草稿保存/发布/回滚全是读-改-写；生成写回有 TOCTOU；金数据两条发放路径锁序相反（已复现死锁） |
| **门禁执行** | **有缺口**：design-system / session-writes 两个不变量，CI 与 pre-commit 都不执行 |
| CI 状态 | **红**。本地实测的 4 条 mypy 新增错误与 `gh run` 的 CI 失败日志**逐条一致** |
| 凭据卫生 | 真实 key 片段与生产管理员密码在**未推送**的 commit 里；`origin/master` 干净 |

### 门禁实测总表

| 检查 | 命令 | 结果 |
|---|---|---|
| 后端测试 | `pytest tests/ -q` | **1242 passed, 8 failed, 12 skipped**（593s） |
| 后端 lint | `ruff check app/ tests/` | 通过 |
| 前端单测 | `npx vitest run` | 295 passed / 23 files |
| 前端类型 | `npx tsc --noEmit` | 通过 |
| 前端 lint/format | ESLint / Prettier `--check` | 通过 |
| 设计系统门禁 | `node scripts/check-design-system.mjs` | 4 条规则全通过 |
| 会话写入门禁 | `node scripts/check-session-writes.mjs` | 2 条规则全通过 |
| 迁移链 | `alembic heads` | 单一 head `m4n5o6p7q8r9`，79 revisions 链完整 |
| 类型门禁 | `mypy app/` vs `.mypy-baseline` | **4 条新增错误**（53 对 vs 基线 51） |
| model↔DB | alembic autogenerate 对比实际 Postgres | 存量表 29 项历史漂移；**新增表 0 项** |

> **未执行**：`npx playwright test`（需起 dev 栈）、`alembic upgrade head`（未实际执行迁移，
> 链完整性由静态解析 79 个 revision 文件 + `alembic heads` 得出）、生产环境核验、
> `pip-audit` / `npm audit`（需联网）。

---

## 1. 架构骨架

### 1.1 后端

```
main.py ──► api/v1/* ──► services/*  ──► models/*
  ▲  │  │                    │  └──► core/{config,security,database,cache,errors,limiter}
  │  │  └──✗ 直接写 ORM    └────► core/*
  │  └───────┐
  └──✗ 反向 import api/
tasks/* ──► services/*
```

| 层 | 文件 | 行数 | 最大文件 |
|---|---|---|---|
| `services/` | 71 | 21,740 | `home_content_service.py` 1877 · `home_content_generation.py` 1135 · `subtitle_edit_service.py` 911 |
| `api/v1/` | 32 | 8,035 | `videos.py` 1172 · `vocabulary.py` 625 · `media.py` 530 |
| `tasks/` | 14 | 3,590 | `video_processing.py` 1552 · `account_tasks.py` 483 |
| `models/` | 36 | 2,652 | `video.py` 239 · `home_content.py` 180 |
| `schemas/` | 17 | 2,305 | `home_content.py` 530 · `video.py` 452 |
| `core/` | 13 | 1,425 | `config.py` 404 · `database.py` 99 |

**4 个文件 >1000 行，其中 2 个是本次新增**（`home_content_service.py` 1877、
`home_content_generation.py` 1135）。

**越界 3 类**

1. **路由层写 ORM**：`api/v1/discovery.py:112-119`、`:219-229`。经核实**不构成越权**——
   `library_service.owned_set()` 先校验归属并加行锁（`library_service.py:46-52`）。
2. **服务层反向 import 路由层**（真实分层倒置）：
   - `services/channel_service.py:25` → `api.v1.browse`（**本次 `b5838d1` 引入**）
   - `services/admin_service.py:15` → `api.dependencies`
   - `services/video_cache.py:10` → `api.v1.browse`
3. **服务层互依成链**：`home_content_service` → `discovery_service` → `channel_service` → `api.v1.browse`

> **已确认的代价**：`api/v1/browse.py:72-75` 被迫用**惰性 import** 绕开
> `channel_service` 的模块级 import，注释明确写「a module-level import would close
> that cycle」；`ranking_service` 同样被迫惰性 import。根因可消除：`_video_to_dict`
> 本体只是转发 `services/video_card.serialize_video_card`，`channel_service` 可直接调
> service 层，环即消失。

**tasks ↔ services**：`tasks/` 只做事件循环与异常隔离，业务全在 service。
**全仓 `app/tasks/` 无一处用 `get_db()`**（符合「非依赖场景用 `get_async_session_maker()`」）。
但 session 获取方式不统一：`home_content_tasks.py` 用 `get_async_session_maker()`（正确，
是测试 monkeypatch 的缝），`payment_tasks.py:26,44` 用模块级 `async_session`。

### 1.2 前端

```
app/          Next.js App Router
  (main)/     用户壳：MainLayoutInner 渲染全站唯一 .container-page + 侧栏/顶栏/移动 tab bar + 20+ 子 layout.tsx
  (admin)/    管理壳：admin/(shell)/layout.tsx 做 bootstrap + /users/me role 校验
  裸路由      login register forgot-password set-password onboarding terms privacy
components/   23 个功能域目录
hooks/        40 个业务 hook
lib/          70 个文件（api 封装 + 纯函数 + 16 个 .test.ts）
stores/       5 个 Zustand store
types/        index.ts(708) / homeContent.ts / channels.ts / platform.ts
proxy.ts      边缘登录墙（Next 16 的 middleware 改名）
```

**数据获取 4 层**：`组件/hook → lib/api.ts 的 api<T>() → createApiClient 的 request<T>() → fetch()`，
管理端走 `lib/adminApi.ts` 的 `adminApi<T>()`（两套 token、两套会话）。

**超大文件**

| 文件 | 行数 | 判断 |
|---|---|---|
| `app/(main)/watch/[id]/page.tsx` | **1762** | 必须拆；**比批 8 结束时（1538）反而涨了 224 行** |
| `components/admin/home/HomeLayoutEditor.tsx` | 1013 | 建议拆 |
| `components/admin/home/HomeContentDraftForm.tsx` | 793 | 临界 |
| `hooks/useVideoPlayer.ts` | 753 | hook，可接受 |
| `components/practice/PracticePanels.tsx` | 749 | 内部已拆成 11 个子函数，可接受 |

---

## 2. 必须先处理（会红 CI / 会丢数据 / 会泄密）

### F1. CI 现在就是红的

`gh run list` 显示连续两次 failure（`444b6f8`、`c3cbed2`）。本地 `mypy app/` 与
`.mypy-baseline` 比对得到 **4 条新增**（now 53 对 vs baseline 51 对），与 CI 日志
里 `##[error]New mypy errors introduced` 列出的**逐条一致**：

```
app/core/exam_subjects.py:arg-type
app/core/exam_subjects.py:return-value
app/tasks/account_tasks.py:arg-type
app/tasks/account_tasks.py:no-any-return
```

来源 commit：`444b6f8`（exam_subjects）、`79fc26c`（account_tasks）——**不是本次改动**，
但基线同样没更新。另 `app/api/v1/browse.py:attr-defined` 与
`app/services/recommendation_service.py:arg-type` 已修复，基线可调低。

> 处置：**真修，不要往基线里加行**（根 `CLAUDE.md`：永不为让检查变绿而放宽基线）。

### F2. 8 个测试失败已随 commit 进入 master

`backend/tests/test_home_content_generation.py` 全红，根因是 `b5838d1` **同时**改了
实现与测试、fixture 没跟上：

| 失败用例 | 根因 |
|---|---|
| `TestPromptContract::test_prompt_version_is_v1` | 实现常量已是 `v2`（`home_content_generation.py:41`），断言写死 `"v1"` |
| `TestSourceChecks::test_valid_payload_passes` | v2 新增「场景必须锚定表达原句」规则（`:898-903`），fixture 仍是 v1 的 `subtitle_id: None` |
| `TestSourceChecks::test_extra_model_fields_are_ignored_not_fatal` | 同上 |
| `TestGenerateDraftOrchestration::test_single_pass_calls_ai_once_and_reports_coverage` | 同上（`:526` 断言 `== "v1"`） |
| `TestGenerateDraftOrchestration::test_candidate_stage_garbage_falls_back_to_deterministic_sample` | 同源 |
| `TestGenerationTaskWriteBack::test_valid_output_is_written_back` | 落库时 v2 校验拒绝 fixture |
| `TestGenerationTaskWriteBack::test_long_video_writes_back_after_candidate_stage` | 同上 |
| `TestGenerationTaskWriteBack::test_repeated_execution_does_not_write_twice` | 同上 |

> 处置需先判方向：**v2 规则是对的（测试该同步）还是 v2 过严（实现该退）**。
> 见 §5-G1。

### F3. 金数据两条发放路径 ABBA 死锁（已在真实 Postgres 复现）

`backend/app/services/jinshuju_service.py`：

- **路径 A**（Celery 同步 / webhook → `process_entry` → `_grant_and_mark_applied`，`:340-350`）：
  先 `select(User).with_for_update()` 锁 **users**，再 `select(JinshujuPayment).with_for_update()` 锁 **payment**
- **路径 B**（登录 → `apply_pending_grants`，`:457-466`）：
  先 `select(JinshujuPayment).with_for_update(skip_locked=True)` 锁 **payment**，
  commit 时 flush `UPDATE users`

**锁序相反 → 经典 ABBA**。已在真实 Postgres 上复现 `DeadlockDetectedError`。

**失败场景**：用户已付款但账号未注册（订单 `PENDING`）→ 用户登录补发（路径 B）
与 beat 的 `sync_jinshuju_payments` 处理同一 entry（路径 A）并发 → Postgres 杀掉其中一个事务。
被杀的是 A 时，Celery 任务记日志后**不重试**（`payment_tasks.py:37-38` 吞异常），
该笔已付款订单**永远不开通**。

**第二个问题**：`skip_locked=True` 在这里语义是反的 —— 拿不到锁就跳过并返回 0，
表现为「已付款用户登录后没有 Pro」，要等下次登录。`skip_locked` 适合
「别人正在处理、跳过是预期语义」的批处理过期场景，这里相反。

**修法方向**：统一锁序（两条路径都先锁 User）；或路径 B 改为先锁 User 再锁 Payment；
去掉 `skip_locked`（改为等待），保证付费用户一定拿到会员。

### F4. `complete_generation` 写回存在 TOCTOU，会覆盖管理员刚保存的内容

`home_content_service.py:1730-1797`：

- `:1736` 普通 `SELECT` 读出 draft（按 `active_generation_id`）
- `:1744` / `:1759` 又发两次查询算指纹
- `:1760` / `:1768` 用**内存里的** `draft.revision` 比对 `generation_draft_revision`
- `:1797` `commit()`

SELECT 与 COMMIT 之间**没有任何行锁**，draft 对象全程陈旧。

**失败场景**：管理员在 AI 写回前 1 秒保存了草稿（revision 5→6，payload 换成人工内容）。
worker 仍持有 revision=5 的旧对象 → 校验通过（比的是自己那份陈旧值）→ 写回时
`draft.revision += 1` 得到 6，把 AI payload 盖上去。
**人工内容丢失，且 revision 计数器没变化（仍是 6），前端看不出发生过冲突。**

这直接违反函数 docstring `:1733`「绝不覆盖管理员的新修改」——三重校验只挡住了
「入队之后草稿被改」这个**静态**情况，挡不住「读之后、提交之前被改」。

**修法方向**：写回改成条件 UPDATE（`WHERE id=? AND active_generation_id=? AND revision=?`），
`rowcount == 0` 即判定冲突；或整段事务用 `SELECT ... FOR UPDATE`。

### F5. 草稿保存 / 发布 / 回滚全是读-改-写，存在丢失更新竞态

| 位置 | 缺什么 |
|---|---|
| `home_content_service.py:881-902`（`save_draft`） | 无 `FOR UPDATE`，非条件 UPDATE |
| `:921`（`publish_content` 校验 `draft.revision`） | 同上 |
| `:947-955`（version 分配） | `SELECT max(version)` 后 `INSERT`，无锁 |
| `:660-673`（`_get_or_create_draft`） | 先查后插，无 `ON CONFLICT` |
| `:1443` / `:1456` / `:1489`（`save_layout_draft` / `publish_layout` / `rollback_layout`） | `_get_or_create_config`（`:682-688`）无行锁 |

**失败场景**：管理员 A、B 同时打开同一草稿（revision=5），各自 PUT `expected_revision=5` →
两笔事务都读到 5、都通过校验、都写 `revision=6` → **B 覆盖 A，A 也收到 200**，
A 以为保存成功但内容已消失。两个管理员同时点「发布并替换主推」同理。

**对比证据**：同一个文件的生成去重（`:1638-1646`）用了**正确**写法 ——
`UPDATE ... WHERE active_generation_id IS NULL` + `result.rowcount == 0` 检查。
同样的并发问题在同一个模块里用两种不同策略处理。

`version` 分配与 `_get_or_create_draft` 的竞态还会让 `IntegrityError` 逃出为
**500 `INTERNAL_ERROR`**，而不是可读的 409。

### F6. 金数据 webhook 的 `compare_digest` 非 ASCII 输入导致 500

`backend/app/api/v1/payments.py:297`：

```python
provided = request.query_params.get("secret", "")
if not hmac.compare_digest(provided, expected):
```

`provided` **完全由匿名攻击者控制**。实测 Python 行为：
`hmac.compare_digest('中', 'x')` → `TypeError: comparing strings with non-ASCII characters is not supported`。

**失败场景**：`GET /api/v1/payments/jinshuju/webhook?secret=中` → TypeError → 逃出 handler
→ `main.py` 兜底 exception handler → **500 `INTERNAL_ERROR`**。后果两层：
(1) 任何匿名人都能稳定把这个端点打成 500；(2) 真实的「签名不符」被 500 掩盖，
运维日志里看到的是 TypeError 而不是 `"Invalid signature"`，排障方向被带偏。

**修法方向**：先 `.encode()` 成 bytes 再比，或先校验 `provided.isascii()`。

> `internal.py` 的 GPU 回调也用 `compare_digest`，`provided` 来自 HTTP Header，
> 非 ASCII 同样会抛 —— 值得一起查。

### F7. 凭据在未推送的 commit 里（推送前必须处理）

已核实 `origin/master` **干净**，以下内容尚未泄露，但推送后会进公开历史：

| 位置 | 内容 |
|---|---|
| `backend/tests/test_llm_provider.py:215,265,268` | 真实 `COMMANDCODE_API_KEY` 的**前 37 字符**（`.env` 真值为同前缀 93 字符）——**字面量已打码** |
| `backend/app/services/llm_provider.py:244` | `mask_secret` 的 **docstring 示例**里写了真 key 的前 6 位与后 4 位（**字面量已打码**）——**本次审查首轮遗漏项**，已打码 |
| `frontend/e2e/home-editorial-full-loop.spec.ts:48-49` | 生产管理员明文手机号 + 密码（**已打码**） |
| `docs/home-editorial-verification-2026-10.md:45` | 同上（**已打码**） |
| `docs/evidence/` 截图 | 管理员界面可见 PII |

**处置**：换成明显伪造值 / 环境变量注入，并**轮换生产该管理员账号密码**。
推送前对 `6a8f01c..d6a0b85` 四个 commit 做一次完整凭据扫描。

---

## 3. 值得修但不阻塞

### G1. v2 严格来源校验下的真实 AI 生成失败率待评估

`b5838d1` 把 `HOME_CONTENT_PROMPT_VERSION` 从 v1 升到 v2，并新增了严格得多的来源校验
（`:898-903` 场景必须锚定到某条 expression 的原字幕；`:907-916` `reply_en` 必须实际用到该表达）。
但生成路径（`:575` `chat_json` → `:576` `except AIServiceError`）**没有任何重试**，
不合规直接抛 `DraftGenerationError` 落 `status=failed`。

「可见失败、不静默降级」是**契约明确的设计**（模块 docstring），所以不是实现缺陷。
需要评估的是 v2 后真实 AI 输出的失败率是否可接受 —— 若经常失败，运营侧会不断看到
「生成失败」，而管理员除「重试」外没有出路（重试会重跑一次 AI，同样可能再失败）。

### G2. `createApiClient` 的 GET 缓存 / 在途去重跨两套会话共享

`frontend/src/lib/createApiClient.ts:111-113` 的 `_getCache` / `_inflightGets` 是**模块级**变量，
`lib/api.ts`（用户端）与 `lib/adminApi.ts`（管理端）都调 `createApiClient(...)`，
因此**共用同一份缓存**，缓存键只有 `url`，不含 token / 不含 client 身份。

**命中路径**：`app/(admin)/admin/(shell)/layout.tsx:37` 用
`adminApi<User>("/api/v1/users/me")` 校验管理员；
`app/(main)/profile/page.tsx:141`、`app/(main)/MainLayoutInner.tsx:44`、
`stores/profileStore.ts:58` 用 `api<User>("/api/v1/users/me", {cacheTtlMs: 30_000})` —— 同一 URL。

**失败场景**：同一浏览器先在用户端登录（普通用户 A）→ 打开个人中心，`/users/me` 进 30s TTL 缓存
→ 切到 `/admin` → admin shell 的 `adminApi("/api/v1/users/me")` 命中**用户端缓存**，
**不校验 admin token** → `u.role !== "admin"` → 管理员被弹回 `/admin/login`，
提示「该账号无管理员权限」—— 表现为**「明明是管理员却登不进后台」**，极难自查。

`_inflightGets`（`:134-142`）**无条件**对所有 GET 生效：两个 client 同时请求同一 URL 时
共享同一个 in-flight promise，**只发一次请求、带的是先发起那次的 token**。

**修法方向**：缓存键加 client 身份前缀（`user:` / `admin:`），或 admin client 用独立缓存实例。

### G3. 后端 gunicorn access log 记录了 media URL 的 `?token=` JWT

`frontend/src/lib/api.ts:52-77` 的 `mediaUrl()` 把 access token 拼成 `?token=<JWT>`
（因为 `<audio>`/`<video>` 发不了请求头）。代码注释自己写明「不得写进日志/Referer/分享链接」。

- **nginx 层已防护**：`nginx.conf:14` / `nginx.ssl.conf:11` 的 `log_format` 用 `$uri` 不含 query
- **后端层未防护**：`docker-compose.prod.yml:53-58` 的 gunicorn 用 `--access-logfile -`，
  而 uvicorn 的 access log 走 `get_path_with_query_string`（已核对 `uvicorn/protocols/http/h11_impl.py`：
  `full_path = self.root_path + path` 之外的 query 会拼进日志行）

**后果**：跟读录音播放一次 → 用户 JWT 进容器 stdout → Docker json-file → `docker logs`
→ 日志轮转/外发/备份里长期留存可冒充用户的凭证。token 有效期 30 分钟，但日志留存期远长于此。

### G4. `_place_content` 无布局乐观锁 + 发布到次推静默清空主推位

`home_content_service.py::_place_content`（`:1005-1048`）改的是 `HomePageConfig`
（`:1040-1041` 同时改 `published_layout` 与 `draft_layout`），但 `publish_content`
的乐观锁只校验**草稿** revision（`:921`），**没有校验 `config.revision`**。

**失败场景 A**：管理员 A 在编排页已保存布局草稿（`config.revision=5`，未发布）→ 管理员 B 在
视频详情点「发布并替换主推」→ `_place_content` 读 config → 改 published 并**覆盖 A 的
`draft_layout`** → A 的编排草稿静默消失，无任何提示。
对比：`publish_layout:1456` **有** `config.revision != expected_revision` 校验 —— 同模块两套标准。

**失败场景 B（需产品确认）**：`_layout_without_video`（`:995-996`、`:1020-1021`）先把该视频的
`lead` 清掉，再按 `place` 设位置。若 `place == "secondary"`，lead 被清空后**不补回**
→ **主推位静默变空**。契约 §5「主次不重复」确实要求同一视频不能同时占主次位，
但「发布到次推」顺带清空主推不是这个契约的自然推论。

### G5. 两个新增 e2e spec 依赖 CI 不存在的资源

- `frontend/e2e/home-editorial-full-loop.spec.ts`：12 步串行（`mode: "serial"`），
  依赖真实 admin 账号（`:48-49,181`）和 4 个真实视频 A/B/C/D，**无任何 `test.skip` 保护**
- `frontend/e2e/vocabulary-learning.spec.ts`：依赖真实 ECDICT 词库

CI 的 `npx playwright test --project=chromium`（`ci.yml:236`，无路径过滤）会收集它们
→ **backend e2e job 必红**。对比既有 spec 用 `test.skip()` 保护（`watch.spec.ts` 的约定、
`seed_e2e.py` 播种让它们真跑），新 spec 没走这个约定。

### G6. design-system 与 session-writes 两个不变量，CI 与 pre-commit 都不执行

`frontend/package.json:15` 的 `check` = design-system 检查 + 会话写入检查 + typecheck + lint + format:check。

- `.github/workflows/ci.yml` 的 frontend job（`:136-150`）逐条跑了 format:check / tsc / vitest / eslint，
  **唯独没跑** `check-design-system.mjs` 与 `check-session-writes.mjs`
- `.pre-commit-config.yaml` 同样只有 ruff + prettier + 通用钩子

后果：根 `CLAUDE.md` 把这两个脚本称为「机器执行的不变量」「不许为了让检查变绿而放宽检查器」，
但既没有 CI 也没有 pre-commit 拦 —— **违规可以合入 master**。
两个脚本都是纯 node、无额外依赖，接入成本低。

### G7. 观看页从 1538 行回涨到 1762 行

`app/(main)/watch/[id]/page.tsx` 在 `81a104d`（批 8 抽完 `useWatchChromeBridge` /
`useSubtitleFollow` / `useDeepLink`）是 1538 行，`b5838d1` 后是 **1762 行（+224）**。
该轮抽取成果被新逻辑抵消。该文件目前持有 20+ 个 `useState`、10+ 个 `api()` 调用、
6 个内联子组件。

### G8. e2e 静默放弃了三条用户可感知保证

`b5838d1` 删除了三条 e2e 里显式守护的行为，**且没有在 spec 或
`docs/design-direction-2026-10-20.md` 里记录为产品决议**：

| # | 位置 | 变化 |
|---|---|---|
| A | `mobile-wordcard-drawer.spec.ts:170` | 旧断言「被点的那个词完整落在词卡上方」（`wordBox.bottom <= card.y+1`）被删；旧 §7-7 整条 spec 删除。实现侧 `hooks/useSheetGeometry.ts:60` 的 `Math.max(0, bottom - MIN_SHEET_HEIGHT)`（`MIN_SHEET_HEIGHT` 从 120 提到 240）**在短视口下确实会盖住当前句** —— 旧 spec 曾把这条当「代价」显式刻画 |
| B | `mobile-wordcard-drawer.spec.ts:107-116,209` | 抽屉几何从「顶边不高于当前句卡下沿」改为「不越过 `mobile-tab-bar`」。**没有任何断言保证抽屉不遮当前句** |
| C | `mobile-watch-chrome.spec.ts:116-137` | 旧断言「不滚动时当前句卡整块在视口内 + ≥3 条文稿完整可见」整条消失，改为先 `scrollIntoViewIfNeeded()` 再断言。**首屏可见性现在零覆盖** |

次要：`mobile-wordcard-drawer.spec.ts:185` 抽屉动作行「≥3 个按钮」的数量下限改成
「遍历现有按钮检查高度 ≥44px」—— **按钮被删到一个也照样通过**。

> **反向结论（不是问题）**：`home-sort.spec.ts` / `home-sort-truth.spec.ts` 被删，
> 但排序功能仍在（`HomeFeed.tsx` 的 `Select` + `usePlatformFeed.ts`），
> 覆盖已由 `home-feed.spec.ts:134-180` 等价接手 —— 是**重定位**不是缺口。
> 整个 e2e 改动的方向是「真实 UI 改版跟进」：`waitForTimeout` 净减少、
> 新增的 `expect.poll` 替代硬等待、`playwright.config.ts` 未被放宽
> （无 `expect.soft`、无 retries 提升）、`mockMic` 从假 MediaRecorder 换成真实 AudioContext。

### G9. `daily` 练习端点在用户请求路径上全表扫描题库

`daily_recommendation_service.py:103-109`：`select(ExamQuestion, ExamPaper).join(ExamPaper)` 后 `.all()`
—— 全量拉取所有题目，而 `ExamQuestion.passage` 是 `Text` 整篇文章（`models/exam_test.py:61`）。
生产题库规模：cet4 62 + cet6 63 + ky1 17 + ky2 17 套，每题带 passage。

`GET /discovery/daily` 与 `GET /discovery/practice-summary`（`:38`）都在**用户请求**路径上，
每次把整库题目拉进内存做分组，才挑出 1 组。限流 30/minute（按 user）。
对比：`exam_service.py:170` 的全表扫描在批处理路径上，可接受。

**修法方向**：分组所需字段与 passage 分离，只在展示题目时按 id 取 passage；或加按 level 的物化缓存。

### G10. 支付补漏轮询只覆盖 72 小时窗口

`jinshuju_service.py:498` 的补漏轮询只拉最近 `jinshuju_sync_lookback_hours`（默认 72 小时），
beat 每 5 分钟跑一次。webhook 是秒级主路径，轮询是补漏 —— 设计正确。

**残留局限**：若 webhook 推送丢失 **且** 服务停机超 72 小时，那笔订单会被永久漏掉 ——
没有「扫未处理订单」的兜底任务，也没有按 serial_number 补查的入口。线上表现是
用户付了钱但会员没到账，只能人工处理。严重度低（两个条件须同时成立），但值得知道上限在哪。

### G11. GPU 转写回调端点零测试覆盖

`backend/app/api/v1/internal.py:71` 的 `POST /api/v1/internal/transcription/callback` 是
全仓唯一走共享密钥鉴权（不挂 JWT）、且会写字幕并入队 tail 的端点。
已核实 `backend/tests/` 下**零个测试**打这个 URL。

值得肯定的是**实现本身是对的**：`secrets.compare_digest` 常量时间比较、Redis 去重锁
（`SETNX` + TTL）、锁内 `db.refresh` 二次读状态防 TOCTOU、Redis 挂时 fail-closed 返回 503
让 GPU worker 重试、`status != processing` 时幂等忽略。

风险在于这些不变量**没有被任何测试钉住** —— 以后谁改坏都没有机器能发现。建议补：
① 密钥错/缺 → 401；② Redis 锁不可用 → 503；③ `status != processing` → 幂等 acknowledged
且不写字幕不重复入队；④ 正常回调 → 写入 Subtitle + 入队 tail；⑤ 并发两次 → 只有一次真写入。

### G12. admin_home_content 的 5 个写路径端点未进 403 越权测试

`backend/tests/test_home_content.py:239` 的
`test_non_admin_cannot_read_or_write_admin_home_content` 逐个断言 403，但只列了 7 个路由。
`admin_home_content.py` 实际有 12 个端点，漏掉 5 个：
`PUT /videos/{id}/draft`、`POST /videos/{id}/publish`、`POST /videos/{id}/restore-draft`、
`POST /layout/publish`、`POST /layout/rollback`。

严重度低（5 个端点都用同一个 `Depends(get_admin_user)`，鉴权同质），但补齐成本极低
（往 `calls` 列表加 5 行），且漏掉的恰好是**写路径** —— 越权写入比越权读取后果更重。

### G13. 验证文档引用的 `.log` 证据被 gitignore 挡住

`docs/home-editorial-verification-2026-10.md` 多处（`:173, :175, :206, :226, :229, :254, :273-278,
:311, :390-391`）把 `docs/evidence/home-editorial/*.log` 当作验证证据引用
（`14-e2e-full-loop.txt`、`15-e2e-full-loop-final.txt`、`12-homepage-console.txt`、
`11-real-generation-probe.txt`）。但 `.gitignore:50` 的 `*.log` 全局规则让它们无法入库 ——
已核实 `git ls-files docs/evidence/` 下无任何 `.log` 被跟踪。

**后果**：克隆仓库后这些证据引用全是死链，验证报告无法自证。
**修法**：改 `.txt`（同目录 `13-nextjs-dev-issue-evidence.txt` 已是 `.txt`，风格一致），
或在 `.gitignore` 里对 `docs/evidence/` 加例外。

### G14. 设计系统门禁漏掉无色阶 white/black 与任意值 hex

`frontend/scripts/check-design-system.mjs` 的规则 2 只拦「色族名-色阶」形态
（`PALETTE` 22 个色族 × `SHADE` 10 档），因此有两类逃逸：

1. **无色阶的 white/black** —— 62 处 `bg-white` / `text-white` / `border-white` / `bg-black`
   （分布 `app/(admin)/admin/(shell)/settings/page.tsx:35`、`admin/login/page.tsx:97`、
   `app/(main)/upgrade/page.tsx:280,291` 等）。多数是「深底上的白字」（`bg-brand-500 text-white`），
   语义合理；但 `upgrade/page.tsx:280,291` 的 `bg-white` 是二维码底板（必要），
   `admin/settings:35` 的 `bg-white` 是暗色模式下的开关滑块（观感问题）。
2. **任意值** —— `border-[#2c2c2c]` / `border-[#4a4a4a]`，全仓仅 2 处，在
   `components/ui/Button.tsx:33` 的 `ghostDark` 变体里。
   `globals.css` 已有语义 token `--color-surface-dark-soft`（`#1c1c1c`）可替代。

另：规则 4 只扫 `page.tsx` 不扫组件，所以 `components/home/HomeEditorialHero.tsx:25` 的
`<h1>` 不受约束 —— 两套页头并存（`ui/PageHeader` vs `HomeEditorialHeader`）。

> **反向结论（不是问题）**：`b5838d1` 删掉的两条白名单是**收紧**而非放宽。
> 那两个文件已无 `<h1>`（首页 hero 搬到组件里，频道页改用 `ui/PageHeader`），
> 白名单条目在删除前就已是死条目；删掉后若重新写回 `<h1>` 反而会被拦下。
> 脚本当前 4 条规则全绿。

### G15. service → api 反向依赖与循环 import（合并 F5 的分层部分）

见 §1.1「越界 3 类」第 2 条。`channel_service.py:25` 是本次引入的，
它迫使 `browse.py:72-75` 与 `ranking_service` 惰性 import。根因可消除（直接调
`services/video_card.serialize_video_card`）。

另：`api/dependencies.py:18` 的 `_to_aware_utc` 在 `services/jinshuju_service.py:77`
**重复实现**了一遍 —— 违反「一条事实只放一个家」。

### G16. 未跟踪垃圾文件

工作区当前未跟踪：`.agents/`（`.claude/skills/` 的旧副本，`SKILL.md` 里指向已不存在的
`.Codex/reference/kill-ports.md`；另含 `tmp/pytest-full.log`、`commandcode-models.json`、
`fetch_share.js`、`parse_share.js`、deploy skill 副本）、`backend/.tmp-probe-ch.py`、
`backend/.tmp-probe-yt.py`、`channels-before.yml`（Playwright 快照，放在仓库根）。

都没入 git，但 `.gitignore` **没覆盖 `.agents/`** —— 随时可能被误 add（且内含 deploy skill 与脚本）。

### G17. prod compose 缺 10 个 `JINSHUJU_*` 变量（上线前必须补）

`docker-compose.prod.yml` 里 `JINSHUJU_*` 出现 **0 处**。prod compose 的 `environment` 是
白名单式（无 `env_file`），所以这 10 个变量在生产全部取不到值 → **支付链路无法启用**。

当前 fail-safe 生效（`jinshuju_enabled` 默认 false → `jinshuju_service.py:492` 早退、
webhook 404、站内 `payments_enabled` 因 ICP 仍关闭），所以**不是正在溢出的敞口**，
而是「上线前必须补的待办」。

涉及变量（`core/config.py:175-190`）：`JINSHUJU_ENABLED` / `ACCESS_TOKEN` / `FORM_TOKEN` /
`WEBHOOK_SECRET` / `TIER_FIELD` / `PHONE_FIELD` / `SYNC_LOOKBACK_HOURS` / `PURCHASE_URL` /
`PURCHASE_TOKEN_SECRET` / `PURCHASE_TOKEN_TTL_MINUTES`。

> `JINSHUJU_PURCHASE_TOKEN_SECRET` 为空时会回退 `JWT_SECRET`
> （`jinshuju_service.py:93-95`）。生产建议显式设置独立密钥 ——
> 同一密钥保护两个不同用途，违反密钥分离。

### G18. 上线前实测 `x_field_1` 是否真的透传进金数据 entry

`docs/jinshuju-payment-integration-2026-10.md`「已知限制 / 待办」明确记录：
「`x_field_1` 透传仍需一单实测」—— 收款页已确认接收 URL 参数（SSR `searchParams` 里有
我们塞的 token），但**「付款后写进 entry」这一步还没被真实订单验证过**。

`x_field_1` 是站内购买的主路径（`jinshuju_service.py:402` 的 `verify_purchase_token`），
它不工作则整条 B 流程（免手机号、自动开通）不通，只剩手机号兼容路径。

上线前必须跑通一单真实小额支付，验证：① entry 里 `x_field_1` 确实带上签名 token；
② `verify_purchase_token` 能解析出 `user_id`；③ 订单落到正确的账号上。

> 注：`entry["token"]` 字段名**已实测确认**（`docs/jinshuju-payment-integration-2026-10.md:37`
> 记录 2026-10-18 真实 API 读取），真正未验证的只有 `x_field_1` 透传这一环。

---

## 4. 已验证成立的部分（不是问题，避免重复劳动）

| 项 | 结论与证据 |
|---|---|
| Router 注册 | `main.py:308/311/314` 三个新 router 全注册，`/api/v1` prefix |
| Model re-export | `models/__init__.py:12/13/27` 三个新模型按依赖序插入 |
| Celery 接线 | `celery_app.py:130/132` import + `:80-89` 两项 beat 调度；生成任务走默认 `celery` 队列，**未误路由到 GPU 队列** |
| 迁移链 | 79 revisions，单一 head `m4n5o6p7q8r9`，线性链完整（mergepoint 正常，历史 7 个 head 已收敛为 1） |
| 列一致性 | 新增 4 张表（`home_content_drafts` / `home_content_revisions` / `home_page_config` / `jinshuju_payments`）与 migration **完全一致** —— alembic autogenerate 对比实际 Postgres，0 差异 |
| 发布边界不可绕过 | 公共读只走 `resolve_public_page` → `config.published_layout`（`:1334-1348`）；draft 只在 admin 接口出现；公共接口无 `?draft=true` |
| 公共读不走缓存 | `home_editorial.py:19-27` 无 `@cached`；旧兜底 `browse.py:37/155` 仍走 300s TTL + 失效链路 —— 符合契约 |
| 指纹覆盖重排/重断句 | `compute_source_fingerprint`（`:175-196`）含 `subtitle.id` + `sentence_index` + `start/end(3位小数)` + `text_en` + `text_zh`；**所有**重排写入口（`subtitle_edit_service.py:306/349/400/459/480/556`）都改 `sentence_index` → 重排必然改指纹 |
| 主推失效次推提升 | `:1224-1239`：按 lead → secondary 顺序取第一个 `is_valid` 的；全失效返回 `None` → `{"editorial": null}` → 前端退回旧兜底 |
| 生成去重原子占位 | `:1638-1646`：`UPDATE ... WHERE active_generation_id IS NULL` + `rowcount == 0` |
| 写回三重校验 | `:1760`（generation_draft_revision）、`:1768`（source_fingerprint）、`:1736`（generation_id）—— 逻辑存在，但有 TOCTOU（见 F4） |
| 支付金额校验 | `:411-419` **精确相等**（`amount_fen != price_fen`），不是「大于等于」→ 0.01 元订单开不出会员 |
| 支付 token 签名 | HMAC-SHA256 + 16 字节截断 + `compare_digest` + TTL 校验（`:98-124`）；不落明文 user_id |
| 支付幂等 | 幂等键 `entry_token` + 唯一索引；`_grant_and_mark_applied` 用 `with_for_update` 防并发重复延期 |
| webhook 不信任推送内容 | `payments.py:322-325` → `payment_tasks.py:31` 按 `serial_number` 重新拉取核对 |
| 退款处理 | `jinshuju_service.py:389-395` 标 REFUNDED，不自动回收已发放会员（人工决定）—— 契约明确 |
| 配置 fail-closed | 未知 `ENV` 拒绝启动；非 dev 强制 `JWT_SECRET` + `DATABASE_URL`；production 强制 LLM key + `REDIS_URL` + `CALLBACK_SECRET`（`config.py:351-400`） |
| 新配置无静默降级 | `JINSHUJU_*` 默认全 `False`/空，每个入口有显式开关；LLM key 空时 `AIService.client=None` → 调用时响亮失败，**不返回假分值** |
| AI 调用收口 | 全仓 `import openai` 仅 `ai_service.py:7-8` + `translation/__init__.py:20`（均在 ruff 白名单内）；`home_content_generation.py` 走 `get_ai_service().chat_json(task=TASK_EDITORIAL)`；`daily_recommendation_service` / `library_service` / `channel_learning` / `discovery_service` **零 AI 调用**。**INV-005 未被违反** |
| 错误 envelope | 新 router 无裸 `{"detail":...}`、无非字符串 detail 的 `HTTPException`。`alipay`/`wechat` 回调的 200 错误 body 与 `jinshuju` webhook 的 `{"code":0}` 是**第三方协议要求**（金数据要求 2 秒内 2XX，返回 5xx 会烧掉 6 次重试），非契约违规 |
| 异步 SQLAlchemy | 未发现漏 `await`、未发现 MissingGreenlet。`expire_on_commit=False` + 显式 `selectinload` 用得对；`home_content_generation.py` 零 DB 访问，ORM 行在 session 关闭后使用安全（列已加载） |
| 两套会话未混用 | `app/(admin)/**` 与 `components/admin/**` 零处调用用户端 `api()`；唯一的 `mediaUrl` 交叉使用显式传 admin token |
| 裸 fetch 合理性 | 6 处裸 fetch 全是正当例外：`useShadowing.ts:92`（FormData 上传）、`analytics.ts:102`（beacon）、`authStore`/`adminAuthStore` 的 logout/refresh（不能被 401-refresh 递归套住）、`WaveformCompare.tsx:200`（二进制） |
| 无注入面 | 全仓无 `shell=True`、无裸 SQL 字符串拼接（`execute(f"` / `text(f"`） |
| 凭据未入库 | `backend/.env`、`backend/youtube_cookies*.txt` 均未被 git 跟踪，且已在 `.gitignore` |
| 前端契约一致 | `types/homeContent.ts` ↔ `schemas/home_content.py` 逐字段一致（10/10 公共结构 + 全部 draft/generation/layout 结构）；`types/index.ts::VideoCard` ↔ `VideoResponse` 40 字段全对齐 |
| 暗色模式 | `globals.css` 的 `:root` 与 `.dark` 变量成对齐全（38 vs 38，两侧差集为空）；未发现组件写死背景色导致暗色下不可读 |
| e2e 改动方向 | `waitForTimeout` 净减少；新增的 `expect.poll` 替代硬等待；`playwright.config.ts` 未被放宽（无 `expect.soft`、无 retries 提升）；`mockMic` 换成真实 AudioContext；删除的两个排序 spec 由 `home-feed.spec.ts` 等价接手 |

---

## 5. 复核后证伪的结论

审查过程中提出的若干疑点，经独立复核**不成立**。记录在此，避免后续重复排查。

| 疑点 | 复核结论 |
|---|---|
| 「测试文件泄露了完整 API key（CRITICAL）」 | 是真实 key 的**前 37 字符**片段（`.env` 真值 93 字符）；`origin/master` 干净 → 是**推送前**问题，非已泄露 |
| 「镜像 cookie 缺 `Secure`，生产仍走明文」 | `nginx.ssl.conf:44-48` 有 80→443 强制跳转，只在纯 HTTP 的 `nginx.conf` 配置下暴露 |
| 「`entry["token"]` 字段名未经验证，可能整条链路失效」 | `docs/jinshuju-payment-integration-2026-10.md:37` 记录 2026-10-18 真实 API 读取已确认该字段 |
| 「`dictionary_words` 每次请求 1.46s CPU」 | 实测：首次 2862ms（含索引构建），**第二次 0.1ms** —— `get_index()` 有进程级缓存 + 锁，那 1.46s 是一次性构建成本 |
| 「`discovery.py` 删除词单越权」 | `library_service.owned_set()`（`:46-52`）先按 `user_id` 校验归属并加行锁，安全 |
| 「`nginx $request_uri` 进 cache key 是本次引入的风险」 | 是 nginx **默认** cache key（本次只加 `public-media-v2:` 前缀），且新增的 `proxy_no_cache $arg_token` 恰好**阻止**带 token 的 URL 落盘 —— 是修复不是引入 |
| 「迁移链有多个 head（5 个）」 | 解析脚本未处理多父 mergepoint。`alembic heads` 权威输出为**单一 head** |
| 「prod compose 的 `frontend: service_healthy` 脆弱」 | `depends_on` 用了 `service_healthy` 且有 healthcheck 定义，配置合理 |
| 「11 个 spec 在 CI 恒 skip」 | skip 是**数据依赖**（无视频/无字幕/无题库），既有约定；CI 有 `seed_e2e.py` 播种（official + published + ready + 双语字幕） |
| 「`docs/evidence/` 截图含管理员 PII」（**处置期复核证伪**） | 逐张复核 `docs/evidence/home-editorial/` 全部 7 张管理端截图，**没有手机号**：管理端壳的右上角渲染的是角色名「管理员」，不是手机号。代码层佐证：`frontend/src/app/(admin)/admin/(shell)/layout.tsx` 与 `adminAuthStore` 里**没有任何 phone 字段**。手机号只出现在 `users/page.tsx:387`（用户管理）与 `orders/page.tsx:215`（订单管理），而这两页**不在**已入库的证据截图里 —— 管理端设置页 `settings/page.tsx:370` 还专门做了 `MASK_PHONE` 掩码。**风险方向改为**：今后若再截「用户管理 / 订单管理」页入库，会带进真实手机号 |
| 「redeem 码流程有 ABBA 死锁（`admin_service` 与 `redeem.py` 锁序相反）」（**处置期复核证伪**） | 把全仓 37 处 `with_for_update` 逐条列出后，redeem 这条链的锁序**其实一致**：`refund_redeem_code`（`:659`→`:675`）与 `redeem.py`（`:171`→`:196`）**都先 RedeemCode 再 User**；`change_user_plan`（`:597`）**只锁 User**，其函数体（585-617）从不碰 RedeemCode；`revoke_redeem_code`（`:632`）**只锁 RedeemCode** —— 单锁路径不构成环。**改成「User → RedeemCode」反而会引入真 ABBA**（与 `redeem.py` 相对）。此处的正确动作是**保持现状**，别去「修」它 |

---

## 6. 处置顺序建议

1. **恢复 CI 绿**（F1 真修 mypy、F2 同步测试 fixture、G5 给新 e2e 加 skip 保护或排除）
2. **修并发与死锁**（F3 ABBA 锁序、F4 写回 TOCTOU、F5 读-改-写 → 条件 UPDATE）
3. **推送前处理凭据**（F7）
4. **补边界防护**（F6 compare_digest、G8 越权删除缺 user_id 条件、G11 GPU 回调零覆盖、G12 5 个写路径 403）
5. **接入门禁**（G6 两个不变量进 CI + pre-commit）
6. **其余**（G2-G4、G7-G18 按优先级排队）

可勾选的逐条清单见 `docs/code-review-2026-10-20-checklist.md`。

**处置状态（2026-10-21 复核）**：

| 分组 | 状态 |
|---|---|
| 第 1 组 · 恢复 CI 绿 | ✅ 全完成（基线 51→45；v2 fixture 同步 + 死代码接线；e2e skip 保护） |
| 第 2 组 · 并发 / 死锁 | ✅ 全完成（锁序统一 + 真 Postgres 回归测试；条件 UPDATE + rowcount → 409） |
| 第 3 组 · 凭据 | ⚠️ 3.1 / 3.1b / 3.4 ✅；3.2 仓库部分 ✅，**生产密码轮换待人工** |
| 第 4 组 · 边界防护 | ✅ 全完成（compare_digest bytes；internal_callback 10 测试；12 admin 端点 403） |
| 第 5 组 · 门禁 | ✅ 全完成（CI / pre-commit 接入；规则 5/6；白名单输出带理由） |
| 第 6 组 · 其余 | ✅ 6.1 / 6.2 / 6.4 / 6.7 / 6.8 / 6.9 / 6.10；⚠️ 6.3-A ✅、6.3-B **待产品决议**；⏳ 6.5 待决议、6.6 延后、6.11 需真实环境数据 |
| 第 7 组 · 上线前 | ⚠️ 7.1 compose ✅、**生产 `.env` 待人工**；⏳ 7.2 真实小额支付实测 |
| 第 8 组 · 文档漂移 | ✅ 8.1 / 8.2 / 8.3；8.4 单开一轮收敛 |

---

## 7. 文档漂移（代码为准，文档需更新）

| # | 位置 | 漂移 |
|---|---|---|
| 1 | `backend/app/models/jinshuju_payment.py:5-6` | docstring 仍写「按买家手机号找到 SeeWord 账号」，与现在的 **token 优先**路径不符（手机号已降级为兼容分支） |
| 2 | `docs/jinshuju-payment-integration-2026-10.md:53-55` | 同样把手机号写成主路径；`:31` 才补一句「B 流程默认不需要它」 |
| 3 | `docs/home-editorial-content-implementation-2026-10.md` §2 | `home_content_drafts` 列清单缺 `generation_coverage`（实际存在，`models/home_content.py:106`，另有独立迁移 `m4n5o6p7q8r9_add_home_generation_coverage.py`）；§4「生成状态机」也未提该字段 |
| 4 | `backend/app/core/errors.py:68-69` | `ErrorCode.HOME_CONTENT_TIMEOUT = "TIMEOUT"`、`HOME_CONTENT_CONFLICT = "CONFLICT"` —— **枚举名与实际 code 值不一致**，前端若按 code 字面量判断会踩坑 |
| 5 | `docs/home-content-operation-guide-2026-10.md:35` | 说「没有字幕依据的场景不会显示」—— 代码侧 `home_content_service.py:490-499` 会把无锚点场景照样解析出来（`sentence=None`），靠前端 `homeScenarios.ts:17-27` 的 `validSentence` 过滤。**过滤责任在文档描述的前端** |
| 6 | `frontend/CLAUDE.md:35` | 说「`page.tsx` 不得自写 `<h1>`——用 `ui/PageHeader`」。现状：首页走 `components/home/HomeEditorialHero.tsx` 的 `HomeEditorialHeader`（自绘 `<h1>`），**不是** `ui/PageHeader`；且组件里的 `<h1>` 不受规则 4 约束 |
| 7 | 根 `CLAUDE.md` 的路由清单 | 已过时：`(main)` 下现有 20+ 个子 `layout.tsx`；`forgot-password` / `onboarding` / `set-password` 各自有 `layout.tsx`；`app/(main)/browse/page.tsx` 已改为 `browse/route.ts` 307 重定向到 `/` |
| 8 | 根 `CLAUDE.md` 提到的 `backend/app/services/home_content_service.py` 行数 | 该文件已 1877 行，是全仓最大文件；契约文档未提及它已是最大的单点 |

---

## 8. 本次审查的局限

- **未执行**：`npx playwright test`（需起 dev 栈）、`alembic upgrade head`（未实际执行迁移）、
  生产环境核验、`pip-audit` / `npm audit`（需联网）、真实金数据订单。
- **并发结论来自静态分析**：F3/F4/F5 的复现依赖真实并发时序。F3 已由审查者在真实
  Postgres 上复现（为扩大窗口在 B 路径插入了一次 `await asyncio.sleep`，
  标注为「真实存在的 await 点」）；F4/F5 建议补并发压测复现。
- **本地 DB 存量漂移未清**：alembic autogenerate 对比实际 Postgres 时发现存量表有 29 项
  历史漂移（老表未删、索引名不同、FK 缺 `ondelete`、注释差异、`server_default` 漂移）。
  这些**与本次改动无关**（新增 4 张表 0 差异），但其中 6 处 `server_default` 因
  `migrations/env.py` 未开 `compare_server_default`，autogenerate **永远发现不了**。
  建议单独开一轮 schema 收敛。
- **审查期间工作区被提交**：`b5838d1` / `86f9fa3` / `d6a0b85` / `6a8f01c` 四个 commit 在
  审查过程中产生（首个 commit 之后）。所有 diff 结论基于 `6a8f01c..d6a0b85`。

**处置期补充（2026-10-21）**：

- `pytest tests/` 全量跑通：**1265 passed, 16 skipped, 0 failed**（两次全量复核；期间一次
  `test_channels_api.py::test_subscriptions_carry_continue_video_and_unlearned_count` 单发失败，
  隔离重跑与全集重跑均通过 → 确认为 flake，与改动无关）。
- `npm run check` 全绿（design-system 6 规则 + session-writes + tsc + eslint + prettier）。
- `mypy app/ --ignore-missing-imports` 差集为空（基线 45 行，CI 同命令复核）。
- 金数据并发回归测试在真 Postgres 上跑通（40/150 轮 0 死锁，只发 90 天）。
- 工作树文本文件全量扫描真实 `COMMANDCODE_API_KEY` 前缀/后缀：0 命中。
- `pip-audit` / `npm audit` 仍**未执行**（需联网）；`alembic upgrade head` 生产迁移仍未实际跑。
