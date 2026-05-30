'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { getToken } from '@/lib/api';
import {
  ArrowRight,
  Check,
  Mic,
  Brain,
  MessageCircle,
  BarChart3,
  Youtube,
  Subtitles,
  Sparkles,
} from 'lucide-react';

const features = [
  { icon: Youtube, title: '粘贴即学', desc: '粘贴任意 YouTube 视频链接，AI 自动下载、提取字幕、双语翻译，几分钟即可开始学习。' },
  { icon: Subtitles, title: '同步双语字幕', desc: '中英双语字幕与视频同步播放，点击任意单词即可查看释义和发音，语法点自动标注。' },
  { icon: Mic, title: '口语跟读', desc: '选中任意句子进行跟读，AI 将你的发音与原声对比，从准确度、流利度、完整度三个维度打分。' },
  { icon: Brain, title: 'AI 学习教练', desc: 'AI 全程追踪学习轨迹，根据你的水平智能推荐内容，薄弱环节定向加强，内置间隔复习系统。' },
  { icon: MessageCircle, title: '真实语境', desc: '美剧片段、TED 演讲、旅行 Vlog、求职面试——在真正需要用英语的场景里学习。' },
  { icon: BarChart3, title: '可视化进步', desc: '学习面板展示跟读次数、词汇增长、准确率趋势，每一点进步都看得见。' },
];

const steps = [
  { step: '01', title: '粘贴视频链接', desc: '复制你感兴趣的任何英文视频链接。美剧片段、TED 演讲、YouTube Vlog，你想看什么就学什么。' },
  { step: '02', title: 'AI 自动处理', desc: '系统自动提取字幕、智能翻译、标注语法、评估难度，1-2 分钟即可完成。' },
  { step: '03', title: '开口练习', desc: '边看边学，逐句跟读，AI 实时给出发音反馈。在真实语境中，自然地开口说英语。' },
];

const faqs = [
  { q: '和 Language Reactor 有什么区别？', a: 'Language Reactor 主要是被动观看加双语字幕。Speaking 在此基础上增加了主动口语练习：AI 逐句打分、发音纠正、间隔复习，形成完整的学习闭环。' },
  { q: '支持哪些视频平台？', a: 'YouTube 是主要平台，字幕质量最高。B 站支持正在开发中。任何有英文字幕的平台理论上都可使用。' },
  { q: '试用结束后呢？', a: '试用期 3 天后自动转为 ¥39/月。可随时在设置中取消，无违约金。' },
  { q: '适合什么英语水平？', a: '从 A1（零基础）到 C1（高级）均可使用。AI 会自动评估视频难度，你也可以手动按 CEFR 等级筛选。' },
];

export default function HomePage() {
  const [loggedIn, setLoggedIn] = useState(false);
  useEffect(() => { setLoggedIn(!!getToken()); }, []);

  return (
    <main className="min-h-screen">
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-slate-50 to-white pt-32 pb-20">
        <div className="container-page text-center">
          <div className="mx-auto max-w-3xl">
            <h1 className="text-5xl font-bold tracking-tight text-slate-900 sm:text-6xl lg:text-7xl">
              用真实视频
              <span className="mt-2 block bg-gradient-to-r from-brand-600 to-violet-600 bg-clip-text text-transparent">
                学开口说英语
              </span>
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-slate-600">
              粘贴任意你感兴趣的 YouTube 视频，AI 自动生成双语字幕、语法讲解和口语练习。用你喜欢的内容学英语，而不是课本。
            </p>
            <div className="mt-10 flex items-center justify-center gap-4">
              <Link
                href={loggedIn ? '/dashboard' : '/register'}
                className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-8 py-4 text-base font-semibold text-white shadow-lg shadow-brand-200 hover:bg-brand-700 transition-colors"
              >
                免费试用 <ArrowRight size={18} />
              </Link>
              <span className="text-sm text-slate-400">¥1 试用 3 天 · 随时取消</span>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="container-page py-24">
        <h2 className="text-center text-3xl font-bold text-slate-900">三步开始</h2>
        <p className="mx-auto mt-3 max-w-md text-center text-slate-500">无需准备，复制一个链接就够了。</p>
        <div className="mt-14 grid gap-8 md:grid-cols-3">
          {steps.map((s) => (
            <div key={s.step} className="group relative rounded-2xl border border-slate-200 p-8 hover:border-brand-200 hover:shadow-md transition-all">
              <span className="text-sm font-bold text-brand-500">{s.step}</span>
              <h3 className="mt-4 text-lg font-semibold text-slate-900">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="bg-slate-50 py-24">
        <div className="container-page">
          <h2 className="text-center text-3xl font-bold text-slate-900">不只是字幕</h2>
          <p className="mx-auto mt-3 max-w-md text-center text-slate-500">观看 + 开口 + AI 教练，完整的学习闭环。</p>
          <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div key={f.title} className="rounded-2xl border border-slate-200 bg-white p-6 hover:shadow-md transition-shadow">
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50">
                  <f.icon size={20} className="text-brand-600" />
                </div>
                <h3 className="mt-4 text-base font-semibold text-slate-900">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="container-page py-24">
        <h2 className="text-center text-3xl font-bold text-slate-900">简单定价</h2>
        <p className="mx-auto mt-3 max-w-md text-center text-slate-500">一个套餐，全部功能，无隐藏费用。</p>
        <div className="mx-auto mt-14 max-w-sm">
          <div className="rounded-2xl border-2 border-brand-600 bg-white p-8 shadow-lg shadow-brand-100">
            <div className="flex items-center gap-2">
              <Sparkles size={20} className="text-brand-600" />
              <span className="text-sm font-semibold text-brand-600">Pro</span>
            </div>
            <div className="mt-4">
              <span className="text-4xl font-bold text-slate-900">¥39</span>
              <span className="ml-1 text-sm text-slate-500">/月</span>
            </div>
            <p className="mt-1 text-sm text-slate-500">首月 ¥1 体验</p>
            <ul className="mt-6 space-y-3">
              {['无限次跟读练习', 'AI 发音评分', 'AI 语法标注', 'AI 智能出题', '个人词汇本 + 智能复习', '学习数据面板', '智能内容推荐'].map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm text-slate-700">
                  <Check size={16} className="mt-0.5 shrink-0 text-brand-600" />
                  {item}
                </li>
              ))}
            </ul>
            <Link href={loggedIn ? '/dashboard' : '/register'} className="mt-8 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white hover:bg-brand-700 transition-colors">
              开始试用 <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-slate-50 py-24">
        <div className="container-page">
          <h2 className="text-center text-3xl font-bold text-slate-900">常见问题</h2>
          <div className="mx-auto mt-14 max-w-2xl space-y-6">
            {faqs.map((f) => (
              <div key={f.q} className="rounded-xl border border-slate-200 bg-white p-6">
                <h3 className="font-semibold text-slate-900">{f.q}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{f.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="container-page py-24">
        <div className="rounded-3xl bg-gradient-to-br from-brand-600 to-violet-700 px-8 py-20 text-center">
          <h2 className="text-3xl font-bold text-white sm:text-4xl">今天就开始开口说</h2>
          <p className="mx-auto mt-4 max-w-lg text-brand-100">找一个你喜欢的视频，粘贴链接，说出你的第一句英语。</p>
          <Link href={loggedIn ? '/dashboard' : '/register'} className="mt-8 inline-flex items-center gap-2 rounded-xl bg-white px-8 py-4 text-base font-semibold text-brand-700 hover:bg-brand-50 transition-colors shadow-lg">
            免费试用 <ArrowRight size={18} />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-12">
        <div className="container-page">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-slate-900">Speaking</p>
              <p className="mt-1 text-xs text-slate-400">真实视频 · 真实口语</p>
            </div>
            <p className="text-xs text-slate-400">2026 Speaking. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </main>
  );
}
