import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { trpcClient } from "@/utils/trpc";
import { logger } from "@/helpers/logger";

/**
 * FfmpegInstaller - Checks for ffmpeg availability on app startup.
 * Uses ffmpeg-static npm package (no download needed).
 */
export const FfmpegInstaller = (): null => {
  // Query to check if ffmpeg is installed
  const { data: installInfo, isLoading: isCheckingInstall } = useQuery({
    queryKey: ["ffmpeg", "installInfo"],
    queryFn: () => trpcClient.binary.getFfmpegInstallInfo.query(),
    staleTime: Infinity, // Only check once per app session
    refetchOnWindowFocus: false,
  });

  // Log installation status
  useEffect(() => {
    if (isCheckingInstall) return;

    if (installInfo?.installed) {
      logger.info("[FfmpegInstaller] ffmpeg available", {
        version: installInfo.version,
        path: installInfo.path,
        source: installInfo.path?.includes("node_modules")
          ? "ffmpeg-static npm package"
          : "userData/bin",
      });
    } else if (installInfo && !installInfo.installed) {
      // Check if ffmpeg-static npm package is available
      try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const ffmpegStatic = require("ffmpeg-static");
        if (ffmpegStatic && typeof ffmpegStatic === "string") {
          logger.warn("[FfmpegInstaller] ffmpeg-static package found but binary not accessible", {
            path: ffmpegStatic,
            note: "This may be a path resolution issue. The app will try to use it at runtime.",
          });
          return;
        }
      } catch {
        // ffmpeg-static not installed
      }

      logger.warn("[FfmpegInstaller] ffmpeg not found", {
        note: "ffmpeg-static npm package should be installed. Download fallback may not work reliably.",
      });
      // Don't auto-download - let the app use ffmpeg-static from node_modules at runtime
      // The download method is unreliable (404 errors), so we rely on npm package
    }
  }, [installInfo, isCheckingInstall]);

  // This component doesn't render anything - it just handles the installation logic
  return null;
};
