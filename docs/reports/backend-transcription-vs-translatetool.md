# 后端转录功能 vs translate-tool 方案：差异报告

> 背景：translate-tool（`C:/Users/Administrator/translate-tool/`）的 `run_transcribe.py`
> 已跑通一套效果最优的转录方案（WhisperX + 本地 large-v3-turbo + 标点模型 `auto`=WhisperX 关）。
> 本报告对比它与 Speaking 后端（`backend/app/services/transcription/`）转录功能的差异，
> 以及后端据此对齐所做的改动。**P0–P3 均已实施（见第 3 节）。**

> **实测修正**：P0 原假设"标点恢复在后端造成污染"**经实测证伪**。
> 用后端代码路径对 15 分钟音频跑 on/off 对比：**输出 100% 逐字一致（diff 为空），污染标记均为 0**。
> 原因：后端用 turbo 自带标点模型，`restore_punctuation` 的去重逻辑（`not word_text.endswith(label)`）
> 在词已带标点时不追加，故为 no-op；且后端 `whisperx.align` 的 NLTK Punkt 兜底了分句，
> 而 translate-tool 不走 align 分句、直接拼词，污染才暴露。**P0 的真实收益仅为代码整洁
> （去掉对 turbo 无效的死步骤）+ 微小性能（模型缓存后 ~2s/次，首载 ~9s 一次性），非质量优化。**

## 1. 两个项目的转录管线现状

### 1.1 translate-tool（已验证最优）

入口 `run_transcribe.py` → `detect_converter` → `VideoConverter.convert` → `_transcribe`。

| 维度 | 配置 |
|------|------|
| 引擎 | WhisperX 默认（`whisper_engine="whisperx"`），faster-whisper 回退 |
| 模型 | 复用本地 `WHISPER_MODEL_PATH=C:/Users/Administrator/local-model/faster-whisper`（large-v3-turbo，CTranslate2，自带标点） |
| VAD | WhisperX 默认（pyannote） |
| 语言 | 自动检测 |
| 对齐 | wav2vec2 强制对齐 |
| 标点恢复 | `whisper_punctuation_restore="auto"` → WhisperX 关、faster-whisper 开 |
| compute | GPU float16，CPU 降 int8 |
| 输出 | `[HH:MM:SS -> HH:MM:SS] 句子` Markdown |

**实测结论（2026-06-24，15 分钟音频，GPU 40–72s）**：
- WhisperX 自带标点已足够好，断句正确、时间戳精确、无 `[?? -> ??]`。
- 叠加 deepmultilingualpunctuation 反而**引入污染**：重复标点 `right?.`、凭空短横 `.-`、句子被 `.,` 粘连。
- → 结论：**turbo 自带标点模型下，标点恢复模型应关闭**。

### 1.2 Speaking 后端

入口：Celery `process_video` → `TranscriptionService.transcribe` → `_sync_transcribe`
→ `_transcribe_single`（或 `_transcribe_chunked_sync` → `transcribe_local_chunks`）。

| 维度 | 配置 | 代码位置 |
|------|------|---------|
| 引擎 | WhisperX（硬编码，无回退） | `__init__.py` |
| 模型 | `WHISPER_MODEL_PATH` → 同一个本地 turbo 模型 | `whisper_model.py:get_whisperx_model` |
| VAD | `whisperx_vad_method="silero"` | `whisper_model.py` |
| 语言 | **硬编码 `language="en"`** | `whisper_model.py:103` |
| 对齐 | wav2vec2 强制对齐 | `whisper_model.py:get_align_model` |
| 标点恢复 | **始终开启**，ASR→align 之间插入 `restore_punctuation()` | `punctuation.py` / `_transcribe_single` |
| compute | `whisper_device="auto"`、`whisper_compute_type="int8"` | `config.py` |
| 输出 | `[{"start","end","text"}]` 字典（存 subtitles 表） | `formatters.py` |

另有**口语练习路径**（`speaking_service.py` / `video_processing.transcribe_audio`）用
raw faster-whisper（`get_whisper_model`），短音频、无对齐、无标点恢复——本报告不涉及。

## 2. 关键差异与风险

### 2.1 标点恢复（实测：后端为 no-op，translate-tool 关闭）★

- **translate-tool**：WhisperX 模式下**跳过**标点恢复（实测证明 turbo 自带标点已足够，叠加反而污染）。
- **后端**：`_transcribe_single` 和 `_transcribe_single_chunk` **始终**在 ASR→align 之间调 `restore_punctuation()`。

后端 `punctuation.py` 注释说明原设计意图：「ASR（尤其 base 等小模型）输出无标点 →
NLTK Punkt 无法断句 → 26s 整段保留为一条字幕 → 需在 align 前补标点」。

**实测结果（2026-06-24，后端代码路径，15 分钟音频）**：
- 标点恢复 ON：183 条字幕，0 污染标记。
- 标点恢复 OFF：183 条字幕，0 污染标记。
- **`diff` 为空——输出 100% 逐字一致。**
- 计时（模型已缓存）：ON 48s / OFF 46s，纯预测开销 ~2s/次；首载模型 ~9s（单例一次性）。

**结论**：后端用 turbo 自带标点模型，标点恢复是**真正的 no-op**——
`restore_punctuation` 的去重逻辑（`if label != "0" and not word_text.endswith(label)`）
在词已带标点时不追加任何字符。translate-tool 的污染源于它**不走 align 分句、直接拼词**，
后端有 `whisperx.align` 的 NLTK Punkt 兜底，故无污染。

→ **P0 不再是"修复污染"，而是"清理对 turbo 无效的死步骤 + 微小性能"**。
   质量零影响，性能收益边际（~2s/次）。价值以代码整洁/一致性为主。

### 2.2 语言硬编码 `language="en"`

- **translate-tool**：自动检测语言。
- **后端**：`get_whisperx_model` 写死 `language="en"`，`get_align_model` 默认 `"en"`。

影响：中文/多语言视频会被强行当英文转录，质量下降。CLAUDE.md 记录的「中文视频配音管线」
也暗示未来要处理中文。translate-tool 的自动检测更通用。

### 2.3 VAD 方法

- **translate-tool**：pyannote（WhisperX 默认）。
- **后端**：`silero`。

两者都能减幻觉，silero 更轻量、无 HuggingFace token 依赖。这点后端未必劣势，属于设计选择，可保留。

### 2.4 引擎可切换性

- **translate-tool**：`whisper_engine` 配置可切 whisperx/faster_whisper，加载失败自动回退。
- **后端**：WhisperX 硬编码，无回退；whisperx 加载失败直接抛错（仅 CUDA→CPU 一层兜底）。

后端缺少「WhisperX 不可用时降级 faster-whisper」的韧性。

### 2.5 配置粒度

后端缺 translate-tool 已有的：
- `whisper_engine`（引擎选择）
- `whisper_punctuation_restore`（标点恢复开关）—— 这正是修复 2.1 所需的旋钮
- `whisperx_compute_type` 显式项（后端靠 `whisper_compute_type` 兼用，auto 时按 device 推断）

### 2.6 torch 环境

- 若 venv 为 `torch ...+cpu`（`cuda False`），WhisperX 全程跑 CPU，极慢。
- 需安装与 GPU 匹配的 CUDA 版 torch（如 `cu128`）以启用 GPU 加速。

## 3. 更新建议

> **实测后重排**：P0 动机由"修复污染"降为"清理死步骤"，收益以整洁性为主、性能边际。
> 语言自动检测（原 P1）实际质量影响更直接，建议提升优先级。

### P0 — 标点恢复开关 ✅ 已实施（2026-06-25）
1. `config.py` 加 `whisper_punctuation_restore: bool = True`。
2. `transcribe_with_whisperx`（`whisper_model.py`）：按开关决定是否调 `restore_punctuation()`。
3. **默认 `True` 保持现状**：默认模型 `base` 的原始输出无标点，需补标点才能让 `align()` 的
   NLTK Punkt 正确分句；turbo 模型自带标点时为 no-op（实测 on/off 输出一致）。
4. turbo 用户设 `False` 可省 ~2s/次预测 + 首载 9s 模型加载，零质量损失。
5. `punctuation.py` 不删除，保留给无标点小模型/中文场景。
6. **价值定位**：代码整洁 + 与 translate-tool 一致 + turbo 下的可选性能优化。

### P1 — 语言自动检测 ✅ 已实施（2026-06-24）
`get_whisperx_model` 去掉 `language="en"` 硬编码，改读 `settings.whisper_language`
（默认空=自动检测，可设 `"en"` 强制）。调用方已用 `result["language"]` 喂 `get_align_model`。
- 实测：英文音频自动检测仍识别为 `en`，行为与改前一致；中文/多语言视频现可正确检测。
- 新增 `whisper_language` 配置项 + `.env.example` 文档。
- 回归：`test_whisperx_segmentation.py` 17 项 + speaking 6 项全过。
- 注意：非英语首次转录会触发对应语言 wav2vec2 对齐模型下载（预期）。

### P2 — 引擎可切换 + 回退韧性 ✅ 已实施（2026-06-24）
- 新增 `transcribe_audio(audio_path)` 引擎分发（`whisper_model.py`）：按 `whisper_engine`
  走 WhisperX 或 faster-whisper；WhisperX 失败时**自动回退 faster-whisper**，转录不再因引擎问题硬失败。
- `_transcribe_single`（`__init__.py`）与 `_transcribe_single_chunk`（`chunked_transcription.py`）
  收口到 `transcribe_audio`，消除两处重复的 ASR+对齐代码。
- 实测三路径：默认 WhisperX（10 条）、强制 faster_whisper（7 条）、WhisperX 加载失败自动回退（7 条，日志确认 fallback）。53 项测试全过。

### P3 — 配置项对齐 ✅ 已实施（2026-06-24）
- `config.py` 新增 `whisper_engine`（默认 whisperx）、`whisperx_model`（空=复用 whisper_model_path）、
  `whisperx_compute_type`（空=按 device 推断），与 translate-tool 语义一致。
- `get_whisperx_model` 改用 `whisperx_model`/`whisperx_compute_type`。
- `.env.example` 同步文档。

## 4. 不改动的部分

- 口语练习路径（`get_whisper_model` raw faster-whisper）——短音频、无标点恢复需求，保持现状。
- silero VAD、分块逻辑、formatter 输出格式、subtitles 表结构。

## 5. 验证方式

```bash
cd backend
# 回归：转录相关测试
pytest tests/ -v -k transcri
# 标点恢复 on/off 对比（P0 实测：同音频跑下两行，输出应逐字一致）
WHISPER_PUNCTUATION_RESTORE=false pytest tests/test_whisperx_segmentation.py -v
WHISPER_PUNCTUATION_RESTORE=true  pytest tests/test_whisperx_segmentation.py -v
# 端到端：用一段本地音频跑 TranscriptionService 对比 on/off 输出
```

---

*报告生成：2026-06-24；P0 于 2026-06-25 实施。translate-tool 实测结论见 `translate-tool/docs` 无；本会话内验证。*
