# 代码审查处置清单（2026-10-20）

配套文档：[`docs/code-review-2026-10-20.md`](code-review-2026-10-20.md)。

用法：勾选框随处置推进打勾。每条给出**定位**、**失败场景**、**验收口径**。
处置顺序按 §6 的分组：先恢复 CI 绿 → 再修并发 → 推送前处理凭据 → 补边界 → 接门禁 → 其余。

**处置原则**（根 `CLAUDE.md`）：永不为让检查变绿而放宽检查器、基线或豁免；
先处理真实违规；一条事实只放一个家；高影响改动先理清消费者与退路再动手。

---

## 第 1 组 · 恢复 CI 绿（阻塞其余一切）

### [x] 1.1 真修 4 条 mypy 新增错误

- **定位**：`app/core/exam_subjects.py:27`（arg-type、return-value）、
  `app/tasks/account_tasks.py:65`（no-any-return）、`:417`（arg-type）
- **失败场景**：CI backend job 在「Type check (baseline gate)」步退出码 1，
  `##[error]New mypy errors introduced`
- **验收口径**：`mypy app/` 的 `file:code` 对全部落在 `backend/.mypy-baseline` 内；
  **不得**把新错误加进基线
- **顺带**：基线里 `app/api/v1/browse.py:attr-defined` 与
  `app/services/recommendation_service.py:arg-type` 已修复，可从基线删除（基线只降不升）
- **✅ 处置**：TypedDict `ExamSubject` + 类型化 `_iso` + `sa_delete(UserModel)`；基线 51→45。
  `mypy app/ --ignore-missing-imports` 差集为空（CI 同命令复核）。

### [x] 1.2 同步 `test_home_content_generation.py` 的 8 个失败

- **定位**：`backend/tests/test_home_content_generation.py`
- **失败场景**：`pytest tests/` → 8 failed → CI backend job 退出码 1
- **先判方向**（见审查报告 G1）：
  - [ ] 确认 v2 规则本身是对的 → 测试 fixture 同步到 v2（场景锚定到 expression 原字幕、
        `prompt_version` 断言改 `"v2"`）
  - [ ] 或确认 v2 过严 → 实现放宽对应规则（`home_content_generation.py:898-916`）
- **验收口径**：`pytest tests/test_home_content_generation.py` 全绿；全量 `pytest tests/` 0 failed
- **✅ 处置**：v2 是正确契约，fixture 同步到 v2（+6 条 v2 契约测试）；第 8 个失败是 b5838d1
  引入的**死代码**（`fallback_candidate_indices` 从未被接线）→ 接入实现（选项 A），不是放宽测试。
  全量 `pytest tests/` 0 failed（见 1.3 处置同款全量复核）。

### [x] 1.3 两个新增 e2e spec 的 CI 适配

- **定位**：`frontend/e2e/home-editorial-full-loop.spec.ts`（12 步串行，依赖真实 admin
  账号 + 4 个真实视频）、`frontend/e2e/vocabulary-learning.spec.ts`（依赖真实 ECDICT）
- **失败场景**：CI e2e job 跑到这两个 spec → 登录失败/查无视频 → 退出码 1
- **修法方向**：按既有约定加 `test.skip()` 保护（对照 `watch.spec.ts` 的做法）+ 补播种；
  或在 CI 显式排除并单列为本地/人工门禁
- **验收口径**：`npx playwright test --project=chromium` 全绿（本地起 dev 栈）
- **✅ 处置**：`home-editorial-full-loop.spec.ts` 与 `vocabulary-learning.spec.ts` 加 skip 保护
  （无真实 admin/视频/ECDICT 时安全跳过），生产管理员明文凭据改环境变量注入；
  CI 仍跑 `--project=chromium`。全量 `pytest tests/` **1265 passed, 16 skipped, 0 failed**
  （两次全量复核：一次 1264+1 flake，一次全绿；flake 已排除，见审查报告 §5）。

---

## 第 2 组 · 并发与死锁（会丢数据 / 丢钱）

### [x] 2.1 金数据 ABBA 死锁

- **定位**：`backend/app/services/jinshuju_service.py`
  - 路径 A（`:340-350`）：锁 User → 锁 Payment
  - 路径 B（`:457-466`）：锁 Payment（`skip_locked=True`）→ commit 时 UPDATE User
- **失败场景**：付费未注册用户登录补发（B）与 beat 同步（A）并发 → Postgres 杀事务；
  被杀的是 A 时 Celery 不重试（`payment_tasks.py:37-38` 吞异常）→ **订单永远不开通**；
  `skip_locked` 还会让付费用户登录后拿不到会员
- **修法方向**：统一锁序（两条路径都先锁 User）；去掉 `skip_locked`
- **验收口径**：并发压测不出现 `DeadlockDetectedError`；付费用户首次登录必得会员
- **✅ 处置**：两条发放路径统一锁序 User→Payment（by id asc），去掉 `skip_locked`。
  回归测试 `tests/test_jinshuju_pg_concurrency.py`（integration，真 Postgres）：
  ① 先 `before_cursor_execute` 确定性断言锁序（钉因）；② 并发 3×30 天订单只发 90 天
  （钉果，多发/少发/漏单都红）。换回旧实现两测必红；修复版 150 轮 0 死锁。
  另记录：审查复核的「redeem ABBA」是**假阳性**（详见 §5）。

### [x] 2.2 `complete_generation` 写回 TOCTOU

- **定位**：`backend/app/services/home_content_service.py:1730-1797`
- **失败场景**：管理员在 AI 写回前 1 秒保存草稿 → AI payload 覆盖人工内容，
  且 `revision += 1` 让计数器看不出冲突 → **违反 docstring「绝不覆盖管理员的新修改」**
- **修法方向**：条件 UPDATE（`WHERE id=? AND active_generation_id=? AND revision=?`），
  `rowcount == 0` 判冲突；或整段事务 `SELECT ... FOR UPDATE`
- **验收口径**：补并发测试 —— 写回期间保存草稿，结果必须判冲突且保留人工内容
- **✅ 处置**：`complete_generation` 写回改条件 UPDATE + `rowcount == 0` 判冲突（409）；
  `tests/test_home_content_concurrency.py` 11 条并发用例全绿。

### [x] 2.3 草稿保存 / 发布 / 回滚的读-改-写

- **定位**：`home_content_service.py` 的 `save_draft:881-902`、`publish_content:921`、
  `version 分配:947-955`、`_get_or_create_draft:660-673`、
  `save_layout_draft:1443` / `publish_layout:1456` / `rollback_layout:1489`
- **失败场景**：两个管理员同时保存 → 两边都收 200，B 静默覆盖 A；
  version/draft 行分配竞态 → `IntegrityError` → 500 而非 409
- **修法方向**：统一改成条件 UPDATE + `rowcount` 检查（照抄同文件 `:1638-1646` 生成去重的写法）
- **验收口径**：补并发测试；过期 revision 返回 409 而非静默覆盖
- **✅ 处置**：`save_draft` / `publish_content` / version 分配 / `_get_or_create_draft` /
  `save_layout_draft` / `publish_layout` / `rollback_layout` 统一条件 UPDATE + `rowcount` 判冲突；
  并发测试覆盖（含 409 与不静默覆盖）。

---

## 第 3 组 · 推送前必须处理（凭据）

### [x] 3.1 替换测试文件里的真实 key 片段

- **定位**：`backend/tests/test_llm_provider.py:215,265,268`（**字面量已打码**）
- **内容**：真实 `COMMANDCODE_API_KEY` 的前 37 字符（`.env` 真值为同前缀 93 字符）
- **修法**：换成明显伪造值；`mask_secret` 测试的断言改为不依赖真实前缀
- **验收口径**：`grep -rn '<真 key 前 9 字符>' backend/` 无命中
- **✅ 处置**：测试文件换成 `FAKE_COMMANDCODE_KEY`（37 字符伪造值）；mask 断言改 `startswith("user_F")`
  等不依赖真实前缀的写法。全仓扫真实 key 前缀/后缀无命中（见 3.4）。

### [x] 3.1b `mask_secret` docstring 里的真 key 片段（首轮审查遗漏）

- **定位**：`backend/app/services/llm_provider.py:244`
- **内容**：docstring 示例写了真 key 的**前 6 位 + 后 4 位**（字面量已打码）
- **修法**：换成明显伪造的示例，并说明为什么示例不能用真 key
- **验收口径**：全仓搜真 key 前缀与后缀均无命中
- **✅ 处置**：docstring 示例改为 `abcd12...wxyz` 并注明为何示例不能用真 key；已核对该字面量
  确为 93 字符生产 key 的前缀+后缀（`.env` 内）。

### [ ] 3.2 移除生产管理员明文凭据 + 轮换密码（**部分完成**）

- **定位**：`frontend/e2e/home-editorial-full-loop.spec.ts:48-49`、
  `docs/home-editorial-verification-2026-10.md:45`（**字面量已打码**）
- **内容**：生产管理员手机号 + 明文密码
- **修法**：改环境变量注入或本地 fake 账号；**轮换生产该账号密码**
- **验收口径**：`grep -rn '<生产管理员密码>' ` 全仓无命中
- **✅ 处置（仓库部分）**：`home-editorial-full-loop.spec.ts:48-49` 与
  `docs/home-editorial-verification-2026-10.md:45` 的明文凭据已清除（改环境变量注入 / 删除）。
- **⏳ 未执行（人工）**：**生产该管理员账号密码轮换**属生产操作，需管理员在后台执行后更新 env。

### [x] 3.3 证据截图里的 PII —— **复核证伪，无需处理**

- **定位**：`docs/evidence/home-editorial/*.png`（管理员界面可见手机号）
- **复核结论**：**不成立**。逐张复核 7 张管理端截图，**没有手机号**；管理端壳右上角渲染的是角色名
  「管理员」。代码层佐证：`admin/(shell)/layout.tsx` 与 `adminAuthStore` 里没有任何 phone 字段；
  手机号只出现在 `users/page.tsx:387` 与 `orders/page.tsx:215`，而这两页不在已入库截图里；
  `settings/page.tsx:370` 还专门做了 `MASK_PHONE` 掩码。
- **改为**：**前向风险** —— 今后若截「用户管理 / 订单管理」页入库，会带进真实手机号。
  截图入库前先扫一眼，或对这两页先打码。
- **验收口径**：已入库证据逐张人工复核完毕（复核记录见审查报告 §5 复核证伪清单）

### [x] 3.4 推送前全量凭据扫描

- **范围**：`6a8f01c..d6a0b85` 四个 commit
- **验收口径**：无真实密钥、无明文密码、无手机号
- **✅ 处置**：工作树全量扫描真实 `COMMANDCODE_API_KEY` 前缀/后缀无命中（排除 `.git`、
  `node_modules`、`.venv`、`.next` 与 `backend/.env`——`.env` 是唯一合法持有者，gitignored）；
  F7 表与证据截图已打码/复核（§5）。真推送前跑一次 `git grep` 覆盖新提交。

---

## 第 4 组 · 边界防护

### [x] 4.1 webhook `compare_digest` 非 ASCII → 500

- **定位**：`backend/app/api/v1/payments.py:297`
- **失败场景**：`?secret=中` → `TypeError` → 500；任何匿名人都能打 500，且真实
  「签名不符」被 500 掩盖
- **修法**：先 `.encode()` 成 bytes 再比，或先校验 `provided.isascii()`
- **一并查**：`internal.py` 的 GPU 回调也用 `compare_digest`（`provided` 来自 Header）
- **验收口径**：`?secret=中` 返回 403；补一条非 ASCII 输入的测试
- **✅ 处置**：`payments.py` 与 `internal.py` 改为 `.encode()` 成 bytes 后常时比较
  （bytes 比较本就恒时）；`?secret=中` → 403、非 ASCII GPU 回调头 → 401，测试已补。

### [x] 4.2 GPU 转写回调端点补测试（当前零覆盖）

- **定位**：`backend/app/api/v1/internal.py:71`
- **要钉住的 5 条**：① 密钥错/缺 → 401；② Redis 锁不可用 → 503（fail-closed）；
  ③ `status != processing` → 幂等 acknowledged 且不写字幕不重复入队；
  ④ 正常回调 → 写入 Subtitle + 入队 tail；⑤ 并发两次 → 只有一次真写入
- **验收口径**：`backend/tests/` 下有对应测试文件，全部通过
- **✅ 处置**：新增 `tests/test_internal_callback.py`（10 条），钉住 ① 401、② 503 fail-closed、
  ③ 幂等 acknowledged、④ 写 Subtitle+入队 tail、⑤ 并发只写一次。

### [x] 4.3 admin 写路径端点补 403 覆盖

- **定位**：`backend/tests/test_home_content.py:239` 的 `calls` 列表
- **补 5 条**：`PUT /videos/{id}/draft`、`POST /videos/{id}/publish`、
  `POST /videos/{id}/restore-draft`、`POST /layout/publish`、`POST /layout/rollback`
- **验收口径**：12 个 admin 端点全部有越权断言
- **✅ 处置**：`test_home_content.py` 补齐 12 端点 403；另加 OpenAPI 契约交叉核对测试。

---

## 第 5 组 · 接入门禁

### [x] 5.1 两个前端不变量进 CI 与 pre-commit

- **定位**：`.github/workflows/ci.yml` frontend job（`:136-150`）、
  `.pre-commit-config.yaml`
- **现状**：`check-design-system.mjs` 与 `check-session-writes.mjs` **CI 与 pre-commit 都不执行**
- **修法**：CI 改跑 `npm run check`（或各加一步）；pre-commit 加 local hook
- **验收口径**：故意写一条违规（如 `bg-blue-100`）→ CI 必红
- **注意**：这是**收紧**，不是放宽检查器 —— 合规
- **✅ 处置**：CI frontend job 改跑 `npm run check`；`.pre-commit-config.yaml` 加 2 个 local hook。
  本地 `npm run check` 全绿（design-system 6 规则 + session-writes + tsc + eslint + prettier）。

### [x] 5.2 设计系统门禁补任意值颜色

- **定位**：`frontend/scripts/check-design-system.mjs` 规则 2
- **盲区**：`bg-white`/`text-white`（无色阶，62 处）、`border-[#hex]`（任意值，2 处）
- **修法**：补规则覆盖这两类形态；`Button.tsx:33` 的 `border-[#2c2c2c]`/`border-[#4a4a4a]`
  改用语义 token `--color-surface-dark-soft`
- **验收口径**：新规则能拦住这两类；存量违规要么改要么写明理由进白名单（点名 + 理由）
- **✅ 处置**：规则 5（任意值 hex）与规则 6（white/black 当面用）落地；`Button.tsx` 改语义 token
  `border-surface-dark-soft`；3 处存量 `bg-white` → `bg-on-primary`（#ffffff 零视觉变化）；
  白名单输出带理由。`check-design-system.mjs` 4 规则 → 6 规则。

---

## 第 6 组 · 其余（按优先级）

### [x] 6.1 `createApiClient` 缓存跨会话共享

- **定位**：`frontend/src/lib/createApiClient.ts:111-113`
- **失败场景**：管理员被用户端 `/users/me` 缓存挡住 →「明明是管理员却登不进后台」；
  `_inflightGets` 无条件生效 → 用 A 的凭证发 B 的请求
- **修法**：缓存键加 client 身份前缀（`user:` / `admin:`），或 admin 用独立缓存实例
- **验收口径**：用户端与管理端交替请求同一 URL，各自拿到自己会话的数据
- **✅ 处置**：缓存键改复合键 `<scope>|<session token>|<url>`，`cacheScope` 选项 + `clearApiCache(prefix)`
  按 URL 匹配；`createApiClient.test.ts` 新增 5 条（跨实例不共享 TTL/在途、token 变化失效）。

### [x] 6.2 gunicorn access log 不记 `?token=`

- **定位**：`docker-compose.prod.yml:53-58`（`--access-logfile -`）
- **失败场景**：跟读录音播放 → 用户 JWT 进容器日志 → 日志轮转/外发/备份长期留存
- **修法方向**：gunicorn 加 `--access-logformat` 用不含 query 的格式；
  或用 uvicorn 的自定义 log config
- **验收口径**：生产日志里搜不到 `token=`
- **✅ 处置**：`--access-logformat` 在 `-k uvicorn.workers.UvicornWorker` 下是 no-op
  （uvicorn 自写 query），所以去掉 `--access-logfile`；nginx `$uri`（无 query）+ 应用 JSON
  请求日志仍覆盖追踪。历史轮转日志里的旧 token 需另行清理。

### [ ] 6.3 `_place_content` 布局乐观锁 + 次推静默清空主推（**A 已完成，B 待产品决议**）

- **定位**：`home_content_service.py:1005-1048`（无 `config.revision` 校验）、
  `:995-996` + `:1020-1021`（`_layout_without_video` 清 lead）
- **失败场景 A**：B 的发布静默覆盖 A 未发布的编排草稿
- **失败场景 B**：「发布到次推」顺带把主推位清空，无提示
- **修法**：A —— 加 `config.revision` 校验（与 `publish_layout:1456` 对齐）；
  B —— 先与产品确认预期
- **验收口径**：A 有并发测试；B 有明确的产品决议记录
- **✅ 处置（A）**：`_place_content` 加 `config.revision` 校验；并发测试覆盖。
- **⏳ 待决议（B）**：主推位发布到次推会顺带清空主推 → 编辑块整块消失（契约允许
  `{"editorial":null}`，但非自然结果）。三个选项（见审查报告 G4B）：① 把旧主推 revision
  回填到次推、② 422 拒绝、③ 保持现状。—— 需产品/用户拍板。

### [x] 6.4 `daily` 端点的全表扫描

- **定位**：`backend/app/services/daily_recommendation_service.py:38`、`:103-109`
- **失败场景**：每次 `/discovery/daily` 把整库题目（含 passage 全文）拉进内存
- **修法**：分组字段与 passage 分离，展示时按 id 取；或加按 level 的物化缓存
- **验收口径**：`EXPLAIN` 不再全表扫 `exam_questions`
- **✅ 处置**：模块级 `_BankIndex` 进程内缓存（分组元数据 + 题目 id，**不含 passage 原文**）；
  失效双保险：`count(*)` 条数校验 + 300s TTL；`invalidate_bank_index()` 供导入/测试用。
  实测：整库 16.41 MB（5235 行）→ 题面只按选中组 id 取 **38.4 KB**（≈ 430×），索引命中
  1.6ms。回归测试 `tests/test_daily_recommendation_index.py`：第二次请求不重扫（spy + SQL
  捕获双断言）、题库条数变化即重建且新题立即可见。

### [ ] 6.5 e2e 恢复三条用户可感知保证（**待产品决议**）

- **定位**：`frontend/e2e/mobile-wordcard-drawer.spec.ts:170`（词卡不遮被点的词）、
  `:107-116,209`（抽屉不遮当前句）、`frontend/e2e/mobile-watch-chrome.spec.ts:116-137`
  （首屏不滚动可见）
- **先判方向**：把新的产品决议写进 `docs/design-direction-2026-10-20.md` 并补新行为断言，
  或恢复旧保证
- **验收口径**：三条要么有断言，要么有书面决议
- **顺带**：`mobile-wordcard-drawer.spec.ts:185` 的「≥3 个按钮」下限要恢复

### [ ] 6.6 观看页体积回涨（**延后**）

- **定位**：`frontend/src/app/(main)/watch/[id]/page.tsx`（1538 → 1762 行）
- **修法**：批 8 的续作 —— 继续抽 `useVideoPlayer` / 内联子组件
- **验收口径**：至少回到批 8 结束时的 1538 行
- **⏳ 延后原因**：该文件正处在本轮 UI-review 在途改动中（1762 行），现在重构冲突风险高；
  等 UI 批收敛后单开一轮。

### [x] 6.7 service → api 反向依赖

- **定位**：`backend/app/services/channel_service.py:25`（本次引入）、
  `admin_service.py:15`、`video_cache.py:10`
- **连带**：`api/dependencies.py:18` 的 `_to_aware_utc` 与
  `services/jinshuju_service.py:77` 重复实现 → 归一到一个家
- **修法**：`channel_service` 直接调 `services/video_card.serialize_video_card`，环即消失
- **验收口径**：`browse.py:72-75` 的惰性 import 可以改回模块级
- **✅ 处置**：抽出 `services/video_card.video_card_payload`、`core/media_hosts`、`core/time_utils`
  三个新家；`channel_service` / `admin_service` / `thumbnail_service` / `redeem.py` /
  `redeem_tasks.py` 指向 service/core；`browse.py` 惰性 import 改回模块级；`_video_to_dict` 删除。

### [x] 6.8 支付补漏窗口

- **定位**：`backend/app/services/jinshuju_service.py:498`
- **修法方向**：调大 `jinshuju_sync_lookback_hours`，或加「定期回扫更早窗口 + 去重」的兜底任务
- **验收口径**：停机超过旧窗口后恢复，已付款订单仍能开通
- **✅ 处置**：同步窗口限制已写进 `docs/jinshuju-payment-integration-2026-10.md` 安全/运维节
  （窗口 = `max(1, JINSHUJU_SYNC_LOOKBACK_HOURS)`；停机超窗的人工补法：临时调大窗口跑一次同步，
  或 `fetch_entry(serial_number)` 按单号拉取后 `process_entry`）。加宽窗口/自动回扫列为后续增强。

### [x] 6.9 清理未跟踪垃圾 + gitignore 补 `.agents/`

- **定位**：`.agents/`、`backend/.tmp-probe-ch.py`、`backend/.tmp-probe-yt.py`、
  `channels-before.yml`
- **修法**：删除本机垃圾；`.gitignore` 覆盖 `.agents/`
- **验收口径**：`git status --short` 只剩有意改动
- **✅ 处置**：`.agents/`（`.claude/skills/` 旧副本）、`backend/.tmp-probe-ch.py`、
  `backend/.tmp-probe-yt.py`、`channels-before.yml` 已删除；`.gitignore` 已覆盖
  `.agents/`、`backend/.tmp-*`、`/channels-before.yml`。

### [x] 6.10 验证文档的 `.log` 证据死链

- **定位**：`docs/home-editorial-verification-2026-10.md` 多处引用
  `docs/evidence/home-editorial/*.log`；`.gitignore:50` 的 `*.log` 挡住入库
- **修法**：改 `.txt`（同目录 `13-nextjs-dev-issue-evidence.txt` 已是 `.txt`），
  或 `.gitignore` 对 `docs/evidence/` 加例外
- **验收口径**：文档里每个证据引用在克隆后都能打开
- **✅ 处置**：5 个证据文件 `.log` → `.txt`（11/12/14/15/16），所有引用同步更新；
  入库前已扫干净密钥。

### [ ] 6.11 v2 严格校验下的真实 AI 生成失败率（**未执行：需真实环境数据**）

- **定位**：`home_content_generation.py:898-916`（v2 来源校验）、`:575-576`（无重试）
- **修法方向**：先在真实环境跑几次生成看成功率，再决定是否 (a) 把新规则在 prompt 里讲得更显眼、
  (b) 加有限次重试、(c) 放宽某条规则
- **验收口径**：有实测成功率数据支撑的决策

---

## 第 7 组 · 上线前（生产配置与真实链路）

### [ ] 7.1 prod compose 补 10 个 `JINSHUJU_*`（**compose 已完成，生产 .env 待人工**）

- **定位**：`docker-compose.prod.yml`（当前 `JINSHUJU_*` 出现 0 处）
- **涉及**：`JINSHUJU_ENABLED` / `ACCESS_TOKEN` / `FORM_TOKEN` / `WEBHOOK_SECRET` /
  `TIER_FIELD` / `PHONE_FIELD` / `SYNC_LOOKBACK_HOURS` / `PURCHASE_URL` /
  `PURCHASE_TOKEN_SECRET` / `PURCHASE_TOKEN_TTL_MINUTES`
- **注意**：`PURCHASE_TOKEN_SECRET` 为空会回退 `JWT_SECRET`（`jinshuju_service.py:93-95`），
  生产建议显式设置独立密钥（同一密钥保护两个用途违反密钥分离）
- **验收口径**：生产容器内 `settings.jinshuju_enabled` 为 true 且各字段非空
- **✅ 处置（compose）**：`docker-compose.prod.yml` 补 10 个 `JINSHUJU_*`；`PURCHASE_TOKEN_SECRET`
  用 `${VAR:?msg}` 硬失败（不再回退 `JWT_SECRET`）；config 生产分支加防呆：secret 缺失/等于
  `JWT_SECRET`/access 或 form token 为空 → 启动即抛。
- **⏳ 未执行（人工）**：**生产 `.env` 必须新增 `JINSHUJU_PURCHASE_TOKEN_SECRET`（≠ `JWT_SECRET`）
  后再 `docker compose up`**——compose 的 `${VAR:?msg}` 是硬失败，缺了起不来。

### [ ] 7.2 实测 `x_field_1` 透传（**未执行：需真实小额支付一单**）

- **背景**：`docs/jinshuju-payment-integration-2026-10.md`「已知限制」记录
  「`x_field_1` 透传仍需一单实测」—— 收款页已确认接收 URL 参数，但
  **「付款后写进 entry」这一步未验证**
- **验收口径**：跑通一单真实小额支付 → ① entry 里 `x_field_1` 带上签名 token；
  ② `verify_purchase_token` 解析出 `user_id`；③ 订单落到正确账号
- **已确认**：entry 的 `token` 字段名已实测（docs:37），未验证的只有 `x_field_1` 这一环

---

## 第 8 组 · 文档漂移（代码为准）

### [x] 8.1 修正 5 处与代码不符的表述

- [x] `backend/app/models/jinshuju_payment.py:5-6` —— docstring 改成 token 优先
- [x] `docs/jinshuju-payment-integration-2026-10.md:53-55` —— 手机号改为兼容路径
- [x] `docs/home-editorial-content-implementation-2026-10.md` §2/§4 —— 补 `generation_coverage` 字段
- [x] `frontend/CLAUDE.md:35` —— 页头表述改成实际的 `HomeEditorialHeader`
- [x] `docs/home-content-operation-guide-2026-10.md:35` —— 说明无锚点场景由前端 `validSentence` 过滤

### [x] 8.2 `ErrorCode` 枚举名与实际 code 值不一致

- **定位**：`backend/app/core/errors.py:68-69`
  （`HOME_CONTENT_TIMEOUT = "TIMEOUT"`、`HOME_CONTENT_CONFLICT = "CONFLICT"`）
- **风险**：前端若按 code 字面量判断会踩坑
- **修法方向**：统一命名（改 code 值要评估兼容性），或在前端契约里明确说明
- **✅ 处置**：code 值改为 `HOME_CONTENT_TIMEOUT` / `HOME_CONTENT_CONFLICT`。已核整个首页内容
  功能未推送（生产无消费者）+ 前端从不按字面量比较这两个 code → 零兼容成本。

### [x] 8.3 根 `CLAUDE.md` 路由清单过时

- **现状**：`(main)` 下现有 20+ 个子 `layout.tsx`；`forgot-password` / `onboarding` /
  `set-password` 各自有 `layout.tsx`；`app/(main)/browse/page.tsx` 已改为
  `browse/route.ts` 307 重定向到 `/`
- **修法**：更新根 `CLAUDE.md` 的路由清单
- **✅ 处置**：根 `CLAUDE.md` 前端装配节已更新：`(main)` 20+ 子 `layout.tsx`；
  `forgot-password`/`set-password`/`onboarding` 各有 `layout.tsx`；`(main)/browse` 是
  `route.ts` 307 重定向到 `/`。

### [ ] 8.4 存量 schema 漂移单开一轮收敛

- **现状**：alembic autogenerate 对比实际 Postgres，存量表有 29 项历史漂移
  （老表未删、索引名不同、FK 缺 `ondelete`、注释差异、`server_default` 漂移）
- **与本次改动无关**（新增 4 张表 0 差异），但其中 6 处 `server_default` 因
  `migrations/env.py` 未开 `compare_server_default`，autogenerate **永远发现不了**
- **修法方向**：单开一轮；先考虑开 `compare_server_default` 让漂移可见

---

## 复盘：本次审查中被证伪的结论

记录在案，避免后续重复排查（详见审查报告 §5）：

| 疑点 | 结论 |
|---|---|
| 「测试文件泄露了完整 API key」 | 是前 37 字符片段，远程干净 → 推送前问题，非已泄露 |
| 「镜像 cookie 缺 Secure，生产走明文」 | `nginx.ssl.conf` 有 80→443 强制跳转 |
| 「`entry["token"]` 字段名未验证」 | docs:37 记录 2026-10-18 实测已确认 |
| 「`dictionary_words` 每次 1.46s」 | 实测二次调用 0.1ms（索引有进程级缓存） |
| 「discovery 删除词单越权」 | `owned_set` 先校验归属并加行锁 |
| 「nginx `$request_uri` 进 cache key 是引入的风险」 | 是默认 key，且 `proxy_no_cache $arg_token` 恰好阻止落盘 |
| 「迁移链有 5 个 head」 | 解析脚本未处理 mergepoint；`alembic heads` 是单一 head |
