# 本轮验证清单

日期：2026-10-29。代码基线见主报告。以下只记录本轮真实执行结果，过去的审计/截图/CI记录不算本轮通过。

## 可重复检查

| 检查与环境 | 本轮结果 | 证据 |
| --- | --- | --- |
| 前端 `npm run check` | **通过**：设计系统、会话写入、tsc、ESLint、Prettier | [frontend-check.txt](evidence/frontend-check.txt) |
| 前端 `npm run test:unit` | 首次Vite临时文件rename EPERM，0断言；仅改该进程TEMP/TMP后同命令**28文件/312测试通过** | [重试结果](evidence/frontend-unit-workspace-temp.txt)、[首次环境失败](evidence/frontend-unit.txt) |
| 默认 `npm run build` | **失败，exit1**；受限和开放本机权限两次均为Turbopack/PostCSS子进程在连接前退出。未确定根因，不认定CSS语法错，也不再笼统归因沙箱 | [默认构建](evidence/frontend-build.txt)、[初次构建](evidence/frontend-build-sandbox.txt) |
| `npm run build -- --webpack`诊断对照 | **通过，exit0**；46/46静态页生成，standalone产物存在。只证明对照编译器路径，不能代替默认构建硬门 | [frontend-build-webpack.txt](evidence/frontend-build-webpack.txt) |
| 后端 `ruff check app tests` | **通过** | [backend-ruff.txt](evidence/backend-ruff.txt) |
| 后端 `ruff format --check app tests` | **通过**，313 files already formatted | [backend-format.txt](evidence/backend-format.txt) |
| 后端 `mypy app --ignore-missing-imports` | 原始命令58错/29文件、exit1；按现有39对file:code基线比较，**新增0，基线门通过**。不等于无类型错误 | [backend-mypy.txt](evidence/backend-mypy.txt)、[基线比较](evidence/backend-mypy-baseline.txt) |
| 后端默认全量pytest | **通过，exit0：1406 passed、14 skipped、39 warnings，1755.80秒**；跳过均为PG集成（catalog2/celery4/favorites4/jinshuju2/watch_progress2），未提供可用PG测试URL；warnings为structlog处理器提示。首次Windows asyncio socketpair沙箱限制超时，解除限制后完整重跑，不能算真实PG集成已覆盖 | [全量运行日志](evidence/backend-pytest-unsandboxed.txt)、[首次环境失败](evidence/backend-pytest.txt) |
| cloud `scripts/pip_audit_gate.py`，官方PyPI网络 | **通过，exit0**；无新增/未处理公告、0条实际接受项，15条旧GPU豁免为stale；未修改豁免 | [pip-audit-cloud-official-network.txt](evidence/pip-audit-cloud-official-network.txt) |
| `npm audit --omit=dev --registry=https://registry.npmjs.org`，官方网络 | **失败，exit1**；lockfile运行依赖集合3个受影响包（1 critical、2 high）。公告前提/修复目标见OPS-01；不是最终镜像SBOM/可利用性证明 | [npm-audit-runtime-official-network.json](evidence/npm-audit-runtime-official-network.json) |
| GPU-worker单测/lint | **未执行**：指定独立虚拟环境不存在；没有猜换系统解释器或下载模型 | [ops.md](ops.md) |

后端命令均使用 `backend/.venv/Scripts/python.exe` 并设置 `PYTHONUTF8=1`。未安装或升级项目运行依赖、未更换锁文件、未修改检查器/基线。

## 缺陷复现与环境探测

| 操作 | 结果及解释 | 证据 |
| --- | --- | --- |
| 执行原始analytics与分页hook，受控时钟/传输/生命周期 | **成功复现**短句与seek计时问题、翻页失败后跳页。不是浏览器E2E通过 | [frontend-repros.cjs](evidence/frontend-repros.cjs)、[analytics JSON](evidence/analytics-watch-time-repro.json)、[分页JSON](evidence/pagination-retry-repro.json) |
| 后端内存SQLite/fake Redis及临时媒体的6项复现 | **6 passed / 2 warnings**表示6个缺陷按预期出现：回调丢tail、overview时长错、refresh分叉、试卷重复答案、旧录音残留、长密码500。不是修复后验收 | [test_backend_findings.py](evidence/test_backend_findings.py)、[复现日志](evidence/backend-findings-repro.txt) |
| CI测试短密钥构造Settings | 被非development的32字符规则拒绝，与workflow环境冲突，**成功复现CI配置缺陷** | [ci-jwt-repro.txt](evidence/ci-jwt-repro.txt) |
| 真实entrypoint + 假alembic固定exit17，隔离PATH | migrate-only最终exit0，**成功复现迁移假成功**，不接触数据库 | [entrypoint-migration-failure-network.txt](evidence/entrypoint-migration-failure-network.txt) |
| 指标聚合/漏斗内存库复现 | 同一记录重访将历史日期桶移动；试用Pro可大于收词人数。SQLite完整API日期映射与PG不同，已明确标注，**不冒充PG整链路验证** | [reproduce-metrics.py](evidence/reproduce-metrics.py)、[最终结果](evidence/metrics-reproduction-final.txt) |
| 本机已有API `/health` | **503 degraded**，environment=development，DB ConnectionRefusedError、Redis ConnectionError；同时docker ps为空。只描述本机取证状态，不代表生产停机 | [local-runtime.json](evidence/local-runtime.json) |
| Playwright现有观看fixture套件，Chromium、单worker | 启动命令失败，13项均在launch缺少`chromium_headless_shell-1223`失败，**业务断言未执行**。fixture用受控API/本机媒体，本来也不代表真实后端闭环 | [watch-browser-tests.txt](evidence/watch-browser-tests.txt) |
| 安装对应锁定版本Chromium到node_modules缓存，单次尝试 | **失败**：cdn.playwright.dev DNS ENOTFOUND；未继续重试或改测试以放行 | [playwright-browser-install.txt](evidence/playwright-browser-install.txt) |
| ego-browser本机页面 | 首页跳至登录，但document仍loading、body为空；截图CDP超时；改用127.0.0.1公开页仍超时。**视觉走查未完成**，不把它归因产品布局错误 | [浏览器取证记录](evidence/browser-observations.md) |
| 一次性Postgres迁移/实库验证尝试 | 使用已有镜像，容器初始化后收到fast shutdown并exit0，触发来源未明；执行迁移时端口拒绝，未完成迁移/实库验证。容器与其匿名卷已清理，未触及原有DB或用户服务 | [容器状态](evidence/postgres-container-state.txt)、[容器日志](evidence/postgres-container-log.txt)、[迁移失败日志](evidence/migrations-postgres.txt) |

## 本轮未执行的验收

完整真实用户端到端、390/1440当前视觉矩阵、键盘/读屏/axe、Firefox/WebKit、生产镜像与HTTPS nginx smoke、真实GPU听校/吞吐、生产查询EXPLAIN与压测、覆盖率硬门、生产备份恢复演练与真实留存分析均**未执行**。

静态样式门不证明可访问性完全合格；Webpack对照不证明默认构建正常；默认SQLite套件不证明PG锁语义；cloud requirements解析集合不等于已部署容器的实际安装集合，依赖扫描也不证明最终镜像无系统包漏洞。每项缺口已在执行计划中分配后续关闭条件。
