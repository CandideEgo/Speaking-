# 后台管理面板审计、优化与数据清理 — 2026-10-26

本轮在 `redesign` 分支上对**后台管理面板（`/admin`）做了一次前后端一体的只读审计 + 定向修复**，并顺手完成了两件清理：

1. **彻底删除兑换码系统**（代码 + 管理页 + 表 + 测试）；
2. **清理退役功能的用户数据表**与本地开发库里的无效数据。

> 审计基线：HEAD `69eb4c7`（工作区在审计期间并行偏移），最终改动集见本目录各报告。审计/修复全程未访问生产、未部署；所有写入只发生在本地 dev 库（清理前有整库备份）。

## 1. 结论摘要

- **P0：0 条**。管理面鉴权骨架健康：**70 条管理路由全部挂 `get_admin_user` 且全部有路由级限流**（AST + 运行时依赖树逐条核验），错误 envelope 统一，字幕编辑有 before/after 审计。
- 审计发现 **后端 19 条**（P1×1 / P2×6 / P3×12）与 **前端 40 条**（P1×1 / P2×21 / P3×18）；**没有新增 P0**。
- 真正值得修的三类：

  | 类别 | 代表问题 | 处置 |
  |---|---|---|
  | 数据不可逆 | 重断句 `resegment` 通过 DB 级联静默删除用户原句收藏、清空字幕编辑审计、断掉词汇来源句（P1） | **已修**：捕获 + 按时间重叠重映射 + 快照 v2 + 回滚恢复，返回逐项计数 |
  | 管线竞态 | `retranslate` 无状态守卫且先清空后派发；`recover/retry` 无条件删活锁；`seed` 去重缺口 | **已修**：状态守卫 + 单飞锁 + 派发失败恢复；活锁识别；URL 锁 + 更宽去重 |
  | 运营口径/能力 | `pro_users` 含过期用户；后台看不到真实金数据收款；公告广播在请求内全表 fan-out | **已修/补齐**：有效 Pro 口径；新增「付费记录」管理面；公告改 Celery 分块批量 |

- **后台收入可见性**（原 P1）：新增 `/admin/payments` 页面 + `GET /admin/payments`、`/payments/summary`、`/payments/sync`，数据源为金数据落账表 `jinshuju_payments`（只读、无 `raw_json`、统计含累计/近 30 天/今日收入与五种状态计数）。这替代了被删除的兑换码/订单面。

## 2. 清理

### 2.1 兑换码系统（删除）

- 删除：`api/v1/redeem.py`、`models/redeem.py`、`schemas/redeem.py`、`tasks/redeem_tasks.py`；`main.py`/`models/__init__`/`schemas/__init__`/`celery_app` 装配；`/admin/redemptions*` 与 `/admin/orders`（legacy 空表接口）；`redeems_today` KPI；`redeem_code_unused_expiry_days` 配置；`INVALID_REDEEM_CODE` 错误码；相关测试。
- 前端：删除 `/admin/invites`、`/admin/orders` 页面与导航/面包屑/仪表盘快捷入口，删除 9 个数据函数与 3 个类型；删除退役 `/redeem` 路由壳与白名单；联系/条款/设置文案改为真实的「升级页 → 金数据站外收款 → 自动开通」口径。
- 数据库：迁移 `c3d4e5f6a7b8_drop_redeem_and_retired_tables` 删除 `redeem_codes` 表与 `redeemstatus` / `revokedreason` 两个 enum；downgrade 结构等价重建（scratch 库往返验证，DDL 逐行 diff 为空）。

### 2.2 退役功能用户数据表（删除）

同一迁移删除 8 张无生产读写的表：`shadowing_attempts`、`weekly_reports`、`speaking_attempts`、`speaking_rubrics`、`rubric_criteria`、`speaking_attempt_scores`、`video_practice_questions`、`redeem_codes`。对应模型/服务（`shadowing_service`、`weekly_report_service`、`report_tasks` 等）与测试一并删除；410 兼容路由壳保留；数据导出与注销清理不再包含这些数据集。

> 数据不可恢复（这是「清理」的目的）。迁移前必须 `pg_dump`；dev 库备份在 `.tmp-diag/seeword-pre-cleanup-20261026.dump`（不入库）。存量 `/media/shadowing/` 音频文件仍在磁盘上，仅旧媒体路由 token 可读；需要清盘时由运维单独执行。

### 2.3 本地 dev 库无效数据（已执行）

| 动作 | 结果 |
|---|---|
| 删除 e2e/probe 生成的合成账号（`2026-10-19` 起、非管理员；脚本 `backend/scripts/purge_dev_test_users.py`，默认 dry-run，production 拒绝） | 615 → **6**（2 管理员 + 4 个 9 月及以前账号） |
| 删除为截图播种的 8 行 `jinshuju_payments`（`entry_token LIKE 'evid-entry-%'`） | 付款记录 **0** |
| 删除旧维护 schema `audit_bak_20261025`（清理前已确认有整库备份） | 0 个非 public schema |
| 删除临时 scratch 库 `seeword_cleanup_scratch` | 已删 |
| 清 Redis `cache:*` / `presence:*`（避免后台统计读到清理前缓存） | 已清 |

清理后实测：`users=6`、`total_videos=49`、`pro_users=1`、`pro_expired_count=2`、`jinshuju_payments=0`，后台七个页面正常渲染、空态文案正确。

## 3. 修复清单

### 3.1 后端（详见 [`backend.md`](backend.md) 与三份修复报告）

| 编号 | 问题 | 处置 |
|---|---|---|
| ADM-01 | resegment/rollback 与单行删除字幕经 CASCADE 删用户收藏/编辑历史/词汇来源句（**P1**） | 已修：捕获 + 时间重叠重映射 + 快照 v2 + 回滚恢复；单行删除默认 409 + 影响计数，`force=true` 才执行；typed 响应 |
| ADM-02 | retranslate 无状态守卫且先清空译文再派发 | 已修：状态守卫 409、engine 白名单 422、单飞锁、派发失败恢复译文并 503 |
| ADM-03 | recover/retry 无条件删活锁 | 已修：按步骤预算判活锁 409、只清陈旧锁、60s 单飞 |
| ADM-04 | seed/seed-full 去重只看 ready，连点重复建行/重复转写 | 已修：覆盖管线中状态 + URL 级 Redis 锁 + 失败标 error |
| ADM-05 | `pro_users`/`funnel.pro` 含已过期用户 | 已修：只计有效 Pro；保留 `pro_expired_count`；修正 `unlock_service` 失效 docstring |
| ADM-06 | 后台无真实收款视图 | 已修：新增付费记录管理面（见 §1） |
| ADM-07 | 公告广播在请求内对全表逐条 INSERT+WS | 已修：计数 + Celery 任务分块批量插入，提交后 best-effort WS |
| ADM-09 | 可封禁/降级最后一个管理员；无管理审计表 | 最后管理员保护已修（409）；持久审计表 deferred |
| ADM-10 | 分页 total 缺失、裸 dict 端点、排序无 tiebreaker | 已修：total 补全、typed 响应、稳定排序 |
| ADM-11 | admin users 过滤非法值静默忽略、keyword LIKE 未转义 | 已修：Literal→422 + 转义 + 长度上限 |
| ADM-12 | 标题/驳回理由无长度上限 | 已修：max_length → 422 |
| ADM-13 | 回滚字幕不校验时间轴 | 已修：重叠 409，不提交半状态 |
| ADM-14 | settings 首建并发、localize/demo 竞态 | 已修：SAVEPOINT/ON CONFLICT、条件 UPDATE、advisory lock |
| ADM-15 | 列表排序/性能边界 | 低风险 tiebreaker 已修；大性能项 deferred |
| ADM-17 | 管理员发放 Pro 不写 `plan_source`；撤销 Pro 请求 422 | 已修：`admin`/清空 + 响应暴露；`duration_days ge=0` |
| ADM-18 | 管理状态接口回显完整内部报错 | 已修：schema 边界截断 500 |
| ADM-19 | 频道 slug 并发 500、attach 无上限/谎报 | 已修：IntegrityError→400、max 200、真实变更数 + `missing_ids` |
| ADM-08 | 设置页 6 个字段写库但运行时不读 | 部分：前端已标注「仅登记，运行时未读取」；接消费者需产品决策，deferred |
| ADM-16 | GPU 心跳归属语义 | deferred（需基础设施侧确认） |

### 3.2 前端（详见 [`frontend.md`](frontend.md) 与两份修复报告）

- **错误/空/筛选三态**：settings/stats 不再永久骨架（重试 + 保留旧数据）；列表失败不再伪装成「暂无数据」；壳层只在 401/403 跳登录，5xx/网络错误保留会话并显示重试。
- **可访问性**：确认弹窗 `role=dialog`/焦点陷阱/Esc/焦点归还；下拉菜单 `role=menu` + 方向键 + portal 防裁切；26 个无 `htmlFor` 的 label 与无名图标按钮全部命名；移动端关闭态抽屉 `inert` 不再进入 Tab 序列；表格 `th scope`；`text-success/error` 小字改 AA 达标档；skip link；标题层级修正。
- **正确性/防误操作**：视频搜索 300ms 防抖（7 击键 → 1 请求）；送 Pro/封禁等操作在途闸门（连点只 1 个 PATCH）；下线二次确认；公告发送确认 + 异步文案；反馈列表分页；频道搜索/排序修复；分页显示「共 N 条」；用户对自己行的危险操作禁用。
- **配置诚实性**：质量阈值改百分比 UI（库仍存 0–1）+ 中文校验；死配置标注。
- 延后（明确不半实现）：A-19 响应式表格→卡片、A-20 移动端字幕编辑器屏蔽、A-26 URL 状态同步。

## 4. 验证（真实输出）

| 门 | 结果 |
|---|---|
| 后端全量 pytest（收尾整树） | **1460 passed / 14 skipped / 0 failed**（752.94s；14 skip 为需真 PG 的 integration） |
| 后端 ruff | `ruff check app tests scripts` → All checks passed；`ruff format --check` → 367 files formatted |
| 后端 mypy 基线门 | **0 new**（基线由 42 行降为 41：删除已删文件 `shadowing_service.py:assignment`） |
| 迁移 | dev 库 `alembic current` = `c3d4e5f6a7b8 (head)`；scratch 库 `upgrade→downgrade -1→upgrade` 通过，downgrade DDL 与清理前逐行 diff 为空 |
| schema 漂移门 | `python scripts/check_schema_drift.py` → **0 known entries, 0 new** |
| 前端门禁 | `npm run check` → exit 0（design-system 9/9、session-writes 2/2、tsc、eslint、prettier；无新增白名单） |
| 前端单测 | `npm run test:unit` → **31 files / 336 tests passed** |
| 浏览器（清理后） | 后台 7 个页面 1440 宽 h1/空态正确、横向溢出 0；payments/users/dashboard 390 溢出 0；console error 0；付费记录空态「共 0 条」；截图 `docs/evidence/admin-audit-2026-10-26/final-*.png` |
| 实机 API | 清理后 `/admin/stats`：users=6、pro_users=1、pro_expired=2、videos=49；`/admin/payments` total=0；`/admin/users` total=6；`/admin/feedback` total=1 |

**未执行（如实标注）**：生产部署/生产库迁移（本轮不部署）；真实管理员写操作对生产的影响验证（只用了本地 mock/测试）；全量 e2e（并行观看页工作占用了工作区，且与后台无关；后台管理端用 Playwright 专项 + 清理后 smoke 覆盖）；Celery worker 未重启（新公告任务需重启 worker 才会注册，部署时容器重建天然满足）。

## 5. 生产上线注意

1. **迁移不可逆**：`c3d4e5f6a7b8` 会 DROP 8 张表 + 2 个 enum。上线前必须对生产库做备份（`pg_dump` 整库或至少这 8 张表），并确认不再需要这些历史数据。
2. **worker 需重建**：新增 `app.tasks.notification_tasks.broadcast_announcement`，旧 worker 会以 unregistered task 丢弃公告任务；部署顺序应为「迁移 → web/worker 一起换新」。
3. **行为收紧（前端已同步）**：删字幕有副作用时默认 409（需 `force`）；retranslate/recover/retry/seed 新增 409；title 类字段超长 422；`/videos/admin/{id}/status` 的 `error_message` 截断 500。
4. **商户后台统计口径变化**：`pro_users` / `funnel.pro` 改为有效 Pro；`users_by_plan` 仍是库内 plan 原样分布（含过期），差值看 `pro_expired_count`。

## 6. 交付物索引

| 文件 | 内容 |
|---|---|
| [`backend.md`](backend.md) | 后端管理面审计（19 条 + 70 路由清单 + 优化机会/测试缺口/未验证项） |
| [`frontend.md`](frontend.md) | 后台前端审计（40 条 + 截图/axe/网络证据 + IA 建议） |
| [`backend-removal.md`](backend-removal.md) | 兑换码/退役表清理与迁移验证 |
| [`frontend-removal.md`](frontend-removal.md) | 前端兑换码/退役路由清理 |
| [`payments-admin.md`](payments-admin.md) | 付费记录管理面 API 契约 + 前端页 + 核心审计修复 |
| [`backend-fixes-pipeline.md`](backend-fixes-pipeline.md) | 管线/字幕数据安全修复（ADM-01/02/03/04/13/14…） |
| [`backend-fixes-admin.md`](backend-fixes-admin.md) | 频道/反馈/公告/video_service 修复（ADM-07/10/14/15/19…） |
| [`frontend-fixes-shell.md`](frontend-fixes-shell.md) | 壳层/弹窗/登录/设置/统计修复 |
| [`frontend-fixes-pages.md`](frontend-fixes-pages.md) | 列表/详情页 UX 与 a11y 修复 |
| `docs/evidence/admin-audit-2026-10-26/` | 审计与修复截图/JSON（桌面+390、axe、网络、walkthrough、final smoke） |

> 说明：同一工作区里另有一路并行的**用户端观看页重构**（watch/**、HomeFeed、user-ui.css 等），不属于本报告范围，也未包含在本轮提交里。
