"use client";

import { Card } from "@/components/ui/Card";
import { isTeachingCard } from "@/lib/teaching";
import type { TeachingCard } from "@/types/teaching";

export function TeachingCards({ cards }: { cards: TeachingCard[] }) {
  return (
    <div className="space-y-4" aria-live="polite" aria-relevant="additions text">
      {cards.map((card, index) => {
        if (!isTeachingCard(card))
          return (
            <p key={`unknown-${index}`} role="status" className="text-copy text-muted">
              这张学习卡需要更新后查看，请重新读取会话。
            </p>
          );
        if (card.kind === "question") return null;
        return (
          <Card key={card.card_id} padding={4} className="min-w-0 space-y-2 break-words">
            {card.kind === "hint" && (
              <>
                <h3 className="text-copy font-semibold text-ink">提示 {card.payload.level}</h3>
                <p className="whitespace-pre-wrap text-copy leading-relaxed text-body">
                  {card.payload.text}
                </p>
              </>
            )}
            {card.kind === "analysis" && (
              <>
                <h3 className="text-copy font-semibold text-ink">
                  答案与解析 · {card.payload.correct_answer}
                </h3>
                <p className="whitespace-pre-wrap text-copy leading-relaxed text-body">
                  {card.payload.analysis.summary}
                </p>
                <dl className="space-y-2 text-copy text-body">
                  {Object.entries(card.payload.option_analyses).map(([option, text]) => (
                    <div key={option} className="flex gap-3">
                      <dt className="font-semibold text-ink">{option}</dt>
                      <dd>{text}</dd>
                    </div>
                  ))}
                </dl>
              </>
            )}
            {card.kind === "evidence" && (
              <>
                <h3 className="text-copy font-semibold text-ink">原文证据</h3>
                {card.payload.quotes.map((quote, i) => (
                  <blockquote
                    key={i}
                    className="whitespace-pre-wrap border-l-2 border-brand-500 pl-3 text-copy leading-relaxed text-body"
                    lang="en"
                  >
                    {quote.quote}
                  </blockquote>
                ))}
              </>
            )}
            {card.kind === "summary" && (
              <p className="text-copy text-body">
                本次教学已{card.payload.status === "abandoned" ? "结束" : "完成"}，保留了{" "}
                {card.payload.attempt_count} 次作答。
              </p>
            )}
            {card.kind === "status" && (
              <p className="whitespace-pre-wrap text-copy text-body">{card.payload.message}</p>
            )}
          </Card>
        );
      })}
    </div>
  );
}
