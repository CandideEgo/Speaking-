import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "首次引导 — SeeWord",
  description: "三步设好学习起点：当前水平、目标考试、兴趣分类与每日学习节奏。",
};

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
