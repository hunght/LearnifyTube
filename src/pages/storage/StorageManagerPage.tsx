import React, { useEffect, useMemo, useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { trpcClient } from "@/utils/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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
  Zap,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { OptimizeDialog } from "@/components/OptimizeDialog";
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
  const [fileFilter, setFileFilter] = useState<"all" | "missing">("all");
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
    let list = downloadsQuery.data;

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (video) =>
          video.title.toLowerCase().includes(q) ||
          (video.channelTitle?.toLowerCase().includes(q) ?? false) ||
          video.videoId.toLowerCase().includes(q)
      );
    }

    if (fileFilter === "missing") {
      list = list.filter((video) => !video.fileExists);
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
  }, [downloadsQuery.data, search, fileFilter, activityFilter, sortKey, sortOrder]);

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

  const handleOptimizeStaleFiles = (): void => {
    const validFiles = analytics.staleFiles.filter(
      (v) => v.fileExists && !isVideoOptimizing(v.videoId)
    );
    if (validFiles.length === 0) {
      toast.error("No stale files available to optimize");
      return;
    }
    setVideosToOptimize(validFiles);
    setOptimizeDialogOpen(true);
  };

  const handleOptimizeNeverWatched = (): void => {
    const validFiles = analytics.neverWatched.filter(
      (v) => v.fileExists && !isVideoOptimizing(v.videoId)
    );
    if (validFiles.length === 0) {
      toast.error("No unwatched files available to optimize");
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
    <div className="container mx-auto space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <HardDrive className="h-6 w-6 text-primary" />
          <h1 className="text-3xl font-bold">Storage Manager</h1>
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
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/10 p-2">
                <HardDrive className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{formatBytes(analytics.totalSize)}</p>
                <p className="text-sm text-muted-foreground">{analytics.totalVideos} videos</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-green-500/10 p-2">
                <TrendingDown className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-green-600">
                  {formatBytes(analytics.potentialSavings720p)}
                </p>
                <p className="text-sm text-muted-foreground">Potential savings</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-orange-500/10 p-2">
                <FileWarning className="h-5 w-5 text-orange-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{analytics.largeFiles.length}</p>
                <p className="text-sm text-muted-foreground">Large files (&gt;100MB)</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-purple-500/10 p-2">
                <Clock className="h-5 w-5 text-purple-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{analytics.staleFiles.length}</p>
                <p className="text-sm text-muted-foreground">Not watched in 30d</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Optimization Opportunity Cards - CTAs */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Large Files Card */}
        {analytics.largeFiles.length > 0 && (
          <Card className="border-orange-500/30 bg-gradient-to-br from-orange-500/5 to-transparent">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <FileWarning className="h-5 w-5 text-orange-500" />
                <CardTitle className="text-base">Large Files</CardTitle>
              </div>
              <CardDescription>
                {analytics.largeFiles.length} files using {formatBytes(analytics.largeFilesSize)}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-3 space-y-1">
                {analytics.largeFiles.slice(0, 3).map((v) => (
                  <div key={v.videoId} className="flex items-center justify-between text-sm">
                    <span className="truncate pr-2 text-muted-foreground">{v.title}</span>
                    <Badge variant="secondary" className="shrink-0">
                      {formatBytes(v.fileSizeBytes)}
                    </Badge>
                  </div>
                ))}
                {analytics.largeFiles.length > 3 && (
                  <p className="text-xs text-muted-foreground">
                    +{analytics.largeFiles.length - 3} more files
                  </p>
                )}
              </div>
              <Button
                onClick={handleOptimizeLargeFiles}
                className="w-full gap-2"
                variant="default"
                disabled={optimizeMutation.isPending}
              >
                <Wand2 className="h-4 w-4" />
                Optimize All Large Files
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Stale Files Card */}
        {analytics.staleFiles.length > 0 && (
          <Card className="border-purple-500/30 bg-gradient-to-br from-purple-500/5 to-transparent">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-purple-500" />
                <CardTitle className="text-base">Not Watched Recently</CardTitle>
              </div>
              <CardDescription>
                {analytics.staleFiles.length} files, last watched over 30 days ago
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-3 space-y-1">
                {analytics.staleFiles.slice(0, 3).map((v) => (
                  <div key={v.videoId} className="flex items-center justify-between text-sm">
                    <span className="truncate pr-2 text-muted-foreground">{v.title}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatRelativeDate(v.lastWatchedAt)}
                    </span>
                  </div>
                ))}
                {analytics.staleFiles.length > 3 && (
                  <p className="text-xs text-muted-foreground">
                    +{analytics.staleFiles.length - 3} more files
                  </p>
                )}
              </div>
              <Button
                onClick={handleOptimizeStaleFiles}
                className="w-full gap-2"
                variant="default"
                disabled={optimizeMutation.isPending}
              >
                <Wand2 className="h-4 w-4" />
                Optimize Stale Files
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Never Watched Card */}
        {analytics.neverWatched.length > 0 && (
          <Card className="border-blue-500/30 bg-gradient-to-br from-blue-500/5 to-transparent">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-blue-500" />
                <CardTitle className="text-base">Never Watched</CardTitle>
              </div>
              <CardDescription>
                {analytics.neverWatched.length} files ({formatBytes(analytics.neverWatchedSize)})
                never played
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-3 space-y-1">
                {analytics.neverWatched.slice(0, 3).map((v) => (
                  <div key={v.videoId} className="flex items-center justify-between text-sm">
                    <span className="truncate pr-2 text-muted-foreground">{v.title}</span>
                    <Badge variant="secondary" className="shrink-0">
                      {formatBytes(v.fileSizeBytes)}
                    </Badge>
                  </div>
                ))}
                {analytics.neverWatched.length > 3 && (
                  <p className="text-xs text-muted-foreground">
                    +{analytics.neverWatched.length - 3} more files
                  </p>
                )}
              </div>
              <Button
                onClick={handleOptimizeNeverWatched}
                className="w-full gap-2"
                variant="default"
                disabled={optimizeMutation.isPending}
              >
                <Wand2 className="h-4 w-4" />
                Optimize Unwatched Files
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Optimize All Card - Always show if there are files */}
        {analytics.totalVideos > 0 && (
          <Card className="border-green-500/30 bg-gradient-to-br from-green-500/5 to-transparent">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <TrendingDown className="h-5 w-5 text-green-500" />
                <CardTitle className="text-base">Optimize Everything</CardTitle>
              </div>
              <CardDescription>
                Save up to {formatBytes(analytics.potentialSavings720p)} by converting to 720p
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Current size:</span>
                  <span className="font-medium">{formatBytes(analytics.totalSize)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">After optimization:</span>
                  <span className="font-medium text-green-600">
                    ~{formatBytes(analytics.totalSize - analytics.potentialSavings720p)}
                  </span>
                </div>
              </div>
              <Button
                onClick={handleOptimizeAll}
                className="w-full gap-2 bg-green-600 hover:bg-green-700"
                disabled={optimizeMutation.isPending}
              >
                <Wand2 className="h-4 w-4" />
                Optimize All Videos
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Search and Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="relative min-w-[200px] flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 pl-9"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="whitespace-nowrap text-xs text-muted-foreground">File:</span>
              <RadioGroup
                value={fileFilter}
                onValueChange={(value) => {
                  if (value === "all" || value === "missing") {
                    setFileFilter(value);
                  }
                }}
                className="flex flex-row gap-3"
              >
                <div className="flex items-center space-x-1.5">
                  <RadioGroupItem value="all" id="file-all" className="h-3.5 w-3.5" />
                  <label htmlFor="file-all" className="cursor-pointer text-xs">
                    All
                  </label>
                </div>
                <div className="flex items-center space-x-1.5">
                  <RadioGroupItem value="missing" id="file-missing" className="h-3.5 w-3.5" />
                  <label htmlFor="file-missing" className="cursor-pointer text-xs">
                    Missing
                  </label>
                </div>
              </RadioGroup>
            </div>
            <div className="flex items-center gap-2">
              <span className="whitespace-nowrap text-xs text-muted-foreground">Activity:</span>
              <RadioGroup
                value={activityFilter}
                onValueChange={(value) => {
                  if (value === "all" || value === "never" || value === "30d" || value === "90d") {
                    setActivityFilter(value);
                  }
                }}
                className="flex flex-row gap-3"
              >
                <div className="flex items-center space-x-1.5">
                  <RadioGroupItem value="all" id="activity-all" className="h-3.5 w-3.5" />
                  <label htmlFor="activity-all" className="cursor-pointer text-xs">
                    Any
                  </label>
                </div>
                <div className="flex items-center space-x-1.5">
                  <RadioGroupItem value="never" id="activity-never" className="h-3.5 w-3.5" />
                  <label htmlFor="activity-never" className="cursor-pointer text-xs">
                    Never
                  </label>
                </div>
                <div className="flex items-center space-x-1.5">
                  <RadioGroupItem value="30d" id="activity-30d" className="h-3.5 w-3.5" />
                  <label htmlFor="activity-30d" className="cursor-pointer text-xs">
                    30d
                  </label>
                </div>
                <div className="flex items-center space-x-1.5">
                  <RadioGroupItem value="90d" id="activity-90d" className="h-3.5 w-3.5" />
                  <label htmlFor="activity-90d" className="cursor-pointer text-xs">
                    90d
                  </label>
                </div>
              </RadioGroup>
            </div>
          </div>
        </CardContent>
      </Card>

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
              {search || fileFilter !== "all" || activityFilter !== "all"
                ? "No videos match your filters."
                : "No completed downloads yet."}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={
                        allVisibleSelected ? true : someVisibleSelected ? "indeterminate" : false
                      }
                      onCheckedChange={(value) => handleSelectAll(value === true)}
                      aria-label="Select all videos"
                    />
                  </TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>
                    <button
                      type="button"
                      className="flex items-center gap-1"
                      onClick={() => toggleSort("size")}
                    >
                      <span>Size</span>
                      {sortKey === "size" && <span>{sortOrder === "asc" ? "↑" : "↓"}</span>}
                    </button>
                  </TableHead>
                  <TableHead>
                    <button
                      type="button"
                      className="flex items-center gap-1"
                      onClick={() => toggleSort("lastWatched")}
                    >
                      <span>Last Watched</span>
                      {sortKey === "lastWatched" && <span>{sortOrder === "asc" ? "↑" : "↓"}</span>}
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
                  >
                    <TableCell className="w-10">
                      <Checkbox
                        checked={selected[video.videoId] ?? false}
                        onCheckedChange={(value) => toggleSelection(video.videoId, value === true)}
                        aria-label="Select video"
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{video.title}</span>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span>{video.videoId}</span>
                          {!video.fileExists && (
                            <Badge variant="destructive" className="text-[10px]">
                              Missing file
                            </Badge>
                          )}
                          {(video.fileSizeBytes ?? 0) >= LARGE_FILE_THRESHOLD && (
                            <Badge
                              variant="outline"
                              className="border-orange-500/50 text-[10px] text-orange-600"
                            >
                              Large
                            </Badge>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {video.channelTitle ?? "Unknown channel"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatDuration(video.durationSeconds)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatBytes(video.fileSizeBytes)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatRelativeDate(video.lastWatchedAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {isVideoOptimizing(video.videoId) ? (
                          <div className="flex items-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin text-primary" />
                            <div className="w-20">
                              <Progress
                                value={getOptimizationProgress(video.videoId) ?? 0}
                                className="h-2"
                              />
                            </div>
                            <span className="w-8 text-xs text-muted-foreground">
                              {getOptimizationProgress(video.videoId) ?? 0}%
                            </span>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
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
                            variant="outline"
                            size="sm"
                            onClick={() => handleOptimize(video)}
                            disabled={
                              !video.fileExists ||
                              optimizeMutation.isPending ||
                              hasActiveOptimizations
                            }
                            className="flex items-center gap-1"
                            title={
                              hasActiveOptimizations
                                ? "Wait for current optimization to complete"
                                : "Optimize video to reduce file size"
                            }
                          >
                            <Wand2 className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDelete(video)}
                          disabled={deleteMutation.isPending || isVideoOptimizing(video.videoId)}
                          className="flex items-center gap-1"
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
    </div>
  );
}
