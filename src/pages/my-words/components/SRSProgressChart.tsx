import React, { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  BarChart3,
  Calendar,
  TrendingUp,
  Target,
  Sparkles,
  BookOpen,
  GraduationCap,
} from "lucide-react";
import type { Flashcard } from "@/api/db/schema";

interface SRSProgressChartProps {
  flashcards: Flashcard[];
}

export function SRSProgressChart({ flashcards }: SRSProgressChartProps): React.JSX.Element {
  const stats = useMemo(() => {
    if (!flashcards.length) {
      return {
        total: 0,
        newCards: 0,
        learning: 0,
        graduated: 0,
        masteryRate: 0,
        averageInterval: 0,
        intervalDistribution: [] satisfies { label: string; count: number; color: string }[],
        upcomingReviews: [] satisfies { label: string; count: number }[],
      };
    }

    const now = new Date();
    const newCards = flashcards.filter((c) => (c.reviewCount ?? 0) === 0);
    const learning = flashcards.filter((c) => (c.reviewCount ?? 0) > 0 && (c.interval ?? 0) <= 21);
    const graduated = flashcards.filter((c) => (c.interval ?? 0) > 21);

    // Average interval for reviewed cards
    const reviewedCards = flashcards.filter((c) => (c.reviewCount ?? 0) > 0);
    const avgInterval =
      reviewedCards.length > 0
        ? reviewedCards.reduce((sum, c) => sum + (c.interval ?? 0), 0) / reviewedCards.length
        : 0;

    // Interval distribution
    const intervalBuckets = [
      { label: "New", min: -1, max: 0, color: "bg-blue-500", count: 0 },
      { label: "1 day", min: 0, max: 1, color: "bg-red-500", count: 0 },
      { label: "2-6 days", min: 2, max: 6, color: "bg-orange-500", count: 0 },
      { label: "1-2 weeks", min: 7, max: 14, color: "bg-yellow-500", count: 0 },
      { label: "2-4 weeks", min: 15, max: 28, color: "bg-green-500", count: 0 },
      { label: "1+ month", min: 29, max: Infinity, color: "bg-emerald-600", count: 0 },
    ];

    flashcards.forEach((card) => {
      const interval = card.interval ?? 0;
      const reviewCount = card.reviewCount ?? 0;

      if (reviewCount === 0) {
        intervalBuckets[0].count++;
      } else {
        for (let i = 1; i < intervalBuckets.length; i++) {
          if (interval >= intervalBuckets[i].min && interval <= intervalBuckets[i].max) {
            intervalBuckets[i].count++;
            break;
          }
        }
      }
    });

    // Upcoming reviews (next 7 days)
    const upcoming = [
      { label: "Today", count: 0 },
      { label: "Tomorrow", count: 0 },
      { label: "Next 3 days", count: 0 },
      { label: "This week", count: 0 },
    ];

    flashcards.forEach((card) => {
      if (!card.nextReviewAt) return;
      const reviewDate = new Date(card.nextReviewAt);
      const diffDays = Math.floor((reviewDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      if (diffDays <= 0) upcoming[0].count++;
      else if (diffDays === 1) upcoming[1].count++;
      else if (diffDays <= 3) upcoming[2].count++;
      else if (diffDays <= 7) upcoming[3].count++;
    });

    return {
      total: flashcards.length,
      newCards: newCards.length,
      learning: learning.length,
      graduated: graduated.length,
      masteryRate: flashcards.length > 0 ? (graduated.length / flashcards.length) * 100 : 0,
      averageInterval: avgInterval,
      intervalDistribution: intervalBuckets,
      upcomingReviews: upcoming,
    };
  }, [flashcards]);

  if (stats.total === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-8 text-center">
          <BarChart3 className="mb-2 h-8 w-8 text-muted-foreground" />
          <p className="text-muted-foreground">Add some flashcards to see your learning progress</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Mastery Progress */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Target className="h-4 w-4 text-primary" />
            Learning Progress
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Progress bar showing distribution */}
          <div className="space-y-2">
            <div className="flex h-4 w-full overflow-hidden rounded-full bg-muted">
              {stats.newCards > 0 && (
                <div
                  className="bg-blue-500 transition-all"
                  style={{ width: `${(stats.newCards / stats.total) * 100}%` }}
                  title={`New: ${stats.newCards}`}
                />
              )}
              {stats.learning > 0 && (
                <div
                  className="bg-yellow-500 transition-all"
                  style={{ width: `${(stats.learning / stats.total) * 100}%` }}
                  title={`Learning: ${stats.learning}`}
                />
              )}
              {stats.graduated > 0 && (
                <div
                  className="bg-green-500 transition-all"
                  style={{ width: `${(stats.graduated / stats.total) * 100}%` }}
                  title={`Graduated: ${stats.graduated}`}
                />
              )}
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <Sparkles className="h-3 w-3 text-blue-500" />
                <span>New ({stats.newCards})</span>
              </div>
              <div className="flex items-center gap-1">
                <BookOpen className="h-3 w-3 text-yellow-500" />
                <span>Learning ({stats.learning})</span>
              </div>
              <div className="flex items-center gap-1">
                <GraduationCap className="h-3 w-3 text-green-500" />
                <span>Mastered ({stats.graduated})</span>
              </div>
            </div>
          </div>

          {/* Mastery Rate */}
          <div className="space-y-1">
            <div className="flex justify-between text-sm">
              <span>Mastery Rate</span>
              <span className="font-medium">{stats.masteryRate.toFixed(1)}%</span>
            </div>
            <Progress value={stats.masteryRate} className="h-2" />
          </div>

          {/* Average Interval */}
          <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
            <span className="text-sm text-muted-foreground">Avg. Interval</span>
            <span className="font-medium">{stats.averageInterval.toFixed(1)} days</span>
          </div>
        </CardContent>
      </Card>

      {/* Interval Distribution */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <TrendingUp className="h-4 w-4 text-primary" />
            Interval Distribution
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {stats.intervalDistribution.map((bucket) => {
              const percentage = stats.total > 0 ? (bucket.count / stats.total) * 100 : 0;
              return (
                <div key={bucket.label} className="flex items-center gap-2">
                  <div className="w-20 shrink-0 text-xs text-muted-foreground">{bucket.label}</div>
                  <div className="flex-1">
                    <div className="h-5 w-full overflow-hidden rounded bg-muted">
                      <div
                        className={`h-full ${bucket.color} transition-all`}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                  <div className="w-8 shrink-0 text-right text-xs font-medium">{bucket.count}</div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Upcoming Reviews */}
      <Card className="md:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Calendar className="h-4 w-4 text-primary" />
            Upcoming Reviews
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            {stats.upcomingReviews.map((period) => (
              <div
                key={period.label}
                className="flex-1 rounded-lg border bg-muted/30 p-3 text-center"
              >
                <div className="text-2xl font-bold">{period.count}</div>
                <div className="text-xs text-muted-foreground">{period.label}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
