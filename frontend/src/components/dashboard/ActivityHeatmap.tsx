"use client";

import type { DailyActivity } from "@/types";

interface ActivityHeatmapProps {
  activities: DailyActivity[];
  year: number;
  month: number;
}

export default function ActivityHeatmap({ activities, year, month }: ActivityHeatmapProps) {
  // Build a map for quick lookup
  const activityMap = new Map<string, DailyActivity>();
  activities.forEach((a) => activityMap.set(a.date, a));

  // Generate all days for the month
  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDayOfWeek = new Date(year, month - 1, 1).getDay(); // 0=Sun

  const days: (Date | null)[] = [];
  // Pad the beginning with nulls for the first week
  for (let i = 0; i < firstDayOfWeek; i++) {
    days.push(null);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    days.push(new Date(year, month - 1, d));
  }

  function getActivityLevel(day: Date): { level: number; tooltip: string } {
    const key = day.toISOString().split("T")[0];
    const activity = activityMap.get(key);
    if (!activity || activity.speaking_attempts === 0) {
      return { level: 0, tooltip: `${key}: 无活动` };
    }
    const count = activity.speaking_attempts;
    let level: number;
    if (count <= 1) level = 1;
    else if (count <= 3) level = 2;
    else if (count <= 5) level = 3;
    else level = 4;
    return {
      level,
      tooltip: `${key}: ${count} 次跟读${activity.goal_met ? " ✓" : ""}`,
    };
  }

  const levelColors = [
    "bg-cream-soft", // 0: no activity
    "bg-coral/20", // 1: low
    "bg-coral/40", // 2: medium
    "bg-coral/60", // 3: high
    "bg-coral", // 4: very high
  ];

  const dayLabels = ["日", "一", "二", "三", "四", "五", "六"];

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>少</span>
        {levelColors.map((color, i) => (
          <div key={i} className={`h-3 w-3 rounded-sm ${color}`} />
        ))}
        <span>多</span>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {/* Day headers */}
        {dayLabels.map((d) => (
          <div key={d} className="text-center text-[10px] text-muted-foreground pb-1">
            {d}
          </div>
        ))}
        {/* Day cells */}
        {days.map((day, i) => {
          if (!day) {
            return <div key={`empty-${i}`} className="h-5 w-5" />;
          }
          const { level, tooltip } = getActivityLevel(day);
          return (
            <div
              key={day.toISOString()}
              className={`h-5 w-5 rounded-sm ${levelColors[level]} cursor-default transition-colors hover:ring-1 hover:ring-coral/30`}
              title={tooltip}
            />
          );
        })}
      </div>
    </div>
  );
}
