"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { cn } from "@/lib/utils";
import SpeakingRecorder from "@/components/speaking/SpeakingRecorder";
import { Button } from "@/components/ui/Button";
import type { ButtonVariant } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { FullPageSpinner } from "@/components/common/Spinner";
import { PageHeader } from "@/components/ui/PageHeader";
import { BookOpen, Mic, ArrowRight } from "lucide-react";

// --- Mode cards data ---

const MODE_CARDS: {
  key: "read_aloud" | "free_speaking";
  title: string;
  subtitle: string;
  icon: typeof BookOpen;
  iconBg: string;
  iconColor: string;
  tag: string;
  tagClass: string;
  description: string;
  href: string | null;
  buttonText: string;
  buttonVariant: ButtonVariant;
}[] = [
  {
    key: "read_aloud" as const,
    title: "朗读",
    subtitle: "Read Aloud",
    icon: BookOpen,
    iconBg: "bg-brand-50",
    iconColor: "text-brand-500",
    tag: "推荐新手",
    tagClass: "bg-success-soft text-success",
    description:
      "跟着字幕朗读，录下自己的发音回放对比。最适合刚开始练习口语的学习者。",
    href: "/browse",
    buttonText: "选择视频",
    buttonVariant: "outline",
  },
  {
    key: "free_speaking" as const,
    title: "自由说",
    subtitle: "Free Speaking",
    icon: Mic,
    iconBg: "bg-warning-soft",
    iconColor: "text-warning",
    tag: "进阶挑战",
    tagClass: "bg-warning-soft text-warning",
    description:
      "不依赖字幕，自由发挥话题表达。录下自己的表达，回放检查发音和连贯性。",
    href: null,
    buttonText: "开始练习",
    buttonVariant: "primary",
  },
];

// --- Main Page ---

export default function SpeakingPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useRequireAuth();
  const [showRecorder, setShowRecorder] = useState(false);

  function handleModeClick(card: (typeof MODE_CARDS)[number]) {
    if (card.key === "free_speaking") {
      setShowRecorder(true);
    } else {
      router.push(card.href!);
    }
  }

  if (isLoading || !isAuthenticated) {
    return <FullPageSpinner />;
  }

  return (
    <main className="min-h-full bg-canvas">
      <div className="container-page py-8">
        {/* Page header */}
        <PageHeader
          crumb="口语练习"
          title="选择模式，开始练习"
          description="录下自己的发音，回放对比，逐步提升你的英语口语。"
        />

        {/* Free speaking recorder */}
        {showRecorder && (
          <Card className="mb-8 animate-fade-in">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Mic size={18} className="text-brand-500" />
                <h3 className="text-sm font-semibold text-ink">自由口语练习</h3>
              </div>
              <Button
                onClick={() => setShowRecorder(false)}
                variant="ghost"
                size="sm"
              >
                返回
              </Button>
            </div>
            <SpeakingRecorder />
          </Card>
        )}

        {/* Mode cards */}
        {!showRecorder && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-[18px]">
            {MODE_CARDS.map((card) => {
              const Icon = card.icon;
              return (
                <div
                  key={card.key}
                  className="bg-canvas rounded-lg p-7 border border-hairline cursor-pointer hover:-translate-y-1 hover:shadow-lift hover:border-transparent transition-all duration-150"
                  onClick={() => handleModeClick(card)}
                >
                  <div className="flex items-start justify-between mb-[18px]">
                    <div
                      className={cn(
                        "w-[46px] h-[46px] rounded-xl flex items-center justify-center",
                        card.iconBg,
                        card.iconColor,
                      )}
                    >
                      <Icon size={22} />
                    </div>
                    {card.tag && (
                      <span
                        className={cn(
                          "rounded-pill px-2.5 py-1 text-[11px] font-bold",
                          card.tagClass,
                        )}
                      >
                        {card.tag}
                      </span>
                    )}
                  </div>
                  <h3 className="!text-[20px] !font-bold !tracking-tight !m-0">
                    {card.title}
                  </h3>
                  <p className="text-xs text-muted-soft mt-0.5 mb-2.5">
                    {card.subtitle}
                  </p>
                  <p className="text-sm text-muted leading-relaxed !m-0 mb-5">
                    {card.description}
                  </p>
                  <Button
                    variant={card.buttonVariant}
                    size="nav"
                    iconRight
                    icon={ArrowRight}
                  >
                    {card.buttonText}
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
