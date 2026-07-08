import type { Metadata } from "next";
import { MainLayoutInner } from "./MainLayoutInner";

export const metadata: Metadata = {
  title: "SeeWord — 用真实视频学英语",
  description:
    "官方精选英语学习视频，涵盖 TED 演讲、名人访谈、新闻、生活 Vlog 等多类内容，适合各个水平的学习者。AI 生成双语字幕与生词标注，SM-2 间隔复习。",
  openGraph: {
    title: "SeeWord — 用真实视频学英语",
    description: "官方精选英语学习视频，AI 生成双语字幕与生词标注。",
    type: "website",
    siteName: "SeeWord",
  },
};

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <MainLayoutInner>{children}</MainLayoutInner>;
}
