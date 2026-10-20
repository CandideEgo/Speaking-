# 首页 / 频道页学习决策改版验证（2026-10-20）

本轮目标：降低选择成本、促进持续学习。首页回答「今天从哪里开始学」，频道列表回答「哪些来源值得长期跟」，频道详情回答「适不适合我、先学哪段、为什么订阅」。只改首页、频道列表与既有频道详情；不新增页面、不改推荐算法、不碰生产。

## 产品改动

### 首页

- **续学置顶**：有进行中记录时，第一屏第一条就是续学卡，显示真实视频名、真实进度（已看 %）、剩余时长与「继续学习 · 7:51」，链接带 `from=home&t=<真实秒数>`，落点与文案一致；「全部记录」进入历史。
- **唯一今日任务**：没有继续记录时，今日精选被组织成一张任务卡，包含中文学习收益、难度、真实片段时长、一句真实字幕与主按钮「听懂这段 · 49 秒」。主按钮跳片段起点并自动播放；「看完整视频 · 9:24」只做次级入口，封面不再重复播放按钮，0 互动数字不出现。
- **今天就能用**：只展示编辑场景（情境 / 英文 / 中文 / 原片定位），没有编辑场景时整块隐藏，不拿字幕原句硬凑；不做强制测验。
- **层级与发现流**：续学、今日任务、复习/找视频各有明确位置；复习卡和找视频卡压到右侧，窄屏自然落到任务下方。发现流卡片只留主题、难度、时长、一句中文收益和频道；字幕/词数/语速/长简介降到次级或省略，0 计数不展示；保留分类、难度、排序与加载。推荐流按视频 id 去重，修掉重复 key 与重复卡片。
- 无历史记录的新账号首屏直接变成「今天从这段开始」；接口失败保留任务卡并给出重试；无媒体时主按钮退回完整视频。

### 频道列表

- 顶部统计压成一行（23 个频道 · 49 段视频 · 已订阅 1 个），删除大块统计侧栏和实现说明，简介缩短。
- 新增学习方向筛选（发音 / 日常对话 / 访谈 / 科普 / 演讲 / 新闻 / 娱乐 / 体育 / 商业 / 音乐），方向来自后端配置，不在组件里写频道名分支。
- 搜索覆盖频道名、中文定位、学习方向与已收录视频标题；实测「发音」命中 Rachel's English、English with Lucy、mmmEnglish。无结果时提供清除搜索 / 看全部频道。
- 卡片统一展示身份（头像与缩略图分开）、中文定位、学习方向、有据可查的口音、难度区间、本站已收录段数；最新视频作为辅助信息，长标题截断可读；未知字段不补假数据。
- 「我的订阅」改为继续学习入口：真实显示最近收录/继续视频与时长，不再出现假的新增、未读或更新频率。列表与详情的订阅状态来自同一接口。

### 频道详情

- 首屏先给完整频道名、中文定位、学习方向、本站难度与「本站已收录 X 段」；原平台粉丝标注「抓取快照」，认证只写「原平台认证」，不混成 SeeWord 订阅人数/官方认证。
- 「推荐入门」只在真的存在 CEFR 分级视频时出现，并写明依据（全频道难度最低 · A2）；没有依据时只展示最新视频，不硬贴「入门」。
- 视频列表精简为紧凑行；订阅后收益只描述站内真实行为（出现在「我订阅的频道」、回看最近收录/继续未学内容、可取消），不承诺推送频率。
- 移动端推荐卡改横排紧凑布局，主 CTA 在 390×844 首屏内可见。

### 附带修复

- `ui/Image`：图片在 React 挂上 `onLoad` 之前就 `complete`（缓存命中/预取）时，原来会一直停在 `opacity-0`，首屏缩略图整块空白。现在挂载后按 `complete && naturalWidth` 主动对一次状态，并同步处理已失败的图片。

## 检查结果

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 前端门禁 | `npm run check` | 通过（design-system 4 条、session-writes 2 条、tsc、ESLint 0 error 3 既有 warning、Prettier） |
| 前端单测 | `npm run test:unit` | 23 文件 / 295 测试通过 |
| 首页 e2e（桌面） | `npx playwright test e2e/home-editorial.spec.ts e2e/home-continue-learning.spec.ts e2e/home-learning-stories.spec.ts e2e/home-feed.spec.ts --project=chromium --project=firefox` | 56 passed |
| 首页 e2e（手机） | 同上，`--project=mobile-chrome --project=mobile-iphone` | 28 passed |
| 频道后端 | `pytest tests/test_channel_learning.py tests/test_channels_api.py tests/test_discovery_api.py -q` | 49 passed |
| 后端全量 | `pytest tests/ -q` | 1242 passed / 8 failed；8 条全部在既有 `test_home_content_generation.py`（提示词版本 v2 与测试断言的 v1 不一致），属工作区里既有的首页编排功能，与本轮首页/频道改动无关，未在收尾中改动 |

e2e 覆盖：续学唯一的最近记录与真实位置、无历史时任务成为主行动、任务卡中文收益/难度/真实片长/主次入口、场景只来自编辑内容、换主推不串旧场景、`editorial:null` 与接口失败兜底、无媒体退回完整视频、长标题/缺字段降级、1440/390/320 无横向溢出与主 CTA 可点、发现流筛选写 URL 且真的进请求、空结果与旧链接 307。

浏览器实测（1440×900、390×844）：首页、频道列表、Bob 频道详情 console/pageerror 均为 0，`scrollWidth` 等于视口宽度，无横向溢出。截图见下。

## 数据限制（如实说明）

- 口音只在视频标题明确出现 American/British 时标注：本轮 23 个频道里只有 Rachel's English（美式）与 English with Lucy（英式）有证据；其余留空，不猜。
- 原平台粉丝数是抓取快照（来自最新视频的 `external_meta.channel.follower_count`），页面明确标注；与站内订阅无关。认证只表示原平台认证，不是 SeeWord 认证。
- 难度只使用站内已有 CEFR 等级；没有等级的频道不显示难度，推荐依据会退回「最新」而不是硬说「最低」。
- 现有分类器存在已知错标（如 WWE / House of Highlights / Jimmy Kimmel 被标成新闻/电影/演讲）。首页卡片按标题做展示层主题纠正，但站内存储的 `topic_tags` 与分类筛选仍可能有噪声，本轮没有重跑分类。
- 「全部频道」的 23 个频道、49 段视频、1 个订阅均来自本地开发库真实数据；没有为截图造频道、造进度或发布编排。

## 未执行 / 边界

- `home-editorial-full-loop.spec.ts`（后台生成→发布→替换→回退闭环）未运行：需要干净库，本地开发库已有已发布编排，本轮没有清库或伪造通过。
- 未部署生产、未跑生产 smoke、未清库、未改推荐算法或迁移。
- 后端全量套件中上述 8 条既有失败未修复；后端本轮只新增/调整频道与订阅相关测试。

## 截图（本地开发库真实数据）

- [首页 1440](evidence/home-design-refresh/final-home-1440.png)
- [首页 390](evidence/home-design-refresh/final-home-390.png)
- [频道列表 1440](evidence/home-design-refresh/final-channels-1440.png)
- [频道列表 390](evidence/home-design-refresh/final-channels-390.png)
- [频道详情 1440](evidence/home-design-refresh/final-channel-detail-1440.png)
- [频道详情 390](evidence/home-design-refresh/final-channel-detail-390.png)

新账号（无历史）首页与 `editorial:null` 兜底状态另见 `.debug-shots/redesign/`（未入库）：`home-desktop-new-user.png`、`home-mobile-new-user.png`、`home-desktop-fallback.png`。
