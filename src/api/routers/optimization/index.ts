import { z } from "zod";
import { publicProcedure, t } from "@/api/trpc";
import { logger } from "@/helpers/logger";
import defaultDb from "@/api/db";
import { requireOptimizationQueueManager } from "@/services/optimization-queue/queue-manager";
import { isFfmpegAvailable } from "@/services/optimization-queue/optimization-worker";
import type {
  OptimizationQueueStatus,
  TargetResolution,
} from "@/services/optimization-queue/types";
import { ESTIMATED_COMPRESSION_RATIO } from "@/services/optimization-queue/config";

// Target resolution schema
const targetResolutionSchema = z.enum(["original", "1080p", "720p", "480p"]);

// Result types
type StartOptimizationSuccess = {
  success: true;
  jobIds: string[];
  message: string;
};

type StartOptimizationFailure = {
  success: false;
  jobIds: string[];
  message: string;
};

type StartOptimizationResult = StartOptimizationSuccess | StartOptimizationFailure;

type GetOptimizationStatusSuccess = {
  success: true;
  data: OptimizationQueueStatus;
};

type GetOptimizationStatusFailure = {
  success: false;
  data: null;
  message: string;
};

type GetOptimizationStatusResult = GetOptimizationStatusSuccess | GetOptimizationStatusFailure;

type OptimizationActionSuccess = {
  success: true;
  message: string;
};

type OptimizationActionFailure = {
  success: false;
  message: string;
};

type OptimizationActionResult = OptimizationActionSuccess | OptimizationActionFailure;

type EstimateResult =
  | {
      success: true;
      currentSize: number;
      estimatedSize: number;
      estimatedSavings: number;
      savingsPercent: number;
    }
  | {
      success: false;
      message: string;
    };

type FfmpegStatusResult = {
  available: boolean;
  message: string;
};

/**
 * Optimization router - handles video optimization operations
 */
export const optimizationRouter = t.router({
  /**
   * Start optimization for one or more videos
   */
  startOptimization: publicProcedure
    .input(
      z.object({
        videoIds: z.array(z.string()),
        targetResolution: targetResolutionSchema,
      })
    )
    .mutation(async ({ input }): Promise<StartOptimizationResult> => {
      try {
        logger.info("[optimization] Starting optimization", {
          count: input.videoIds.length,
          resolution: input.targetResolution,
        });

        const queueManager = requireOptimizationQueueManager();
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        const targetRes = input.targetResolution as TargetResolution;
        const jobIds = await queueManager.addToQueue(defaultDb, input.videoIds, targetRes);

        if (jobIds.length === 0) {
          return {
            success: false,
            jobIds: [],
            message:
              "No videos could be added to the optimization queue. They may already be optimizing or files may be missing.",
          };
        }

        return {
          success: true,
          jobIds,
          message: `Started optimization for ${jobIds.length} video(s)`,
        };
      } catch (error) {
        logger.error("[optimization] Failed to start optimization", error);
        return {
          success: false,
          jobIds: [],
          message: error instanceof Error ? error.message : "Failed to start optimization",
        };
      }
    }),

  /**
   * Get optimization queue status
   */
  getOptimizationStatus: publicProcedure.query(async (): Promise<GetOptimizationStatusResult> => {
    try {
      const queueManager = requireOptimizationQueueManager();
      const status = queueManager.getQueueStatus();
      return {
        success: true,
        data: status,
      };
    } catch (error) {
      logger.error("[optimization] Failed to get status", error);
      return {
        success: false,
        data: null,
        message: error instanceof Error ? error.message : "Failed to get optimization status",
      };
    }
  }),

  /**
   * Cancel an optimization job
   */
  cancelOptimization: publicProcedure
    .input(
      z.object({
        jobId: z.string(),
      })
    )
    .mutation(async ({ input }): Promise<OptimizationActionResult> => {
      try {
        logger.info("[optimization] Cancelling optimization", { jobId: input.jobId });
        const queueManager = requireOptimizationQueueManager();
        await queueManager.cancelOptimization(input.jobId);
        return {
          success: true,
          message: "Optimization cancelled",
        };
      } catch (error) {
        logger.error("[optimization] Failed to cancel optimization", error);
        return {
          success: false,
          message: error instanceof Error ? error.message : "Failed to cancel optimization",
        };
      }
    }),

  /**
   * Get estimated output size for optimization
   */
  getOptimizationEstimate: publicProcedure
    .input(
      z.object({
        currentSize: z.number(),
        targetResolution: targetResolutionSchema,
      })
    )
    .query(({ input }): EstimateResult => {
      try {
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        const targetRes = input.targetResolution as TargetResolution;
        const ratio = ESTIMATED_COMPRESSION_RATIO[targetRes];
        const estimatedSize = Math.round(input.currentSize * ratio);
        const estimatedSavings = input.currentSize - estimatedSize;
        const savingsPercent = Math.round((1 - ratio) * 100);

        return {
          success: true,
          currentSize: input.currentSize,
          estimatedSize,
          estimatedSavings,
          savingsPercent,
        };
      } catch (error) {
        logger.error("[optimization] Failed to get estimate", error);
        return {
          success: false,
          message: error instanceof Error ? error.message : "Failed to get estimate",
        };
      }
    }),

  /**
   * Check if FFmpeg is available
   */
  checkFfmpegStatus: publicProcedure.query((): FfmpegStatusResult => {
    const available = isFfmpegAvailable();
    return {
      available,
      message: available
        ? "FFmpeg is available and ready"
        : "FFmpeg is not installed. Video optimization requires FFmpeg.",
    };
  }),
});
