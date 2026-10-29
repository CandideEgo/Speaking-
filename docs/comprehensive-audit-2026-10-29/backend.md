# 后端专项审计（2026-10-29）

范围：`backend/` 的鉴权、管线、学习与行为事件、试卷、数据生命周期、数据库与检查门。代码与配置是结论依据；不将旧报告中的问题直接视为仍存在。本次没有修改产品实现，没有调用生产、发送短信或支付，没有向真实用户库写入数据。

## 已执行验证

| 检查 | 结果 | 证据 / 限制 |
| --- | --- | --- |
| `.venv/Scripts/python.exe -m ruff check app tests` | 通过 | `evidence/backend-ruff.txt` |
| `.venv/Scripts/python.exe -m ruff format --check app tests` | 通过，313 files already formatted | `evidence/backend-format.txt` |
| `.venv/Scripts/python.exe -m mypy app --ignore-missing-imports` | 原始命令退出 1，58 个错误 / 29 个文件 | `evidence/backend-mypy.txt`；按 CI 的 `file:code` 口径归一化 Windows 反斜杠后，39 对均在现有 39 对基线内，新增 0 对；**基线门通过，不代表类型无错** |
| 默认全量 pytest（初次，受限沙箱） | 环境失败，未完成 | 收集 1420 项后，首个异步测试初始化 Windows asyncio `socketpair()` 卡住并触发 60 秒 timeout；`evidence/backend-pytest.txt`。不是业务断言失败 |
| 默认全量 pytest（解除上述本机 socket 限制后重跑） | 通过，退出 0；1406 passed / 14 skipped / 39 warnings；1755.80 秒（29分15秒） | `evidence/backend-pytest-unsandboxed.txt`；内存 SQLite / fake Redis。14 个 PostgreSQL 集成用例因无可用测试 URL 跳过，不能算已覆盖；39 条 warning 均为 structlog 的 `format_exc_info` 配置提示 |
| 审计缺陷复现 | 6 项均成功复现，6 passed / 2 warnings / 10.11s | `evidence/test_backend_findings.py`、`evidence/backend-findings-repro.txt`。这些断言刻画现存缺陷，**通过表示缺陷可复现，不是修复验收通过** |
| CI 短 JWT secret 配置复现 | 成功复现预期启动拒绝（退出 1） | `evidence/ci-jwt-repro.txt` |
| 覆盖率门、生产并发容量、生产 DB EXPLAIN、线上真实漏洞状态 | 未执行 | 不把静态审查或 SQLite 测试替代这些证据 |

全部 Python 调用均使用仓库指定的虚拟环境并设置 `PYTHONUTF8=1`。未修改检查器、基线或豁免。

14 个跳过用例分布为 `test_catalog_pg.py` 2 个、`test_celery_tasks_pg.py` 4 个、`test_favorites_pg.py` 4 个、`test_jinshuju_pg_concurrency.py` 2 个、`test_watch_progress_pg.py` 2 个。主审计尝试的一次性 PostgreSQL 容器未稳定运行，本专项未对其重启或执行破坏性 schema fixture；实际 PostgreSQL 并发与迁移验证仍列未执行。

## 已确认的问题与可执行方案

### BE-01 · P1 · GPU 回调提交后入队失败，重试会确认但无法补发 tail

- 置信度：高，已复现。
- 证据：`backend/app/api/v1/internal.py:193` 先提交 `ready_subtitles/translating`，`:199` 再调用 `finalize_video.delay()`；`:106` 与 `:122` 对非 `processing` 的后续回调直接 acknowledged。看门狗 `backend/app/tasks/video_processing.py:979` 将超时任务标为 error，并不补发丢失的 tail。
- 复现结果：第一次模拟 broker 失败后数据库已是 `ready_subtitles / translating / 70`；第二次相同回调得到 200 acknowledged，入队调用总计只有一次。
- 影响：Redis/broker 短时故障或 DB commit 后进程崩溃会让已成功转写的视频丢失后续翻译、下载与发布步骤，需人工重试。
- 方案：将“待派发任务”与状态变更在同一数据库事务落库，由 dispatcher 幂等补发；短期至少记录派发状态和失败原因，允许回调或 reconciliation 对 `ready_subtitles + 未派发` 补发。只把 `delay()` 移到 commit 前会引入 worker 先读旧状态的问题。
- 验收：覆盖 broker 失败、commit 后崩溃、重复回调和重复投递；恢复后最终 ready，字幕不重复且 tail 的业务副作用不重复；待派发积压有告警。
- 预计：后端 2–4 人日；依赖明确管线幂等键与失败恢复契约。

### BE-02 · P1 · CI 显式使用的 JWT secret 与现行配置校验矛盾

- 置信度：高，已直接构造 Settings 验证。
- 证据：`.github/workflows/ci.yml:102` 与 `:242` 都设置 `JWT_SECRET: test-secret-for-ci`；`backend/app/core/config.py:384` 要求所有非 development 环境 secret 至少 32 字符，testing 也适用；`backend/tests/conftest.py:33` 是 `setdefault`，不会替换 CI 的短值。
- 影响：backend job 及使用同一环境的 e2e 后端会在导入 Settings 时拒绝启动；本机使用不同 secret 的测试通过也无法证明 CI 可运行。这里是配置相互矛盾，**不需要放宽安全检查**。
- 方案：两个测试环境改用符合当前规则的固定测试 secret，或每次 job 生成隔离测试 secret；抽取一份 CI 测试环境契约，增加配置预检。
- 验收：完整复用 workflow 的环境变量运行测试收集、迁移和 e2e 后端启动成功；production 的短 secret 拒绝测试继续通过。
- 预计：后端/DevOps 0.5 人日。

### BE-03 · P1 · 试卷提交对两个已读入的未提交会话缺少原子守卫

- 置信度：高，已用确定性时序复现；并未声称 SQLite 验证了 PostgreSQL 行锁。
- 证据：`backend/app/api/v1/exams.py:211` 提交前调用 `get_attempt_detail()`；`backend/app/services/exam_service.py:683` 查询不锁行，`:449` 仅检查传入 ORM 对象的 `submitted_at`；纸卷分支 `:498` 直接追加 `ExamAnswer`，模型 `backend/app/models/exam_test.py:113` 起没有 `(session_id, question_id)` 唯一约束。
- 复现结果：两个独立 session 先各自读到 `submitted_at=None`，随后依次完成写入，三题试卷最终有六条答案，两次调用都成功；这对应两个 HTTP 请求都先读再写的合法并发时序。现有 `test_exams_api.py:128` 只覆盖第二次请求重新读取已提交状态的顺序提交。
- 影响：双击、客户端重试或双标签提交会造成重复答案、重复 `practiced_items` 事件及答题统计膨胀，甚至覆盖第一次分数。
- 方案：在提交事务内按所属用户锁定并刷新 ExamSession，或使用条件 UPDATE 争抢提交权；为适用的会话题目添加数据层唯一约束，先诊断历史重复后再迁移。成绩与学习事件尽可能同事务或有事件补偿。
- 验收：真实 PostgreSQL 并发两次提交只产生一组答案与一次学习事件；明确第二次返回原结果还是 409；不同答案并发也不能覆盖首个成功提交。
- 预计：后端/测试 1–2 人日；依赖确认客户端的提交重试契约。

### BE-04 · P1 · 数据导出与账号注销的媒体清理范围未随功能演进保持一致

- 置信度：高，旧录音残留已在临时目录复现，导出缺项通过明确写入清单验证。
- 证据：`frontend/src/app/privacy/page.tsx:75`–`:78` 声称历史录音用于“账号导出与注销清理”；`backend/app/tasks/account_tasks.py:89` 的 `_gather_export()` 只加载 Vocabulary、LearningRecord、BehaviorEvent、UserPreferences；`:236`–`:252` 的 ZIP 写入清单只有个人资料、上述数据与头像，没有旧录音，也没有当前活跃的收藏/笔记、试卷与听力会话等数据集。`:321` 的 `_USER_MEDIA_SUBDIRS` 只有 `exports`；`:335` 起清理收集头像和导出 ZIP，未枚举 `shadowing/{user_id}`。
- 复现结果：在临时媒体目录创建 `shadowing/{user_id}/legacy.webm` 后执行 `_purge_user()`，User 行已删除，但该录音仍存在。根 CLAUDE.md 对旧文件仍在磁盘的说明与此一致。
- 访问边界：`backend/app/api/v1/media.py:181` 起的 `_shadowing_token_ok()` 仍经统一鉴权校验路径中的 owner id；未发现由此直接引起的跨用户读取证据。账号被删后旧 token 不能解析为现存 User，但磁盘生命周期仍有缺口。
- 方案：建立用户数据清单，逐项定义导出、注销、备份保留与过期策略；按用户目录清理旧音频并记录失败重试；对已失去索引关系的存量文件先做只读盘点再单独执行清理；同步面向用户的实际承诺。此为产品数据契约审计，不作法律合规结论。
- 验收：含所有活跃数据类型与旧媒体的测试账号导出清单完整；30 天清理后目标个人行与媒体均不可读取，删除失败可重试；统计保留数据移除关联；对存量残留产出盘点与处理记录。
- 预计：后端/产品/运维 2–4 人日；存量清理须单独确认范围和恢复点。

### BE-05 · P1/P2 · refresh 轮换是检查后写入，同一个旧 token 能并发换出两条新链

- 置信度：高，已复现检查后写入的竞态。
- 证据：`backend/app/api/v1/auth.py:334` 检查旧 jti 黑名单，`:359` 才写入黑名单，`:361` 生成新的 token 对。二者之间没有 Redis 原子 claim、数据库 token family 或单次消费约束；`backend/app/core/token_blacklist.py` 的写入与读取还是显式 fail-open。
- 复现结果：使两个请求都完成“尚未撤销”的读取后继续，两者均返回 200，生成两个不同 refresh token。复现仅控制时序，不假设 Redis 已损坏。
- 影响：并发客户端刷新可能产生分叉会话；若旧 refresh 被盗，合法用户和攻击者同时刷新可同时延续。该问题不等于无 token 可登录；现有密码变更、封禁和有效期校验仍生效。
- 方案：为 refresh 单次消费提供原子 claim；同时定义多标签刷新冲突的客户端协调和有限重试策略。若需要检测盗用并终止整条链，再引入持久的 token family/session version。普通请求对 Redis 故障的可用性策略与 refresh 凭据消费策略分开决策。
- 验收：同一旧 refresh 并发两次最多一方铸造后继；重放被拒；Redis 故障返回可解释结果而非继续铸新；多标签不会形成无限登录循环。
- 预计：后端/前端/测试 1–3 人日。账号风险预算较低时列 P1，否则作为近期 P2 显式接受。

### BE-06 · P2 · 个人页 overview 把历史累计时长计入最近访问日，与周统计不一致

- 置信度：高，已复现。
- 证据：`backend/app/services/overview_service.py:65`–`:74` 以 LearningRecord.last_accessed_at 为日期，把该记录累计 `time_spent_seconds` 全部加入当天；`:100` 汇成本周分钟。另一个端点 `backend/app/api/v1/learning.py:281`–`:294` 已正确使用每次 watch_time 事件的 server_ts，现有 `tests/test_learning_weekly_stats.py` 甚至明确防守过同类错误，但未覆盖 overview。
- 复现结果：同一用户记录累计 99999 秒，本周 watch_time 只有 300 秒，overview 的本周分钟为 1666，weekly endpoint 为 5。
- 影响：跨周再次打开旧视频会把历史时间重新记到当前周，两个页面给用户相互矛盾的学习反馈；overview 的 days_studied 还会丢失没有语义事件的早期多日观看历史。
- 方案：将逐日观看事实聚合收敛为一个服务或日汇总模型，统一用户本地时区与取整方式；累计时长只用于累计卡片。缺少旧事件时明确历史数据精度，不将累计值伪分配到某一天。
- 验收：跨日、跨周、跨时区边界重复观看，overview、weekly、后台口径一致；补“累计值远大于本周事件值”的回归测试。
- 预计：后端/测试 1–2 人日。

### BE-07 · P2 · 密码 API 接受 128 字符，但 bcrypt 5 对超过 72 字节直接抛错

- 置信度：高，当前本机依赖与 HTTP 调用已复现；未检查生产已安装 bcrypt 版本。
- 证据：`backend/app/schemas/user.py:40`、`:56`、`:143` 允许密码最多 128 个字符；`backend/app/core/security.py:18`–`:23` 直接把 UTF-8 字节传给 bcrypt hash/check，没有处理长度边界；`backend/requirements-cloud.txt:18` 仅要求 `bcrypt>=4.0.0`，允许安装本机当前的 5.0.0。
- 复现结果：83 字节、符合大小写和数字要求的新密码通过 ChangePasswordRequest 校验，但 `/auth/change-password` 抛 `ValueError: password cannot be longer than 72 bytes`。密码登录入参更没有最大长度，已存在密码的账号走 checkpw 时也可能抛错。
- 影响：用户输入被产品接受后得到服务器错误；多字节字符更早触及限制。bcrypt 版本浮动还让新旧环境在“截断/拒绝”之间产生行为差异。
- 方案：统一密码字符/字节契约并在 schema 提供明确可理解的 422；若产品确需支持长密码，选择有版本标识的安全预哈希或密码算法迁移，兼容旧 hash。不要在调用处静默截断，也不要仅降级依赖隐藏问题。
- 验收：72/73 字节、128 字符、多字节 Unicode、注册/设置/修改/重置/登录各入口行为一致；长输入不出现 500，旧密码仍可验证。
- 预计：后端/前端/测试 0.5–2 人日，取决于是否需要算法迁移。

## 架构与质量现状

已经存在且应保留的机制：统一错误 envelope、production 配置 fail-closed、媒体/PDF/WebSocket 复用鉴权链、用户数据归属查询、听力会话提交锁和答案冻结、金数据用户/订单锁顺序、首页内容 generation id / revision / 来源指纹校验、数据库查询形状索引、架构不变量测试、Redis 故障降级与健康探测。这些不是从文件名推测，已阅读相关实现。

主要架构债务是相同业务事实散落在多条读写路径：观看时长存在 BehaviorEvent、LearningRecord、学习档案估算分钟和 overview 自建周聚合；鉴权 token 的消费与撤销职责混在 fail-open 黑名单缓存中；管线 DB 状态和 broker 派发缺少共同持久边界。优先修这些事实与事务边界，收益高于泛化地拆目录或更换框架。

下一轮需验证但本次不作为已复现缺陷的候选：

1. `behavior_service.py:163` 起 watch_time 使用 Python 读改写累计秒数，缺少 SQL 原子加法；多标签同一 user/video 并发可能丢增量。`delta_s` 的语义、上限、重复事件键也未在专用 schema 中定义。需要 PostgreSQL 并发与恶意/损坏 payload 测试。
2. `learning.py:278` 的周窗口和 `func.date(server_ts)` 使用 UTC，而 overview、LearningEvent 使用用户本地日期；周一与午夜附近应补统一时区契约。
3. `listening_service.py:48` 的目录对全部合格字幕 group/count，`overview_service.py:44` 起加载用户全部事件日期/记录，数据量增长后的成本需 EXPLAIN 和实测；目前不能宣称已慢。
4. 大型服务文件与大量 `dict` 返回值增加修改面；用高变动业务边界渐进拆分并消减当前 39 对类型基线。当前门按 `file:code` 比较，只能证明没有新增组合，不能证明已有组合内没有新增具体错误。不要只增加包装层，也不要新增豁免。
5. BehaviorEvent 可匿名写入且缺少代码中的定期保留/聚合清理任务；应先测日增量、表大小与保留要求，再决定分区/归档，不直接实施大表迁移。
6. 本机完整套件的反馈时长值得单独优化。`tests/test_response_contract.py:327` 的 `_schema()` 每次断言都会重新 `create_app().openapi()`；同一类中多次调用可先评估复用不可变 OpenAPI fixture。结合每条异步测试的完整建表/删表测出瓶颈，保持用例与隔离强度，用复用、合理并行和更小 fixture 缩短时间，不能删断言、跳用例或放宽 timeout 来追求速度。

## 执行顺序建议

1. 先修 BE-02 恢复可运行的 CI，并锁定当前迁移和真实 PostgreSQL 集成测试环境。
2. BE-01 与 BE-03 并行：管线派发恢复、试卷提交原子性；都须加入故障/并发验收。
3. BE-04 数据清单与导出/删除测试；存量文件盘点和清理另外安排运维窗口。
4. 明确会话安全预算后实施 BE-05；随后收敛 BE-06 及本地周窗口、活跃天数等统计口径。
5. 最后以测得的 p95、数据库查询与表增长基线选择性能工作，避免在正确性尚未稳定时扩大架构变更。

各项关闭条件：有负责人、合并后的回归证据、失败恢复验证与需要的观测指标；测试“通过”不得仅以 HTTP 状态码作为证据，还要验证持久副作用数量、数据归属和最终状态。
