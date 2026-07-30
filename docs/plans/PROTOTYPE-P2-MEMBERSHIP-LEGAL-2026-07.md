# 原型 P2 占位页实现计划 — 会员漏斗 + 法律页

## 背景与定位

- `prototypes/seeword/00-router.html` 标注 **6 个 "P2 占位" 页**（编号 17–22）+ 2 个未编号项（落地页 / 管理后台），均未实现（当前仅 00–16 存在）。
- 真实前端已有对应路由 `/pricing` `/checkout` `/upgrade` `/redeem` `/terms` `/privacy`，会员模型为 **「微信小商店购买 + 兑换码激活」**（非站内支付，ICP 合规，`payments_enabled=False`）。
- 原型职责（spec Part A 方法论）：**镜像真实流程/内容，但自由探索更优视觉方案**，确认后再迁移 Next.js。

## 范围

**核心交付（6 页，对应 router 编号 17–22）：**

| 文件 | 页面 | 镜像真实路由 | 复杂度 |
|---|---|---|---|
| `22-pricing.html` | 定价方案 | /pricing | 中 |
| `17-checkout.html` | 结账（中转） | /checkout | 低 |
| `18-upgrade.html` | 升级会员 / 小商店入口 | /upgrade | 中 |
| `19-redeem.html` | 兑换码激活 | /redeem | 高（状态机）|
| `20-terms.html` | 服务条款 | /terms | 中（排版）|
| `21-privacy.html` | 隐私政策 | /privacy | 中（排版）|

**可选追加：** `23-landing.html`（未登录落地页，router 未编号项）— 漏斗入口，建议一并做。
**排除：** 管理后台（router 标注「独立模块」，真实 admin 已存在，原型价值低，保持 muted）。

> 请在审批时确认：① 是否含落地页 ② 是否确要排除 admin。默认 = 6 核心 + landing，排除 admin。

## 设计系统（复用，不新造）

所有页复用 `03-home-b-seeword.html` + `01-login.html` 已确立的 token 与组件：
- SeeWord token（brand `#ff5a1f` / Inter / JetBrains Mono / 亮暗双主题 `html.dark`）
- 顶导航 `topbar`（logo + nav-links + 搜索 + 主题切换 + 通知 + avatar 菜单）；会员/法律页用精简顶栏
- 移动端底部 tab、`container-page` 容器
- 表单组件取自 `01-login`：`.input` / `.input-wrap` / `.field-error` / `.btn`（品牌橙 shimmer + loading + success 态）
- 主题切换 + auth 状态（`localStorage` `seeword_auth` / `seeword_user`，guest vs 登录态）

## 逐页方案

### 22-pricing.html（定价方案 · 漏斗起点）
- 页头：crumb「升级」+ 标题「选择适合你的计划」+ 副标题「免费开始，需要更多功能再升级」
- **合规提示条**：非经营性平台 / 不提供在线支付 / 微信小商店购买 + 兑换码激活（措辞对齐真实页）
- 唯一套餐卡：**Pro 月度 ¥9.9/月**，30 天/码可叠加；5 项权益（无限视频双语字幕 / AI 词汇注释 / SM-2 无限复习 / 考级词汇标注 / 创作者优先审核）；CTA「前往小商店购买」→ `18-upgrade`
- 功能对比表：Free vs Pro（6 行：每日观看/双语字幕/考级标注/AI注释/SM-2复习/优先审核）
- 底部：「已购买？兑换码激活」→ `19-redeem`
- 视觉探索：相比真实页极简单卡，原型用 hero 渐变 + 权益图标网格 + 对比表高亮 Pro 列

### 17-checkout.html（结账 · 中转）
- 居中卡：ShoppingBag 图标 +「本站不支持在线支付」+ 说明（前往微信小商店购买，购买后用兑换码激活）
- 双 CTA：「前往微信小商店」→ `18-upgrade` / 「使用兑换码激活」→ `19-redeem`
- 「返回定价页」→ `22-pricing`
- 视觉探索：居中卡片 + 合规盾牌图标 + 清晰双路径分流

### 18-upgrade.html（升级会员 / 小商店入口）
- 卡片：「开通 Pro 会员」+ 合规告知（ShieldCheck）+ 小商店入口按钮（带「即将开通」降级态占位）+「已购买？兑换码激活」→ `19-redeem`
- 三步指引：1.小商店购买 → 2.获取兑换码 → 3.本站激活（降低用户困惑）
- 底部法律链接：用户协议 → `20-terms` / 隐私政策 → `21-privacy`
- 「返回定价页」→ `22-pricing`

### 19-redeem.html（兑换码激活 · 状态机）
- 居中卡：Gift 图标 +「兑换 Pro 会员」+ 副标题「输入购买获得的兑换码，立即升级」
- **登录门禁**：未登录显示「请先登录或注册」提示（对齐真实页 ADR-0005 gating）
- 兑换码输入：mono / 自动大写 / `XXXX-XXXX-XX` 格式（maxLength 12）
- **状态机**：idle / loading（spinner）/ success（✓ Pro 已激活，有效期至 X）/ error（5 种文案：无效 / 已被使用 / 已被作废 / 已过期 / 已失效）
- 底部：「兑换码通过微信小商店购买后获得」
- 视觉探索：分格输入框（4-4-2）+ 成功动画 + 演示按钮（模拟各状态供预览，不连后端）

### 20-terms.html（服务条款）
- 左侧 TOC 目录（粘性）+ 右侧正文分节：总则 / 账户注册 / 会员服务 / 使用规范 / 知识产权 / 免责声明 / 争议解决 / 附则
- 排版优先：正文 16px / 1.8 行高，标题层级清晰，条款编号
- 视觉探索：阅读进度条 + 章节锚点高亮 + 暗色适配

### 21-privacy.html（隐私政策）
- 同 terms 结构：TOC + 分节：信息收集 / 使用 / 共享 / 保护 / Cookie / 未成年人 / 用户权利 / 变更 / 联系
- ICP 合规要素：手机号 + 短信验证码收集说明、**明确不存储支付信息**（因非站内支付）

### 23-landing.html（可选 · 落地页）
- 未登录入口：hero（品牌主张 + CTA 注册/登录）+ 功能展示 + 学习闭环图 + 社会证明 + Pro 引导 → `22-pricing`
- 视觉探索：大 hero + 滚动叙事 + 视频/词汇/练习三栏特性

## 跨页面一致性

- 顶栏「升级 Pro」入口：avatar 菜单 + 顶栏 Pro badge（登录态）
- 页脚法律链接：terms/privacy 互链 + 从 upgrade/pricing/checkout 可达
- auth 状态：guest 看到登录/注册引导；redeem 强制登录门禁
- 主题切换 + 移动端响应式 + 暗色适配全部覆盖
- 互链闭环：pricing ⇄ checkout ⇄ upgrade ⇄ redeem；terms/privacy 从会员页可达

## router 更新

- `00-router.html`：已实现的 P2 占位卡改为真实链接（去 `muted`、`tag-done`），更新 hero 统计（已实现数 +，P2 占位 −）
- admin 保持 muted（独立模块）

## ICP 合规对齐

- 全程「非经营性工具展示平台，不提供在线支付」措辞与真实页一致
- 不出现任何站内支付表单 / 价格计算；¥9.9/月 仅展示性
- 隐私页明确不存储支付信息

## 验证

- 浏览器逐页打开，亮/暗主题切换，移动端响应式
- 走通闭环：landing(可选) → pricing → checkout → upgrade → redeem（各状态）→ terms/privacy
- 链接无死链；auth 状态切换正常
- 纯 HTML 原型，不涉及 tsc/lint/构建

## 执行顺序

1. `22-pricing`（漏斗起点，确立会员页视觉基调）
2. `18-upgrade`（小商店入口）
3. `17-checkout`（中转）
4. `19-redeem`（表单 + 状态机，最复杂）
5. `20-terms` / `21-privacy`（法律，可并行）
6. `23-landing`（可选）
7. 更新 `00-router.html`
