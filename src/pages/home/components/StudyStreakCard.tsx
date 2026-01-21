import React from "react";
import { useNavigate } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Flame, Play, Clock, BookOpen } from "lucide-react";

type StudyStreakCardProps = {
  streak: number;
  dueCards: number;
  todayMinutes: number;
  isLoading?: boolean;
};

export function StudyStreakCard({
  streak,
  dueCards,
  todayMinutes,
  isLoading,
}: StudyStreakCardProps): React.JSX.Element {
  const navigate = useNavigate();

  const handleStartStudy = (): void => {
    navigate({ to: "/my-words" });
  };

  if (isLoading) {
    return (
      <Card className="border-2 bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-950/20 dark:to-amber-950/20">
        <CardContent className="p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 animate-pulse rounded-full bg-muted" />
              <div className="space-y-2">
                <div className="h-6 w-32 animate-pulse rounded bg-muted" />
                <div className="h-4 w-24 animate-pulse rounded bg-muted" />
              </div>
            </div>
            <div className="h-10 w-40 animate-pulse rounded bg-muted" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-2 bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-950/20 dark:to-amber-950/20">
      <CardContent className="p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          {/* Streak and stats */}
          <div className="flex items-center gap-6">
            {/* Streak badge */}
            <div className="flex items-center gap-3">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-orange-400 to-amber-500 text-white shadow-lg">
                <Flame className="h-8 w-8" />
              </div>
              <div>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-orange-600 dark:text-orange-400">
                    {streak}
                  </span>
                  <span className="text-sm font-medium text-muted-foreground">
                    {streak === 1 ? "day" : "days"}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">Study Streak</p>
              </div>
            </div>

            {/* Divider */}
            <div className="hidden h-12 w-px bg-border sm:block" />

            {/* Quick stats */}
            <div className="flex gap-6">
              <div className="flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-blue-500" />
                <div>
                  <p className="text-lg font-semibold">{dueCards}</p>
                  <p className="text-xs text-muted-foreground">Due cards</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-green-500" />
                <div>
                  <p className="text-lg font-semibold">{todayMinutes}min</p>
                  <p className="text-xs text-muted-foreground">Today</p>
                </div>
              </div>
            </div>
          </div>

          {/* CTA Button */}
          <Button
            onClick={handleStartStudy}
            size="lg"
            className="gap-2 bg-gradient-to-r from-orange-500 to-amber-500 text-white hover:from-orange-600 hover:to-amber-600"
          >
            <Play className="h-4 w-4" />
            Start Study Session
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
