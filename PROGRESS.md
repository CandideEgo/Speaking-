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

### 生产关闭 docs/schema、metrics 移入内部路径（BE-17）

- `create_app()` 在 `env=production` 时不注册 `/docs`、`/redoc`、`/openapi.json`；开发/测试保留。
- Prometheus metrics 在 production 从 `/metrics` 移到 `/internal/metrics`，不再依赖 nginx 是唯一遮挡。
- 新增 `test_exposure.py` 2 项（production 无 docs 路由且 metrics 改名、development 保留两者）。

### OpenAPI operationId 唯一（BE-20）

- `shadowing.py` 每个 (path, method) 拆成独立函数，消除叠加装饰器导致的重复 operationId（5 条兼容路由）。
- `GET /videos/{id}/shadowing-sentences` 删除与恒 410 实现不符的 `response_model=list[dict]`。
- 新增 `test_openapi_contract.py` 2 项：全 schema operationId 唯一、shadowing 6 条路由 id 互不重复；`test_response_contract.py` 16 项通过；全量后端 1374 passed / 16 skipped。

### 422 统一为 VALIDATION_ERROR、401 补挑战头（BE-19）

- 新增 `UnprocessableEntityError(DomainError)`（status 422 / code `VALIDATION_ERROR`），替掉 listening（路由 + service 共 4 处）、videos 排名 scope、vocab_sets scope 共 6 处 `HTTPException(422)`；业务参数非法与 pydantic 校验现在共用同一 code。
- `_http_exception_handler` 改为透传 `exc.headers`；`get_current_user` 的 401 带 `WWW-Authenticate: Bearer`。
- 更新 `test_response_contract` 的 ranking scope 断言、`test_listening_api` 三处业务 422 与素材为空断言、`test_auth` 的 401 头断言；共 65 项通过；全量后端 1374 passed / 16 skipped。

### 清死代码与 ECDICT 启动预热（BE-21 / BE-23）

- 删除无调用点的 `require_pro_user` 与 `_weekly_report_payload`（含 `WeeklyReport` 导入）；`redeem_tasks` 注释不再引用已删依赖；`shadowing_service` 在前几轮已无引用。
- lifespan 启动阶段用 `asyncio.to_thread(ecdict.get_index)` 预热 ECDICT 索引，避免首个词卡/搜索请求在事件循环里同步构建 ~0.7s（DB 不存在时跳过）。
- `ruff check` 通过；`test_auth`、`test_auth_flows`、`test_learning_weekly_stats`、`test_openapi_contract`、`test_exposure` 共 23 项通过；真实生产启动耗时未执行；全量后端 1374 passed / 16 skipped。

### enrich 缓存按语境隔离、500 补安全头（BE-25 / BE-31）

- `AIService.enrich_vocabulary_word` 的缓存键加入归一化 word + context 的 sha256（无 context 用 `no-context` 档），不再让同一词在不同视频里互相串释义；`_cache_set` 显式 `ttl=7*86400` 与 docstring 对齐。
- `_security_headers()` 抽成模块级函数，安全头中间件与 `_unhandled_exception_handler` 共用：500 响应也带 `X-Content-Type-Options` / `X-Frame-Options` / `Referrer-Policy` / `Permissions-Policy`（生产再加 HSTS/CSP）。
- `decode_token` 同时 catch `InvalidKeyError`（PyJWT 2.13 中与 `InvalidTokenError` 是兄弟类），空 key 不再变成 500。
- 重写 `test_ai_cache.py` 3 项（同语境缓存 + TTL≈7 天、不同语境两个 key、失败仍抛错）；`test_error_envelope` 断言 500 安全头；`test_auth` 新增空 key decode 断言；共 16 项通过；全量后端 1376 passed / 16 skipped。

### 写接口限流、通知 404 语义与听写分页（BE-22 / BE-27）

- listening 6 条、exams 缺的 6 条、exam_pdfs 2 条、discovery 7 条全部补 `request: Request` + `@rate_limit`（写 10–20/min、读 60/min）；`/listening/sessions` 的 `restart=true` 现在先删除旧 pending 再建新会话，同 (user, video) 最多 1 条未提交，不能再用 restart 无限增长表。
- `mark_as_read` 合并为带 `user_id` 条件的查询，他人通知与不存在统一 404（不再暴露 id 存在性）。
- listening 会话列表改用标准分页 `page/page_size/total/has_more`（默认 page_size 仍 12），前端 `{items, has_more}` 兼容。
- `test_listening_api` 新增 2 项（restart 后只有 1 条、分页字段齐全）；`test_notifications` 他人通知断言改 404；exams/listening/search/notifications 共 83 项通过；限流在 testing 下 no-op，未做 429 实测；全量后端 1378 passed / 16 skipped。

### 生产禁开 stub 支付、详情缓存 viewer 谓词、周榜索引（BE-28/29/30）

- production 下 `PAYMENTS_ENABLED=true` 直接拒绝启动（微信/支付宝回调仍是 HMAC stub，非官方 RSA 验签），错误信息指明先接官方 SDK；生产收款继续走金数据。
- 视频详情缓存写入前显式要求 `access.remaining_this_month is None`；免费额度恢复后该字段若变成 per-user，详情直接不缓存，避免共享 key 跨用户泄漏。
- 模型补 `ix_user_favorites_created_at`、`ix_behavior_events_server_ts_type`、`ix_videos_public`；新增 `q8r9s0t1u2v3` 条件迁移（downgrade 可逆）。
- scratch 库 `alembic upgrade head` 后漂移门 7 known / 0 new；`downgrade -1` 再 upgrade 仍 0；`test_config_env_guard` 24 项、`test_live_video_metadata` 3 项、`test_behavior_api` 13 项通过；全量后端 1380 passed / 16 skipped。

### 应用壳去掉协议页脚、首页工具条去掉时长筛选（V-08 / V-10）

- MainLayoutInner 登录后的应用壳不再渲染 SiteFooter（设计 index.html:90-113 的壳只有 sidebar/topbar/main）；未登录白名单页仍保留协议入口。
- 首页 feed 工具条移除「时长」下拉，只留分类 chips + 难度 + 排序 + 条数；HomeFeed 同步删掉 DURATION_OPTIONS / durationLabel / 已选筛选里的时长项，筛选状态与请求参数能力保留在 hook 内。
- `npm run check` 通过（design-system 9 条 + session-writes + tsc + eslint + prettier）；`npm run test:unit` 332 passed。
- e2e `home-feed.spec.ts` 新增两条契约断言（无 `#feed-duration`、无协议页脚）；在 `localhost:3000` 下 **7 passed**。中途用 `127.0.0.1` 覆盖 `PLAYWRIGHT_BASE_URL` 时 dev server 的 HMR/水合不工作，改用配置默认的 localhost 后通过（不是本轮改动回归）。

### 首页 rail 单条周进度、续看常驻占位（V-13 / V-24）

- DiscoverRail 的「本周节奏」从 7 段小条改为单条进度条（days_active / 7，带 role=progressbar 与 aria-valuenow），并补回设计说明「只记录发生过的学习；没有任务打卡，也不补记。」
- 「继续观看」在无记录时不再整块消失，改为同几何的占位条（封面占位 + kicker + 「看一段视频就会出现在这里」+ 提示），首屏高度保持稳定；失败态与重试逻辑不变。
- home-continue-learning.spec.ts：无记录用例改为断言占位条；新增「本周节奏」用例断言单条进度条 aria-valuenow=4 与说明文案；**7 passed**（chromium / localhost）。
- `npm run check` 通过；`npm run test:unit` 332 passed。

### 我的概览删除多余六宫格与相关页面、资产数字对齐设计（V-17 / V-30）

- `profile` 的「我的内容」tab 删除 6 个快捷入口网格与右栏「相关页面」链接列表，只保留设计中的最近学习 + 学习节奏 + 会员卡 + 账户卡；`#profile-panel-content` 的 tabpanel 语义保留。
- `ProfileOverview` 资产数字从 28px 改为设计值 23px（`text-[1.4375rem]`）；首页 due-number 已是 42px，无需再动。
- `user-information.spec.ts` 的默认页用例改为断言「学习资产」区域存在、且六宫格里的 `/favorites`、`/upgrade` 链接不再出现；该 spec **11 passed**。
- `npm run check` 通过；`npm run test:unit` 332 passed。
- `design-rollout.spec.ts` 同时跑了 23 条，3 条因 dev 后端的短信验证码/注册限流失败（`验证码错误或已失效`、`注册过于频繁`），与本次改动无关；该 spec 需 testing 形态后端，未计入通过。

### 收藏页改为「视频 / 原句 / 词」tab（V-18）

- 收藏页从三段常驻 + 右栏说明改为 tab 切换：默认「视频」，可切「原句」「词」，计数在 tab 上；主栏恢复整宽，视频改为设计的两列网格。
- 删除重复的统计条与右栏「三组分别怎么收 / 取一个出来练」说明；空态和分组逻辑保留。
- `user-information.spec.ts` 的收藏用例新增 tab 断言：默认视频区可见，切到原句后句子区可见且视频区卸载，再切回；该 spec **11 passed**。
- `design-rollout.spec.ts` 的「收藏句子后回看」用例补了先切「原句」tab 的一步；该 spec 依赖 testing 后端，本轮未复跑（未执行）。

### 通知页收敛为单列列表（V-20）

- 删除类型筛选 tab、「最近通知」分区标题、底部「通知设置」预览块与右栏「未读统计 / 什么时候会收到」，正文只剩设计里的单列未读列表。
- 页头按设计提供「通知设置」（去 `profile?tab=settings`）与「全部标为已读（N）」（无未读时禁用为「全部已读」）。
- 偏好读取与 tab 计数请求一并移除：进页面从 1 次未读计数 + 1 次列表请求减为 2 个请求，不再额外拉 preferences/page_size=100。
- `user-information.spec.ts` 新增通知页用例：断言页头两个操作、列表内容存在，且类型 tab/最近通知/未读统计均不再出现；该 spec **12 passed**。
- `npm run check` 通过；`npm run test:unit` 332 passed。

### e2e 全量复跑（chromium，testing 后端）

- 停 dev 后端，用 `ENV=testing` + `DATABASE_URL=...seeword_e2e_full` + 强 `JWT_SECRET` + `SMS_DEV_FAKE_ENABLED=true` 起 :8000；`alembic upgrade head` 到 `q8r9s0t1u2v3`、`seed_e2e.py` 播种后执行 `npx playwright test --project=chromium`。
- 结果：**203 项 → 130 passed / 10 failed / 63 skipped**（上一轮基线 132/6/63）。
- 6 条失败仍是已知 fixture 数据不足：home-feed 真实数据配比、library-persistence、listening ×2、ui-review 239 词队列、vocabulary-exam 46 题长卷。
- 另 4 条（avatar、design-rollout 的搜索/周报/注册）单独复跑均通过：`design-rollout.spec` 单跑 11 passed / 1 skipped，`avatar.spec` 1 passed，判定为全量并发下的环境抖动，不是本轮前端改动的回归。
- 随后已停 testing 后端、恢复 dev 后端（`:8000`，environment=development）并还原 e2e 改写的截图；本轮未改任何门禁或基线。

### 学习记录补「最近观看 / 最近练习 / 词汇进展」卡（V-19）

- 统计数字已在此前放进描边卡；本轮按设计在记录列表上方补三张卡：最近观看（缩略图 + 进度 + 继续）、最近练习（最近一套试卷/答对数 + 回看）、词汇进展（全部/今天到期/已掌握 + 去复习）。
- 同时删掉设计里没有的右栏「这些数字怎么算 / 从记录回到学习」，记录列表恢复整宽。
- 新增数据请求：`/exams/attempts?page_size=1` 与 `/vocabulary/stats`；失败时卡片显示空态，不阻塞记录列表。
- `user-information.spec.ts` 的历史用例改为只断言记录列表里的标题，并新增三张卡标题断言；整份 spec **12 passed**。
- `npm run check` 通过；`npm run test:unit` 332 passed。

### 观看页动作行统一为 ghost 文本按钮 + 分隔线（V-23）

- 「上一句 / 重听本句 / 下一句」从 outline/primary 改为 ghost 文本按钮，带图标；`SaveSentenceButton` 也从 outline 改为 text。
- 按设计把动作分成三组并用竖分隔线（上一句/重听/下一句 | 收藏 | 少一点辅助再听/继续播放）；蓝色实心不再出现在这一行，留给全站唯一主操作。
- 保留了产品特有的「少一点辅助再听」「继续播放」动作，但视觉语言与契约一致；未删除任何功能。
- `ui-review-fixes-mobile.spec.ts` 的主按钮对比度用例改到登录页的 primary 提交按钮上验证（观看页动作行已没有主按钮）；该用例 1 passed。
- watch 相关 e2e：`watch-desktop-stage` + `watch-baseline-mobile` **17 passed**；`npm run check` 通过；`npm run test:unit` 332 passed。

### 首页 feed 间距/标题对齐，并复核视觉审计状态（V-11）

- `.home-video-feed` 的上间距从 22.4px 改为设计值 38px（`2.375rem`），「继续发现」标题从 20px 改为 18px；`home-feed.spec` 7 passed。
- 逐条复核 `frontend-visual.md` 的 30 条状态：V-01/04/05/06/07/09/11/15/16/26/28 依据当前代码与既有 e2e 证据标记为已修；V-25（侧栏折叠）、V-27（桌面词卡浮动锚定）、V-29（hover 保持 AA 的更深蓝）标记为「保留（有意差异）」。
- 仍开放的视觉项：V-12（hero 元信息/主 CTA 字段口径）、V-14（频道目录封面卡）、V-21（会员页 FAQ）。
- `npm run check` 通过；`npm run test:unit` 332 passed；未新增 e2e 失败。

### 会员页权益改图标行并补常见问题（V-21）

- 会员权益从勾选文本改为设计的「图标方块 + 标题 + 说明」四行（逐词点读 / 智能复习 / 词单与真题 / 多端同步）。
- 把原先挤在两栏里的「购买说明」卡移出网格，作为设计里的整段「常见问题」，并补「会自动续费吗」等真实口径（不自动续费、到期保留收藏与记录）。
- 新增 `user-information.spec.ts` 会员页用例：断言深色状态卡、图标权益、常见问题标题与续费问答；整份 spec **13 passed**。
- `npm run check` 通过；`npm run test:unit` 332 passed。

### 频道目录改封面卡与两列网格（V-14）

- `ChannelCard` 顶部改为设计中的 8:5 封面图（无频道图时退回最新视频缩略图，再退回首字母），名称/简介移到封面下方；保留学习方向、事实行、最近收录与订阅按钮。
- 频道目录与加载骨架从 3 列改为设计的两列网格；页头补「已订阅 N」与「去发现」。
- `design-rollout.spec` 的频道订阅用例 **1 passed**；`npm run check` 通过；`npm run test:unit` 332 passed。

### 首页 hero 元信息改为句数/主题/点赞/收藏（V-12）

- `FeaturedVideoCard` 移除 `VideoMetadata`（原片发布 / 本站播放量），元信息行按设计保留频道、逐句字幕句数、主题，并补点赞与收藏计数。
- 主 CTA 已是「从这句话开始」并带 `?t=`，次 CTA「看频道」保留。
- `home-editorial.spec.ts` 的 hero 用例改为断言不再出现「原片发布 / 次播放」、且出现「点赞 / 收藏」；该 spec **8 passed**。
- `npm run check` 通过；`npm run test:unit` 332 passed。

### BE-07 第一批：分页/会话响应契约 + 无 schema 端点清单

- 4 处裸 `PaginatedResponse` 改为具体 item 模型：admin users/orders/redemptions、catalog（新增 `AdminUserRow` / `AdminOrderRow` / `AdminRedemptionRow`）。
- `/videos/{id}/vocabulary` 从 `PaginatedResponse[dict]` 改为 `PaginatedResponse[VideoVocabularyItem]`。
- listening 6 条路由全部补 `response_model`：目录/会话列表用 `PaginatedResponse[...]`，创建/详情/交卷用 `ListeningSessionResponse`（`response_model_exclude_unset=True` 保留未提交会话不返回原文的既有契约），草稿用 `ListeningDraftResponse`。
- `test_response_contract.py` 新增两条断言：OpenAPI 不得出现裸 `PaginatedResponse`；所有 `PaginatedResponse_*` 的 `items` 必须有 `$ref`（不能再是 `dict`）。listening 类型单独钉住。
- 生成 `docs/audit-2026-10-24/no-response-model-endpoints.md`：剩余 **101** 条数据端点按前缀分组，供后续按清单继续。
- 后端全量测试：**1382 passed / 16 skipped**（新增 2 条契约测试）；ruff check/format 通过；mypy 与 `.mypy-baseline` 对比 42=42 无新增。
- 期间 dev 后端 reload 退出，已重启并核验 `/health` 200（DB/Redis ok）。

### BE-07 第二批：exams 响应契约

- `/exams` 改为 `ExamPaperListResponse`（`PaginatedResponse[ExamPaperRow]` + `available_years`）；`/exams/wrong`、`/exams/attempts` 改为 `PaginatedResponse[...]`；`/exams/stats` 与 `/exams/attempts/{id}` 用具体模型。
- 新增 schema：试卷行/分区、错题行、统计、作答行、作答详情行；日期字段用 `datetime`，由 FastAPI 统一输出 ISO。
- `test_response_contract.py` 新增 exams 四条路径的 OpenAPI 断言；剩余无 schema 端点从 101 降到 **96**，清单已重新生成。
- 后端全量测试与 mypy 复核见本轮提交；dev 后端因 `--reload` 在该 shell 下反复随文件变更退出，已改为不带 reload 的常驻进程，`/health` 200（DB/Redis ok）。
- `npm run check` 通过；`npm run test:unit` 332 passed。
- `design-rollout.spec.ts` 同时跑了 23 条，3 条因 dev 后端的短信验证码/注册限流失败（`验证码错误或已失效`、`注册过于频繁`），与本次改动无关；该 spec 需 testing 形态后端，未计入通过。

### BE-07 第三批：channels 与 discovery 订阅/收藏契约

- `/channels` 改 `PaginatedResponse[ChannelCard]`，`/channels/{slug}` 改 `ChannelDetailResponse`（含频道头、推荐起步视频、分页视频）；新增 `app/schemas/channel.py`，字段与 `_channel_public` + `channel_facts` 一一对应。
- discovery 7 条：`/subscriptions`（list）、`PUT/DELETE /subscriptions/{slug}`（`SubscriptionState`）、`/sentence-favorites`（分页 `SentenceFavoriteItem`）、`GET/PUT/DELETE /sentence-favorites/{id}`（`SentenceFavoriteStatus`）。
- `test_response_contract.py` 新增 channels 2 条与 discovery 订阅/收藏断言；剩余无 schema 端点从 96 降到 **87**。
- `ruff check/format` 通过；mypy 42=42 无新增；后端全量测试见本轮结果。

### BE-07 第四批：learning 继续观看/进度/统计契约

- `/learning/continue` 改 `ContinueLearningResponse`（video 卡片 + 进度/剩余 + 最近访问），`/learning/progress/{video_id}` 改 `WatchProgressResponse`，`/learning/stats/weekly` 改 `WeeklyStatsResponse`，`/learning/stats/event-distribution` 改 `list[EventDistributionItem]`。
- 新增 schema：继续观看项/响应、观看进度、每日分钟、周统计、事件分布；`last_accessed_at` 用 `datetime`。
- `test_response_contract.py` 新增 learning 4 条路径断言；无 schema 数据端点从 87 降到 **80**（并明确排除固定 410 的 heatmap/weekly-reports 兼容壳）。
- `ruff check/format` 通过；mypy 42=42 无新增；后端全量测试见本轮结果。

### BE-07 第五批：videos 点赞/搜索建议契约

- `/videos/{video_id}/like` 与 `/like-status` 改用 `VideoLikeToggleResponse` / `VideoLikeStatusResponse`，`/videos/search/suggest` 与 `/search/hot` 改用 `SearchSuggestionsResponse` / `HotSearchesResponse`。
- `test_response_contract.py` 新增 4 条断言；无 schema 数据端点从 80 降到 **76**。
- `ruff check/format` 通过；mypy 42=42 无新增；后端全量测试见本轮结果。

### BE-07 第六批：vocab-sets 词单/过筛契约

- 新增 `app/schemas/vocab_set.py`：collect 响应、词单卡、词单详情（含词行）、过筛状态、单词进度。
- 7 条路由补 `response_model`：`POST /vocab-sets`、`GET /vocab-sets`、`GET /{set_id}`、`GET /{set_id}/sieve`、`POST .../learned|unmark|sieve`。
- `test_response_contract.py` 新增 vocab-sets 断言；无 schema 数据端点从 76 降到 **68**（含排除固定 410 的 celebrate 兼容壳）。
- `ruff check/format` 通过；mypy 42=42 无新增；后端全量测试见本轮结果。

### BE-07 第七批：vocabulary 日常训练/练习/词操作契约

- 新增 `DailySessionResponse`（训练预览 + 新词/复习词 + totals/preferences/today）、`VocabularyPracticeResponse`（自适应练习项）、`VocabularyAddResponse`、`VocabularyReviewResponse`、`VocabularyMasteredResponse`、`VocabularyDeleteResponse`、`LearningWordsResponse`。
- 7 条 vocabulary 路由补 `response_model`：daily-session、practice、POST 收词、review、mastered、delete、words。
- `test_response_contract.py` 新增 vocabulary 断言（并让 `_schema` 支持 201）；无 schema 数据端点从 68 降到 **61**。
- `ruff check/format` 通过；mypy 42=42 无新增；后端全量测试见本轮结果。

### BE-07 第八批：browse 与 discovery 词表/学习元数据契约

- `GET /browse/categories` → `CategoriesResponse`，`GET /browse/featured` → `FeaturedVideosResponse`。
- `GET /discovery/dictionary` → `DictionaryResponse`（`PaginatedResponse[DictionaryWord]`，ECDICT 额外字段通过 `extra="allow"` 保留）；`GET /discovery/learning-metadata` → `dict[str, LearningMetadataItem]`（示例词/时间戳均建模）。
- `test_response_contract.py` 新增 4 条断言；无 schema 数据端点从 61 降到 **57**。
- `ruff check/format` 通过；mypy 42=42 无新增；后端全量测试见本轮结果。

### BE-07 第九批：discovery 自建词单 CRUD 契约

- 5 条 sets 路由补 `response_model`：创建（201）、重命名、删除、加词、移词，分别用 `SetCreatedResponse` / `SetRenamedResponse` / `SetDeletedResponse` / `SetWordsAddedResponse` / `SetWordRemovedResponse`。
- `test_response_contract.py` 新增 sets CRUD 断言；无 schema 数据端点从 57 降到 **52**。
- `ruff check/format` 通过；mypy 42=42 无新增；后端全量测试见本轮结果。

### BE-07 第十批：users/me/overview 契约 + 清单收敛

- `GET /users/me/overview` 改 `OverviewResponse`：user/streak/learning/this_week（含 7 天 daily）/words/videos/exams/library/membership 全部建模，复用 `VocabularyStatsResponse`。
- 清单明确排除：已退役固定 410 的 heatmap/weekly-reports、vocab-sets celebrate、shadowing 5 条，以及二进制下载端点（导出下载、exam-pdf 文件）。
- `test_response_contract.py` 新增 overview 断言；无 schema 数据端点从 52 降到 **44**。
- `ruff check/format` 通过；mypy 42=42 无新增；后端全量测试见本轮结果。

### BE-07 第十一批：recommendations / presence / unlocked-ids 契约

- `GET /recommendations/home` → `RecommendationHomeResponse`；`/recommendations/category/{tag}` → `RecommendationCategoryResponse`（分页字段 + tag + personalized）。
- `POST /presence/heartbeat` → `OkResponse`；`GET /videos/unlocked-ids` → `UnlockedVideoIdsResponse`（内测期恒空但保留形状）。
- `test_response_contract.py` 新增 4 条断言；无 schema 数据端点从 44 降到 **40**。
- `ruff check/format` 通过；mypy 42=42 无新增；后端全量测试见本轮结果。

### BE-07 第十二批：discovery 搜索 / 每日推荐契约

- `GET /discovery/search` → `SearchResponse`（videos/subtitles/words/channels 分组模型，路由用 `response_model_exclude_unset=True` 保持“只返回请求分组”的既有语义）。
- `GET /discovery/daily` → `DailyPreviewResponse`；`POST /discovery/daily/start` → `DailyStartResponse`（复用 `ExamAttemptCreateResponse`）；`GET /discovery/practice-summary` → `PracticeSummaryResponse`。
- `test_response_contract.py` 新增 4 条断言；无 schema 数据端点从 40 降到 **36**。
- `ruff check/format` 通过；mypy 42=42 无新增；后端全量测试见本轮结果。
