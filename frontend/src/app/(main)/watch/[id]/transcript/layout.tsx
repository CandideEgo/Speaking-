import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "全文文稿 — SeeWord",
  description: "整段视频的逐句字幕与译文：可逐句回看、按生词定位。",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
