# 同类项目技术调研（2026-10）

**调研范围**：视频 + 字幕逐词点读赛道的开源与商业项目，用于对照 SeeWord 的技术选型与产品缺口。

**本文性质**：一次性调研记录，**不是常驻规则**。规则类事实仍以三层 `CLAUDE.md` 与代码为准。

**快照警告**：下文所有 star 数、open issue 数、最后提交时间均为 **2026-10-16** 的检索快照，会过期。许可（license）变动概率低，可长期引用；项目活跃度不可。

**信息来源**：tavily 5 次 + exa 4 次搜索 + 8 篇正文抓取，全部经 MCP 工具，未使用内置 WebSearch。逐条 URL 见文末 §11。

**外部事实的处置约定**：本文所有关于开源项目的描述均来自其 README / 文档 / 检索摘要，**未做代码级核对**。凡引用其自述性能数字（如相关系数）均已标注出处为「其 README 自述」。若要据此做技术选型，须先本地复现。

---

## 0. 结论提要

| # | 结论 | 一句话 |
|---|---|---|
| 1 | **无同构竞品** | 「视频逐词点读 + 跟读评分 + 四六级试卷 + 多租户 SaaS」四件事同时做的，检索结果里没有 |
| 2 | **开源阵营全是 local-first 单用户** | 形态是「本地播放器」或「自托管 Docker」——**基础设施代码对 SeeWord 基本零价值** |
| 3 | **SeeWord 在两处领先、一处落后** | 领先：本地化词注管线、备考内容侧、多租户基础设施；落后：**跟读无评分** |
| 4 | **唯一高价值可迁移方向** | 把跟读从「录音存档」升级为「本地音素级评分」——OpenPronounce 是许可与成本最优解 |
| 5 | **GPL 是硬约束** | LLPlayer / LinguaCafe 是 GPL-3.0，**代码不可用于闭源商业 SaaS**；Lingua Nova / PolyglotWhisperer / mirumoji / OpenPronounce / asbplayer 是 MIT，可参考 |

---

## 1. 分类框架

按「与 SeeWord 的可比维度」分层，不按 star 数：

| 梯队 | 判据 | 成员 |
|---|---|---|
| **A. 架构同构** | 服务端管线 + Web 播放器 + 词级字幕 + 生词复习 | mirumoji、PolyglotWhisperer、Lingua Nova |
| **B. 播放器交互** | 桌面端，交互可抄，架构不可抄 | LLPlayer、asbplayer、Voracious、LinguaMiner、SubLingo、Kardenwort |
| **C. 字幕/对齐管线** | 只解决「音频 → 词级时间戳」 | WhisperX、WordAlign、CapForge、whisperx-subtitles-replicate |
| **D. 跟读评测** | 只解决「录音 → 分数」 | OpenPronounce、Slip、GOPT、speechocean762 |
| **E. 阅读向 & 商业对标** | 只解决「读 + 复习」或纯题库 | LinguaCafe、过级鸭、exampapers.cn |

---

## 2. 梯队 A：架构同构

### 2.1 mirumoji — 形态最像

`svdC1/mirumoji` · 40★ · MIT · 创建 2025-06 · Python / TS / Docker · 0 open issues

**技术特点**
- 丢视频 → **faster-whisper 转录（本地 GPU 或 Modal 云 GPU）** → 可点击分词字幕 → 词典弹窗 → 片段保存 → Anki 导出
- `Docker Compose` 起全套；三入口：**桌面 Launcher / CLI / 手动**
- 词典自建（`kotobase`，支持通配符搜索）；LLM 可选（Gemini / Claude / GPT / 本地），用于生成句子拆解，**prompt 可自定义**
- **Profiles**：按用户隔离生成文件、转录、片段、LLM 模板

**优点**
- **唯一一个明确做了「本地跑不动就扔云 GPU」的项目**——和 SeeWord 的 head/GPU/tail 切分是同一个物理约束的两种解法
- 贡献集中（单 maintainer 490 commits），文档站点齐全

**缺点 / 风险**
- **面向日语**：分词、假名、kotobase 词典全是日语专用；对英语（空格分词 + ECDICT）借鉴价值低
- **0 open issues 不能当作稳定的证据**——可能是没人用，也可能是 issue 区不活跃
- 云 GPU 外包给 Modal，数据主权弱于 SeeWord 自建 GPU 机

**可迁移**：CLI + 桌面 Launcher 双入口（SeeWord 只有 Web）；生成物按 profile 隔离的目录约定。

### 2.2 PolyglotWhisperer — 技术栈几乎重合

`RizhongLin/PolyglotWhisperer` · 8★ · MIT · 创建 2026-02 · Python 3.12 + uv + FastAPI + React + TanStack Router + Tailwind

**技术特点**
- 管线四段：`transcribe → refine → translate → vocab(CEFR 难度分析)`
- 前端四页：**Library / Player / Studio / Review**
- Player **直接从源站流式播放，不下载视频**；点词看难度、存卡
- Review 用 **FSRS 排程**；LLM 后台自动富化卡片（词形还原 / 母语释义 / IPA / 语域 / 不规则形语法备注 / 例句 / 助记）
- 部署 `docker compose up -d`（Postgres + 应用）；**每用户自带加密 API key**；有 admin 角色
- 配置分层：内置默认 → `~/.config/pgw/config.toml` → `./pgw.toml` → `.env` → CLI flag
- CLI：`run / transcribe / translate / vocab / export / play / serve / clean / languages`，另有 mpv 播放路径
- **不需要 GPU**（全走云 API）

**优点**
- **`refine` 这一步是 SeeWord 缺的**：转录后先让 LLM 修语法、补漏字，再翻译——比「质量门检测到幻觉就丢弃重跑」节省 GPU 时间
- FSRS 是 Anki 当前主力算法，比艾宾浩斯曲线更先进

**缺点 / 风险**
- **8★、单人、2026-02 才建**，极不成熟
- 「源站直接流式播放」依赖源站可达性，链接失效内容即废——SeeWord 转码自存更稳
- 全云 API 意味着零数据主权，成本随用户线性增长

**可迁移**：`refine` 步骤；FSRS；配置分层。

### 2.3 Lingua Nova — 目标人群重叠，最值得细读

`huthvincent/yt-bilingual-app` · **229★** · MIT · 创建 2026-03 · React + FastAPI + Gemini · 文档写明 "Designed for Chinese learners"

**技术特点**
- **渐进式 SSE 管线 + 断点续传 + 自愈翻译**：字幕一到就先显示，翻译边看边流式补
- **难度轴单参数化**：一个 Liftoff → Supernova 滑杆，只高亮「高于你级别」的词，中文释义以 **ruby 注音**叠在词上方
- **点词卡片**：IPA / 词性 / 上下文感知的中文释义 / 英文释义 / 例句 + 一键发音 + 一键收藏
- **词典结果落盘缓存，「每个词一生只花一次 API 调用」**
- **听写模式**（blur 英文，靠耳朵自查）；句子循环、倍速、键盘控制
- Whisper 兜底（无字幕视频）；Anki / CSV 导出
- 移动端有 **Expo React Native 客户端**（`mobile/`）
- 文档纪律好：`specs/` + `CONSTITUTION.md`，中文撰写

**优点**
- **SSE 流式 + 断点续传**能显著改善首帧等待
- **难度轴单参数化**比按 CEFR 分级可能更好用——用户只需调一根滑杆
- 「每个词只花一次 API 调用」的缓存哲学，与 `prewarm_notes` 同源但**粒度不同**：它是按词，SeeWord 是按视频

**缺点 / 风险**
- **Gemini 单供应商锁定**，相对 SeeWord 的 `ai_service` 抽象层是退步
- Whisper 兜底只给 `base` 模型，质量差
- 路线图里 **`AI pronunciation assessment` 与 `In-app SRS` 仍是未打勾的 TODO**

**可迁移**：SSE 流式管线；难度轴；ruby 注音式词义展示；按词缓存。

---

## 3. 梯队 B：播放器交互（抄交互，别抄代码）

| 项目 | 星 / 许可 / 栈 | 核心特点 | 关键缺点 |
|---|---|---|---|
| **LLPlayer**<br>`umlx5h/LLPlayer` | 4352★ · **GPL-3.0** · C#/WPF | 双字幕（文本 + 位图）、whisper.cpp / **faster-whisper** 实时生成、多引擎实时翻译、**LLM 上下文感知翻译**、Tesseract / 微软 OCR 实时位图转文本、字幕侧栏增量搜索、yt-dlp 播在线视频 | **Windows 独占**；**无词典查询**（只能翻译 + 复制剪贴板）；跨平台 Avalonia 未做；`Word Management` 与 `Anki Integration` 均仍未实现 |
| **asbplayer**<br>`asbplayer/asbplayer` | 1426★ · MIT · TS/Go/Python | **字幕句子挖掘**、自动暂停 / 跳读 / 快进无字幕段、可导航字幕列表、与 **Yomitan** 联动做词态着色 / 假名注音 / 音高注音 / 词频注音、已知词理解度统计 | **本体是胶水**：须另装 Yomitan + Anki + AnkiConnect 才完整；205 open issues |
| **Voracious**<br>voracious.app | — · 开源（GPL 系） | 像 Kodi/Plex 扫媒体库、多字幕轨同显、**全库字幕内搜词**、字幕卡导出 Anki（subs2srs 式）、日语悬停词典 + furigana + EPWING 词典导入 | 日语向；桌面端；无服务端 |
| **LinguaMiner** | — · MIT · Python | **i+1 推荐**（未知 + 够高频 + 非专有名词才高亮）；词态（红/橙/无色）**从 Anki 复习间隔同步**；可导入 Migaku / jpdb / LingQ / Anki 既有词库；**condensed audio 导出**（50 分钟剧集压到 20 分钟做泛听）；也能读 `.txt` / `.epub` | 单人项目；本地独占 |
| **Kardenwort mpv 套件**<br>`voothi/…` | — · — · mpv/AHK | **.ass 逐词 / 逐字卡拉OK高亮**；**Karaoke-Safe Autopause**（扫描 `{\c}` 标签，只在整句结束时暂停，不被逐词高亮打断）；`Line:Word:TermPos` 三坐标锚定**防止高亮串台** | 重度依赖 mpv + AutoHotkey + GoldenDict 的 Windows 自动化栈，产品化无望 |
| **SubLingo**<br>`miroshArtem/SubLingo` | — · — · FastAPI + Electron | **每步管线结果都缓存，Reprocess 只重跑翻译层**；Argos 离线翻译；ElevenLabs 转录；便携包 1.1GB（内含 Python/ffmpeg/翻译模型） | 需要 ElevenLabs API key；Windows first |

**本梯队对 SeeWord 最有价值的三条交互**
1. **Karaoke-Safe Autopause** —— 逐词高亮播放时「何时暂停」是真问题，它的解法可直接借鉴
2. **`Line:Word:TermPos` 三坐标锚定** —— 若 `word_levels` 做高亮，同样会遇到「常见词跨句串台」
3. **i+1 高亮的三个条件** —— 比单纯「不在词表里就高亮」精确得多

---

## 4. 梯队 C：字幕 / 对齐管线

| 项目 | 特点 | 对 SeeWord 的价值 |
|---|---|---|
| **m-bain/whisperX** | SeeWord 已在用。70x 实时（large-v2）、wav2vec2 强制对齐、pyannote 说话人分离、VAD 预处理降幻觉 | `--highlight_words` 与句级分段值得对照；v3 删了 .ass 输出，社区在往回加 |
| **ghalymt/WordAlign** | **瀑布式对齐**：Vosk → 粗 SRT → Qwen ASR → WhisperX → MFA → 插值，每级补前级漏词；**Reference 模式 = 以给定字幕为准，引擎只提供时间**；MFA 覆盖 65+ 语言；**作业队列 + 阶段缓存**，被关机打断的任务可从阶段重跑 | ① **Reference 模式对「用户上传字幕」是正确姿态**；② **阶段缓存 + 断点重跑**对应 `processing_step` / `step_started_at`——SeeWord 已有状态机，缺的是「从失败阶段重跑」而非「整段重跑」 |
| **FRSname/CapForge** | WhisperX + faster-whisper + CTranslate2 + pyannote；FastAPI 后端 + Electron 前端；导出 **Word SRT / 标准 SRT / VTT / JSON / 项目文件** 五种格式 | 导出格式矩阵可直接抄；注意 Word SRT 是**字级**（一词一条） |
| **dashed/whisperx-subtitles-replicate** | PySBD 断句 → 按最短/最长时长、行长、行数、**4 WPS 阅读速度**合并拆分 cue；**纯函数 + pytest 覆盖** | 若 finalize 里有字幕切分逻辑，这组常量（4 WPS、行长、行数）是现成基线，且有测试范式 |

> **注意**：WordAlign 仅 1★，contribute 列表首位是 **"claude"（47 commits）**——AI 生成比例很高的新项目。**读它的设计，别信它的代码。**

---

## 5. 梯队 D：跟读评测 —— SeeWord 真正的空缺

### 5.0 现状基线（本仓事实）

- `backend/app/models/shadowing.py` 注释明写：*"Lightweight shadowing: user records audio per subtitle sentence, **no AI scoring**. Replaces the frozen SpeakingAttempt for new data."*
- `ShadowingAttempt` 落库字段只有 `audio_url` / `duration_ms` / `is_satisfied`（布尔，用户自评）
- `app/services/shadowing_service.py`（246 行）只有 `create_attempt` / `list_by_video` / `delete_attempt` / `update_satisfied` / `get_stats`——**无任何评分逻辑**
- 这与 `docs/product-review-2026-10.md` 记录的边界一致：ADR-0002（跟读无 AI 评分）原有决定不碰，但**口语评测作为新方向可以讨论**

**结论**：跟读目前是「录音存档 + 自评」，不是评测。这是 SeeWord 相对本梯队项目唯一的实质性技术空白。

### 5.1 OpenPronounce —— 推荐首选

`Halleck45/OpenPronounce` · 120★ · **MIT** · 创建 2025-08 · Python · **CPU 可跑** · 2 open issues

**算法链**（README 自述）
1. `wav2vec2-lv-60-espeak-cv-ft` 识别**实际念出的音素**——**不经语言模型，不让模型「纠正」学员**
2. espeak-ng 把目标句音素化；两侧归一化（去长音符号、英语弱读、cot-caught 合并、若干双读虚词）
3. 编辑距离对齐；每个错音给 **CTC 后验置信度**（清晰替换/删除给满，近音替换给半，词尾降权，期望音在那几帧本就合理时再降）
4. 另用 `wav2vec2-large-960h` 转写，算 WER
5. 合成音（gTTS / Piper / Kokoro）与学员录音各编码一次，**DTW 对齐得 acoustic distance**

**评分公式**：`0.3 × acoustic + 0.4 × (1 − PER) + 0.3 × (1 − WER)`，三项各自 clip 到 [0, 100]

**自述精度**（README）：权重在 **speechocean762 的 500 句**上拟合，与人类总分 **Spearman ρ = 0.65**（逐说话人 0.83）；**人类评分者之间 ρ = 0.57**。

**输出**：0–100 分、逐词错误、**expected IPA → heard IPA**、逐音置信度、PER / WER、音高与能量曲线。

**优点**
- **MIT 许可、CPU 可跑、pip 一个包**，学员录音不出服务器——同时解决成本、隐私、ICP 合规三件事
- 定位诚实：*"Azure Speech / SpeechAce / ELSA 把这些卖在 API key 和按分钟计费后面"*
- 中文用户的典型错误模式（θ/s、v/w、n/l、辅音丛、词尾清化）恰好是音素级诊断的强项

**缺点 / 风险（README 自列，建议原样抄进设计文档）**
- 两个 wav2vec2 checkpoint **各约 1.2 GB**，首次下载；系统需装 `ffmpeg` + `espeak-ng`（Windows 上是部署摩擦）
- **不是用学员语音训的模型**，是在 speechocean762 上校准的启发式：*"这是校准过的启发式，不是用标注学员语音训出来的模型"*
- 强口音、儿童、噪声下退化；音素识别器自身错误率约「干净母语朗读中每十个音错一个」→ **短词上偶发误报**
- 自述实测：它标出的词里**每 5 个有 1 个被人类判为误报**；人类判错的词里它抓到 **7/10**
- 除英语外（法/西/德/意/葡/荷）仅「实验性」，只复用英语阈值

### 5.2 Slip —— 纯浏览器，粒度到音素

`RemiKG/slip` · 浏览器端 · wav2vec2 音素模型 318 MB int8（缓存一次）· **TS 从零实现 CTC trellis + Viterbi 强制对齐 + GOP-CTC 打分**

- 设计信条：**「模型负责听，数学负责判」**——不让语言模型有机会纠正学员
- 粒度是**音素**，输出 `expected /θ/ → heard /f/`，可**点高亮回放自己那一帧**
- 可**拍书页照片**（tesseract.js OCR）读出来标音
- 有 `PHONEME_BACKEND` 接缝（browser | server），两条路走同一套 `dsp / align / gop`，结论一致
- 有「0 次网络请求」的实时账本，隐私主张可验证

**缺点**：自述 GOP-CTC 与人类评分相关性仅 **0.44–0.46（音素级）**，弱于 OpenPronounce 句级 0.65；作者自定位 *"练习教练，不是语音病理评估"*，只指出「哪个音错了」，不解释「为什么」。

**取舍**：音素级诊断是中国学员真正需要的（能指出 θ/s），但**返回音素级结果的 UX 门槛高**——用户要的是分数，不是 IPA。建议**分数在前、音素诊断在二级面板**。

### 5.3 GOPT —— 学术 SOTA，工程代价高

`YuanGongND/gopt` · ICASSP 2022 · MIT & PAII

- **多维度 × 多粒度**：准确度 / 流利度 / 韵律 / 完整度 × 音素 / 词 / 句
- 自述在 speechocean762 上 **句级 PCC 0.742、词级 0.549、音素级 0.612**
- **依赖 Kaldi 做 GOP 特征提取**（最大工程代价）；作者提供预计算 Kaldi 中间产物，可**免 Kaldi 跑通**
- `E3zra/…` 的 fork 加了 **Web 界面 + Docker + Whisper ASR + OOV 自动 G2P + 长音频分段 + REST API**，中文文档，落地成本低得多

### 5.4 语料：speechocean762

`jimbozhang/speechocean762` · **5000 句英语、非母语、母语全是普通话**、一半儿童一半成人 · 音素/词/句三级专家评分 · **免费商用**

**这份语料的价值极高**：其 L1 是普通话，**与 SeeWord 用户群同分布**。若自训评分模型，这是唯一现成的同分布数据。OpenPronounce 与 GOPT 都在它上面校准——意味着**可以用同一套指标做横向选型**。

### 5.5 其他参考

- `tzyll/goparrot`、`rudder-analytics/Goodness-of-Pronounciation`、`sweekarsud/Goodness-of-Pronunciation`：Kaldi GOP 的三种公式（posterior / likelihood / likelihood-ratio），是理解 GOP 的地基
- `Jim-Elijah/fluent-any-lang`：**跟读的产品形态参考**——Shadowing（同步跟读 + 倒计时提示）与 Echo（先听原句再录，**每句可留多次 take**）、原音与录音**同步对比播放**、统计用**有效练习时长**而非挂钟时间、IndexedDB 全本地

> **「多次 take + 原音同步对比」这个交互比单纯给一个分数更有教学价值，而且不需要任何 AI。** 可作为跟读改造的第一阶段（零模型成本）。

---

## 6. 梯队 E：阅读向 & 商业对标

| 项目 | 星 / 许可 / 栈 | 特点 | 缺点 |
|---|---|---|---|
| **LinguaCafe**<br>`simjanos-dev/LinguaCafe` | 1472★ · **GPL-3.0** · PHP/Laravel + Vue | 自托管阅读器：读 → 查生词 → 复习闭环；支持 27 种语言；JMDict / CC-CEDICT 等 | **只做阅读不做视频**；184 open issues；全语言时 RAM > 2 GB；**x64 only**（树莓派 3+ 跑不了）；作者自认「仍在开发」 |
| **过级鸭**<br>guojiya.cn | 闭源 · 商业 | 2013–2026 共 140+ 套四六级/考研真题；AI 智能组卷；**听力沉浸训练（倍速 / 单句循环 / 显示原文）**；**点词翻译**；**智能生词本（艾宾浩斯）**；单词打字训练（WPM / 准确率）；AI 逐题解析；¥19.9/月 | 纯音频，**无视频、无逐词时间轴、无跟读** |
| **exampapers.cn** | 闭源 · 商业 | **逐句翻译 + 问题选项翻译**；**写作 AI 批改（综合/词汇/语法/逻辑/主题五维）**；**翻译 AI 批改**；富文本笔记（粗斜体 / 四种下划线 / 高亮 / 注释） | 同上，无视频无跟读；有 ICP 备案号 |
| **english-zhenti-online**<br>`ShawnYou1/…` | 86★ · **无代码** | 考研 / 四六级 / 专八在线真题 | **7 个 commit，仓库里只有 README + 4 张截图，没有代码**——只能当产品形态参考，绝不能当代码参考 |

**商业阵营全景**（Language Reactor / Migaku / Trancy / Linglass / InterSub / Immersive Translate / FluentAI）**全部是浏览器扩展 + 流媒体**：靠 YouTube / Netflix 的内容，自己没有内容壁垒。Migaku 最贵（$499 终身）却被吐槽解析质量（`ございません` 被切成 `ござい` + `ません`）；Trancy 被指会用自己的 AI 字幕**替换掉 Netflix 原生字幕**。

**一处需要修正的早期判断**：先前认为「视频沉浸派不做应试，题库派不做视频」——前半句成立，**后半句偏乐观**。过级鸭已经做了「听力沉浸训练 + 点词翻译 + 生词本」，差距比预想窄。SeeWord 真正的差异化是**「视频」**（带逐词时间轴、可跟读），而不是「点词 + 生词本」本身。

---

## 7. 横向对照表

| 项目 | 许可 | 内容来源 | 词级时间轴 | 词典 | 复习 | 跟读评测 | 部署形态 |
|---|---|---|---|---|---|---|---|
| **SeeWord** | 闭源 | **自存（转码 + OSS）** | ✅ `words` / `word_levels` | ✅ ECDICT 本地 | ✅ 词汇 / 学习记录 / 里程碑 | ❌ **仅自评布尔** | **多租户 SaaS + 独立 GPU 机** |
| mirumoji | MIT | 本地文件 | ✅ whisper | ✅ kotobase | ⚠️ 导出 Anki | ❌ | 自托管 Docker |
| PolyglotWhisperer | MIT | 源站流式 | ⚠️ 句级为主 | ✅ LLM 富化 | ✅ FSRS | ❌ | 自托管 Docker |
| Lingua Nova | MIT | YouTube | ✅ | ✅ LLM + 缓存 | ⚠️ 导出 Anki | ❌ *(路线图 TODO)* | 本地 / 自托管 |
| LLPlayer | **GPL-3.0** | 本地 / yt-dlp | ✅ | ❌ 仅翻译 | ❌ | ❌ | Windows 桌面 |
| asbplayer | MIT | 流媒体 / 本地 | ⚠️ 句子级 | ⚠️ 依赖 Yomitan | ⚠️ 依赖 Anki | ❌ | 浏览器 / 扩展 |
| LinguaCafe | GPL-3.0 | 本地文本 | N/A | ✅ | ✅ | ❌ | 自托管 Docker |
| OpenPronounce | **MIT** | N/A | N/A | N/A | N/A | ✅ **句级 0.65 ρ** | **pip / CPU 可跑** |
| Slip | — | N/A | N/A | N/A | N/A | ✅ 音素级 0.44 ρ | 纯浏览器 |
| GOPT | MIT | N/A | N/A | N/A | N/A | ✅ **句级 0.742 PCC** | Kaldi（重） |

---

## 8. 关键判断：为什么他们的代码抄不动

这是看完所有项目后最重要的一条结论。

**开源阵营 100% 是 local-first 单用户，SeeWord 是多租户 SaaS。** 这个差异派生出一整套他们根本不需要、而 SeeWord 必须有的东西：

| 维度 | 开源阵营的解法 | SeeWord 的解法 |
|---|---|---|
| 内容存储 | 本地文件系统（`library/`、profile 目录、JSON 缓存） | **OSS + Postgres + Range-aware 自建 media 路由** |
| 视频访问鉴权 | 不需要（本机） | **`?token=` 附 token**（因为 `<video>` / `<audio>` 发不了请求头） |
| 长任务 | 同进程 / 同步阻塞 | **Celery（云端 + GPU 双队列）+ 看门狗** |
| GPU | 「本地跑不动就扔 Modal / 云 API」 | **自建 GPU 机 + 共享密钥回调 + Redis 去重锁** |
| 用户隔离 | 单用户 | 按 `user_id` 全表隔离 |
| 计费 | 无 | 订单 + mock 支付 + 解锁 |

**推论**：他们的「管线代码」对 SeeWord 几乎零价值，他们的**算法、交互、常量、产品决策**才是金矿。反过来说，SeeWord 的基础设施（Range-aware 媒体服务、`?token=`、双队列 Celery、共享密钥回调、阶段状态机 + 看门狗）比**所有**开源项目都成熟——这部分是领先的。

**GPL 边界**：LLPlayer 与 LinguaCafe 是 GPL-3.0，**连交互都可以学，代码一个字都不能碰**。

---

## 9. 对 SeeWord 的建议（按性价比排序）

### P0 — 跟读评分自建化（唯一的高价值空缺）

- **现状**：`shadowing_attempts` 只存 `audio_url` + `duration_ms` + 用户自评 `is_satisfied`
- **前提**：`docs/product-review-2026-10.md` 已记录「口语评测作为新方向可以讨论」，且 ADR-0002 的原决定不碰——**本建议是新增能力，不是推翻 ADR-0002**
- **推荐路径**：OpenPronounce 路线（MIT、CPU 可跑、pip 可装）
- **风险控制（措辞可直接沿用其 README）**：
  - 定位为「练习教练，不是考官」
  - 对短词误报，**UI 上要留出让用户「这题我念对了」的否决路径**
  - 强口音 / 噪声下**降级为「仅供参考」，而不是给假精确分数**
- **部署注意**：两个 1.2 GB 模型 + `espeak-ng` 系统依赖，Windows 上有摩擦——但这是 GPU worker 那台机器的一次性成本；**评分本身 CPU 可跑**
- **数据优势**：若自训模型，`speechocean762`（L1 全普通话、免费商用）与 SeeWord 用户同分布
- **UX 建议**：
  - **分数在前、IPA 音素诊断放二级面板**（音素级对用户门槛太高）
  - 同时抄 `fluent-any-lang` 的**多次 take + 原音同步对比播放**——**零 AI 成本，教学价值高**，可作为第一阶段先落地

### P1 — 管线加一个 `refine` 步骤

PolyglotWhisperer 在转录与翻译之间插了 LLM 修语法 / 补漏字。当前策略是质量门**检测到幻觉就丢弃或重跑**，直接修比重跑省 GPU 时间。

**约束**：须过 INV-005（AI 调用必须走 `app.services.ai_service` 或 `app.services.translation`，由 ruff `TID251 banned-api` 强制）——实现上就是加一个 service 方法。

### P1 — 渐进式管线 + 阶段缓存

- Lingua Nova 的 **SSE 流式翻译**改善首帧等待
- WordAlign 的 **阶段缓存 + 断点重跑**对应 `processing_step` / `step_started_at`——SeeWord 已有状态机，缺的是「从失败阶段重跑」而非「整段重跑」

### P2 — 交互细节（低成本高收益）

1. **Karaoke-Safe Autopause**：逐词高亮播放的暂停时机
2. **`Line:Word:TermPos` 三坐标锚定**：防 `word_levels` 高亮串台
3. **i+1 高亮三条件**：未知 + 够高频 + 非专有名词（比「不在词表就高亮」精确）
4. **难度轴单参数化**：一根滑杆替代 CEFR 分级
5. **按词粒度缓存词义**：`prewarm_notes` 目前按视频预热，值得重新权衡粒度
6. **`condensed audio` 导出**（LinguaMiner）：把视频里所有对话抽成 MP3 做泛听——对备考人群是强差异化

### P2 — 备考侧对标（防被抄）

过级鸭与 exampapers.cn 已有：AI 逐题解析、**写作 AI 五维批改**、翻译 AI 批改、富文本笔记、听力单句循环 / 倍速 / 显示原文、艾宾浩斯生词本。是否需要跟进属产品决策，本文只记录差距存在。

### 明确建议不要碰的

| 项目 | 原因 |
|---|---|
| **LinguaCafe** | PHP/Laravel + GPL-3.0 + 只读文本，栈不兼容、许可不可用、方向不对，三重不适合 |
| **LLPlayer 代码** | GPL-3.0 传染性。交互可学，代码不可用 |
| **Slip 的纯浏览器路线** | 318 MB 模型进浏览器 + 音素级结果，对多租户 SaaS 是反模式 |
| **Kaldi / GOPT 原始管线** | 工程代价过大，除非确认要自训模型 |
| **whisperx 之外的 ASR 替换** | SeeWord 的 WhisperX + faster-whisper 回退已与 WordAlign 的默认集成同档，无升级收益 |

---

## 10. 一句话总结

开源阵营在**同一条赛道**上，但跑的是**另一个版本的问题**——他们做「个人本地工具」，SeeWord 做「多租户在线服务」。**SeeWord 的基础设施与内容侧已经领先，唯一实质性的技术空白是跟读评分，而 OpenPronounce 提供了一条许可清晰、CPU 可跑、精度接近人类评分者、且数据不出机房的现成路径。**

---

## 11. 来源清单（2026-10-16 快照）

**梯队 A**
- [svdC1/mirumoji](https://github.com/svdc1/mirumoji)
- [RizhongLin/PolyglotWhisperer](https://github.com/RizhongLin/PolyglotWhisperer)
- [huthvincent/yt-bilingual-app (Lingua Nova)](https://github.com/huthvincent/yt-bilingual-app)

**梯队 B**
- [umlx5h/LLPlayer](https://github.com/umlx5h/LLPlayer)
- [asbplayer/asbplayer](https://github.com/asbplayer/asbplayer)
- [Voracious](https://voracious.app/)
- [LinguaMiner（alternativeto 条目）](https://alternativeto.net/software/lingua-miner/about/)
- [voothi Kardenwort mpv 套件](https://github.com/voothi/20260308110646-kardenwort-mpv)
- [miroshArtem/SubLingo](https://github.com/miroshArtem/SubLingo)

**梯队 C**
- [m-bain/whisperX](https://github.com/m-bain/whisperx)
- [ghalymt/word-align](https://github.com/ghalymt/word-align)
- [FRSname/CapForge](https://github.com/FRSname/CapForge)
- [dashed/whisperx-subtitles-replicate](https://github.com/dashed/whisperx-subtitles-replicate)

**梯队 D**
- [Halleck45/OpenPronounce](https://github.com/Halleck45/OpenPronounce)
- [RemiKG/slip](https://github.com/RemiKG/slip)
- [YuanGongND/gopt](https://github.com/YuanGongND/gopt)
- [E3zra/GOPT-Multi-Aspect-Multi-Granularity（含 Web/Docker 的 fork）](https://github.com/E3zra/GOPT-Multi-Aspect-Multi-Granularity-English-Pronunciation-Assessment-System)
- [jimbozhang/speechocean762](https://github.com/jimbozhang/speechocean762)
- [tzyll/goparrot](https://github.com/tzyll/goparrot)
- [Jim-Elijah/fluent-any-lang](https://github.com/Jim-Elijah/fluent-any-lang)

**梯队 E**
- [simjanos-dev/LinguaCafe](https://github.com/simjanos-dev/linguacafe)
- [ShawnYou1/english-zhenti-online](https://github.com/ShawnYou1/english-zhenti-online)
- [过级鸭 guojiya.cn](https://www.guojiya.cn)
- [exampapers.cn 真题练习](https://www.exampapers.cn)
- [Linglass：2026 年 Language Reactor 替代品对比](https://linglass.app/zh/blog/best-language-reactor-alternatives)
- [Vuizur/awesome-language-learning](https://github.com/Vuizur/awesome-language-learning)
- [dual-sub-replay（Android 端，另一条路线参考）](https://github.com/hoangkien1703/dual-sub-replay)
