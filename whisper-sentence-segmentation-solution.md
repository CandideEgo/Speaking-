# Whisper 转录正确断句解决方案

## 问题描述

使用 `faster-whisper`（large-v3）直接转录英文音频时，模型输出的文本几乎没有标点符号，导致按时间切分的片段要么把多个句子硬切在一起，要么把一句完整的话拆成多段，阅读体验很差。

例如原始输出：

```text
[00:00:00 -> 00:00:14] what's going on oh they gave me another few weeks ...
[00:00:14 -> 00:00:21] I'm moving on I found a small apartment ...
```

## 根本原因

Whisper 的解码结果受音频质量、说话方式、模型参数影响，有时会把整段对话输出为连续无标点的文本。仅靠时间戳或停顿阈值无法做到“语义正确”的断句，必须借助**标点恢复（Punctuation Restoration）**模型为文本补回 `.` `,` `?` `!` 等标点，再按标点断句。

## 解决思路（业界主流方案）

1. **ASR**：Whisper / faster-whisper 输出词级时间戳（`word_timestamps=True`）
2. **标点恢复**：用独立模型（如 `deepmultilingualpunctuation`）给每个词预测标点
3. **断句对齐**：根据恢复的句末标点（`.!?`）把词分组，并保留每句话的起止时间

参考来源：

- IWSLT 2024 Subtitling Track 论文：*HW-TSC's submission to the IWSLT 2024 Subtitling track*
- 通用做法：Whisper + `bert-restore-punctuation` / `deepmultilingualpunctuation` + 词时间戳对齐

## 已实施的改动

### 1. 环境准备

在 `translate-tool/.venv` 中安装标点恢复库：

```bash
cd /c/Users/Administrator/translate-tool
.venv/Scripts/python.exe -m pip install deepmultilingualpunctuation
```

### 2. 修复兼容性问题

`deepmultilingualpunctuation 1.0.1` 与新版本 `transformers 5.x` 不兼容，`pipeline(..., grouped_entities=False)` 参数已被废弃。

修改文件：

```text
translate-tool/.venv/Lib/site-packages/deepmultilingualpunctuation/punctuationmodel.py
```

将第 9、11 行：

```python
self.pipe = pipeline("ner", model, grouped_entities=False, device=0)
self.pipe = pipeline("ner", model, grouped_entities=False)
```

改为：

```python
self.pipe = pipeline("ner", model, aggregation_strategy="none", device=0)
self.pipe = pipeline("ner", model, aggregation_strategy="none")
```

### 3. 修改转录脚本

修改文件：

```text
translate-tool/app/converter/video.py
```

主要改动：

- 增加标点模型单例缓存 `_punctuation_model`
- `_transcribe()` 中开启 `word_timestamps=True` 并设置 `condition_on_previous_text=False` 减少幻觉
- `_format_transcript()` 中：
  - 收集 Whisper 输出的每个词及其时间戳
  - 用 `deepmultilingualpunctuation` 预测每个词后的标点
  - 按 `.!?` 等句末标点分句
  - 若某句超过 20 秒或词间停顿过长，自动兜底切分
  - 处理中日韩字符间的空格

### 4. 支持 .wav 音频输入

同一文件中将 `VideoConverter.supported_formats` 扩展为支持常见音频格式：

```python
return [
    ".mp4", ".mov", ".avi", ".mkv", ".flv", ".wmv", ".webm", ".m4v",
    ".wav", ".mp3", ".m4a", ".flac", ".aac", ".ogg",
]
```

### 5. 修复 .wav 输入被误删除的 Bug

原代码会把输入文件的后缀替换为 `.wav` 作为临时音频路径，当输入本身就是 `.wav` 时会导致原始文件被删除。

修复：将临时音频路径改为 `.transcribed.wav`：

```python
audio_path = str(Path(input_path).with_suffix(".transcribed.wav"))
```

## 使用方法

```bash
cd /c/Users/Administrator/translate-tool
.venv/Scripts/python.exe run_transcribe.py \
  "C:/Users/Administrator/Speaking/backend/tmp_audio.wav" \
  "C:/Users/Administrator/Speaking/backend/tmp_audio_transcript_sentences.md"
```

首次运行会从 HuggingFace 下载标点模型（约 500MB），后续使用本地缓存。

## 输出示例

```text
[00:00:09 -> 00:00:10] what's going on?

[00:00:10 -> 00:00:14] oh, they gave me another few weeks but I decided to hell with it.

[00:00:14 -> 00:00:15] I'm moving on.

[00:00:15 -> 00:00:17] I found a small apartment.

[00:00:17 -> 00:00:28] why didn't you tell me I'm quite able to take care of things myself and Henry Jackson, across the street is giving me a hand and I'm giving him five dollars.
...
```

## 已知限制

- 标点恢复模型基于 Europarl 演讲数据训练，对电影台词、口语化表达可能偶有偏差。
- 个别词会出现重复标点，例如 `That's Henry Jackson?.`，可简单后处理清洗。
- 该模型对中文、日文等 CJK 语言支持有限；如需中文断句，建议改用 `punctuator` 或针对中文训练的标点恢复模型。

## 方案对比实测

使用同一段音频 `tmp_audio.wav` 测试了两种进阶方案。

### 测试脚本

`C:/Users/Administrator/Speaking/test_whisperx_llm.py`

### 1. WhisperX（推荐）

**实现方式**：

```python
import whisperx

model = whisperx.load_model("large-v3", device, compute_type="int8")
audio = whisperx.load_audio(audio_path)
result = model.transcribe(audio, batch_size=1)

model_a, metadata = whisperx.load_align_model(
    language_code=result["language"], device=device
)
result = whisperx.align(result["segments"], model_a, metadata, audio, device)
```

**优点**：

- 断句最自然、标点最准确
- 每个句子都有精确时间戳（基于 wav2vec2 强制对齐）
- 能识别口语填充词（如 "He, uh, quit."）
- 不需要额外的 LLM 调用

**缺点**：

- 首次使用需下载 wav2vec2 对齐模型（约 360MB）
- 安装包较大，依赖 pyannote/lightning 等重型库
- CPU 上运行较慢（约几分钟）

**输出示例**（`tmp_audio_whisperx.md`）：

```text
[00:00:09 -> 00:00:10] What's going on?

[00:00:10 -> 00:00:14] Oh, they gave me another few weeks, but I decided to hell with it.

[00:00:14 -> 00:00:15] I'm moving on.

...

[00:02:02 -> 00:02:06] He, uh, quit.

[00:02:11 -> 00:02:12] He'll be back, right?
```

### 2. faster-whisper + LLM 标点恢复

**实现方式**：

1. faster-whisper 输出词级时间戳
2. 把所有词拼成文本，调用 LLM（`agnes-2.0-flash`）恢复标点并分句
3. 用 `difflib.SequenceMatcher` 将 LLM 返回的句子重新对齐到词时间戳

**LLM 配置**：

```text
OPENAI_API_KEY=sk-rb3NrV4Cipz8D3zpVL0Xcxo28oe5gCy42tcDIIg5laf7yrI5
OPENAI_BASE_URL=https://apihub.agnes-ai.com/v1
OPENAI_MODEL=agnes-2.0-flash
```

**优点**：

- 前半段标点恢复效果不错
- 能补全大小写（如 `What's`）
- 实现相对轻量（不需要 WhisperX 的重依赖）

**缺点**：

- **对齐是大问题**：后半段大量句子无法匹配回原始词序列，出现 `[?? -> ??]`
- LLM 有时会改写/合并词，导致时间戳丢失
- 长音频下 LLM 输出不稳定

**输出示例**（`tmp_audio_llm_punctuation.md`）：

```text
[00:00:09 -> 00:00:10] What's going on?

[00:00:10 -> 00:00:14] Oh, they gave me another few weeks, but I decided to hell with it.

...

[?? -> ??] Why?

[?? -> ??] Well, he knows a hero when he sees one.
```

### 结论

| 方案 | 断句质量 | 时间戳准确性 | 稳定性 | 推荐度 |
|------|----------|--------------|--------|--------|
| WhisperX | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | **首选** |
| faster-whisper + LLM | ⭐⭐⭐ | ⭐⭐ | ⭐⭐ | 不推荐用于带时间戳场景 |
| faster-whisper + deepmultilingualpunctuation | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | 性价比之选 |

**最终建议**：

- 如果追求最佳效果且能接受安装成本，使用 **WhisperX**。
- 如果希望轻量且效果较好，使用已集成的 **deepmultilingualpunctuation** 方案。
- **LLM 标点恢复** 更适合纯文本后处理，不建议直接用于需要时间戳对齐的场景。

## 相关文件

- 转录脚本：`C:/Users/Administrator/translate-tool/run_transcribe.py`
- 核心逻辑：`C:/Users/Administrator/translate-tool/app/converter/video.py`
- 示例输入：`C:/Users/Administrator/Speaking/backend/tmp_audio.wav`
- 示例输出：`C:/Users/Administrator/Speaking/backend/tmp_audio_transcript_sentences.md`
