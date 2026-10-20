import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "学习周报 — SeeWord",
  description: "回顾本周的学习积累。",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
