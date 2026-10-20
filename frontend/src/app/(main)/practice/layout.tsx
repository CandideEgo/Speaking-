import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "英语练习 — SeeWord",
  description: "选择每日阅读与真题练习。",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
