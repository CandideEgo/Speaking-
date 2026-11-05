# 内容核验采集操作（P01.4 / CTX09）

本页负责服务器操作工具的准备、采集、恢复和交接；签名协议/密钥轮换只维护在[网关说明](../../deploy/v2-gateway/adapter/README.md#内容核验收据)，发布/撤回只维护在 [CTX08](contracts.md#ctx08-内容草稿发布与撤回)。工具不是公开学习 CLI、后台异步任务系统或新的用量账本；实际执行证据见[实施记录](implementation.md)。

## 输入与权限

操作者提供一个候选 JSON 对象，含题面、标准答案、逐选项解析、分层提示、考点、原文证据、三档权利及权利依据 URI/指纹、原卷与两个独立答案来源快照。确切材料校验只认 [content.py::validate_material](../../backend/app/services/teaching/content.py)；收据列表可以为空。既有收据不会被带入新计划。题型仍限既有四级仔细阅读，结构与指纹可核对不等于本工具认证了来源真实或使用权。

准备阶段先复用材料/来源/证据检查，并要求 model_processing=true，才允许构造模型输入；不下载来源、不推定授权、不生成教学解析或勾选权利。素材及版本改变必须新建计划。发布时仍检查当前题库锚点和管理员身份；准备可以先于绑定 question_id，不因此绕过最终发布门。

采集需同时具备：

- 现有网关治理准入及网关地址配置，真实预算/未知用量/生命周期验收仍须独立完成，不能因本工具单测通过就开启治理标记。
- 已配置的收据公钥验签，签发器由网关侧独立配置。
- `CONTENT_VERIFICATION_API_KEY`：操作者预先签发的专用虚拟 key，只允许本批获准的模型别名，已有 team/member/key 预算、有效期和并发约束均需核实。工具拒绝空 key 或与配置中 admin key 相同的值，不用 master key 做采集，也不自动创建无额度账号。

专用 key 只从服务端环境读取，不接受命令行参数、不写计划/检查点/输出。工具复用网关准入和错误归一；不会检查或证明虚拟 key 的实际预算配置，也不为单个文件另记成本。上述真实治理核实仍是启用前置条件；本批只使用隔离测试配置与合成调用，没有签发真实运营 key 或修改实际 .env。

## 操作顺序

在 backend/，Windows 设置 `PYTHONUTF8=1` 并使用 `.venv/Scripts/python.exe`。示例路径是占位，job-dir 的父目录需已存在；作业目录应放仓库外的受控工作区，不提交素材、收据、密钥或作业目录到 Git。Windows ACL 由操作者管理，mkdir mode 不替代 Windows 文件权限。

```powershell
$env:PYTHONUTF8 = '1'
.venv/Scripts/python.exe scripts/qualify_teaching_content.py plan-verification candidate.json --job-dir C:/approved-content/job-001 --models approved-alias-a approved-alias-b
.venv/Scripts/python.exe scripts/qualify_teaching_content.py run-verification --job-dir C:/approved-content/job-001
# 只有 qualified 后才有可导入产物；check-manifest 本身仍只检查结构。
.venv/Scripts/python.exe scripts/qualify_teaching_content.py check-manifest C:/approved-content/job-001/manifest.json
.venv/Scripts/python.exe scripts/qualify_teaching_content.py import-manifest C:/approved-content/job-001/manifest.json --actor-id ADMIN_ID --operation-id STABLE_BATCH_ID
```

plan-verification 不调用模型、不连接数据库，只在新目录写 job.json；已有目录拒绝覆盖。固定四步为两模型别名分别盲答、分别教学审查；请求使用共享规范化/教学输入函数，盲答不传标准答案，重排映射绑定收据。输入/提示/模型族的真实性仍由签发/验签和最终门检查，不由别名不同推断独立模型族。

run-verification 顺序执行，单次 HTTP 超时 65 秒且没有重试。调用前原子写入 running，收到并认证当前步骤收据后原子写入 succeeded；这里 succeeded 仅表示取得有效调用证据。错答或语义检查 false 会保留负面证据、将作业标为 rejected 并停止后续调用，重跑不会换答案碰运气。全部收据再次认证并通过现有独立模型族/答案/语义发布门后，才写 manifest.json 和 qualified。不同别名实际同族会被拒绝，不能改名过门。

工具输出始终 published=false；真正导入使用已有管理员服务和幂等回执。qualified 只代表采集时的技术核验条件成立，不是生产上线/授权认证或当前题库一定匹配。收据过期、移除公钥或修改题库仍会使后续导入拒绝。

## 中断、恢复与冲突

| 检查点状态 | 下一次执行 |
| --- | --- |
| pending | 先检查准入，再允许首次调用 |
| succeeded | 重新验签与核对当前步骤输入；有效结果复用，不重复调用 |
| running（上次未完成）/uncertain | 记录 uncertain 并停止，不自动重发，费用/上游工作可能已发生 |
| rejected / qualified | 保留并复核已取得证据；负面结论不自动重新采样，合格产物不产生新调用 |

结果不确定时须先核对网关原有账目。若能独立取得**相同步骤的原始签名响应**，可恢复：

```powershell
.venv/Scripts/python.exe scripts/qualify_teaching_content.py recover-verification --job-dir C:/approved-content/job-001 --step 1 --receipt recovered-signed-response.json
.venv/Scripts/python.exe scripts/qualify_teaching_content.py run-verification --job-dir C:/approved-content/job-001
```

step 从 0 起，仅能恢复 running/uncertain；签名、有效期、核验类型、输入摘要和重排必须匹配。人工 true、供应商普通答复、伪造家族或其他题目的收据不能恢复。recover 不调用模型、不发放额度。当前签发器无持久收据查询接口；拿不到有效原始收据时，本作业不会自动重新计费执行。需要重新采集时，由操作者核对不确定费用后建立明确的新计划，不能把旧调用当作零费用或把人工结论写成收据。

每次写入为同目录临时文件→flush/fsync→replace；OS 目录文件锁排除同目录并发执行，进程退出会由 OS 释放锁，不以锁文件存在判断进程仍在运行。Windows 锁和真实子进程退出已测，Linux fcntl 分支本批未运行。该锁只协调遵循本工具的进程，不是抵御拥有同目录写权限操作者的安全边界；不承诺机器断电、网络文件系统或恶意文件编辑下的强持久性。

作业计划摘要用于发现意外修改，不能当不可篡改审计。任何已保存收据在续跑与组装前重新验签；现有发布服务最终重验签和材料版本。原子写失败或进程崩溃后，下次至多按未取得持久结果的步骤标 uncertain；不跳过失败状态、不保存 provider 错误正文和内部凭据。

回退可停止使用新增采集命令、移除专用 key 配置并保留已有素材/检查点供核对；不会删除发布事实或修改运行中的服务。当前没有新数据库迁移，不将本地作业文件替代后续后台发布队列、运营保留期或完整失败审计。
