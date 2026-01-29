import { useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { trpcClient } from "@/utils/trpc";
import { logger } from "@/helpers/logger";
import { useSetAtom } from "jotai";
import { ytDlpStatusAtom } from "@/states/binary-status";

/**
 * YtDlpInstaller - Ensures yt-dlp binary is installed and up-to-date on app startup.
 * Checks for installation status and automatically downloads/updates if needed.
 */
export const YtDlpInstaller = (): null => {
  const setStatus = useSetAtom(ytDlpStatusAtom);
  const queryClient = useQueryClient();
  const hasCheckedForUpdate = useRef(false);

  // Query to check if yt-dlp is installed
  const {
    data: installInfo,
    isLoading: isCheckingInstall,
    isError: isCheckError,
  } = useQuery({
    queryKey: ["ytdlp", "installInfo"],
    queryFn: () => trpcClient.binary.getInstallInfo.query(),
    staleTime: Infinity, // Only check once per app session
    refetchOnWindowFocus: false,
  });

  // Query to check for updates (only runs after install check completes)
  const { data: updateInfo } = useQuery({
    queryKey: ["ytdlp", "checkForUpdate"],
    queryFn: () => trpcClient.binary.checkForUpdate.query(),
    enabled: !!installInfo?.installed && !hasCheckedForUpdate.current,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  // Mutation to download/update yt-dlp
  const downloadMutation = useMutation({
    mutationFn: (force?: boolean) => trpcClient.binary.downloadLatest.mutate({ force }),
    onSuccess: async (result) => {
      if (result.success) {
        logger.info("[YtDlpInstaller] Successfully installed/updated yt-dlp", {
          version: result.version,
          path: result.path,
          alreadyInstalled: result.alreadyInstalled,
        });
        // Invalidate queries to update installInfo
        await queryClient.invalidateQueries({ queryKey: ["ytdlp", "installInfo"] });
        await queryClient.invalidateQueries({ queryKey: ["ytdlp", "checkForUpdate"] });
        setStatus("ready");
      } else {
        logger.error("[YtDlpInstaller] Failed to install/update yt-dlp", {
          message: result.message,
        });
        setStatus("error");
      }
    },
    onError: (error) => {
      logger.error("[YtDlpInstaller] Download mutation failed", error);
      setStatus("error");
    },
  });

  // Auto-download when we detect yt-dlp is not installed
  useEffect(() => {
    if (isCheckError) {
      setStatus("error");
      return;
    }

    if (isCheckingInstall) {
      setStatus("checking");
      return;
    }

    // prevent loop: if checking implies ready or we are already installing (via mutation status), don't trigger again
    // But `downloadMutation.isPending` is better check.
    if (downloadMutation.isPending) {
      return;
    }

    if (installInfo && !installInfo.installed) {
      // Only trigger if we haven't already succeeded recently?
      // The invalidation should fix the data.
      logger.info("[YtDlpInstaller] yt-dlp not found, starting download...");
      setStatus("installing");
      downloadMutation.mutate(false);
    } else if (installInfo?.installed) {
      logger.info("[YtDlpInstaller] yt-dlp already installed", {
        version: installInfo.version,
        path: installInfo.path,
      });
      setStatus("ready");
    }
  }, [installInfo, isCheckingInstall, isCheckError, setStatus]); // Remove downloadMutation from deps to avoid loop if it changes identity

  // Auto-update when newer yt-dlp version is available
  useEffect(() => {
    if (!updateInfo || hasCheckedForUpdate.current || downloadMutation.isPending) {
      return;
    }

    hasCheckedForUpdate.current = true;

    if (updateInfo.updateAvailable) {
      logger.info("[YtDlpInstaller] yt-dlp update available, starting auto-update...", {
        installedVersion: updateInfo.installedVersion,
        latestVersion: updateInfo.latestVersion,
      });
      setStatus("installing");
      downloadMutation.mutate(true); // Force update
    } else {
      logger.info("[YtDlpInstaller] yt-dlp is up to date", {
        installedVersion: updateInfo.installedVersion,
        latestVersion: updateInfo.latestVersion,
      });
    }
  }, [updateInfo, setStatus]); // Remove downloadMutation from deps

  // This component doesn't render anything - it just handles the installation logic
  return null;
};
