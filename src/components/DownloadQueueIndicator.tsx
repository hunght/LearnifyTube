/**
 * DownloadQueueIndicator
 *
 * Shows download queue status in the header with a popover for details.
 */

import React, { useState } from "react";
import {
  Download,
  Pause,
  Play,
  X,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { useDownloadQueue } from "@/hooks/use-download-queue";
import { cn } from "@/lib/utils";
import type { QueuedDownload } from "@/services/download-queue/types";

function DownloadStatusIcon({ status }: { status: QueuedDownload["status"] }): React.JSX.Element {
  switch (status) {
    case "downloading":
      return <Download className="h-4 w-4 animate-bounce text-blue-500" />;
    case "completed":
      return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    case "failed":
      return <XCircle className="h-4 w-4 text-red-500" />;
    case "paused":
      return <Pause className="h-4 w-4 text-yellow-500" />;
    case "queued":
    default:
      return <Clock className="h-4 w-4 text-muted-foreground" />;
  }
}

function DownloadItem({
  download,
  onPause,
  onResume,
  onCancel,
  onRetry,
}: {
  download: QueuedDownload;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
  onRetry: () => void;
}): React.JSX.Element {
  const isActive = download.status === "downloading";
  const isPaused = download.status === "paused";
  const isFailed = download.status === "failed";
  const isQueued = download.status === "queued";

  return (
    <div className="space-y-1.5 py-2">
      <div className="flex items-start gap-2">
        <DownloadStatusIcon status={download.status} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium" title={download.title}>
            {download.title || "Unknown video"}
          </p>
          {download.channelTitle && (
            <p className="truncate text-xs text-muted-foreground">{download.channelTitle}</p>
          )}
        </div>
        <div className="flex shrink-0 gap-0.5">
          {(isActive || isQueued) && (
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onPause} title="Pause">
              <Pause className="h-3 w-3" />
            </Button>
          )}
          {isPaused && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={onResume}
              title="Resume"
            >
              <Play className="h-3 w-3" />
            </Button>
          )}
          {isFailed && download.isRetryable && (
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onRetry} title="Retry">
              <RefreshCw className="h-3 w-3" />
            </Button>
          )}
          {(isActive || isPaused || isQueued) && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-destructive hover:text-destructive"
              onClick={onCancel}
              title="Cancel"
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>

      {/* Progress bar for active downloads */}
      {isActive && (
        <div className="space-y-1">
          <Progress value={download.progress} className="h-1.5" />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>{Math.round(download.progress)}%</span>
            <span>
              {download.downloadSpeed && `${download.downloadSpeed}`}
              {download.eta && ` - ${download.eta}`}
            </span>
          </div>
        </div>
      )}

      {/* Error message for failed downloads */}
      {isFailed && download.errorMessage && (
        <p className="truncate text-xs text-red-500" title={download.errorMessage}>
          {download.errorMessage}
        </p>
      )}
    </div>
  );
}

export function DownloadQueueIndicator(): React.JSX.Element | null {
  const [isOpen, setIsOpen] = useState(false);
  const {
    queued,
    downloading,
    paused,
    completed,
    failed,
    activeCount,
    hasActiveDownloads,
    totalProgress,
    pauseDownload,
    resumeDownload,
    cancelDownload,
    retryDownload,
    clearCompleted,
  } = useDownloadQueue();

  // Combine all items for display
  const allItems = [...downloading, ...queued, ...paused, ...failed, ...completed];

  // Don't render if no items at all
  if (allItems.length === 0) {
    return null;
  }

  const hasCompletedOrFailed = completed.length > 0 || failed.length > 0;

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "relative flex h-8 w-8 items-center justify-center p-0",
            hasActiveDownloads && "text-blue-500"
          )}
          title={hasActiveDownloads ? `${activeCount} download(s) in progress` : "Download queue"}
        >
          <Download className={cn("h-4 w-4", hasActiveDownloads && "animate-pulse")} />
          {activeCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-[10px] font-medium text-white">
              {activeCount}
            </span>
          )}
          {/* Progress ring for active downloads */}
          {hasActiveDownloads && (
            <svg className="absolute inset-0 h-8 w-8 -rotate-90" viewBox="0 0 32 32">
              <circle
                cx="16"
                cy="16"
                r="14"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeDasharray={`${(totalProgress / 100) * 88} 88`}
                className="text-blue-500 opacity-50"
              />
            </svg>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold">Downloads</h4>
            {hasCompletedOrFailed && (
              <Button
                variant="ghost"
                size="sm"
                className="h-auto gap-1 px-2 py-1 text-xs"
                onClick={clearCompleted}
              >
                <Trash2 className="h-3 w-3" />
                Clear
              </Button>
            )}
          </div>

          <div className="max-h-80 divide-y overflow-y-auto">
            {downloading.map((item) => (
              <DownloadItem
                key={item.id}
                download={item}
                onPause={() => pauseDownload(item.id)}
                onResume={() => resumeDownload(item.id)}
                onCancel={() => cancelDownload(item.id)}
                onRetry={() => retryDownload(item.id)}
              />
            ))}
            {queued.map((item) => (
              <DownloadItem
                key={item.id}
                download={item}
                onPause={() => pauseDownload(item.id)}
                onResume={() => resumeDownload(item.id)}
                onCancel={() => cancelDownload(item.id)}
                onRetry={() => retryDownload(item.id)}
              />
            ))}
            {paused.map((item) => (
              <DownloadItem
                key={item.id}
                download={item}
                onPause={() => pauseDownload(item.id)}
                onResume={() => resumeDownload(item.id)}
                onCancel={() => cancelDownload(item.id)}
                onRetry={() => retryDownload(item.id)}
              />
            ))}
            {failed.map((item) => (
              <DownloadItem
                key={item.id}
                download={item}
                onPause={() => pauseDownload(item.id)}
                onResume={() => resumeDownload(item.id)}
                onCancel={() => cancelDownload(item.id)}
                onRetry={() => retryDownload(item.id)}
              />
            ))}
            {completed.map((item) => (
              <DownloadItem
                key={item.id}
                download={item}
                onPause={() => pauseDownload(item.id)}
                onResume={() => resumeDownload(item.id)}
                onCancel={() => cancelDownload(item.id)}
                onRetry={() => retryDownload(item.id)}
              />
            ))}
          </div>

          {allItems.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">No downloads</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
