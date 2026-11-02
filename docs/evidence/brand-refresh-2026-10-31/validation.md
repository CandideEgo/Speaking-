# 品牌图标与默认头像替换验证

- 生成方式：内置 image_gen；完整提示词见 prompts.json，合成预览见 asset-preview.png。
- 品牌素材：frontend/public/logo.png（128px）、logo-large.png（1024px）、project-icon.svg（内嵌同一标志的 PNG，保留原有 SVG 入口）；标志保留透明通道。
- 默认头像：frontend/public/default-avatar-male.webp、default-avatar-female.webp（各 512px）。
- 应用图标：frontend/src/app/icon.png、icon-192.png、icon-512.png、apple-icon.png、favicon.ico（16/32/48/64px 四帧）。
- 站内接入：用户侧栏、手机顶栏、公开页、认证页、协议页及管理端共用品牌图标；移除旧图标的额外圆角裁切。默认头像不再执行深色反相。

## 已通过

- npm run check：设计系统门禁、会话写入门禁、TypeScript、ESLint、Prettier 全部通过。首次失败源于 .next/dev/types 中的路由类型；使用 Next.js typegen 重新生成后完整门禁通过，没有修改检查器。
- npx vitest run src/lib/avatar.test.ts：9 项通过。沙箱首次运行受临时文件重命名权限影响，完整本机环境重跑通过。
- git diff --check：通过。
- 实际运行本地前后端并使用 ego-browser 登录测试账号，操作性别和主题按钮。男女头像 × 浅深主题 × 1440px/390px 共 8 组检查，品牌和头像均已加载、filter 为 none、无横向溢出，见 browser-checks.json。
- 检查 PNG/WebP 尺寸、标志透明通道与 ICO 的四帧结构。

## 验证限制

- Playwright 的 avatar.spec.ts 与 public-layout.spec.ts 未执行到业务断言：默认 headless shell 缺失且下载中断；完整 Chromium 已下载，使用同版本 Chromium 的无界面模式仍在启动时出现 spawn UNKNOWN。临时浏览器选择配置已删除，原有配置与断言未修改。
- ego-browser 的 Page.captureScreenshot（包括原始 CDP 截图）超时，未生成页面截图；上述浏览器记录是实际 DOM、资源加载与计算样式检查，不是截图验收。asset-preview.png 是实际交付素材的合成预览。
