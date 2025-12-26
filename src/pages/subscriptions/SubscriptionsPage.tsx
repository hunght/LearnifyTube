import React, { useState, useMemo } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { trpcClient } from "@/utils/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ExternalLink as ExternalLinkIcon, Loader2, Search, RefreshCw } from "lucide-react";
import Thumbnail from "@/components/Thumbnail";

const PAGE_SIZE = 30;

export default function SubscriptionsPage(): React.JSX.Element {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");

  const query = useInfiniteQuery({
    queryKey: ["subscriptions"],
    queryFn: async ({ pageParam = 0 }) => {
      return await trpcClient.watchStats.listRecentVideos.query({
        limit: PAGE_SIZE,
        offset: pageParam,
      });
    },
    getNextPageParam: (lastPage, allPages) => {
      // If the last page has fewer items than PAGE_SIZE, there's no more data
      if (lastPage.length < PAGE_SIZE) return undefined;
      // Otherwise, return the next offset
      return allPages.length * PAGE_SIZE;
    },
    initialPageParam: 0,
    staleTime: 60_000,
  });

  const videos = query.data?.pages.flat() ?? [];

  const filteredVideos = useMemo(() => {
    if (!searchQuery.trim()) return videos;
    const q = searchQuery.toLowerCase();
    return videos.filter(
      (v) => v.title.toLowerCase().includes(q) || v.channelTitle?.toLowerCase().includes(q)
    );
  }, [videos, searchQuery]);

  const handleRefresh = (): void => {
    query.refetch();
  };

  return (
    <div className="container mx-auto space-y-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-3xl font-bold">Subscriptions</h1>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search videos..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-64 pl-9"
            />
          </div>
          {searchQuery && (
            <Button variant="ghost" size="sm" onClick={() => setSearchQuery("")}>
              Clear
            </Button>
          )}
          <Button
            onClick={handleRefresh}
            disabled={query.isFetching}
            size="sm"
            variant="outline"
            className="flex items-center gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Recent Videos {filteredVideos.length > 0 && `(${filteredVideos.length})`}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {query.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : filteredVideos.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {searchQuery
                ? `No videos found matching "${searchQuery}"`
                : "No recent videos found."}
            </p>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {filteredVideos.map((v) => {
                  const hideNoThumb =
                    typeof v.thumbnailUrl === "string" && v.thumbnailUrl.includes("no_thumbnail");
                  return (
                    <div
                      key={v.videoId}
                      className="group cursor-pointer space-y-2 rounded-lg border p-3 transition-colors hover:bg-muted/50"
                      onClick={() =>
                        navigate({
                          to: "/player",
                          search: {
                            videoId: v.videoId,
                            playlistId: undefined,
                            playlistIndex: undefined,
                          },
                        })
                      }
                    >
                      {hideNoThumb ? (
                        <div className="aspect-video w-full rounded bg-muted" />
                      ) : (
                        <Thumbnail
                          thumbnailPath={v.thumbnailPath}
                          thumbnailUrl={v.thumbnailUrl}
                          alt={v.title}
                          className="aspect-video w-full rounded object-cover"
                        />
                      )}
                      <div className="space-y-1">
                        <div className="line-clamp-2 text-sm font-medium">{v.title}</div>
                        {v.channelId ? (
                          <button
                            className="line-clamp-1 text-left text-xs text-muted-foreground hover:text-foreground hover:underline"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate({
                                to: "/channel",
                                search: { channelId: v.channelId! },
                              });
                            }}
                          >
                            {v.channelTitle || v.channelId}
                          </button>
                        ) : (
                          <div className="line-clamp-1 text-xs text-muted-foreground">
                            {v.channelTitle || "Unknown channel"}
                          </div>
                        )}
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <div className="flex gap-3">
                            {typeof v.durationSeconds === "number" && (
                              <span>{Math.round(v.durationSeconds / 60)} min</span>
                            )}
                            {typeof v.viewCount === "number" && (
                              <span>{v.viewCount.toLocaleString()} views</span>
                            )}
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 opacity-0 transition-opacity group-hover:opacity-100"
                            onClick={(e) => {
                              e.stopPropagation();
                              void trpcClient.utils.openExternalUrl.mutate({
                                url: `https://www.youtube.com/watch?v=${v.videoId}`,
                              });
                            }}
                          >
                            <ExternalLinkIcon className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Load More Button */}
              {query.hasNextPage && !searchQuery && (
                <div className="flex justify-center pt-4">
                  <Button
                    variant="outline"
                    onClick={() => query.fetchNextPage()}
                    disabled={query.isFetchingNextPage}
                  >
                    {query.isFetchingNextPage ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Loading…
                      </>
                    ) : (
                      "Load More"
                    )}
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
