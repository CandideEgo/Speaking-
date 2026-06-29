# 需求文档 — Speaking

> AI 驱动的英语口语学习应用

## 1. 项目概述

### 1.1 产品定位

面向**中英双语用户**（以中文母语者为主）的 AI 英语口语练习平台。用户通过观看带双语字幕的视频（YouTube/Bilibili），跟读每一句台词，AI 对发音进行评分并反馈，实现沉浸式口语学习。

### 1.2 核心价值

1. **真实语料** — 使用真实视频素材，而非教材录音
2. **即时反馈** — AI 逐句评分，指出发音问题
3. **沉浸体验** — 视频 + 双语字幕 + 跟读的一体化流程

### 1.3 技术栈

| 层 | 技术 |
|---|---|
| 后端 | Python FastAPI + SQLAlchemy async + Celery |
| 前端 | Next.js 14 (App Router) + React 18 + Tailwind CSS |
| 数据库 | PostgreSQL 16 + Redis 7 |
| 语音识别 | faster-whisper (本地运行, int8 量化) |
| AI 能力 | OpenAI 兼容 API（当前使用 Agnes AI） |
| 媒体处理 | yt-dlp + ffmpeg |
| 认证 | JWT (PyJWT) |

---

## 2. 用户角色

### 2.1 免费用户

- 注册即得
- 可使用基础功能，有限制

### 2.2 Pro 用户

- 通过支付或兑换码升级
- 无限制访问全部功能

### 2.3 管理员

- 生成和管理兑换码
- 种子官方视频内容

---

## 3. 功能需求

### 3.1 用户系统

| ID | 功能 | 优先级 | 描述 |
|---|---|---|---|
| U-01 | 邮箱注册 | P0 | 使用邮箱 + 密码注册，可选昵称 |
| U-02 | 邮箱登录 | P0 | 使用邮箱 + 密码登录，返回 JWT |
| U-03 | 个人信息 | P0 | 查看个人资料：昵称、邮箱、英语等级、会员类型 |
| U-04 | 英语等级设定 | P2 | 用户可设置或 AI 自动评估英语水平 (A1-C2) |
| U-05 | 修改个人信息 | P1 | 修改昵称、英语等级等 |

### 3.2 视频处理

| ID | 功能 | 优先级 | 描述 |
|---|---|---|---|
| V-01 | 提交视频链接 | P0 | 用户输入 YouTube/Bilibili 链接，系统开始处理 |
| V-02 | 视频状态追踪 | P0 | 实时查看处理状态：processing → ready_subtitles → ready / error |
| V-03 | 轻量模式 (YouTube) | P0 | YouTube 视频先嵌入播放 + 字幕可用，后台继续下载高清版 |
| V-04 | 完整下载模式 | P1 | Bilibili 及其他平台需完整下载后才能观看 |
| V-05 | 多分辨率视频 | P1 | 提供 480p / 720p / 1080p 分辨率（CDN 分发） |
| V-06 | 重复链接检测 | P0 | 同一链接已被处理过则复用结果，无需重新处理 |
| V-07 | 视频库管理 | P0 | 用户查看所有提交过的视频及状态 |
| V-08 | 官方视频种子 | P1 | 管理员可种子官方精选视频到公共主页 |
| V-09 | YouTube 搜索 | P1 | 用户可直接搜索 YouTube 视频，无需手动粘贴链接 |
| V-10 | 视频测验 | P1 | 每部视频生成测验题，用户可答题并提交 |

### 3.3 字幕系统

| ID | 功能 | 优先级 | 描述 |
|---|---|---|---|
| S-01 | AI 自动字幕生成 | P0 | 使用 Whisper 从视频音频生成英文字幕，含时间戳 |
| S-02 | AI 中文字幕翻译 | P0 | 每句英文字幕自动翻译为中文 |
| S-03 | 语法标注 | P1 | 每句标注一个最值得注意的语法点（中文解释） |
| S-04 | 难度词标注 | P1 | 标注句子中的生僻词或高级词汇 |
| S-05 | 视频难度评估 | P1 | AI 根据词汇和句式复杂度评定 CEFR 等级 (A1-C2) |

### 3.4 口语练习

| ID | 功能 | 优先级 | 描述 |
|---|---|---|---|
| P-01 | 逐句跟读 | P0 | 用户选择某句字幕，录制跟读音频 |
| P-02 | 麦克风录音 | P0 | 浏览器内使用 MediaRecorder 录制音频 |
| P-03 | Whisper 语音识别 | P0 | 本地 Whisper 模型将用户音频转为文本 |
| P-04 | AI 发音评分 | P0 | 对比原文与用户录音，给出三项分数及建议 |
| P-05 | 评分维度 | P0 | **准确度** (accuracy)、**流利度** (fluency)、**完整度** (completeness)，每项 0-100 |
| P-06 | 中文反馈 | P0 | AI 以中文给出具体的发音改进建议 |
| P-07 | 练习历史 | P1 | 查看所有跟读记录及历史分数 |
| P-08 | 免费用户限制 | P0 | 免费用户每日最多 3 次口语练习 |
| P-09 | 练习统计 | P1 | 聚合统计数据：总练习次数、平均准确率 |
| P-10 | 评分量规 | P2 | 支持自定义评分量规（rubric），多维度评分+反馈 |

### 3.5 AI 功能（Pro 专属）

| ID | 功能 | 优先级 | 描述 |
|---|---|---|---|
| A-01 | 单词查询 | P0 | 点击字幕中的单词，AI 给出音标、上下文释义和例句 |
| A-02 | 每日学习总结 | P1 | AI 根据当日学习数据生成中文总结和建议 |
| A-03 | 学习推荐 | P1 | AI 根据用户水平和历史推荐下一阶段学习内容 |
| A-04 | 课后测验 | P2 | 每部视频生成 3 道题：阅读理解、填空、听写 |

### 3.6 学习记录

| ID | 功能 | 优先级 | 描述 |
|---|---|---|---|
| L-01 | 学习进度追踪 | P1 | 记录每部视频的学习进度：跟读次数、测验分数、完成状态 |
| L-02 | 词汇本 | P0 | 保存用户查过的单词，支持间隔重复复习 (SM-2 算法) |
| L-03 | 数据看板 | P1 | 在仪表盘展示：学习次数、准确率、词汇量、视频数 |

### 3.7 学习模式

| ID | 功能 | 优先级 | 描述 |
|---|---|---|---|
| M-01 | 双语字幕模式 | P0 | 同时显示中英文字幕 |
| M-02 | 纯英文字幕模式 | P0 | 仅显示英文字幕 |
| M-03 | 纯中文字幕模式 | P1 | 仅显示中文字幕 |
| M-04 | 阅读模式 | P1 | 隐藏字幕，专注听力理解 |
| M-05 | 听写模式 | P1 | 播放音频，用户听写内容，系统校对 |
| M-06 | 填空模式 | P1 | 随机挖空关键词，用户填写 |
| M-07 | 闪卡模式 | P1 | 字幕卡片翻转，中英互译练习 |
| M-08 | 翻译模式 | P1 | 英译中/中译英双向翻译练习 |

> **已下线 (2026-06)：** M-04~M-08（阅读/听写/填空/闪卡/翻译模式）已正式下线。Watch 页精简为仅保留 M-01~M-03 三种字幕显示模式（双语/纯英/纯中），以聚焦核心跟读练习流程。对应组件（ReadingMode/DictationMode/FillBlankMode/FlashcardMode/TranslateMode）已从代码库移除。

### 3.8 内容发现

| ID | 功能 | 优先级 | 描述 |
|---|---|---|---|
| B-01 | 浏览页 | P1 | 按分类和难度浏览官方视频，支持分页 |
| B-02 | 社区页 | P1 | 浏览用户提交的视频，按分类筛选 |
| B-03 | 分类体系 | P1 | 视频按话题分类（科技、生活、教育等） |

### 3.9 支付与变现

| ID | 功能 | 优先级 | 描述 |
|---|---|---|---|
| PAY-01 | 升级 Pro | P0 | 用户可升级为 Pro 会员，解锁全部功能 |
| PAY-02 | 模拟支付 | P0 | 开发环境使用 mock 支付流程 |
| PAY-03 | 支付宝回调 | P1 | 支付宝支付回调处理 |
| PAY-04 | 微信支付回调 | P1 | 微信支付回调处理 |
| PAY-05 | 兑换码生成 | P0 | 管理员生成批量兑换码，可设定有效期和套餐类型 |
| PAY-06 | 兑换码兑换 | P0 | 用户输入兑换码升级 Pro |
| PAY-07 | 兑换码导出 | P1 | 管理员导出未使用的兑换码为 CSV |
| PAY-08 | 兑换码查询 | P1 | 管理员查看所有兑换码及使用状态 |
| PAY-09 | 订单持久化 | P1 | 订单数据写入数据库，支持状态流转 |

### 3.10 页面与交互

| ID | 功能 | 优先级 | 描述 |
|---|---|---|---|
| H-01 | 首页/精选视频 | P0 | 展示官方精选视频列表，支持难度筛选 |
| H-02 | 登录页 | P0 | 邮箱密码登录，链接到注册页 |
| H-03 | 注册页 | P0 | 邮箱密码注册，链接到登录页 |
| H-04 | 仪表盘 | P0 | 视频库管理、提交链接、学习统计、AI 总结 |
| H-05 | 观看页 | P0 | 视频播放 + 双语字幕 + 跟读练习的沉浸式页面 |
| H-06 | 兑换码页 | P0 | 输入兑换码升级 Pro |
| H-07 | 浏览页 | P1 | 按分类和难度浏览官方视频 |
| H-08 | 社区页 | P1 | 浏览用户提交的视频 |
| H-09 | 词汇本页 | P1 | 管理已保存的单词，复习到期词汇 |
| H-10 | 管理后台 | P2 | 管理员管理视频、兑换码、用户 |

### 3.11 观看页交互细节

| ID | 功能 | 优先级 | 描述 |
|---|---|---|---|
| W-01 | 视频播放 | P0 | 支持 YouTube iframe 嵌入和本地视频播放 |
| W-02 | 字幕面板 | P0 | 侧边栏显示全部字幕，当前句高亮，点击跳转 |
| W-03 | 中英切换 | P0 | 切换显示双语字幕或仅英文 |
| W-04 | 键盘快捷键 | P1 | Space 播放/暂停、←→ 快进/快退、↑↓ 上/下一句 |
| W-05 | 单词点击 | P0 | 点击字幕中的单词显示释义并朗读发音 |
| W-06 | 跟读录音 | P0 | 每句字幕旁有"练习"按钮，录制并提交评分 |
| W-07 | 录音回放 | P0 | 录制后可回听自己的录音 |
| W-08 | 评分展示 | P0 | 使用环形进度图直观展示准确度/流利度/完整度 |
| W-09 | 自动切换 | P1 | 评分后一键切换到下一句继续练习 |
| W-10 | 移动端适配 | P1 | 字幕面板在移动端从底部弹出 |

---

## 4. 非功能需求

### 4.1 性能

| ID | 需求 | 目标 |
|---|---|---|
| N-01 | 首页加载 | < 2s (含 CDN 图片) |
| N-02 | 视频处理 | 0-30s 内可观看（轻量模式）；完整下载 < 5min |
| N-03 | AI 评分响应 | < 5s |
| N-04 | 并发用户 | 支持 100+ 同时进行口语练习 |

### 4.2 安全

| ID | 需求 |
|---|---|
| N-05 | JWT 认证，token 有效期 7 天 |
| N-06 | 密码 bcrypt 加密存储 |
| N-07 | 免费用户每日跟读次数限制（3 次） |
| N-08 | 兑换码防重放（使用后标记已用） |
| N-09 | API 鉴权：用户只能访问自己的视频和学习数据 |

### 4.3 可用性

| ID | 需求 |
|---|---|
| N-10 | 响应式设计：移动端 / 平板 / 桌面端 |
| N-11 | 字幕逐句高亮跟随视频播放进度 |
| N-12 | 处理失败时展示具体错误信息 |
| N-13 | 所有用户操作有反馈（toast 通知） |

### 4.4 国际化

| ID | 需求 |
|---|---|
| N-14 | UI 语言：中文为主 |
| N-15 | 学习内容：英文字幕 + 中文翻译 |

---

## 5. 数据模型

### 5.1 用户 (User)

| 字段 | 类型 | 说明 |
|---|---|---|
| id | UUID | 主键 |
| email | String | 唯一，登录用 |
| hashed_password | String | bcrypt 哈希 |
| name | String? | 昵称 |
| level | String? | CEFR 等级 (A1-C2) |
| plan | Enum | free / pro |
| created_at | DateTime | |

### 5.2 视频 (Video)

| 字段 | 类型 | 说明 |
|---|---|---|
| id | UUID | 主键 |
| user_id | UUID? | 关联用户（官方视频可为空） |
| title | String | 视频标题 |
| source_url | String | 原始链接 |
| platform | Enum | youtube / bilibili / other |
| thumbnail_url | String? | 缩略图 |
| duration | Float? | 时长（秒） |
| difficulty_level | String? | CEFR 等级 |
| status | Enum | processing / ready_subtitles / ready / error |
| youtube_video_id | String? | 嵌入播放用 |
| video_url_720p | String? | 高清视频 CDN 地址 |
| is_official | Boolean | 是否为官方精选视频 |
| topic_tags | String? | 逗号分隔的话题标签 |

### 5.3 字幕 (Subtitle)

| 字段 | 类型 | 说明 |
|---|---|---|
| id | UUID | 主键 |
| video_id | UUID | 关联视频 |
| start_time | Float | 开始时间（秒） |
| end_time | Float | 结束时间（秒） |
| text_en | Text | 英文字幕 |
| text_zh | Text? | 中文字幕翻译 |
| sentence_index | Integer | 句子序号 |
| grammar_note | Text? | 语法标注 |
| difficulty_words | Text? | 难度词标注 (JSON) |

### 5.4 口语练习记录 (SpeakingAttempt)

| 字段 | 类型 | 说明 |
|---|---|---|
| id | UUID | 主键 |
| user_id | UUID | 关联用户 |
| subtitle_id | UUID | 关联字幕 |
| audio_url | String? | 录音文件地址 |
| transcript | Text? | Whisper 识别文本 |
| accuracy | Float? | 准确度 0-100 |
| fluency | Float? | 流利度 0-100 |
| completeness | Float? | 完整度 0-100 |
| feedback | Text? | AI 反馈（中文） |

### 5.5 学习记录 (LearningRecord)

| 字段 | 类型 | 说明 |
|---|---|---|
| id | UUID | 主键 |
| user_id | UUID | 关联用户 |
| video_id | UUID | 关联视频 |
| words_learned | Integer | 学到的新词数 |
| speaking_attempts | Integer | 跟读次数 |
| quiz_score | Float? | 测验分数 |
| completed | Boolean | 是否完成 |

### 5.6 词汇本 (Vocabulary)

| 字段 | 类型 | 说明 |
|---|---|---|
| id | UUID | 主键 |
| user_id | UUID | 关联用户 |
| word | String | 单词 |
| context_sentence | Text? | 上下文句子 |
| video_id | UUID? | 来源视频 |
| review_count | Integer | 复习次数 |
| last_reviewed_at | DateTime? | 上次复习时间 |
| next_review_at | DateTime? | 下次复习时间 (SM-2 算法) |

### 5.7 兑换码 (InviteCode)

| 字段 | 类型 | 说明 |
|---|---|---|
| id | UUID | 主键 |
| code | String | 10 位码 (XXXX-XXXX-XX) |
| plan | String | 目标套餐 (默认 pro) |
| duration_days | Integer | 有效天数 |
| batch_label | String? | 批次标签 |
| is_used | Boolean | 是否已使用 |
| used_by | String? | 使用者 ID |
| used_at | DateTime? | 使用时间 |

### 5.8 订单 (Order)

| 字段 | 类型 | 说明 |
|---|---|---|
| id | UUID | 主键 |
| user_id | UUID | 关联用户 |
| order_number | String | 订单号 |
| plan | Enum | pro_monthly / pro_annual |
| amount | Integer | 金额（分） |
| status | Enum | pending / paid / expired / cancelled |
| paid_at | DateTime? | 支付时间 |

### 5.9 评分量规 (SpeakingRubric)

| 字段 | 类型 | 说明 |
|---|---|---|
| id | UUID | 主键 |
| name | String | 量规名称 |
| description | Text? | 描述 |
| is_default | Boolean | 是否为默认量规 |

### 5.10 量规标准 (RubricCriterion)

| 字段 | 类型 | 说明 |
|---|---|---|
| id | UUID | 主键 |
| rubric_id | UUID | 关联量规 |
| name | String | 标准名称 |
| description | Text? | 描述 |
| weight | Float | 权重 |
| sort_order | Integer | 排序 |

### 5.11 评分记录 (SpeakingAttemptScore)

| 字段 | 类型 | 说明 |
|---|---|---|
| id | UUID | 主键 |
| attempt_id | UUID | 关联练习记录 |
| criterion_id | UUID | 关联量规标准 |
| score | Float | 分数 |
| feedback | Text? | 反馈 |

---

## 6. API 接口清单

### 6.1 认证

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/v1/auth/register` | 注册 |
| POST | `/api/v1/auth/login` | 登录 |

### 6.2 用户

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/v1/users/me` | 获取当前用户信息 |
| PATCH | `/api/v1/users/me` | 修改用户信息 |

### 6.3 视频

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/v1/videos` | 提交视频链接 |
| GET | `/api/v1/videos` | 获取用户的视频列表 |
| GET | `/api/v1/videos/public` | 获取公开官方视频列表 |
| GET | `/api/v1/videos/{id}` | 获取视频详情（含字幕） |
| GET | `/api/v1/videos/{id}/status` | 获取视频处理状态 |
| GET | `/api/v1/videos/{id}/quiz` | 获取视频测验题 |
| POST | `/api/v1/videos/{id}/quiz/submit` | 提交测验答案 |
| POST | `/api/v1/videos/seed` | 种植官方视频（管理用） |

### 6.4 口语练习

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/v1/speaking/practice` | 提交跟读录音（multipart） |
| GET | `/api/v1/speaking/attempts` | 练习历史 |
| GET | `/api/v1/speaking/stats` | 练习统计数据 |

### 6.5 AI

| 方法 | 路径 | 说明 | 权限 |
|---|---|---|---|
| POST | `/api/v1/ai/word-lookup` | 单词查询 | Pro |
| GET | `/api/v1/ai/assistant/summary` | 每日学习总结 | Pro |
| GET | `/api/v1/ai/assistant/recommend` | 学习推荐 | Pro |

### 6.6 词汇

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/v1/vocabulary` | 添加单词到词汇本 |
| GET | `/api/v1/vocabulary` | 获取词汇列表（支持 due_only 筛选） |
| POST | `/api/v1/vocabulary/{id}/review` | 复习单词 (SM-2 间隔重复) |
| DELETE | `/api/v1/vocabulary/{id}` | 删除单词 |

### 6.7 浏览与社区

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/v1/browse/categories` | 获取浏览分类列表 |
| GET | `/api/v1/browse/feed` | 获取浏览视频流（分页、分类+难度筛选） |
| GET | `/api/v1/community/categories` | 获取社区分类列表 |
| GET | `/api/v1/community/feed` | 获取社区视频流（分页、分类筛选） |

### 6.8 评分量规

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/v1/rubrics` | 获取所有量规 |
| GET | `/api/v1/rubrics/default` | 获取默认量规 |

### 6.9 YouTube

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/v1/youtube/search` | 搜索 YouTube 视频 |

### 6.10 支付

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/v1/payments/create-order` | 创建订单 |
| GET | `/api/v1/payments/mock-pay` | 模拟支付（开发用） |
| POST | `/api/v1/payments/callback/alipay` | 支付宝回调 |
| POST | `/api/v1/payments/callback/wechat` | 微信回调 |
| GET | `/api/v1/payments/status` | 查询会员状态 |

### 6.11 兑换码

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/v1/invite-codes/generate` | 生成兑换码（管理） |
| GET | `/api/v1/invite-codes/export` | 导出 CSV（管理） |
| GET | `/api/v1/invite-codes` | 查询兑换码列表（管理） |
| POST | `/api/v1/invite-codes/redeem` | 使用兑换码 |

---

## 7. 前端页面路由

| 路由 | 页面 | 说明 |
|---|---|---|
| `/` | 首页 | 公开 — 精选视频列表 |
| `/login` | 登录页 | 公开 |
| `/register` | 注册页 | 公开 |
| `/dashboard` | 仪表盘 | 需登录 |
| `/watch/[id]` | 观看页 | 半公开 — 官方视频匿名可看，用户视频需登录 |
| `/redeem` | 兑换码页 | 需登录 |
| `/browse` | 浏览页 | 公开 — 按分类和难度浏览 |
| `/community` | 社区页 | 公开 — 用户提交的视频 |
| `/vocabulary` | 词汇本页 | 需登录 |
| `/admin` | 管理后台 | 需管理员权限 |

---

## 8. 定价策略

| 套餐 | 价格 | 限制 |
|---|---|---|
| Free | 免费 | 每日 3 次口语练习、无 AI 助手、基础字幕功能 |
| Pro | ¥39/月 或 ¥299/年 | 无限练习、AI 单词查询、每日总结、学习推荐 |

---

## 9. 前置依赖

| 依赖 | 用途 |
|---|---|
| PostgreSQL 16 | 主数据库 |
| Redis 7 | Celery 消息代理 + 缓存 |
| yt-dlp | 视频下载 |
| ffmpeg | 视频/音频转码 |
| Whisper (base) | 本地语音转文字 (已迁移至 faster-whisper) |
| OpenAI 兼容 API | AI 翻译、评分、分析功能 |

---

## 10. 开发路线图

| 阶段 | 内容 | 状态 |
|---|---|---|
| **Phase 1** — 基础框架 | 项目脚手架、用户认证、数据库、Docker 开发环境 | ✅ |
| **Phase 2** — 视频处理管道 | 视频提交、Celery 处理、faster-whisper 字幕、AI 翻译 | ✅ |
| **Phase 3** — 口语练习 | 麦克风录音、faster-whisper 识别、AI 评分、练习历史 | ✅ |
| **Phase 4** — 变现 | 支付流程、兑换码系统、Pro 权益 | ✅ |
| **Phase 5** — 用户体验 | 首页精选、仪表盘、AI 总结/推荐、性能优化 | ✅ |
| **Phase 6** — 完善 | 测试、CI/CD、faster-whisper 迁移、学习模式、词汇本、浏览/社区 | ✅ |
| **Phase 7** — 进阶 | 支付签名验证、密码重置、管理后台增强、国际化 (i18n)、监控仪表盘、移动端优化、性能压测 | 📋 待定 |

---

## 11. 已识别风险

| 风险 | 影响 | 缓解措施 |
|---|---|---|
| Whisper 本地运行资源消耗大 | 服务器压力 | 使用 base 模型，可切换为 API 版 |
| YouTube 视频可用性不确定 | 内容获取失败 | 支持多平台 + 错误提示 + 复试机制 |
| AI API 延迟影响用户体验 | 评分等待时间长 | 异步处理 + 加载状态提示 |
| 免费用户滥用 | 资源浪费 | 每日次数限制 + 速率限制 |
| 移动端录音兼容性 | 功能不可用 | 检测 getUserMedia 支持并提示 |
