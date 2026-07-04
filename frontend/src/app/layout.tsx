import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/common/ThemeProvider";
import { SidebarProvider } from "@/components/layout/SidebarProvider";
import { ThemedToaster } from "@/components/common/ThemedToaster";
import { AuthInitializer } from "@/components/common/AuthInitializer";

export const metadata: Metadata = {
  title: "Speaking — 用真实视频学开口说英语",
  description: "粘贴视频链接，AI 生成双语字幕和口语练习，开口说英语。",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body>
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
