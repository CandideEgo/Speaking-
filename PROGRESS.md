# SeeWord redesign 进度

## 工作项清单

- [x] 准备：定位真实项目、阅读仓库规则、建立 redesign 分支与现状快照
- [x] 0 全局设计规范与公共组件
- [x] 1 首页
- [x] 2 观看页
- [x] 3 频道页
- [x] 4 搜索结果页
- [x] 5 收藏 / 订阅 / 学习记录
- [x] 6 练习列表
- [x] 7a 听力数据模型与接口
- [x] 7b 听力播放器与作答
- [x] 7c 听力判分 / 解析 / 统计 / 进度
- [x] 7d 听力边界情况
- [x] 8 词汇 / 我的 / 通知 / 会员 / 排行榜 / 登录等其他导航
- [x] 9 全站走查与最终验收

## 必须保留的现有功能

- [x] 视频播放 / 调速 / 清晰度 / 进度恢复 / 逐句跳转 / 本句重听 / 播放范围
- [x] 双语字幕、逐词点读、词卡、加入词汇、字幕搜索与学习笔记
- [x] 收藏 / 点赞 / 频道订阅、跨页状态、观看历史
- [x] 词汇复习、词集与筛词、间隔重复
- [x] 真题阅读、选词填空、段落匹配、整卷、错题回看与结果
- [x] 手机短信 / 密码登录、注册、找回密码、个人设置、会员权益、通知
- [x] 管理端与现有数据完整保留；已停用功能的兼容入口不恢复

## 阻塞

- 原改版环境阻塞已解决。2026-10-24 本轮复优化的本机浏览器复查受 Docker Desktop/Engine 未启动阻塞；Start-Redesign.ps1 连续两次等待后均报 Docker 未就绪，按要求停止重试。未能生成本轮新浏览器截图；最近一次完整页面证据仍为 102 项全通过（见 docs/evidence/design-redo/final-report.json）。

## 假设与决策

- 聊天目录不是项目；通过本机项目配置与代码确认实际仓库为 C:\Users\Administrator\Speaking。C:\Projects\Speaking 是旧版，不修改。
- 工作开始时已有大量未提交改动；先保存为快照，再在 redesign 分支继续。临时脚本、缓存、密钥不入库。
- 生产地址尚未在请求中提供：从项目配置寻找，只读公开页面与当前提交历史，不部署、不向生产写测试数据。
- 设计稿是视觉依据；现有真实 API 与数据库是数据依据，不把原型的示例统计或个人记录当真实数据。
- 保留已存在的深浅色方案。听力在原有真题练习体系上扩展，优先采用有真实音频与标准答案的数据。

## 举一反三清单

- [x] 所有视频入口统一播放量 / 时间 / 时长 / 频道信息 / 收藏数据口径
- [x] 所有频道统一订阅数量 / 视频数 / 简介 / 订阅状态
- [x] 列表加载、空、错、重试、分页状态
- [x] 文字截断、图片失败、触摸目标、键盘焦点、深色与窄屏
- [x] 导航高亮与返回来源
- [x] 收藏与订阅跨页刷新、持久化与失败回退

## 验证记录

- 准备：仓库 pre-commit 检查启用，格式变更自动修正后重试，不跳过门禁。

### 0 全局设计规范与公共组件

建立根 DESIGN.md（引用设计导出、YouTube 官方参考、tokens/响应式/状态契约）。统一 formatCount，保留兼容导出；新增 VideoMetadata 并用于两种公共视频卡，真实 0 也显示。去掉普通卡片悬浮位移和装饰阴影。已运行本地基线截图：10 条路由桌面/手机均无横向溢出；后续验证见本阶段提交。

### 1 首页

首页保留设计稿的精选、继续观看、到期词汇、订阅频道、本周记录与筛选网格。精选和续看补齐公共统计与发布时间；所有数字来自现有 API，不复制设计稿样例数据。卡片共用 VideoMetadata；筛选、分页、空错重试继续沿用真实接口。基线与本阶段截图在 docs/evidence/design-redo。

### 2 观看页

保留播放/逐句点读/重听/学习词卡/笔记的全部布局与行为；补齐可见的播放、收藏、发布时间、频道头像与本站订阅数，加入真实推荐接口的可重试视频网格。视频信息默认展开，手机收藏不再藏在折叠详情中。生产公开入口已只读读取成功但跳到登录页；不创建生产账户、不绕过登录，主要参考用户提供的生产观看页截图，作为保守决定。

## 环境问题跟踪

- 初始本地 API 在首轮截图后退出，后续发现 Docker Desktop 未运行，数据库/Redis 不可达。已恢复 Docker Desktop、原有本地 PostgreSQL/Redis 与 API，首页最终截图已重跑且通过。没有操作生产。

### 3 频道页

频道列表与详情增加真实总播放（只汇总公开视频，分页外数据也计入）；本站订阅数 0 也展示，使用全站数量格式。频道视频行统一播放/日期/收藏信息。订阅操作广播同步到所有已挂载入口，详情订阅数跟随更新，最终状态由服务器持久化。新增总播放统计回归，覆盖未发布视频隔离与分页。修正观看页频道请求最小 page_size。

### 4 搜索结果页

搜索保留视频/频道/原句/词汇四类、关键词高亮、URL 分页与时间定位；频道结果改为公共 ChannelCard，服务端批量补齐相同真实统计和订阅状态。视频搜索复用公共 VideoCard；加载状态替换为骨架。原句结果仍跳至对应时间，不丢搜索来源与返回参数。

### 5 收藏 / 订阅 / 学习记录

收藏使用公共 VideoCard，三类收藏与取消/笔记/分页保留；历史 VideoBrief 补齐真实播放量、收藏、原片/本站日期，并使用公共 VideoMetadata。观看页的订阅数随操作即时变化；频道卡按服务端初始订阅值计算增量，避免父页刷新状态后计数回跳。所有持久化沿用已有服务端 API，不创建原型示例个人数据。

### 6 练习列表

练习页采用设计稿紧凑页头、上次练习、题型行、真实套卷与侧栏统计。补齐骨架；移除读取套卷失败后伪装成空列表的静默 catch；无卷时文案按实际状态显示。保留阅读、选词填空、段落匹配、整卷、错题与结果入口。听力将在下一阶段接入，不显示假题量。

### 7a 听力数据模型与接口

新增 listening_sessions（新表，不改现有数据），冻结真实字幕题面、草稿与结果。素材列表只返回已发布、可播放且有有效时间段字幕的视频。按用户隔离记录、续做、保存位置、提交幂等；正确答案在提交前不下发。判分忽略大小写与标点，逐词比较给出准确率与差异，不生成假分。采用视频逐句听写是设计稿未提供听力题型时的常规决定；未引入 AI 评分或外部题库。

### 7b 听力播放器与作答

新增真实素材目录、每组 3/5/10 句、最近草稿/已提交记录与分页；播放器支持重播、0.5–1.5 倍速、循环、本句内范围控制、加载失败重试。作答有题号导航、上一句/下一句、当前进度、自动草稿保存和返回入口。题目和音频来自已发布真实视频，播放保护使用现有 mediaUrl token。

### 7c 听力判分 / 解析 / 统计 / 进度

完整结果页展示整句答对数、逐词准确率、每题原句、真实译文、漏听/多写/听错对照及已有语法说明。后端判分并冻结结果，重复提交不重复写学习事件；再练创建新轮次。草稿串行保存，输入即留本地恢复副本，成功同步后清理；提交前先保存最新答案，避免保存定时器与交卷竞态。

### 7d 听力边界情况

后端 9 项测试通过：鉴权、无题/下架、越权、外来题号、超长答案、提交幂等、草稿恢复与规范化判分。桌面 Chromium + 手机 Chrome 共 4 项真实媒体端到端测试通过，覆盖加载失败/重试、空素材、调速/范围/循环、刷新续做、结果持久化及再练。初次空状态测试错误地按 heading 查找公共组件的 p 文本，修正定位后所有断言通过；未放宽产品检查器。

### 8 词汇 / 我的 / 通知 / 会员 / 排行榜 / 登录等其他导航

复查实际导航：首页、频道、练习、词汇、我的、收藏、学习记录、通知、会员，补查排行、帮助反馈、登录/注册/找回/设置密码与法律页。公共页头去除重复面包屑；紧凑标题调整为统一 20px。排行和频道推荐卡补齐统一视频数据；个人概览和趋势请求失败显示重试，避免伪装成 0 或无数据。图表品牌读取同一主题 token、设置初始尺寸避免容器警告；通知已读同步全站徽标。首页进度栏补齐骨架/错误重试，订阅状态读取失败可重试。原有词汇/个人设置/会员真实接口和鉴权保留。

## 最新用户补充：删除标题/子标题的小字说明

- 按“删除标题和分区标题下面的辅助说明”执行。保留导航标题本身，保留视频原名/中文名、频道简介与统计、字幕/译文、表单校验和错误提示等有实际内容的数据。
- 公共 PageHeader 不再展示说明文案；真实频道数据和视频名通过 meta 保留。清理各导航页、引导页和首页分区标题紧随的小字说明；移除登录公共壳的说明副标题。
- 最终回归会同步核对文案精简后的页面。旧 UI 测试中对已删除导语的断言将更新为新的明确产品要求；检查器与验收基线不放宽。

### 全站走查记录

- 其余 10 条导航/子页 × 桌面/手机，20 次增强验收均无 API 错误、脚本错误与横向溢出。
- 首轮保留功能回归：播放器与手机词卡等 22 项通过；首页遇到不完整响应会使进度栏崩溃，已改为错误态。与最新删除小字要求冲突的旧导语/简介断言已调整为“应不显示”，继续保留双语标题、真实入口、主题、返回和响应式断言。
- 前端完整 check 通过，30 个单测文件 / 332 项通过。后端首轮全量 1331 项通过；最终轮次见末尾验收。

- 走查补修：收藏计数与按钮乐观状态同步，失败回滚；新增本地 Start-Redesign.ps1 启动入口，复用现有本地数据库，迁移只增加听力表，不播种假内容、不部署。

- 真实端到端验收发现收藏刷新后统计来自旧详情缓存；改为缓存字幕、从已读取的数据库实体刷新动态计数和日期。收藏/点赞/播放完成后清理列表统计缓存，并修正公共详情缓存失效 helper 的错误 await。注册页的登录入口移到页头操作位，删除说明不删除功能入口。

- 子页走查补齐：词汇训练的已有可见页名改用公共语义页头；无错题时先读取真实错题清单并显示空状态，不再直接发起必失败的重做请求。

- 举一反三最后复查：频道卡的最近视频和订阅卡的续看视频也补入公共 VideoMetadata；后台补齐对应真实字段，避免微型视频入口遗漏播放/收藏/日期。观看页点赞大数使用唯一数量格式化函数。


## 最终验收（2026-10-23）

- 工作项 0–9 全部完成，最新“删除标题/子标题小字说明”要求已合并；保留真实视频/频道内容与必要状态反馈。
- 实际浏览器最终合并记录 102 项全部通过，覆盖桌面/手机、所有导航及练习/词单/文稿子页、深色、360/390/430/600/820/1024/1366/1440/1920 宽度；无脚本错误、API 错误、横向溢出。增强验收报告：docs/evidence/design-redo/final-report.json。先前子页缺少语义标题、无错题请求错误等失败已修正并复验。
- 前端完整 npm run check 通过；30 个单测文件 / 332 项通过；npm run build 成功，包含 TypeScript 与静态/动态路由构建。
- 后端最终全量：1333 项通过，16 项默认因未配置独立 PG_TEST_URL 跳过。随后在全新一次性 PostgreSQL 数据库单独执行这 16 项：全部通过。总计 1349 项后端测试通过；现有 seeword 数据库未用于破坏性测试。
- 保留功能回归：观看/首页/手机字幕词卡/来源返回 36 项；注册/登录/设置密码/找回/退出 13 项；真实收藏订阅跨页刷新桌面+手机各 1 项；听力完整流程及失败恢复桌面+手机共 4 项；阅读作答/错题/词汇与长内容可读性 6 项。相关最新日志在 logs/redesign-*.log。
- 本地听力迁移 Alembic o6p7q8r9s0t1 已应用；只新增会话表。测试音频实际加载播放，答案、题面、译文来自真实已发布字幕。
- Start-Redesign.ps1 已实际启动/复用服务并返回 ready；构建后再次启动并复查主页面、听力结果与真实交互全部通过。
- 没有修改、推送或部署生产；没有删除现有用户数据、视频或关键功能；未放宽检查器、测试基线或跳过提交钩子。

## 完成总结

统一全站设计语言、公共视频/频道卡与真实统计，完成首页、观看、频道、搜索、个人内容、练习与其余导航的重做和状态补齐。听力现已支持真实原声分段、调速、范围与循环、作答、服务端判分、原句解析、统计、持久草稿、恢复与重练。修复收藏计数、统计缓存、订阅同步、进度栏异常响应和多处空错状态；删除标题和分区标题下的说明文字。

主要决定：以本站真实统计为准，原片日期和本站日期明确区分；没有依据的数据不编造。听力采用字幕逐句听写，忽略大小写/标点，未提交不下发答案，重复提交不重复累计。生产入口需要登录，因此使用用户提供的观看页参考截图和公开只读页面，不创建生产账号。

遗留与建议：没有阻塞本次验收的未解决项。已有后端测试警告（短测试 JWT 密钥、退役兼容路由 OpenAPI operation_id 重复及依赖弃用提示）保留记录，不影响本次功能/构建通过；后续可单独清理。测试采用本地专用账号，未往正式内容库播种示例视频。原有无关临时目录保持原状。

查看：在 C:\Users\Administrator\Speaking 运行 .\Start-Redesign.ps1，然后打开 http://localhost:3000；代码与各阶段提交在 redesign 分支。详情见本次交付的“查看改版.md”。

## 后续优化（2026-10-24）

- [x] 页面标题辅助文案清理：清除 17 个公开路由中的隐藏 PageHeader 导语，删除历年真题的“听力暂未接入”旧文案；PageHeader API 现在只接受标题和真实元数据，频道简介迁到 meta，词单模板型说明移除。保留空状态的帮助操作说明。TypeScript、ESLint、Prettier、设计系统/会话写入门禁及 332 项单测全部通过；本轮浏览器复查因上述 Docker 阻塞未重跑，改动不改变已渲染布局。

## 全面审计与优化（2026-10-24 第二轮）

工作区先提交快照（`.raven/`、`designs/`、一次性词表 dump 入 gitignore；审计截图/report 另提交），随后按设计导出做前端视觉 + 前端功能/可访问性 + 后端架构三路并行只读审计，再定向修复。

- 审计报告：`docs/audit-2026-10-24/README.md`（总览与验证记录）、`frontend-visual.md`（57 张截图、114 次溢出测量 0px）、`frontend-functional.md`（25 桌面 + 12 移动路由）、`backend-architecture.md`（31 条发现）。
- 视觉修复：首页眉标/右栏白卡/已订阅频道整段/主推 CTA「从这句话开始」+ 句数；断点改为设计契约（≤1024 收侧栏 + 底栏、≥1025 显示侧栏），顶栏/底栏/账号菜单/观看页内部断点同步；移除页头装饰线、补回移动端品牌字、搜索空态文案、hover token。
- 功能/可访问性修复：通知浮层 StrictMode 永久 loading、TabPills 选中态 ARIA、skip link 成为第一个 Tab 停靠点、已设密码账号的 `/set-password` 引导（后端新增只读 `has_password`）、对比度 token 提到 AA、移动端触控目标 44px、通知浮层 dialog 语义、404 h1、history 标题层级、频道清空搜索、个人页 tab 换行。
- 后端修复：JWT 密钥强度 + 算法白名单（BE-01）、`complete` 行为事件 Redis 幂等且只在真正写副作用时失效缓存（BE-02）、交卷列表答对数改用 `ExamAnswer` 聚合（BE-18）、字幕搜索按方言分流（BE-24）、nginx 鉴权限流指向真实路径（BE-05）、compose 金数据密钥改按需必填（BE-26）。
- 验证：前端 `npm run check` 通过、332 项单测通过；后端 `ruff` 通过、全量 1350 passed / 16 skipped（需独立 PG_TEST_URL 的 integration 默认跳过）；e2e 断点用例已按新契约更新并通过，另 8 条定点通过；4 条 e2e 因 dev 后端 429 未执行（需 `ENV=testing` 测试后端，已记入报告）。未新增迁移、未放宽门禁/基线。
- 未修：BE-03 迁移漂移、BE-08/09/11/12/13 等；收藏/通知等剩余结构缺口。均已列入 `README.md` 第 5 节。

### 第二轮补强：审计列出的结构性缺口

- 词汇页首屏按设计补齐：深色「今天复习」到期卡 + 四项统计卡 + 词单进度网格（真实 `/vocabulary/stats` 与 `/vocab-sets` 数据），训练/词库视图保留在下方。
- 练习页「按套卷练」改为 3 列 paper-card + 已选操作条（选中蓝框、可作答状态、题量/构成/建议用时），套卷请求从固定 `cet6` + 3 套改为混合级别 + 6 套。
- 我的页右栏补深色会员卡与账户卡（手机号 / 会员状态 / 未读通知，来自真实用户与通知 store）。
- 列表页眉标落地：`PageHeader` 的 `eyebrow` 从 20px 改为设计契约的 12px 大写灰眉标，词汇/频道/收藏/历史/通知/我的/排行/会员/搜索/词单/复习/套卷/听力统一启用；eyebrow 下隐藏重复字符串 crumb，移动端左对齐。Playwright 复核 12 条路由 `12px / uppercase`、无横向溢出；词汇/练习/我的三页截图在 `docs/evidence/audit-2026-10-24/redesign-*.png`。

### 第二轮 P2 视觉补齐

- 频道详情补 380×240 频道封面 hero（桌面：封面 / 正文+订阅 / 事实行），替换 56px 圆头像标题。
- 会员页补深色「当前状态」卡（会员/免费、有效期、先去复习 / 做一套真题），权益与价位卡保留。
- 学习记录四个统计数字收进描边卡；首页右栏移除设计里没有的「查看学习记录」卡，收敛为到期/正在学/本周节奏三张。
- Playwright 复核：四页横向溢出 0；频道封面实测 378px；会员页「当前状态」出现；学习记录统计卡边框 1px。
- 后端媒体/PDF 鉴权收敛（BE-04）：新增 `dependencies.resolve_token_user()`，媒体 `?token=`、shadowing 录制与原卷 PDF 全部走与 API 相同的链（黑名单 / 改密 / 封禁）；补 3 条测试（封禁 owner、改密后旧 token、封禁 shadowing owner），media + PDF 47 项通过。
- WebSocket 鉴权收敛（BE-15）：通知 WS 握手改用同一条 `resolve_token_user()` 链，补「改密后旧 token 被拒」用例，notifications 35 项通过。
- 短信固定码改为显式 opt-in（BE-06）：新增 `SMS_DEV_FAKE_ENABLED`（默认 false，production 启动即拒绝），`verify_code` 必须读到 Redis 已发码；本地 `.env`、`.env.example`、CI 两处 env 显式开启，测试补「未显式开启不生效」「未发码不接受」「production 拒绝」；SMS/配置相关 61 项通过，dev API 实测发码后 1234 可登录、未发码 400。
- 迁移漂移彻底对齐（BE-03）：新增 `p7q8r9s0t1u2_align_model_schema_drift`，条件式补 `uq_exam_sentence_word`、`uq_exam_word_freq_word_level`、`ix_notifications_dedup`、`exam_sentence_words.sentence_id` / `videos.reviewed_by` / `subtitles.video_id` 三条 FK，重命名 vocabulary 索引并同步列注释；模型侧 `user_answer` 改 `Text`、两处时间列按 DB nullable 对齐。迁移先查重复/孤儿，脏数据即中止并提示清理（本机 dev 库 58 + 49 条，未升级）。新建 scratch 库实测：29 条漂移 → 7 条（均为退役表），`scripts/check_schema_drift.py` 报 `7 known entries, 0 new`；downgrade/upgrade 往返可重复；人为重复行时按预期中止。

### 全量 e2e（testing 后端）

- 按 `frontend/CLAUDE.md` 用 `ENV=testing` 后端 + 全新 `seeword_e2e_full` 库（迁移到 head + `seed_e2e.py`）实际执行 chromium 全量：首跑 **120 passed / 16 failed / 63 skipped**，修复 10 条后 **132 passed / 6 failed / 63 skipped**（201 项）。
- 已修：`auth.spec` 改用真正 passwordless 账号 + 移除未用 SHARED_TOKEN；`avatar.spec` 先点「个人资料」tab；`viewport-height` 底栏选择器改 `data-testid`；主按钮 hover `#0077ed` 对白字仅 4.32:1，恢复 `#0066cc`（5.57:1）；practice 断言改为「题库概览」；续看错误重试限定作用域；editorial 引文 CTA「从这句话开始」+ `t=12`；watch「视频信息」默认展开；首页 4 列宽屏断点改为 `min-[1680px]:!grid-cols-4`（设计 1680 档）并加 `data-testid="home-feed-grid"`；home-feed 卡片选择器同步。
- 剩余 6 条全部是 fixture 数据不足：home-feed 真实数据配比、频道/收藏、listening 音频 ×2、239 词复习队列、46 题长卷；未删/跳过用例来凑绿，留待补种子数据。
- 本地 dev 后端已恢复（:8000 development）；e2e 测试库 `seeword_e2e_full` 与 testing 后端已停止；前端 `npm run check`、332 项单测通过。

### 后端回调锁复用异步 Redis（BE-10）

- `internal._acquire_callback_lock` / `_release_callback_lock` 改为 `await app.core.redis.get_redis()`，`await r.set(nx=True, ex=TTL)` / `await r.delete`；删除每次调用新建同步 `redis.from_url` 客户端、事件循环内阻塞与连接池泄漏。
- `test_internal_callback.py` 的锁替身改为 async Redis，10 项通过；全量后端 **1350 passed / 16 skipped**。

### 真题查询有界化（BE-09）

- `create_daily_session`：先 `ORDER BY random() LIMIT count×5` 抽有界样本，样本里可答题不足才回退全表，避免每次 daily/start 全表载入。
- 错题本：新增 `_latest_wrong_answers`（`row_number()` 窗口取每题最新作答，只保留最新为错的题）与 `_wrong_counts`（SQL `GROUP BY` 统计错次），替换“载入全部历史作答再在 Python 聚合”。
- `exam_stats`：改为 3 条 SQL（本月 count/sum、最近一次 daily、近 7 天 daily count），不再加载用户全部已提交 session。
- `test_exams_api.py` 21 + `test_exam_corpus.py` 9 通过；全量 1350 passed / 16 skipped。

### 学习计数原子化与周统计正确数据源（BE-08）

- `_update_daily_progress` / `_update_streak` 改为条件 SQL `UPDATE`：计数用 `col = col + :delta`，换日用 `today_date IS NULL OR != today` 的条件 UPDATE 重置，streak 只在 `last_active_date` 仍为「空 / 昨天 / 更早」时翻转；同一天第二个事件不会再加 streak。
- 目标达成用 `today_goal_met=false` 条件 UPDATE 抢占，两个并发事件越过目标线时只写一条 `met_daily_goal`。
- `/learning/stats/weekly` 的 `this_week_minutes`、`last_week_minutes`、`daily_minutes` 改用 `behavior_events.watch_time` 的 `delta_s` 按 `server_ts` 分日/分周聚合；`LearningRecord.time_spent_seconds` 明确标注为累计值、不可按 `last_accessed_at` 切片。
- 新增 `test_learning_weekly_stats.py` 3 项（周归属、同日 streak 只加一次、goal meta 只发一次）通过；全量后端 1353 passed / 16 skipped。

### GPU 回调投递失败可重试（BE-11）

- `_post_transcription_callback` 把 408/425/429 与 5xx 一并视为瞬时失败重试，其余 4xx 仍永久失败；429（回调端点 30/min 限流）不再丢弃已完成的转录。
- `transcribe_video_gpu` 检查回调返回值：False 时 `raise self.retry(countdown=60)`，避免 Celery 任务“成功”而视频永远停在 `processing`；投递失败与转录异常的重试路径分开，避免重复 retry。
- 新增 `test_callback_delivery.py` 5 项（429→200、401 不重试、5xx 耗尽、投递失败 retry、投递成功不 retry）通过；全量后端 1358 passed / 16 skipped。

### 管线锁覆盖长流程、翻译步骤及时打点（BE-12）

- 锁 TTL 从固定 60 min 改为 `sum(step_timeouts) + 10min`（最低 60min），覆盖 translating 30 + annotating 5 + prewarm 30 + classifying 10 + downloading 60 + transcoding 30 的预算；`run_steps` 在每个步骤边界 `refresh_lock` 续期，Redis 故障仅告警不阻断。
- `_run_translating` 在调用 LLM 前先写 `processing_step=translating` 并 `touch_step_started_at`，长翻译不再被 watchdog 按转录开始时间误判；翻译结束不再重置时间戳。
- 新增 `test_pipeline_lock_ttl.py` 5 项（TTL 覆盖、60min 下限、refresh、Redis 故障不阻断、翻译前打点）与既有 `test_pipeline_steps.py` 6 项通过；全量后端 1363 passed / 16 skipped。

### 浏览缓存按影响面精准失效（BE-13）

- 点赞/收藏/播放完成的榜单快照失效改为精准模式：点赞不动榜单；收藏只删 `rankings:snapshot:*:weekly_favorites`；播放完成只删 `rankings:snapshot:*:weekly_views`。
- feed/featured 仍全族删除：缓存卡片负载本身带 `like_count`/`favorite_count`/`view_count`，既有 `test_live_video_metadata.py` 要求暖缓存下收藏/点赞/播放后卡片计数立即更新；不靠改测试来换性能。
- 发布/下架/处理完成等结构性变更仍走 `invalidate_browse_cache()` 全量失效。
- 新增 `test_video_cache_invalidation.py` 4 项逐族断言，`test_live_video_metadata.py` 2 项通过；交互路径不再清空全部 `rankings:snapshot:*`；全量后端 1367 passed / 16 skipped。

### 修掉 mypy baseline 门的新错误（BE-16）

- `discovery_service.py`：`**latest_video_payload(...)` 可能为 None，改为 `or {}`。
- `exam_service.py`：`list_papers` 复用 `rows` 导致类型冲突，改名为 `section_rows`。
- `vocabulary_service.py`：`dict(result.all())` 改显式推导并标注 `dict[str, int]`；subtitle 行改 `subtitle_rows` + 显式 `dict[str, float]`。
- `overview_service.py`：`daily` 显式 `list[dict[str, Any]]`。
- `video_service.py`：`upload_date`/`published_at` 显式 `isoformat()`，不再依赖 pydantic before-validator 的 mypy 误报。
- `behavior.py`：BE-13 新增的集合显式 `str(video_id)`。
- `.mypy-baseline` 只降不升：45 → 42 行，删掉 3 条已修掉的旧错误，没有新增。本地复算 CI 的 `comm -23` 等价命令 **new=0**；CI 作业本身未执行。全量后端 1367 passed / 16 skipped。

### 失败可观测性接入告警通道（BE-14）

- watchdog 批量判死后：`notify_admins` 写站内通知 + `send_alert(severity="critical")` 走外部 webhook（含 video id / 步骤摘要），不再只有一行日志。
- GPU 转录最终失败、回调投递最终失败：`_send_alert_sync` 在同步 Celery 任务里 `asyncio.run(send_alert(...))`，best-effort，不影响任务本身。
- lifespan 在生产未配置 `ALERT_WEBHOOK_URL` 时打 warning，避免把无效开关当成已接线。
- 无 webhook 时 `send_alert` 仍回退站内管理员通知；新增/扩展 3 个用例验证 watchdog 双通道、投递最终失败告警、转录最终失败先回 error 再告警；全量后端 1370 passed / 16 skipped。
