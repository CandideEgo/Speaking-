import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "社区精选 — Speaking",
  description:
    "社区推荐的优质 YouTube 英语视频，涵盖 TED 演讲、名人访谈、新闻、教育学习、电影片段、科技等多类内容。",
  openGraph: {
    title: "社区精选 — Speaking",
    description: "社区推荐的优质 YouTube 英语视频，一键开始口语练习。",
  },
};

export default function CommunityLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
