/**
 * useBackgroundJobs Hook
 *
 * Provides access to background jobs status and notifications.
 * Polls the main process for job status and shows toasts for completed jobs.
 */

import { useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAtom } from "jotai";
import { toast } from "sonner";
import { trpcClient } from "@/utils/trpc";
import { acknowledgedJobsAtom, jobsPanelOpenAtom } from "@/atoms/background-jobs-atoms";
import type { BackgroundJob, BackgroundJobsStatus } from "@/services/background-jobs/types";

// Poll interval when jobs are active (2 seconds)
const ACTIVE_POLL_INTERVAL = 2000;
// Poll interval when no jobs are active (10 seconds)
const IDLE_POLL_INTERVAL = 10000;

export interface UseBackgroundJobsResult {
  jobs: BackgroundJob[];
  runningCount: number;
  hasActiveJobs: boolean;
  isLoading: boolean;
  isPanelOpen: boolean;
  setPanelOpen: (open: boolean) => void;
  acknowledgeJob: (jobId: string) => void;
  clearCompleted: () => void;
}

export function useBackgroundJobs(): UseBackgroundJobsResult {
  const queryClient = useQueryClient();
  const [acknowledgedJobs, setAcknowledgedJobs] = useAtom(acknowledgedJobsAtom);
  const [isPanelOpen, setPanelOpen] = useAtom(jobsPanelOpenAtom);

  // Track previously seen job IDs to detect newly completed jobs
  const previousJobsRef = useRef<Map<string, BackgroundJob>>(new Map());

  // Query background jobs status
  const { data, isLoading } = useQuery<BackgroundJobsStatus>({
    queryKey: ["background-jobs-status"],
    queryFn: async () => {
      return await trpcClient.backgroundJobs.getStatus.query();
    },
    // Adjust refetch interval based on whether there are active jobs
    refetchInterval: (query) => {
      const status = query.state.data;
      if (!status) return IDLE_POLL_INTERVAL;
      const hasActive = status.runningCount > 0 || status.pendingCount > 0;
      return hasActive ? ACTIVE_POLL_INTERVAL : IDLE_POLL_INTERVAL;
    },
    // Refetch when window regains focus
    refetchOnWindowFocus: true,
  });

  // Clear completed mutation
  const clearCompletedMutation = useMutation({
    mutationFn: async () => {
      return await trpcClient.backgroundJobs.clearCompleted.mutate();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["background-jobs-status"] });
    },
  });

  // Track acknowledged jobs ref to avoid dependency on acknowledgedJobs array
  const acknowledgedJobsRef = useRef<string[]>(acknowledgedJobs);
  acknowledgedJobsRef.current = acknowledgedJobs;

  // Show toast notifications for newly completed jobs
  useEffect(() => {
    if (!data?.jobs) return;

    const previousJobs = previousJobsRef.current;
    const currentJobs = new Map(data.jobs.map((j) => [j.id, j]));
    const acknowledged = acknowledgedJobsRef.current;

    // Check for newly completed jobs
    data.jobs.forEach((job) => {
      const prevJob = previousJobs.get(job.id);

      // Job just completed (was running, now completed)
      if (
        prevJob &&
        prevJob.status === "running" &&
        job.status === "completed" &&
        !acknowledged.includes(job.id)
      ) {
        toast.success(job.title.replace("...", " completed"), {
          description: "Background operation finished successfully",
          duration: 4000,
        });
        // Auto-acknowledge after showing toast
        setAcknowledgedJobs((prev) => [...prev, job.id]);
      }

      // Job just failed
      if (
        prevJob &&
        prevJob.status === "running" &&
        job.status === "failed" &&
        !acknowledged.includes(job.id)
      ) {
        toast.error(job.title.replace("...", " failed"), {
          description: job.error || "An error occurred",
          duration: 6000,
        });
        // Auto-acknowledge after showing toast
        setAcknowledgedJobs((prev) => [...prev, job.id]);
      }
    });

    // Update previous jobs reference
    previousJobsRef.current = currentJobs;

    // Cleanup old acknowledged job IDs (keep only those still in jobs list)
    const currentJobIds = new Set(data.jobs.map((j) => j.id));
    setAcknowledgedJobs((prev) => {
      const filtered = prev.filter((id) => currentJobIds.has(id));
      // Only update if something was actually filtered out
      return filtered.length === prev.length ? prev : filtered;
    });
  }, [data?.jobs, setAcknowledgedJobs]);

  const acknowledgeJob = (jobId: string): void => {
    if (!acknowledgedJobs.includes(jobId)) {
      setAcknowledgedJobs((prev) => [...prev, jobId]);
    }
  };

  const jobs = data?.jobs ?? [];
  const runningCount = data?.runningCount ?? 0;
  const pendingCount = data?.pendingCount ?? 0;
  const hasActiveJobs = runningCount > 0 || pendingCount > 0;

  return {
    jobs,
    runningCount: runningCount + pendingCount, // Show total active (running + pending)
    hasActiveJobs,
    isLoading,
    isPanelOpen,
    setPanelOpen,
    acknowledgeJob,
    clearCompleted: () => clearCompletedMutation.mutate(),
  };
}
