import React from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { trpcClient } from "@/utils/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ExternalLink as ExternalLinkIcon, Loader2 } from "lucide-react";
import Thumbnail from "@/components/Thumbnail";

export default function SubscriptionsPage(): React.JSX.Element {
  const navigate = useNavigate();

  const query = useQuery({
    queryKey: ["subscriptions", { limit: 60 }],
    queryFn: async () => {
      return await trpcClient.watchStats.listRecentVideos.query({ limit: 60 });
    },
    staleTime: 60_000,
  });

  const videos = query.data ?? [];

  return (
    <div className="container mx-auto space-y-6 p-6">
      <div className="flex items-center justify-end">
        <div className="text-xs text-muted-foreground">
          {query.isFetching
            ? "Refreshing…"
            : query.dataUpdatedAt
              ? `Updated ${new Date(query.dataUpdatedAt).toLocaleTimeString()}`
              : ""}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Subscriptions</CardTitle>
        </CardHeader>
        <CardContent>
          {query.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : videos.length === 0 ? (
            <p className="text-sm text-muted-foreground">No recent videos found.</p>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {videos.map((v) => {
                const hideNoThumb =
                  typeof v.thumbnailUrl === "string" && v.thumbnailUrl.includes("no_thumbnail");
                const isDownloading =
                  v.downloadStatus === "downloading" || v.downloadStatus === "queued";
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
                    <div className="relative">
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
                      {/* Downloading overlay */}
                      {isDownloading && (
                        <div className="absolute inset-0 flex items-center justify-center rounded bg-black/50">
                          <div className="flex items-center gap-2 text-white">
                            <Loader2 className="h-5 w-5 animate-spin" />
                            <span className="text-sm font-medium">
                              {v.downloadStatus === "queued"
                                ? "Queued"
                                : `${v.downloadProgress || 0}%`}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}
