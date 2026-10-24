# SeeWord 全站设计规范

以用户提供的设计导出为视觉依据，保留真实产品的数据、鉴权与学习能力。
实际 token 数值的唯一事实源是 frontend/src/app/globals.css 与 user-ui.css；组件使用规则见 frontend/DESIGN.md。

## 视觉规范

- 白色主画布、浅灰分区、近黑正文、蓝色强调。已有 dark 变量保持对称；内容卡不加装饰性阴影。
- 系统字体；caption/meta/copy/copy-lg/title/display-sm/display 为唯一字号阶梯；数字使用 tabular-nums。
- 4px 间距基准，区块间 24–32px，卡内 16–24px。圆角 sm/md/lg/pill，浮层才使用阴影。
- 桌面左侧导航 + 56px 顶栏；手机顶栏与五项底部导航。sm=640、md=768、lg=1024、xl=1280；内容依可用空间折叠。
- 视频缩略图固定 16:9，频道头像圆形，封面失效使用公共 Image fallback。

## 公共组件

- 页面标题 PageHeader；操作 Button/LinkButton；筛选 TabPills；容器 Card。
- 页面与分区标题下不展示小字导语、解释副标题。只保留标题、真实频道简介/视频名/统计与必要的操作反馈。
- 视频卡 VideoCard/HomeFeedCard；频道卡 ChannelCard；视频数据 VideoMetadata/VideoStats。
- 加载 Skeleton/VideoCardSkeleton；无数据 EmptyState；请求失败 ErrorState + 重试；错误提示 toastApiError。
- 所有数量只使用 lib/format.formatCount（utils 与 formatViews 兼容转发）；中文 万/亿，英文 K/M/B。未知不填 0，真实 0 必须展示。
- 播放量明确为本站播放，不混用 YouTube 统计。日期优先原片 upload_date，然后本站 published_at/created_at，并标明日期口径。

## 页面布局

- 首页：继续观看 → 精选与学习右栏 → 筛选与视频网格。
- 观看：播放器与逐句学习为中心；标题、本站统计、频道订阅和简介邻近播放器，推荐在下方；手机保持本句操作与底栏不遮挡。
- 频道：头像、简介、本站订阅数、收录数与本站总播放；视频使用公共卡。
- 搜索：查询、类型筛选、横向视频结果及原句定位，状态与普通列表一致。
- 个人内容：真实收藏/历史/订阅，空状态引导浏览，不初始化原型示例数据。
- 听力：素材选择、片段播放器、作答、提交、原句与解析、结果；断点自动保存，已提交结果不可被重复计入。

## YouTube WebSearch 参考结论

检索日期：2026-10-23。采用内容优先的层级，不照搬红色品牌或无关功能。

- [YouTube 首页设计](https://blog.youtube/news-and-events/introducing-fresh-new-look-for-youtube/)：大缩略图、清楚标题、频道身份、主题筛选；本产品采用 16:9 网格并保留难度/双语标签。
- [YouTube 设计语言](https://blog.youtube/inside-youtube/youtube-ambient-color-mode-visual-language-redesign/)：圆角随元素大小变化，视频承担视觉色彩；本产品统一圆角与克制边框。
- [观看页与交互](https://blog.youtube/news-and-events/an-updated-look-and-feel-for-youtube/)：播放器优先、常用操作收敛、高对比订阅与精确定位；本产品保留逐句跳转、循环与点词学习。
- [搜索结果](https://blog.youtube/news-and-events/next-phase-searching-youtube/)：可定位到具体片段；本产品原句结果直接跳到字幕时间。

## 验收

每页 390×844 与 1440×900 实际截图。最终补查 360/430/600/820/1024/1366/1920，无横向溢出、无脚本错误；运行现有门禁、单测、相关后端与端到端测试，不放宽门禁。
