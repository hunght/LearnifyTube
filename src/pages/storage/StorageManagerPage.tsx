import React, { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { type RowSelectionState } from "@tanstack/react-table";
import { trpcClient } from "@/utils/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/ui/page-container";
import { Progress } from "@/components/ui/progress";
import { EnhancedDataTable } from "@/components/data-table";
import { OptimizeDialog } from "@/components/OptimizeDialog";
import { toast } from "sonner";
import {
  RefreshCw,
  HardDrive,
  Trash2,
  Wand2,
  Loader2,
  FileWarning,
  Clock,
  TrendingDown,
  XCircle,
  Music,
} from "lucide-react";
import { ESTIMATED_COMPRESSION_RATIO } from "@/services/optimization-queue/config";
import {
  type StorageVideo,
  createStorageColumns,
  formatBytes,
  LARGE_FILE_THRESHOLD,
} from "./storage-columns";

type TargetResolution = "original" | "1080p" | "720p" | "480p";

export default function StorageManagerPage(): React.JSX.Element {
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [optimizeDialogOpen, setOptimizeDialogOpen] = useState(false);
  const [videosToOptimize, setVideosToOptimize] = useState<StorageVideo[]>([]);
  const queryClient = useQueryClient();
  const previousCompletedRef = useRef<Set<string>>(new Set());

  // Queries
  const downloadsQuery = useQuery({
    queryKey: ["storage", "downloads"],
    queryFn: () => trpcClient.ytdlp.listDownloadedVideosDetailed.query(),
    refetchOnWindowFocus: false,
  });

  // Efficient query that fetches all video-playlist mappings directly from DB
  // without triggering any YouTube API calls
  const playlistMappingsQuery = useQuery({
    queryKey: ["storage", "playlistMappings"],
    queryFn: () => trpcClient.playlists.getAllVideoPlaylistMappings.query(),
    refetchOnWindowFocus: false,
  });

  const ffmpegStatusQuery = useQuery({
    queryKey: ["optimization", "ffmpegStatus"],
    queryFn: () => trpcClient.optimization.checkFfmpegStatus.query(),
    staleTime: 60000,
  });

  const optimizationStatusQuery = useQuery({
    queryKey: ["optimization", "status"],
    queryFn: () => trpcClient.optimization.getOptimizationStatus.query(),
    refetchInterval: (query) => {
      const data = query.state.data;
      return data?.success && data.data && data.data.stats.totalActive > 0 ? 1000 : false;
    },
  });

  const audioConversionStatusQuery = useQuery({
    queryKey: ["audio-conversion", "status"],
    queryFn: () => trpcClient.optimization.getAudioConversionStatus.query(),
    refetchInterval: (query) => {
      const data = query.state.data;
      return data && data.stats.totalActive > 0 ? 1000 : false;
    },
  });

  // Mutations
  const deleteMutation = useMutation({
    mutationFn: (videoId: string) => trpcClient.ytdlp.deleteDownloadedVideo.mutate({ videoId }),
    onSuccess: (result) => {
      if (result.success) {
        toast.success("Video deleted");
        queryClient.invalidateQueries({ queryKey: ["storage", "downloads"] });
      } else {
        toast.error(result.message ?? "Failed to delete video");
      }
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (videoIds: string[]) =>
      Promise.all(
        videoIds.map((videoId) => trpcClient.ytdlp.deleteDownloadedVideo.mutate({ videoId }))
      ),
    onSuccess: (results) => {
      const successCount = results.filter((res) => res?.success).length;
      if (successCount > 0) toast.success(`Deleted ${successCount} video(s).`);
      setRowSelection({});
      queryClient.invalidateQueries({ queryKey: ["storage", "downloads"] });
    },
  });

  const optimizeMutation = useMutation({
    mutationFn: (params: { videoIds: string[]; targetResolution: TargetResolution }) =>
      trpcClient.optimization.startOptimization.mutate(params),
    onSuccess: (result) => {
      if (result.success) {
        toast.success(result.message);
        setOptimizeDialogOpen(false);
        setVideosToOptimize([]);
        setRowSelection({});
        queryClient.invalidateQueries({ queryKey: ["optimization", "status"] });
      } else {
        toast.error(result.message);
      }
    },
  });

  const cancelOptimizationMutation = useMutation({
    mutationFn: (jobId: string) => trpcClient.optimization.cancelOptimization.mutate({ jobId }),
    onSuccess: (result) => {
      if (result.success) {
        toast.success("Optimization cancelled");
        queryClient.invalidateQueries({ queryKey: ["optimization", "status"] });
      }
    },
  });

  const audioConversionMutation = useMutation({
    mutationFn: (params: {
      videoIds: string[];
      format: "mp3" | "m4a" | "opus";
      deleteOriginal: boolean;
    }) =>
      trpcClient.optimization.startAudioConversion.mutate({
        videoIds: params.videoIds,
        format: params.format,
        quality: "medium",
        deleteOriginal: params.deleteOriginal,
      }),
    onSuccess: (result) => {
      if (result.success) {
        toast.success(result.message);
        setRowSelection({});
        queryClient.invalidateQueries({ queryKey: ["audio-conversion", "status"] });
      } else {
        toast.error(result.message);
      }
    },
  });

  const cancelAudioConversionMutation = useMutation({
    mutationFn: (jobId: string) => trpcClient.optimization.cancelAudioConversion.mutate({ jobId }),
    onSuccess: (result) => {
      if (result.success) {
        toast.success("Audio conversion cancelled");
        queryClient.invalidateQueries({ queryKey: ["audio-conversion", "status"] });
      }
    },
  });

  // Watch for optimization completions
  useEffect(() => {
    if (!optimizationStatusQuery.data?.success || !optimizationStatusQuery.data.data) return;
    const { completed } = optimizationStatusQuery.data.data;
    completed.forEach((job) => {
      if (!previousCompletedRef.current.has(job.id)) {
        const savings =
          job.originalSize && job.finalSize
            ? ((1 - job.finalSize / job.originalSize) * 100).toFixed(1)
            : null;
        const savedBytes = job.originalSize && job.finalSize ? job.originalSize - job.finalSize : 0;
        toast.success(
          `Optimized "${job.title?.slice(0, 30)}..."${savings ? ` - Saved ${formatBytes(savedBytes)} (${savings}%)` : ""}`
        );
        queryClient.invalidateQueries({ queryKey: ["storage", "downloads"] });
      }
    });
    previousCompletedRef.current = new Set(completed.map((j) => j.id));
  }, [optimizationStatusQuery.data, queryClient]);

  // Helpers
  const getOptimizationProgress = useCallback(
    (videoId: string): number | null => {
      const job = optimizationStatusQuery.data?.data?.optimizing.find((j) => j.videoId === videoId);
      return job?.progress ?? null;
    },
    [optimizationStatusQuery.data]
  );

  const getOptimizationJobId = useCallback(
    (videoId: string): string | null => {
      const data = optimizationStatusQuery.data?.data;
      const job =
        data?.optimizing.find((j) => j.videoId === videoId) ??
        data?.queued.find((j) => j.videoId === videoId);
      return job?.id ?? null;
    },
    [optimizationStatusQuery.data]
  );

  const isVideoOptimizing = useCallback(
    (videoId: string): boolean => {
      const data = optimizationStatusQuery.data?.data;
      return (
        data?.optimizing.some((j) => j.videoId === videoId) ||
        data?.queued.some((j) => j.videoId === videoId) ||
        false
      );
    },
    [optimizationStatusQuery.data]
  );

  const hasActiveOptimizations =
    optimizationStatusQuery.data?.success &&
    optimizationStatusQuery.data.data &&
    (optimizationStatusQuery.data.data.stats.totalActive > 0 ||
      optimizationStatusQuery.data.data.stats.totalQueued > 0);

  const hasActiveAudioConversions =
    audioConversionStatusQuery.data &&
    (audioConversionStatusQuery.data.stats.totalActive > 0 ||
      audioConversionStatusQuery.data.stats.totalQueued > 0);

  // Build video-playlist map
  const videoPlaylistMap = useMemo(() => {
    const map = new Map<string, string[]>();
    (playlistMappingsQuery.data ?? []).forEach(({ videoId, playlistTitle }) => {
      const existing = map.get(videoId) ?? [];
      if (!existing.includes(playlistTitle)) {
        map.set(videoId, [...existing, playlistTitle]);
      }
    });
    return map;
  }, [playlistMappingsQuery.data]);

  // Videos with playlist info - show ALL videos including missing files
  const videos: StorageVideo[] = useMemo(() => {
    return (downloadsQuery.data ?? []).map((row) => ({
      videoId: row.videoId,
      title: row.title,
      channelTitle: row.channelTitle,
      thumbnailPath: row.thumbnailPath,
      thumbnailUrl: row.thumbnailUrl,
      filePath: row.filePath,
      fileSizeBytes: row.fileSizeBytes,
      durationSeconds: row.durationSeconds,
      lastWatchedAt: row.lastWatchedAt,
      fileExists: row.fileExists,
      playlistNames: videoPlaylistMap.get(row.videoId) ?? [],
    }));
  }, [downloadsQuery.data, videoPlaylistMap]);

  // Analytics
  const analytics = useMemo(() => {
    const existingFiles = videos.filter((v) => v.fileExists);
    const staleThreshold = Date.now() - 30 * 24 * 60 * 60 * 1000;

    const totalSize = existingFiles.reduce((sum, v) => sum + (v.fileSizeBytes ?? 0), 0);
    const largeFiles = existingFiles.filter((v) => (v.fileSizeBytes ?? 0) >= LARGE_FILE_THRESHOLD);
    const staleFiles = existingFiles.filter(
      (v) => v.lastWatchedAt && v.lastWatchedAt < staleThreshold
    );
    const missingFiles = videos.filter((v) => !v.fileExists);

    return {
      totalSize,
      totalVideos: videos.length,
      largeFiles,
      largeFilesSize: largeFiles.reduce((sum, v) => sum + (v.fileSizeBytes ?? 0), 0),
      staleFiles,
      missingFiles,
      potentialSavings720p: Math.round(totalSize * (1 - ESTIMATED_COMPRESSION_RATIO["720p"])),
    };
  }, [videos]);

  // Playlist filter options
  const playlistOptions = useMemo(() => {
    const allNames = new Set<string>();
    videos.forEach((v) => v.playlistNames.forEach((n) => allNames.add(n)));
    return Array.from(allNames)
      .sort()
      .map((name) => ({ label: name, value: name }));
  }, [videos]);

  // Column definition with actions
  const columns = useMemo(
    () =>
      createStorageColumns({
        isVideoOptimizing,
        getOptimizationProgress,
        getOptimizationJobId,
        hasActiveOptimizations: !!hasActiveOptimizations,
        onOptimize: (video) => {
          if (!video.fileExists) {
            toast.error("Cannot optimize: file is missing");
            return;
          }
          setVideosToOptimize([video]);
          setOptimizeDialogOpen(true);
        },
        onDelete: (video) => {
          if (window.confirm(`Delete downloaded file for "${video.title}"?`)) {
            deleteMutation.mutate(video.videoId);
          }
        },
        onCancelOptimization: (jobId) => cancelOptimizationMutation.mutate(jobId),
        isOptimizePending: optimizeMutation.isPending,
        isDeletePending: deleteMutation.isPending,
        isCancelPending: cancelOptimizationMutation.isPending,
      }),
    [
      isVideoOptimizing,
      getOptimizationProgress,
      getOptimizationJobId,
      hasActiveOptimizations,
      deleteMutation,
      optimizeMutation.isPending,
      cancelOptimizationMutation,
    ]
  );

  const selectedIds = Object.keys(rowSelection).filter((id) => rowSelection[id]);

  const handleBulkOptimize = (): void => {
    const selectedVideos = videos.filter(
      (v) => rowSelection[v.videoId] && v.fileExists && !isVideoOptimizing(v.videoId)
    );
    if (selectedVideos.length === 0) {
      toast.error("No valid videos selected for optimization");
      return;
    }
    setVideosToOptimize(selectedVideos);
    setOptimizeDialogOpen(true);
  };

  const handleBulkDelete = (): void => {
    if (window.confirm(`Delete ${selectedIds.length} selected video(s)?`)) {
      bulkDeleteMutation.mutate(selectedIds);
    }
  };

  const handleBulkConvertToAudio = (): void => {
    const selectedVideos = videos.filter((v) => rowSelection[v.videoId] && v.fileExists);
    if (selectedVideos.length === 0) {
      toast.error("No valid videos selected for conversion");
      return;
    }
    const deleteOriginal = window.confirm(
      `Convert ${selectedVideos.length} video(s) to MP3?\n\nClick OK to convert and DELETE original video files.\nClick Cancel to convert and KEEP original files.`
    );
    audioConversionMutation.mutate({
      videoIds: selectedVideos.map((v) => v.videoId),
      format: "mp3",
      deleteOriginal,
    });
  };

  return (
    <PageContainer>
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <HardDrive className="h-5 w-5 text-primary sm:h-6 sm:w-6" />
          <h1 className="text-2xl font-bold sm:text-3xl">Storage Manager</h1>
        </div>
        <div className="flex items-center gap-2">
          {selectedIds.length > 0 && (
            <>
              <Button variant="secondary" size="sm" onClick={handleBulkOptimize}>
                <Wand2 className="mr-2 h-4 w-4" />
                Optimize ({selectedIds.length})
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleBulkConvertToAudio}
                disabled={audioConversionMutation.isPending || !!hasActiveAudioConversions}
              >
                <Music className="mr-2 h-4 w-4" />
                To Audio ({selectedIds.length})
              </Button>
              <Button variant="destructive" size="sm" onClick={handleBulkDelete}>
                <Trash2 className="mr-2 h-4 w-4" />
                Delete ({selectedIds.length})
              </Button>
            </>
          )}
          <Button variant="outline" size="sm" onClick={() => downloadsQuery.refetch()}>
            <RefreshCw
              className={`mr-2 h-4 w-4 ${downloadsQuery.isRefetching ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        </div>
      </div>

      {/* Optimization Progress Banner */}
      {hasActiveOptimizations && optimizationStatusQuery.data?.data && (
        <Card className="border-primary/50 bg-primary/5">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <span className="font-medium">
                  Optimizing {optimizationStatusQuery.data.data.stats.totalActive} video(s)
                  {optimizationStatusQuery.data.data.stats.totalQueued > 0 &&
                    ` (${optimizationStatusQuery.data.data.stats.totalQueued} queued)`}
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive"
                onClick={() => {
                  const jobs = [
                    ...(optimizationStatusQuery.data?.data?.optimizing ?? []),
                    ...(optimizationStatusQuery.data?.data?.queued ?? []),
                  ];
                  jobs.forEach((job) => cancelOptimizationMutation.mutate(job.id));
                }}
              >
                <XCircle className="mr-1 h-4 w-4" />
                Cancel All
              </Button>
            </div>
            <Progress
              value={optimizationStatusQuery.data.data.stats.averageProgress}
              className="mt-2 h-2"
            />
          </CardContent>
        </Card>
      )}

      {/* Audio Conversion Progress Banner */}
      {hasActiveAudioConversions && audioConversionStatusQuery.data && (
        <Card className="border-blue-500/50 bg-blue-500/5">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Music className="h-5 w-5 animate-pulse text-blue-500" />
                <span className="font-medium">
                  Converting {audioConversionStatusQuery.data.stats.totalActive} video(s) to audio
                  {audioConversionStatusQuery.data.stats.totalQueued > 0 &&
                    ` (${audioConversionStatusQuery.data.stats.totalQueued} queued)`}
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive"
                onClick={() => {
                  const jobs = [
                    ...(audioConversionStatusQuery.data?.converting ?? []),
                    ...(audioConversionStatusQuery.data?.queued ?? []),
                  ];
                  jobs.forEach((job) => cancelAudioConversionMutation.mutate(job.id));
                }}
              >
                <XCircle className="mr-1 h-4 w-4" />
                Cancel All
              </Button>
            </div>
            <Progress
              value={audioConversionStatusQuery.data.stats.averageProgress}
              className="mt-2 h-2"
            />
          </CardContent>
        </Card>
      )}

      {/* Quick Stats */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card className="border-0 bg-gradient-to-br from-primary/5 via-background to-background shadow-sm">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-xl bg-primary/10 p-2.5">
              <HardDrive className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{formatBytes(analytics.totalSize)}</p>
              <p className="text-xs text-muted-foreground">{analytics.totalVideos} videos</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 bg-gradient-to-br from-emerald-500/5 via-background to-background shadow-sm">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-xl bg-emerald-500/10 p-2.5">
              <TrendingDown className="h-5 w-5 text-emerald-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-emerald-500">
                {formatBytes(analytics.potentialSavings720p)}
              </p>
              <p className="text-xs text-muted-foreground">Potential savings</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 bg-gradient-to-br from-orange-500/5 via-background to-background shadow-sm">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-xl bg-orange-500/10 p-2.5">
              <FileWarning className="h-5 w-5 text-orange-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{analytics.largeFiles.length}</p>
              <p className="text-xs text-muted-foreground">Large files (&gt;100MB)</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 bg-gradient-to-br from-violet-500/5 via-background to-background shadow-sm">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-xl bg-violet-500/10 p-2.5">
              <Clock className="h-5 w-5 text-violet-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{analytics.staleFiles.length}</p>
              <p className="text-xs text-muted-foreground">Not watched in 30d</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Videos Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Downloaded Videos {videos.length > 0 && `(${videos.length})`}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 pt-0">
          <EnhancedDataTable
            columns={columns}
            data={videos}
            searchKey="title"
            searchPlaceholder="Search videos..."
            getRowId={(row) => row.videoId}
            rowSelection={rowSelection}
            onRowSelectionChange={setRowSelection}
            isLoading={downloadsQuery.isLoading}
            emptyMessage="No downloaded videos found."
            enableHeaderFilters={true}
            columnFilters={{
              playlistNames: {
                type: "select",
                title: "Playlist",
                options: playlistOptions,
              },
              fileExists: {
                type: "select",
                title: "Status",
                options: [
                  { label: "Exists", value: "exists" },
                  { label: "Missing", value: "missing" },
                ],
              },
              channelTitle: {
                type: "text",
                title: "Channel",
              },
            }}
          />
        </CardContent>
      </Card>

      <OptimizeDialog
        open={optimizeDialogOpen}
        onOpenChange={setOptimizeDialogOpen}
        videos={videosToOptimize.map((v) => ({
          videoId: v.videoId,
          title: v.title,
          fileSizeBytes: v.fileSizeBytes,
        }))}
        onConfirm={(resolution) =>
          optimizeMutation.mutate({
            videoIds: videosToOptimize.map((v) => v.videoId),
            targetResolution: resolution,
          })
        }
        isLoading={optimizeMutation.isPending}
        ffmpegAvailable={ffmpegStatusQuery.data?.available ?? true}
      />
    </PageContainer>
  );
}
