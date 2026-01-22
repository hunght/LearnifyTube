import { type ColumnDef } from "@tanstack/react-table";
import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import Thumbnail from "@/components/Thumbnail";
import {
  Play,
  ExternalLink,
  Wand2,
  Trash2,
  XCircle,
  Loader2,
  FileWarning,
  ArrowUpDown,
} from "lucide-react";

export type StorageVideo = {
  videoId: string;
  title: string;
  channelTitle: string | null;
  thumbnailPath: string | null;
  thumbnailUrl: string | null;
  filePath: string | null;
  fileSizeBytes: number | null;
  durationSeconds: number | null;
  lastWatchedAt: number | null;
  fileExists: boolean;
  playlistNames: string[];
};

// Size threshold for "large" files (100MB)
export const LARGE_FILE_THRESHOLD = 100 * 1024 * 1024;

export const formatBytes = (bytes: number | null | undefined): string => {
  if (!bytes || bytes <= 0) return "–";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
};

export const formatDuration = (seconds: number | null | undefined): string => {
  if (!seconds || seconds <= 0) return "–";
  const mins = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${mins}m ${remainingSeconds}s`;
};

export const formatRelativeDate = (timestamp: number | null | undefined): string => {
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

interface ColumnOptions {
  isVideoOptimizing: (videoId: string) => boolean;
  getOptimizationProgress: (videoId: string) => number | null;
  getOptimizationJobId: (videoId: string) => string | null;
  hasActiveOptimizations: boolean;
  onOptimize: (video: StorageVideo) => void;
  onDelete: (video: StorageVideo) => void;
  onCancelOptimization: (jobId: string) => void;
  isOptimizePending: boolean;
  isDeletePending: boolean;
  isCancelPending: boolean;
}

export function createStorageColumns(options: ColumnOptions): ColumnDef<StorageVideo>[] {
  const {
    isVideoOptimizing,
    getOptimizationProgress,
    getOptimizationJobId,
    hasActiveOptimizations,
    onOptimize,
    onDelete,
    onCancelOptimization,
    isOptimizePending,
    isDeletePending,
    isCancelPending,
  } = options;

  return [
    {
      id: "select",
      size: 40,
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && "indeterminate")
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Select row"
        />
      ),
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: "title",
      size: 350,
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="-ml-4"
        >
          Video
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => {
        const video = row.original;
        return (
          <div className="flex items-center gap-3">
            <Link
              to="/player"
              search={{ videoId: video.videoId, playlistId: undefined, playlistIndex: undefined }}
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
                <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover/thumb:opacity-100">
                  <div className="rounded-full bg-white/90 p-1.5">
                    <Play className="h-3 w-3 fill-current text-black" />
                  </div>
                </div>
                {!video.fileExists && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                    <FileWarning className="h-4 w-4 text-red-400" />
                  </div>
                )}
              </div>
            </Link>
            <div className="flex min-w-0 flex-col">
              <Link
                to="/player"
                search={{ videoId: video.videoId, playlistId: undefined, playlistIndex: undefined }}
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
                {(video.fileSizeBytes ?? 0) >= LARGE_FILE_THRESHOLD && video.fileExists && (
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
        );
      },
      filterFn: (row, id, value) => {
        const video = row.original;
        const searchLower = String(value).toLowerCase();
        return (
          video.title.toLowerCase().includes(searchLower) ||
          video.videoId.toLowerCase().includes(searchLower) ||
          (video.channelTitle?.toLowerCase().includes(searchLower) ?? false)
        );
      },
    },
    {
      accessorKey: "channelTitle",
      size: 150,
      header: "Channel",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original.channelTitle ?? "Unknown"}
        </span>
      ),
    },
    {
      accessorKey: "playlistNames",
      size: 150,
      header: "Playlist",
      cell: ({ row }) => {
        const playlists = row.original.playlistNames;
        if (playlists.length === 0) {
          return <span className="text-sm text-muted-foreground">–</span>;
        }
        return (
          <div className="flex flex-wrap gap-1">
            {playlists.slice(0, 2).map((name, i) => (
              <Badge key={i} variant="secondary" className="text-xs">
                {name.length > 20 ? `${name.slice(0, 20)}...` : name}
              </Badge>
            ))}
            {playlists.length > 2 && (
              <Badge variant="outline" className="text-xs">
                +{playlists.length - 2}
              </Badge>
            )}
          </div>
        );
      },
      filterFn: (row, id, value) => {
        if (!Array.isArray(value) || value.length === 0) return true;
        const playlists = row.original.playlistNames;
        return value.some((v) => playlists.includes(v));
      },
    },
    {
      accessorKey: "fileExists",
      size: 80,
      header: "Status",
      cell: ({ row }) => (
        <Badge variant={row.original.fileExists ? "secondary" : "destructive"}>
          {row.original.fileExists ? "OK" : "Missing"}
        </Badge>
      ),
      filterFn: (row, id, value) => {
        if (!Array.isArray(value) || value.length === 0) return true;
        const status = row.original.fileExists ? "exists" : "missing";
        return value.includes(status);
      },
    },
    {
      accessorKey: "durationSeconds",
      size: 100,
      header: "Duration",
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-sm tabular-nums">
          {formatDuration(row.original.durationSeconds)}
        </span>
      ),
    },
    {
      accessorKey: "fileSizeBytes",
      size: 100,
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="-ml-4"
        >
          Size
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-sm tabular-nums">
          {formatBytes(row.original.fileSizeBytes)}
        </span>
      ),
    },
    {
      accessorKey: "lastWatchedAt",
      size: 100,
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="-ml-4"
        >
          Watched
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-sm text-muted-foreground">
          {formatRelativeDate(row.original.lastWatchedAt)}
        </span>
      ),
    },
    {
      id: "actions",
      size: 180,
      header: () => <div className="text-right">Actions</div>,
      cell: ({ row }) => {
        const video = row.original;
        const isOptimizing = isVideoOptimizing(video.videoId);
        const progress = getOptimizationProgress(video.videoId);
        const jobId = getOptimizationJobId(video.videoId);

        return (
          <div className="flex items-center justify-end gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-muted-foreground hover:bg-primary/10 hover:text-primary"
              asChild
              title={video.fileExists ? "Play video" : "File missing - click to re-download"}
            >
              <Link
                to="/player"
                search={{ videoId: video.videoId, playlistId: undefined, playlistIndex: undefined }}
              >
                <Play className="h-4 w-4" />
              </Link>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
              onClick={() =>
                window.open(`https://www.youtube.com/watch?v=${video.videoId}`, "_blank")
              }
              title="Open on YouTube"
            >
              <ExternalLink className="h-4 w-4" />
            </Button>
            {isOptimizing ? (
              <div className="flex items-center gap-1.5">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <div className="w-16">
                  <Progress value={progress ?? 0} className="h-1.5" />
                </div>
                <span className="w-7 text-[10px] tabular-nums text-muted-foreground">
                  {progress ?? 0}%
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                  onClick={() => jobId && onCancelOptimization(jobId)}
                  disabled={isCancelPending}
                  title="Cancel optimization"
                >
                  <XCircle className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onOptimize(video)}
                disabled={!video.fileExists || isOptimizePending || hasActiveOptimizations}
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
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDelete(video)}
              disabled={isDeletePending || isOptimizing}
              className="h-8 w-8 p-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              title={isOptimizing ? "Cannot delete while optimizing" : "Delete video"}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        );
      },
    },
  ];
}
