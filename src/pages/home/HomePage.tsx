import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { trpcClient } from "@/utils/trpc";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/ui/page-container";
import { QuickAddDialog } from "@/components/QuickAddDialog";
import { StudyStreakCard } from "./components/StudyStreakCard";
import { QuickStatsRow } from "./components/QuickStatsRow";
import { ContinueWatchingSection } from "./components/ContinueWatchingSection";

const getGreeting = (): string => {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
};

export default function HomePage(): React.JSX.Element {
  const [quickAddOpen, setQuickAddOpen] = useState(false);

  // Fetch dashboard stats
  const statsQuery = useQuery({
    queryKey: ["learningStats", "dashboard"],
    queryFn: () => trpcClient.learningStats.getDashboardStats.query(),
    refetchOnWindowFocus: false,
  });

  // Fetch streak data
  const streakQuery = useQuery({
    queryKey: ["learningStats", "streak"],
    queryFn: () => trpcClient.learningStats.getStreak.query(),
    refetchOnWindowFocus: false,
  });

  // Fetch recently watched videos
  const recentWatchedQuery = useQuery({
    queryKey: ["watchStats", "recentWatched"],
    queryFn: () => trpcClient.watchStats.listRecentWatched.query({ limit: 10 }),
    refetchOnWindowFocus: false,
  });

  const isLoading = statsQuery.isLoading || streakQuery.isLoading;

  // Calculate retention rate (graduated / total learned)
  const retentionRate =
    statsQuery.data && statsQuery.data.flashcards.total > 0
      ? Math.round(
          ((statsQuery.data.flashcards.graduated + statsQuery.data.flashcards.learning) /
            statsQuery.data.flashcards.total) *
            100
        )
      : 0;

  return (
    <PageContainer>
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl">
            {getGreeting()}!
          </h1>
          <p className="mt-1 text-sm text-muted-foreground sm:text-base">
            Ready to continue your learning journey?
          </p>
        </div>
        <Button onClick={() => setQuickAddOpen(true)} className="shrink-0 gap-2" size="lg">
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Add Video</span>
          <span className="sm:hidden">Add</span>
        </Button>
      </div>

      {/* Study Streak Card */}
      <StudyStreakCard
        streak={streakQuery.data?.currentStreak ?? 0}
        dueCards={statsQuery.data?.flashcards.due ?? 0}
        todayMinutes={statsQuery.data?.watchTime.todayMinutes ?? 0}
        isLoading={isLoading}
      />

      {/* Quick Stats Row */}
      <QuickStatsRow
        totalWords={statsQuery.data?.flashcards.total ?? 0}
        retentionRate={retentionRate}
        weeklyMinutes={statsQuery.data?.watchTime.weekMinutes ?? 0}
        totalVideos={statsQuery.data?.videos.total ?? 0}
        isLoading={isLoading}
      />

      {/* Continue Watching */}
      <ContinueWatchingSection
        videos={recentWatchedQuery.data ?? []}
        isLoading={recentWatchedQuery.isLoading}
      />

      {/* Quick Add Dialog */}
      <QuickAddDialog open={quickAddOpen} onOpenChange={setQuickAddOpen} />
    </PageContainer>
  );
}
