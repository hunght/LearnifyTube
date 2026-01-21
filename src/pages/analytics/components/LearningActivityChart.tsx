import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity } from "lucide-react";
import { cn } from "@/lib/utils";

interface DailyActivity {
  date: string;
  reviews: number;
  newWords: number;
  watchMinutes: number;
}

interface LearningActivityChartProps {
  data: DailyActivity[];
}

export function LearningActivityChart({ data }: LearningActivityChartProps): React.JSX.Element {
  // Get last 14 days of data, filling in missing days with zeros
  const last14Days = React.useMemo(() => {
    const result: DailyActivity[] = [];
    const today = new Date();
    const dataMap = new Map(data.map((d) => [d.date, d]));

    for (let i = 13; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split("T")[0];
      result.push(
        dataMap.get(dateStr) ?? {
          date: dateStr,
          reviews: 0,
          newWords: 0,
          watchMinutes: 0,
        }
      );
    }
    return result;
  }, [data]);

  // Calculate max for scaling
  const maxActivity = Math.max(...last14Days.map((d) => d.reviews + d.newWords), 1);

  // Format date for display
  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", { weekday: "short" }).slice(0, 2);
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <Activity className="h-4 w-4 text-primary" />
          Learning Activity (Last 14 Days)
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Chart */}
        <div className="flex h-48 items-end justify-between gap-1">
          {last14Days.map((day, idx) => {
            const totalActivity = day.reviews + day.newWords;
            const heightPercent = (totalActivity / maxActivity) * 100;
            const reviewPercent = totalActivity > 0 ? (day.reviews / totalActivity) * 100 : 0;
            const isToday = idx === last14Days.length - 1;

            return (
              <div key={day.date} className="group relative flex flex-1 flex-col items-center">
                {/* Tooltip */}
                <div className="pointer-events-none absolute -top-16 left-1/2 z-10 -translate-x-1/2 scale-0 rounded bg-popover px-2 py-1 text-xs shadow-md transition-transform group-hover:scale-100">
                  <div className="whitespace-nowrap font-medium">
                    {new Date(day.date).toLocaleDateString()}
                  </div>
                  <div className="text-muted-foreground">
                    {day.reviews} reviews, {day.newWords} new
                  </div>
                </div>

                {/* Bar */}
                <div
                  className={cn(
                    "w-full rounded-t transition-all",
                    isToday ? "ring-2 ring-primary ring-offset-1" : ""
                  )}
                  style={{ height: `${Math.max(heightPercent, 4)}%` }}
                >
                  {/* Review portion (bottom) */}
                  <div
                    className="w-full rounded-t bg-primary/70"
                    style={{ height: `${reviewPercent}%` }}
                  />
                  {/* New words portion (top) */}
                  <div
                    className="w-full bg-green-500/70"
                    style={{ height: `${100 - reviewPercent}%` }}
                  />
                </div>

                {/* Day label */}
                <span
                  className={cn(
                    "mt-1 text-[10px] text-muted-foreground",
                    isToday && "font-bold text-primary"
                  )}
                >
                  {formatDate(day.date)}
                </span>
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="mt-4 flex justify-center gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <div className="h-3 w-3 rounded bg-primary/70" />
            <span>Reviews</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="h-3 w-3 rounded bg-green-500/70" />
            <span>New Words</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
