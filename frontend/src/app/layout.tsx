import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/common/ThemeProvider";
import { SidebarProvider } from "@/components/layout/SidebarProvider";
import { ThemedToaster } from "@/components/common/ThemedToaster";
import { AuthInitializer } from "@/components/common/AuthInitializer";

export const metadata: Metadata = {
  title: "SeeWord — 用真实视频学开口说英语",
  description: "粘贴视频链接，AI 生成双语字幕和口语练习，开口说英语。",
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
          <SidebarProvider>
            <AuthInitializer />
            {children}
            <ThemedToaster />
          </SidebarProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
