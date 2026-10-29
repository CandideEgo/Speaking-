# 运维、依赖与 GPU 组件审计（2026-10-29）

本报告核对当前仓库代码与配置，并执行隔离检查；未访问生产、未部署、未启停服务、未写业务数据库。文件行号对应本次审计工作树。配置缺口不等同于已证实生产故障，生产实际覆盖配置、备份和监控仍需另行取证。

## 已执行检查

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| 前端运行依赖审计，官方 npm registry | **失败：3 个受影响依赖包，1 critical、2 high**，exit 1；不是 3 个公告，Next 包内含多项公告 | `evidence/npm-audit-runtime-official-network.json` |
| npm 镜像源与沙箱官方源查询 | 无法完成，DNS ENOTFOUND；开放网络后的官方源扫描才得到有效结果 | `evidence/npm-audit-runtime.json`、`evidence/npm-audit-runtime-official-registry.json` |
| cloud pip-audit，官方 PyPI | **通过，exit 0**：cloud 依赖无未处理公告、0 条实际接受项；15 条旧 GPU 豁免均为 stale。此前 TEMP 权限和网络失败不计通过，开放网络重试才完成有效扫描；临时解析目录已清理 | `evidence/pip-audit-cloud-official-network.txt`，失败尝试见同名前缀日志 |
| 迁移失败返回值隔离复现 | **确认缺陷**：把 `alembic` 替换为固定 exit 17 的假程序，执行真实 entrypoint 的 migrate-only，观察 exit 0 | `evidence/entrypoint-migration-failure-network.txt` |
| GPU worker pytest / ruff | **未执行**：规定的 `gpu-worker/.venv/Scripts/python.exe` 与 `ruff.exe` 均不存在；未替换解释器、未下载模型 | 文件存在性检查 |
| 生产镜像、HTTPS nginx 和四浏览器验收 | **未执行**：本轮未创建隔离容器；审查现有 smoke 与 CI 配置 | `frontend/scripts/production-smoke.ps1`、`.github/workflows/ci.yml` |

## OPS-01 / P1：运行依赖硬门失败，应先完成受控升级

**置信度：高（锁文件 + 官方实时审计 + 上游公告），当前应用可利用性仅部分核对，未做攻击复现。**

| 包 | 当前锁定版本、证据 | 审计严重度 | 已核对修复版本与条件 |
| --- | --- | --- | --- |
| next | `frontend/package-lock.json:3459`，16.3.7 | critical（包内多公告） | 16.4.1 修复 2026-10-14 公告；升级后须重新扫描全部公告 |
| sharp | `frontend/package-lock.json:3970`，0.35.4 | high | >=0.35.5；上游说明 glibc Linux 下特定运行条件与 SVG 解码可能 RCE |
| source-map-js | `frontend/package-lock.json:4060`，1.2.1 | high | 1.2.2；恶意 indexed source-map offset 可阻塞事件循环；未发现业务接收用户 source map 的入口 |

官方公告与项目实际前提：

- [Next use-cache RCE 公告](https://github.com/vercel/next.js/security/advisories/GHSA-673q-mjm6-r5xr)：需要 Cache Components 和返回多个 typed array 的 `use cache` 函数；当前 `frontend/src` / `next.config.js` 检索未发现该功能配置与函数，不能认定本应用已可利用。
- [Next Image Optimization RCE 公告](https://github.com/vercel/next.js/security/advisories/GHSA-2464-fhr4-w9xw)：针对 glibc Linux 的图片优化依赖；本项目 `frontend/next.config.js:45` 为 `unoptimized: true`，`frontend/Dockerfile.prod:23` 使用 Alpine，缩小已知攻击面。
- [Next Server Actions DoS 公告](https://github.com/vercel/next.js/security/advisories/GHSA-p3m5-59mp-jv5r)：需要至少一个 Server Action；源码检索没有 `use server`。不能把扫描命中直接写成已确认业务 DoS。
- [sharp 维护者公告](https://github.com/lovell/sharp/security/advisories/GHSA-wq5f-xc86-pv6w)与 [source-map-js 修复发布](https://github.com/7rulnik/source-map-js/releases/tag/v1.2.2)。

影响：`.github/workflows/ci.yml:201-203` 的既有 `npm audit --omit=dev` 硬门会因当前依赖失败；新安全修复无法通过现有版本锁自然获得。这是锁文件运行依赖集合的结果，尚未扫描最终 standalone 镜像 SBOM，不能等同于 3 个包全部实际打包并可利用。审计未修改依赖、豁免或门禁。

建议：单独变更升级 Next 至至少 16.4.1，刷新锁文件使 sharp >=0.35.5、source-map-js >=1.2.2；先读本地随包 Next 文档评估兼容性，再使用新的锁文件构建。

验收：官方源 `npm audit --omit=dev` 无未处理公告，`npm run check`、单测、构建通过；隔离生产镜像 smoke 验证登录墙、静态资源、CSP、Range、鉴权媒体不共享缓存；观看页与移动端回归通过。生产镜像另做操作系统包扫描。工期估算 1–2 工程日，含回归。

## OPS-02 / P1：迁移失败被转换成成功返回值，健康检查不校验 schema

**置信度：高，已隔离复现。**

`backend/entrypoint.sh:47-56` 在 `alembic upgrade head` 失败后仅打印 WARNING，migrate-only 仍然 `exit 0`。隔离 PATH 仅包含假 alembic 与 Git Bash 的基础命令，假 alembic 固定 exit 17，真实 entrypoint 最终 exit 0，未接触数据库。`backend/app/main.py:378-412` 的健康检查只执行 SELECT 1 和 Redis ping，schema 缺失、迁移冲突仍可能健康；`docker-compose.prod.yml:248-250` 让 Celery 在 backend 健康后启动，不能消除这个缺口。

现行 deploy skill 已要求检查输出中的 `Migrations OK.` 和 revision（`.claude/skills/deploy/SKILL.md:110-114`），这是人工保护，命令本身仍给自动化错误的成功信号。

建议：至少 migrate-only 保留迁移原始失败状态；发布使用独立迁移阶段阻断切换。将 schema 就绪与活性分开，启动前确认 revision 与发布预期一致，避免让探针每次运行昂贵 schema 全检查。

验收：假 alembic exit 17 时 migrate-only 非零、后续 switch 未执行；正常无变更迁移成功；真实隔离 Postgres 的迁移冲突时就绪失败，老版本保持可访问；不启多个迁移所有者。估算 0.5–1 日。

## OPS-03 / P1：Redis 持久性与业务撤销状态没有明确恢复契约

**置信度：高（配置），丢失量及生产实际运行参数未知。**

`docker-compose.prod.yml:26-45` 仅启动 `redis-server --requirepass`，没有稳定命名的 `/data` 卷、AOF 配置或备份；底部仅声明 pgdata/media（`:393-396`）。不能把它描述成“每次 restart 必然清空”：镜像可能使用匿名数据卷、默认快照；但 down/up、迁机、未复用匿名卷及快照间隙缺少可靠恢复保证。

Redis 同时承载 broker/result（`backend/app/tasks/celery_app.py:17-20`）、token 黑名单（`backend/app/core/token_blacklist.py:34-37,58-62`）、回调去重和限流。丢队列会让已提交 DB 状态等待 watchdog；丢黑名单会使尚未过期的已撤销 token 再次被接受，除非被封禁/改密等 DB 检查另行拒绝。

建议：明确哪些状态可丢、哪些必须持久；命名卷 + AOF/刷盘策略 + 备份，或分离可丢缓存与持久 broker/会话撤销状态。队列任务仍需幂等，持久化不等于 exactly-once。

验收：隔离环境制造队列与撤销 token，执行容器替换和重启，确认队列恢复、撤销状态保持；模拟 abrupt failure 记录实际数据损失窗口；broker 丢失后可按 DB 状态安全恢复任务。估算 1–2 日。

## OPS-04 / P1：GPU worker 的队列边界没有对应服务器权限边界

**置信度：高（标准配置），生产额外 ACL/SSH 限制未核验。**

GPU worker 只声明单队列（`gpu-worker/gpu_worker/celery_app.py:32-38`），启动闸只拒绝 DB/OSS 变量（`gpu-worker/scripts/start_gpu_worker.py:77-93`）。但云端 Redis 仅用一个 requirepass（`docker-compose.prod.yml:28`），GPU 配置指向同一 Redis 默认凭据（`gpu-worker/README.md:100,132`），配置中没有 ACL 身份和 key/command 限制。客户端只消费 GPU 队列，不能阻止持该凭据的受陷机器读取/篡改云端队列、删除撤销 key 或写伪造任务。因此 README :182 的“被拿下也读不到用户数据”超出了已实现边界。

隧道脚本还使用 admin SSH 账户（`gpu-worker/scripts/gpu_worker_tunnel.ps1:36-46`）；未核验服务端 authorized_keys 是否限制端口和禁用 shell，不应断言已经有宿主机 shell 权限。

建议：给 GPU 单独 broker/独立凭据，或经过验证的 Redis ACL/key-prefix 隔离；Kombu 的共享 unacked 与 binding keys 需一起测试。为隧道用受限账户/受限 key，仅允许目标 Redis 的转发。限制回调密钥的破坏范围并制定轮换流程。

验收：GPU 身份能够取 GPU 任务、写对应结果与心跳；读取 token_blacklist、向 cloud celery 队列推任务、FLUSHALL、额外转发与 shell 均被服务端拒绝；停机重试与回调仍正常。估算 2–3 日，需隔离基础设施验证。

## OPS-05 / P1：标准 Compose 无法传入已实现的告警和 Sentry 配置

**置信度：高（标准部署配置），线上是否另有覆盖未知。**

`backend/app/core/config.py:232-238` 的 Sentry DSN 与告警 webhook 默认空，`backend/app/main.py:57-66` 仅在 DSN 存在时初始化，`:214-219` 为空只警告并退回站内管理员通知。生产 Compose 的 backend/celery/beat environment 是显式白名单（`:84,192,269`），没有 `SENTRY_DSN` 或 `ALERT_WEBHOOK_URL/SECRET`，没有 env_file；`backend/.dockerignore:6-7` 排除 `.env*`。因此仅把这些值写入宿主 .env 并不会开启它们。

另 `docker-compose.prod.yml:253-255,294-296` 关闭了 worker/beat 的 HTTP healthcheck，避免误报本身正确，但没有替代 worker/beat 探针；Flower 可选且日志聚合完全注释（`:309,368-391`），没有 Prometheus scrape/告警规则。代码暴露 metrics 不等于监控已运行。

建议：透传必要配置，给 Web/worker 按职责使用最少密钥；增加外部 uptime + worker 心跳/队列年龄/beat 到期、管线失败率、错误率和磁盘容量告警；为关键告警定义负责人和静默规则。

验收：在隔离环境触发已脱敏测试异常，站外通知收到 request_id/video_id，Sentry 收到事件；worker/beat 停止或队列积压在约定窗口内告警；DB 故障时也有独立通道。估算 1–2 日。

## OPS-06 / P1：有发布前备份步骤，但恢复能力尚无可审计闭环

**置信度：高（流程缺口），生产是否有仓库外定时备份未知。**

现行 `.claude/skills/deploy/SKILL.md:91-100` 将 .env、Compose、pg_dump 备份到同机 `/root/backups`，并保存 pre-deploy 镜像。没有仓库内定时异地/加密备份、保留策略、恢复演练或 RPO/RTO 记录；media 命名卷和参考数据 bind mount（`docker-compose.prod.yml:158-162`）不在此 DB dump 内。且备份命令 `pg_dump | gzip` 只有 `set -e` 没有 pipefail，pg_dump 失败可能仍生成合法空 gzip 文件。

回滚说明 `.claude/skills/deploy/SKILL.md:164-170` 假设迁移“purely additive”，但 `backend/migrations/versions/c3d4e5f6a7b8_drop_redeem_and_retired_tables.py:22` 明确只恢复结构、不恢复行；自动重启旧镜像不保证旧代码还能工作。人工迁移与备份记录存在，不能因此推断生产备份缺失或历史数据已经丢失。

建议：版本化备份/恢复脚本，使用 pipefail 与 dump 格式/完整性检查；整合 DB、媒体/OSS、配置密钥、参考词典/试卷与版本清单；定时异地加密保存；按 migration 类别决定回滚或向前修复，演练时测量恢复时间。

验收：模拟 pg_dump 失败不会留下成功标记；全新隔离主机能恢复到同一 revision，关键表行数/抽样媒体 hash/用户学习数据一致，完成一条观看→收藏→复习闭环。建议先约定试运行目标 DB RPO<=24h、RTO<=2h，再用演练实测修正。估算 2–3 日。

## OPS-07 / P2：CI 的生产路径与 GPU 供应链覆盖不足

**置信度：高。**

`.github/workflows/ci.yml:283-292` 只跑 next dev + Chromium；现有隔离生产 smoke 与 mobile/firefox project 未进入 CI。`docker-compose.smoke.yml:33` 后端用 ENV=testing，因此即使启用 smoke，也不会覆盖 production 的配置闸、docs/metrics 隐藏和生产认证配置；它仍有效覆盖生产前端构建与 HTTPS nginx，不能误写成完全没有生产验收。

GPU CI 只安装最小依赖并 mock 模型（`.github/workflows/ci.yml:123-157`），运行时 whisperx/torch/yt-dlp 没有依赖审计门；Dependabot 仅 backend/frontend/actions（`.github/dependabot.yml:8,21,32`），未覆盖独立 GPU requirements。`backend/.pip-audit-ignore:12-19` 将已迁出的 GPU 公告仍留在 cloud gate，本次 cloud 实际扫描证实全部 15 条为 stale；GPU README 说明本组件没有自动门，复核期限与实际扫描组件脱节。

cloud扫描由 `scripts/pip_audit_gate.py` 解析 `requirements-cloud.txt`；其中仍有下界/浮动依赖，未发现完整传递依赖锁。因此本轮cloud审计通过只证明该次解析集合无未处理公告，不能替代已部署镜像的实际包清单与系统包扫描。后续应保留构建依赖清单/SBOM与镜像digest，改善构建可复现性，并按实际安装版本复核。

建议：PR 保留快速 Chromium；生产构建/nginx smoke 与关键移动闭环至少每次发布，Firefox/WebKit 按夜间或依赖升级运行；增加完全独立的 production 配置测试；GPU 单独生成可重现依赖清单、SBOM 与有期限的审计门，重型模型 smoke 可放 GPU 定期执行。

验收：故意破坏生产静态资源、CSP、媒体缓存隔离分别使 smoke 失败；新增 GPU 可达公告阻断对应 job；无 GPU 的普通 PR 不下载模型。估算 2–3 日。

## OPS-08 / P2：mypy 执行故障可能被当作无新增类型错误

**置信度：高（脚本路径），未修改工作流。**

`.github/workflows/ci.yml:82-94` 对 mypy 使用 `|| true`，再只抽取包含 `: error:` 的行。如果命令不存在、配置解析失败、mypy 内部异常或进程提前终止而没有标准错误行，抽取为空后可通过。当前 baseline 门的业务意图合理，需分别处理工具正常发现错误的 exit 1 与执行失败的其它返回值，不应移除 baseline 机制或扩大基线。

验收：正常 0、已知 baseline 错误可接受，新增 file:code 拒绝；模拟 mypy 返回2或命令缺失必须失败。估算 0.5 日。

## 执行顺序建议

1. 先修 OPS-01 依赖硬门与 OPS-02 迁移假成功，避免后续安全修复无法可靠交付。
2. 并行补 OPS-05 站外告警与 OPS-06 恢复演练；在 OPS-03 Redis 与 OPS-04 broker 授权改造前先确认回滚和备份。
3. 再完成 OPS-03/04，随后把已能稳定运行的验收纳入 OPS-07 CI。
4. OPS-08 可独立小变更；验收证据入单一 backlog，每项记录负责人、状态、复核日和可重跑命令。任何生产调整依本次任务范围另行安排。
