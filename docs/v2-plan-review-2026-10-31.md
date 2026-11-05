# SeeWord 产品与技术一体化方案 V2.0 · 只读评审

日期：2026-10-31
评审对象：`C:\Users\Fuwei\Downloads\SeeWord_产品与技术一体化方案_V2.0.md`（2026-10-30）
配套交接：`C:\Users\Fuwei\Downloads\SeeWord_Project_Status_Review_V1.md`
评审基线：本仓 `master` `0c922654`（2026-10-31），迭代 1–4 已合并（`30c85999`）
方法：核查两份原文、源码、迁移、测试与证据文件；本轮补核只修改本评审文档，未修改业务代码、未访问生产、未执行迁移。官方协议/SDK 的复核与本次测试范围见 F 节。
方向更新（2026-11-02）：模型调用改为独立网关，路线分 V2.0 / V2.1 / V2.2。本文 D.7 的「现有 LLM 服务增强优先」已被[方向对齐文档](v2-direction-alignment-2026-11-02.md)取代；其余现状、风险与验收结论仍有效。
本文件按交接文档 §11 要求的 A–F 结构输出。

## 0 结论先行

1. **方向与现有底座匹配，不需要另起一套系统。** 账号、题库、判分、词汇、学习事件和模型路由可复用；教学 Agent、个人记忆条目、模型账本、外部授权与 MCP 适配仍需新建，不能把“可复用底座”写成这些能力已具备。
2. **首要内容风险是真题解析质量。** `backend/data/papers/*.json` 共 **7915 条题目记录**，770 条（9.7%）有 `explanation`，去重后只有 10 条占位文本（`这里是第46题的解析...`）；guojiya / xdf 来源为 0 条。该统计含重复来源，既不是库内唯一题数，也不是生产覆盖率；原稿 7895 漏算了单对象 JSON 文件的 20 题。
3. **模型计量必须覆盖全部出口。** `_chat`、备用词注客户端与翻译引擎共三类 SDK 调用路径，当前均无账本和预算阻断。词注预热已有局部 semaphore，缺的是覆盖所有调用、跨请求/进程的用户与全局并发闸。
4. **产品级外部接入尚未实现。** 未发现 MCP 服务端、tool loop、OAuth/scope 或 `ExternalConnection` 表。现有 JWT 缺少面向外部资源的 audience/scope/连接撤销契约；问题不在 HS256 算法本身，不能把网页登录令牌直接交给外部宿主。
5. **建议顺序反过来：先质量门与证据字段，再 hint 状态机与最小工具层，再网页教学闭环，最后 MCP PoC。** 先做 Agent 框架选型会放大解析质量问题，而不是解决它。
6. **另一个前置是修正题目快照与尝试模型。** 现有真题首次提交仍读当前题库；同一教学流程中的初答、提示后复答、看答案后复答还没有独立记录。四周是条件式实施顺序；只读 MCP 仅能验证连通查询，原方案的 BYOA 最小成功故事还需要受限交卷、两端一致与撤权验证。

## A 现状证据表

判定口径：已实现 / 部分实现 / 未实现 / 已退役；每条都给出文件与关键符号。

| 能力 | 判定 | 证据 |
| --- | --- | --- |
| 视频、字幕、逐词点读、媒体 Range 与 `?token=` 鉴权 | 已实现 | `backend/app/api/v1/media.py`；`backend/app/api/dependencies.py::resolve_token_user` |
| 视频处理 head/GPU/tail 三段管线 | 已实现（GPU 已拆独立组件） | `backend/app/tasks/video_processing.py`；`gpu-worker/gpu_worker/tasks.py`；`pipeline_dispatches` outbox |
| 词汇保存 | 已实现，但一词一条 | `backend/app/models/learning.py::Vocabulary`，唯一键 `(user_id, word)`，单值 `video_id` / `subtitle_id` / `context_sentence` |
| 词汇训练轮次状态机 | 已实现 | `backend/app/models/study_session.py::StudySession`（`active/finished/abandoned`）+ `StudySessionItem` |
| 复习调度 | 已实现（S6 分档；SM-2 冻结遗留） | `backend/app/services/sr_service.py::calculate_review_interval`；`calculate_next_review` 仅剩 `practice_service.submit_practice_results` 调用 |
| 复习状态与历史日志 | 前者已实现；逐次日志未实现 | `StudySessionItem` 保存轮内 `correct_streak/wrong_in_round/status`，重复作答会 UPDATE；无统一跨轮 ReviewLog、逐次调度前后状态及 `scheduler_version`，不能从这些聚合状态重放调度 |
| 听力听写 | 已实现且较完整 | `backend/app/services/listening_service.py::start/payload/grade/submit`；会话冻结题面、草稿、服务端判分、逐词 diff、提交前剥离原文 |
| 真题题库 | 部分实现 | `backend/app/models/exam_test.py::ExamPaper/ExamQuestion/ExamSession/ExamAnswer`；`source` 只在卷级，题级无来源、无版本、无证据区间 |
| 真题解析 | 本地源未发现可用解析，生产待查 | `ExamQuestion.explanation` 可空；源记录 9.7% 有值且均为占位符；`api/v1/exams.py` 的结果响应在提交后才带答案/解析 |
| 真题判分与会话 | 已实现原子提交；开考快照不完整 | `exam_service.py::_claim_submit` 保证一次交卷及结果重放；`create_paper_session` 不建题目快照，`submit_answers` 首次判分读当前 `ExamQuestion`；见 A.2 |
| 错题重做 / 教学复答 | 前者已实现，后者未实现 | `exam_service.py::create_wrong_redo_session` 已支持另起错题会话；无同教学流程的 hint、错因假设及初答/复答关联；结果页仅有 `explanation` 文本位 |
| 学习事件 | 已实现（契约 v2） | `backend/app/models/learning_plan.py::LearningEvent`（`flow_id/source/schema_version`）；`services/event_contract.py` |
| 客户端行为与 RUM | 已实现 | `backend/app/models/behavior.py::BehaviorEvent`（`event_id` 唯一、`flow_id`、`schema_version`）；`frontend/src/lib/webVitals.ts` |
| 学习档案 | 部分实现 | `UserLearningProfile` 聚合（streak、mastery_by_level、每日目标）；无记忆条目、无来源/可信度/过期/删除生命周期 |
| 模型路由 | 已实现 | `llm_provider.py::resolve_provider` 按配置选供应商（非运行时故障回退）；翻译服务另有多引擎回退/竞速；免费/ZDR 为目录配置，非当前服务承诺 |
| 模型调用计量与预算 | 未实现统一能力 | `ai_service.py::_chat`、`_generate_word_notes_one_batch` 的备用 client 分支、`translation/__init__.py::_call_engine` 均需计量；预热 semaphore 仅局部限并发 |
| 鉴权 | 已实现（无 scope） | `core/security.py::create_token`（HS256，`sub/exp/iat/type/jti`）；`dependencies.py::_authenticate`（黑名单、改密失效、封禁） |
| 限流 | 已实现（路由级） | `core/limiter.py`（slowapi，默认 200/min，按用户或 IP）；无 token 预算、无并发闸 |
| 管理员操作审计 | 部分实现 | `admin_service.py` 中的 `logger.info("admin_action ...")`；无数据库审计表 |
| Agent 运行时 / 工具循环 | 未实现 | 在应用源码中未发现工具循环；`AIService` 现有封装主要是 JSON completion，尚无教学工具执行与恢复契约 |
| MCP / OAuth / CLI / Skill | 未实现 | 仓库代码中没有 MCP 实现；依赖里无 authlib/oauth；`.mcp.json` 只是本机开发用 MCP 客户端配置，不是服务端 |
| 对话式固定卡片 | 未实现 | 现有试卷页是固定页面（`ExamRunner.tsx`），无聊天壳、无卡片流组件 |
| 数据导出与注销 | 已实现 | `backend/app/services/account_data.py` 单一清单；`media_cleanup_tasks` 可重试 |
| 退役功能边界 | 已实现 | `app/services/retired_features.py::feature_gone`（410）；退役表已在 `c3d4e5f6a7b8` 删除 |

### A.1 两个必须写进方案前提的数据事实

- **解析是占位符，不是解析。** 对 `backend/data/papers/*.json` 的统计：

  | 文件 | 题数 | 有 explanation |
  | --- | ---: | ---: |
  | `guojiya_cet4.json` | 1860 | 0 |
  | `guojiya_cet6.json` | 1890 | 0 |
  | `guojiya_ky1.json` | 720 | 0 |
  | `guojiya_ky2.json` | 765 | 0 |
  | `papers_cet4.json` | 1200 | 400 |
  | `papers_cet6.json` | 1110 | 370 |
  | `xdf_cet6_2025_06_1.json`（单对象 JSON） | 20 | 0 |
  | `xdf_batch.json` / `xdf_papers.json` | 350 | 0 |
  | **合计** | **7915** | **770（9.7%）** |

  有值的 770 条去重后只有 10 条，均为上述占位串。因此**这批导入源没有证明存在可用专业解析，生产库情况待查**。255 条卷记录按 `(level, year, month, set_no)` 去重为 171 个卷键；题键再加 `number` 为 5595 个。`scripts/import_exam_papers.py::_upsert_questions` 会覆盖同键字段并删除该次来源缺少的题，最终库内容还取决于导入顺序，不能把原始计数当成最终可用题数。
- **来源署名不能证明授权。** 卷级 `source` 写着 `HelloCET (github.com/HashCookie/HelloCET)`、`guojiya.cn`、`cet4-6.xdf.cn`，未见这批材料的授权证明；不能仅凭署名断言“已获授权”或“未获授权”。`api/v1/exam_pdfs.py` 已有受保护的原卷分发入口，MCP 再分发与原站使用都需逐来源核查；摘要/深链本身也不自动消除权利风险。

### A.2 已有快照与日志的实际边界

- **真题不是全程按开考快照判分。** `create_paper_session` 只创建会话；daily/wrong_redo 虽创建 placeholder 快照，`submit_answers` 首次仍 SELECT 当前题库并用 `q.answer` 判分。幂等重放的 `_submitted_payload` 才使用 `ExamAnswer.question`。导入期间改题/删题会影响首次判分，daily 的首次返回与后续重放还可能使用不同答案/解析。需在所有模式开始时冻结题集、题面、标准答案与证据版本，提交和重放共用该快照。听力 `ListeningSession.questions` 是可参考的现有实现。
- **一次考试会话本身就是一次 attempt。** `ExamAnswer` 的唯一键为 `(session_id, question_id)`，不能靠给同一行加 `attempt_no` 保存多次作答，也不能覆写初答。保留现有 Exam API 的一次交卷语义，教学尝试另建追加记录，见 D.2。
- **现有 A12 关联不等于业务幂等。** `LearningEvent` 没有业务操作唯一键；`emit_event` 用 savepoint 包裹，失败只记录日志。`measurement_service::_event_quality` 将服务端 flow 收进 set，现有重复率只度量客户端意图，不能证明服务端事实不重复。新写入需稳定操作键、唯一约束及失败补偿。

## B V2.0 方案适配度矩阵

| V2.0 要求 | 可复用 | 需新建 / 补齐 | 结论 |
| --- | --- | --- | --- |
| Exam Core：可信题目、答案、来源、考查点、解析版本 | `ExamPaper/ExamQuestion`、服务端判分、已有快照结构（覆盖不全） | 题级来源、内容核验、不可变解析 revision、证据区间及开考快照 | **复用 + 增量迁移**；不回填解析就不宣称权威 |
| Practice Core：状态机、作答、提示状态、确定性判分、重试幂等 | `ExamSession` 的原子提交与错题重做、`ListeningSession` 草稿/冻结题面 | 修复开考快照；教学会话、逐次 attempt、提示/揭晓暴露、恢复与幂等键 | 复用判分规则；增量实体保存历史，保留旧接口与唯一键 |
| LearningEvidence：actor、origin_host、result、is_verified | `LearningEvent` + `flow_id/source/schema_version`；A12 对账 | `actor` / `origin_host` / `is_verified` / `attempt_id`；把「外部 Agent 自述」与「服务端判分」分列 | **复用事件总线，不建第三套**；新增字段与 version 升级 |
| VocabularyOccurrence：一词多语境、可追溯时间区间 | `Vocabulary` 的 `subtitle_id/context_sentence` | 新的 occurrence 表；保留 `(user_id, word)` 作为「词卡」主记录，occurrence 作为子表 | 新建表 + 向前迁移；不改现有唯一键，避免破坏 API |
| ReviewCard / ReviewLog：scheduler_version、rating、next_due、events | `Vocabulary` 的调度字段；`sr_service` | `review_logs`（逐次评分、间隔、算法版本）；`scheduler_version`；B04 影子对照 | 新建日志表；S6 继续作为线上算法，日志仅供影子/回放 |
| PersonalMemory：条目、来源、可信度、过期、可删 | 账号数据清单、隐私页、注销清理 | `personal_memories` 表 + CRUD + 导出/注销纳入 `account_data` | 新建；按用户范围，先不做向量图谱 |
| ExternalConnection：user、host、scopes、granted/revoked | 现有登录身份、`resolve_token_user` 单一校验链 | `external_connections` 表；OAuth 2.1 授权服务器或受限令牌；scope 校验；撤销 | 新建；MCP 必须走同一用户身份，不另建账号体系 |
| ModelCallLedger：task、model、tokens、latency、status、estimated_cost | 任务路由、现有三类调用路径 | 统一计量封装、每次供应商尝试账本、usage、原子预算预占/结算与共享并发闸 | **增量改现有服务**；先私测，详见 D.6 |
| Agent Runtime | `AIService` 的调用封装；现有 service 层 | 工具执行、流式/恢复、回合/预算/超时上限；Pi SDK 与最小 Loop 对照 | 当前倾向 Python 最小 Loop；选型须待同题 PoC，见 D.7 |
| MCP / Skill / CLI | 现有 FastAPI 路由与账号身份 | 按宿主锁定协议版本的 Streamable HTTP、授权/撤权、受限提交、兼容矩阵 | 先只读冒烟，再授权写入闭环；失败可降级但不算 S1.5 完成 |
| 对话流 + 固定卡片 | 现有设计系统与 `ExamRunner` 的题目渲染 | 聊天壳、SSE、题目卡/证据卡/解析卡/总结卡 | 新建 UI 层；不新增导航 |
| 测量与回归 | A12 的 cohort/事件质量/RUM；CI 门 | 教学事件类型（扩展 `MEANINGFUL_EVENT_TYPES` 需升版本）、黄金题集、宿主回归 | 复用 A12；新增评测门 |

**暂缓（与 V2.0 §16 一致）**：跨用户共享知识库、批量 AI 仿真题、写作评分、全能 Personal Agent、自部署大模型、未验证宿主的语音承诺。

## C 高优先级风险

| # | 风险 | 可能后果 | 现有证据 | 建议的最低控制 |
| --- | --- | --- | --- | --- |
| P0-1 | 解析占位符被 Agent 当权威输出 | 用户得到错误讲解；外部 Agent 放大错误；品牌与教学可信度受损 | 7915 条源记录仅 9.7% 有值，770 条去重 10 条占位串 | 先建「20 道金标题」；未核验不作权威断言，仍可展示有来源的材料与核查状态 |
| P0-2 | 题源与再分发版权 | 外部 MCP 向第三方传送受限材料；现有原卷分发也需核查 | 来源署名存在，但授权范围未证实 | 记录网页展示/模型处理/外部再分发分别允许的范围；仅返回获准内容或访问受控的链接 |
| P1-3 | 新工具泄露答案 | 读题/证据/分析接口绕过练习状态，污染成绩 | `_question_public` 排除答案，但快照含答案 | 普通读题只给公共 DTO；解析工具校验本人 attempt 的提交或显式揭晓态；揭晓后复答单列 |
| P1-4 | 无计量与预算 | 免费模型额度/费用失控；无法回答「哪个任务花了多少」 | 三类调用未计量；路由次数限流不覆盖 token/费用 | `ModelCallLedger` + 调用前预算/并发闸 + 管理端查询 |
| P1-5 | 外部写入无 scope/审计 | 外部 Agent 改写成绩或污染记忆；无法追责 | JWT 无 scope；无 ExternalConnection；审计只有日志行 | scope 最小化、写权限单独授权、撤销、逐次事件 id |
| P1-6 | 记忆隐私与导出/注销 | 新增表未纳入 `account_data`，导出/注销承诺失真 | `account_data.py` 是单一清单，新增表必须登记 | 新表创建同一次提交里更新导出/注销清单与测试 |
| P1-7 | Agent 失败不可观测 | 循环、超时、预算失控无人发现 | A09 的站外告警真实投递与备份 cron 仍未在生产验证 | 先把告警/备份闭环跑通，再放量 Agent |
| P1-11 | 首次判分与快照漂移 | 开考后改题使成绩及重放依据不一致 | `create_paper_session/submit_answers/_submitted_payload` 使用题目的时点不同 | 开考冻结、快照判分；改题/删题后首次及重放一致的回归 |
| P1-12 | 复答覆盖初答或事件重复/丢失 | 假提升、错题本失真、跨宿主重复累计 | 单 session/question 唯一键；LearningEvent 无操作唯一键，发事件失败仅日志 | 追加 attempt；业务幂等键与事务/outbox；分别检查服务端事实重复和缺失 |
| P1-13 | 内容提示注入与身份伪造 | 题干/字幕/记忆中的指令诱导越权 | 拟开放工具尚无输入输出与身份上下文契约 | 严格 schema/限长；身份与 scope 服务端注入；不开放任意 URL、shell、SQL 或模型自填成绩 |
| P1-14 | 个人数据出站超出现有隐私说明 | 用户授权与实际模型输入不一致 | `frontend/src/app/privacy/page.tsx` 目前只描述 AI 接收字幕且不含个人信息 | 教学私测前明确用途、供应商与最小出站字段；记忆删除同时覆盖检索与缓存；ZDR 不能只凭配置承诺 |
| P2-8 | 会话负载进入现有 Celery/Redis | 长回合占用 worker，影响转写与管线 | 默认 `celery` 队列承载管线首尾；GPU 队列独立 | 若引入异步长任务，单独队列/worker 与超时/取消；进程内交互另设共享并发闸 |
| P2-9 | 前端聊天化导致导航膨胀 | 与「保持简洁、不新增导航」的既定原则冲突 | 现有 `(main)` 20+ 子布局 | 嵌入现有试卷页的「讲解模式」，不新增一级入口 |
| P2-10 | 教学事件破坏 A12 口径 | 分母/留存口径漂移 | `event_contract.py` 版本只增不改 | 同步类型/source/版本及消费者；仅按明确口径评审是否纳入 `MEANINGFUL_EVENT_TYPES`，见 D.6 |

## D 推荐目标架构与变更边界

### D.1 服务边界

保持单后端，不新起网关服务：

```
FastAPI（现有）
├─ Learning Core（现有 service 层）
│  ├─ exam_service / listening_service / vocabulary_service / sr_service
│  ├─ 新增 teaching/：evidence_service、hint_service、tool_registry
│  └─ 新增 memory_service、model_ledger_service
├─ Agent Runtime（新增，进程内模块）
│  ├─ 最小 Loop：模型调用 → 工具选择 → 工具执行 → 结果回填
│  ├─ 工具白名单：只调用 tool_registry，不直接拿 AsyncSession
│  └─ run 状态、恢复游标、预算/回合/超时/取消闸
├─ Model Gateway（增量，不是新服务）
│  ├─ llm_provider：路由（现有）
│  └─ 三类 SDK 出口共用计量/预算封装（新增，见 D.6）
└─ MCP Adapter（新增路由或独立 ASGI app）
   └─ 只做协议适配，调用上面的 service；不拥有学习规则
```

**硬边界**：Agent 运行时与 MCP 不直接访问数据库，均经受控 service。新增教学/外部入口显式传服务端构建的身份上下文（`user_id/request_id/connection_id/scopes`）；这些字段不能由模型参数或外部 payload 决定。现有后台任务也需计量，可使用明确的系统 actor，不强行伪造用户。

工具以严格 schema 校验输入/输出、对象归属、状态和长度。字幕、题干、外部文字、个人记忆均是不可信内容；不能执行其中的命令，也不开放通用 shell、SQL、任意 URL 抓取或修改标准答案的工具。MCP 宿主使用自己的模型时，SeeWord 只计量本服务实际发生的调用，不能声称看得到宿主全部 token/聊天历史。

### D.2 数据增量（全部向前迁移）

- 题目与解析版本：`exam_questions` 增加题级来源、当前版本引用与核验状态；`exam_analysis_revisions` 追加保存题面/标准答案、考查点、正确项与干扰项解析、来源 revision/hash、审核人/时间。版本状态 `draft→verified→retired`；来源改动使当前核验失效，已开考会话继续引用原不可变版本。不能仅增加一个可覆盖的 `analysis_version` 字段。
- `exam_evidence`：关联题目/解析 revision，记录来源定位、区间单位与起止边界（如字符区间或音频秒）、证据类型、来源 hash。区间越界、版本不符或无权使用时不能发布。既有 `exam_sessions/exam_answers` 补齐开考快照与版本引用，不改变原一次交卷语义。
- `teaching_sessions` / `teaching_attempts`：教学流程、当前题/状态、乐观锁 revision；逐次追加 `question_key/attempt_no/user_answer/grading_result/hint_level/revealed_at/occurred_at/verification_method`、冻结题目/证据版本、业务幂等键及 payload hash。唯一 `(teaching_session_id, question_key, attempt_no)` 与用户范围的操作键；初答、提示复答、揭晓后复答分开。保留原 `ExamAnswer` 唯一键和成绩，不覆写初答。
- `teaching_feedbacks`：用户范围的自述/待验证诊断，含内容、来源宿主/会话、发生时间和稳定操作键，默认 unverified。T5 先持久保存，T8 再接版本化事件与对账；不是个人长期记忆 CRUD，也不以旧 `emit_event` 作为唯一存储。
- `vocabulary_occurrences`：词卡子表，含 `vocabulary_id`、来源类型/id/revision、原句、时间或文本区间、去重键；旧单值来源作为可追溯 legacy occurrence，不编造缺失时间戳。**本四周延期**，不假称已经满足一词多语境。
- `review_logs`：`vocabulary_id`、稳定操作键、发生时间、actor/source、rating、`scheduler_version`、必要调度输入与前后状态（含 interval/next_due）、flow。与 `apply_review` 同事务、重放不二次推进调度。旧聚合不能回填成真实逐次日志；轮内记录会覆盖且有 30 日清理，不能作历史替代。**本四周延期**，线上继续 S6。
- `personal_memories`：`user_id/category/content/source_type/source_ref/confidence/verification/version/created_at/updated_at/expires_at/deleted_at`。自述、模型假设、可验证结果区分；修订留版本，检索过滤已删/过期项，删除清理缓存。**完整 CRUD 本四周延期**；若后续建表，同步隐私说明与账号生命周期。
- `external_connections`：用户/宿主/授权 scope、凭据标识或 hash、签发/过期/撤销时间、最后使用时间。凭据明文、hash、refresh token 不进入普通导出或日志；无公开 OAuth 也不能省略私测连接的身份/撤销。
- `model_call_ledger`：`logical_call_id/provider_attempt_id/request_id/flow_id/run_id/task/provider/engine/model/model_version/user_id`、输入/输出 token、usage 状态、耗时、结果/错误/取消、估算费用及价格版本。无 usage 记 unknown，不填伪造的 0；不保存完整 prompt、私聊或密钥。
- `learning_events`：新增 `actor/origin_host/attempt_id/is_verified/verification_method` 与业务去重键。内容人工核验状态属于题目/证据，作答服务端判分属于 attempt，二者不得混为一个布尔值。旧服务端成绩按 `legacy_server_grading` 兼容，内容状态可为 unverified；不能把所有旧成绩标成不可信后悄悄排除。
- 教学 `run` 与工具操作记录：持久保存 `run_id`、会话/版本、状态、事件序号、工具名/调用状态、操作键、关联 attempt/账本 id。只存恢复所需的最小数据，保留/导出/删除策略与会话一致，不默认长期存原始对话。

以上是建议的数据契约，非已完成 DDL。新表同一 PR 明确 FK/CASCADE、索引、空值/历史默认与回填批次，补导出字段白名单和注销测试。`account_tasks::_purge_user` 会枚举用户 FK，`account_data::gather_user_data/EXPORT_ORDER` 仍需显式登记；不能只靠新增表名。若账本保留匿名汇总，先定义匿名化与保留期限。

`server_grading` 只表示服务器按标准答案判分，不证明外部答案由用户本人独立完成。外部提交保留 actor、宿主及提示/揭晓暴露，无法证明的作答主体标记 unknown/外部来源；不能仅因工具返回正确就提升掌握度。

发布采用 expand→兼容读写→小批回填→校验→开关放量。回滚优先关闭新入口并回退兼容代码，保留已产生的数据；有新写入后不能把删表 downgrade 当常规回滚。迁移往返只在一次性库验证，生产仍需备份、锁/时长评估和变更窗口。

### D.3 API 与前端边界

- 新增 `/api/v1/teaching/...`：题目卡、证据卡、提示、复答、显式揭晓、会话/run 状态；网页走 `get_current_user`。MCP 用外部连接凭据解析到同一用户，复用封禁/注销等账号有效性策略及 service，不把站内 JWT 复制成外部凭据。
- 提交前普通读题不返回标准答案、解析或能直接揭晓的证据字段；用户可主动“直接看答案”，服务端先记录 reveal 暴露再返回。分析工具按本人 attempt 的状态授权，不能只凭任意 `question_id` 取答案。揭晓后复答仍可学习，但不计无提示成绩。
- 前端在 `practice/exams/[id]` 增加「讲解模式」，复用 `ExamRunner` 的题目渲染与设计 token；聊天壳、SSE 只在教学页内，不新增一级导航。
- 现有 `createApiClient` 继续使用，新增流式接口单独封装，不替换现有客户端。

流式客户端使用带 Bearer 的 fetch 及既有刷新结果处理；不要为了原生 EventSource 把 JWT 放进 URL。现客户端默认 20s 期限并按 JSON 消费，不可直接套在 30s Agent 流上。定义首包/空闲/总时限、心跳、`run_id/sequence/type`、可查询终态及恢复游标；断线后先查状态，不能重复执行工具写入。用户取消、网络断线与工具已提交分别处理。

`nginx.conf/nginx.ssl.conf` 的 `/api/` 目前配置了 WebSocket，但未见 SSE 缓冲控制；新增流需验证及时 flush、缓存/压缩、超时和慢客户端背压。验收经过本机 HTTPS nginx 的生产镜像链路，并用 ego-browser 实际完成 390/1440 宽度操作；Next dev rewrite 的成功不能代替该验收。

### D.4 与现网的差别

| 项 | 现在 | V2.0 第一版 |
| --- | --- | --- |
| 真题解析 | 本地源记录 9.7% 有值，非空值均为占位符；生产待查 | 首批 20 道人工核验；未核验明确标记，不外推到全题库 |
| 作答 | 一次提交、结果页看解析 | 作答 → 提示 → 复答 → 证据定位，全部服务端记录 |
| 学习证据 | `LearningEvent` 只记结果与 flow | 增加 actor/origin/is_verified，区分自述与判分 |
| 模型调用 | 无计量 | 每次调用有 ledger；预算/并发可阻断 |
| 外部 Agent | 未实现 | 白名单宿主：先只读，再额外授权提交；可撤权；未通过写入验证仅算连通 PoC |
| 个人记忆 | 无条目系统 | 本四周仅定契约；完整 CRUD 与导出/注销后续同批交付 |

### D.5 明确不做（与 V2.0 §16 和本仓约束一致）

- 不恢复跟读/周报/成就等退役模块，也不复用其数据表。
- 不切换 S6 复习算法（B04 只影子）。
- 不新建跨用户知识库、不批量生成仿真题、不做写作评分。
- 不把 `default` Redis 身份关掉当成 A10 的收尾（真正边界是轮换云端密码，见迭代 3 证据）。
- 不为让新门禁变绿而放宽 `.mypy-baseline`、`.pip-audit-ignore`、`check-design-system.mjs`。

### D.6 模型计量、事件与外部协议的最低契约

**计量**：统一封装 `_chat`、备用词注直调与翻译 `_call_engine`；一次逻辑请求下按每次上游尝试计量，含业务/SDK 重试、回退、翻译双引擎竞速及取消。供应商不返回 usage 时保留未知状态与估算依据；取消请求不等于供应商未计费。调用前跨进程原子预占预算/并发，调用后结算或释放，进程崩溃有租约回收；失败/业务回滚不能抹掉已发生的调用。交互与后台任务分配独立额度，定义用户日预算、全站硬上限和管理端查询。单请求的 30s 总期限覆盖所有重试/工具回合，不是每步重置；备用模型也必须经过同一教学基准。

**事件**：权威结果是事务内的 attempt；发事件失败必须使新流程整体回滚，或同事务写 outbox 后可补发。`request_id` 用于追踪，业务幂等由稳定 `operation_id/attempt_id` 保证：同键同载荷重放，同键不同载荷冲突。更新 `VALID_EVENT_TYPES`、`FLOW_SOURCES/normalize_source`、前端镜像、契约版本和 measurement 消费方；不要把所有教学事件加进 `MEANINGFUL_EVENT_TYPES`。自述、提示点击、模型代做与揭晓后复答不能直接提高正式分数/掌握度或制造有效学习；历史口径与新实验 cohort 分开。

**MCP**：原方案引用 2025-11-25；复核时官方页面已标注后续版本 2026-07-28，且消息/取消/会话语义有变化。PoC 必须记录宿主与 SDK 实际支持版本并锁定，不能把“Streamable HTTP / 旧 HTTP+SSE / 网页教学 SSE”当成同一接口或默认支持全部版本。[官方传输说明](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports)；旧 HTTP+SSE 被 Streamable HTTP 替代的关系见[原引用版本](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)。

私测若宿主支持自定义 Bearer，可用用户绑定、限时、最小 scope、服务端可立即撤销的受限凭据；不因此宣称完成标准 OAuth 互通。宿主若要求 OAuth，就需提前实现最小授权链或推迟该宿主，不能降为公开无鉴权。标准授权路径要覆盖资源/授权服务器发现、PKCE、资源 audience、scope、redirect 校验及撤销；令牌仅经安全头部传递，不能透传供应商 key。具体逐项要求按选定版本的[官方授权规范](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization)验收，Origin/请求头及重连行为按对应传输绑定验证。

部署验收包含 MCP endpoint 与 OAuth `/.well-known/` 元数据的实际路由，避免被 Next 登录跳转或前端 fallback 接走。所有运行候选（包括 Pi）都必须进入统一预算/计量边界，SDK 自带重试与模型直调也不能绕过。

### D.7 技术选型：当前倾向与推翻条件

以下为设计建议，**比较 PoC 均未执行**，不能写成框架选型已通过。

| 选择 | 当前倾向与仓库依据 | 约束 / 何时应换方案 |
| --- | --- | --- |
| Pi SDK vs 最小 Loop | 先做 Python 最小 Loop 候选，复用现有 async service 与预算出口；Pi 同题对照 | Pi 官方 SDK 面向 Node.js/Bun/TypeScript，需计算跨进程桥接成本；若恢复/流式/维护收益明显再采纳。任何候选都只注册学习工具，禁默认文件/终端能力及自动发现资源 |
| Hermes 式记忆 vs 结构化库 | 借鉴分层思路，先关系库条目和用户内检索 | 当前无向量基础设施；若实际检索集证明普通查询不足，再比较专门存储；不引入全套通用 Agent |
| MCP vs CLI/Skill | 受保护 service + 远程 MCP 先验证一个宿主 | 宿主无自定义 MCP/安全授权时仅网页深链，不承诺零点击安装；CLI 面向终端，Skill 只能指导行为，不能执法 |
| 现有 LLM 服务增强 vs 独立网关 | 三类调用纳入统一封装，保留现有路由 | 当多租户/多服务运营需求经压测证明单体不足，再评估独立网关；避免为账本再增加一套故障面 |

Pi 的语言与默认资源行为依据其 [SDK 使用文档](https://pi.dev/docs/latest/sdk)（2026-10-31 读取）；未安装或集成 SDK。同一 20 道题、10 条教学错误路径对照工具成功率、恢复、流式、P95、token 和维护量，再确定候选；先验证当前供应商所选模型是否真的支持所需工具调用和结构化输出。

**尚未解决的产品分歧**：V2.0 §1/§11 写 FSRS/ts-fsrs；现有开发计划 B04 明确为自研影子、禁止直接移植。近期继续 S6 并积累可回放日志只是兼容决策，不代表满足了 FSRS 目标；后续需单独确认算法路线。代码复用前核查精确包版本与许可证，借鉴思路不等于复制实现。

## E 前四周最小实施路线图

这是**建议的仓库实施切片，不是原 V2.0 阶段的等价承诺**：以 S0/S1 内核和 S1.5 外部交卷为主，仅提前做验证一题所需的薄卡片 UI；完整 S2 教学体验、S3 记忆/多语境/复习日志后移。MCP 只读可以作为中途降级成果，但不能算 S1.5 或最小成功故事通过。

排期按门推进，前一门失败就延后依赖任务。粗估 **41–63 工程人日**（第 1–4 周分别约 12–18 / 13–19 / 8–13 / 8–13），已含相关自动化与联调，尚非任务拆分后的承诺；四周完成假设有两名后端/全栈与一名前端并行。教师核验、版权/供应商结论、宿主账号及运维窗口另计，当前未确认；单人不应承诺四周完成全部切片。

**T0 / 开始条件**：明确首批材料使用与外部传输范围、上游 API 私测许可、内容审核负责人、一个具备 MCP 权限的宿主账号、测试数据/隔离环境、默认关闭的用户白名单开关。网页体验仅私测；公开放量另依赖 A12 有真实样本的两周基线及附录运维遗留闭环，不能以日历满两周代替样本。

### 第 1 周：质量门与账本（S0/S1 前置）

| 任务 | 依赖 | 验收 | 回滚 |
| --- | --- | --- | --- |
| T1 建 20 道金标题：来源、答案、考查点、证据、逐项解析及提示 | T0 的材料/审核结论 | 审核人逐题签字；集内重大答案错误 0；含证据不足/来源冲突样例；记录适用题型，不外推全题库 | 撤下未通过样本，保留版本/审核记录 |
| T2 内容 revision、`exam_evidence`、所有模式开考快照与快照判分 | T1 数据结构 | 一次性 PG 迁移往返及 `check_schema_drift`；开考后改题/删题，首次与重放仍一致；旧 API 兼容 | 关教学入口、回退兼容代码；已写新数据保留，downgrade 仅作隔离验证 |
| T3 三类模型出口计量、共享预算/并发与管理端查询 | T0 私测许可 | 每次上游尝试可查；失败/重试/取消/unknown usage 可区分；多进程并发抢余额不超额；429/`BUDGET_EXCEEDED` 入统一错误契约 | 关闭新 Agent 入口，保留账本与额度约束，不靠撤预算闸维持上线 |

**出口条件**：讲解可定位可信来源版本与区间；每次调用可追溯任务、模型、尝试与 usage（未知显式标记）。这周还不承诺考试听力；现有题库是客观阅读/完形/匹配，视频听写不等于考试听力材料已齐备。

### 第 2 周：hint 状态机与最小工具层（S1）

| 任务 | 依赖 | 验收 | 回滚 |
| --- | --- | --- | --- |
| T4 教学会话与追加 attempt、hint/reveal 状态、乐观锁与恢复 API | T2 | 初答/提示复答/揭晓复答各自可查；同键同载荷重放、不同载荷冲突；PG 两标签并发只写一次，原成绩不变 | 关新入口；保留旧考试 API 与数据 |
| T5 `tool_registry`：按状态取题/证据/解析、提交答案、取复习任务、保存自述 | T2、T4 | 身份/scope 服务端注入；普通读题不泄答案；揭晓需明确动作；跨用户/越状态/伪造 `is_verified` 均拒绝 | 关工具白名单，保留已提交事实 |
| T6 最小 Loop 与 Pi 对照后确定候选；run/工具操作持久化 | T3、T5 | 同组题的工具成功率、恢复、P95、token/维护量记录；最多 6 个模型回合、30s 总期限、单步工具超时、取消与预算上限；两类错误路径见下 | 关闭 run 新建，已提交工具结果保留且可查询 |

**出口条件**：Agent 只能按当前教学状态调用白名单动作，不能改标准答案/他人数据。10 条**教学错误路径**覆盖选错干扰项、证据不足、请求直接答案、提示无效、揭晓后复答等；另设**系统负控**覆盖提示注入、scope 不足、重复写入、预算耗尽、模型 429/超时、取消/断网恢复，不能用技术异常测试替代教学质量评测。

### 第 3 周：网页教学闭环（S1 收尾）

| 任务 | 依赖 | 验收 | 回滚 |
| --- | --- | --- | --- |
| T7 一题讲解模式：题目、证据、解析、总结卡与直接看答案 | T4、T6、隐私说明/出站范围 | 390/1440 实际操作与键盘可用；刷新可恢复、断网不重交；HTTPS nginx 流及时到达且鉴权失效可处理 | 默认关闭、仅白名单；停止新 run 后回旧页面 |
| T8 教学事件契约与服务端事实对账 | T4、A12 契约 | 扩展事件/source 与前端镜像；操作键防重复，缺失可补发；单独检查服务端事实重复；自述/提示/代做不污染旧分母 | 消费方兼容历史版本，保留事件，不回写旧口径 |
| T9 e2e、PG 并发与质量负控 | T7、T8 | 一条真实「初答→提示→复答→证据」；直接揭晓分支；首次成绩不可覆写；重试/并发/断线只产生一份事实 | 关功能入口，保留回归用例，避免以后重新引入缺陷 |

### 第 4 周：带授权的 MCP 与跨入口闭环（S1.5）

| 任务 | 依赖 | 验收 | 回滚 |
| --- | --- | --- | --- |
| T10a 外部连接、限时凭据/scope、用户连接管理与撤销 | T0 宿主授权能力、D.6 | 身份用户绑定；错误资源/过期/撤销/封禁/越权均拒绝；撤销后下一次工具执行失效；凭据不进对话/日志 | 撤销该连接并关闭签发，既有学习记录保留 |
| T10b 锁定协议版本的只读 MCP 冒烟，再开放受限 `submit_answer` | T5、T8、T10a | 一个宿主至少 10–20 次读题/交卷；范围不足不能写；同操作键重试返回原结果；工具成功率分母和失败原因可查 | 先撤写 scope；必要时关适配层，退网页深链 |
| T11 网页一题→外部复答→网页恢复一致性 | T9、T10b | 两端题目/证据版本、标准答案与 attempt 一致；揭晓状态沿用；断网恢复不重计；随时可撤权 | 停外部写入，网页仍读已提交事实 |
| T12 黄金题回归、宿主矩阵与后续契约 | T1、T11 | 20 题和 10 条教学路径不回退；记录宿主版本/平台/协议/授权/读写/恢复成功与失败。形成记忆、occurrence、review log 的后续任务，不计作已实现 | 评测数据隔离；留报告与回归，关闭失败入口 |

**四周不做**：公开开放、多宿主承诺、CLI 安装器、语音评测、写作评分、跨用户知识库、完整个人记忆 CRUD、多语境/复习日志落库或调度切换。OAuth 的公开运营后置；若选定宿主连接必须 OAuth，最小授权实现纳入 T10a。第二宿主和原 V2.0 §15 的双宿主实验后置并标未完成，不能凭首个宿主通过宣称通用兼容。

**学习效果的测量**：20 题只用于质量回归。学习实验预先记录无提示初答、提示暴露、揭晓、复答与约定间隔的延迟复测；主指标可用“未揭晓条件下，延迟复测中答案正确且证据定位正确的比例”，同时报告样本/流失，护栏为重大答案错误、越权、失败率、耗时与成本。看答案后的立即复答不能证明掌握提升；A12 激活/留存也不能替代教学收益指标。当前未设计完成或执行此实验，不作收益结论。

## F 实测结果与未验证事项

### F.1 本轮核查与执行记录

- **数据实算**：9 个 JSON，255 条卷记录、7915 条题记录、770 条非空解析（9.73%，一位小数 9.7%）、10 种占位串；卷/题键去重为 171/5595。单对象文件按一卷处理，与导入脚本一致；统计不导入 `app`、不连接 DB。
- **源码核查**：在 `backend/app`、`frontend/src`、依赖、迁移与相关测试中核查能力边界，未发现产品级 MCP/外部授权、工具循环、个人记忆与调用账本实现。A.2 的快照漂移、三类计量出口、事件失败/幂等边界均是源码结论；未为这些新缺口另做动态复现，不能写成回归已覆盖。
- **本次执行测试**：在 `backend/` 带 `PYTHONUTF8=1` 执行 `.venv/Scripts/python.exe -m pytest tests/test_exams_api.py tests/test_llm_provider.py tests/test_measurement_service.py tests/test_account_data.py -q`，**66 passed / 3 warnings，48.30s**。首次默认沙箱在 asyncio `socketpair()` 初始化超时；沙箱外保持原配置/60s 超时重跑通过。警告来自现有 structlog 异常处理链。该结果只覆盖既有用例，不证明本文新设计已实现。
- **官方资料读取**：用 ego-browser 读取 D.6 所列 MCP 2025-11-25 与 2026-07-28 传输/授权页面、D.7 的 Pi SDK 文档。只核查协议与集成边界，没有连接实际宿主、安装 SDK 或使用用户模型额度。
- **历史记录另列**：`docs/evidence/iteration-4/README.md` 记载全量后端 1493 passed / 6 skipped，随后 PG integration 单跑 17 passed；迭代 3/4 文件记载 A07/A10/A12 的部分生产实施。**不是本次重跑或生产核验**；A10 仍有未完成项，见附录。

数据计数可在仓库 `backend/` 目录复算（PowerShell；只读文件）：

```powershell
$env:PYTHONUTF8='1'
@'
import json
from pathlib import Path
papers = []
for path in sorted(Path('data/papers').glob('*.json')):
    data = json.loads(path.read_text(encoding='utf-8'))
    papers.extend(data if isinstance(data, list) else [data])
questions = [q for p in papers for q in p['questions']]
explanations = [q['explanation'].strip() for q in questions
                if (q.get('explanation') or '').strip()]
paper_key = lambda p: (p['level'], p['year'], p['month'], p['set_no'])
print('papers/questions/explanations/unique_explanations:',
      len(papers), len(questions), len(explanations), len(set(explanations)))
print('unique_papers/questions:', len({paper_key(p) for p in papers}),
      len({(*paper_key(p), q['number']) for p in papers for q in p['questions']}))
'@ | .\.venv\Scripts\python.exe -
```

### F.2 未验证

1. **生产库的解析覆盖率**：本报告统计的是 `data/papers` 导入源，生产库可能包含更多/更少的题；需用 SQL 复核 `exam_questions` 的 `explanation` 非空率与去重值。
2. **题源版权**：HelloCET/guojiya/xdf 的转载许可与二次分发边界未核实；这决定 MCP 能否返回原文。
3. **模型供应商现状**：`llm_provider.py` 的免费模型与价格来自 2026-10-20 的页面，可能已变；需按 V2.0 §7 在部署当天核对。
4. **扣子/豆包宿主兼容性**：V2.0 自身标注为待验证；本轮未取得宿主实测记录或确认可用账号权限，不能据仓库缺少记录推断用户没有账号。安装/授权/读写/语音能力均未验证。
5. **性能与容量**：Agent Loop 的 P95、并发、SSE 稳定性未测；现有 200/min 路由限流不覆盖模型 token 预算。
6. **语音能力**：外部宿主的 ASR/实时工具调用能力本仓无法验证；“RRT”具体指什么仍未定义（V2.0 §16 第 1 问）。
7. **本轮未执行的检查**：全量后端、真实 PG 并发、新快照漂移的动态复现、迁移往返、前端门禁/浏览器走查、生产 smoke、宿主 E2E、预算阶梯压测均未执行；本次仅改评审文档，不能把 E 节将来的验收写作本次结果。
8. **内容/人力与选型**：黄金 20 题及教师审核、供应商工具调用支持/使用许可、Pi 对照、算法路线、工程拆分估算均未完成；E 节依赖成立后才可承诺排期。

### F.3 对 V2.0 §16 五个待决问题的直接回答

1. **RRT 的能力边界**：无法从仓库回答；需要产品侧给出指标（延迟、双工、是否可拿音频），否则语音路线不能排期。
2. **第一批真题来源与权利边界**：仓库现有来源为 HelloCET / guojiya.cn / cet4-6.xdf.cn；权利结论缺失，必须先做。
3. **现有前后端/库/账户/视频管线**：见 A 节；可复用面很大，本地解析源为空缺/占位，题级证据与核验体系未建立，生产解析数据待查；不能按全新项目设计。
4. **用户连接第三方 Agent 的方式**：无现成接口；建议先做「复制配置 + 引导授权」的最小路径，不做 CLI 安装器。
5. **首个兼容宿主**：V2.0 倾向扣子；建议在 T0 先核实账号权限、协议和认证方式，再确定第 4 周唯一宿主；不满足条件则记录阻塞、保留网页路径，不扩散承诺。

## 附：与现有开发计划的衔接

- V2.0 的 S0/S1 与本仓迭代 5（A14/A15）不是替代关系：A12 基线未建立前，不放量体验改动；V2.0 的金标题与账本可以作为迭代 5 之前的前置工程，因为它们不改用户可见入口。
- 迭代 3 遗留的回调密钥两侧轮换、A09 生产告警真实投递/备份 cron，以及 GPU 机旧 `SeeWordCelery` 服务和系统 Python 仍消费云端队列的拓扑，应在放量前核实并收口；依据 `docs/evidence/iteration-3/README.md` 的未完成清单，**本次未复查或操作这些环境**。清理/轮换安排独立变更窗口。
- 迭代 4 的隔离 production smoke 已有历史实跑，但 `PRODUCTION_REGRESSION=1`、Firefox/WebKit 首跑、原 PowerShell 脚本仍列为遗留；未来教学 UI 放量不能把已有 smoke 等同完整生产/跨浏览器回归。
- B03 主要是词汇 `study_sessions` 的流程配置/版本快照；Practice Core 还涵盖真题、听写与提示。可共用版本化、快照和事件约定，各业务保留自己的状态机，不把它们等同或一次抽成通用 DSL。B04 与 FSRS 的产品分歧见 D.7。
