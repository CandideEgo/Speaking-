# LLM 接入：Command Code provider（2026-10-20）

> 外部事实（pi 的 models.json 设计、供应商免费模型/限价）在
> [`docs/llm-provider-commandcode-research-2026-10.md`](llm-provider-commandcode-research-2026-10.md)。
> 本文件只写**本仓接入契约**：配了什么、接在哪、怎么换、怎么验、风险在哪。

## 0. 结论先行

1. 本仓的 LLM 供应商配置有了唯一入口：`backend/app/services/llm_provider.py`
   （provider 块 + 模型目录 + 免费标记 + 任务路由），形状照 pi 的 `models.json`
   裁到 env 驱动的本仓习惯，不引入第二套 SDK。
2. 默认 provider = Command Code（OpenAI 兼容 `/chat/completions`），默认模型 =
   免费模型 `minimax/minimax-m3.1-flash:free`；`OPENAI_*` 退为后备。
3. 视频管线（字幕翻译 / 词注释 / 分类）与首页编辑草稿都走同一套：
   `AIService._chat()/chat_json()` 按任务取模型；翻译走新增的 `commandcode` 引擎。
4. 免费模型是**促销**（限时 / while capacity lasts），不是生产保证；下线时
   `--list` 会报 `missing`，换模型只改 env，不改代码。
5. 2026-10-20 实测：`/models` 94 个模型、4 个免费；聊天 / 词注释 / 首页草稿 /
   3 句翻译冒烟全通（详见 §6）。

## 1. 与 pi 的对应关系（照搬什么、为什么没照搬什么）

| pi（`~/.pi/agent/models.json`） | 本仓 |
|---|---|
| `providers.<id>.{baseUrl, api, apiKey, models[]}` | `ProviderSpec`（`resolve_provider()`，来自 `COMMANDCODE_*` / `OPENAI_*` env） |
| `models[].{id, contextWindow, cost…}` 显式元数据 | `ModelSpec` 目录（`COMMANDCODE_FREE_MODELS`）；本仓只维护免费模型及其限制 |
| `cost` 全 0 表达「免费」 | 网关没有价格字段，按 id 后缀 `:free` / `-free` 判定（`is_free_model_id`） |
| `modelOverrides` 只改元数据不重列模型 | `LLM_MODEL_<TASK>` 按任务覆盖模型，不复制 provider |
| 不动态拉 `/models`；`pi update --models` 强刷目录 | 目录是代码常量；`scripts/check_llm_provider.py --list` 对账实时列表 |
| 无跨 provider 自动 fallback | 不引入：翻译沿用「主 + 备并发 first-valid-wins」，其余任务失败可见 |

## 2. 配置契约（backend/.env）

| env | 默认 | 说明 |
|---|---|---|
| `COMMANDCODE_API_KEY` | 空 | 设置后 `AIService` 优先用它；为空回退 `OPENAI_API_KEY` |
| `COMMANDCODE_BASE_URL` | `https://api.commandcode.ai/provider/v1` | OpenAI 兼容前缀，`/models` 与 `/chat/completions` 都挂在它下面 |
| `COMMANDCODE_MODEL` | `minimax/minimax-m3.1-flash:free` | 默认模型；必须是目录内免费模型（或明确要付费时改这里） |
| `COMMANDCODE_ZDR` | `false` | `true` → 每请求 `x-cmd-zdr: 1`；`beam:free`/`glyph-cluster:free` 不支持 ZDR，会硬失败 |
| `LLM_CALL_TIMEOUT` | `90` | 单次 LLM 调用超时（秒）；免费模型延迟抖动大，故比旧的 60s 放宽 |
| `LLM_MODEL_TRANSLATION` | 空 | 留空 = `COMMANDCODE_MODEL` |
| `LLM_MODEL_WORD_NOTES` | 空 | 同上 |
| `LLM_MODEL_CLASSIFICATION` | 空 | 同上 |
| `LLM_MODEL_EDITORIAL` | 空 | 首页草稿生成（`home_content_generation.py`） |

生产部署另有同名 passthrough：`docker-compose.prod.yml` 的 backend / celery / celery-beat
三个服务都透传 `COMMANDCODE_*` 与 `LLM_MODEL_*`；`Settings.model_post_init` 的生产守卫
从「必须有 `OPENAI_API_KEY`」改为「`OPENAI_API_KEY` 与 `COMMANDCODE_API_KEY` 至少一个」。

## 3. 任务路由

| 任务常量 | 调用方 | 默认模型 |
|---|---|---|
| `TASK_TRANSLATION` | `translation` 的 `commandcode` 引擎（`_resolve_engine`） | `COMMANDCODE_MODEL` |
| `TASK_WORD_NOTES` | `AIService.generate_word_notes_bulk` / `enrich_vocabulary_word` | 同上 |
| `TASK_CLASSIFICATION` | `video_classification.classify_video` | 同上 |
| `TASK_EDITORIAL` | `home_content_generation._chat_json` | 同上 |
| `TASK_DEFAULT` | 其余（练习题、口语评分等） | 同上 |

翻译的 `commandcode` 引擎只填 `COMMANDCODE_*`；`.env` 里用 `custom` 槽位指向同
provider 的另一个免费模型（当前 `reflection/beam:free`），复用既有的
`TRANSLATION_CONCURRENT=true` 主备并发。词注释预热同理：`PREWARM_ENGINES=commandcode,custom`。

## 4. 免费模型（2026-10-20 核对，促销口径）

| 模型 id | 上下文 | 免费边界 | 日限 | ZDR | 本仓用途 |
|---|---|---|---|---|---|
| `minimax/minimax-m3.1-flash:free` | 1M | 限时免费 | 无 | 支持 | 默认模型（全部任务） |
| `reflection/beam:free` | 1M | while capacity lasts | 无 | 不支持 | 翻译备路 / 首页草稿备选 |
| `poolside/laguna-s-2.1-free` | 256K | while capacity lasts | 无 | 未标注 | 备用（实测偶发上游不可用） |
| `stealth/glyph-cluster:free` | 256K | stealth preview | **100/天** | 不支持 | 只够调试，勿接批量任务 |

口径来源：<https://commandcode.ai/docs/resources/pricing-limits>（定价页）与
`GET /models` 实时列表；两者 2026-10-20 都只有这 4 个免费模型。`cat-jam:free` 只在
deals 文案出现、`/chat/completions` 返回 `unsupported_model`，不算可用。

## 5. 运维命令

```bash
cd backend
python scripts/check_llm_provider.py           # 配置摘要 + 任务路由（不联网）
python scripts/check_llm_provider.py --list    # 拉 /models，对账免费目录（缺模型退出码 1）
python scripts/check_llm_provider.py --test    # 真实冒烟：聊天/词注释/首页草稿/翻译
```

换供应商或换模型：只改 `backend/.env` 的 `COMMANDCODE_*` / `LLM_MODEL_*`，重启
backend + celery worker。回滚：置空 `COMMANDCODE_API_KEY` 即回退旧 `OPENAI_*` 链路。

## 6. 2026-10-20 验证记录

- `GET /provider/v1/models`：`200`，94 个模型，后缀判定的免费模型 4 个，目录无缺失。
- 旧配置实测失效：`.env` 里原 deepseek key → `402 Payment Required`；原 ARK
  coding endpoint → `400`。本次把翻译主路切到 `commandcode` 同时修复了这条断链。
- `--test`：`chat_json`（4.4s）、词注释 JSON（5.3s）、首页草稿 JSON（3.4s）、
  `translate_batch` 3 句（2.3s，主备并发）全部通过。
- 单测：`tests/test_llm_provider.py`（33 项）+ 既有 AI/翻译/分类/首页生成测试全绿。

## 7. 风险与未证实

1. 免费模型商用许可未证实：供应商 ToS 只给「internal business」许可，免费模型还有
   上游附加条款；面向 C 端前需人工确认。
2. 免费 = 促销：供应商可随时撤（尤其 `glyph-cluster`/`beam`）；`--list` 的 `missing`
   非空即视为告警，默认模型要换。
3. 免费模型无第三方质量评测（官方 "not yet scored"）：翻译接的是既有质量门
   （coverage < 0.60 阻断），但批量前建议先在小视频上跑一遍。
4. 未做：跨 provider 自动降级、`/responses` 协议、非 OpenAI-compatible 的
   `anthropic-messages`/`google-generative-ai`（pi 支持，本仓当前不需要）。
