# 迭代 4 · 测量与供应链（A12 + A11）

日期：2026-10-30。分支：`claude/goofy-tereshkova-cba056`（基于 `redesign` 迭代 3 完成点）。
口径与任务定义的家仍是 [`docs/development-plan-2026-10-29.md`](../../development-plan-2026-10-29.md)
与 [`docs/comprehensive-audit-2026-10-29/execution-plan.md`](../../comprehensive-audit-2026-10-29/execution-plan.md)。
本文件只记录**这一轮真实跑过什么、结果是什么、什么没跑**。

## A12 / 激活留存与事件测量

| 出口条件 | 实现 | 证据 |
| --- | --- | --- |
| 事件带版本、去重、缺失率 | `learning_events`/`behavior_events` 加 `schema_version`（历史行 v1）；`event_contract.py` 是版本与有效学习集合的唯一正文；`behavior_events.event_id` 唯一索引仍是去重键；管理端返回缺 event_id 率与版本分布 | `tests/test_measurement_service.py::test_flow_reconciliation_and_event_versions` |
| 学习 flow 关联与结果事件 | 听写/试卷/词汇轮次/练习提交写 `LearningEvent.flow_id`+`source`；前端同 id 的 `flow_result` 意图落 `behavior_events`；按路径返回 matched / client_only / server_only / 重复率 | 同上；`test_behavior_ingest_accepts_flow_id_and_rejects_newer_schema` |
| cohort/D1/D7 分母固定 | 激活 = 注册后 24h 内首个有效学习；cohort = 激活日去重用户；未成熟 cohort `eligible=false` 且不出率；管理员/内部账号不进分母 | `test_activation_and_cohort_denominators` |
| 试用 Pro 不等于付款 | 付费只认金数据 `applied` 且匹配账号；`active_pro / paid_pro / trial_or_granted_pro` 分列 | `test_entitlement_separates_paid_from_trial` |
| 移除「漏斗」误读 | 管理端卡片改名「累计行为分布 · 非时序漏斗」，描述写明各段独立累计 | `frontend/src/app/(admin)/admin/(shell)/stats/page.tsx` |
| 移动 LCP/INP/CLS、首播、API p95、队列年龄有可复现基线 | `frontend/src/lib/webVitals.ts`（纯函数 + 5 条单测）经 `behavior_events` 上报；观看页 `first_play`；`measure_baseline.py` 同一口径输出 RUM p75、首播、管线积压年龄，`--base-url` 时附 Prometheus 直方图近似 API p95 | `frontend/src/lib/webVitals.test.ts`；`baseline-2026-10-30.json` |

**实测**

- 迁移在一次性 PG（`seeword_iter4_mig`，PostgreSQL 16）上 `upgrade head → downgrade -1 → upgrade head` 通过；
  `check_schema_drift.py` = 0 known / 0 new；列与索引核对一致
  （`learning_events.flow_id/source/schema_version`、`behavior_events.flow_id/schema_version`、
  `ix_*_flow_id`）。
- 新增/相关后端用例 161 passed（测量 7 + behavior 13 + 学习计时 + admin + 听写 + 试卷 + 学习轮次 + 词汇）。
- 前端 `npm run check` 通过（9 条设计不变量 + 会话写入门 + tsc + ESLint + Prettier），`npm run test:unit` **341 passed**。
- mypy 对 `.mypy-baseline` 无新增 `file:code`。
- **全量后端套件**：1493 passed / 6 skipped / 0 failed（22m30s）。6 个 skip 中 1 个是 ecdict 索引缺失（
  `test_ecdict.py:163`，CI 同样跳过），5 个是那一次运行里的 PG 集成用例（与并发跑迁移/基线脚本时的
  连接争用有关）；随后单独跑 `-m integration`：**17 passed**（1m56s），不是代码问题。
- **HTTP 端到端**：一次性 PG（迁移到 head）+ uvicorn :8011 + 管理员 token。
  `GET /api/v1/admin/metrics/learning?days=7` 返回全部区段与 `definitions.version=1`；再 POST 三条
  `behavior_events`（`flow_result(listening)`、`web_vital(lcp=2500)`、`first_play(ms=800)`）后，
  接口返回 `lcp p75=2500 n=1`、`first_play p75=800 n=1`、`listening client_only=1 loss=1.0`
  （没有对应服务端事实时如实报 100% 丢失）。一次性库验完即删除。

**未执行 / 边界**

- **两周真实基线**：`baseline-2026-10-30.json` 是**空库口径快照**（RUM 样本 0），只证明命令与口径可复现；
  真实分设备/网络基线要等埋点放量后的观察窗口，不能拿空样本当「快」。当前生产库也未跑本迁移，
  在迁移前跑该脚本会如实报 `column schema_version does not exist`——先迁移再采集。
- 样本 < 20 时 p75 只作参考（脚本与接口都输出 `samples`，不返回伪造的 0）。
- 时间边界：注册/激活用 UTC 时间戳，学习日与 D1/D7 用 `LearningEvent.event_date`（用户本地日）。
  成熟判定按 UTC 日期，最多晚一天出数；这是为了不让分母随时区漂移（口径写在 `definitions` 里）。

## A11 / 生产、移动与 GPU 供应链

| 出口条件 | 实现 | 验证 |
| --- | --- | --- |
| 生产构建进 CI | frontend job 在 `npm run build` 后断言 `.next/standalone/server.js` 存在 | 本机尝试失败且**不是代码问题**：工作树的 `node_modules` 是主仓 junction，Turbopack 拒绝编译工作区根之外的 `next` 包（`Could not find the Next.js package`）。CI 用真实 `npm ci`，这条断言在那里生效；本机 `npm run check`（tsc/ESLint/Prettier/设计门）全部通过。 |
| 独立 production 配置预检 | `backend/scripts/production_preflight.py` + CI `production-config` job：缺/短 `JWT_SECRET`、缺 `DATABASE_URL`、生产假短信、站内支付误开、compose 告警变量白名单、nginx CSP/HSTS | 本机 **8/8 PASS**（逐条打印拒绝原因） |
| 定期 Firefox/WebKit + 关键手机闭环 | `.github/workflows/cross-browser.yml`（每日 18:17 UTC + 手动）+ `playwright.crossbrowser.config.ts`（Firefox/WebKit 跑观看/认证/公共页/设计走查；mobile-chrome/mobile-iphone 跑 `*mobile*.spec.ts` 的移动闭环） | 未首跑（需在 GitHub 触发；本机未装 Firefox/WebKit 浏览器） |
| GPU 独立锁定/审计/SBOM | `gpu-worker/requirements.lock.txt`（128 包，平台写死在头部）、`gpu-worker/.pip-audit-ignore`、CI 审计 `pip_audit_gate.py --no-deps`、CycloneDX artifact、Dependabot `/gpu-worker` | 本机审计 **通过**：14 条公告全部逐条接受（torch/transformers，复核期 2026-11-30，理由见 ignore 文件）；SBOM 实测 128 components（CycloneDX 6.1.3，`requirements` 位置参数） |
| 无 GPU 的 PR 不下载模型 | GPU job 仍只装 `requirements-ci.txt`；审计与 SBOM 只读锁文件，不 `pip install -r requirements.lock.txt` | job 定义即证据 |
| 故意破坏静态资源/媒体缓存能被拦住 | 现有生产 smoke 已断言 HTTPS/CSP、匿名媒体 403、认证后不复用共享缓存、Range 206 | 2026-10-31 实跑：Docker Desktop 隔离栈上四条负控（删 CSP、删 Permissions-Policy、改 `/media/` 的 `Range`、加 `X-Powered-By`）逐条变红，恢复配置后绿；见 [`production-smoke-2026-10-31.md`](production-smoke-2026-10-31.md) |

## 遗留（明确不在本轮「已完成」里）

1. **生产 smoke 实跑与负控**：已于 2026-10-31 完成（Docker Desktop 隔离栈，四条负控逐条变红、恢复后绿），
   过程中修掉一个生产包 TDZ 崩溃与两处过期断言，见
   [`production-smoke-2026-10-31.md`](production-smoke-2026-10-31.md)。仍未做的：`PRODUCTION_REGRESSION=1`
   整批回归、Firefox/WebKit 首跑、原 PowerShell 脚本原样执行。
2. **A12 放量**：埋点与迁移上生产后观察两周；`metrics` 口径版本 1 的生效日要写进发布记录。
3. **GPU 锁的平台**：当前锁按 Windows/py312 解析（本机 GPU worker）。若部署迁到 Linux，必须用
   `gpu-worker/scripts/lock_requirements.py` 重新生成，并在锁头更新平台。
4. **torch/transformers 公告**：whisperx 3.8.6 钉 `torch~=2.8.0`，14 条接受项在 2026-11-30 到期前要么升级
   整个转录栈并做 GPU 回归，要么重新论证续期。
5. **A11「关键手机闭环」**：现有 production regression 列表包含移动观看用例；本轮没有新增手机真机走查，
   只把夜间跨浏览器与生产预检接进门禁。
