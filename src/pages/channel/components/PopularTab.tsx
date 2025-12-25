import React, { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { trpcClient } from "@/utils/trpc";
import { Button } from "@/components/ui/button";
import { ExternalLink as ExternalLinkIcon, Download, Play, Loader2 } from "lucide-react";
import Thumbnail from "@/components/Thumbnail";

interface PopularTabProps {
  channelId: string;
  isActive: boolean;
  onDownload: (url: string, title: string) => Promise<void>;
}

const getDownloadStatusIcon = (status: string | null): React.JSX.Element | null => {
  if (!status) return null;

  switch (status) {
    case "completed":
      return <span className="text-green-600">✓</span>;
    case "downloading":
    case "queued":
      return <Loader2 className="h-4 w-4 animate-spin text-blue-600" />;
    case "failed":
      return <span className="text-red-600">✗</span>;
    case "paused":
      return <span className="text-xs text-muted-foreground">⏸</span>;
    default:
      return null;
  }
};

const getDownloadStatusText = (status: string | null, progress: number | null): string | null => {
  if (!status) return null;

  switch (status) {
    case "completed":
      return "Downloaded";
    case "downloading":
      return `Downloading ${progress || 0}%`;
    case "queued":
      return "In Queue";
    case "failed":
      return "Failed";
    case "paused":
      return "Paused";
    default:
      return status;
  }
};

export const PopularTab: React.FC<PopularTabProps> = ({ channelId, onDownload }) => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["channel-popular", channelId],
    queryFn: () => {
      // Check if query has cached data (has run before)
      const cachedData = queryClient.getQueryData(["channel-popular", channelId]);
      const hasCachedData = cachedData !== undefined;

      // Only force refresh on first run (no cached data)
      return trpcClient.ytdlp.listChannelPopular.query({
        channelId,
        limit: 24,
        forceRefresh: !hasCachedData,
      });
    },
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
        <p className="text-sm text-muted-foreground">Loading popular…</p>
      ) : query.data && query.data.length > 0 ? (
        <div className="space-y-4">
          {query.data.map((video) => {
            const videoUrl = `https://www.youtube.com/watch?v=${video.videoId}`;

            return (
              <div key={video.id} className="flex items-start gap-4 rounded-lg border p-4">
                {/* Video Thumbnail */}
                <div className="h-24 w-40 flex-shrink-0">
                  <Thumbnail
                    thumbnailPath={video.thumbnailPath}
                    thumbnailUrl={video.thumbnailUrl}
                    alt={video.title}
                    className="h-24 w-40 rounded object-cover"
                  />
                </div>

                {/* Video Info */}
                <div className="flex-1 space-y-1">
                  <h3 className="line-clamp-2 font-medium">{video.title}</h3>

                  {video.description && (
                    <p className="line-clamp-2 text-xs text-muted-foreground">
                      {video.description}
                    </p>
                  )}

                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    {video.viewCount && <span>{video.viewCount.toLocaleString()} views</span>}
                    {video.publishedAt && (
                      <span>{new Date(video.publishedAt).toLocaleDateString()}</span>
                    )}
                    {video.durationSeconds && (
                      <span>
                        {Math.floor(video.durationSeconds / 60)}:
                        {String(video.durationSeconds % 60).padStart(2, "0")}
                      </span>
                    )}
                  </div>

                  {/* Download Status */}
                  {video.downloadStatus && (
                    <div className="mt-2 flex items-center gap-2">
                      {getDownloadStatusIcon(video.downloadStatus)}
                      <span className="text-xs font-medium">
                        {getDownloadStatusText(video.downloadStatus, video.downloadProgress)}
                      </span>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-2">
                  {video.downloadStatus === "completed" && video.downloadFilePath ? (
                    <>
                      <Link
                        to="/player"
                        search={{
                          videoId: video.videoId,
                          playlistId: undefined,
                          playlistIndex: undefined,
                        }}
                        className="inline-flex h-8 items-center justify-center gap-1 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground shadow hover:bg-primary/90"
                      >
                        <Play className="h-3 w-3" />
                        Play
                      </Link>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.preventDefault();
                          trpcClient.utils.openExternalUrl.mutate({ url: videoUrl });
                        }}
                      >
                        <ExternalLinkIcon className="mr-1 h-3 w-3" />
                        View
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onDownload(videoUrl, video.title)}
                        disabled={
                          video.downloadStatus === "downloading" ||
                          video.downloadStatus === "queued"
                        }
                      >
                        <Download className="mr-1 h-3 w-3" />
                        Download
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.preventDefault();
                          trpcClient.utils.openExternalUrl.mutate({ url: videoUrl });
                        }}
                      >
                        <ExternalLinkIcon className="mr-1 h-3 w-3" />
                        View
                      </Button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No popular items.</p>
      )}
    </>
  );
};
