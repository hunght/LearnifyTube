import { useCallback, useEffect, useRef, useState } from "react";
import { DownloadIcon, ExternalLinkIcon, XIcon, SparklesIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { trpcClient } from "@/utils/trpc";
import { logger } from "@/helpers/logger";

const DOWNLOAD_PAGE_URL = "https://github.com/hunght/LearnifyTube/releases/latest";

interface UpdateAvailableModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentVersion: string;
  latestVersion: string;
  downloadUrl: string;
  releaseNotes?: string;
}

export function UpdateAvailableModal({
  open,
  onOpenChange,
  currentVersion,
  latestVersion,
  downloadUrl,
  releaseNotes,
}: UpdateAvailableModalProps): React.JSX.Element {
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadComplete, setDownloadComplete] = useState(false);
  const [downloadedFilePath, setDownloadedFilePath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const progressTimerRef = useRef<NodeJS.Timeout | null>(null);

  const startProgressTimer = useCallback(() => {
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current);
    }

    progressTimerRef.current = setInterval(() => {
      setDownloadProgress((prev) => {
        if (prev >= 90) return prev;
        const increment = Math.round(Math.random() * 10 + 5);
        return Math.min(prev + increment, 90);
      });
    }, 1000);
  }, []);

  const stopProgressTimer = useCallback(() => {
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      stopProgressTimer();
    };
  }, [stopProgressTimer]);

  const handleDownloadUpdate = useCallback(async () => {
    if (!downloadUrl) return;

    setIsDownloading(true);
    setDownloadProgress(0);
    setError(null);
    startProgressTimer();

    try {
      const result = await trpcClient.utils.downloadUpdate.mutate({
        downloadUrl,
      });

      stopProgressTimer();
      setDownloadProgress(100);

      if (result.status === "success") {
        setDownloadComplete(true);
        setDownloadedFilePath(result.filePath);
      } else {
        setError(result.message || "Failed to download update");
      }
    } catch (err) {
      logger.error("[update-modal] Failed to download update", err);
      stopProgressTimer();
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage || "An error occurred while downloading the update");
    } finally {
      setIsDownloading(false);
    }
  }, [downloadUrl, startProgressTimer, stopProgressTimer]);

  const handleInstallAndQuit = useCallback(async () => {
    if (downloadedFilePath) {
      await trpcClient.utils.openLocalFile.mutate({ filePath: downloadedFilePath });
      setTimeout(() => {
        void trpcClient.utils.quitApp.mutate();
      }, 1000);
    }
  }, [downloadedFilePath]);

  const handleOpenFolder = useCallback(async () => {
    if (downloadedFilePath) {
      const folderPath = downloadedFilePath.replace(/[\\/][^\\/]+$/, "");
      await trpcClient.utils.openFolder.mutate({ folderPath });
    }
  }, [downloadedFilePath]);

  const handleOpenInBrowser = useCallback(() => {
    void trpcClient.utils.openExternalUrl.mutate({ url: downloadUrl || DOWNLOAD_PAGE_URL });
  }, [downloadUrl]);

  const handleRemindLater = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SparklesIcon className="h-5 w-5 text-primary" />
            Update Available
          </DialogTitle>
          <DialogDescription>A new version of LearnifyTube is available.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="flex items-center justify-between rounded-lg bg-muted p-3">
            <div>
              <p className="text-sm font-medium">Current Version</p>
              <p className="font-mono text-sm text-muted-foreground">{currentVersion}</p>
            </div>
            <div className="text-2xl text-muted-foreground">&rarr;</div>
            <div>
              <p className="text-sm font-medium">New Version</p>
              <p className="font-mono text-sm text-primary">{latestVersion}</p>
            </div>
          </div>

          {releaseNotes && (
            <div className="max-h-32 overflow-y-auto rounded-lg border p-3">
              <p className="text-sm font-medium">What&apos;s new:</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                {releaseNotes}
              </p>
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3">
              <p className="text-sm text-destructive">{error}</p>
              <Button variant="outline" size="sm" className="mt-2" onClick={handleOpenInBrowser}>
                <ExternalLinkIcon className="mr-2 h-4 w-4" />
                Download from Browser
              </Button>
            </div>
          )}

          {isDownloading && (
            <div className="space-y-2">
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${downloadProgress}%` }}
                />
              </div>
              <p className="text-center text-sm text-muted-foreground">
                Downloading... {downloadProgress}%
              </p>
            </div>
          )}

          {downloadComplete && (
            <div className="rounded-lg border border-green-500/50 bg-green-500/10 p-3">
              <p className="text-sm text-green-600 dark:text-green-400">
                Download complete! Click &quot;Install & Quit&quot; to install the update.
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          {!downloadComplete ? (
            <>
              <Button variant="outline" onClick={handleRemindLater} className="w-full sm:w-auto">
                <XIcon className="mr-2 h-4 w-4" />
                Remind Later
              </Button>
              <Button
                onClick={handleDownloadUpdate}
                disabled={isDownloading}
                className="w-full sm:w-auto"
              >
                <DownloadIcon className="mr-2 h-4 w-4" />
                {isDownloading ? `Downloading... ${downloadProgress}%` : "Download Update"}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={handleOpenFolder} className="w-full sm:w-auto">
                Open Folder
              </Button>
              <Button onClick={handleInstallAndQuit} className="w-full sm:w-auto">
                Install & Quit
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
