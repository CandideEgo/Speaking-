# Whisper 转录断句优化：详细报告与实现方法

## 目录

1. [项目背景](#1-项目背景)
2. [问题定义](#2-问题定义)
3. [测试环境](#3-测试环境)
4. [方案一：标点恢复模型（deepmultilingualpunctuation）](#4-方案一标点恢复模型deepmultilingualpunctuation)
5. [方案二：WhisperX（强制对齐）](#5-方案二whisperx强制对齐)
6. [方案三：LLM 标点恢复](#6-方案三llm-标点恢复)
7. [三种方案对比](#7-三种方案对比)
8. [推荐方案与实施建议](#8-推荐方案与实施建议)
9. [附录：完整代码改动](#9-附录完整代码改动)
10. [附录：测试脚本](#10-附录测试脚本)
11. [附录：输出文件清单](#11-附录输出文件清单)

---

## 1. 项目背景

项目使用 `translate-tool/run_transcribe.py` 作为本地转录入口，底层基于 `faster-whisper` 进行语音识别。用户希望转录结果能够按**语义完整的句子**输出，而不是按固定时间窗口或 Whisper 原始片段输出。

测试音频：`C:/Users/Administrator/Speaking/backend/tmp_audio.wav`  
时长：约 3 分 49 秒  
内容：英文电影对白（Spider-Man 2 中 Aunt May 与 Peter Parker 的对话）

---

## 2. 问题定义

### 2.1 原始输出问题

直接使用 `faster-whisper` large-v3 转录，得到的结果是 Whisper 模型内部按时间/注意力划分的片段，常见现象：

- 一个片段内包含多个完整句子
- 一个完整句子被拆到多个片段
- 几乎没有标点符号

示例（原始输出片段）：

```text
[00:00:00 -> 00:00:14] what's going on oh they gave me another few weeks but I decided to hell with it
[00:00:14 -> 00:00:21] I'm moving on I found a small apartment why didn't you tell me I'm quite able to
```

### 2.2 根本原因

Whisper 模型在解码时：

1. 按 30 秒音频块进行自回归生成
2. 标点输出取决于训练数据中的标点分布和模型对音频停顿的感知
3. 对于语速快、连读多、背景音复杂的电影对白，模型倾向于输出低标点的连续文本

因此，**仅靠调整 Whisper 参数无法稳定获得正确断句**，必须引入后处理：

- 标点恢复模型（Punctuation Restoration）
- 强制对齐（Forced Alignment）
- 大语言模型标点恢复

---

## 3. 测试环境

| 项目 | 版本/配置 |
|------|----------|
| OS | Windows 10/11 |
| Python | 3.13 |
| faster-whisper | 1.2.1 |
| whisperx | 3.8.6 |
| deepmultilingualpunctuation | 1.0.1 |
| transformers | 4.57.6（WhisperX 安装后降级） |
| torch | 2.8.0+cpu |
| LLM | agnes-2.0-flash（OpenAI 兼容接口） |
| 硬件 | CPU（无 GPU 可用） |

虚拟环境：`C:/Users/Administrator/translate-tool/.venv`

---

## 4. 方案一：标点恢复模型（deepmultilingualpunctuation）

### 4.1 核心思路

1. Whisper 输出**词级时间戳**（`word_timestamps=True`）
2. 用 `deepmultilingualpunctuation` 模型为每个词预测句末/句中标点
3. 按预测到的 `.` `?` `!` 等句末标点分句
4. 保留每句话第一个词和最后一个词的时间戳

### 4.2 环境安装

```bash
cd /c/Users/Administrator/translate-tool
.venv/Scripts/python.exe -m pip install deepmultilingualpunctuation
```

### 4.3 兼容性修复

`deepmultilingualpunctuation 1.0.1` 使用的 `grouped_entities=False` 参数在新版 `transformers` 中已废弃，运行会报错：

```text
TypeError: TokenClassificationPipeline._sanitize_parameters() got an unexpected keyword argument 'grouped_entities'
```

修复文件：

```text
translate-tool/.venv/Lib/site-packages/deepmultilingualpunctuation/punctuationmodel.py
```

修改第 9、11 行：

```python
# 修改前
self.pipe = pipeline("ner", model, grouped_entities=False, device=0)
self.pipe = pipeline("ner", model, grouped_entities=False)

# 修改后
self.pipe = pipeline("ner", model, aggregation_strategy="none", device=0)
self.pipe = pipeline("ner", model, aggregation_strategy="none")
```

### 4.4 代码实现

修改文件：`translate-tool/app/converter/video.py`

#### 4.4.1 增加全局单例缓存

在 `_whisper_model` 缓存附近添加：

```python
_punctuation_model = None
_punctuation_lock = Lock()
```

#### 4.4.2 增加标点模型加载函数

```python
def _load_punctuation_model():
    """Lazy-load punctuation restoration model for sentence segmentation."""
    global _punctuation_model
    if _punctuation_model is None:
        with _punctuation_lock:
            if _punctuation_model is None:
                try:
                    from deepmultilingualpunctuation import PunctuationModel
                    _punctuation_model = PunctuationModel()
                except Exception as exc:
                    logger.warning(
                        f"Punctuation restoration model unavailable: {exc}. "
                        "Falling back to pause-based segmentation."
                    )
                    _punctuation_model = False
    return _punctuation_model
```

#### 4.4.3 修改转录参数

```python
def _transcribe(self, audio_path: str):
    model = _load_whisper_model_safe()
    segments, _ = model.transcribe(
        audio_path,
        beam_size=5,
        word_timestamps=True,
        condition_on_previous_text=False,
    )
    return list(segments)
```

`condition_on_previous_text=False` 可减少长音频中的幻觉和重复。

#### 4.4.4 修改格式化函数

```python
def _format_transcript(
    self, segments, offset: float = 0.0, max_duration: float = 20.0
) -> str:
    """Format Whisper segments into timestamped Markdown text.

    Uses word-level timestamps plus a punctuation-restoration model
    (deepmultilingualpunctuation) to group words into real sentences.
    Falls back to pause-based phrase splitting if punctuation restoration
    is unavailable or the audio has very few sentence boundaries.
    """
    sentence_end_labels = {".", "?", "!", "。", "？", "！"}

    # Collect word-level entries if the model provided them.
    words = []
    for seg in segments:
        seg_words = getattr(seg, "words", None)
        if seg_words:
            words.extend(seg_words)
        else:
            words.append(seg)

    if not words:
        return ""

    original_texts = [
        getattr(w, "word", getattr(w, "text", "")).strip() for w in words
    ]

    # Try to restore punctuation labels for each word.
    labels = ["0"] * len(words)
    pm = _load_punctuation_model()
    if pm:
        try:
            clean_words = [
                re.sub(r"(?<!\d)[.,;:!?](?!\d)", "", t)
                for t in original_texts
            ]
            predicted = pm.predict(clean_words)
            if len(predicted) == len(words):
                labels = [p[1] for p in predicted]
            else:
                logger.warning(
                    "Punctuation label count mismatch: "
                    f"{len(predicted)} vs {len(words)}. Using fallback."
                )
        except Exception as exc:
            logger.warning(f"Punctuation restoration failed: {exc}")

    pause_threshold = 0.6

    lines = []
    current_group = []
    current_text_parts = []

    def _flush():
        if not current_group:
            return
        start = self._format_time(current_group[0].start + offset)
        end = self._format_time(current_group[-1].end + offset)
        text = " ".join(current_text_parts)
        text = re.sub(
            r'(?<=[\u4e00-\u9fff])\s+(?=[\u4e00-\u9fff])', '', text
        )
        text = re.sub(r'\s+', ' ', text).strip()
        lines.append(f"[{start} -> {end}] {text}")
        current_group.clear()
        current_text_parts.clear()

    for i, w in enumerate(words):
        word_text = original_texts[i]
        label = labels[i]

        if label != "0" and not word_text.endswith(label):
            word_text += label

        current_group.append(w)
        current_text_parts.append(word_text)

        run_duration = w.end - current_group[0].start
        gap_to_next = 0.0
        if i + 1 < len(words):
            gap_to_next = words[i + 1].start - w.end

        end_sentence = (
            label in sentence_end_labels
            or gap_to_next >= pause_threshold
            or run_duration >= max_duration
        )
        if end_sentence:
            _flush()

    _flush()
    return "\n\n".join(lines)
```

### 4.5 运行方式

```bash
cd /c/Users/Administrator/translate-tool
.venv/Scripts/python.exe run_transcribe.py \
  "C:/Users/Administrator/Speaking/backend/tmp_audio.wav" \
  "C:/Users/Administrator/Speaking/backend/tmp_audio_transcript_sentences.md"
```

### 4.6 输出示例

```text
[00:00:09 -> 00:00:10] what's going on?

[00:00:10 -> 00:00:14] oh, they gave me another few weeks but I decided to hell with it.

[00:00:14 -> 00:00:15] I'm moving on.

[00:00:15 -> 00:00:17] I found a small apartment.

[00:00:17 -> 00:00:28] why didn't you tell me I'm quite able to take care of things myself and Henry Jackson, across the street is giving me a hand and I'm giving him five dollars.
```

### 4.7 效果评估

- **断句质量**：较好，能识别大部分句子边界
- **时间戳准确性**：依赖 Whisper 原生词时间戳，偶有 0.5~1 秒偏差
- **稳定性**：高，纯本地运行，不依赖外部 API
- **问题**：个别词出现重复标点（如 `That's Henry Jackson?.`），模型对口语化表达偶有偏差

---

## 5. 方案二：WhisperX（强制对齐）

### 5.1 核心思路

WhisperX 在 faster-whisper 基础上增加：

1. **VAD 预处理**：用 Pyannote 检测语音活动，减少幻觉
2. **批量转录**：提升长音频速度
3. **wav2vec2 强制对齐**：获得更精确的词级时间戳（±50ms）
4. **NLTK 句子分割**：按已有标点分句

### 5.2 环境安装

```bash
cd /c/Users/Administrator/translate-tool
.venv/Scripts/python.exe -m pip install whisperx
```

安装 WhisperX 时会自动安装：

- `pyannote-audio`（VAD + 说话人分离）
- `torchaudio` `torchvision` `torchcodec`
- `transformers 4.57.6`（会降级现有版本）

注意：Windows 上 `torchcodec` 可能出现 FFmpeg DLL 加载警告，但不影响 WhisperX 核心功能。

### 5.3 代码实现

独立测试脚本：`C:/Users/Administrator/Speaking/test_whisperx_llm.py`

核心 WhisperX 部分：

```python
import whisperx
import torch

def run_whisperx(audio_path: str, output_path: str):
    device = "cuda" if torch.cuda.is_available() else "cpu"
    compute_type = "float16" if device == "cuda" else "int8"

    # 1. 加载 WhisperX 模型（含 VAD）
    model = whisperx.load_model("large-v3", device, compute_type=compute_type)

    # 2. 加载音频
    audio = whisperx.load_audio(audio_path)

    # 3. 转录（自动检测语言）
    result = model.transcribe(audio, batch_size=1)
    print(f"Detected language: {result.get('language')}")

    # 4. 加载 wav2vec2 对齐模型
    model_a, metadata = whisperx.load_align_model(
        language_code=result["language"], device=device
    )

    # 5. 强制对齐，获得精确词时间戳
    result = whisperx.align(result["segments"], model_a, metadata, audio, device)

    # 6. 输出
    lines = []
    for seg in result["segments"]:
        start = format_time(seg["start"])
        end = format_time(seg["end"])
        text = seg["text"].strip()
        lines.append(f"[{start} -> {end}] {text}")

    Path(output_path).write_text("\n\n".join(lines), encoding="utf-8")
```

### 5.4 运行方式

```bash
cd /c/Users/Administrator/Speaking
/c/Users/Administrator/translate-tool/.venv/Scripts/python.exe test_whisperx_llm.py
```

### 5.5 输出示例

```text
[00:00:09 -> 00:00:10] What's going on?

[00:00:10 -> 00:00:14] Oh, they gave me another few weeks, but I decided to hell with it.

[00:00:14 -> 00:00:15] I'm moving on.

[00:00:16 -> 00:00:17] I found a small apartment.

[00:00:19 -> 00:00:19] Why didn't you tell me?

[00:00:20 -> 00:00:23] I'm quite able to take care of things myself.

[00:02:02 -> 00:02:06] He, uh, quit.

[00:02:11 -> 00:02:12] He'll be back, right?
```

### 5.6 效果评估

- **断句质量**：最优，接近人工听写
- **时间戳准确性**：最高，wav2vec2 强制对齐显著优于 Whisper 原生词时间戳
- **口语处理**：能识别 "uh" 等填充词并正确加逗号
- **稳定性**：高，纯本地
- **缺点**：首次下载对齐模型 360MB；安装包大；CPU 上较慢

---

## 6. 方案三：LLM 标点恢复

### 6.1 核心思路

1. faster-whisper 输出词级时间戳
2. 将所有词拼成无标点文本
3. 调用 LLM（agnes-2.0-flash）恢复标点并分句
4. 用 `difflib.SequenceMatcher` 将 LLM 句子对齐回原始词时间戳

### 6.2 LLM 配置

```text
OPENAI_API_KEY=sk-rb3NrV4Cipz8D3zpVL0Xcxo28oe5gCy42tcDIIg5laf7yrI5
OPENAI_BASE_URL=https://apihub.agnes-ai.com/v1
OPENAI_MODEL=agnes-2.0-flash
```

### 6.3 代码实现

```python
from openai import OpenAI
import difflib

OPENAI_API_KEY = "sk-rb3NrV4Cipz8D3zpVL0Xcxo28oe5gCy42tcDIIg5laf7yrI5"
OPENAI_BASE_URL = "https://apihub.agnes-ai.com/v1"
OPENAI_MODEL = "agnes-2.0-flash"


def restore_punctuation_with_llm(raw_text: str) -> str:
    client = OpenAI(api_key=OPENAI_API_KEY, base_url=OPENAI_BASE_URL)

    prompt = (
        "You are a punctuation-restoration assistant. "
        "Add appropriate punctuation (periods, commas, question marks, etc.) "
        "to the following transcribed spoken text. "
        "Preserve the original words exactly. "
        "Do not add or remove words. "
        "Return ONLY the punctuated text, split into natural sentences by line breaks.\n\n"
        f"{raw_text}"
    )

    resp = client.chat.completions.create(
        model=OPENAI_MODEL,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.0,
        max_tokens=2048,
    )
    return resp.choices[0].message.content.strip()


def align_sentences_to_words(sentences: list[str], words: list) -> list[str]:
    word_texts = [w.word.strip().lower() for w in words]
    lines = []
    word_idx = 0

    for sent in sentences:
        clean_sent = re.sub(r"[^\w\s']+", "", sent)
        sent_tokens = [t.lower() for t in clean_sent.split() if t]
        if not sent_tokens:
            continue

        best_i = None
        best_ratio = 0.0
        for i in range(word_idx, len(word_texts) - len(sent_tokens) + 1):
            span = word_texts[i : i + len(sent_tokens)]
            ratio = difflib.SequenceMatcher(None, sent_tokens, span).ratio()
            if ratio > best_ratio:
                best_ratio = ratio
                best_i = i

        if best_i is None or best_ratio < 0.5:
            lines.append(f"[?? -> ??] {sent.strip()}")
            continue

        start = words[best_i].start
        end = words[best_i + len(sent_tokens) - 1].end
        lines.append(f"[{format_time(start)} -> {format_time(end)}] {sent.strip()}")
        word_idx = best_i + len(sent_tokens)

    return lines
```

### 6.4 运行方式

同方案二的测试脚本：

```bash
cd /c/Users/Administrator/Speaking
/c/Users/Administrator/translate-tool/.venv/Scripts/python.exe test_whisperx_llm.py
```

### 6.5 输出示例

```text
[00:00:09 -> 00:00:10] What's going on?

[00:00:10 -> 00:00:14] Oh, they gave me another few weeks, but I decided to hell with it.

...

[?? -> ??] Why?

[?? -> ??] Well, he knows a hero when he sees one.

[?? -> ??] Too few characters out there flying around like that, saving old girls like me.
```

### 6.6 效果评估

- **断句质量**：前半段尚可，后半段大量句子无法对齐
- **时间戳准确性**：差，后半段出现大量 `[?? -> ??]`
- **稳定性**：低，LLM 输出不可控，可能改写/合并词
- **成本**：需要调用外部 LLM API
- **适用场景**：仅适合纯文本后处理，不适合需要时间戳对齐的场景

---

## 7. 三种方案对比

| 维度 | 方案一：标点恢复模型 | 方案二：WhisperX | 方案三：LLM 标点恢复 |
|------|---------------------|------------------|---------------------|
| 断句质量 | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| 时间戳准确性 | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐ |
| 运行稳定性 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐ |
| 安装复杂度 | 低 | 高 | 低 |
| 运行速度 | 快 | 慢（CPU） | 取决于 API 延迟 |
| 外部依赖 | 无（首次下载 500MB 模型） | 无（首次下载 360MB 对齐模型） | 需要 LLM API |
| 口语填充词处理 | 一般 | 优秀 | 一般 |
| 是否推荐 | ✅ 推荐（性价比） | ✅✅ 最推荐 | ❌ 不推荐带时间戳场景 |

---

## 8. 推荐方案与实施建议

### 8.1 短期（已实施）

继续使用**方案一（deepmultilingualpunctuation）**，因为它已经集成到 `run_transcribe.py` 中，无需额外依赖即可工作，效果足够满足大部分需求。

### 8.2 中期

如果转录质量要求更高，建议迁移到**方案二（WhisperX）**：

- 将 WhisperX 封装为新的 Converter 类
- 替换现有的 `VideoConverter`
- 保留 `.wav` 等音频格式支持和删除保护

### 8.3 长期

- 收集领域数据（电影台词、播客等）微调 Whisper large-v3，让模型直接输出高质量标点
- 或训练专用标点恢复模型，针对性解决电影对白场景

---

## 9. 附录：完整代码改动

### 9.1 已修改文件

1. `translate-tool/app/converter/video.py`
   - 支持 `.wav` 等音频格式
   - 修复 `.wav` 输入被删除的 Bug
   - 集成标点恢复模型
   - 改进 `_format_transcript` 断句逻辑

2. `translate-tool/.venv/Lib/site-packages/deepmultilingualpunctuation/punctuationmodel.py`
   - 修复 `grouped_entities` 兼容性

### 9.2 关键代码摘要

#### 支持音频格式

```python
@property
def supported_formats(self) -> list[str]:
    return [
        ".mp4", ".mov", ".avi", ".mkv", ".flv", ".wmv", ".webm", ".m4v",
        ".wav", ".mp3", ".m4a", ".flac", ".aac", ".ogg",
    ]
```

#### 防止 .wav 输入被删除

```python
audio_path = str(Path(input_path).with_suffix(".transcribed.wav"))
```

---

## 10. 附录：测试脚本

完整测试脚本：`C:/Users/Administrator/Speaking/test_whisperx_llm.py`

功能：

- 方案二：WhisperX 转录 + 对齐
- 方案三：faster-whisper + LLM 标点恢复

运行：

```bash
cd /c/Users/Administrator/Speaking
/c/Users/Administrator/translate-tool/.venv/Scripts/python.exe test_whisperx_llm.py
```

---

## 11. 附录：输出文件清单

| 文件 | 说明 |
|------|------|
| `backend/tmp_audio.wav` | 测试音频 |
| `backend/tmp_audio.md` | faster-whisper 原始片段输出 |
| `backend/tmp_audio_transcript.md` | 第一次转录结果 |
| `backend/tmp_audio_transcript_sentences.md` | 方案一输出（标点恢复模型） |
| `backend/tmp_audio_whisperx.md` | 方案二输出（WhisperX） |
| `backend/tmp_audio_llm_punctuation.md` | 方案三输出（LLM 标点恢复） |
| `whisperx_llm_test.log` | 测试脚本运行日志 |
| `whisper-sentence-segmentation-solution.md` | 简要解决方案文档 |
| `whisper-sentence-segmentation-report.md` | 本详细报告 |

---

*报告生成时间：2026-06-13*
