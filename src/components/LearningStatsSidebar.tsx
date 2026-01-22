import React, { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { trpcClient } from "@/utils/trpc";
import { Button } from "@/components/ui/button";
import { QuickAddDialog } from "@/components/QuickAddDialog";
import Thumbnail from "@/components/Thumbnail";
import { Flame, BookOpen, Play, Plus, Video, Clock } from "lucide-react";

export function LearningStatsSidebar(): React.JSX.Element {
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
    queryFn: () => trpcClient.watchStats.listRecentWatched.query({ limit: 5 }),
    refetchOnWindowFocus: false,
  });

  const isLoading = statsQuery.isLoading || streakQuery.isLoading;

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Quick Add Section */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-muted-foreground">Quick Add</h3>
        <Button
          onClick={() => setQuickAddOpen(true)}
          variant="outline"
          className="w-full justify-start gap-2"
        >
          <Plus className="h-4 w-4" />
          Add Video or Channel
        </Button>
      </div>

      {/* Study Stats */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground">Study Stats</h3>

        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3 rounded-lg bg-muted/50 p-3">
                <div className="h-8 w-8 animate-pulse rounded-full bg-muted" />
                <div className="space-y-1">
                  <div className="h-4 w-16 animate-pulse rounded bg-muted" />
                  <div className="h-3 w-12 animate-pulse rounded bg-muted" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {/* Streak */}
            <div className="flex items-center gap-3 rounded-lg bg-orange-50 p-3 dark:bg-orange-950/30">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-900/50">
                <Flame className="h-4 w-4 text-orange-500" />
              </div>
              <div>
                <p className="font-semibold">{streakQuery.data?.currentStreak ?? 0} days</p>
                <p className="text-xs text-muted-foreground">Study streak</p>
              </div>
            </div>

            {/* Due Cards */}
            <div className="flex items-center gap-3 rounded-lg bg-blue-50 p-3 dark:bg-blue-950/30">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/50">
                <BookOpen className="h-4 w-4 text-blue-500" />
              </div>
              <div className="flex-1">
                <p className="font-semibold">{statsQuery.data?.flashcards.due ?? 0} due</p>
                <p className="text-xs text-muted-foreground">Flashcards to review</p>
              </div>
              {(statsQuery.data?.flashcards.due ?? 0) > 0 && (
                <Link to="/my-words">
                  <Button size="sm" variant="ghost" className="h-7 px-2">
                    <Play className="h-3 w-3" />
                  </Button>
                </Link>
              )}
            </div>

            {/* Watch Time */}
            <div className="flex items-center gap-3 rounded-lg bg-green-50 p-3 dark:bg-green-950/30">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/50">
                <Clock className="h-4 w-4 text-green-500" />
              </div>
              <div>
                <p className="font-semibold">{statsQuery.data?.watchTime.todayMinutes ?? 0}min</p>
                <p className="text-xs text-muted-foreground">Watched today</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Continue Watching */}
      <div className="flex flex-1 flex-col space-y-2">
        <h3 className="text-sm font-medium text-muted-foreground">Continue Watching</h3>

        {recentWatchedQuery.isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-muted/50" />
            ))}
          </div>
        ) : recentWatchedQuery.data && recentWatchedQuery.data.length > 0 ? (
          <div className="flex-1 space-y-1 overflow-y-auto">
            {recentWatchedQuery.data.map((video) => (
              <Link
                key={video.videoId}
                to="/player"
                search={{ videoId: video.videoId, playlistId: undefined, playlistIndex: undefined }}
                className="group flex items-center gap-2 rounded-lg p-2 transition-colors hover:bg-muted"
              >
                <div className="relative h-10 w-16 flex-shrink-0 overflow-hidden rounded">
                  <Thumbnail
                    thumbnailPath={video.thumbnailPath}
                    thumbnailUrl={video.thumbnailUrl}
                    alt={video.title}
                    className="h-full w-full object-cover"
                    fallbackIcon={<Video className="h-4 w-4 text-muted-foreground" />}
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/30">
                    <Play className="h-4 w-4 scale-0 text-white transition-transform group-hover:scale-100" />
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-xs font-medium leading-tight group-hover:text-primary">
                    {video.title}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-lg bg-muted/50 p-4 text-center">
            <Video className="h-6 w-6 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">No videos watched yet</p>
          </div>
        )}
      </div>

      {/* Quick Add Dialog */}
      <QuickAddDialog open={quickAddOpen} onOpenChange={setQuickAddOpen} />
    </div>
  );
}
