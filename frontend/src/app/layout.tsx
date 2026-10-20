import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./user-ui.css";
import { ThemeProvider } from "@/components/common/ThemeProvider";
import { ThemedToaster } from "@/components/common/ThemedToaster";
import { AuthInitializer } from "@/components/common/AuthInitializer";
import { siteConfig } from "@/lib/siteConfig";

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.siteUrl),
  title: "SeeWord — 用真实视频学英语",
  description: "在真实视频里点词、看释义、跟读巩固；四六级词汇与阅读真题一起练。",
  robots: { index: false, follow: false },
  openGraph: {
    title: "SeeWord — 用真实视频学英语",
    description: "视频点词、逐句跟读、词汇复习与阅读练习。",
    siteName: "SeeWord",
    locale: "zh_CN",
    type: "website",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "SeeWord 英语学习" }],
  },
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
