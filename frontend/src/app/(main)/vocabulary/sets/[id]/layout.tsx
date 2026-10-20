import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "词单学习 — SeeWord",
  description: "查看词单与学习进度。",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
