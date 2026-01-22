import React, { useEffect, useMemo, useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { trpcClient } from "@/utils/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { PageContainer } from "@/components/ui/page-container";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  RefreshCw,
  HardDrive,
  Trash2,
  Search,
  Wand2,
  Loader2,
  FileWarning,
  Clock,
  TrendingDown,
  XCircle,
  Play,
  ExternalLink,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { OptimizeDialog } from "@/components/OptimizeDialog";
import Thumbnail from "@/components/Thumbnail";
import { Progress } from "@/components/ui/progress";
import { ESTIMATED_COMPRESSION_RATIO } from "@/services/optimization-queue/config";

type TargetResolution = "original" | "1080p" | "720p" | "480p";

type StorageVideo = Awaited<
  ReturnType<typeof trpcClient.ytdlp.listDownloadedVideosDetailed.query>
>[number];

const formatBytes = (bytes: number | null | undefined): string => {
  if (!bytes || bytes <= 0) return "–";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
};

const formatDuration = (seconds: number | null | undefined): string => {
  if (!seconds || seconds <= 0) return "–";
  const mins = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${mins}m ${remainingSeconds}s`;
};

const formatRelativeDate = (timestamp: number | null | undefined): string => {
  if (!timestamp) return "Never";
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);
  const diffYears = Math.floor(diffDays / 365);

  if (diffSeconds < 60) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffWeeks < 4) return `${diffWeeks}w ago`;
  if (diffMonths < 12) return `${diffMonths}mo ago`;
  return `${diffYears}y ago`;
};

// Size threshold for "large" files (100MB)
const LARGE_FILE_THRESHOLD = 100 * 1024 * 1024;
// Days threshold for "stale" files
const STALE_DAYS_THRESHOLD = 30;

export default function StorageManagerPage(): React.JSX.Element {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<"size" | "lastWatched">("size");
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");
  const [activityFilter, setActivityFilter] = useState<"all" | "never" | "30d" | "90d">("all");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [optimizeDialogOpen, setOptimizeDialogOpen] = useState(false);
  const [videosToOptimize, setVideosToOptimize] = useState<StorageVideo[]>([]);
  const queryClient = useQueryClient();

  const downloadsQuery = useQuery({
    queryKey: ["storage", "downloads"],
    queryFn: () => trpcClient.ytdlp.listDownloadedVideosDetailed.query(),
    refetchOnWindowFocus: false,
  });

  const deleteMutation = useMutation({
    mutationFn: (videoId: string) => trpcClient.ytdlp.deleteDownloadedVideo.mutate({ videoId }),
    onSuccess: (result) => {
      if (result.success) {
        toast.success("Video deleted");
        queryClient.invalidateQueries({ queryKey: ["storage", "downloads"] });
        queryClient.invalidateQueries({ queryKey: ["ytdlp", "listCompletedDownloads"] });
      } else {
        toast.error(result.message ?? "Failed to delete video");
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to delete video");
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (videoIds: string[]) => {
      const results = await Promise.all(
        videoIds.map((videoId) => trpcClient.ytdlp.deleteDownloadedVideo.mutate({ videoId }))
      );
      return results;
    },
    onSuccess: (results) => {
      const successCount = results.filter((res) => res?.success).length;
      const failureCount = results.length - successCount;
      if (successCount > 0) {
        toast.success(`Deleted ${successCount} ${successCount === 1 ? "video" : "videos"}.`);
      }
      if (failureCount > 0) {
        toast.error(`Failed to delete ${failureCount} item(s).`);
      }
      setSelected({});
      queryClient.invalidateQueries({ queryKey: ["storage", "downloads"] });
      queryClient.invalidateQueries({ queryKey: ["ytdlp", "listCompletedDownloads"] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to delete selected videos");
    },
  });

  // Optimization queries and mutations
  const ffmpegStatusQuery = useQuery({
    queryKey: ["optimization", "ffmpegStatus"],
    queryFn: () => trpcClient.optimization.checkFfmpegStatus.query(),
    staleTime: 60000, // Cache for 1 minute
  });

  const optimizationStatusQuery = useQuery({
    queryKey: ["optimization", "status"],
    queryFn: () => trpcClient.optimization.getOptimizationStatus.query(),
    refetchInterval: (query) => {
      // Poll every second if there are active optimizations
      const data = query.state.data;
      if (data?.success && data.data && data.data.stats.totalActive > 0) {
        return 1000;
      }
      return false;
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
        setSelected({});
        queryClient.invalidateQueries({ queryKey: ["optimization", "status"] });
        queryClient.invalidateQueries({ queryKey: ["storage", "downloads"] });
      } else {
        toast.error(result.message);
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to start optimization");
    },
  });

  // Cancel optimization mutation
  const cancelOptimizationMutation = useMutation({
    mutationFn: (jobId: string) => trpcClient.optimization.cancelOptimization.mutate({ jobId }),
    onSuccess: (result) => {
      if (result.success) {
        toast.success("Optimization cancelled");
        queryClient.invalidateQueries({ queryKey: ["optimization", "status"] });
        queryClient.invalidateQueries({ queryKey: ["storage", "downloads"] });
      } else {
        toast.error(result.message);
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to cancel optimization");
    },
  });

  // Track completed optimizations to show notifications
  const previousCompletedRef = useRef<Set<string>>(new Set());

  // Watch for optimization completions
  useEffect(() => {
    if (!optimizationStatusQuery.data?.success || !optimizationStatusQuery.data.data) return;

    const { completed } = optimizationStatusQuery.data.data;
    const currentCompleted = new Set(completed.map((j) => j.id));

    // Find new completions
    completed.forEach((job) => {
      if (!previousCompletedRef.current.has(job.id)) {
        // New completion detected
        const savings =
          job.originalSize && job.finalSize
            ? ((1 - job.finalSize / job.originalSize) * 100).toFixed(1)
            : null;
        const savedBytes = job.originalSize && job.finalSize ? job.originalSize - job.finalSize : 0;

        toast.success(
          `Optimized "${job.title?.slice(0, 30)}${(job.title?.length ?? 0) > 30 ? "..." : ""}"${savings ? ` - Saved ${formatBytes(savedBytes)} (${savings}%)` : ""}`,
          { duration: 5000 }
        );

        // Refresh the downloads list to show new file size
        queryClient.invalidateQueries({ queryKey: ["storage", "downloads"] });
      }
    });

    previousCompletedRef.current = currentCompleted;
  }, [optimizationStatusQuery.data, queryClient]);

  // Get optimization progress for a specific video
  const getOptimizationProgress = (videoId: string): number | null => {
    if (!optimizationStatusQuery.data?.success || !optimizationStatusQuery.data.data) return null;
    const { optimizing } = optimizationStatusQuery.data.data;
    const job = optimizing.find((j) => j.videoId === videoId);
    return job?.progress ?? null;
  };

  // Get job ID for a video (for cancellation)
  const getOptimizationJobId = (videoId: string): string | null => {
    if (!optimizationStatusQuery.data?.success || !optimizationStatusQuery.data.data) return null;
    const { optimizing, queued } = optimizationStatusQuery.data.data;
    const job =
      optimizing.find((j) => j.videoId === videoId) ?? queued.find((j) => j.videoId === videoId);
    return job?.id ?? null;
  };

  // Check if a video is being optimized
  const isVideoOptimizing = (videoId: string): boolean => {
    if (!optimizationStatusQuery.data?.success || !optimizationStatusQuery.data.data) return false;
    const { optimizing, queued } = optimizationStatusQuery.data.data;
    return (
      optimizing.some((j) => j.videoId === videoId) || queued.some((j) => j.videoId === videoId)
    );
  };

  const handleOptimize = (video: StorageVideo): void => {
    if (!video.fileExists) {
      toast.error("Cannot optimize: file is missing");
      return;
    }
    setVideosToOptimize([video]);
    setOptimizeDialogOpen(true);
  };

  const handleBulkOptimize = (): void => {
    const selectedVideos = filteredVideos.filter(
      (v) => selected[v.videoId] && v.fileExists && !isVideoOptimizing(v.videoId)
    );
    if (selectedVideos.length === 0) {
      toast.error("No valid videos selected for optimization");
      return;
    }
    setVideosToOptimize(selectedVideos);
    setOptimizeDialogOpen(true);
  };

  const handleOptimizeConfirm = (resolution: TargetResolution): void => {
    const videoIds = videosToOptimize.map((v) => v.videoId);
    optimizeMutation.mutate({ videoIds, targetResolution: resolution });
  };

  // Analytics calculations
  const analytics = useMemo(() => {
    if (!downloadsQuery.data) {
      const emptyVideos: StorageVideo[] = [];
      return {
        totalSize: 0,
        totalVideos: 0,
        largeFiles: emptyVideos,
        largeFilesSize: 0,
        staleFiles: emptyVideos,
        staleFilesSize: 0,
        neverWatched: emptyVideos,
        neverWatchedSize: 0,
        missingFiles: emptyVideos,
        potentialSavings720p: 0,
      };
    }

    const now = Date.now();
    const staleThreshold = now - STALE_DAYS_THRESHOLD * 24 * 60 * 60 * 1000;

    const existingFiles = downloadsQuery.data.filter((v) => v.fileExists);

    const largeFiles = existingFiles
      .filter((v) => (v.fileSizeBytes ?? 0) >= LARGE_FILE_THRESHOLD)
      .sort((a, b) => (b.fileSizeBytes ?? 0) - (a.fileSizeBytes ?? 0));

    const staleFiles = existingFiles
      .filter((v) => v.lastWatchedAt && v.lastWatchedAt < staleThreshold)
      .sort((a, b) => (a.lastWatchedAt ?? 0) - (b.lastWatchedAt ?? 0));

    const neverWatched = existingFiles
      .filter((v) => !v.lastWatchedAt)
      .sort((a, b) => (b.fileSizeBytes ?? 0) - (a.fileSizeBytes ?? 0));

    const missingFiles = downloadsQuery.data.filter((v) => !v.fileExists);

    const totalSize = existingFiles.reduce((sum, v) => sum + (v.fileSizeBytes ?? 0), 0);
    const largeFilesSize = largeFiles.reduce((sum, v) => sum + (v.fileSizeBytes ?? 0), 0);
    const staleFilesSize = staleFiles.reduce((sum, v) => sum + (v.fileSizeBytes ?? 0), 0);
    const neverWatchedSize = neverWatched.reduce((sum, v) => sum + (v.fileSizeBytes ?? 0), 0);

    // Calculate potential savings if all files were optimized to 720p
    const potentialSavings720p = Math.round(totalSize * (1 - ESTIMATED_COMPRESSION_RATIO["720p"]));

    return {
      totalSize,
      totalVideos: downloadsQuery.data.length,
      largeFiles,
      largeFilesSize,
      staleFiles,
      staleFilesSize,
      neverWatched,
      neverWatchedSize,
      missingFiles,
      potentialSavings720p,
    };
  }, [downloadsQuery.data]);

  const filteredVideos = useMemo(() => {
    if (!downloadsQuery.data) return [];
    // Only show videos that have files
    let list = downloadsQuery.data.filter((video) => video.fileExists);

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (video) =>
          video.title.toLowerCase().includes(q) ||
          (video.channelTitle?.toLowerCase().includes(q) ?? false) ||
          video.videoId.toLowerCase().includes(q)
      );
    }

    if (activityFilter !== "all") {
      const now = Date.now();
      const threshold =
        activityFilter === "30d"
          ? now - 30 * 24 * 60 * 60 * 1000
          : activityFilter === "90d"
            ? now - 90 * 24 * 60 * 60 * 1000
            : null;

      list = list.filter((video) => {
        if (activityFilter === "never") {
          return !video.lastWatchedAt;
        }
        if (!threshold) return true;
        if (!video.lastWatchedAt) return true;
        return video.lastWatchedAt < threshold;
      });
    }

    const sorted = [...list].sort((a, b) => {
      const direction = sortOrder === "asc" ? 1 : -1;
      switch (sortKey) {
        case "size":
          return direction * ((a.fileSizeBytes ?? 0) - (b.fileSizeBytes ?? 0));
        case "lastWatched":
          return direction * ((a.lastWatchedAt ?? 0) - (b.lastWatchedAt ?? 0));
        default:
          return 0;
      }
    });
    return sorted;
  }, [downloadsQuery.data, search, activityFilter, sortKey, sortOrder]);

  const selectedIds = useMemo(
    () => Object.keys(selected).filter((videoId) => selected[videoId]),
    [selected]
  );

  const allVisibleSelected =
    filteredVideos.length > 0 && filteredVideos.every((video) => selected[video.videoId]);
  const someVisibleSelected = filteredVideos.some((video) => selected[video.videoId]);

  const toggleSort = (key: typeof sortKey): void => {
    setSortKey((prevKey) => {
      if (prevKey === key) {
        setSortOrder((prevOrder) => (prevOrder === "asc" ? "desc" : "asc"));
        return prevKey;
      }
      setSortOrder("desc");
      return key;
    });
  };

  const handleDelete = (video: StorageVideo): void => {
    if (deleteMutation.isPending) return;
    const confirmed = window.confirm(
      `Delete downloaded file for "${video.title}"? This cannot be undone.`
    );
    if (!confirmed) return;
    deleteMutation.mutate(video.videoId);
  };

  const handleBulkDelete = (): void => {
    if (!selectedIds.length || bulkDeleteMutation.isPending) return;
    const confirmed = window.confirm(
      `Delete ${selectedIds.length} selected ${selectedIds.length === 1 ? "video" : "videos"}?`
    );
    if (!confirmed) return;
    bulkDeleteMutation.mutate(selectedIds);
  };

  const handleSelectAll = (checked: boolean): void => {
    setSelected((prev) => {
      if (!checked) {
        const next = { ...prev };
        filteredVideos.forEach((video) => {
          delete next[video.videoId];
        });
        return next;
      }
      const next = { ...prev };
      filteredVideos.forEach((video) => {
        next[video.videoId] = true;
      });
      return next;
    });
  };

  const toggleSelection = (videoId: string, checked: boolean): void => {
    setSelected((prev) => {
      const next = { ...prev };
      if (checked) {
        next[videoId] = true;
      } else {
        delete next[videoId];
      }
      return next;
    });
  };

  // Quick action handlers for CTA cards
  const handleOptimizeLargeFiles = (): void => {
    const validFiles = analytics.largeFiles.filter(
      (v) => v.fileExists && !isVideoOptimizing(v.videoId)
    );
    if (validFiles.length === 0) {
      toast.error("No large files available to optimize");
      return;
    }
    setVideosToOptimize(validFiles);
    setOptimizeDialogOpen(true);
  };

  const handleOptimizeAll = (): void => {
    if (!downloadsQuery.data) return;
    const validFiles = downloadsQuery.data.filter(
      (v) => v.fileExists && !isVideoOptimizing(v.videoId)
    );
    if (validFiles.length === 0) {
      toast.error("No files available to optimize");
      return;
    }
    setVideosToOptimize(validFiles);
    setOptimizeDialogOpen(true);
  };

  useEffect(() => {
    if (!downloadsQuery.data) {
      setSelected({});
      return;
    }
    setSelected((prev) => {
      const next: Record<string, boolean> = {};
      downloadsQuery.data.forEach((video) => {
        if (prev[video.videoId]) {
          next[video.videoId] = true;
        }
      });
      return next;
    });
  }, [downloadsQuery.data]);

  // Check if there are any active optimizations
  const hasActiveOptimizations =
    optimizationStatusQuery.data?.success &&
    optimizationStatusQuery.data.data &&
    (optimizationStatusQuery.data.data.stats.totalActive > 0 ||
      optimizationStatusQuery.data.data.stats.totalQueued > 0);

  return (
    <PageContainer>
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <HardDrive className="h-5 w-5 text-primary sm:h-6 sm:w-6" />
          <h1 className="text-2xl font-bold sm:text-3xl">Storage Manager</h1>
        </div>
        <div className="flex items-center gap-2">
          {selectedIds.length > 0 && (
            <>
              <Button
                variant="secondary"
                size="default"
                className="flex items-center gap-2"
                onClick={handleBulkOptimize}
                disabled={optimizeMutation.isPending}
              >
                <Wand2 className="h-4 w-4" />
                Optimize Selected ({selectedIds.length})
              </Button>
              <Button
                variant="destructive"
                size="default"
                className="flex items-center gap-2"
                onClick={handleBulkDelete}
                disabled={bulkDeleteMutation.isPending}
              >
                <Trash2 className="h-4 w-4" />
                Delete Selected ({selectedIds.length})
              </Button>
            </>
          )}
          <Button
            variant="outline"
            size="sm"
            className="flex items-center gap-2"
            onClick={() => downloadsQuery.refetch()}
            disabled={downloadsQuery.isRefetching}
          >
            <RefreshCw className={`h-4 w-4 ${downloadsQuery.isRefetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Active Optimization Progress Banner */}
      {hasActiveOptimizations && optimizationStatusQuery.data?.data && (
        <Card className="border-primary/50 bg-primary/5">
          <CardContent className="p-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  <span className="font-medium">
                    Optimizing {optimizationStatusQuery.data.data.stats.totalActive} video
                    {optimizationStatusQuery.data.data.stats.totalActive !== 1 ? "s" : ""}
                    {optimizationStatusQuery.data.data.stats.totalQueued > 0 &&
                      ` (${optimizationStatusQuery.data.data.stats.totalQueued} queued)`}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">
                    {Math.round(optimizationStatusQuery.data.data.stats.averageProgress)}%
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-destructive hover:text-destructive"
                    onClick={() => {
                      // Cancel all active jobs
                      const { optimizing, queued } = optimizationStatusQuery.data!.data!;
                      [...optimizing, ...queued].forEach((job) => {
                        cancelOptimizationMutation.mutate(job.id);
                      });
                    }}
                    disabled={cancelOptimizationMutation.isPending}
                  >
                    <XCircle className="mr-1 h-4 w-4" />
                    Cancel All
                  </Button>
                </div>
              </div>
              <Progress
                value={optimizationStatusQuery.data.data.stats.averageProgress}
                className="h-2"
              />
              {/* Show individual job progress */}
              <div className="space-y-2">
                {optimizationStatusQuery.data.data.optimizing.map((job) => (
                  <div key={job.id} className="flex items-center justify-between text-sm">
                    <span className="truncate pr-2 text-muted-foreground">
                      {job.title?.slice(0, 40)}
                      {(job.title?.length ?? 0) > 40 ? "..." : ""}
                    </span>
                    <div className="flex items-center gap-2">
                      <div className="w-24">
                        <Progress value={job.progress} className="h-1.5" />
                      </div>
                      <span className="w-10 text-right text-xs">{job.progress}%</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => cancelOptimizationMutation.mutate(job.id)}
                        disabled={cancelOptimizationMutation.isPending}
                      >
                        <XCircle className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
                {optimizationStatusQuery.data.data.queued.slice(0, 3).map((job) => (
                  <div key={job.id} className="flex items-center justify-between text-sm">
                    <span className="truncate pr-2 text-muted-foreground">
                      {job.title?.slice(0, 40)}
                      {(job.title?.length ?? 0) > 40 ? "..." : ""}
                    </span>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-xs">
                        Queued
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => cancelOptimizationMutation.mutate(job.id)}
                        disabled={cancelOptimizationMutation.isPending}
                      >
                        <XCircle className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
                {optimizationStatusQuery.data.data.queued.length > 3 && (
                  <p className="text-xs text-muted-foreground">
                    +{optimizationStatusQuery.data.data.queued.length - 3} more in queue
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick Stats Summary */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card className="overflow-hidden border-0 bg-gradient-to-br from-primary/5 via-background to-background shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-primary/10 p-2.5">
                <HardDrive className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold tracking-tight">
                  {formatBytes(analytics.totalSize)}
                </p>
                <p className="text-xs text-muted-foreground">{analytics.totalVideos} videos</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-0 bg-gradient-to-br from-emerald-500/5 via-background to-background shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-emerald-500/10 p-2.5">
                <TrendingDown className="h-5 w-5 text-emerald-500" />
              </div>
              <div>
                <p className="text-2xl font-bold tracking-tight text-emerald-500">
                  {formatBytes(analytics.potentialSavings720p)}
                </p>
                <p className="text-xs text-muted-foreground">Potential savings</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-0 bg-gradient-to-br from-orange-500/5 via-background to-background shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-orange-500/10 p-2.5">
                <FileWarning className="h-5 w-5 text-orange-500" />
              </div>
              <div>
                <p className="text-2xl font-bold tracking-tight">{analytics.largeFiles.length}</p>
                <p className="text-xs text-muted-foreground">Large files (&gt;100MB)</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-0 bg-gradient-to-br from-violet-500/5 via-background to-background shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-violet-500/10 p-2.5">
                <Clock className="h-5 w-5 text-violet-500" />
              </div>
              <div>
                <p className="text-2xl font-bold tracking-tight">{analytics.staleFiles.length}</p>
                <p className="text-xs text-muted-foreground">Not watched in 30d</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Optimization Opportunity Cards - CTAs */}
      <div className="grid gap-3 md:grid-cols-2">
        {/* Large Files Card */}
        {analytics.largeFiles.length > 0 && (
          <Card className="overflow-hidden border-orange-500/20 bg-gradient-to-br from-orange-500/5 via-background to-background">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="rounded-lg bg-orange-500/10 p-1.5">
                    <FileWarning className="h-4 w-4 text-orange-500" />
                  </div>
                  <CardTitle className="text-sm font-semibold">Large Files</CardTitle>
                </div>
                <Badge variant="secondary" className="bg-orange-500/10 text-orange-500">
                  {formatBytes(analytics.largeFilesSize)}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              <div className="space-y-1.5">
                {analytics.largeFiles.slice(0, 2).map((v) => (
                  <div key={v.videoId} className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate text-muted-foreground">{v.title}</span>
                    <span className="shrink-0 font-mono text-muted-foreground">
                      {formatBytes(v.fileSizeBytes)}
                    </span>
                  </div>
                ))}
                {analytics.largeFiles.length > 2 && (
                  <p className="text-[10px] text-muted-foreground">
                    +{analytics.largeFiles.length - 2} more
                  </p>
                )}
              </div>
              <Button
                onClick={handleOptimizeLargeFiles}
                className="w-full gap-2 bg-orange-500 text-white hover:bg-orange-600"
                size="sm"
                disabled={optimizeMutation.isPending}
              >
                <Wand2 className="h-3.5 w-3.5" />
                Optimize Large Files
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Optimize All Card */}
        {analytics.totalVideos > 0 && (
          <Card className="overflow-hidden border-emerald-500/20 bg-gradient-to-br from-emerald-500/5 via-background to-background">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="rounded-lg bg-emerald-500/10 p-1.5">
                    <TrendingDown className="h-4 w-4 text-emerald-500" />
                  </div>
                  <CardTitle className="text-sm font-semibold">Optimize Everything</CardTitle>
                </div>
                <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-500">
                  Save ~{formatBytes(analytics.potentialSavings720p)}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-xs">
                <div className="space-y-0.5">
                  <p className="text-muted-foreground">Current</p>
                  <p className="font-semibold">{formatBytes(analytics.totalSize)}</p>
                </div>
                <div className="text-muted-foreground">→</div>
                <div className="space-y-0.5 text-right">
                  <p className="text-muted-foreground">After</p>
                  <p className="font-semibold text-emerald-500">
                    ~{formatBytes(analytics.totalSize - analytics.potentialSavings720p)}
                  </p>
                </div>
              </div>
              <Button
                onClick={handleOptimizeAll}
                className="w-full gap-2 bg-emerald-500 text-white hover:bg-emerald-600"
                size="sm"
                disabled={optimizeMutation.isPending}
              >
                <Wand2 className="h-3.5 w-3.5" />
                Optimize All Videos
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Search and Filters */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card/50 p-3 backdrop-blur-sm">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search videos..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 border-0 bg-muted/50 pl-9 focus-visible:ring-1"
          />
        </div>
        <div className="flex items-center gap-4 border-l pl-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Watched:</span>
            <div className="flex gap-1">
              {(
                [
                  { value: "all", label: "Any" },
                  { value: "never", label: "Never" },
                  { value: "30d", label: ">30d" },
                  { value: "90d", label: ">90d" },
                ] satisfies Array<{ value: "all" | "never" | "30d" | "90d"; label: string }>
              ).map((option) => (
                <Button
                  key={option.value}
                  variant={activityFilter === option.value ? "secondary" : "ghost"}
                  size="sm"
                  className="h-7 px-2.5 text-xs"
                  onClick={() => setActivityFilter(option.value)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Videos Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">
              Downloaded Videos{" "}
              {filteredVideos.length > 0 && `(${filteredVideos.length.toLocaleString()})`}
            </CardTitle>
            {selectedIds.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  {selectedIds.length} {selectedIds.length === 1 ? "video" : "videos"} selected
                </span>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="overflow-hidden p-0">
          {downloadsQuery.isLoading ? (
            <div className="space-y-2 p-6">
              {Array.from({ length: 8 }).map((_, index) => (
                <div key={index} className="h-12 animate-pulse rounded bg-muted" />
              ))}
            </div>
          ) : filteredVideos.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              {search || activityFilter !== "all"
                ? "No videos match your filters."
                : "No downloaded videos with files."}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-10">
                    <Checkbox
                      checked={
                        allVisibleSelected ? true : someVisibleSelected ? "indeterminate" : false
                      }
                      onCheckedChange={(value) => handleSelectAll(value === true)}
                      aria-label="Select all videos"
                    />
                  </TableHead>
                  <TableHead className="min-w-[300px]">Video</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>
                    <button
                      type="button"
                      className="flex items-center gap-1 transition-colors hover:text-foreground"
                      onClick={() => toggleSort("size")}
                    >
                      <span>Size</span>
                      <span className="text-primary">
                        {sortKey === "size" && (sortOrder === "asc" ? "↑" : "↓")}
                      </span>
                    </button>
                  </TableHead>
                  <TableHead>
                    <button
                      type="button"
                      className="flex items-center gap-1 transition-colors hover:text-foreground"
                      onClick={() => toggleSort("lastWatched")}
                    >
                      <span>Watched</span>
                      <span className="text-primary">
                        {sortKey === "lastWatched" && (sortOrder === "asc" ? "↑" : "↓")}
                      </span>
                    </button>
                  </TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredVideos.map((video) => (
                  <TableRow
                    key={video.videoId}
                    data-state={selected[video.videoId] ? "selected" : undefined}
                    className="group transition-colors hover:bg-muted/50"
                  >
                    <TableCell className="w-10">
                      <Checkbox
                        checked={selected[video.videoId] ?? false}
                        onCheckedChange={(value) => toggleSelection(video.videoId, value === true)}
                        aria-label="Select video"
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        {/* Thumbnail with play overlay */}
                        <Link
                          to="/player"
                          search={{
                            videoId: video.videoId,
                            playlistId: undefined,
                            playlistIndex: undefined,
                          }}
                          className="group/thumb relative shrink-0"
                        >
                          <div className="relative h-12 w-20 overflow-hidden rounded-md bg-muted">
                            <Thumbnail
                              thumbnailPath={video.thumbnailPath}
                              thumbnailUrl={video.thumbnailUrl}
                              alt={video.title}
                              className="h-full w-full object-cover transition-transform group-hover/thumb:scale-105"
                              fallbackIcon={<Play className="h-4 w-4 text-muted-foreground" />}
                            />
                            {/* Play overlay on hover */}
                            <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover/thumb:opacity-100">
                              <div className="rounded-full bg-white/90 p-1.5">
                                <Play className="h-3 w-3 fill-current text-black" />
                              </div>
                            </div>
                            {/* Missing file overlay */}
                            {!video.fileExists && (
                              <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                                <FileWarning className="h-4 w-4 text-red-400" />
                              </div>
                            )}
                          </div>
                        </Link>
                        {/* Title and metadata */}
                        <div className="flex min-w-0 flex-col">
                          <Link
                            to="/player"
                            search={{
                              videoId: video.videoId,
                              playlistId: undefined,
                              playlistIndex: undefined,
                            }}
                            className="line-clamp-1 font-medium transition-colors hover:text-primary"
                          >
                            {video.title}
                          </Link>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                            <span className="font-mono">{video.videoId}</span>
                            {!video.fileExists && (
                              <Badge variant="destructive" className="h-4 px-1 text-[10px]">
                                Missing
                              </Badge>
                            )}
                            {(video.fileSizeBytes ?? 0) >= LARGE_FILE_THRESHOLD && (
                              <Badge
                                variant="outline"
                                className="h-4 border-orange-500/50 px-1 text-[10px] text-orange-500"
                              >
                                Large
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {video.channelTitle ?? "Unknown"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm tabular-nums">
                      {formatDuration(video.durationSeconds)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm tabular-nums">
                      {formatBytes(video.fileSizeBytes)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {formatRelativeDate(video.lastWatchedAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Play button */}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-muted-foreground hover:bg-primary/10 hover:text-primary"
                          asChild
                          title={
                            video.fileExists ? "Play video" : "File missing - click to re-download"
                          }
                        >
                          <Link
                            to="/player"
                            search={{
                              videoId: video.videoId,
                              playlistId: undefined,
                              playlistIndex: undefined,
                            }}
                          >
                            <Play className="h-4 w-4" />
                          </Link>
                        </Button>
                        {/* Open on YouTube */}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                          onClick={() =>
                            window.open(
                              `https://www.youtube.com/watch?v=${video.videoId}`,
                              "_blank"
                            )
                          }
                          title="Open on YouTube"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                        {/* Optimize button */}
                        {isVideoOptimizing(video.videoId) ? (
                          <div className="flex items-center gap-1.5">
                            <Loader2 className="h-4 w-4 animate-spin text-primary" />
                            <div className="w-16">
                              <Progress
                                value={getOptimizationProgress(video.videoId) ?? 0}
                                className="h-1.5"
                              />
                            </div>
                            <span className="w-7 text-[10px] tabular-nums text-muted-foreground">
                              {getOptimizationProgress(video.videoId) ?? 0}%
                            </span>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                              onClick={() => {
                                const jobId = getOptimizationJobId(video.videoId);
                                if (jobId) cancelOptimizationMutation.mutate(jobId);
                              }}
                              disabled={cancelOptimizationMutation.isPending}
                              title="Cancel optimization"
                            >
                              <XCircle className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOptimize(video)}
                            disabled={
                              !video.fileExists ||
                              optimizeMutation.isPending ||
                              hasActiveOptimizations
                            }
                            className="h-8 w-8 p-0 text-muted-foreground hover:bg-blue-500/10 hover:text-blue-500"
                            title={
                              !video.fileExists
                                ? "File missing"
                                : hasActiveOptimizations
                                  ? "Wait for current optimization"
                                  : "Optimize to reduce size"
                            }
                          >
                            <Wand2 className="h-4 w-4" />
                          </Button>
                        )}
                        {/* Delete button */}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(video)}
                          disabled={deleteMutation.isPending || isVideoOptimizing(video.videoId)}
                          className="h-8 w-8 p-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          title={
                            isVideoOptimizing(video.videoId)
                              ? "Cannot delete while optimizing"
                              : "Delete video"
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
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
        onConfirm={handleOptimizeConfirm}
        isLoading={optimizeMutation.isPending}
        ffmpegAvailable={ffmpegStatusQuery.data?.available ?? true}
      />
    </PageContainer>
  );
}
