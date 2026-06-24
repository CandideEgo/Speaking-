---
name: chinese-video-dubbing-pipeline
description: 中文视频→英文配音替换管线的完整设计方案（仅记录，未开发）
metadata:
  type: project
---

# 中文视频 → 英文配音替换管线

## 概述

为 Speaking 项目新增中文视频英文配音能力：中文 ASR → 中译英 → 英文 TTS → 保留背景音 + 替换人声 → 双视频版本输出。

## 环境约束

- RTX 3060 Ti 8GB VRAM
- faster-whisper 1.2.1
- 本地已有 base 模型（`C:\Users\Administrator\local-model\faster-whisper`）

## Phase 1: 语言感知的 ASR 和翻译

### 1A. WhisperX 支持中文

**现状**: `whisper_model.py` 硬编码 `language="en"`（line 104, 117）

**方案**: 改为 `language=None`（自动检测），按 language 缓存不同模型实例：
- `"en"` → 现有 base 模型（快速）
- `"zh"` / auto-detect 中文 → **`Systran/faster-whisper-large-v3-distilled`**（蒸馏版 large-v3，~1.5B，中文质量接近 large-v3，float16 约 3GB 显存）

**修改文件**: `whisper_model.py`, `transcription/__init__.py`, `chunked_transcription.py`, `video_processing.py`

### 1B. Video 模型添加 source_language

```python
source_language: Mapped[str] = mapped_column(String(10), default="en", nullable=False)
```

可用户指定或 WhisperX 自动检测后回填。新 Alembic 迁移。

### 1C. 双向翻译

`TranslationService.translate_batch()` 添加 `direction` 参数（默认 `"en_to_zh"`），新增 `ZH_TO_EN_PROMPT`。根据 `video.source_language` 选择方向。

### 1D. Subtitle 模型适配

`text_en` 改为 nullable。中文源视频：`text_zh` = ASR 转录（必填），`text_en` = 翻译。口语练习仍对比 `text_en`，逻辑自洽。

## Phase 2: TTS 服务 + 音源分离

### 2A. TTS: Edge-TTS

免费、高质量神经语音、SSML 支持速率调节（时间对齐关键）、异步友好。`pip install edge-tts`。后续可加 OpenAI TTS 作为付费备选。

```
backend/app/services/tts/
    __init__.py      # TTSService 单例
    engines.py       # 引擎配置
    timing.py        # 时长预测 + SSML
```

### 2B. 时间对齐策略

1. 预估时长: `len(text.split()) * 0.3`
2. 计算速率: `rate = estimated / target_duration`，限制 [0.5, 2.0]
3. SSML `<prosody rate="...">` 控制语速
4. 测量实际时长（ffprobe）
5. 创建静音画布，按 `start_time` 偏移放置各段
6. 微调用 ffmpeg `atempo`

**中英时长差异**: 英文比中文慢 20-40%，速率调节是主要对齐手段。

### 2C. 音源分离: Demucs (htdemucs)

保留背景音，只替换人声：

```
原音频 → Demucs → vocals.wav + no_vocals.wav
TTS 英文音频 + no_vocals.wav → ffmpeg amix → 最终配音音频
```

- 模型: `htdemucs`（混合Transformer，质量最好）
- 速度: 10 分钟音频约 2-5 分钟
- 安装: `pip install demucs`
- 背景音混合音量 0.7（可配置）

### 2D. ffmpeg 音频替换

```bash
ffmpeg -i original.mp4 -i merged_audio.wav \
  -c:v copy -c:a aac -b:a 128k \
  -map 0:v:0 -map 1:a:0 \
  -shortest output_dubbed.mp4
```

### 2E. 新配置项

| 设置 | 默认值 | 说明 |
|------|--------|------|
| `tts_engine` | `edge_tts` | TTS 引擎 |
| `tts_voice` | `en-US-JennyNeural` | 默认英文语音 |
| `tts_rate` | `1.0` | 默认语速倍率 |
| `demucs_model` | `htdemucs` | 音源分离模型 |
| `dubbing_bg_volume` | `0.7` | 背景音混合音量 |

## Phase 3: 配音管线

### 3A. 新 Celery 任务: `process_video_dubbing`

```
extracting → transcribing(中文, large-v3-distilled) → splitting → translating(中→英)
→ synthesizing(TTS) → separating(Demucs) → mixing(TTS+背景音) → merging(ffmpeg)
→ transcoding → uploading
```

新增 processing_step: `"synthesizing"`, `"separating"`, `"mixing"`, `"merging"`
时间限制: 2 小时

### 3B. 双视频版本

- 原音版: `video_url_480p/720p/1080p`（现有字段）
- 配音版: `dubbed_video_url_480p/720p/1080p`（新字段）

### 3C. Video 模型扩展

```python
dubbing_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
dubbed_video_url_480p: Mapped[str | None] = mapped_column(String(2000), nullable=True)
dubbed_video_url_720p: Mapped[str | None] = mapped_column(String(2000), nullable=True)
dubbed_video_url_1080p: Mapped[str | None] = mapped_column(String(2000), nullable=True)
```

### 3D. API

```python
class VideoCreate(BaseModel):
    source_language: str = "en"        # 新增
    enable_dubbing: bool = False       # 新增
    dubbing_voice: str | None = None   # 新增
```

## Phase 4: 前端

- 提交表单: 源语言下拉 + "启用英文配音" 复选框
- 播放页: "原音 / 配音" 切换按钮（切换 `<video>` source URL）
- 处理步骤标签: synthesizing/separating/mixing/merging

## 关键风险

- **GPU 显存**: WhisperX (~3GB) + Demucs (~3GB) 不能同时加载，需串行执行 + `torch.cuda.empty_cache()`
- **时长对齐**: 极端情况需 >2x 加速，语音质量下降
- **Demucs 分离**: 不完美，部分人声残留或背景音损失
- **Edge-TTS**: 依赖微软公共服务，可能限流，需重试逻辑

## 实施顺序

```
Phase 1 (ASR+翻译) ──┐
                      ├──→ Phase 3 (配音管线) ──→ Phase 4 (前端)
Phase 2 (TTS+Demucs) ─┘
```

预估工作量: 14-18 天

## 验证方案

1. 单元测试: TTS timing、双向翻译、Demucs 分离
2. 集成测试: 30 秒中文视频全流程
3. 手动 QA: 5 分钟中文视频（同步、自然度、背景音保留）
4. 边界: 极短/极长段、数字日期、纯音乐、多人对话
5. GPU: 验证串行执行时显存正确释放
