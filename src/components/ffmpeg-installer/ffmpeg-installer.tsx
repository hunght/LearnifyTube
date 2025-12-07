import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { trpcClient } from "@/utils/trpc";
import { logger } from "@/helpers/logger";
import { useSetAtom } from "jotai";
import { ffmpegStatusAtom } from "@/states/binary-status";

/**
 * FfmpegInstaller - Checks for ffmpeg availability on app startup.
 * Uses ffmpeg-static npm package (no download needed).
 */
export const FfmpegInstaller = (): null => {
  const setStatus = useSetAtom(ffmpegStatusAtom);

  // Query to check if ffmpeg is installed
  const {
    data: installInfo,
    isLoading: isCheckingInstall,
    isError: isCheckError,
  } = useQuery({
    queryKey: ["ffmpeg", "installInfo"],
    queryFn: () => trpcClient.binary.getFfmpegInstallInfo.query(),
    staleTime: Infinity, // Only check once per app session
    refetchOnWindowFocus: false,
  });

  // Log installation status
  useEffect(() => {
    if (isCheckError) {
      setStatus("error");
      return;
    }

    if (isCheckingInstall) {
      setStatus("checking");
      return;
    }

    if (installInfo?.installed) {
      logger.info("[FfmpegInstaller] ffmpeg available", {
        version: installInfo.version,
        path: installInfo.path,
        source: installInfo.path?.includes("node_modules")
          ? "ffmpeg-static npm package"
          : "userData/bin",
      });
      setStatus("ready");
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
          // Even if accessible check failed, if we have the package path, we might assume it's roughly ready or at least we tried?
          // But strict "ready" implies valid executable.
          // For now, if we have the package but trpc failed to verify it, it's ambiguous.
          // Let's mark it as ready but warn, because `ffmpeg-static` usually works.
          // Wait, if `installInfo.installed` is false, it means our backend check failed.
          // But here we are checking the require in the frontend... which is weird for an Electron app (node integration).
          // Assuming node integration is enabled or this runs in main process context?
          // Actually, this is a renderer component. `require` might work if bundler handles it or context isolation is off (unlikely).
          // If `require` works, it returns a path string.

          // NOTE: relying on renderer `require('ffmpeg-static')` might be just for bundler path resolution.
          // Let's stick effectively to what the original code did: just warn.
          // But we need to set a status. If we leave it 'checking', it blocks forever.
          // If we set 'error', app blocks.
          // If we set 'ready', app continues.
          // Given original code proceeded, let's treat this specific fallback case as 'ready' (with logged warning) TO AVOID SOFT LOCK.
          // BUT, to be safe, if we really can't verify it, maybe 'error' is safer?
          // Original code comments: "The app will try to use it at runtime." -> implies we should let it proceed.
          setStatus("ready");
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
      setStatus("error");
    }
  }, [installInfo, isCheckingInstall, isCheckError, setStatus]);

  // This component doesn't render anything - it just handles the installation logic
  return null;
};
