import type { OptimizationConfig, TargetResolution } from "./types";

/**
 * Default optimization configuration
 */
export const DEFAULT_OPTIMIZATION_CONFIG: OptimizationConfig = {
  maxConcurrent: 1, // Video encoding is CPU-intensive
  videoBitrate: {
    original: "", // Keep original bitrate (CRF-based encoding)
    "1080p": "5000k",
    "720p": "2500k",
    "480p": "1000k",
  },
  audioBitrate: "128k",
  preset: "medium", // Balance between speed and quality
  crf: 23, // Good quality/size balance (18-28 range, lower = better)
};

/**
 * Resolution scale values for FFmpeg
 * Format: width:-2 (maintains aspect ratio, ensures even height)
 */
export const RESOLUTION_SCALE: Record<TargetResolution, string | null> = {
  original: null, // No scaling
  "1080p": "1920:-2",
  "720p": "1280:-2",
  "480p": "854:-2",
};

/**
 * Resolution height limits for determining if downscaling is needed
 */
export const RESOLUTION_HEIGHT: Record<TargetResolution, number | null> = {
  original: null,
  "1080p": 1080,
  "720p": 720,
  "480p": 480,
};

/**
 * Estimated compression ratios for space savings calculations
 * Based on typical H.264 encoding results
 */
export const ESTIMATED_COMPRESSION_RATIO: Record<TargetResolution, number> = {
  original: 0.7, // ~30% size reduction from re-encoding
  "1080p": 0.5, // ~50% reduction with downscale
  "720p": 0.35, // ~65% reduction
  "480p": 0.2, // ~80% reduction
};
