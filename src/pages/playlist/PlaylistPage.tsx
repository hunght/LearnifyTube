import React, { useState, useMemo } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { trpcClient } from "@/utils/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Play, List as ListIcon, Download, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import Thumbnail from "@/components/Thumbnail";

export default function PlaylistPage(): React.JSX.Element {
  const navigate = useNavigate();
  const search = useSearch({ from: "/playlist" });
  const playlistId = search.playlistId;
  const queryClient = useQueryClient();
  const [_currentVideoIndex, setCurrentVideoIndex] = useState(0);
  const [selectedVideoIds, setSelectedVideoIds] = useState<Set<string>>(new Set());

  const query = useQuery({
    queryKey: ["playlist-details", playlistId],
    queryFn: async () => {
      if (!playlistId) return null;
      return await trpcClient.playlists.getDetails.query({ playlistId });
    },
    enabled: !!playlistId,
    staleTime: Infinity,
    gcTime: Infinity,
    networkMode: "offlineFirst",
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  const updatePlaybackMutation = useMutation({
    mutationFn: ({ videoIndex, watchTime }: { videoIndex: number; watchTime?: number }) =>
      trpcClient.playlists.updatePlayback.mutate({
        playlistId: playlistId!,
        currentVideoIndex: videoIndex,
        watchTimeSeconds: watchTime,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ytdlp", "all-playlists"] });
    },
  });

  const [isRefreshing, setIsRefreshing] = useState(false);

  const downloadMutation = useMutation({
    mutationFn: (urls: string[]) => trpcClient.queue.addToQueue.mutate({ urls }),
    onSuccess: (res) => {
      if (res.success) {
        queryClient.invalidateQueries({ queryKey: ["queue", "status"] });
        toast.success(`${res.downloadIds.length} video(s) added to download queue`);
        setSelectedVideoIds(new Set());
        query.refetch();
      } else {
        toast.error(res.message ?? "Failed to add to queue");
      }
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to add to queue"),
  });

  const handleRefresh = async (): Promise<void> => {
    if (!playlistId || isRefreshing) return;
    try {
      setIsRefreshing(true);
      await trpcClient.playlists.getDetails.query({ playlistId, forceRefresh: true });
      await query.refetch();
    } finally {
      setIsRefreshing(false);
    }
  };

  const handlePlayAll = (): void => {
    if (!data?.videos || data.videos.length === 0) {
      toast.error("No videos in playlist");
      return;
    }
    // Start from saved position or beginning
    const startIndex = data.currentVideoIndex || 0;
    const video = data.videos[startIndex];
    if (video && playlistId) {
      setCurrentVideoIndex(startIndex);
      navigate({
        to: "/player",
        search: {
          videoId: video.videoId,
          playlistId,
          playlistIndex: startIndex,
        },
      });
    }
  };

  const handlePlayVideo = (videoIndex: number): void => {
    setCurrentVideoIndex(videoIndex);
    updatePlaybackMutation.mutate({ videoIndex });
    const video = data?.videos[videoIndex];
    if (video && playlistId) {
      navigate({
        to: "/player",
        search: {
          videoId: video.videoId,
          playlistId,
          playlistIndex: videoIndex,
        },
      });
    }
  };

  const data = query.data;
  // Show title from data if available, otherwise show "Loading..." during initial load
  const title =
    data?.title ?? (query.isLoading ? "Loading Playlist..." : (playlistId ?? "Playlist"));

  const progress =
    data?.itemCount && data?.currentVideoIndex
      ? Math.round((data.currentVideoIndex / data.itemCount) * 100)
      : 0;

  // Calculate download statistics
  const downloadStats = useMemo(() => {
    if (!data?.videos) return { downloaded: 0, notDownloaded: 0, total: 0 };
    const downloaded = data.videos.filter(
      (v) => v.downloadStatus === "completed" && v.downloadFilePath
    ).length;
    return {
      downloaded,
      notDownloaded: data.videos.length - downloaded,
      total: data.videos.length,
    };
  }, [data?.videos]);

  const handleToggleVideo = (videoId: string): void => {
    setSelectedVideoIds((prev) => {
      const next = new Set(prev);
      if (next.has(videoId)) {
        next.delete(videoId);
      } else {
        next.add(videoId);
      }
      return next;
    });
  };

  const handleToggleAll = (): void => {
    if (!data?.videos) return;
    const notDownloadedVideos = data.videos.filter(
      (v) => v.downloadStatus !== "completed" || !v.downloadFilePath
    );
    if (selectedVideoIds.size === notDownloadedVideos.length) {
      setSelectedVideoIds(new Set());
    } else {
      setSelectedVideoIds(new Set(notDownloadedVideos.map((v) => v.videoId)));
    }
  };

  const handleDownloadSelected = (): void => {
    if (selectedVideoIds.size === 0) {
      toast.error("Please select videos to download");
      return;
    }
    const urls = Array.from(selectedVideoIds).map(
      (videoId) => `https://www.youtube.com/watch?v=${videoId}`
    );
    downloadMutation.mutate(urls);
  };

  return (
    <div className="container mx-auto space-y-6 p-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            <span>{title}</span>
            {query.dataUpdatedAt > 0 && (
              <span className="text-xs text-muted-foreground">
                {query.isFetching ? (
                  <>
                    <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />
                    Refreshing…
                  </>
                ) : (
                  <>Last updated: {new Date(query.dataUpdatedAt).toLocaleString()}</>
                )}
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {query.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : !playlistId ? (
            <Alert>
              <AlertTitle>Missing playlist</AlertTitle>
              <AlertDescription>No playlist id provided.</AlertDescription>
            </Alert>
          ) : !data ? (
            <Alert>
              <AlertTitle>Not found</AlertTitle>
              <AlertDescription>Could not find that playlist.</AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-4">
              <div className="flex items-start gap-4">
                {typeof data?.thumbnailUrl === "string" &&
                data.thumbnailUrl.includes("no_thumbnail") ? (
                  <div className="aspect-video w-48 rounded bg-muted" />
                ) : (
                  <Thumbnail
                    thumbnailPath={data?.thumbnailPath}
                    thumbnailUrl={data?.thumbnailUrl}
                    alt={title}
                    className="aspect-video w-48 rounded object-cover"
                  />
                )}
                <div className="flex-1 space-y-2">
                  {data?.description && (
                    <p className="line-clamp-5 whitespace-pre-line text-sm text-muted-foreground">
                      {data.description}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    {typeof data?.itemCount === "number" && <span>{data.itemCount} items</span>}
                    {progress > 0 && (
                      <Badge variant="secondary" className="text-xs">
                        {progress}% complete
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <Badge variant="default" className="flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      {downloadStats.downloaded} Downloaded
                    </Badge>
                    {downloadStats.notDownloaded > 0 ? (
                      <Badge variant="outline" className="flex items-center gap-1">
                        <Download className="h-3 w-3" />
                        {downloadStats.notDownloaded} To Download
                      </Badge>
                    ) : (
                      <Badge
                        variant="secondary"
                        className="flex items-center gap-1 bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400"
                      >
                        <CheckCircle2 className="h-3 w-3" />
                        All Downloaded
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 pt-2">
                    <Button size="sm" onClick={handlePlayAll} className="flex items-center gap-2">
                      <Play className="h-4 w-4" />
                      {progress > 0 ? "Continue Playlist" : "Play All"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleRefresh}
                      disabled={query.isFetching || isRefreshing}
                    >
                      {query.isFetching || isRefreshing ? "Refreshing…" : "Refresh"}
                    </Button>
                    {downloadStats.notDownloaded > 0 && (
                      <Button
                        size="sm"
                        variant="default"
                        onClick={handleDownloadSelected}
                        disabled={selectedVideoIds.size === 0 || downloadMutation.isPending}
                        className="flex items-center gap-2"
                      >
                        {downloadMutation.isPending ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Adding...
                          </>
                        ) : (
                          <>
                            <Download className="h-4 w-4" />
                            Download ({selectedVideoIds.size})
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                  {progress > 0 && (
                    <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full bg-primary transition-all"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  )}
                </div>
              </div>

              {downloadStats.notDownloaded > 0 && (
                <div className="flex items-center gap-2 rounded-lg border bg-muted/50 p-3">
                  <Checkbox
                    id="select-all"
                    checked={
                      selectedVideoIds.size > 0 &&
                      selectedVideoIds.size ===
                        data.videos.filter(
                          (v) => v.downloadStatus !== "completed" || !v.downloadFilePath
                        ).length
                    }
                    onCheckedChange={handleToggleAll}
                  />
                  <label htmlFor="select-all" className="flex-1 cursor-pointer text-sm font-medium">
                    Select all not downloaded ({downloadStats.notDownloaded} videos)
                  </label>
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {(data?.videos ?? []).map((v, index) => {
                  const isCurrentVideo = index === (data?.currentVideoIndex || 0);
                  const isDownloaded = v.downloadStatus === "completed" && v.downloadFilePath;
                  const isSelected = selectedVideoIds.has(v.videoId);
                  return (
                    <div
                      key={v.videoId}
                      className={`space-y-2 rounded-lg border p-3 ${
                        isCurrentVideo
                          ? "border-primary bg-primary/5"
                          : isSelected
                            ? "border-blue-500 bg-blue-50 dark:bg-blue-950/20"
                            : ""
                      }`}
                    >
                      <div className="relative">
                        <Thumbnail
                          thumbnailPath={v.thumbnailPath}
                          thumbnailUrl={v.thumbnailUrl}
                          alt={v.title}
                          className="aspect-video w-full rounded object-cover"
                        />
                        {!isDownloaded && (
                          <div className="absolute left-2 top-2">
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => handleToggleVideo(v.videoId)}
                              className="h-5 w-5 bg-white shadow-lg"
                            />
                          </div>
                        )}
                        {isCurrentVideo && (
                          <div className="absolute right-2 top-2">
                            <Badge variant="default" className="flex items-center gap-1">
                              <ListIcon className="h-3 w-3" />
                              Current
                            </Badge>
                          </div>
                        )}
                        {isDownloaded && (
                          <div className="absolute right-2 top-2">
                            <Badge
                              variant="default"
                              className="flex items-center gap-1 bg-green-600"
                            >
                              <CheckCircle2 className="h-3 w-3" />
                              Downloaded
                            </Badge>
                          </div>
                        )}
                        <div className="absolute bottom-2 left-2 rounded bg-black/70 px-1.5 py-0.5 text-xs text-white">
                          #{index + 1}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div className="line-clamp-2 text-sm font-medium">{v.title}</div>
                        <div className="flex gap-3 text-xs text-muted-foreground">
                          {typeof v.durationSeconds === "number" && (
                            <span>{Math.round(v.durationSeconds / 60)} min</span>
                          )}
                          {typeof v.viewCount === "number" && (
                            <span>{v.viewCount.toLocaleString()} views</span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" className="flex-1" onClick={() => handlePlayVideo(index)}>
                          Play
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => trpcClient.utils.openExternalUrl.mutate({ url: v.url })}
                        >
                          YouTube
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
