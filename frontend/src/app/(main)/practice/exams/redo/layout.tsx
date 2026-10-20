import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "错题重练 — SeeWord",
  description: "回顾错题，巩固薄弱环节。",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
