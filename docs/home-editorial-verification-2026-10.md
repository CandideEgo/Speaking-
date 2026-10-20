# 首页编辑内容 · 独立验证报告（2026-10-20）

状态：**最终版（已包含实现者 dev-only abort 修复后的确认轮，2026-10-20 08:45 +08:00）**。
验证者：`verifier`（独立于 T1–T4 实现者，不修改实现代码）。任务：共享任务 `task-5`。
口径来源：`docs/home-editorial-content-execution-plan-2026-10.md` §10/§11 与
`docs/home-editorial-content-implementation-2026-10.md` §9；本报告只记录**实测**结果，
跑不了的检查写「未执行」并给出原因。

> 最终确认轮包含：实现者修复 dev-only abort（`frontend/src/app/(main)/page.tsx` 模块级共享
> 请求 + `cancelled` 标志）与 390 版式修正（`user-ui.css` 手机端隐藏 section-note）之后，
> 从**三表 0 行干净基线**重跑 full-loop e2e（12/12）、6 轮 console 探针、旧首页回归（25 passed），
> 并重新生成全部 01–10 交付截图。修复前的那轮 12/12 与 AI 草稿路径日志保留在 14 号证据里。

## 0. 结论摘要

| 项目 | 结果 |
|---|---|
| 管理员「选 B → 编辑/预览 → 发布替换主推 → 恢复上一版」闭环 | **可用**，真实后端 + dev 代理；干净基线最终运行 **12/12 passed（35.9s，1 worker）**；修复前复用 AI 草稿的运行也是 12/12（36.6s） |
| 真实 AI 生成（本任务授权一次） | **succeeded**：`minimax/minimax-m3.1-flash:free`，110.45s，`usage=null`（`chat_json` 不返回 token 统计），无错误码 |
| dev overlay「1 Issue」/ ERR_ABORTED | **修复后已消除**：6 轮探针中「直接加载首页」3/3 轮 `requestfailed=0`、`console.error=0`、`pageerror=0`、`http>=400=0`、dev 徽标不出现；仅探针主动「导航离开」的 3 轮有预期内的导航 abort（真实离页） |
| 首页对普通用户是否泄露草稿 | **不泄露**：公共响应无 `draft`、无草稿标题/反馈；草稿保存/生成不改变线上 |
| 权限 | 非管理员访问 11 个 `/admin/home-content/*` 端点全部 **403**；匿名 401/403 |
| 乐观锁 | 过期 `expected_revision` → **409 `HOME_CONTENT_REVISION_CONFLICT`**，提示「请刷新」 |
| 来源变化失效 | 改一句真实字幕 → 公共卡立即失效（次推提升）、发布 **422 `HOME_CONTENT_SOURCE_CHANGED`**；原样改回后恢复 |
| 下线视频与回滚 | A 下线后旧卡不出现；「恢复上一版」**409 `HOME_CONTENT_ROLLBACK_INVALID`** 并说明原因；复原 A 后恢复成功 |
| 互动点击是否发 AI/接口请求 | **零请求**（点击前后对比 `request` 事件，只切本地 state） |
| 收词/定位/跟读/片段时长参数 | 全部命中真实字幕与 `watchEntry`；片段显示服务端解析的真实秒数 |
| 1440 / 390 / 320 横向溢出 | 均无（`scrollWidth ≤ innerWidth`，`.home-discovery` 同断言）；390 卡片说明文案已按修复隐藏，无单字吊尾 |
| 后端门禁 | 新套件 **77 passed**；受影响既有套件 **83 passed**；ruff check/format 全绿 |
| 前端门禁 | `npm run check` 全绿（0 error）；单测 **272 passed / 22 files** |
| 旧首页三件套（未发布编排状态） | 最终清理后 **25 passed（8.5s）**（含实现者 `home-editorial.spec.ts`） |
| mypy baseline 门 | HEAD 上有 **4 条既有无关错误**（`exam_subjects.py` / `account_tasks.py`），未改基线 |
| 未发现阻塞性功能缺陷 | 1 条 dev-only 发现已由实现者修复并复验通过（§9.1）；另有 2 条低/信息级说明（§9.2–9.3） |

## 1. 环境与基线事实（验证时实测）

- 时间：2026-10-20 07:18–08:45 (+08:00)；`master` @ `6a8f01c`，工作区本来就有**大量与本功能无关的未提交改动**（另一个 agent 会话在改 LLM provider 等），本验证未执行任何 git 写操作。
- 后端：`http://localhost:8000`，`backend/.venv/Scripts/python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000`（**无 `--reload`**；进程 PID 50968 启动 57628，未重启/未杀）。`/health` = `{"status":"ok","environment":"development","components":{"database":{"status":"ok"},"redis":{"status":"ok"}}}`。
- 前端：`:3000` `next dev`（`/api`、`/media` rewrite 到 :8000 仅 dev）。
- Docker：`speaking-db-1` / `speaking-redis-1` Up；dev 库 `seeword` `alembic_version = m3n4o5p6q7r8`（head），`home_content_drafts / home_content_revisions / home_page_config` 三表存在。
- 数据：`videos=49`，其中 `is_published & is_official & status='ready'` = 49。
- 干净基线：三表 **0 / 0 / 0**；`GET /api/v1/browse/home-editorial` = `{"editorial": null}`；`GET /api/v1/browse/featured?limit=6` 首条 = `A = 28091082-12e9-47dd-ab0c-8533e3bc27a8`（Learn English with Bob the Canadian，A2，218 句字幕，720p 本地媒体）。
- 候选 B = `8f1f8f1a-8f7e-4b18-b740-ff684db20d5a`（TED《Inside the Mind of a Master Procrastinator》，B2，279 句，720p）。
- 次推真实视频：C = `fd0bed6c-…`（English with Lucy，B1，168 句）、D = `63288cd3-…`（CNBC，C1，187 句）。
- 管理员：`15580607003 / AdminPass123`（`POST /api/v1/auth/phone-login`，role=admin）；普通用户：`e2e/helpers.ts::registerUserViaApi`（dev 短信码 `1234`）现场注册。

## 2. 后端验证（backend/，全部带 `PYTHONUTF8=1`，`backend/.venv/Scripts/python.exe`）

### 2.1 新增套件

```powershell
cd backend
$env:PYTHONUTF8=1
.\.venv\Scripts\python.exe -m pytest tests/test_home_content.py tests/test_home_content_generation.py -q
```

真实输出摘要：

```text
tests\test_home_content.py .......................                       [ 29%]
tests\test_home_content_generation.py .................................. [ 74%]
....................
====================== 77 passed, 38 warnings in 14.61s =======================
```

### 2.2 受影响既有套件

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_discovery_api.py tests/test_browse_feed.py `
  tests/test_response_contract.py tests/test_architecture_invariants.py tests/test_videos.py -q
```

```text
collected 83 items
tests\test_discovery_api.py ...........   [ 13%]
tests\test_browse_feed.py ..........      [ 25%]
tests\test_response_contract.py ............. [ 40%]
tests\test_architecture_invariants.py ......................... [ 71%]
tests\test_videos.py ........................ [100%]
====================== 83 passed, 83 warnings in 23.20s =======================
```

### 2.3 ruff

```text
.\.venv\Scripts\python.exe -m ruff check app/ tests/      -> All checks passed!  (exit 0)
.\.venv\Scripts\python.exe -m ruff format --check app/ tests/ -> 285 files already formatted (exit 0)
```

### 2.4 迁移（独立测试库，不碰 dev 库）

```powershell
docker exec speaking-db-1 psql -U seeword -d postgres -c "DROP DATABASE IF EXISTS seeword_htest WITH (FORCE);"
docker exec speaking-db-1 psql -U seeword -d postgres -c "CREATE DATABASE seeword_htest;"
cd backend
$env:PYTHONUTF8=1
$env:DATABASE_URL="postgresql+asyncpg://seeword:seeword_dev@localhost:5432/seeword_htest"
.\.venv\Scripts\python.exe -m alembic upgrade head
.\.venv\Scripts\python.exe -m alembic downgrade -1
.\.venv\Scripts\python.exe -m alembic upgrade head
.\.venv\Scripts\python.exe -m alembic current
```

```text
upgrade head      : ... Running upgrade j1i2n3s4h5u6 -> m3n4o5p6q7r8, add home editorial content tables
                    (drafts / revisions / page config)                          exit 0
downgrade -1      : Running downgrade m3n4o5p6q7r8 -> j1i2n3s4h5u6, ...       exit 0
upgrade head (2nd): Running upgrade j1i2n3s4h5u6 -> m3n4o5p6q7r8, ...          exit 0
current           : m3n4o5p6q7r8 (head)
```

dev 库核对：

```text
select version_num from alembic_version;            -> m3n4o5p6q7r8
\dt home_*                                          -> home_content_drafts / home_content_revisions / home_page_config
```

### 2.5 mypy baseline 门（如实记录，未改基线）

```powershell
.\.venv\Scripts\python.exe -m mypy app/ --ignore-missing-imports   # CI 口径
```

- 原始输出 74 条 `error:`，去重后 53 个 `file:code` 对；`backend/.mypy-baseline` 51 行。
- 与基线相比「新增」的只有 4 个对，全部落在**与本次无关**的既有文件：
  - `app/core/exam_subjects.py:arg-type`
  - `app/core/exam_subjects.py:return-value`
  - `app/tasks/account_tasks.py:arg-type`
  - `app/tasks/account_tasks.py:no-any-return`
- 另有 2 个基线行在 HEAD 上已不存在（`app/api/v1/browse.py:attr-defined`、`app/services/recommendation_service.py:arg-type`），属既有漂移。
- **没有**任何 `home_content` / `home_editorial` / `admin_home_content` 文件出现在错误列表里；**没有**修改 `.mypy-baseline`。

## 3. 前端验证（frontend/）

### 3.1 门禁

```powershell
cd frontend
npm run check
```

真实输出摘要（exit 0）：

```text
check-design-system：4 条规则全部通过（336 个文件）
check-session-writes：2 条规则通过（336 个 .ts/.tsx）
npm run typecheck -> tsc --noEmit   （无输出）
npm run lint -> eslint src/ e2e/    （0 errors，3 个既有 warning：
  watch/[id]/page.tsx useCallback deps、global-error.tsx 未用 eslint-disable、useCoachMark deps）
npm run format:check -> All matched files use Prettier code style!
```

### 3.2 单测

```powershell
npm run test:unit
```

```text
Test Files  22 passed (22)
Tests       272 passed (272)
Duration    592ms
```

### 3.3 新增全链路 spec（真实后端 + dev 代理，核心链路不 mock）

```powershell
npx playwright test e2e/home-editorial-full-loop.spec.ts --project=chromium --reporter=list
```

- 修复前（复用真实 AI 草稿做编辑基底）：**12/12 passed（26.2s / 36.6s 两轮）**，日志
  `docs/evidence/home-editorial/14-e2e-full-loop.log`（含 `reused_generated_draft:true`）。
- **最终确认轮（实现者 dev-abort 修复后，从三表 0 行干净基线起跑）**：
  `12/12 passed (35.9s)`，日志 `docs/evidence/home-editorial/15-e2e-full-loop-final.log`。
  该轮 `reused_generated_draft:false`（不重复消耗真实额度），走 spec 内置的「真实字幕手写草稿」
  兜底路径，同时覆盖了任务原文 §11 第 7 条「AI 不可用时人工编辑也能发布」。
- spec 覆盖：基线旧兜底 → 管理员发布 A（含换说法/场景/2 条次推位置）→ B 草稿编辑+预览 →
  草稿不可见/403/乐观锁/跨视频/片段倒序/覆盖确认 → UI「发布并替换主推」→ 来源变化失效与恢复 →
  再改草稿线上不变 → 互动无网络请求 → 收词/定位/跟读/1440-390-320 溢出 →
  恢复上一版回 A → A 下线拒绝恢复并说明 → 复原 A。
- 运行前提（写在 spec 头部注释）：dev 库三张表应为空；B 若已有真实 AI 生成草稿则复用它做编辑基底，否则用真实字幕手写草稿（AI 不可用也不阻塞）。本任务只授权**一次**真实生成，spec 本身不再触发真实生成。
- 最终轮截图 01–10 全部由这一轮重新生成（真实数据；02 为 390 新样式，08 已无 dev 徽标）。

### 3.4 旧首页回归（在「未发布编排」状态跑）

清理三表后、公共接口回到 `{"editorial":null}`、首页回旧兜底，再跑：

```powershell
npx playwright test e2e/home-learning-stories.spec.ts e2e/home-continue-learning.spec.ts `
  e2e/home-feed.spec.ts e2e/home-editorial.spec.ts --project=chromium --reporter=list
```

```text
Running 25 tests using 10 workers
25 passed (8.5s)
```

其中包含实现者 spec 的「真实 dev 后端未发布编排时继续走旧首页（布局发布后自动跳过）」一条，真实后端走了旧兜底。该轮在最终清理之后执行，日志：`docs/evidence/home-editorial/16-old-home-regression.log`。

## 4. 真实 AI 生成尝试（本任务授权一次；只记录事实，不评价质量）

执行方式：`POST /api/v1/admin/home-content/videos/{B}/generate`（管理员 token）→ 轮询
`GET /api/v1/admin/home-content/videos/{B}/generation`。脚本为 gitignored 临时脚本
`.tmp-diag/real_generation_probe.py`，原始记录已复制到
`docs/evidence/home-editorial/11-real-generation-probe.json` / `.log`。

```text
POST /generate -> HTTP 202  {"generation":{"status":"queued",...,"reused":false}}  (0.11s)
status -> queued   (+0.02s)
status -> running  (+5.03s)
status -> succeeded(+110.34s)
总耗时：110.45s
generation_id : 00a21801-5765-4e62-8824-ac92209f8a1f
status        : succeeded
model         : minimax/minimax-m3.1-flash:free
prompt_version: v1
usage         : null（chat_json 不返回 token 统计，非缺失实现）
error_code    : null
error_message : null
```

生成结果落库草稿（`draft_revision=1`）摘要（不评价内容质量）：标题「没有截止日期，为什么更容易拖延」；
3 条表达（均多词、`word=null`）；互动 3 个选项；3 个场景；片段起止为真实字幕 id。

这一版草稿随后被修复前的全链路 e2e 用作「编辑草稿」的基底（`14-e2e-full-loop.log` 中
`reused_generated_draft:true`，`draft_revision` 逐步编辑到 12）；**最终确认轮**从干净基线起跑、
不再复用该草稿（避免第二次消耗真实额度），改走 spec 内置的真实字幕手写路径
（`15-e2e-full-loop-final.log` 中 `reused_generated_draft:false`）。两条路径都通过，
AI 生成成功这一事实与手工编辑兜底能力分别有据可查；本报告不评价模型生成质量。

## 5. §11 七步验收矩阵

| 步骤 | 断言（全部真实后端） | 证据 |
|---|---|---|
| 1. 初始首页展示 A | 公共接口 `editorial=null`；`featured.items[0].id=A`；登录用户首页 `.home-story.is-lead` 含 A 的频道名；无 `.home-editorial-heading` | spec 1/12 |
| 2. 管理员选 B → 生成/编辑/预览 | 真实生成记录见 §4；在 B 草稿上改标题、改一个选项反馈、补一个真实字幕单词作收词；管理员「预览」弹层显示同一份 DTO（标题/推荐理由/选项/反馈均来自草稿） | spec 3/12；截图 03、05 |
| 3. 普通用户仍看 A，公共响应无 B 草稿 | `editorial.lead.video_id=A`；原始响应不含 `draft`/B 标题/B 反馈；非管理员 11 个管理端点 403；浏览器仍 A | spec 4/12、5/12 |
| 4. 「发布并替换主推」后刷新首页显示 B（不重建前端） | UI 点击 → POST publish 200 → toast「已发布 v1 并替换主推」；公共接口 lead=B，headline/选项反馈/片段时长正确；浏览器刷新后显示 B | spec 6/12；截图 07 |
| 5. 再改 B 草稿，用户仍看已发布 B | 草稿 revision+1 且 3s 后未被后台覆盖；公共接口 headline/反馈仍是已发布版本；浏览器无草稿文案 | spec 8/12 |
| 6. 恢复上一版回 A；A 下线则拒绝并说明 | 编排页「恢复上一版」→ 200 → 公共 lead=A、浏览器 A；重新发布 B 后把 A `is_published=false`，再恢复 → **409 `HOME_CONTENT_ROLLBACK_INVALID`** + toast「上一版布局已不可恢复：内容来源或视频可见性发生变化，请重新编排」；公共仍是 B（不暴露 A）；复原 A 后恢复成功 | spec 11/12、12/12；截图 08、09 |
| 7. AI 不可用可人工编辑并发布；AI 恢复不覆盖人工内容 | spec 内置真实字幕手写兜底草稿（删掉 B 草稿时即走此路径）；spec 8/12 等待 3s 断言无后台任务覆盖人工修改 | spec 3/12（兜底分支）、8/12 |

## 6. §10 行为覆盖矩阵

| §10 要求 | 结果 / 证据 |
|---|---|
| 草稿对普通用户不可见 | spec 4/12：公共 JSON 无 `draft` 字段、无 B 标题/反馈；浏览器仍 A |
| 非管理员 403 | spec 4/12：GET state / POST generate / PUT draft / POST publish / restore-draft / preview / layout 读 / layout 草稿 / layout 发布 / layout 回滚 / layout 预览 共 11 个端点全部 403（envelope 由 `get_admin_user` 产生） |
| 409 乐观锁 | spec 5/12：过期 revision → 409 `HOME_CONTENT_REVISION_CONFLICT`，message 含「刷新」；跨视频字幕引用、片段起止倒序分别 422 `HOME_CONTENT_INVALID`，失败请求均不改草稿 |
| 来源变化（PATCH 改一句真实字幕） | spec 7/12：改 B 一句字幕 → 已发布卡从公共接口消失、次推按设计提升为主推、发布 422 `HOME_CONTENT_SOURCE_CHANGED`；原样改回后 lead 回到 B、次推恢复 C/D |
| 下线视频后旧卡不出现、回滚被拒且说明 | spec 12/12：A 下线后公共 slots 不含 A、lead 仍是 B；回滚 409 且给出原因；不暴露已下线视频 |
| 无编排用旧兜底 / 缺可选卡不造假 | spec 1/12（旧兜底）、spec 2/12（只有主推时 `secondary=[] expression=null scenarios=[]`，DOM `.home-editorial-secondary` 0 条；随后编排 2 条次推→DOM 2 条且文本正确） |
| 互动点击只显示保存反馈、不发 AI 请求 | spec 9/12：点击两个选项，`aria-pressed` 正确，反馈来自发布 DTO；监听 `request` 事件 800ms 内无 `/api/` 请求，更无 openai/chat/completion 调用；同时断言 console.error/pageerror/4xx-5xx 为 0（本轮 requestfailed 也是 0），写入 `12-homepage-console.log` |
| 收词/定位/跟读参数 | spec 10/12：真实 `POST /api/v1/vocabulary?word=…&video_id=B&subtitle_id=…&context_sentence=…` 参数逐项等于公共 DTO；「跟读这句」href 指向 `/watch/B?from=home&sub=<真实字幕id>`；「全文文稿」`/watch/B/transcript`；「看完整视频」`/watch/B?from=home`；片段按钮文案 = 服务端 `clip.duration` 计算值（不是写死 90 秒） |
| 1440 与 320–390 无横向溢出 | spec 10/12：1440/390/320 三档 `document.documentElement.scrollWidth <= innerWidth` 且 `.home-discovery` 内容宽不溢出；390 场景展开后详情框底边在移动端 tab bar 之上 |
| 生成失败/重新生成不改变当前首页 | 后端 pytest 已覆盖生成状态机与失败路径（`test_home_content_generation.py`）；e2e 侧验证了「已有草稿再生成需显式覆盖」：POST generate → 409 `HOME_CONTENT_OVERWRITE_CONFIRM`，随后公共页与草稿均未变（spec 5/12） |

## 7. 截图与证据清单（`docs/evidence/home-editorial/`）

| 文件 | 内容 / 真实数据说明 |
|---|---|
| `01-首页-新编排-1440.png`（1440×1807） | 新编排首页 1440：B 主推（TED 真实视频/字幕/真实片段秒数）+ 2 条真实次推（C/D）+ A 内容版本的「换个说法」「今天就能用」+ 下方真实 feed；无 dev 徽标 |
| `02-首页-新编排-390.png`（390×2908） | 同一首页手机 390 全页；无横向溢出；应用实现者的 390 修正后 section-note 已隐藏，无单字吊尾 |
| `03-管理员-视频详情-首页内容面板.png`（1152×3302） | `/admin/videos/{B}`「首页内容」面板全量截图（最终轮真实草稿 rev1）：内容状态、基础信息、标题依据句、片段试听（69.6 秒真实时长）、表达、互动（含被修改的选项反馈）、场景、保存/发布操作 |
| `04-首页编排页-1440.png`（1440×2696） | `/admin/home-editorial`：rev/线上状态、当前位置总览、主推/次推/换说法/今天就能用候选、发布与恢复按钮 |
| `05-预览弹层.png`（1152×798） | 管理员草稿预览弹层：标题/推荐理由/选项/反馈来自管理员 preview 接口（与公共 DTO 同形） |
| `06-首页互动-选项反馈展开.png`（420×1020） | 首页主推卡互动选项点击后的固定反馈（截图时为第二个选项展开） |
| `07-首页-发布后-B-1440.png`（1440×1600） | UI 点「发布并替换主推」后刷新：lead=B、2 条次推、A 侧位卡；未重建前端 |
| `08-首页-恢复后-A-1440.png`（1440×1600） | 「恢复上一版」后首页回到 A（真实 A 视频/字幕/侧位卡）；**修复后重拍，已无 dev overlay 徽标** |
| `09-恢复上一版-被拒绝.png`（1440×2200） | A 下线后点「恢复上一版」：顶部 toast「上一版布局已不可恢复：内容来源或视频可见性发生变化，请重新编排」+ 字段级 `VIDEO_NOT_PUBLIC` 问题 + 线上仍是 B、2 条次推仍在 |
| `10-首页-新编排-320.png`（320×2985） | 320 手机全页，无横向溢出 |
| `11-real-generation-probe.json/.log` | 唯一一次真实 AI 生成的原始记录（状态转移/耗时/model/usage/error；§4） |
| `12-homepage-console.log` | 新编排首页运行时证据：spec 本轮 console.error=0、pageerror=0、http≥400=0、requestfailed=0；**文件后半部分追加了修复后 6 轮 console 探针汇总** |
| `12-homepage-console-probe.json` | 修复后 6 轮探针的原始 JSON（3 轮直接加载 + 3 轮导航离开再回来） |
| `13-nextjs-dev-issue-evidence.txt` | 「1 Issue」dev overlay 调查的原始 message、复现方法与结论（§9.1） |
| `14-e2e-full-loop.log` | 修复前全链路 e2e 输出（12/12，含 `reused_generated_draft:true` 与 `[real-generation]` 行） |
| `15-e2e-full-loop-final.log` | **最终确认轮**全链路 e2e 输出（12/12 passed，35.9s，从 0 行基线、`reused_generated_draft:false`） |
| `16-old-home-regression.log` | 最终清理后旧首页 + 实现者 home-editorial spec 的 25 passed 输出（8.5s） |

> 说明：同目录还有实现者早期留下的未编号截图（`home-desktop-1440.png`、`admin-*` 等），
> 不属于本验证的交付图，本报告编号 01–10 才是验收截图。

## 8. 未执行项与原因

| 未执行 | 原因 |
|---|---|
| 第二次真实 AI 生成 | 任务只授权一次；重复跑会再次消耗额度。§4 已完整记录唯一一次尝试 |
| 既有 PG integration 套件（`test_catalog_pg` / `test_favorites_pg` / `test_celery_tasks_pg`） | 与首页编辑内容无关，且需要独立 PG 库；本改动的迁移已在 `seeword_htest` 上实测 upgrade/downgrade/upgrade，未写 dev 库 |
| 后端全量 `pytest tests/` + 覆盖率门 `--cov-fail-under=60` | 任务口径是新增 + 受影响套件；全量套件包含与本改动无关的集成用例，未在本次会话中跑 |
| `pip-audit` | 本次改动未触及依赖 |
| `npm run build` / 生产镜像 / 生产验收 | 任务明确「不含生产部署」 |
| 真机移动端 | 只做了 Playwright viewport（1440/390/320）模拟，未在真机浏览器上跑 |
| 浏览器 firefox / mobile 项目 | 按 frontend/CLAUDE.md 的 CI 口径只跑 `--project=chromium` |

## 9. 发现的问题（按严重度）

### 9.1 【低 / dev-only，已修复并复验通过】Next dev tools 徽标「1 Issue」与首页瞬时旧兜底闪烁

- **现象**：修复前第一版 `08` 截图左下角出现 Next dev tools 红色「1 Issue」徽标；同一路径下偶尔可见首页短暂闪回旧 `FeaturedListening`。
- **调查（修复前）**：Playwright 在「管理员编排页 → 切普通用户访问 `/`」路径与新编排首页路径各重复 3–6 次，监听 `console`/`pageerror`/`response>=400`/`requestfailed`：
  - 7/9 次：`console.error=0`、`pageerror=0`、`http>=400=0`、`requestfailed=0`；
  - 2/9 次（racy）：`[requestfailed] GET /api/v1/browse/featured?limit=6 :: net::ERR_ABORTED`；`[requestfailed] GET /api/v1/discovery/learning-metadata?ids=… :: net::ERR_ABORTED`；
  - 没有任何 hydration 报错、未捕获异常或 4xx/5xx。
- **判断**：`1 Issue` 是 Next 16 dev overlay 的计数徽标（`nextjs-portal` shadow root 的 `#devtools-indicator`），不是页面运行时错误；来源是 dev 下 React StrictMode 双执行 effect 导致首页首次 `fetchHomeEditorial` 被 cleanup abort、`.catch` 短暂渲染旧首页、随后卸载使在途请求被 abort。**只影响 dev**（生产构建不双执行 effect），不影响数据/契约/发布回滚正确性。原始证据：`13-nextjs-dev-issue-evidence.txt`。
- **修复**（由实现者 `frontend-home` 完成，验证者未改实现代码）：`frontend/src/app/(main)/page.tsx` 改为模块级共享同一条首页编排请求（chunk 加载即发起、与壳层登录态并行；StrictMode 两次 effect 订阅同一 promise，不再 abort 第一条；真正卸载才在 0ms 后 abort；不做结果缓存），effect 用独立 `cancelled` 标志区分「本次订阅作废」与「请求超时 abort」，超时仍整块回退旧首页。公共行为不变。
- **复验（修复后，2026-10-20 08:39）**：6 轮探针（3 轮直接加载 + 3 轮加载后立刻导航离开再回来）：
  - 直接加载 3/3 轮：`requestfailed=0`、`console.error=0`、`pageerror=0`、`http>=400=0`，Next dev tools 徽标不出现（`badgeRootDisplay=none`）；
  - 导航离开 3 轮：仅出现由探针主动离页造成的 `net::ERR_ABORTED`（media 缩略图 / `users/me` / 字体 / `learning-metadata`），属真实离页的预期行为；所有轮次 `console.error/pageerror/4xx` 均为 0，徽标全部不出现；
  - 此前跑 4 轮偶发出现的 `browse/featured`、`learning-metadata` 首页加载 abort **不再出现**。
  - 原始结果追加在 `12-homepage-console.log`，原始 JSON 见 `12-homepage-console-probe.json`。
- **截图**：`08` 已由最终轮重拍且无徽标；其余 01/02/07/09/10 同轮重拍。

### 9.2 【低 / 证据流程】管理端 sonner toast 有 0.4s 入场动画

- 拒绝恢复的 toast 在 `toBeVisible()` 时 `boundingBox` 可能仍是 `y=-32`（`translateY(-100%)` 入场中）；若立刻截图会截不到提示。已在 spec 中等 700ms 再截图，`09` 图能完整显示「上一版布局已不可恢复…」。非产品缺陷，记录给后续写证据截图的人。

### 9.3 【信息 / 既有】mypy baseline 漂移

- HEAD 上 mypy 有 4 条既有无关错误（`exam_subjects.py`、`account_tasks.py`）与 2 条已不存在的基线行；本次未修改 `.mypy-baseline`，home-content 相关文件零新增错误。

## 10. 清理记录（复原到干净基线）

1. 全链路 e2e 最后一轮结束后（spec 自身已把 A 可见性、B 字幕改回、公共版面恢复）：
   ```text
   DELETE FROM home_page_config;          -- 1 行
   DELETE FROM home_content_revisions;    -- 5 行
   DELETE FROM home_content_drafts;       -- 4 行
   ```
2. 复核（实测）：
   ```text
   select (select count(*) from home_page_config) as cfg,
          (select count(*) from home_content_revisions) as revs,
          (select count(*) from home_content_drafts) as drafts;
   -> cfg=0 revs=0 drafts=0
   GET /api/v1/browse/home-editorial -> {"editorial": null}
   videos A/B -> is_published = t（均复原）
   B 的目标字幕 text_en 已回到原文（spec 12/12 最后一步断言；另查 %[verify-source-change]% 计数 = 0）
   ```
3. 首页回到旧兜底后重跑旧首页三件套 + 实现者 spec：**25 passed (8.5s)**（§3.4，最终清理后执行）。
4. 保留的测试数据：仅 `docs/evidence/home-editorial/` 下的截图/日志；dev 库无残留编排、版本、草稿。
5. 未做任何 `git commit/push/checkout/reset`；未修改 `.mypy-baseline`、`.env`、未重启/杀后端或前端进程。

## 11. 复现命令汇总

```powershell
# 后端
cd C:\Users\Administrator\Speaking\backend
$env:PYTHONUTF8=1
.\.venv\Scripts\python.exe -m pytest tests/test_home_content.py tests/test_home_content_generation.py -q
.\.venv\Scripts\python.exe -m pytest tests/test_discovery_api.py tests/test_browse_feed.py tests/test_response_contract.py tests/test_architecture_invariants.py tests/test_videos.py -q
.\.venv\Scripts\python.exe -m ruff check app/ tests/
.\.venv\Scripts\python.exe -m ruff format --check app/ tests/
# 迁移（独立库）
docker exec speaking-db-1 psql -U seeword -d postgres -c "CREATE DATABASE seeword_htest;"
$env:DATABASE_URL="postgresql+asyncpg://seeword:seeword_dev@localhost:5432/seeword_htest"
.\.venv\Scripts\python.exe -m alembic upgrade head
.\.venv\Scripts\python.exe -m alembic downgrade -1
.\.venv\Scripts\python.exe -m alembic upgrade head
Remove-Item Env:DATABASE_URL

# 前端
cd C:\Users\Administrator\Speaking\frontend
npm run check
npm run test:unit
npx playwright test e2e/home-editorial-full-loop.spec.ts --project=chromium --reporter=list
# 清理三表后旧首页回归
npx playwright test e2e/home-learning-stories.spec.ts e2e/home-continue-learning.spec.ts e2e/home-feed.spec.ts e2e/home-editorial.spec.ts --project=chromium --reporter=list
```

前置：dev 后端 :8000 / 前端 :3000 / Docker DB+Redis 已起；三张 `home_content*` 表为空（未发布编排）。

## 12. 工作区变更声明

本验证只写了以下文件（其余未动）：

- `frontend/e2e/home-editorial-full-loop.spec.ts`（新增）
- `docs/evidence/home-editorial/**`（截图/日志/证据，编号 01–16）
- `docs/home-editorial-verification-2026-10.md`（本报告）
- 临时脚本在 gitignored 的 `.tmp-diag/`（不随交付）

未修改实现代码、迁移、`.env`、`.mypy-baseline`、依赖，未执行 git 写操作，未重启/杀死任何服务进程。
工作区里其它未提交改动属另一会话的无关工作。

## 13. 最终确认记录（修复后）

| 项 | 命令 / 动作 | 真实结果 |
|---|---|---|
| 1. 干净基线 | 三表 DELETE 后复核 | cfg=0 / revs=0 / drafts=0；`{"editorial":null}`；A/B `is_published=t` |
| 2. 全链路重跑 | `npx playwright test e2e/home-editorial-full-loop.spec.ts --project=chromium` | **12 passed (35.9s)**；日志 `15-e2e-full-loop-final.log`；`reused_generated_draft:false`（人工编辑路径） |
| 3. console 探针 | 6 轮（3 轮直接加载 + 3 轮导航离开再回来） | 直接加载 3/3：`requestfailed=0`、`console.error=0`、`pageerror=0`、`http>=400=0`、dev 徽标不出现；导航离开 3 轮：仅预期内的离页 `ERR_ABORTED`，其余全 0；追加到 `12-homepage-console.log`，原始 JSON `12-homepage-console-probe.json` |
| 4. 截图复核 | 01/02/07/08/10 等全量重拍 | 01（1440×1807）、02（390×2908，新 390 样式）、07（1440×1600）、08（1440×1600，无徽标）、10（320×2985）均为真实数据、无横向溢出；03/04/05/06/09 同轮重拍 |
| 5. 清理 | `DELETE FROM home_page_config / home_content_revisions / home_content_drafts` | cfg=0 / revs=0 / drafts=0；`{"editorial":null}`；A/B 可见性复原；`%[verify-source-change]%` 字幕计数 0 |
| 6. 旧首页回归 | 清理后跑旧三件套 + 实现者 spec | **25 passed (8.5s)**；日志 `16-old-home-regression.log` |
| 7. 前端门禁 | `npm run check` | EXIT 0：design-system/session-writes 通过，tsc 无错，eslint 0 error（3 个既有 warning），prettier 全通过 |

最终版结论：**管理员换首页主推闭环在真实后端 + dev 代理下可复现通过；AI 生成成功一次并如实记录；
dev-only abort/`1 Issue` 已修复并复验；dev 库已清回干净基线；旧首页行为未回归。未发现阻塞性缺陷。**

---

**交付状态：已完成（`task-5`）。** 唯一遗留说明：`docs/evidence/home-editorial/` 里还有实现者早期留下的
未编号截图（`home-desktop-1440.png`、`admin-*` 等），不属于本验证交付图；如需整洁可后续移入子目录，
不影响 01–16 号证据的可复核性。
