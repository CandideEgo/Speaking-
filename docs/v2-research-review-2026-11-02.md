# SeeWord V2 最新方案复审与选型核查

日期：2026-11-02

代码基线：master e3f5ecba；评审包含工作区尚未提交的 11 月 2 日方案更新。

状态：研究结论与实施卡补充建议；业务实现、网关与宿主运行验收尚未完成。

## 1 结论

建议继续采用“三层路线 + 单后端 Learning Core + 独立模型网关 + 一个 MCP 宿主”的方向。内容审核、确定性教学事务与可恢复执行的边界已经清楚，现阶段的价值在于把最小链路做实。个人记忆放在 V2.1 合理，可以并行研究提取与删除语义，表结构待研究结论后再冻结。

本轮发现的实施缺口集中在边界：账号导出会带出未交卷快照的答案；快照缺少删题后仍可用的稳定题目身份；独立网关切换尚未同步旧技术设计的账本职责；跨网关注销缺少可靠重试；旧协议 MCP 与两个 Web worker 的组合需要明确运行方式。网关预算、应用重试与记忆删除也需要更具体的验收。

**当前可以推进 PR1、金标题准备和网关选型 spike；尚不能宣布 PR3、PR6 或完整 V2.0 已具备开工与验收条件。** 每个切片按自己的前置放行，避免让后续 MCP 或记忆研究阻塞纯内部快照修复。

## 2 评审输入与证据等级

本轮以 [11 月 2 日方向对齐](v2-direction-alignment-2026-11-02.md) 和 [升级前准备清单](v2-preparation-2026-11-02.md) 为最新决定，结合 [技术设计](v2-technical-design-2026-10-31.md)、[上一轮评审](v2-plan-review-2026-10-31.md)、[开发计划](development-plan-2026-10-29.md) 及 Downloads 中 10 月 30 日的产品 V2.0 原稿复核。

| 证据 | 本轮完成情况 | 能支持的结论 |
| --- | --- | --- |
| 本地源码与方案交叉核查 | 已完成 | 当前代码路径、方案遗漏与文档冲突 |
| 虚构题目、内存对象的纯函数复现 | 已执行，退出码 0 | 快照序列化保留答案，且缺稳定题目身份 |
| 官方文档、发行记录与锁版源码 | 已核对 | 候选具备哪些能力、哪些语义仍需补证 |
| 网关部署、模型真实调用、宿主 E2E | 未执行 | 不作可上线或宿主兼容承诺 |
| PG 并发、迁移、完整导出 ZIP/HTTP、浏览器、生产 | 未执行 | 不把源码判断写成这些检查已通过 |

联网先尝试 web-search 技能脚本；脚本未成功返回有效结果后，使用其允许的备用搜索通道核对一手资料。没有执行付费长研究或供应商模型调用。

## 3 优先补进 PR1 的两项遗漏

### 3.1 账号导出是未交卷答案的出站旁路

证据链：

- [account_data.py](../backend/app/services/account_data.py) 第 84–88 行的 row_to_dict 序列化所有列；第 120–143 行收集全部考试会话，第 182–193 行直接导出相应 ExamAnswer，没有按提交状态投影。
- [exam_service.py](../backend/app/services/exam_service.py) 第 90–102 行的快照包含 answer 和 explanation；daily 开考即写 placeholder。wrong_redo 也保存快照。
- PR1 准备把 paper 模式补成开考即冻结，同样会扩大这条出站路径。

触发过程：创建练习 → 暂不交卷 → 申请账号导出 → 从题目快照读标准答案 → 回到练习或另开教学。当前导出不会登记答案暴露。最新版虽然写了“所有出站路径”的原则，E1 的交付与验收尚未明确覆盖这个实际入口。

**建议**：账号导出调用领域投影；未交卷考试隐藏标准答案与解析，教学数据按 disclosure 和 rights policy 投影。若产品决定导出本身允许揭晓，就必须先完成确定性暴露写入，再生成对应内容。对普通账号导出，优先选择前一种方式。

PR1 增加负控：未交卷导出不能带答案；导出失败、重试与并发交卷时，不能出现正文已披露而暴露事实缺失。新教学导出沿用同一政策。

本轮使用现有 _snapshot_question 与 row_to_dict，对虚构题和未作答的内存 placeholder 执行最小复现，输出为：

```json
{
  "answered_at": null,
  "user_answer": null,
  "export_contains_standard_answer": "B",
  "export_contains_explanation": "Synthetic answer explanation.",
  "snapshot_has_question_key": false,
  "snapshot_has_paper_identity": false
}
```

这是纯序列化复现；完整导出 ZIP、HTTP 和真实数据库路径未执行。

### 3.2 快照需要同时冻结题目身份

当前快照只有题 UUID、题号和内容，没有 question_key 或完整卷身份。ExamAnswer.question_id 的外键在题目删除时 SET NULL（[exam_test.py](../backend/app/models/exam_test.py) 第 123–125 行）；daily / wrong_redo 又不依靠 session.paper_id 保留卷身份。导入器确实会删除本次来源缺少的题（[import_exam_papers.py](../backend/scripts/import_exam_papers.py) 第 86–90 行）。

因此，仅把判分改成读取 JSON，可以保住答案依据，却仍不能保证删题后恢复稳定 question_key、匹配客户端原题引用并写入全局 exposure。

**建议 E1 同时冻结**：规范化卷身份、question_key、原题 UUID 和快照版本。客户端答案匹配使用冻结的原题引用；跨会话暴露使用稳定 key。历史无法还原的身份继续标 unknown。

验收应覆盖“开考 → 导入删题 → 首次交卷 → GET 历史 → 同操作重放 → 再建教学”，同时核对成绩、题面与暴露记录。

## 4 独立网关：首选 LiteLLM spike，保留现有硬闸要求

### 4.1 先统一账本归属，再建迁移

方向文档第 97–108 行已决定网关拥有 usage / cost 事实源，后端只留业务关联。但技术设计第 269–303 行仍定义 backend 的 model_call_ledger、budget buckets、并发槽与完整 reserve/settle；第 417 行还按本地账本定义注销。同文件开头只明确替代 §1 与评审 D.7，实施者仍可能按 §8 建出第二套账本。

**建议**：回写技术设计 §2、§8、§11.2 与 PR3，把业务必须保证的预算、未知用量、迟到结算和并发性质保留下来；实体与实现归属由 E3a 选定的网关决定。backend 只保留业务调用引用、运行状态与生命周期编排。不要通过删除验收条件来迁就候选项目。

准备清单 E2 也不宜在选型完成前冻结模型账本 DDL；个人记忆现阶段先冻结来源、作用域与删除语义，完整字段待 M0 研究后确定。

### 4.2 LiteLLM 已有预算预占，异常路径仍需验证

官方文档已提供默认预算预占及 fail-closed 配置；数据库、Redis 和显式限额是需要一起核对的条件。将 LiteLLM 概括为“只能事后统计”已不准确。[官方预算文档](https://docs.litellm.ai/docs/proxy/users)

本轮核到的候选发行版为 **v1.106.6，2026-10-28，commit 61c6ab7**；尚未锁定镜像 digest、安装或运行。[发行记录](https://github.com/BerriAI/litellm/releases/tag/v1.106.6)

该 tag 的预算预占源码有三处需要重点实测：无法估价时跳过预占；取消时保留输入估算并释放输出预占；这条预占路径中未见 global counter，team key 与个人 user budget 也有不同语义。这些源码观察不能直接推导端到端一定超额，却足以说明短时 key、max_budget 和 TTL 不能单独证明本方案硬闸成立。[锁版源码](https://raw.githubusercontent.com/BerriAI/litellm/v1.106.6/litellm/proxy/spend_tracking/budget_reservation.py)

**E3a 应产出一张实际映射表**：global / user / run 分别对应哪个网关实体；后台任务归哪个共享桶；多 key 是否共享用户预算；每次 fallback 如何计量；unknown 如何保守处理。key 的 TTL 只限制后续准入，不能撤销已发出的上游调用。

对于已发出但结果未知的请求，必须验证保守消耗、并发隔离和后续对账如何实现。若需要扩展，优先在网关侧适配或限制模型能力；保持一个成本账本。

### 4.3 备选要按本项目要求筛选

| 候选 | 本轮判断 | 下一步 |
| --- | --- | --- |
| LiteLLM Proxy | 首选 spike；预算预占是明确的正面依据 | 锁版后验证异常结算、三级预算映射、资源占用与生命周期 |
| Bifrost OSS | 暂不能作为同等硬预算备选 | 官方说明多 OSS 节点共用 PG 不保证一致治理；预算示例允许单次请求越限后才挡下一次，需额外证明或扩展。[官方说明](https://docs.getbifrost.ai/features/governance/budget-and-limits) |
| New API | 保留渠道管理备选 | 与 One API 分别锁定项目和许可证，再测元数据、预算与注销 |
| Portkey | 保留路由与 guardrail 备选 | 区分开源代理和商业平台的治理能力 |
| 薄适配 | 用于补已确认的业务语义缺口 | 不重做完整协议、路由与成本账本 |

许可证初筛已查看各仓库；发布前仍需对最终 tag、镜像与实际启用模块留存许可结论。开源许可不能证明所需功能都包含在免费自托管范围。LiteLLM 的管理审计与部分治理功能存在版本边界。[LiteLLM 功能范围](https://docs.litellm.ai/docs/enterprise)

### 4.4 SDK 重试关闭后，应用仍会重试与竞速

准备清单 E3b 第 249 行仅写 SDK max_retries=0。[翻译服务](../backend/app/services/translation/__init__.py) 第 189–214 行仍默认执行最多四次应用调用，第 275 行对 JSON 解析失败也重试。第 110 行起的竞速以“通过业务 JSON 校验”为成功，普通网关的首次 HTTP 成功与这个条件不同。

**建议拆清职责**：网络重试与 provider fallback 归网关；翻译 JSON 的业务校验与有限重生成仍由应用负责，或由经过同等验证的网关能力接管。所有尝试共享业务 logical_call_id、总次数和 deadline，每次真实上游尝试可追溯。不要同时启用两层无关联重试。

迁移密钥范围也要覆盖 translation_hymt2_api_key、translation_qwen_api_key、translation_glm_api_key、translation_custom_api_key（config.py 第 279–286 行）；只删除 COMMANDCODE_API_KEY / OPENAI_API_KEY 不足以证明 provider key 已全部移出后端。x-cmd-zdr 等上游选项应逐项验证。

预算、限流和服务故障的错误应按语义映射。LiteLLM 的发行说明中预算耗尽可返回 422，不能只匹配 HTTP 429。[错误状态变更](https://docs.litellm.ai/release_notes/v1.104.0/v1-104-0)

E3b 的常规回滚建议关闭 AI 新入口或切回已验证网关配置。若保留应急直连，需明确它是破坏密钥隔离与统一准入边界的应急路径，不能作为 PR3 正常运行时绕过预算的开关。

### 4.5 跨网关注销需要持久意图与确认收据

方向文档 §2.6 / E3e 已要求删除或匿名化，但还没有定义业务 PG 与网关之间的失败恢复。当前 _purge_user 会删除用户及关联后 commit（[account_tasks.py](../backend/app/tasks/account_tasks.py) 第 258–273 行）。本地删完再调网关，超时后可能丢失重试关联；在本地事务内先调网关，也无法随本地 rollback 撤回远端动作。

**建议**：同事务登记最小的网关生命周期意图，提交后执行；使用稳定幂等请求 id、可重试状态、确认收据与告警。可借鉴现有媒体清理的意图模式，无需复制成本账本。注销首先阻止新调用并撤销相关短时 key，迟到用量按网关尝试引用结清。

删除任务只保留完成远端操作所需的最小引用；结清后清理映射。日志按保留期清理不能替代这项用户生命周期契约。[日志清理功能](https://docs.litellm.ai/docs/proxy/spend_logs_deletion)

验收补齐：网关不可用、远端成功但响应丢失、业务进程重启、注销与 late settle 两种先后。具体持久状态放在生命周期编排中，不在 purge 的长事务里等待 HTTP。

## 5 MCP：补上旧协议与多进程组合

技术设计第 385 行允许目标宿主只支持 2025-11-25，同时第 403 行保留两个 Gunicorn worker；实际生产 compose 也使用两个 worker。官方 SDK 的旧协议有进程内 session 状态，后续请求换到另一进程可能找不到 session。E8 的 10–20 次正常读写尚不足以覆盖这一组合。[官方部署指南](https://py.sdk.modelcontextprotocol.io/v2/run/deploy/)

**建议**：首版若只需要普通工具请求响应，优先验证旧协议 stateless_http=True 与目标宿主是否兼容；否则明确独立单 worker MCP 或已验证的 session 路由。强制跨 worker、重启和断线后再读写，检查业务 operation_id 重放。若不使用多轮 request_state、服务端订阅等能力，写明首版范围，避免顺带增加共享状态设施。

本轮确认 2026-07-28 规范及 SDK v2 存在；原设计对其 GET stream、协议 session 与恢复方式的差异已有正确说明。真正待验证的是“锁定发行包 + 当前依赖 + 目标宿主 + 生产反代”的组合，不能把既有 G0 的待验证项包装成新问题。[规范](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http)、[SDK v2 发行记录](https://github.com/modelcontextprotocol/python-sdk/releases/tag/v2.0.0)

## 6 个人记忆：先补业务语义，再选提取器

以下属于 V2.1 契约准备，不阻塞 PR1 或 V2.0 的无模型教学事务。

### 6.1 删除后不能被旧任务重新生成

方向文档第 190–216 行已有 deleted_at、来源失效、清缓存和过期规则，尚未覆盖“提取已入队 → 用户删除 → 迟到任务写回”，以及从保留的 attempt/event 再次提取同一事实。

建议区分删除当前条目、停止记住该事实与注销。为提取任务保存来源水位及用户 memory_epoch；用户纠正或删除后，提交与检索都复查版本和最小抑制范围。删除标记避免永久保存被删正文；派生记忆一起失效。

社区工具提供后台提取或异步删除等原语，这些业务保证仍需 SeeWord 定义。[LangMem 概念](https://langchain-ai.github.io/langmem/concepts/conceptual_guide/)、[Mem0 删除接口](https://docs.mem0.ai/api-reference/memory/delete-memories)

### 6.2 记忆继承来源披露和撤回限制

现文按 user_id、相关性、时间和置信度检索，但 memory_sources 尚未明确绑定内容 revision、disclosure 与 rights policy。已揭晓的答案或材料摘录若被存入长期记忆，在原内容撤回后仍可能进入新模型上下文，绕过已有统一出站投影。

建议首版长期记忆优先保存目标、偏好、受控错误标签与来源引用；需要保存正文时，检索、生成发布、导出和 MCP 输出均重新检查来源许可。增加“来源撤回、低 scope 连接、旧缓存、生成中撤回”的负控。

### 6.3 社区借鉴保持精确

方向文档将 Mem0 的“跨用户复用”放入不照搬栏，容易误解为其默认行为；官方提供 user / agent / run 等作用域。LangMem 也不以托管服务为必要前提。选型比较应针对实际写入、检索、删除和集成成本。[Mem0 设计说明](https://github.com/mem0ai/mem0/blob/main/docs/core-concepts/how-it-works.mdx)、[LangMem 概念](https://langchain-ai.github.io/langmem/concepts/conceptual_guide/)

推荐先用现有 PG 与结构化过滤建立小规模可评测版本，把提取器做成可替换接口。是否使用向量检索由真实检索集决定；无需同时引入完整记忆平台、图数据库或另一个 Agent 运行时。

## 7 教学效果评估需要可采集的契约

技术设计第 322 行要求同时评价答案与证据定位；但第 134 行的 attempt 和提交 API 只定义了答案，没有用户证据定位回答。exam_evidence 是审核内容，无法替代用户选择了哪段证据。delayed_retest 也仅有 role 枚举，尚无复测窗口和污染规则。

在 V2.1/M2 前补齐：用户证据回答、证据判定版本、复测间隔、同题与等价题关系、已知帮助过滤、纳入/排除及流失口径。先预写实验指标，再采样。

V2.0 可以证明内容质量、幂等副作用与跨入口恢复；教学有效性的判断需要后续测量。20 道金标题继续作为质量回归集。

## 8 建议执行顺序与补卡位置

| 顺序 | 工作 | 本轮需要补进去的内容 | 出口 |
| --- | --- | --- | --- |
| 1，可立即做 | PR1 快照修复 | 稳定题目身份、账号导出投影、旧交卷暴露 | 删题后判分与重放一致；未交卷导出无答案 |
| 2，可并行 | G0-1/2 + PR2 内容准备 | 20 道审核题、来源与三种使用范围 | 每题证据、干扰项与分层提示可复核 |
| 3，可并行 | E3a 网关 spike | 三级预算映射、取消与未知用量、版本/许可/资源记录 | 明确满足项与必须适配项；保留硬预算验收 |
| 4 | PR4 无 LLM 教学闭环 | 按实际消费顺序增量迁移与契约 | 一题初答、提示、复答、揭晓与恢复完成 |
| 5 | E3b–e / PR3 | 重试职责、全部 provider key、错误映射、可重试注销 | 三出口统一；预算和生命周期负控通过 |
| 6 | PR5 / PR6 | run/UI，以及宿主锁版、多 worker 运行方式 | 一个宿主真实读写恢复和撤销完成 |
| 研究并行、实现后置 | V2.1 M0 / M2 | 删除再生防护、来源权限继承、效果测量 | 记忆架构与可采集评测契约确定 |

网关 spike 最少覆盖：双进程争最后预算、未知价格、Redis 不可用/陈旧恢复、取消后上游继续、超时重试、免费主模型转付费 fallback、run key 过期、注销并发结算。运行验证均待执行；表中的出口是交付要求。

建议把确认后的修改分别回写到原设计和对应 E1/E3/E8/M0 工作卡。本文保留为有日期的复审证据，避免形成第二份长期实施计划。

## 9 本轮没有新增的阻塞

旧整卷判分漂移、旧服务自行 commit、事件吞错、外部答案独立性未知、SDK 依赖兼容、隐私更新与 A12 放量约束，最新版已经覆盖。它们仍需实施验收，本轮没有把它们重复计作新发现。

本轮只新增本报告；原有未提交方案文件和业务代码未改动。未访问生产、执行迁移、安装网关或 SDK，也未将既有测试结果用作新架构通过的证据。
