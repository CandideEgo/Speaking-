# 转录与翻译管线质量修复报告

> 日期: 2026-07-07 | Commit: `4ef0334`

## 1. 背景

生产环境中 5 个官方视频的字幕翻译覆盖严重不足，部分视频超过 40% 的句子没有中文翻译。同时转录结果存在词粘连问题，导致字幕显示为不可读的连续字符。

### 修复前状态 (数据库中实际数据)

| 视频 | 时长 | 字幕数 | 已翻译 | 翻译率 |
|------|------|--------|--------|--------|
| 6 Tips on Being a Successful Entrepreneur | 15min | 192 | 132 | 69% |
| a week in my life vlog | 19min | 268 | 208 | 78% |
| Building Anthropic | 52min | 700 | 400 | **57%** |
| A German Girl Trying to Preserve Japan's | 19min | 142 | 122 | 86% |
| HOW TO DRAW A PERSON | 12min | 197 | 117 | **59%** |
| **合计** | | **1499** | **979** | **65.3%** |

## 2. 根因诊断

### 2.1 转录词粘连

**症状**: WhisperX 输出 `Likeifyoulookatthelikeearlydiscussionsin1939...`，words 正常但 text 字段粘连。

**根因**: WhisperX ASR 阶段（large-v3-turbo 模型）在长段连续语音上产生幻觉，吞掉空格。`whisperx_segments_to_subtitles()` 和 `_build_subsegment()` 直接沿用原始 text 字段，没有用已对齐的 words 重建。

**影响范围**: long_52min 视频中 8.2% 的段（57/699）有粘连。

### 2.2 翻译空字段

**症状**: 大量字幕 `text_zh` 为 NULL，用户看到只有英文没有中文。

**根因（三层叠加）**:

| 层级 | 问题 | 影响 |
|------|------|------|
| **hy_mt2 合并翻译** | batch=20 时返回 3 条合并翻译（20→3），完全无视逐条指令 | 7/10 批次长度不匹配 |
| **agnes 大 payload 404** | batch=20 时 HTTP 404，batch=5 正常 | 整批翻译丢失 |
| **短数组全丢** | `_call_engine()` 在 `len(parsed) < len(texts)` 时返回 None | 18/20 有效翻译也全部丢弃 |
| **无 retry** | `_translate_subtitles()` 无重试逻辑 | None 永久残留 |

### 2.3 JSON 解析问题

hy_mt2 输出中使用**中文逗号 `，`** 作为数组元素分隔符，以及 **CJK 角括号 `「」`**，`sanitize_json()` 未处理导致 JSON 解析失败。

## 3. 修复方案

### 3.1 转录修复: words 重建 text

**文件**: `backend/app/services/transcription/formatters.py`

两处修改:
1. `whisperx_segments_to_subtitles()`: 当 words 存在时，用 words 重建 text（词间加空格），不再沿用 ASR 原始 text
2. `_build_subsegment()`: `"".join()` → `" ".join()`，空格分隔拼接

**效果**: 词粘连从 8.2% → **0%**

### 3.2 翻译修复: 六项改动

| # | 修改 | 文件 | 效果 |
|---|------|------|------|
| 1 | `EngineConfig` 加 `batch_size` 字段，hy_mt2/agnes 设为 5 | `engines.py` | 避免大 batch 触发合并/404 |
| 2 | hy_mt2 专用 `HYMT2_TRANSLATION_PROMPT` 强调逐条翻译 | `engines.py` | 合并从 20→3 降到 5→4 |
| 3 | 默认 `translation_batch_size` 从 20 改为 5 | `config.py` | 安全底线 |
| 4 | `_call_engine()` 短数组 pad None 而非丢弃全部 | `__init__.py` | 保留部分有效翻译 |
| 5 | `_translate_subtitles()` 加逐条 retry | `video_processing.py` | 补全残留 None |
| 6 | `effective_batch_size` 属性 | `__init__.py` | 感知 per-engine batch_size |

### 3.3 JSON sanitizer 修复

**文件**: `backend/app/services/translation/json_sanitizer.py`

- 新增 `re.sub(r'"，"', '","', text)` 处理中文逗号分隔符
- CJK 角括号已由 `_normalise_quotes()` 处理

## 4. 修复后验证

### 4.1 转录质量

| 指标 | 修复前 | 修复后 |
|------|--------|--------|
| 词粘连段数 (long_52min) | 57 (8.2%) | **0** |
| text vs words 词数匹配 | 不匹配 (9119 vs 10134) | **匹配** (10134 vs 10134) |
| 最大段长 | 29.9s (plain-whisper) | 13.5s (WhisperX) |
| 平均段长 | 3.74s (plain) / 4.07s (WhisperX) | 3.53s (WhisperX) |

### 4.2 翻译覆盖

5 个视频全部重处理后的翻译率:

| 视频 | 旧翻译率 | 新翻译率 | 提升 | None残留 |
|------|----------|----------|------|----------|
| anthropic_52min | 57.1% (400/700) | **100%** (700/700) | +42.9pp | 0 |
| drawing_12min | 59.4% (117/197) | **100%** (197/197) | +40.6pp | 0 |
| entrepreneur_15min | 68.8% (132/192) | **100%** (192/192) | +31.2pp | 0 |
| german_japan_19min | 85.9% (122/142) | **100%** (142/142) | +14.1pp | 0 |
| vlog_19min | 77.6% (208/268) | **100%** (268/268) | +22.4pp | 0 |
| **合计** | **65.3%** (979/1499) | **100%** (1499/1499) | **+34.7pp** | **0** |

### 4.3 处理速度

| 视频 | 转录耗时 | 翻译耗时 | 总计 |
|------|----------|----------|------|
| drawing_12min | 22.6s | 81.1s | 103.7s |
| entrepreneur_15min | 66.2s | 96.3s | 162.5s |
| german_japan_19min | 28.6s | 61.8s | 90.4s |
| vlog_19min | 34.6s | 123.2s | 157.8s |
| anthropic_52min | 90.9s | 336.2s | 427.1s |

### 4.4 双语字幕质量样例

```
1
00:00:00.198 --> 00:00:02.919
Why are we working on AI in the first place?
我们最初为什么要研究人工智能呢？

2
00:00:03.439 --> 00:00:05.420
I'm just going to arbitrarily pick Jared.
我就随便选贾里德吧。

3
00:00:05.560 --> 00:00:07.700
Why are you doing AI at all?
你究竟为什么要做人工智能？

4
00:00:07.720 --> 00:00:12.502
I was working on physics for a long time and I got bored and I wanted to hang out with more of my friends.
我之前长期研究物理学，后来觉得无聊了，就想多和朋友一起出去玩。
```

## 5. 已知遗留问题

1. **agnes 429 限流**: 免费用户有 API 调用频率限制，大批量翻译时偶发 429。并发模式下 hy_mt2 兜底，不影响最终翻译率。长期应考虑升级 agnes API 套餐或切换主引擎。

2. **hy_mt2 CJK 角括号**: 偶尔仍用 `「」` 作为引号，`sanitize_json` 的 `_normalise_quotes` 已处理 `「」→""` 并修复相邻 `""→","`，但某些嵌套场景仍可能解析失败。当前由短数组 pad None + 逐条 retry 兜底。

3. **hy_mt2 5→4 mismatch**: 约 10% 的 batch 仍少返回 1 条（5→4），新 prompt 大幅改善但未完全消除。逐条 retry 补全。

4. **项目管线 OOM sticky fallback**: 长视频分块转录时，WhisperX OOM 后触发 `cudaErrorInvalidDevice` 被标记为 non-OOM hard failure → sticky fallback 到 faster-whisper。这是 CUDA 资源竞争问题，需单独修复。

## 6. 修改文件清单

| 文件 | 修改内容 |
|------|----------|
| `backend/app/services/transcription/formatters.py` | words 重建 text; `"".join`→`" ".join` |
| `backend/app/services/translation/engines.py` | EngineConfig.batch_size; HYMT2_TRANSLATION_PROMPT; per-engine batch_size=5 |
| `backend/app/services/translation/__init__.py` | 短数组 pad None; effective_batch_size 属性 |
| `backend/app/services/translation/json_sanitizer.py` | 中文逗号 `，` 处理 |
| `backend/app/tasks/video_processing.py` | 逐条 retry; 用 effective_batch_size |
| `backend/app/core/config.py` | translation_batch_size 默认 20→5 |

## 7. 服务器数据同步

5 个视频的修复后字幕数据已导出为 `backend/scripts/update_subtitles_20260707.sql.gz`（400KB，1499 条字幕，含词级时间戳）。

**导入命令**（服务器 SSH 恢复后执行）:

```bash
# 上传到服务器
scp -P 7001 backend/scripts/update_subtitles_20260707.sql.gz fuwei@47.122.127.105:/tmp/

# SSH 登录后导入
ssh -p 7001 fuwei@47.122.127.105
gunzip -c /tmp/update_subtitles_20260707.sql.gz | docker exec -i speaking-db-1 psql -U <db_user> <db_name>
```

本地数据库已应用此数据（5 个视频全部 100% 翻译覆盖）。服务器数据库待 SSH 恢复后导入。

**SSH 连接问题**: 服务器 `47.122.127.105` 端口 7001 拒绝连接（sshd 服务未启动或防火墙未放行），端口 22 公钥认证失败（`authorized_keys` 可能缺失或权限错误）。需通过云控制台 VNC 登录检查：
1. `sudo systemctl status sshd` — 确认 SSH 服务状态
2. `sudo cat /etc/ssh/sshd_config | grep -i port` — 确认配置端口
3. `sudo ufw status` — 确认防火墙放行 7001
4. `cat ~/.ssh/authorized_keys` — 确认公钥存在且权限为 600
