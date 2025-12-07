import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { trpcClient } from "@/utils/trpc";
import { logger } from "@/helpers/logger";
import { useSetAtom } from "jotai";
import { ytDlpStatusAtom } from "@/states/binary-status";

/**
 * YtDlpInstaller - Ensures yt-dlp binary is installed on app startup.
 * Checks for installation status and automatically downloads if needed.
 */
export const YtDlpInstaller = (): null => {
  const setStatus = useSetAtom(ytDlpStatusAtom);
  const queryClient = useQueryClient();

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

  // Mutation to download yt-dlp
  const downloadMutation = useMutation({
    mutationFn: () => trpcClient.binary.downloadLatest.mutate(),
    onSuccess: async (result) => {
      if (result.success) {
        logger.info("[YtDlpInstaller] Successfully installed yt-dlp", {
          version: result.version,
          path: result.path,
          alreadyInstalled: result.alreadyInstalled,
        });
        // Invalidate query to update installInfo
        await queryClient.invalidateQueries({ queryKey: ["ytdlp", "installInfo"] });
        setStatus("ready");
      } else {
        logger.error("[YtDlpInstaller] Failed to install yt-dlp", {
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
      downloadMutation.mutate();
    } else if (installInfo?.installed) {
      logger.info("[YtDlpInstaller] yt-dlp already installed", {
        version: installInfo.version,
        path: installInfo.path,
      });
      setStatus("ready");
    }
     
  }, [installInfo, isCheckingInstall, isCheckError, setStatus]); // Remove downloadMutation from deps to avoid loop if it changes identity

  // This component doesn't render anything - it just handles the installation logic
  return null;
};
