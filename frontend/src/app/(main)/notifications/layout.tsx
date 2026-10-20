import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "通知 — SeeWord",
  description: "查看学习提醒与消息。",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
