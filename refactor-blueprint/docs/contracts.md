# 后端接口与共同学习契约

本页规定目标行为。`backend/app/schemas/teaching.py`、教学 HTTP/MCP 的既有实现仍按审查结果逐项取舍。P01.1 已新增统一学习上下文 v1，wire schema 的唯一事实源为 [learning_context.py](../../backend/app/schemas/learning_context.py)，当前仅适配已有阅读单题，不能据此认定所有材料和 V2 能力已实现。HEAD 中已有用户端 API、媒体、回调与任务消费者仍需保持兼容。

## CTX01 身份与资源

HTTP、MCP、worker 都构造服务端 `Principal`：user_id、actor、request_id、connection_id、granted_scopes、credential_issued_at。JSON/工具参数不能伪造身份或权限。账号注销申请、封禁、凭据过期/撤销和功能准入在实际执行时再次校验，不只在连接建立时检查。

用户资源按当前用户查找，他人资源和不存在统一 404。站内 JWT 与外部 opaque 凭据使用各自解析方式，共享账号有效性与业务规则；媒体、下载和 WebSocket 继续使用现有统一 token 校验链。

试做外部权限区分 teaching:read、analysis:read、analysis:reveal、attempts:submit、feedback:write、profile:read 和 review:read，完整字符串见试做代码。这些是设计参考，重新实施前冻结正式 scope；新增记忆/托管权限不默认扩大已签发凭据权限。

## CTX02 最小学习上下文

每次只提供当前学习需要的内容：

| 内容 | 构造责任 | 披露条件 |
| --- | --- | --- |
| session/item、材料稳定键、content revision、状态版本 | 教学与内容域 | 属于当前用户，来源仍可用 |
| 题面/原句/时间或字符定位 | 材料适配器 | 按 site/model/external 使用许可分别投影 |
| 草稿、作答、帮助/暴露记录 | 教学域 | 不混入未获准的标准答案 |
| 分层提示、证据和解析 | 内容域与教学政策 | 当前阶段允许 + 相应 scope，二者同时满足 |
| 相关记忆与来源 | 记忆域 | 本人、相关、未删除、未过期且允许用于当前任务 |
| 允许动作与恢复地址 | 应用服务/协议适配 | 地址只定位任务，不携带或替代授权 |

禁止传整份数据库、完整聊天历史、手机号、内部凭据、模型思维过程或无关笔记。不能因站内可见就推断允许发送给模型或外部宿主。来源撤回后历史成绩保留，但披露重新按当前权利投影。

当前 v1 接线与语义：

- 站内 `GET /api/v1/teaching/sessions/{session_id}/context`、MCP `get_learning_context(session_id)` 与平台运行时共用 `teaching/context.py::get_learning_context`。HTTP 返回 `Cache-Control: no-store`；站内 JWT、外部凭据仍由各自适配层认证，JSON/查询参数不能选择 actor/audience。
- `task.state_version` 对应现有写操作的 `expected_revision`；材料绑定该任务的 content revision，当前题库修改不替换历史题面。恢复地址只定位已有任务，不携带 token；沿用当前网页路由，不承诺新增前端体验。
- `cards` 复用教学服务的 site/model/external 披露政策；只读外部连接不能借历史正确作答、草稿或揭晓记录取得标准答案。已使用提示、全局帮助/暴露元数据与可见文本分开，未获得的提示不提前传送。
- 仅附当前题最近 5 次可见作答，保留总次数与截断标记；现有 session detail 仍提供其原历史接口。`answers_visible=false` 表示按权限隐藏，不等于没有历史。未实现的档案/记忆检索不在 v1 伪造空数据作为完成证明。
- `allowed_actions` 是当前调用者可执行的确定性写动作提示，不是模型工具清单或持久授权；交叉检查会话、内容、scope、功能开关。内置模型不获得提交/揭晓权限；正式写入仍重新校验，旧上下文不能绕过撤回或版本冲突。
- 读取持有当前 session 和 content revision 的 PG 共享行锁，直到适配层事务结束，防止同任务状态或内容权利在一次投影中混读。模型网络请求不占用该事务；发请求前重新构造上下文。跨任务曝光变化没有因此新增全局状态版本。

## CTX03 确定性教学写入

试做创建会话接受内容 revision、题目或已提交考试答案三者之一，要求恰好一个来源。正式设计需明确唯一材料来源，并使用 operation_id、expected_revision、item_id 或等价字段实现下列性质；允许替换试做接口，不与旧试做并存两套写入口。

- 保存草稿只改草稿；正式提交产生追加 attempt；模型聊天建议不能隐式提交、揭晓或修改成绩。
- 相同 operation_id 和相同请求返回原结果；同编号不同请求返回幂等冲突；新操作的旧 revision 返回版本冲突。
- 标准答案与内容 revision 固定，服务端确定性判分；正式整卷仍一次交卷，教学多次尝试另存。
- 提示、揭晓、历史暴露与外部辅助来源保留。外部提交为 external_reported、独立性未验证，不提升正式分数或掌握度。
- 写入与事件意图原子提交；重试和重放不重复计入学习统计。

## CTX04 持久运行与 SSE

试做教学路由挂在 `/api/v1/teaching`：content、sessions、draft、attempts、hints、reveal、feedback、complete 等以实际注册结果为准。run 提供 sessions/{id}/runs、runs/{id}、cancel 和 events；连接管理提供列举、创建、revoke 和 rotate。重新设计可调整，先确认试做是否已有实际消费者。

运行创建与订阅分开。客户端断连不重新启动模型。**P02.1 当前事件契约**保留 run_id、sequence、session_revision、schema_version；已支持 `after` 和 `Last-Event-ID`，同时提供时取较大值，非法 header 返回 422，超过当前 last_sequence 返回 409。重复序号不重复产生动作；传输错误不能伪造持久事件序号。事件仍按原短期保留期过期，持久对话另按 CTX10 恢复。后续跨任务事件和正文块恢复按 [Agent 计划](agent-plan.md)扩展，不将单一 session_revision 强加给无任务或多任务运行，也不提前改变现有 wire。

租约/epoch 隔离过期 worker 写回；取消、排队超时、执行超时、重试和终态恢复分别验证。取消不承诺已经发生的上游花费归零。网关失败必须提供可解释错误，不能生成假解析或假评分。

## CTX05 网关与两种推理模式

外部自行推理不扣本站模型次数，但仍受内容/会员/连接权限与 API 限流约束。平台托管调用使用服务端准入、用户/run 预算与全站上限；现有 run 限制 user_ui，开放外部托管属于新增能力，须复用运行时且单独授权。

业务携带 logical_call_id、run/step/task 和脱敏主体引用；网关记录实际尝试的 usage/cost、重试、fallback、取消和未知用量。业务不复制完整计价账本，不叠加无界上游重试。provider key 不进入业务进程、导出或日志；内部虚拟 key 仍需最小权限、轮换与撤销。

MCP、CLI 和 Skill 都是适配器。四宿主分别记录协议版本、传输、授权、读写、恢复和撤权结果；只读连通不能替代写入闭环，宿主语音未实测不承诺。

## CTX06 记忆与账号生命周期

记忆至少包含用户、内容/类别、来源引用、版本、确认/置信度、过期和删除状态。模型推断默认未确认；记忆用于教学策略，不改变正式成绩。删除立即从检索排除，并以 tombstone/代际检查阻止旧任务重新生成。

导出遵守相同答案披露政策；注销先阻断新调用并撤销授权，再编排各域与网关清理。跨系统删除保留持久意图和确认收据，处理在途调用 late settle，不能只发一个易丢的后台任务后声称删除完成。

## CTX07 兼容和错误

保留既有 `/api/v1`、错误 `{code,message,detail?}`、媒体 Range、内部回调认证与旧任务名。401/403/404、409 幂等/版本冲突、422 校验、429 限流/预算、502/503 AI/服务故障按现有具体错误码映射；重构不借统一风格任意修改响应状态。

新增字段优先向后兼容，破坏性变更需要消费者清单、过渡适配、契约回归和回退。凭据、标准答案和私有内容不能混入“调试字段”。

## CTX08 内容草稿、发布与撤回

P01.2 新增 `/api/v1/admin/teaching-content` 下的 drafts 列表/创建/详情/更新、`drafts/{id}/preflight`、`drafts/{id}/publish`、`revisions/{id}/withdraw` 和 operations 查询。请求/响应字段以 [content_publication.py](../../backend/app/schemas/content_publication.py) 为准，事务服务在 `teaching/publication.py`。所有 HTTP 入口要求当前管理员身份；没有新增前端页面。

- 草稿可不完整，保存不代表核验；详情禁止缓存，列表只取摘要。更新使用 expected_version，已发布草稿不能覆盖正文；修订通过新候选发布为新的不可变内容 revision。
- 预检只报告结构、当前题库匹配情况与验证器是否已配置，不鉴定真实收据。发布必须绑定当前 question_id，并通过既有来源/许可/证据/自动核验门。验证器由服务端装配，请求里的 `verified=true`、自填 actor 或收据 ID 不构成证明。
- 收据由可信网关签发，后端使用专用 Ed25519 公钥验签；协议及运维配置唯一说明见[收据协议](../../deploy/v2-gateway/adapter/README.md#内容核验收据)。签名绑定规范化输入摘要、实际响应模型/模型族、盲答结果/重排或教学检查、logical_call_id 和提示版本，并限制用途、签发方、密钥编号与有效期。P01.3 已接通，默认未启用时仍返回 503、不发布；请求自填字段、测试 True 回调不能替代签名。签名仅认证所观察的调用，不证明来源权利或教学正确性。
- 核验阶段前结束读取事务；当前公钥验签本身不发网络请求。核验后重新校验管理员状态、草稿版本和完整 manifest 指纹，锁定题库题目及所属试卷后再检查来源与分配 revision。核验期间被修改的草稿不能沿用旧证明。
- 每个管理员的 operation_id 绑定动作、目标和原请求；同请求重放返回当前投影，不重建发布版本，异请求返回幂等冲突。草稿/发布/撤回与操作回执同事务提交，失败回滚不留下成功回执。operations 支持目标或操作编号过滤，未提供过滤时为管理员分页查询全部已完成操作，不是失败请求的独立审计系统。
- 撤回只影响指定 revision 的后续披露和使用，不改历史答案/判分，不删除材料或学习事实。旧发布请求重放不会复活 withdrawn；该操作不冒充对整个来源全部版本的版权撤回。
- 服务端命令行导入复用同一发布服务，必须提供有效管理员 actor ID 和批次 operation ID；actor ID 依赖服务器操作权限，不是供外部用户冒用的认证方式。批次内容和顺序绑定幂等键，整批提交或回滚，撤回版本的重放仍报告 withdrawn。标准 CLI/Skill 面向学习者的授权另按 CTX01/05 实现。

新增 `teaching_content_drafts` 与 `content_publication_operations`，迁移 `e0f1a2b3c4d5` 继承候选 V2 迁移 `d9e0f1a2b3c4`。管理员删除时身份引用 SET NULL，内容和操作回执保留；这仅是 FK 行为，不代替完整账号生命周期验收。真实业务库是否已迁移仍需单独核实。

## CTX09 服务器内容核验采集

P01.4 在现有内容 CLI 新增 plan-verification、run-verification 和 recover-verification；仅服务器操作权限，不扩展公开 MCP scope 或学习者权限。准备与发布共享材料/证据规则及输入摘要，采集专用虚拟 key 通过现有网关准入，执行前持久检查点、恢复前验签、不确定结果不自动重发。状态、参数、操作和局限唯一说明见[内容核验采集操作](content-verification.md)。产物仍交 CTX08 的管理员发布服务，不直接写 revision 或绕过当前题库复查。没有新增 HTTP 接口、表或队列。

## CTX10 任务对话与导师回复

本节记录 **P02.1 当前兼容实现**。独立聊天、跨任务上下文、学习组件与统一 actions 的后续目标见 [Agent 实施计划](agent-plan.md)；其中的接口尚未实现，不能替换本节当前 wire 或作为验收结果。目标模式允许明确用户输入/action 经服务端命令层执行，仍不允许模型自行决定提交、揭晓或绕过身份校验。

P02.1 新增 `/api/v1/teaching/sessions/{id}/messages` GET/POST，wire schema 见 [teaching_dialogue.py](../../backend/app/schemas/teaching_dialogue.py)。POST 复用已有 CreateRun 的 operation_id、expected_revision、message，服务端固定 conversation 模式；未知身份/评分/模式字段仍拒绝。两端 no-store，GET 按 sequence 的 after/limit 分页（默认 50、最多 100），返回 next_after/has_more。身份来自站内 JWT；外部连接尚无对话授权，不能借 teaching:read 取得历史。

- 写入需要 teaching-runs 和默认关闭的 `TEACHING_DIALOGUE_ENABLED`，仍经过原功能白名单/账号/预算治理准入。新开关要求教学运行已开启，不能用本地测试开启生产治理标记。关闭开关不删除历史，已有合法站内读取按当前内容政策恢复。
- 新建 run 与用户消息同事务、同幂等操作，串行锁和原活跃任务限制共用，不建第二套执行器。旧 `/runs` 默认 cards，旧行迁移为 cards，原请求摘要不变；两种模式不能共用同操作编号冒充重放。用户消息以 `teaching_messages` 为长期历史，run.message 只是短期执行输入副本。
- 未显式揭晓解析时采用标记为 policy 的引导文本，不请求自由解析。揭晓后使用同一受预算约束的网关出口，模型输入为当前受控上下文和本任务最近最多 6 条、8 KiB 内历史；不携带其他任务或全部聊天。源卡和历史在签发 key 后重新构造，不在模型请求期间占用数据库事务。
- 模型输出只接受正文、允许源索引和可选 ABCD 建议；正常 stop、固定 JSON、引用范围/类型、正文体积均校验，再映射到真实 card_id，拒绝额外动作、截断和无引用回复。只持久化校验后的回复，不保存隐藏推理或供应商原始错误。引用表明来源关联，不证明模型每句话都正确；教学质量及真实模型能力另验。
- 建议只作为消息的 suggested_answer。用户必须另调现有 draft/attempt 动作才能保存或作答，模型不能提交、揭晓、写记忆或改正式成绩。取消/epoch、会话版本、功能准入、模型权利和截止时间在落库前重查，旧结果不能追加助手消息。
- 助手消息与 run 终态和 message.upsert 事件同事务提交；事件仅存 message_id，订阅时按当前内容权利再投影。正文、建议和引用随材料/解析权限一起限制，历史消息不因当前会话 revision 增加而丢失；引用绑定不可变内容 revision。读取历史不启动模型，模型输入也不把当前用户消息重复作为历史。
- `teaching_messages` 不随 24 小时运行日志清理；导出复用当前站内投影，注销删除消息。导出不在多个任务上累积上下文共享锁，以免与单任务写入构成反向等待。未提供逐条删除/编辑对话 API，运营保留期和用户主动管理仍待补齐。

当前完成后才发 message.upsert，不是 token 级流式生成；显式重试以新 operation_id 形成新回合，旧操作重放不会再次请求模型。自由提示教学、工具循环、流式输出、独立重试体验和外部托管仍是 P02/V2 剩余工作，不由此切片替代。迁移 `9f2c8a7d6b10` 继承 e0，为 run 增 mode 和一张消息表；仅在隔离库验证，未对业务库执行。
