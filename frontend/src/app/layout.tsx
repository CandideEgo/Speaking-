import type { Metadata } from "next";
import { Toaster } from "sonner";
import "./globals.css";
import Header from "@/components/Header";

export const metadata: Metadata = {
  title: "Speaking — 用真实视频学开口说英语",
  description: "粘贴视频链接，AI 生成双语字幕和口语练习，开口说英语。",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <Header />
        {children}
        <Toaster position="top-center" richColors />
      </body>
    </html>
  );
}