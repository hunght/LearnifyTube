import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { trpcClient } from "@/utils/trpc";
import { logger } from "@/helpers/logger";

export default function DownloadFolderAccessInitializer(): null {
  const ensuredPathsRef = useRef<Set<string>>(new Set());

  const { data: downloadPathInfo } = useQuery({
    queryKey: ["preferences", "downloadPath"],
    queryFn: () => trpcClient.preferences.getDownloadPath.query(),
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    staleTime: Infinity,
    gcTime: Infinity,
  });

  useEffect(() => {
    const downloadPath = downloadPathInfo?.downloadPath;
    if (!downloadPath) return;

    if (ensuredPathsRef.current.has(downloadPath)) {
      logger.debug("[DownloadFolderAccessInitializer] Folder already ensured", { downloadPath });
      return;
    }

    let cancelled = false;
    ensuredPathsRef.current.add(downloadPath);

    const ensureAccess = async (): Promise<void> => {
      try {
        logger.info("[DownloadFolderAccessInitializer] Ensuring folder access", { downloadPath });
        const result = await trpcClient.preferences.ensureDownloadDirectoryAccess.mutate({
          directoryPath: downloadPath,
        });

        if (cancelled) {
          return;
        }

        if (result.success) {
          logger.info("[DownloadFolderAccessInitializer] Folder access confirmed", {
            downloadPath,
            updatedPath: result.downloadPath,
          });
        } else {
          logger.warn("[DownloadFolderAccessInitializer] Folder access not granted", {
            downloadPath,
            result,
          });
          ensuredPathsRef.current.delete(downloadPath);
        }
      } catch (error) {
        if (!cancelled) {
          logger.error("[DownloadFolderAccessInitializer] Failed to ensure folder access", {
            downloadPath,
            error,
          });
          ensuredPathsRef.current.delete(downloadPath);
        }
      }
    };

    void ensureAccess();

    return () => {
      cancelled = true;
    };
  }, [downloadPathInfo?.downloadPath]);

  return null;
}
