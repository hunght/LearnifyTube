/**
 * Background Jobs Manager
 *
 * Manages long-running yt-dlp operations (playlist fetching, channel data loading).
 * Uses factory function pattern matching the download-queue pattern.
 */

import { logger } from "@/helpers/logger";
import type {
  BackgroundJob,
  BackgroundJobStatus,
  BackgroundJobsStatus,
  CreateJobParams,
} from "./types";

// Auto-cleanup completed jobs after 5 minutes
const COMPLETED_JOB_CLEANUP_MS = 5 * 60 * 1000;

/**
 * Job Manager instance type (inferred from factory return)
 */
type JobManagerInstance = {
  createJob: (params: CreateJobParams) => BackgroundJob;
  startJob: (jobId: string) => void;
  completeJob: (jobId: string) => void;
  failJob: (jobId: string, errorMessage: string) => void;
  getJobsStatus: () => BackgroundJobsStatus;
  removeJob: (jobId: string) => void;
  clearCompleted: () => void;
  getJob: (jobId: string) => BackgroundJob | undefined;
};

/**
 * Create a new job manager instance (factory function pattern)
 */
const createJobManager = (): JobManagerInstance => {
  // Private state (closure variables)
  const jobs: Map<string, BackgroundJob> = new Map();
  const cleanupTimeouts: Map<string, NodeJS.Timeout> = new Map();

  /**
   * Schedule auto-cleanup for a completed or failed job
   */
  const scheduleCleanup = (jobId: string): void => {
    // Clear existing timeout if any
    const existingTimeout = cleanupTimeouts.get(jobId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    const timeout = setTimeout(() => {
      jobs.delete(jobId);
      cleanupTimeouts.delete(jobId);
      logger.debug("[background-jobs] Auto-cleaned job", { jobId });
    }, COMPLETED_JOB_CLEANUP_MS);

    cleanupTimeouts.set(jobId, timeout);
  };

  /**
   * Create a new job
   */
  const createJob = (params: CreateJobParams): BackgroundJob => {
    const id = `job-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const now = Date.now();

    const job: BackgroundJob = {
      id,
      type: params.type,
      status: "pending",
      title: params.title,
      entityId: params.entityId,
      createdAt: now,
    };

    jobs.set(id, job);
    logger.info("[background-jobs] Job created", {
      jobId: id,
      type: params.type,
      title: params.title,
    });

    return job;
  };

  /**
   * Start a job (mark as running)
   */
  const startJob = (jobId: string): void => {
    const job = jobs.get(jobId);
    if (!job) {
      logger.warn("[background-jobs] Job not found for start", { jobId });
      return;
    }

    job.status = "running";
    job.startedAt = Date.now();

    logger.info("[background-jobs] Job started", { jobId, title: job.title });
  };

  /**
   * Mark a job as completed
   */
  const completeJob = (jobId: string): void => {
    const job = jobs.get(jobId);
    if (!job) {
      logger.warn("[background-jobs] Job not found for completion", { jobId });
      return;
    }

    job.status = "completed";
    job.completedAt = Date.now();

    const durationMs = job.startedAt ? job.completedAt - job.startedAt : 0;
    logger.info("[background-jobs] Job completed", {
      jobId,
      title: job.title,
      durationMs,
    });

    // Schedule auto-cleanup
    scheduleCleanup(jobId);
  };

  /**
   * Mark a job as failed
   */
  const failJob = (jobId: string, errorMessage: string): void => {
    const job = jobs.get(jobId);
    if (!job) {
      logger.warn("[background-jobs] Job not found for failure", { jobId });
      return;
    }

    job.status = "failed";
    job.error = errorMessage;
    job.completedAt = Date.now();

    logger.error("[background-jobs] Job failed", {
      jobId,
      title: job.title,
      error: errorMessage,
    });

    // Schedule auto-cleanup
    scheduleCleanup(jobId);
  };

  /**
   * Get current status of all jobs
   */
  const getJobsStatus = (): BackgroundJobsStatus => {
    const allJobs = Array.from(jobs.values());

    // Sort by createdAt desc (newest first)
    allJobs.sort((a, b) => b.createdAt - a.createdAt);

    const countByStatus = (status: BackgroundJobStatus): number =>
      allJobs.filter((j) => j.status === status).length;

    return {
      jobs: allJobs,
      runningCount: countByStatus("running"),
      pendingCount: countByStatus("pending"),
      completedCount: countByStatus("completed"),
      failedCount: countByStatus("failed"),
    };
  };

  /**
   * Get a specific job
   */
  const getJob = (jobId: string): BackgroundJob | undefined => {
    return jobs.get(jobId);
  };

  /**
   * Remove a specific job
   */
  const removeJob = (jobId: string): void => {
    const timeout = cleanupTimeouts.get(jobId);
    if (timeout) {
      clearTimeout(timeout);
      cleanupTimeouts.delete(jobId);
    }
    jobs.delete(jobId);
    logger.debug("[background-jobs] Job removed", { jobId });
  };

  /**
   * Clear all completed and failed jobs
   */
  const clearCompleted = (): void => {
    const toRemove: string[] = [];

    jobs.forEach((job, id) => {
      if (job.status === "completed" || job.status === "failed") {
        toRemove.push(id);
      }
    });

    toRemove.forEach((id) => {
      const timeout = cleanupTimeouts.get(id);
      if (timeout) {
        clearTimeout(timeout);
        cleanupTimeouts.delete(id);
      }
      jobs.delete(id);
    });

    logger.info("[background-jobs] Cleared completed jobs", { count: toRemove.length });
  };

  // Return public API (functional factory pattern)
  return {
    createJob,
    startJob,
    completeJob,
    failJob,
    getJobsStatus,
    getJob,
    removeJob,
    clearCompleted,
  };
};

// Singleton instance
let jobManagerInstance: JobManagerInstance | null = null;

/**
 * Get or create job manager instance
 */
export const getBackgroundJobsManager = (): JobManagerInstance => {
  if (!jobManagerInstance) {
    jobManagerInstance = createJobManager();
    logger.info("[background-jobs] Job manager initialized");
  }
  return jobManagerInstance;
};
