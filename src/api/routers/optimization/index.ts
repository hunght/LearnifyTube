import { z } from "zod";
import { publicProcedure, t } from "@/api/trpc";
import { logger } from "@/helpers/logger";
import defaultDb from "@/api/db";
import { eq } from "drizzle-orm";
import { youtubeVideos } from "@/api/db/schema";
import fs from "fs";
import path from "path";
import { requireOptimizationQueueManager } from "@/services/optimization-queue/queue-manager";
import {
  isFfmpegAvailable,
  spawnAudioConversion,
  killAudioConversion,
  getVideoDuration,
  type AudioFormat,
  type AudioQuality,
  type AudioConversionJob,
} from "@/services/optimization-queue/optimization-worker";
import type {
  OptimizationQueueStatus,
  TargetResolution,
} from "@/services/optimization-queue/types";
import { ESTIMATED_COMPRESSION_RATIO } from "@/services/optimization-queue/config";

// Audio conversion queue state
const audioConversionQueue: Map<string, AudioConversionJob> = new Map();
const completedAudioJobs: AudioConversionJob[] = [];
const MAX_COMPLETED_AUDIO = 10;

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

  /**
   * Start audio conversion for one or more videos
   */
  startAudioConversion: publicProcedure
    .input(
      z.object({
        videoIds: z.array(z.string()),
        format: z.enum(["mp3", "m4a", "opus"]).default("mp3"),
        quality: z.enum(["high", "medium", "low"]).default("medium"),
        deleteOriginal: z.boolean().default(false),
      })
    )
    .mutation(async ({ input, ctx }): Promise<StartOptimizationResult> => {
      try {
        const db = ctx.db ?? defaultDb;
        logger.info("[audio-conversion] Starting audio conversion", {
          count: input.videoIds.length,
          format: input.format,
          quality: input.quality,
        });

        if (!isFfmpegAvailable()) {
          return {
            success: false,
            jobIds: [],
            message: "FFmpeg is not available. Please ensure FFmpeg is installed.",
          };
        }

        const jobIds: string[] = [];

        for (const videoId of input.videoIds) {
          // Skip if already converting
          const existingJob = Array.from(audioConversionQueue.values()).find(
            (j) => j.videoId === videoId
          );
          if (existingJob) {
            logger.warn("[audio-conversion] Video already in queue", { videoId });
            continue;
          }

          // Get video info
          const videos = await db
            .select({
              videoId: youtubeVideos.videoId,
              title: youtubeVideos.title,
              filePath: youtubeVideos.downloadFilePath,
              fileSize: youtubeVideos.downloadFileSize,
              durationSeconds: youtubeVideos.durationSeconds,
            })
            .from(youtubeVideos)
            .where(eq(youtubeVideos.videoId, videoId))
            .limit(1);

          const videoData = videos[0];
          const videoFilePath = videoData?.filePath;
          if (!videoData || !videoFilePath) {
            logger.warn("[audio-conversion] Video not found", { videoId });
            continue;
          }

          const video = videoData;
          const filePath = videoFilePath;

          if (!fs.existsSync(filePath)) {
            logger.warn("[audio-conversion] File not found", { videoId, filePath });
            continue;
          }

          // Get file stats
          const stats = fs.statSync(filePath);
          const originalSize = stats.size;

          // Get duration
          let duration = video.durationSeconds || 0;
          if (duration === 0) {
            duration = await getVideoDuration(filePath);
          }

          // Build output path
          const dir = path.dirname(filePath);
          const baseName = path.basename(filePath, path.extname(filePath));
          const outputPath = path.join(dir, `${baseName}.${input.format}`);

          // Create job
          const jobId = `audio-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
          const audioFormat: AudioFormat = input.format;
          const audioQuality: AudioQuality = input.quality;
          const job: AudioConversionJob = {
            id: jobId,
            videoId,
            title: video.title,
            sourceFilePath: filePath,
            targetFilePath: outputPath,
            format: audioFormat,
            quality: audioQuality,
            status: "queued",
            progress: 0,
            originalSize,
            finalSize: null,
            errorMessage: null,
            addedAt: Date.now(),
            startedAt: null,
            completedAt: null,
            durationSeconds: duration,
            deleteOriginal: input.deleteOriginal,
          };

          audioConversionQueue.set(jobId, job);
          jobIds.push(jobId);

          logger.info("[audio-conversion] Added to queue", {
            jobId,
            videoId,
            title: video.title,
            format: input.format,
          });
        }

        // Start processing
        processAudioQueue();

        if (jobIds.length === 0) {
          return {
            success: false,
            jobIds: [],
            message: "No videos could be added to the conversion queue.",
          };
        }

        return {
          success: true,
          jobIds,
          message: `Started audio conversion for ${jobIds.length} video(s)`,
        };
      } catch (error) {
        logger.error("[audio-conversion] Failed to start conversion", error);
        return {
          success: false,
          jobIds: [],
          message: error instanceof Error ? error.message : "Failed to start audio conversion",
        };
      }
    }),

  /**
   * Get audio conversion queue status
   */
  getAudioConversionStatus: publicProcedure.query(() => {
    const allJobs = Array.from(audioConversionQueue.values());
    const queued = allJobs.filter((j) => j.status === "queued");
    const converting = allJobs.filter((j) => j.status === "converting");

    return {
      queued,
      converting,
      completed: [...completedAudioJobs],
      stats: {
        totalQueued: queued.length,
        totalActive: converting.length,
        totalCompleted: completedAudioJobs.length,
        averageProgress:
          converting.length > 0
            ? converting.reduce((sum, j) => sum + j.progress, 0) / converting.length
            : 0,
      },
    };
  }),

  /**
   * Cancel an audio conversion
   */
  cancelAudioConversion: publicProcedure
    .input(z.object({ jobId: z.string() }))
    .mutation(async ({ input }): Promise<OptimizationActionResult> => {
      try {
        const job = audioConversionQueue.get(input.jobId);
        if (!job) {
          return { success: false, message: "Job not found" };
        }

        if (job.status === "converting") {
          killAudioConversion(input.jobId);
        }

        // Clean up temp file
        if (job.targetFilePath && fs.existsSync(job.targetFilePath)) {
          await fs.promises.unlink(job.targetFilePath).catch(() => {});
        }

        audioConversionQueue.delete(input.jobId);

        return { success: true, message: "Audio conversion cancelled" };
      } catch (error) {
        return {
          success: false,
          message: error instanceof Error ? error.message : "Failed to cancel",
        };
      }
    }),
});

/**
 * Process audio conversion queue
 */
function processAudioQueue(): void {
  const converting = Array.from(audioConversionQueue.values()).filter(
    (j) => j.status === "converting"
  );

  // Only process one at a time
  if (converting.length > 0) return;

  const queued = Array.from(audioConversionQueue.values()).filter((j) => j.status === "queued");
  if (queued.length === 0) return;

  const job = queued[0];
  job.status = "converting";
  job.startedAt = Date.now();

  spawnAudioConversion(
    job,
    // Progress callback
    (jobId, progress) => {
      const j = audioConversionQueue.get(jobId);
      if (j) j.progress = progress;
    },
    // Completion callback
    async (jobId, success, finalPath, finalSize, errorMessage) => {
      const j = audioConversionQueue.get(jobId);
      if (!j) return;

      if (success && finalPath && finalSize) {
        j.status = "completed";
        j.progress = 100;
        j.completedAt = Date.now();
        j.finalSize = finalSize;

        // Delete original if requested
        if (j.deleteOriginal && fs.existsSync(j.sourceFilePath)) {
          try {
            await fs.promises.unlink(j.sourceFilePath);
            logger.info("[audio-conversion] Deleted original video file", {
              jobId,
              path: j.sourceFilePath,
            });

            // Update database to mark as audio-only
            await defaultDb
              .update(youtubeVideos)
              .set({
                downloadFilePath: finalPath,
                downloadFileSize: finalSize,
                updatedAt: Date.now(),
              })
              .where(eq(youtubeVideos.videoId, j.videoId))
              .execute();
          } catch (err) {
            logger.warn("[audio-conversion] Failed to delete original", { jobId, err });
          }
        }

        logger.info("[audio-conversion] Completed", {
          jobId,
          videoId: j.videoId,
          originalSize: j.originalSize,
          finalSize,
          savings: `${((1 - finalSize / j.originalSize) * 100).toFixed(1)}%`,
        });

        // Move to completed
        audioConversionQueue.delete(jobId);
        completedAudioJobs.unshift(j);
        if (completedAudioJobs.length > MAX_COMPLETED_AUDIO) {
          completedAudioJobs.pop();
        }
      } else {
        j.status = "failed";
        j.errorMessage = errorMessage || "Conversion failed";
        j.completedAt = Date.now();

        logger.error("[audio-conversion] Failed", {
          jobId,
          videoId: j.videoId,
          error: errorMessage,
        });

        audioConversionQueue.delete(jobId);
      }

      // Process next job
      setTimeout(() => processAudioQueue(), 100);
    }
  ).catch((err: unknown) => {
    logger.error("[audio-conversion] Failed to spawn", { err });
    const j = audioConversionQueue.get(job.id);
    if (j) {
      j.status = "failed";
      j.errorMessage = "Failed to start conversion";
      audioConversionQueue.delete(job.id);
    }
    setTimeout(() => processAudioQueue(), 100);
  });
}
