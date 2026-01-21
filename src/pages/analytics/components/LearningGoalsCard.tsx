import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Target, Plus, CheckCircle2, Circle, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { trpcClient } from "@/utils/trpc";

interface Goal {
  id: string;
  title: string;
  target: number;
  current: number;
  unit: string;
  type: "daily" | "weekly" | "monthly";
}

const DEFAULT_GOALS: Goal[] = [
  {
    id: "daily-reviews",
    title: "Daily Reviews",
    target: 20,
    current: 0,
    unit: "cards",
    type: "daily",
  },
  {
    id: "weekly-words",
    title: "Learn New Words",
    target: 50,
    current: 0,
    unit: "words",
    type: "weekly",
  },
  { id: "weekly-watch", title: "Watch Time", target: 120, current: 0, unit: "min", type: "weekly" },
];

export function LearningGoalsCard(): React.JSX.Element {
  // Fetch current progress for goals
  const { data: dashboardStats } = useQuery({
    queryKey: ["learningStats", "dashboard"],
    queryFn: async () => trpcClient.learningStats.getDashboardStats.query(),
  });

  const { data: analyticsData } = useQuery({
    queryKey: ["learningStats", "analytics"],
    queryFn: async () => trpcClient.learningStats.getAnalytics.query(),
  });

  // Calculate goal progress
  const goals: Goal[] = React.useMemo(() => {
    const weeklyReviews = analyticsData?.weeklyStats.cardsReviewed ?? 0;
    const dailyReviews = Math.round(weeklyReviews / 7);
    const weeklyWords = analyticsData?.weeklyStats.wordsLearned ?? 0;
    const weeklyMinutes = dashboardStats?.watchTime.weekMinutes ?? 0;

    return [
      { ...DEFAULT_GOALS[0], current: dailyReviews },
      { ...DEFAULT_GOALS[1], current: weeklyWords },
      { ...DEFAULT_GOALS[2], current: weeklyMinutes },
    ];
  }, [dashboardStats, analyticsData]);

  const completedGoals = goals.filter((g) => g.current >= g.target).length;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Target className="h-4 w-4 text-primary" />
            Learning Goals
          </CardTitle>
          <Button variant="ghost" size="sm" className="h-7 text-xs" disabled>
            <Plus className="mr-1 h-3 w-3" />
            Add Goal
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Goals Progress */}
        <div className="space-y-3">
          {goals.map((goal) => {
            const progressPercent = Math.min(100, (goal.current / goal.target) * 100);
            const isCompleted = goal.current >= goal.target;

            return (
              <div key={goal.id} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    {isCompleted ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    ) : (
                      <Circle className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span className={cn(isCompleted && "text-green-600")}>{goal.title}</span>
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {goal.type}
                    </span>
                  </div>
                  <span className="text-muted-foreground">
                    {goal.current}/{goal.target} {goal.unit}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      isCompleted ? "bg-green-500" : "bg-primary"
                    )}
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Achievement Summary */}
        <div className="flex items-center justify-between rounded-lg bg-muted/50 p-3">
          <div className="flex items-center gap-2">
            <Trophy
              className={cn(
                "h-5 w-5",
                completedGoals === goals.length ? "text-yellow-500" : "text-muted-foreground"
              )}
            />
            <span className="text-sm">
              {completedGoals === goals.length
                ? "All goals completed!"
                : `${completedGoals}/${goals.length} goals achieved`}
            </span>
          </div>
          {completedGoals === goals.length && (
            <span className="text-xs text-yellow-600">Great job!</span>
          )}
        </div>

        {/* Tip */}
        <p className="text-center text-xs text-muted-foreground">
          Consistent daily practice leads to better long-term retention.
        </p>
      </CardContent>
    </Card>
  );
}
