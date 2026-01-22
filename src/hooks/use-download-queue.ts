/**
 * useDownloadQueue Hook
 *
 * Provides access to download queue status and actions.
 * Polls the main process for queue status.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { trpcClient } from "@/utils/trpc";
import type { QueuedDownload } from "@/services/download-queue/types";

// Poll interval when downloads are active (1.5 seconds for smooth progress updates)
const ACTIVE_POLL_INTERVAL = 1500;
// Poll interval when no downloads are active (10 seconds)
const IDLE_POLL_INTERVAL = 10000;

export interface UseDownloadQueueResult {
  // Queue data
  queued: QueuedDownload[];
  downloading: QueuedDownload[];
  paused: QueuedDownload[];
  completed: QueuedDownload[];
  failed: QueuedDownload[];
  // Computed values
  activeCount: number;
  hasActiveDownloads: boolean;
  totalProgress: number;
  isLoading: boolean;
  // Actions
  pauseDownload: (downloadId: string) => void;
  resumeDownload: (downloadId: string) => void;
  cancelDownload: (downloadId: string) => void;
  retryDownload: (downloadId: string) => void;
  clearCompleted: () => void;
}

export function useDownloadQueue(): UseDownloadQueueResult {
  const queryClient = useQueryClient();

  // Query download queue status
  const { data, isLoading } = useQuery({
    queryKey: ["download-queue-status"],
    queryFn: async () => {
      const result = await trpcClient.queue.getQueueStatus.query();
      if (!result.success || !result.data) {
        return null;
      }
      return result.data;
    },
    // Adjust refetch interval based on whether there are active downloads
    refetchInterval: (query) => {
      const status = query.state.data;
      if (!status) return IDLE_POLL_INTERVAL;
      const hasActive = status.downloading.length > 0 || status.queued.length > 0;
      return hasActive ? ACTIVE_POLL_INTERVAL : IDLE_POLL_INTERVAL;
    },
    refetchOnWindowFocus: true,
  });

  // Mutation helpers
  const invalidateQueue = (): void => {
    queryClient.invalidateQueries({ queryKey: ["download-queue-status"] });
  };

  const pauseMutation = useMutation({
    mutationFn: async (downloadId: string) => {
      return await trpcClient.queue.pauseDownload.mutate({ downloadId });
    },
    onSuccess: invalidateQueue,
  });

  const resumeMutation = useMutation({
    mutationFn: async (downloadId: string) => {
      return await trpcClient.queue.resumeDownload.mutate({ downloadId });
    },
    onSuccess: invalidateQueue,
  });

  const cancelMutation = useMutation({
    mutationFn: async (downloadId: string) => {
      return await trpcClient.queue.cancelDownload.mutate({ downloadId });
    },
    onSuccess: invalidateQueue,
  });

  const retryMutation = useMutation({
    mutationFn: async (downloadId: string) => {
      return await trpcClient.queue.retryDownload.mutate({ downloadId });
    },
    onSuccess: invalidateQueue,
  });

  const clearCompletedMutation = useMutation({
    mutationFn: async () => {
      return await trpcClient.queue.clearCompleted.mutate();
    },
    onSuccess: invalidateQueue,
  });

  // Extract queue data
  const queued = data?.queued ?? [];
  const downloading = data?.downloading ?? [];
  const paused = data?.paused ?? [];
  const completed = data?.completed ?? [];
  const failed = data?.failed ?? [];

  // Compute derived values
  const activeCount = downloading.length + queued.length;
  const hasActiveDownloads = activeCount > 0;

  // Calculate total progress across all active downloads
  const totalProgress =
    downloading.length > 0
      ? downloading.reduce((sum, d) => sum + d.progress, 0) / downloading.length
      : 0;

  return {
    queued,
    downloading,
    paused,
    completed,
    failed,
    activeCount,
    hasActiveDownloads,
    totalProgress,
    isLoading,
    pauseDownload: (id) => pauseMutation.mutate(id),
    resumeDownload: (id) => resumeMutation.mutate(id),
    cancelDownload: (id) => cancelMutation.mutate(id),
    retryDownload: (id) => retryMutation.mutate(id),
    clearCompleted: () => clearCompletedMutation.mutate(),
  };
}
