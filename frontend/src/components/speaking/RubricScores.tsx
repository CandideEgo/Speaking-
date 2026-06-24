"use client";

interface CriterionScore {
  id: string;
  name: string;
  score: number; // 0-100
  weight: number;
  feedback?: string | null;
}

interface RubricScoresProps {
  criteriaScores: CriterionScore[];
  overallScore?: number;
}

/**
 * Displays rubric-based criterion scores as horizontal bars with labels.
 * Used as an alternative to the 3-ring display when a rubric was applied.
 */
export function RubricScores({ criteriaScores, overallScore }: RubricScoresProps) {
  if (!criteriaScores || criteriaScores.length === 0) return null;

  return (
    <div className="mt-3 rounded-lg bg-navy p-4">
      {overallScore != null && (
        <div className="mb-3 flex items-center justify-between">
          <span className="text-xs text-white/40">综合评分</span>
          <span className="text-lg font-bold text-coral">{overallScore}</span>
        </div>
      )}

      <div className="space-y-3">
        {criteriaScores.map((c) => {
          const pct = Math.min(100, Math.max(0, c.score));
          const barColor = pct >= 80 ? "bg-green-400" : pct >= 60 ? "bg-yellow-400" : "bg-red-400";

          return (
            <div key={c.id}>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs font-medium text-white/70">
                  {c.name}
                  {c.weight !== 1 && <span className="ml-1 text-white/30">(x{c.weight})</span>}
                </span>
                <span className="text-xs font-bold text-white/90">{c.score}</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-white/10">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              {c.feedback && <p className="mt-1 text-[10px] text-white/40">{c.feedback}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
