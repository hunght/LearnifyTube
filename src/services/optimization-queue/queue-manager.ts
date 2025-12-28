import { eq } from "drizzle-orm";
import { youtubeVideos } from "@/api/db/schema";
import type { Database } from "@/api/db";
import { logger } from "@/helpers/logger";
import path from "path";
import fs from "fs";
import type {
  OptimizationJob,
  OptimizationConfig,
  OptimizationQueueStatus,
  OptimizationStats,
  TargetResolution,
} from "./types";
import { DEFAULT_OPTIMIZATION_CONFIG } from "./config";
import {
  spawnOptimization,
  killOptimization,
  getVideoDuration,
  isFfmpegAvailable,
} from "./optimization-worker";

/**
 * Queue manager instance type
 */
type OptimizationQueueManagerInstance = {
  addToQueue: (
    db: Database,
    videoIds: string[],
    targetResolution: TargetResolution
  ) => Promise<string[]>;
  cancelOptimization: (jobId: string) => Promise<void>;
  getQueueStatus: () => OptimizationQueueStatus;
  start: (db: Database) => void;
  stop: () => void;
  isProcessing: () => boolean;
};

/**
 * Create optimization queue manager
 */
const createOptimizationQueueManager = (
  config: Partial<OptimizationConfig> = {}
): OptimizationQueueManagerInstance => {
  const finalConfig: OptimizationConfig = { ...DEFAULT_OPTIMIZATION_CONFIG, ...config };
  let processing = false;
  let processingInterval: NodeJS.Timeout | null = null;
  let dbRef: Database | null = null;

  // In-memory queue
  const queue: Map<string, OptimizationJob> = new Map();

  // Completed jobs (keep last 10)
  const completedJobs: OptimizationJob[] = [];
  const MAX_COMPLETED = 10;

  // Failed jobs (keep last 10)
  const failedJobs: OptimizationJob[] = [];
  const MAX_FAILED = 10;

  /**
   * Update job progress
   */
  const updateProgress = (jobId: string, progress: number): void => {
    const job = queue.get(jobId);
    if (job) {
      job.progress = progress;

      // Sync to database if we have a reference
      if (dbRef && job.videoId) {
        dbRef
          .update(youtubeVideos)
          .set({
            optimizationProgress: progress,
            updatedAt: Date.now(),
          })
          .where(eq(youtubeVideos.videoId, job.videoId))
          .execute()
          .catch((err: unknown) => {
            logger.warn("[optimization-queue] Failed to update progress in DB", { jobId, err });
          });
      }
    }
  };

  /**
   * Handle job completion
   */
  const handleCompletion = async (
    jobId: string,
    success: boolean,
    finalPath?: string,
    finalSize?: number,
    errorMessage?: string
  ): Promise<void> => {
    const job = queue.get(jobId);
    if (!job) return;

    if (success && finalPath && finalSize) {
      // Replace original file with optimized file
      try {
        const backupPath = `${job.sourceFilePath}.backup`;

        // Create backup of original
        await fs.promises.rename(job.sourceFilePath, backupPath);

        try {
          // Move optimized file to original location
          await fs.promises.rename(finalPath, job.sourceFilePath);

          // Update database
          if (dbRef) {
            await dbRef
              .update(youtubeVideos)
              .set({
                downloadFileSize: finalSize,
                optimizationStatus: "completed",
                optimizationProgress: 100,
                lastOptimizedAt: Date.now(),
                originalFileSize: job.originalSize,
                updatedAt: Date.now(),
              })
              .where(eq(youtubeVideos.videoId, job.videoId))
              .execute();
          }

          // Delete backup
          await fs.promises.unlink(backupPath);

          // Update job status
          job.status = "completed";
          job.progress = 100;
          job.completedAt = Date.now();
          job.finalSize = finalSize;

          // Move to completed list
          queue.delete(jobId);
          completedJobs.unshift(job);
          if (completedJobs.length > MAX_COMPLETED) {
            completedJobs.pop();
          }

          logger.info("[optimization-queue] Optimization completed successfully", {
            jobId,
            videoId: job.videoId,
            originalSize: job.originalSize,
            finalSize,
            savings: `${((1 - finalSize / job.originalSize) * 100).toFixed(1)}%`,
          });
        } catch (replaceError) {
          // Rollback: restore backup
          await fs.promises.rename(backupPath, job.sourceFilePath);
          throw replaceError;
        }
      } catch (error) {
        // Clean up temp file if it exists
        if (finalPath && fs.existsSync(finalPath)) {
          await fs.promises.unlink(finalPath).catch(() => {});
        }

        const errMsg = error instanceof Error ? error.message : "Failed to replace file";
        handleFailure(jobId, errMsg);
      }
    } else {
      handleFailure(jobId, errorMessage || "Optimization failed");
    }
  };

  /**
   * Handle job failure
   */
  const handleFailure = (jobId: string, errorMessage: string): void => {
    const job = queue.get(jobId);
    if (!job) return;

    job.status = "failed";
    job.errorMessage = errorMessage;
    job.completedAt = Date.now();

    // Clean up temp file if it exists
    if (job.targetFilePath && fs.existsSync(job.targetFilePath)) {
      fs.promises.unlink(job.targetFilePath).catch(() => {});
    }

    // Update database
    if (dbRef) {
      dbRef
        .update(youtubeVideos)
        .set({
          optimizationStatus: "failed",
          updatedAt: Date.now(),
        })
        .where(eq(youtubeVideos.videoId, job.videoId))
        .execute()
        .catch((err: unknown) => {
          logger.warn("[optimization-queue] Failed to update failure status in DB", { jobId, err });
        });
    }

    // Move to failed list
    queue.delete(jobId);
    failedJobs.unshift(job);
    if (failedJobs.length > MAX_FAILED) {
      failedJobs.pop();
    }

    logger.error("[optimization-queue] Optimization failed", {
      jobId,
      videoId: job.videoId,
      error: errorMessage,
    });
  };

  /**
   * Process the queue
   */
  const processQueue = async (): Promise<void> => {
    if (!dbRef) return;

    try {
      // Count active jobs
      const activeJobs = Array.from(queue.values()).filter((job) => job.status === "optimizing");

      // Check if we can start more
      const availableSlots = finalConfig.maxConcurrent - activeJobs.length;
      if (availableSlots <= 0) return;

      // Get queued jobs
      const queuedJobs = Array.from(queue.values())
        .filter((job) => job.status === "queued")
        .slice(0, availableSlots);

      // Start each job
      for (const job of queuedJobs) {
        job.status = "optimizing";
        job.startedAt = Date.now();

        // Update database
        await dbRef
          .update(youtubeVideos)
          .set({
            optimizationStatus: "optimizing",
            optimizationProgress: 0,
            updatedAt: Date.now(),
          })
          .where(eq(youtubeVideos.videoId, job.videoId))
          .execute();

        // Spawn worker
        await spawnOptimization(job, updateProgress, handleCompletion);

        logger.info("[optimization-queue] Started optimization", {
          jobId: job.id,
          videoId: job.videoId,
          title: job.title,
          targetResolution: job.targetResolution,
        });
      }
    } catch (error) {
      logger.error("[optimization-queue] Error processing queue", { error });
    }
  };

  /**
   * Add videos to optimization queue
   */
  const addToQueue = async (
    db: Database,
    videoIds: string[],
    targetResolution: TargetResolution
  ): Promise<string[]> => {
    dbRef = db;
    const jobIds: string[] = [];

    // Check FFmpeg availability
    if (!isFfmpegAvailable()) {
      throw new Error("FFmpeg is not available. Please ensure FFmpeg is installed.");
    }

    for (const videoId of videoIds) {
      try {
        logger.info("[optimization-queue] Processing video for queue", { videoId });

        // Get video info from database
        const videos = await db
          .select({
            videoId: youtubeVideos.videoId,
            title: youtubeVideos.title,
            filePath: youtubeVideos.downloadFilePath,
            fileSize: youtubeVideos.downloadFileSize,
            durationSeconds: youtubeVideos.durationSeconds,
            optimizationStatus: youtubeVideos.optimizationStatus,
          })
          .from(youtubeVideos)
          .where(eq(youtubeVideos.videoId, videoId))
          .limit(1);

        logger.info("[optimization-queue] Database query result", {
          videoId,
          found: videos.length > 0,
        });

        if (videos.length === 0) {
          logger.warn("[optimization-queue] Video not found", { videoId });
          continue;
        }

        const video = videos[0];
        logger.info("[optimization-queue] Video info", {
          videoId,
          filePath: video.filePath,
          fileSize: video.fileSize,
          optimizationStatus: video.optimizationStatus,
        });

        // Check if file exists
        if (!video.filePath || !fs.existsSync(video.filePath)) {
          logger.warn("[optimization-queue] Video file not found", {
            videoId,
            filePath: video.filePath,
          });
          continue;
        }
        logger.info("[optimization-queue] File exists check passed", { videoId });

        // Skip if already being optimized
        if (video.optimizationStatus === "optimizing" || video.optimizationStatus === "queued") {
          logger.warn("[optimization-queue] Video already in optimization queue", { videoId });
          continue;
        }
        logger.info("[optimization-queue] Status check passed", { videoId });

        // Skip if already in our queue
        const existingJob = Array.from(queue.values()).find((j) => j.videoId === videoId);
        if (existingJob) {
          logger.warn("[optimization-queue] Video already queued", { videoId });
          continue;
        }

        // Get file size
        const stats = fs.statSync(video.filePath);
        const originalSize = stats.size;

        // Get duration if not in database
        let duration = video.durationSeconds || 0;
        if (duration === 0) {
          duration = await getVideoDuration(video.filePath);
        }

        // Generate temp output path
        const dir = path.dirname(video.filePath);
        const ext = path.extname(video.filePath);
        const baseName = path.basename(video.filePath, ext);
        const tempPath = path.join(dir, `${baseName}.optimizing.mp4`);

        // Create job
        const jobId = `opt-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        const job: OptimizationJob = {
          id: jobId,
          videoId,
          title: video.title,
          sourceFilePath: video.filePath,
          targetFilePath: tempPath,
          targetResolution,
          status: "queued",
          progress: 0,
          originalSize,
          estimatedSize: null,
          finalSize: null,
          errorMessage: null,
          addedAt: Date.now(),
          startedAt: null,
          completedAt: null,
          durationSeconds: duration,
        };

        queue.set(jobId, job);
        jobIds.push(jobId);

        // Update database status
        await db
          .update(youtubeVideos)
          .set({
            optimizationStatus: "queued",
            optimizationProgress: 0,
            updatedAt: Date.now(),
          })
          .where(eq(youtubeVideos.videoId, videoId))
          .execute();

        logger.info("[optimization-queue] Added to queue", {
          jobId,
          videoId,
          title: video.title,
          originalSize,
          targetResolution,
        });
      } catch (error) {
        logger.error("[optimization-queue] Failed to add video to queue", { videoId, error });
      }
    }

    // Auto-start if not processing
    if (!processing && jobIds.length > 0) {
      start(db);
    }

    return jobIds;
  };

  /**
   * Cancel an optimization
   */
  const cancelOptimization = async (jobId: string): Promise<void> => {
    const job = queue.get(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    // Kill worker if active
    if (job.status === "optimizing") {
      killOptimization(jobId);
    }

    // Clean up temp file
    if (job.targetFilePath && fs.existsSync(job.targetFilePath)) {
      await fs.promises.unlink(job.targetFilePath).catch(() => {});
    }

    // Update database
    if (dbRef) {
      await dbRef
        .update(youtubeVideos)
        .set({
          optimizationStatus: "cancelled",
          updatedAt: Date.now(),
        })
        .where(eq(youtubeVideos.videoId, job.videoId))
        .execute();
    }

    // Remove from queue
    queue.delete(jobId);

    logger.info("[optimization-queue] Cancelled optimization", { jobId, videoId: job.videoId });
  };

  /**
   * Get queue status
   */
  const getQueueStatus = (): OptimizationQueueStatus => {
    const allJobs = Array.from(queue.values());

    const queued = allJobs.filter((j) => j.status === "queued");
    const optimizing = allJobs.filter((j) => j.status === "optimizing");

    // Calculate stats
    const totalSpaceSaved = completedJobs.reduce((sum, j) => {
      if (j.finalSize && j.originalSize) {
        return sum + (j.originalSize - j.finalSize);
      }
      return sum;
    }, 0);

    const stats: OptimizationStats = {
      totalQueued: queued.length,
      totalActive: optimizing.length,
      totalCompleted: completedJobs.length,
      totalFailed: failedJobs.length,
      averageProgress:
        optimizing.length > 0
          ? optimizing.reduce((sum, j) => sum + j.progress, 0) / optimizing.length
          : 0,
      totalSpaceSaved,
    };

    return {
      queued,
      optimizing,
      completed: [...completedJobs],
      failed: [...failedJobs],
      stats,
    };
  };

  /**
   * Start queue processor
   */
  const start = (db: Database): void => {
    if (processing) return;

    dbRef = db;
    processing = true;

    logger.info("[optimization-queue] Starting queue processor", {
      maxConcurrent: finalConfig.maxConcurrent,
    });

    // Process every 2 seconds
    processingInterval = setInterval(() => {
      processQueue().catch((error: unknown) => {
        logger.error("[optimization-queue] Error in queue processing", { error });
      });
    }, 2000);

    // Process immediately
    processQueue().catch((error: unknown) => {
      logger.error("[optimization-queue] Error in initial queue processing", { error });
    });
  };

  /**
   * Stop queue processor
   */
  const stop = (): void => {
    if (!processing) return;

    processing = false;
    if (processingInterval) {
      clearInterval(processingInterval);
      processingInterval = null;
    }

    logger.info("[optimization-queue] Stopped queue processor");
  };

  /**
   * Check if processing
   */
  const isProcessing = (): boolean => processing;

  return {
    addToQueue,
    cancelOptimization,
    getQueueStatus,
    start,
    stop,
    isProcessing,
  };
};

// Singleton instance
let optimizationQueueManagerInstance: OptimizationQueueManagerInstance | null = null;

/**
 * Get or create optimization queue manager
 */
export const getOptimizationQueueManager = (
  config?: Partial<OptimizationConfig>
): OptimizationQueueManagerInstance => {
  if (!optimizationQueueManagerInstance) {
    optimizationQueueManagerInstance = createOptimizationQueueManager(config);
  }
  return optimizationQueueManagerInstance;
};

/**
 * Get existing queue manager (throws if not initialized)
 */
export const requireOptimizationQueueManager = (): OptimizationQueueManagerInstance => {
  if (!optimizationQueueManagerInstance) {
    optimizationQueueManagerInstance = createOptimizationQueueManager();
  }
  return optimizationQueueManagerInstance;
};
