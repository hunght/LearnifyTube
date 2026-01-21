import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CalendarDays, BookOpen, Clock, Target, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface WeeklyStats {
  wordsLearned: number;
  cardsReviewed: number;
  watchMinutes: number;
  averageRetention: number;
  studyDays: number;
}

interface WeeklySummaryCardProps {
  stats: WeeklyStats;
}

export function WeeklySummaryCard({ stats }: WeeklySummaryCardProps): React.JSX.Element {
  const studyDaysPercent = (stats.studyDays / 7) * 100;
  const watchHours = Math.round((stats.watchMinutes / 60) * 10) / 10;

  const summaryItems = [
    {
      icon: BookOpen,
      label: "New Words",
      value: stats.wordsLearned,
      color: "text-primary",
      bgColor: "bg-primary/10",
    },
    {
      icon: CheckCircle2,
      label: "Cards Reviewed",
      value: stats.cardsReviewed,
      color: "text-green-600",
      bgColor: "bg-green-600/10",
    },
    {
      icon: Clock,
      label: "Watch Time",
      value: `${watchHours}h`,
      color: "text-blue-600",
      bgColor: "bg-blue-600/10",
    },
    {
      icon: Target,
      label: "Retention",
      value: `${stats.averageRetention}%`,
      color: "text-orange-600",
      bgColor: "bg-orange-600/10",
    },
  ];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <CalendarDays className="h-4 w-4 text-primary" />
          This Week&apos;s Summary
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Study Days Progress */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Study Days</span>
            <span className="font-medium">{stats.studyDays} / 7 days</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                studyDaysPercent >= 85
                  ? "bg-green-500"
                  : studyDaysPercent >= 50
                    ? "bg-yellow-500"
                    : "bg-orange-500"
              )}
              style={{ width: `${studyDaysPercent}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Mon</span>
            <span>Tue</span>
            <span>Wed</span>
            <span>Thu</span>
            <span>Fri</span>
            <span>Sat</span>
            <span>Sun</span>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3">
          {summaryItems.map((item) => (
            <div key={item.label} className={cn("rounded-lg p-3", item.bgColor)}>
              <div className="flex items-center gap-2">
                <item.icon className={cn("h-4 w-4", item.color)} />
                <span className="text-xs text-muted-foreground">{item.label}</span>
              </div>
              <div className={cn("mt-1 text-xl font-bold", item.color)}>{item.value}</div>
            </div>
          ))}
        </div>

        {/* Comparison with last week */}
        <div className="rounded-lg bg-muted/50 p-3 text-center text-sm">
          <span className="text-muted-foreground">
            {stats.cardsReviewed > 0
              ? "Keep up the momentum!"
              : "Start reviewing to build your streak!"}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
