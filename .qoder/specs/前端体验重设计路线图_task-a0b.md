# 前端体验重设计路线图 + 管线改进

---

## Part A: 前端体验重设计

### 方法论

在项目根目录建 `/prototypes/` 目录，每个页面一个独立 HTML 文件（内联 CSS + 少量 JS），浏览器直接打开即可预览。不依赖现有 Next.js 组件库和 Tailwind token——自由探索更好的视觉方案。每页确认后，再按该方案迁移到 Next.js 实现。

文件结构：
```
prototypes/
  01-login.html
  02-register.html
  03-home-a.html      (方案A: 纯视频流)
  03-home-b.html      (方案B: 视频流 + 轻量学习状态条)
  03-home-c.html      (方案C: 双Tab 推荐/学习)
  04-video-card.html
  05-watch.html
  06-practice.html
  07-profile.html
  assets/             (共享字体、图标 CDN 引用等)
```

### Phase 1: 基础功能（登录/注册）

- `01-login.html`: 简洁分栏布局（左品牌视觉 + 右表单），邮箱/密码，错误提示、记住我、忘记密码、注册引导
- `02-register.html`: 邮箱、密码、确认密码、昵称（可选），密码强度提示、服务条款勾选

### Phase 2: 首页视频流（多方案）

三个方案各出一个 HTML，用户选定后进入实现：
- 方案 A: 纯视频流（顶部分类标签 + 网格）
- 方案 B: 视频流 + 轻量学习状态条
- 方案 C: 双 Tab（推荐/学习）

共同要素：视频卡片信息丰富、分类+难度筛选、响应式网格、无限滚动

### Phase 3: 视频卡片设计

- 网格标准卡片、悬停状态、观看进度标记
- 关键信息: 封面、标题（中英文）、时长、难度 badge、词汇数、来源平台图标
- **来源标注**: 卡片底部显示来源平台 + 原视频链接（可点击跳转原地址）

### Phase 4: Watch 页 + 练习模式

- `05-watch.html`: 播放器 + 双语字幕 + 词汇点击 + 字幕列表跳转
  - **来源声明区**: 标题下方「原视频来源: YouTube」+ 原始链接
  - **版权声明**: 「本视频内容转载自 YouTube 平台，仅供学习交流使用，版权归原作者所有」
- `06-practice.html`: 练习模式重设计（参考 Duolingo：简洁、即时反馈、进度感、键盘快捷键）

### Phase 5: 个人信息

- 学习统计、设置项、会员状态/兑换码入口

### Phase 6: 迁移实现

原型确认后：提取设计 token → 拆分 React 组件 → 接入真实数据 → 响应式+暗色 → 逐页替换

### 执行节奏

1. Phase 1 (登录/注册) → 确认
2. Phase 2 (首页三方案) → 选定
3. Phase 3-5 按序
4. 每页确认后 Phase 6 迁移

---

## Part B: 视频处理管线——当前架构深度分析

### 当前完整流程

```
提交 URL → Head(提取元数据/暂存媒体/入队GPU)
         → GPU Worker(WhisperX转录 + VAD + 强制对齐 + 句级分割)
         → HTTP Callback(去重锁 + 幻觉检测5项 → 插入字幕)
         → Tail(翻译 → 词汇标注 → AI词注释预热 → 下载 → 转码 → ready)
         → 后处理(注册标准版 / 自动发布 / 计算评分 / 计算CEFR难度 / 清理OSS)
```

### 当前质量保障（已完善）

| 环节 | 机制 | 行为 |
|------|------|------|
| 转录 | 幻觉检测: 重复>30%、无意义字符>30%、时长异常>50%、密度>40字符/秒>30%、空段>50% | **阻塞**（标记error） |
| 翻译 | 质量门: 覆盖率<80%、短翻译>30%、混合CJK/Latin>20%、长度比异常 | **仅警告**（不阻塞） |
| 翻译 | 双引擎并发（agnes+fallback），first-valid-wins | 自动容错 |
| 翻译 | None 项逐条重试 | 最大化填充率 |
| 词汇 | 保护已有 word_levels（不覆盖手动修改） | 幂等安全 |
| 预热 | best-effort，LLM 挂了不阻塞管线 | 降级到实时AI |
| 全局 | Redis 断点续传（fail-closed: Redis挂→重跑步骤） | 幂等恢复 |
| 全局 | 分布式锁（fail-closed: Redis挂→拒绝处理） | 防并发 |
| 全局 | Watchdog beat（10min，超时2h标记失败） | 兜底 |
| 管理 | retry_video（智能断点恢复）/ recover_processing / localize_video | 人工干预 |

### 技术细节

- **转录引擎**: WhisperX + pyannote/silero VAD + wav2vec2 强制对齐 + NLTK Punkt 句级分割
- **翻译引擎**: 可插拔（agnes/qwen/hy_mt2/glm），OpenAI-compatible API，并发双引擎 fan-out
- **转码**: ffmpeg libx264 crf23 faststart，当前只转 720p
- **下载**: yt-dlp ≤1080p，失败→静默降级用 embed 播放
- **安全边界**: GPU worker 无 DB/OSS 凭证，HTTP callback + secret 认证

---

## Part C: 管线后续改进方向（按优先级排序）

### 改进 1: 翻译质量门升级为阻塞（高优先级）

**现状**: 翻译质量检查失败只 log warning，视频照常 ready。覆盖率低于 80% 的视频也会上线。

**建议**:
- 覆盖率 < 60% → 阻塞（标记 error，管理员重触发）
- 覆盖率 60%-80% → 标记 `quality_warning` 状态，管理员可见但视频仍可用
- 其他指标（短翻译/混合/长度异常）保持 warn

**改动**: `backend/app/tasks/video_processing.py` 的 `_translate_subtitles()` 返回 quality_report，`finalize_video` 根据覆盖率决定继续/阻塞。

### 改进 2: 质量报告持久化（高优先级）

**现状**: 质量报告只写 structlog，无法查询、无法在管理后台展示。

**建议**:
- 新建 `video_quality_reports` 表（video_id, stage, passed, issues JSON, metrics JSON, created_at）
- 转录和翻译质量检查后各写一行
- Admin 后台视频详情页展示质量报告
- 支持按"质量警告"筛选视频列表

**改动**: 新 model + migration + 修改 internal.py 和 video_processing.py 写入 + admin API/前端展示

### 改进 3: 下载失败自动补下载（中优先级）

**现状**: YouTube 视频下载失败→静默跳过（用 embed），没有后续重试。embed 依赖 YouTube 可用性，国内用户可能无法播放。

**建议**:
- 下载失败时记录 `download_failed_at` 时间戳
- 新增 beat 任务 `retry-failed-downloads`（每天凌晨），对 `download_failed_at IS NOT NULL AND video_url_720p IS NULL` 的视频重试下载
- 连续失败 3 次后标记 `download_permanently_failed`，不再重试

**改动**: Video model 加字段 + 新 beat task + 修改 finalize 的 downloading 步骤

### 改进 4: 全管线 Watchdog（中优先级）

**现状**: Watchdog 只监控 "transcribing" 阶段超时。如果翻译/下载/转码步骤卡住（Celery worker 崩溃），视频会永远停在 processing。

**建议**:
- 扩展 watchdog 覆盖所有 `status=processing` 且 `processing_started_at` 超时的视频（不限 step）
- 或：每个步骤开始时更新 `step_started_at`，watchdog 检查单步超时（翻译 30min、下载 60min、转码 30min）

**改动**: 修改 `watchdog_stale_transcriptions` 或新建 `watchdog_stale_pipeline` task

### 改进 5: 质量告警通知（低优先级）

**现状**: 质量门失败只写日志，管理员必须主动看日志才知道。

**建议**:
- 质量门失败时创建一条 Notification（type=quality_alert）推送给管理员
- 或：集成企业微信/邮件 webhook（后续考虑）

**改动**: 在质量检查失败分支调用 notification_service

### 改进 6: 人工抽检流程（低优先级，产品层面）

**现状**: 全自动，无审核环节。管理员只能事后在 admin 面板看。

**建议**:
- Admin 视频列表增加"质量分"列（基于质量报告 + learning_score）
- 新增"待审核"筛选：翻译覆盖率 < 90% 或触发过质量警告的视频
- 视频详情页展示转录/翻译质量报告 + 一键重触发翻译

**改动**: 主要是 admin 前端 + 查询 API 扩展

---

## Part D: 其他后续方向（本次不执行）

### AI 学习计划（待讨论）
- 需要确定: 用户输入什么 → 计划长什么样 → 生成方式

### 视频编辑模式（画布式字幕编辑器）
- MVP: 时间轴 + 字幕文本编辑 + 拖拽排序
- 进阶: 自由画布、字幕样式、批量操作

### 用户反馈与引导
- 反馈入口、新用户引导、联系方式

### 维护与升级
- 版本管理、部署流程、监控告警、数据迁移
