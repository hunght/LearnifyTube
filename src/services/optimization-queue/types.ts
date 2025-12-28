/**
 * Optimization status enum
 */
export type OptimizationStatus = "queued" | "optimizing" | "completed" | "failed" | "cancelled";

/**
 * Target resolution for optimization
 */
export type TargetResolution = "original" | "1080p" | "720p" | "480p";

/**
 * Optimization job in the queue
 */
export interface OptimizationJob {
  id: string;
  videoId: string;
  title: string;
  sourceFilePath: string;
  targetFilePath: string; // Temp path during optimization
  targetResolution: TargetResolution;
  status: OptimizationStatus;
  progress: number; // 0-100
  originalSize: number; // bytes
  estimatedSize: number | null; // estimated output size
  finalSize: number | null; // actual output size after completion
  errorMessage: string | null;
  addedAt: number;
  startedAt: number | null;
  completedAt: number | null;
  durationSeconds: number | null; // Video duration for progress calculation
}

/**
 * Optimization queue configuration
 */
export interface OptimizationConfig {
  maxConcurrent: number;
  videoBitrate: Record<TargetResolution, string>;
  audioBitrate: string;
  preset: string; // libx264 preset
  crf: number; // Constant Rate Factor (18-28, lower = better quality)
}

/**
 * Queue statistics
 */
export interface OptimizationStats {
  totalQueued: number;
  totalActive: number;
  totalCompleted: number;
  totalFailed: number;
  averageProgress: number;
  totalSpaceSaved: number; // bytes saved across all completed optimizations
}

/**
 * Full queue status for UI
 */
export interface OptimizationQueueStatus {
  queued: OptimizationJob[];
  optimizing: OptimizationJob[];
  completed: OptimizationJob[];
  failed: OptimizationJob[];
  stats: OptimizationStats;
}

/**
 * Input for starting optimization
 */
export interface StartOptimizationInput {
  videoIds: string[];
  targetResolution: TargetResolution;
}

/**
 * Result from starting optimization
 */
export interface StartOptimizationResult {
  success: boolean;
  jobIds: string[];
  message?: string;
}
