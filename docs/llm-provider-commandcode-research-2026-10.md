# pi 的模型接入设计 + commandcode 免费模型调研（2026-10-20）

> 范围：`earendil-works/pi`（MIT，main@`d2e7d8b`，2026-10-19）与 commandcode.ai / `api.commandcode.ai/provider/v1`。
> 标记：**[实测]** = 本次拉到的官方文档原文；**[推论]** = 由实测信息外推、未读源码；**未证实** = 搜不到或口径冲突。
## 0. 结论先行

1. **pi 的接入面就是一个 `models.json`**：`providers.<id>.{baseUrl, api, apiKey, models[]}`；模型元数据（contextWindow / maxTokens / cost 四价 / 阶梯价 / input 模态 / reasoning）全部**显式写在文件里**，不靠运行时探测。**[实测]**
2. **pi 不动态拉 `/models`**：起步用打包目录，运行时叠 pi.dev 目录，`pi update --models` 强刷；仅 llama.cpp router 做本地发现。**[实测]**
3. **pi 没有"免费模型"标志**：免费 = `cost.*` 全 0（其内置 opencode provider 就是这么表达 `jev-1.13-free`）。**[实测]**
4. **pi 没有跨 provider 自动 fallback**：只有 agent 级重试（默认 3 次指数退避）与手动切模型；唯一 fallback 字段是 Anthropic 服务端侧 `allowedFallbackModels`。**[实测]**
5. commandcode 定价页列 **5 个 $0 模型**、模型列表页显示 **Free 4**、你 API 实测 **4** —— 差的正是 `cat-jam:free`（只在 deals 文案出现，模型列表无）。**[实测]**
6. 你列的 4 个「待确认」**全部不是免费**（见 B.2）；`deepseek-v4.1-flash` 只是"月度额度提升"，单价不变。
7. **"免费模型"不等于免订阅**：Go($1) 无 API 权限（403 `upgrade_required`），API 门槛是 GOAT($10/月) 或 Provider($15/月)；且免费模型要求账户 ≥$1 credits。
8. 免费额度全是 *while capacity lasts / for a limited time / stealth preview*，ToS 明确 credits 与 Deals 可随时撤回 → **只能当"抢跑分支"，不能当生产底座**。
## A. pi 的模型接入设计
### A.1 配置文件位置 **[实测]**

| 路径 | 作用 |
|---|---|
| `~/.pi/agent/models.json`（`PI_CODING_AGENT_DIR` 可改） | provider / 模型 / 覆盖，**唯一入口** |
| `~/.pi/agent/auth.json` | `/login` 存的密钥与 OAuth |
| `~/.pi/agent/settings.json` | `defaultProvider` / `defaultModel` / `enabledModels` / 重试 / 压缩 |
| 项目 `.pi/` | 只有 settings / mcp / SYSTEM.md / extensions / skills / prompts / themes —— **表里没有 models.json** |
### A.2 `models.json` schema 要点 **[实测]**

- `providers.<id>`：`name`、`baseUrl`、`apiKey`、`api`（`openai-completions` / `openai-responses` / `anthropic-messages` / `google-generative-ai`）、`oauth`、`headers`、`authHeader`、`compat`、`models[]`、`modelOverrides`。内置 id = 覆盖该 provider（只写 `baseUrl` 即"同模型走代理"）；非内置 id = 新增，必须给 `baseUrl` + `api`。
- `models[]` 每项：`id`（必填）、`name`、模型级 `api`/`baseUrl`、`reasoning`、`thinkingLevelMap`、`input: ("text"|"image")[]`、`inputLimits`（`maxRequestBytes`、`images.resize/maxPerMessage/maxPerRequest`）、`cost.input/output/cacheRead/cacheWrite`（USD/百万 token）+ `cost.tiers[]`（`inputTokensAbove` 阶梯价）、`promptCache`（秒）、`contextWindow`（默认 128000）、`maxTokens`（默认 16384）、`samplingParams`/`samplingParamsByThinkingLevel`、`headers`、`compat`。
- `modelOverrides.<modelId>`：**不替换**模型列表，只逐字段 merge 元数据（对象如 `cost` 逐字段合并，其余替换），未知 id 静默忽略。
- `compat`：按"已实测的对端差异"逐项开关（`thinkingFormat`、`supportsReasoningEffort`、`maxTokensField`、`supportsUsageInStreaming`、`cacheControlFormat`、`supportsStrictMode` …，多数默认 `auto-detect from URL`）。文档原文警告：**不要仅凭对端自称兼容就打开**。
### A.3 选择 / 默认 / 免费 / 动态拉取 **[实测]**

- 默认模型：`settings.json` 的 `defaultProvider` + `defaultModel`（默认 `Automatic`）；`/model` 里 `Ctrl+S` 可存为默认；`enabledModels` 用模式串限定候选与 `Ctrl+P` 轮换集。
- 密钥解析顺序：`--api-key` > `auth.json` > `models.json.apiKey` > provider 环境变量。`apiKey`/`headers` 支持字面量、`$NAME`/`${NAME}` 插值、`!command`（请求时执行、不缓存）。
- 免费：无字段，`cost` 全 0 表达。动态 `/models`：**没有**；要"自定义发现/流式/鉴权"必须写 **provider extension**。
- 无自动 fallback：切模型是有语义的人工操作；重试由 `retry.enabled/maxRetries(3)/baseDelayMs(2000)` 承担。
### A.4 抄给本仓的最小接入面（把 commandcode 当 provider）

```json
{ "$schema": "https://pi.dev/schemas/models.schema.json",
  "providers": { "commandcode": {
    "baseUrl": "https://api.commandcode.ai/provider/v1",
    "api": "openai-completions",
    "apiKey": "${CMD_API_KEY}",
    "models": [
      { "id": "minimax/minimax-m3.1-flash:free", "reasoning": true,
        "input": ["text","image"], "contextWindow": 1000000,
        "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 } },
      { "id": "reflection/beam:free", "contextWindow": 1000000,
        "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 } }
    ] } } }
```
文档把 `cost` 四字段标 Required，而 commandcode 无 cache write（表单记 `—`），填 `0` 是**[推论]**；省略 `cacheWrite` 是否被接受 **未证实**。
### A.5 设计取舍（[推论]，给本仓参考）

- **元数据显式化换掉 provider SDK**：任何 OpenAI/Anthropic/Google 形状都能接，代价是每家 quirks 要人工写 `compat`。
- **目录与密钥分离**（catalog 打包 / `auth.json` 存凭证）：CI 可纯用环境变量、不落盘凭证。
- **`modelOverrides` 的价值**：同一 id 在不同 baseUrl/定价/上下文时只改元数据、不重列模型 —— 正对应本仓"多引擎跑同一批字幕"。
- **刻意不做 fallback**是设计而非缺陷：自动换模型同时改变成本与能力，应交给人/调度器。

## B. commandcode 免费模型（截至 2026-10-20）
### B.1 确认免费（4 个）

| 模型 id | 上下文 | 免费边界 | 日限 | 数据条款 |
|---|---|---|---|---|
| `minimax/minimax-m3.1-flash:free` | 1M | 限时（for a limited time） | 无 | **支持 ZDR**（`x-cmd-zdr:1` 下可跑） |
| `reflection/beam:free` | 1M | while capacity lasts | 无 | 上游可留存/训练，**不跑 ZDR** |
| `stealth/glyph-cluster:free` | 256K | while the stealth preview lasts | **100 次/天/账号**（UTC 0 点重置） | 同上，**不跑 ZDR** |
| `poolside/laguna-s-2.1-free` | 256K | while capacity lasts | 无 | 文档未标注留存/训练条款 → **未证实** |

- 文档额外提及 `cat-jam:free`（1M、无日限、stealth preview）：deals 有、模型列表无 → **未证实可调用**；`meituan/longcat-2.0:free` 的 $0 历史页也存疑（当前表 $0.30/$1.20）→ **疑已过期**。
- 口径差异：定价页「99 · Free 5」/ 模型列表「96 · Free 4」/ 你 API「94 · Free 4」 → **以 API 与模型列表为准**。
### B.2 「待确认」的 4 个：全部付费 **[实测]**

| 模型 | 输入/输出（USD per 1M） | 说明 |
|---|---|---|
| `meta/muse-spark-open` | $1.25 / $4.25 | 无 deal，纯付费 |
| `tencent/hy4-preview` | $0.834 / $2.501 | 无 deal，纯付费 |
| `Qwen/Qwen3.8-Flash` | $0.16 / $0.47 | 无 deal，纯付费 |
| `deepseek/deepseek-v4.1-flash` | $0.15 / $0.60 | 只有"月度额度提升"（$10 Go / $80 GOAT / $90 Pro），**单价不变**；峰谷双价（01–04、06–10 UTC 翻倍，周末全低谷） |
### B.3 使用限制 **[实测]**

- **订阅门槛**：除 Go 外所有计划都有 API；Provider $15/月 + $1.01 手续费，含 $15 额度，按量计费无加价。免费模型额外要求"账户有 ≥$1 credits 才能开会话"。
- **限速**：5 小时 / 每周滚动窗口只约束订阅内含额度；免费请求 $0 不占额度、不受窗口约束，唯一硬限是 `glyph-cluster` 的 100 次/天。
- **请求形状**：只收 text + image（audio/file/document 直接 4xx）；`/chat/completions`、`/responses`（Claude 只能 `/messages`）；每模型在 `/models` 的 `supported_endpoints` 里自查。
- **错误契约**：`400 unsupported_model` · `400 invalid_request_error`（端点选错/坏 body）· `403 upgrade_required`（Go）· `422 cmd_zdr_no_providers`（要 ZDR 但该模型无 ZDR 上游，**硬失败不降级**）· `429 rate_limit_error`（上游限流，退避重试）。
- **ZDR**：`x-cmd-zdr: 1` 强制零留存 + 不训练；`beam/glyph/cat-jam` 明确拒绝，`minimax-m3.1-flash:free` 支持。
### B.4 是否可商用 —— **未证实，需人工/法务确认**

- ToS 只授予「personal, non-sublicensable, non-exclusive, non-transferable, limited license … for your **internal business or personal purposes**」，并禁止「time sharing / service bureau / **for the benefit of a third party**」、禁止「用 Outputs 训练或开发与本公司或上游模型商竞争的产品」、**一人一号**（多账号刷额度可永久封禁）。**[实测]**
- provider FAQ 原文：free or promotional models **may run under different provider terms**，届时以上游条款为准。**[实测]**
- 面向 C 端的产品是否仍算 "internal business" → **未证实**；能确定的是"不能拿输出训模型、不能多账号、额度随时可撤"。
## C. 四类任务选型

本仓锚点 **[实测-代码]**：`backend/app/services/ai_service.py` 用 `AsyncOpenAI` + `settings.openai_base_url/openai_model`，JSON 走 `chat_json()`（`response_format={"type":"json_object"}` + `_extract_json`）；翻译走 `backend/app/services/translation/`，引擎 `qwen|hy_mt2|agnes|glm|custom`，`translation_batch_size=5`，`translation_concurrent=True`（主+备并发 first-valid-wins），另有 `json_sanitizer` 与覆盖率质量门。**换 provider 成本近零，真正风险是"免费模型质量无人评测"**（官方对其 intelligence 一律 "not yet scored"）。

| 任务 | 首选 | 备选 | 理由 |
|---|---|---|---|
| 批量字幕翻译（几十句/次 JSON） | `minimax-m3.1-flash:free` | `beam:free` | 4 个免费模型里**唯一支持 ZDR**、1M ctx、无日限；本仓一次只批 5 句并发多批，1M 可放宽 batch。**不做主引擎**：进 `translation_concurrent` 当第三路，用现有质量门（coverage <0.60 阻断）当淘汰器 |
| 预生成词注释（`_generate_word_notes_one_batch`） | `minimax-m3.1-flash:free` | `beam:free` | 调用次数最多，"无日限"是硬指标 → `glyph-cluster`(100/天) 出局；输出是短 JSON `{"notes":[…]}`，靠 `sanitize_json` + 低 temperature 保稳定 |
| 视频分类（低量、单条） | `beam:free` | `minimax-m3.1-flash:free` | 量小可选推理更强的；输入是公开视频元信息，ZDR 非必需 |
| 首页文案 | `beam:free` 或 `minimax-m3.1-flash:free` | — | 低量、主观质量、无 benchmark 分 → **先人工抽检再上线** |

- **不要**把 `deepseek-v4.1-flash` 当免费替代（非免费，峰谷双价让夜间批跑与白天成本差 2×）。
- 若只允许"零成本"，实际可行集就两个：`minimax-m3.1-flash:free`（推荐）与 `beam:free`（1M、无日限、但不 ZDR）；`glyph-cluster` 只够调试。
## D. 未证实清单（不要当结论用）

1. `cat-jam:free` 是否真能经 Provider API 调用。 2. `meituan/longcat-2.0:free` 的 $0 是否仍有效。 3. 4 个免费模型的**翻译/中文质量**（官方未评分，无第三方评测）。 4. 免费模型用于商业产品的确定性结论（ToS 只能靠法务解释）。 5. pi `cost` 能否省略 `cacheWrite`；`pi-ai` 包内部 provider 抽象细节（**未读源码**）。 6. commandcode `/models` 里 `free` 标记的字段名与语义（你实测有，我未直接看到该 JSON 结构）。
## E. 引用

- pi：https://github.com/earendil-works/pi · 字段全表 https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/models-configuration.md · 选模型/自定义端点 …/docs/models.md · 配置位置 …/docs/configuration.md · settings …/docs/settings.md
- commandcode：定价与免费 deals https://commandcode.ai/docs/resources/pricing-limits · Provider API https://commandcode.ai/docs/provider · 模型列表 https://commandcode.ai/models · ToS https://commandcode.ai/terms
- 免费模型单页：https://commandcode.ai/models/laguna-s-2-1-free · https://commandcode.ai/models/glyph-cluster-free · https://commandcode.ai/models/beam-free · https://commandcode.ai/models/minimax-m3-1-flash-free
