import type { Metadata } from "next";
import { MainLayoutInner } from "./MainLayoutInner";

export const metadata: Metadata = {
  title: "SeeWord — 用真实视频学英语",
  description: "接着上次的视频，复习词汇，开始今天的英语练习。",
};

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return <MainLayoutInner>{children}</MainLayoutInner>;
}
