import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "浏览视频 — SeeWord",
  description:
    "浏览 YouTube 热门英语视频，按分类筛选 TED 演讲、名人访谈、新闻、生活 Vlog 等。点词即查，加入词库。",
  openGraph: {
    title: "浏览视频 — SeeWord",
    description: "浏览 YouTube 热门英语视频，点词即查，加入词库。",
  },
};

export default function BrowseLayout({ children }: { children: React.ReactNode }) {
  return children;
}
