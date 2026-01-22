/**
 * Background Jobs tRPC Router
 *
 * Provides API for querying background job status from the renderer process.
 */

import { publicProcedure, t } from "@/api/trpc";
import { getBackgroundJobsManager } from "@/services/background-jobs/job-manager";

export const backgroundJobsRouter = t.router({
  /**
   * Get the current status of all background jobs
   */
  getStatus: publicProcedure.query(() => {
    const manager = getBackgroundJobsManager();
    return manager.getJobsStatus();
  }),

  /**
   * Clear all completed and failed jobs
   */
  clearCompleted: publicProcedure.mutation(() => {
    const manager = getBackgroundJobsManager();
    manager.clearCompleted();
    return { success: true };
  }),
});
