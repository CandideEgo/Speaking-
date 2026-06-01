# 开发进度 — Speaking

> 对应需求文档： [REQUIREMENTS.md](REQUIREMENTS.md)

---

## 总体进度

| 模块 | 总计 | ✅ 完成 | 🔄 部分 | 📋 待定 | 进度 |
|---|---|---|---|---|---|
| 用户系统 | 4 | 3 | 0 | 1 | ████████░░ 75% |
| 视频处理 | 8 | 7 | 1 | 0 | ████████░░ 81% |
| 字幕系统 | 5 | 3 | 0 | 2 | ██████░░░░ 60% |
| 口语练习 | 9 | 9 | 0 | 0 | ██████████ 100% |
| AI 功能 | 4 | 3 | 0 | 1 | ████████░░ 75% |
| 学习记录 | 3 | 1 | 0 | 2 | ████░░░░░░ 33% |
| 支付与变现 | 8 | 8 | 0 | 0 | ██████████ 100% |
| 页面与交互 | 6 | 6 | 0 | 0 | ██████████ 100% |
| 观看页细节 | 10 | 9 | 1 | 0 | █████████░ 90% |
| 非功能需求 | 15 | 9 | 5 | 1 | ████████░░ 63% |
| **合计** | **72** | **58** | **7** | **7** | **████████░░ 81%** |

---

## Phase 概览

| 阶段 | 内容 | 状态 |
|---|---|---|
| **Phase 1** — 基础框架 | 项目脚手架、用户认证、数据库、Docker | ✅ 完成 |
| **Phase 2** — 视频处理管道 | 视频提交、Celery 处理、Whisper 字幕、AI 翻译 | ✅ 完成 |
| **Phase 3** — 口语练习 | 麦克风录音、Whisper 识别、AI 评分、练习历史 | ✅ 完成 |
| **Phase 4** — 变现 | 支付流程、兑换码系统、Pro 权益 | ✅ 完成 |
| **Phase 5** — 用户体验 | 首页精选、仪表盘、AI 总结/推荐、性能优化 | ✅ 完成 |
| **Phase 6** — 完善 | 测试、监控、国际化、管理后台、进阶 AI | 📋 待定 |

---

## 逐项进度

### 3.1 用户系统

| ID | 功能 | 优先级 | 状态 | 说明 |
|---|---|---|---|---|
| U-01 | 邮箱注册 | P0 | ✅ | `auth.py` POST /register — 含邮箱、密码、昵称 |
| U-02 | 邮箱登录 | P0 | ✅ | `auth.py` POST /login — JWT 返回 |
| U-03 | 个人信息 | P0 | ✅ | `users.py` GET /me — 邮箱、昵称、等级、会员类型 |
| U-04 | 英语等级设定 | P2 | 📋 | 模型字段 `level` 已存在，但前端未提供设置入口，后台也未自动评估 |

### 3.2 视频处理

| ID | 功能 | 优先级 | 状态 | 说明 |
|---|---|---|---|---|
| V-01 | 提交视频链接 | P0 | ✅ | `videos.py` POST /videos — 支持 YouTube/Bilibili |
| V-02 | 视频状态追踪 | P0 | ✅ | `videos.py` GET /videos/{id}/status — processing → ready_subtitles → ready |
| V-03 | 轻量模式 (YouTube) | P0 | ✅ | 前端优先检测 `youtube_video_id` 嵌入播放，后台继续下载 |
| V-04 | 完整下载模式 | P1 | ✅ | `video_processing.py` — yt-dlp + ffmpeg 转码多分辨率 |
| V-05 | 多分辨率视频 | P1 | 🔄 | 数据库字段 480p/720p/1080p 已定义，任务中也有转码逻辑，但前端只使用 720p |
| V-06 | 重复链接检测 | P0 | ✅ | `videos.py:46-52` — 检测已处理视频，复用结果 |
| V-07 | 视频库管理 | P0 | ✅ | `videos.py` GET /videos + 前端仪表盘展示 |
| V-08 | 官方视频种子 | P1 | ✅ | `videos.py` POST /videos/seed — 管理员接口 + `is_official` 标记 |

### 3.3 字幕系统

| ID | 功能 | 优先级 | 状态 | 说明 |
|---|---|---|---|---|
| S-01 | AI 自动字幕生成 | P0 | ✅ | Whisper 在 Celery 任务中生成，含时间戳 |
| S-02 | AI 中文字幕翻译 | P0 | ✅ | `ai_service.py translate_batch()` 批量翻译 |
| S-03 | 语法标注 | P1 | ✅ | `ai_service.py grammar_analyze_batch()` + 前端字幕面板展示 |
| S-04 | 难度词标注 | P1 | 📋 | 模型字段 `difficulty_words` 已定义，但未被 AI 管道填充，前端也未使用 |
| S-05 | 视频难度评估 | P1 | ✅ | `ai_service.py evaluate_difficulty()` — CEFR 等级评定 |

### 3.4 口语练习

| ID | 功能 | 优先级 | 状态 | 说明 |
|---|---|---|---|---|
| P-01 | 逐句跟读 | P0 | ✅ | 每句字幕旁有"Practice this line"按钮 |
| P-02 | 麦克风录音 | P0 | ✅ | 前端 `MediaRecorder` + `getUserMedia` |
| P-03 | Whisper 语音识别 | P0 | ✅ | `speaking_service.py` — 本地 Whisper base 模型 |
| P-04 | AI 发音评分 | P0 | ✅ | `ai_service.py pronunciation_feedback()` |
| P-05 | 评分维度 | P0 | ✅ | accuracy / fluency / completeness 0-100 |
| P-06 | 中文反馈 | P0 | ✅ | system prompt 指定用中文给建议 |
| P-07 | 练习历史 | P1 | ✅ | `speaking.py` GET /attempts — 50 条历史 |
| P-08 | 免费用户限制 | P0 | ✅ | `speaking.py:28-43` — 每日最多 3 次 |
| P-09 | 练习统计 | P1 | ✅ | `speaking.py` GET /stats — 总次数 + 平均准确率 |

### 3.5 AI 功能（Pro 专属）

| ID | 功能 | 优先级 | 状态 | 说明 |
|---|---|---|---|---|
| A-01 | 单词查询 | P0 | ✅ | `ai.py` POST /word-lookup — 音标 + 释义 + 例句 |
| A-02 | 每日学习总结 | P1 | ✅ | `ai.py` GET /assistant/summary — 仪表盘展示 |
| A-03 | 学习推荐 | P1 | ✅ | `ai.py` GET /assistant/recommend — 仪表盘展示 |
| A-04 | 课后测验 | P2 | 📋 | `ai_service.py generate_quiz()` 已实现，但未被任何 API 调用或前端展示 |

### 3.6 学习记录

| ID | 功能 | 优先级 | 状态 | 说明 |
|---|---|---|---|---|
| L-01 | 学习进度追踪 | P1 | 🔄 | LearningRecord 模型已定义，但用户学习时并未实际创建/更新记录 |
| L-02 | 词汇本 | P2 | 📋 | Vocabulary 模型已定义，但前端无入口，也无间隔重复逻辑 |
| L-03 | 数据看板 | P1 | ✅ | 仪表盘展示练习次数、准确率、词汇量、视频数（统计来源不同） |

### 3.7 支付与变现

| ID | 功能 | 优先级 | 状态 | 说明 |
|---|---|---|---|---|
| M-01 | 升级 Pro | P0 | ✅ | 前端仪表盘"升级 Pro"按钮 |
| M-02 | 模拟支付 | P0 | ✅ | `payments.py` mock-pay — 开发用 |
| M-03 | 支付宝回调 | P1 | 🔄 | `payments.py` /callback/alipay — 占位实现，未验证签名 |
| M-04 | 微信支付回调 | P1 | 🔄 | `payments.py` /callback/wechat — 占位实现，未验证签名 |
| M-05 | 兑换码生成 | P0 | ✅ | `invite.py` POST /generate — 批量生成 |
| M-06 | 兑换码兑换 | P0 | ✅ | `invite.py` POST /redeem + 前端兑换页 |
| M-07 | 兑换码导出 | P1 | ✅ | `invite.py` GET /export — CSV 格式 |
| M-08 | 兑换码查询 | P1 | ✅ | `invite.py` GET /invite-codes — 分页、过滤 |

### 3.8 页面与交互

| ID | 功能 | 优先级 | 状态 | 说明 |
|---|---|---|---|---|
| H-01 | 首页/精选视频 | P0 | ✅ | `page.tsx` — 官方视频网格，难度标签 |
| H-02 | 登录页 | P0 | ✅ | `login/page.tsx` |
| H-03 | 注册页 | P0 | ✅ | `register/page.tsx` |
| H-04 | 仪表盘 | P0 | ✅ | `dashboard/page.tsx` — 视频库、提交链接、统计、AI 总结 |
| H-05 | 观看页 | P0 | ✅ | `watch/[id]/page.tsx` — 播放器 + 字幕 + 跟读 |
| H-06 | 兑换码页 | P0 | ✅ | `redeem/page.tsx` |

### 3.9 观看页交互细节

| ID | 功能 | 优先级 | 状态 | 说明 |
|---|---|---|---|---|
| W-01 | 视频播放 | P0 | ✅ | YouTube iframe 嵌入 + 本地 video 标签 |
| W-02 | 字幕面板 | P0 | ✅ | 侧边栏列表，当前句高亮，点击跳转 |
| W-03 | 中英切换 | P0 | ✅ | 右上角 Bilingual/English 切换按钮 |
| W-04 | 键盘快捷键 | P1 | ✅ | Space/→/←/↑/↓ 全支持 |
| W-05 | 单词点击 | P0 | ✅ | 点击触发语音 + AI 查询（Pro） |
| W-06 | 跟读录音 | P0 | ✅ | 每句"Practice"按钮 + 录音流程 |
| W-07 | 录音回放 | P0 | ✅ | 录制后在底部显示 audio 播放器 |
| W-08 | 评分展示 | P0 | ✅ | 环形进度图 (ScoreRing 组件) |
| W-09 | 自动切换 | P1 | ✅ | 评分后"下一句"按钮 |
| W-10 | 移动端适配 | P1 | 🔄 | 字幕面板在移动端从底部弹出（`fixed bottom-0`），但录音体验未针对移动优化 |

---

## 非功能需求进度

| ID | 需求 | 状态 | 说明 |
|---|---|---|---|
| N-01 | 首页加载 < 2s | 🔄 | 图片 `loading="lazy"` + CDN 路径已支持，但未做性能测试 |
| N-02 | 视频处理时间 | ✅ | 轻量模式 0-30s；完整下载在 Celery 中异步完成 |
| N-03 | AI 评分响应 < 5s | 🔄 | Whisper 本地运行 + AI API 调用同步执行，无超时保护 |
| N-04 | 100+ 并发支持 | 📋 | 未做压力测试 |
| N-05 | JWT 认证 | ✅ | Token 有效期 7 天，`get_current_user` 中间件 |
| N-06 | 密码加密 | ✅ | `hash_password` / `verify_password` 使用 passlib bcrypt |
| N-07 | 免费用户次数限制 | ✅ | 每日 3 次 |
| N-08 | 兑换码防重放 | ✅ | `is_used` 标记 + `used_by` + `used_at` |
| N-09 | API 鉴权 | ✅ | 用户只能访问自己的视频（除官方视频外） |
| N-10 | 响应式设计 | ✅ | Tailwind 响应式断点 + 移动端字幕面板适配 |
| N-11 | 字幕逐句高亮 | ✅ | `currentSubtitleIndex` 跟随播放时间 |
| N-12 | 错误信息展示 | ✅ | 处理失败时显示 `error_message` |
| N-13 | Toast 通知 | ✅ | 使用 sonner toast 组件 |
| N-14 | UI 语言中文 | ✅ | 全局 lang="zh-CN"，UI 文本大部分为中文 |
| N-15 | 中英学习内容 | ✅ | 字幕包含 text_en + text_zh |

---

## API 实现状态

| 模块 | 接口数 | ✅ | 📋 缺失 |
|---|---|---|---|
| 认证 (auth) | 2 | 2 | — |
| 用户 (users) | 1 | 1 | — |
| 视频 (videos) | 6 | 6 | — |
| 口语 (speaking) | 3 | 3 | — |
| AI (ai) | 3 | 3 | — |
| 支付 (payments) | 5 | 5 | — |
| 兑换码 (invite) | 4 | 4 | — |
| **合计** | **24** | **24** | **0** |

所有 24 个 API 端点均已实现 ✅

---

## 前端路由状态

| 路由 | 页面 | 状态 |
|---|---|---|
| `/` | 首页 | ✅ |
| `/login` | 登录页 | ✅ |
| `/register` | 注册页 | ✅ |
| `/dashboard` | 仪表盘 | ✅ |
| `/watch/[id]` | 观看页 | ✅ |
| `/redeem` | 兑换码页 | ✅ |

所有 6 个页面均已实现 ✅

---

## 技术债务

### 缺失的功能

| 项 | 影响 | 涉及的代码 |
|---|---|---|
| 课后测验 | 生成逻辑已实现但未接入 | `ai_service.py:generate_quiz()` |
| 难度词标注 | 模型字段已定义但未使用 | Subtitle.difficulty_words |
| 词汇本 (间隔重复) | 模型已定义但无前端入口 | Vocabulary 表 + `next_review_at` |
| 英语等级设定 | 模型字段存在但无设置/评估入口 | User.level |
| 学习进度追踪 | LearningRecord 从未被实际写入 | LearningRecord 表 |

### 需要改进

| 项 | 说明 |
|---|---|
| 无单元/集成测试 | 整个项目无任何测试文件 |
| 无 CI/CD 配置 | 无 GitHub Actions 或其他 CI 配置 |
| 支付回调占位 | Alipay/WeChat 回调无签名验证（标注了"in production"） |
| 兑换码生成鉴权 | `POST /generate` 虽有 `get_current_user` 但无角色检查 |
| 订单无持久化 | `_orders` 使用内存字典，重启丢失 |
| Whisper 同步阻塞 | `_whisper_transcribe` 使用 `run_in_executor`，不是真正的异步 |
| 前端错误处理薄弱 | 多处 `catch(() => {})` 静默吞掉错误 |
| TypeScript 类型不完备 | 部分 API 响应使用 `as` 断言而非严格类型 |
| 无国际化框架 | UI 文字硬编码为中文 |
| 无管理后台 | 官方视频种子、兑换码管理均无前端界面 |
| 无速率限制 | 全 API 无 request 限流 |
| 无日志监控 | 仅有 Python logging，无结构化日志或 APM |

---

## 完成标准

以下条件需全部满足方可标记项目为 **✅ 完成**：

- [ ] 所有 P0 功能通过验收测试（手动）
- [ ] 核心 API 有单元测试覆盖（> 80%）
- [ ] 前端页面在 Chrome/Firefox/Safari 上正常运行
- [ ] CI/CD 流水线配置完成
- [ ] 生产环境 Docker 镜像构建成功
- [ ] 关键用户流程的 E2E 测试通过

---

*最后更新：2026-06-01*
