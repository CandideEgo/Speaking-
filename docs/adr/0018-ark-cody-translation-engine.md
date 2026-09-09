# ADR-0018: 翻译引擎统一为火山引擎 ARK（ark-code-latest）

- **Status**: Accepted - 2026-09-08
- **Supersedes**: 翻译引擎 registry 中的 `agnes` / `qwen` / `hy_mt2` / `glm` 实际可用性（不是说删引擎代码，而是默认不再用）

## Context

翻译管线 `TranslationService`（`backend/app/services/translation/`）有 5 个可插拔引擎，按 `TRANSLATION_ENGINE` env 选 primary、`TRANSLATION_FALLBACK_ENGINE` 选 fallback，concurrent 模式下双发抢答。AI 词注释预热（`ai_service.generate_word_notes_bulk`，由 `PREWARM_ENGINES` 逗号分隔控制）借用翻译引擎的 client，零额外配置。

实际可用的引擎在 2026-08-05 之后只剩 `agnes`（走 `OPENAI_*` = deepseek-v4-flash），其余三个**已删 key**：

| 引擎 | base_url | 状态（2026-09-08） |
|------|----------|--------------------|
| `qwen` | 讯飞 maas-api | API key 已删（expired 2026-08-05） |
| `hy_mt2` | 讯飞 maas-api | API key 已删；sentence-merge 严重需加严 prompt |
| `glm` | 讯飞 maas-coding | key 未配置；翻译质量中等 |
| `agnes` | 走 `OPENAI_*`（deepseek-v4-flash） | 实际唯一可用，但走非专业翻译模型，质量参差 |
| `custom` | 用户 env 填 | 现未使用 |

火山上线 **ARK Coding 端点** `https://ark.cn-beijing.volces.com/api/coding/v3`，声称 OpenAI 协议兼容（chat.completions + Responses API），提供模型 `ark-code-latest`（endpoint ID 见密码库，勿写入仓库）。本 ADR 决定把 **translation + prewarm** 统一走 ARK，**用现成的 `custom` 引擎条目接入，零代码改动**。

## Decision

**把 `TRANSLATION_ENGINE=custom` 作为新的默认翻译引擎；prewarm 同步切到 `custom`。** `agnes` / `qwen` / `hy_mt2` / `glm` 的代码与配置保持不动，仅作为备选 / 兜底（未来真要切回只需改 env 即可，不删任何代码路径）。

### 1. 接入方式（零代码改动）

`TranslationService._resolve_engine('custom', settings)` 已有完整分支（`engines.py:82-88` + `__init__.py:345-348`），从 `Settings.translation_custom_base_url` / `_model` / `_api_key` 三个 env 读取参数。 `ai_service._get_engine_client('custom')` 通过 `TranslationService.resolve_engine_client('custom')` 复用同一组 credentials — 也就是说 **prewarm 切 custom 也只需改 env**。

`.env` 改动（`backend/.env`，gitignored）：

```ini
TRANSLATION_ENGINE=custom
TRANSLATION_FALLBACK_ENGINE=                              # 空字符串禁用 fallback（默认 'hy_mt2' 已无 key 会启动失败）
TRANSLATION_CUSTOM_BASE_URL=https://ark.cn-beijing.volces.com/api/coding/v3
TRANSLATION_CUSTOM_MODEL=ark-code-latest
TRANSLATION_CUSTOM_API_KEY=<ARK endpoint ID / API key，见密码库>
PREWARM_ENGINES=custom
TRANSLATION_BATCH_SIZE=5
```

> API key 字段按用户指示暂填 endpoint ID（值见密码库）；本地验证 200 OK 通畅。若 ARK 标准计费账号需 `sk-...` 格式，替换这一行即可，base_url / model 不动。

### 2. API 协议

用 `client.chat.completions.create()`（OpenAI 旧版）而非 Responses API。ARK `/api/coding/v3` 既然 OpenAI 协议兼容，chat.completions 必然支持；切 Responses API 需改 `_call_engine` 解析逻辑（`output_text` vs `choices[0].message.content`），**不必要**。

### 3. 不动的部分

- `engines.py` `BUILTIN_ENGINES` 字典（5 个 engine 条目全保留）
- `__init__.py` `_resolve_engine` 5 个分支（保留为回退 / 备选）
- `ai_service.py` `generate_word_notes_bulk` 引擎路由（按 `PREWARM_ENGINES` 解析，复用 translation engine client）
- 所有现有测试（687 passed / 6 skipped 保持全绿；零代码改动故零回归风险）
- `OPENAI_API_KEY`（deepseek 兜底）— `ai_service.__init__` 仍需构造默认 client；vocab enrich / quiz / ai_chat / ai_plan 等非翻译 LLM 路径暂不动

## Verification（2026-09-08 本地端到端）

环境：本地 Windows + Docker Desktop dev (PG 16 + Redis 7) + uvicorn + celery worker (`--pool=solo`，绕开 5.4.0 + Windows + `info` loglevel 的 `_localized=[]` bug)

| 测试 | 结果 |
|------|------|
| `TranslationService._resolve_engine('custom')` | OK, base_url=`https://ark.cn-beijing.volces.com/api/coding/v3`, model=`ark-code-latest` |
| 直接 `translate_batch(["Good morning, everyone...", ...])` 5 句 | 5/5 OK，译文自然流畅 |
| 直接 `generate_word_notes_bulk([breakfast, shower, routine, ...])` 3 词 | 3/3 OK，context_note / knowledge / pitfalls 三段全生成 |
| catalog `POST /admin/catalog/{id}/promote` 触发整条管线 | video `2c291371-...`（Rachel's English "How to Pronounce SEX vs. SIX"） |
| process_video head (extracting) | 17s, cookies 验证通过, thumbnail 3 级 fallback OK |
| transcribe_video_gpu (WhisperX, device=cuda) | 79s, 35 段 aligned |
| finalize_video (translating + annotating + prewarm + downloading + transcoding) | **117s**, 35/35 翻译成功, coverage 100%, wpm 140.6, 难度 C2, 720p 转码 OK |
| video 最终 status | `ready`, `progress=100`, `is_published=True` |
| scoring_task 触发 | OK |

整条 pipeline 调用 `POST ark.cn-beijing.volces.com/api/coding/v3/chat/completions` ~12 批（翻译 7 + prewarm 5），全部 200 OK。翻译质量与 deepseek / glm 比较主观感受相当 / 略优（自然流畅度），prewarm 三段格式稳定。

## Consequences

### 收益

- 翻译 / prewarm 统一到**单一供应商 + 单一计费**，省去讯飞 / DeepSeek 两套凭据管理
- 接入零代码改动（`custom` 引擎条目已存在）— 决策可立即生效，未来切换供应商也只需改 env 三行
- 翻译质量稳定（35/35 coverage, 质量门禁 PASS），prewarm 三段输出完整
- 模型可选 Responses API（未来如需 streaming / function-call）

### 风险 / 注意事项

1. **`TRANSLATION_FALLBACK_ENGINE` 默认 'hy_mt2'`**：settings 默认值即使 `.env` 不设也走 fallback 解析；`hy_mt2` 无 key 会启动失败。**必须显式 `TRANSLATION_FALLBACK_ENGINE=` 置空**（本 ADR 决策的一部分）
2. **API key 字段当前是 endpoint ID**：本地跑通 200 OK，但 ARK 标准计费账号可能要求 `sk-...` 格式。**生产上生产前必须做一次 promo 冒烟**，观察 5-10 分钟无 401/403
3. **`.env` 重复 key**：`backend/.env` 之前在 33 行有 `TRANSLATION_ENGINE=agnes`，dotenv 按文件顺序读会覆盖前面的 14 行 `custom` 设置。已注释掉 33 行旧值
4. **celery 5.4.0 + Windows + `--loglevel=info` 有 bug**：`tasks, accept, hostname = _loc` 报 "not enough values to unpack"（`_localized=[]`）。**生产 Linux 不会遇到**，本地用 `--pool=solo` 绕开
5. **batch_size 5 偏保守**：ark-code-latest 翻译单次响应 ~20-30s（35 字幕约 50s 翻译完）。可后续调高做 benchmark；如果遇到 5xx 调回 3
6. **ark-code-latest 是 coding 命名**：原意可能是代码模型，翻译 / prewarm 是非典型场景。本地验证质量好，但建议持续观察（**生产头两周**）
7. **本地有 NVIDIA GPU**（transcribe 走了 cuda），无需云 GPU worker — 但生产服务器 `47.122.127.105` 无 GPU，需要确认生产部署走云 GPU worker（`seeWordGpuWorker Windows 服务` — 旧；或迁新云 GPU）

### 回退

1 步切换回 agnes：

```bash
# 1) .env 改 TRANSLATION_ENGINE=agnes, PREWARM_ENGINES=agnes
# 2) 重启 backend + celery worker
# 3) 重 promote 一条 catalog 验证
```

代码零改动 — 一切靠 env 切换。

### 上生产（用户原话"本地先"，故**未做**；时机由用户决定）

生产服务器 `47.122.127.105`（`seeword.top`）：

1. **手工编辑生产 `.env`**（不 scp，secret 不应 push）：`ssh seeword` + 在 `~/seeword/backend/.env` 末尾追加与本地相同的 8 行
2. **重启服务**：`ssh seeword "cd ~/seeword && docker compose -f docker-compose.prod.yml restart backend celery celery-beat"`
3. **验收**：`docker logs` 看 `TranslationService initialized engine=Custom Endpoint fallback=None`；promote 一条 catalog 观察 5-10 分钟

## 相关文件

- `backend/app/services/translation/engines.py:82-88` — `custom` 引擎条目
- `backend/app/services/translation/__init__.py:320-366` — `_resolve_engine` 的 `custom` 分支
- `backend/app/services/ai_service.py:59-83, 395-434` — `_get_engine_client` + `generate_word_notes_bulk` 路由
- `backend/app/core/config.py:181-200` — `translation_*` + `prewarm_engines` settings
- `backend/.env:10-23` — 本次新加的 ARK 配置块
- `backend/scripts/import_catalog.py` + `backend/app/api/v1/catalog.py:86-106` — ADR-0017 提供的 promote 入口
- `backend/app/tasks/video_processing.py` — head / GPU callback / tail 完整管线
