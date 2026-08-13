# Changelog

本项目所有重要变更记录。格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

`npm run release` / `scripts/release.sh` 会自动 bump 版本并把未发布区段归档为新版本。

## [Unreleased]

### Added
- **真题练习/考试系统（08-04 → 08-13）**：paper bank 模型（exam_papers/exam_questions）+ exam_sessions/exam_answers（paper_exam/daily_check/wrong_redo 三模式）+ 服务端判分 + 答案不下发；错题本（派生查询，重做答对即销账）；练习专题页 + ExamRunner（倒计时/退出/移动端提交栏/两列选项）；`/upgrade` 页三步指引；每日检测深色特色卡；练习统计条。
- **SMS 认证切换阿里云 Dypnsapi（08-09）**：SendSmsVerifyCode/CheckSmsVerifyCode（服务端生成/校验验证码），dev-fake 仅限非生产。
- **全站综合审查与安全修复（08-14，见 docs/progress/REVIEW-2026-08-14.md）**：
  - 安全：上传存储型 XSS 修复（服务端扩展名白名单 + serve_media allowlist + nosniff）、/media/proxy SSRF 修复（禁重定向 + 移除 aliyuncs.com）、草稿/未发布视频媒体发布态门控（owner/admin token 预览）、limiter Redis 故障 in-memory 降级、/media 代理头覆盖 XFF。
  - 部署：prod compose 默认挂载 nginx.ssl.conf（TLS + 安全头 + 日志脱敏）、后端镜像非 root + HEALTHCHECK、deploy 模板与 compose 对齐。
  - 工具链：CI 加 pip-audit / npm audit 硬门、Dependabot、python-multipart 升到 >=0.0.18（CVE-2024-53981）。
  - 测试：CI e2e 数据 seed（watch 核心旅程不再 skip）、Celery 任务体直测、SMS 冷却 TTL 测试、watch 快捷键 e2e 回归。
  - 修复：watch 页快捷键双重监听与字幕导航 seek 失效、管理端引导刷新竞态、重录跟读录音丢失、requirements.txt 缺 Dypnsapi SDK（send-code 502 根因）。
  - 文档：ADR-0013（Shadowing 录音持久化）、SECURITY.md 重写、context/system-map/state 更正。

### Changed
- 前端 `mediaUrl()` 支持 `withToken`（草稿媒体预览携带 JWT）。
- 后端 `get_engine()` 池参数仅 Postgres 生效（SQLite 兼容）。
- `scoring_tasks` 惰性导入 async_session（与其他任务模块一致，测试可达）。

### Fixed
- 上传视频落盘扩展名改由服务端 content-type 白名单推导（不再信任客户端 filename）。
- `/media/proxy` 不再跟随重定向；OSS 域名移出代理白名单。
- 未发布 UGC 视频媒体不再公开可下载。

## [0.1.1] - 2026-08-03

### Added
- **Stage 1 播放页速效**：字幕区独立滚动、词卡默认停泊位避让字幕栏（展开=左下/收起=右下）、字幕面板收起时视频区 max-width 约束居中、侧栏收起/展开 toggle（修复 localStorage 残留 collapsed 卡死）。
- **Stage 2 播放页核心**：根容器 `h-full snap-y snap-mandatory`，屏1=视频+字幕面板、屏2=练习区，下滚翻页 + 阻尼吸附。
- **Stage 3 画布编辑器后端**：`POST /admin/{vid}/subtitles/reorder`、`POST /admin/{vid}/subtitles`（新建空行）、`DELETE /admin/{vid}/subtitles/{sid}`，复用 `_validate_timing` 不重叠校验。
- **Stage 3 画布编辑器前端**：删除行 + 新建行 UI、字幕时间轴可视化（字幕块 + 时间标尺 + playhead + 点击定位）、时间块拖拽/缩放（拖块体平移、拖边缘改 start/end，后端校验兜底）。
- **Stage 4 反馈公告系统**：Feedback 模型 + API（用户提交/admin 列表/回复/状态）、公告广播（Notification type=announcement，遍历全体用户）、`/contact` 页（联系方式 + 公告区 + 反馈表单 + 我的反馈）、admin `/admin/feedback` 页（发送公告 + 反馈管理 + 回复）。

### Changed
- 字幕编辑器加内联两步删除（首次点击武装"确认删除"，3s 超时复位）。
- `WordTooltipInline` 加 `data-testid="word-tooltip"` 做稳健测试选择器。

### Fixed
- F1：主应用桌面 sidebar 无收起/展开按钮，localStorage 残留 `sidebar-collapsed=true` 时卡死"无法打开"。
- Stage 1 e2e：词卡选择器 `.fixed.z-50` 与移动端遮罩歧义，改用 `data-testid`；过滤 analytics keepalive 预检 405 网络噪音。

### Diagnosed
- Stage 5 ASR/标注质量：用户报的 good->best / more->mores / out->outing / I->abiding 在当前代码已全部正确处理（`ecdict-exchange-lemma-bug` 已修），无需改代码。详见 `wiki/problems/asr-annotation-quality-diagnosis.md`。
