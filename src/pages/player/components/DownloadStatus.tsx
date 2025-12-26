import React from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { trpcClient } from "@/utils/trpc";
import Thumbnail from "@/components/Thumbnail";

interface DownloadStatusProps {
  videoId: string;
  status?: string | null;
  progress?: number | null;
  onStartDownload: () => void;
  isStarting: boolean;
  thumbnailPath?: string | null;
  thumbnailUrl?: string | null;
  title?: string;
}

export function DownloadStatus({
  videoId,
  status,
  progress,
  onStartDownload,
  isStarting,
  thumbnailPath,
  thumbnailUrl,
  title,
}: DownloadStatusProps): React.JSX.Element {
  const statusText = (status?: string | null, progress?: number | null): string | null => {
    if (!status) return null;
    switch (status) {
      case "completed":
        return "Downloaded";
      case "downloading":
        return `Downloading ${progress ?? 0}%`;
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

  const isDownloading = status === "downloading" || status === "queued";
  const hasThumbnail = thumbnailPath || thumbnailUrl;

  return (
    <div className="space-y-4">
      {/* Show thumbnail with progress overlay when downloading */}
      {isDownloading && hasThumbnail ? (
        <div className="relative">
          <Thumbnail
            thumbnailPath={thumbnailPath}
            thumbnailUrl={thumbnailUrl}
            alt={title || "Video thumbnail"}
            className="max-h-[60vh] w-full rounded border bg-black object-contain"
          />
          {/* Download progress overlay */}
          <div className="absolute inset-0 flex flex-col items-center justify-center rounded bg-black/60">
            <Loader2 className="mb-3 h-12 w-12 animate-spin text-white" />
            <div className="text-center text-white">
              <p className="text-2xl font-bold">
                {status === "queued" ? "Queued" : `${progress ?? 0}%`}
              </p>
              <p className="text-sm text-white/80">
                {status === "queued" ? "Waiting to start..." : "Downloading..."}
              </p>
            </div>
            {status === "downloading" && (
              <div className="mt-4 w-2/3">
                <Progress
                  value={progress ?? 0}
                  className="h-2 bg-white/20"
                  indicatorClassName="bg-white"
                />
              </div>
            )}
          </div>
        </div>
      ) : (
        <>
          <Alert>
            <AlertTitle>File not available</AlertTitle>
            <AlertDescription>
              The video has no downloaded file yet.{" "}
              {status ? "Current status shown below." : "Start a download to fetch it."}
            </AlertDescription>
          </Alert>

          {/* Show progress if any */}
          {status && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Status: {status}</span>
                <span className="font-medium">{progress ?? 0}%</span>
              </div>
              <Progress
                value={progress ?? 0}
                className="h-2"
                indicatorClassName={
                  status === "completed"
                    ? "bg-green-500"
                    : status === "failed"
                      ? "bg-red-500"
                      : "bg-blue-500"
                }
              />
            </div>
          )}
        </>
      )}

      <div className="flex gap-2">
        <Button
          onClick={onStartDownload}
          disabled={isStarting || ["downloading", "queued"].includes(status || "")}
        >
          {isStarting
            ? "Starting..."
            : ["downloading", "queued"].includes(status || "")
              ? statusText(status, progress)
              : "Download video"}
        </Button>
        {videoId && (
          <Button
            variant="outline"
            onClick={() =>
              trpcClient.utils.openExternalUrl.mutate({
                url: `https://www.youtube.com/watch?v=${videoId}`,
              })
            }
          >
            Open on YouTube
          </Button>
        )}
      </div>
    </div>
  );
}
