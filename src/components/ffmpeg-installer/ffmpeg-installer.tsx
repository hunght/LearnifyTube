import { useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { trpcClient } from "@/utils/trpc";
import { logger } from "@/helpers/logger";

/**
 * FfmpegInstaller - Ensures ffmpeg binary is installed on app startup.
 * Checks for installation status and automatically downloads if needed.
 */
export const FfmpegInstaller = (): null => {
  // Query to check if ffmpeg is installed
  const { data: installInfo, isLoading: isCheckingInstall } = useQuery({
    queryKey: ["ffmpeg", "installInfo"],
    queryFn: () => trpcClient.binary.getFfmpegInstallInfo.query(),
    staleTime: Infinity, // Only check once per app session
    refetchOnWindowFocus: false,
  });

  // Mutation to download ffmpeg
  const downloadMutation = useMutation({
    mutationFn: () => trpcClient.binary.downloadFfmpeg.mutate(),
    onSuccess: (result) => {
      if (result.success) {
        logger.info("[FfmpegInstaller] Successfully installed ffmpeg", {
          version: result.version,
          path: result.path,
          alreadyInstalled: result.alreadyInstalled,
        });
      } else {
        logger.error("[FfmpegInstaller] Failed to install ffmpeg", {
          message: result.message,
        });
      }
    },
    onError: (error) => {
      logger.error("[FfmpegInstaller] Download mutation failed", error);
    },
  });

  // Auto-download when we detect ffmpeg is not installed
  useEffect(() => {
    if (isCheckingInstall) return;

    if (installInfo && !installInfo.installed) {
      logger.info("[FfmpegInstaller] ffmpeg not found, starting download...");
      downloadMutation.mutate();
    } else if (installInfo?.installed) {
      logger.info("[FfmpegInstaller] ffmpeg already installed", {
        version: installInfo.version,
        path: installInfo.path,
      });
    }
  }, [installInfo, isCheckingInstall]);

  // This component doesn't render anything - it just handles the installation logic
  return null;
};
