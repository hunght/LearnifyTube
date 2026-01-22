import React, { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { trpcClient } from "@/utils/trpc";
import { Button } from "@/components/ui/button";
import { Play, Loader2, Check, Video } from "lucide-react";
import Thumbnail from "@/components/Thumbnail";

interface PopularTabProps {
  channelId: string;
  isActive: boolean;
  onDownload: (url: string, title: string) => Promise<void>;
}

const formatDuration = (seconds: number): string => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
};

const formatViewCount = (count: number): string => {
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
  return count.toString();
};

export const PopularTab: React.FC<PopularTabProps> = ({ channelId, onDownload: _onDownload }) => {
  const query = useQuery({
    queryKey: ["channel-popular", channelId],
    queryFn: () =>
      trpcClient.ytdlp.listChannelPopular.query({
        channelId,
        limit: 24,
      }),
    enabled: !!channelId,
    staleTime: Infinity,
    gcTime: Infinity,
    networkMode: "offlineFirst",
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async (): Promise<void> => {
    if (isRefreshing) return;
    try {
      setIsRefreshing(true);
      await trpcClient.ytdlp.listChannelPopular.query({ channelId, limit: 24, forceRefresh: true });
      await query.refetch();
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <>
      {query.dataUpdatedAt > 0 && (
        <div className="mb-3 flex items-center justify-between rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          <span>
            {query.isFetching ? (
              <>
                <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />
                Refreshing data...
              </>
            ) : (
              <>Last updated: {new Date(query.dataUpdatedAt).toLocaleString()}</>
            )}
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2"
            onClick={handleRefresh}
            disabled={query.isFetching || isRefreshing}
          >
            {query.isFetching || isRefreshing ? "Refreshing..." : "Refresh"}
          </Button>
        </div>
      )}

      {query.isLoading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div key={i} className="space-y-2">
              <div className="aspect-video w-full animate-pulse rounded-lg bg-muted" />
              <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
      ) : query.data && query.data.length > 0 ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {query.data.map((video) => {
            const isDownloaded = video.downloadStatus === "completed" && video.downloadFilePath;
            const isDownloading =
              video.downloadStatus === "downloading" || video.downloadStatus === "queued";

            return (
              <Link
                key={video.id}
                to="/player"
                search={{ videoId: video.videoId, playlistId: undefined, playlistIndex: undefined }}
                className="group"
              >
                {/* Thumbnail */}
                <div className="relative overflow-hidden rounded-lg">
                  <Thumbnail
                    thumbnailPath={video.thumbnailPath}
                    thumbnailUrl={video.thumbnailUrl}
                    alt={video.title}
                    className="aspect-video w-full object-cover transition-transform group-hover:scale-105"
                    fallbackIcon={<Video className="h-8 w-8 text-muted-foreground" />}
                  />

                  {/* Overlay on hover */}
                  <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/40">
                    <div className="scale-0 rounded-full bg-primary p-3 text-primary-foreground transition-transform group-hover:scale-100">
                      <Play className="h-5 w-5" fill="currentColor" />
                    </div>
                  </div>

                  {/* Duration badge */}
                  {video.durationSeconds && (
                    <div className="absolute bottom-1.5 right-1.5 rounded bg-black/80 px-1.5 py-0.5 text-[10px] font-medium text-white">
                      {formatDuration(video.durationSeconds)}
                    </div>
                  )}

                  {/* Download status badge */}
                  {isDownloaded && (
                    <div className="absolute left-1.5 top-1.5 flex items-center gap-1 rounded bg-green-600 px-1.5 py-0.5 text-[10px] font-medium text-white">
                      <Check className="h-3 w-3" />
                    </div>
                  )}
                  {isDownloading && (
                    <div className="absolute left-1.5 top-1.5 flex items-center gap-1 rounded bg-blue-600 px-1.5 py-0.5 text-[10px] font-medium text-white">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      {video.downloadProgress ? `${video.downloadProgress}%` : "..."}
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="mt-2 space-y-1">
                  <h3 className="line-clamp-2 text-sm font-medium leading-tight group-hover:text-primary">
                    {video.title}
                  </h3>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {video.viewCount && <span>{formatViewCount(video.viewCount)} views</span>}
                    {video.viewCount && video.publishedAt && <span>·</span>}
                    {video.publishedAt && (
                      <span>{new Date(video.publishedAt).toLocaleDateString()}</span>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="mb-3 rounded-full bg-muted p-4">
            <Video className="h-8 w-8 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium">No popular videos</p>
          <p className="mt-1 text-xs text-muted-foreground">Check back later for popular content</p>
        </div>
      )}
    </>
  );
};
