import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "浏览视频 — SeeWord",
  description:
    "浏览 YouTube 热门英语视频，按分类筛选 TED 演讲、名人访谈、新闻、生活 Vlog 等。一键开始口语练习。",
  openGraph: {
    title: "浏览视频 — SeeWord",
    description: "浏览 YouTube 热门英语视频，一键开始口语练习。",
  },
};

export default function BrowseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
