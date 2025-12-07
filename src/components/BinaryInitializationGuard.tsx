import React from "react";
import { useAtomValue } from "jotai";
import { ytDlpStatusAtom, ffmpegStatusAtom } from "@/states/binary-status";
import { LoadingScreen } from "./LoadingScreen";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";
import { logger } from "@/helpers/logger";

interface BinaryInitializationGuardProps {
  children: React.ReactNode;
}

export const BinaryInitializationGuard = ({
  children,
}: BinaryInitializationGuardProps): React.JSX.Element => {
  const ytDlpStatus = useAtomValue(ytDlpStatusAtom);
  const ffmpegStatus = useAtomValue(ffmpegStatusAtom);

  const isYtDlpReady = ytDlpStatus === "ready";
  const isFfmpegReady = ffmpegStatus === "ready";

  const hasError = ytDlpStatus === "error" || ffmpegStatus === "error";

  if (isYtDlpReady && isFfmpegReady) {
    return <>{children}</>;
  }

  if (hasError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4 text-foreground">
        <div className="flex max-w-md flex-col items-center gap-6 rounded-lg border border-border p-8 text-center shadow-sm">
          <AlertCircle className="h-12 w-12 text-destructive" />

          <div className="space-y-2">
            <h2 className="text-xl font-semibold">Initialization Failed</h2>
            <p className="text-sm text-muted-foreground">
              We encountered an issue checking necessary components.
            </p>
          </div>

          <div className="w-full space-y-2 rounded-md bg-muted/50 p-4 text-left font-mono text-xs">
            <div className="flex justify-between">
              <span>yt-dlp:</span>
              <span className={ytDlpStatus === "error" ? "text-destructive" : "text-green-500"}>
                {ytDlpStatus}
              </span>
            </div>
            <div className="flex justify-between">
              <span>ffmpeg:</span>
              <span className={ffmpegStatus === "error" ? "text-destructive" : "text-green-500"}>
                {ffmpegStatus}
              </span>
            </div>
          </div>

          <Button
            variant="default"
            onClick={() => {
              logger.warn("User bypassed binary check failure");
              // This is a bit hacky - we rely on the parent (App) to not unmount us usually,
              // but here we want to force render children.
              // However, 'ready' state is driven by atoms.
              // We can't easily force "ready" unless we update the atom,
              // but update is driven by the components.
              // Let's just reload the window to try again for now, as that's safer.
              window.location.reload();
            }}
          >
            Retry
          </Button>

          <p className="mt-4 text-xs text-muted-foreground">
            If this persists, please check your internet connection or restart the app.
          </p>
        </div>
      </div>
    );
  }

  // Determine status message
  let message = "Checking components...";
  if (ytDlpStatus === "installing") {
    message = "Downloading yt-dlp... This may take a moment.";
  } else if (ffmpegStatus === "checking") {
    message = "Verifying ffmpeg availability...";
  } else if (ytDlpStatus === "checking") {
    message = "Verifying yt-dlp availability...";
  }

  return <LoadingScreen message={message} />;
};
