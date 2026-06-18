import type { Metadata } from 'next';
import { Sidebar } from '@/components/Sidebar';
import { TopBar } from '@/components/TopBar';

export const metadata: Metadata = {
  title: 'Speaking — 用真实视频学开口说英语',
  description:
    '官方精选英语学习视频，涵盖 TED 演讲、名人访谈、新闻、生活 Vlog 等多类内容，适合各个水平的学习者。AI 生成双语字幕和口语练习，让你开口说英语。',
  openGraph: {
    title: 'Speaking — 用真实视频学开口说英语',
    description:
      '官方精选英语学习视频，AI 生成双语字幕和口语练习，让你开口说英语。',
    type: 'website',
    siteName: 'Speaking',
  },
};

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-y-auto custom-scrollbar">
          {children}
        </main>
      </div>
    </div>
  );
}
