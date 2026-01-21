import React from "react";
import { useQuery } from "@tanstack/react-query";
import { trpcClient } from "@/utils/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3, Brain, Clock, TrendingUp, Calendar, Flame } from "lucide-react";
import { LearningActivityChart } from "./components/LearningActivityChart";
import { VocabularyGrowthChart } from "./components/VocabularyGrowthChart";
import { WeeklySummaryCard } from "./components/WeeklySummaryCard";
import { LearningGoalsCard } from "./components/LearningGoalsCard";

export default function AnalyticsPage(): React.JSX.Element {
  const { data: dashboardStats } = useQuery({
    queryKey: ["learningStats", "dashboard"],
    queryFn: async () => trpcClient.learningStats.getDashboardStats.query(),
  });

  const { data: streakData } = useQuery({
    queryKey: ["learningStats", "streak"],
    queryFn: async () => trpcClient.learningStats.getStreak.query(),
  });

  const { data: analyticsData } = useQuery({
    queryKey: ["learningStats", "analytics"],
    queryFn: async () => trpcClient.learningStats.getAnalytics.query(),
  });

  const totalWords = dashboardStats?.flashcards.total ?? 0;
  const masteredWords = dashboardStats?.flashcards.graduated ?? 0;
  const retentionRate = totalWords > 0 ? Math.round((masteredWords / totalWords) * 100) : 0;
  const totalWatchHours =
    Math.round(((dashboardStats?.watchTime.totalMinutes ?? 0) / 60) * 10) / 10;

  return (
    <div className="container mx-auto space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <BarChart3 className="h-6 w-6 text-primary" />
            Learning Analytics
          </h1>
          <p className="text-muted-foreground">
            Track your progress and optimize your learning journey
          </p>
        </div>
      </div>

      {/* Top Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Current Streak</CardTitle>
            <Flame className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{streakData?.currentStreak ?? 0} days</div>
            <p className="text-xs text-muted-foreground">
              Longest: {streakData?.longestStreak ?? 0} days
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Words Learned</CardTitle>
            <Brain className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalWords}</div>
            <p className="text-xs text-muted-foreground">
              {masteredWords} mastered ({retentionRate}%)
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Watch Time</CardTitle>
            <Clock className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalWatchHours}h</div>
            <p className="text-xs text-muted-foreground">
              {dashboardStats?.watchTime.weekMinutes ?? 0}min this week
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Retention Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{retentionRate}%</div>
            <p className="text-xs text-muted-foreground">Based on graduated cards</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid gap-6 lg:grid-cols-2">
        <LearningActivityChart data={analyticsData?.dailyActivity ?? []} />
        <VocabularyGrowthChart data={analyticsData?.vocabularyGrowth ?? []} />
      </div>

      {/* Summary and Goals Row */}
      <div className="grid gap-6 lg:grid-cols-2">
        <WeeklySummaryCard
          stats={{
            wordsLearned: analyticsData?.weeklyStats.wordsLearned ?? 0,
            cardsReviewed: analyticsData?.weeklyStats.cardsReviewed ?? 0,
            watchMinutes: dashboardStats?.watchTime.weekMinutes ?? 0,
            averageRetention: analyticsData?.weeklyStats.averageRetention ?? 0,
            studyDays: analyticsData?.weeklyStats.studyDays ?? 0,
          }}
        />
        <LearningGoalsCard />
      </div>

      {/* Monthly Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Calendar className="h-4 w-4 text-primary" />
            Monthly Overview
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-lg bg-muted/50 p-4 text-center">
              <div className="text-2xl font-bold text-primary">
                {analyticsData?.monthlyStats.totalReviews ?? 0}
              </div>
              <div className="text-xs text-muted-foreground">Reviews</div>
            </div>
            <div className="rounded-lg bg-muted/50 p-4 text-center">
              <div className="text-2xl font-bold text-green-600">
                {analyticsData?.monthlyStats.newWordsLearned ?? 0}
              </div>
              <div className="text-xs text-muted-foreground">New Words</div>
            </div>
            <div className="rounded-lg bg-muted/50 p-4 text-center">
              <div className="text-2xl font-bold text-blue-600">
                {analyticsData?.monthlyStats.videosWatched ?? 0}
              </div>
              <div className="text-xs text-muted-foreground">Videos Watched</div>
            </div>
            <div className="rounded-lg bg-muted/50 p-4 text-center">
              <div className="text-2xl font-bold text-orange-600">
                {analyticsData?.monthlyStats.studyStreak ?? 0}
              </div>
              <div className="text-xs text-muted-foreground">Best Streak</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
