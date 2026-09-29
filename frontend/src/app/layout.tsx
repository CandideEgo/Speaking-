import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/common/ThemeProvider";
import { ThemedToaster } from "@/components/common/ThemedToaster";
import { AuthInitializer } from "@/components/common/AuthInitializer";

export const metadata: Metadata = {
  title: "SeeWord — 用真实视频学开口说英语",
  description: "粘贴视频链接，AI 生成双语字幕和口语练习，开口说英语。",
};

// viewport-fit=cover 让页面铺到刘海 / Home indicator 下（iOS 26 起 Safari 的浮动底栏
// 也要求它才给透明底色）；铺出去的安全区由 app 壳的 env() padding 留回（见 MainLayoutInner）。
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// 首绘前根据 localStorage / 系统偏好设置 .dark，避免暗色用户首屏闪烁（FOUC）。
// 与 hooks/useTheme.ts 的解析逻辑保持一致。
const themeInitScript = `try{var t=localStorage.getItem("theme");if(t==="dark"||(t!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches)){document.documentElement.classList.add("dark")}}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <ThemeProvider>
          <AuthInitializer />
          {children}
          <ThemedToaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
