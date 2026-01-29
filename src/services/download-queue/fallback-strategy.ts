import type { DownloadQuality } from "@/lib/types/user-preferences";
import { logger } from "@/helpers/logger";

/**
 * Player clients in fallback order (most reliable first based on testing)
 * - android: Default, avoids SABR streaming issues
 * - ios: Good alternative for restricted content
 * - tv: Simple client, often works when others fail
 * - mweb: Mobile web client
 * - web_safari: Safari web client (avoids some restrictions)
 * - web: Standard web client (last resort, may hit SABR issues)
 */
export const PLAYER_CLIENTS = ["android", "ios", "tv", "mweb", "web_safari", "web"] as const;

export type PlayerClient = (typeof PLAYER_CLIENTS)[number];

/**
 * Format strategies from most specific to most permissive
 */
export const FORMAT_STRATEGIES = [
  "quality", // User's preferred quality, WebM-first
  "quality_any", // User's preferred quality, any format
  "fallback", // Lower quality fallback (480p max)
  "best", // Just get the best available
  "hls", // HLS streaming fallback (for SABR-affected formats)
] as const;

export type FormatStrategy = (typeof FORMAT_STRATEGIES)[number];

/**
 * Fallback state tracking
 */
export interface FallbackState {
  playerClientIndex: number;
  formatStrategyIndex: number;
  fallbackAttempts: number;
  maxFallbackAttempts: number;
}

/**
 * Error types that trigger specific fallback actions
 */
type FallbackAction = "next_client" | "next_format" | "delay_retry" | "no_fallback";

/**
 * Get player client by index
 */
export const getPlayerClient = (index: number): PlayerClient => {
  const clampedIndex = Math.max(0, Math.min(index, PLAYER_CLIENTS.length - 1));
  return PLAYER_CLIENTS[clampedIndex];
};

/**
 * Get format string based on strategy and quality preference
 */
export const getFormatString = (strategy: FormatStrategy, quality: DownloadQuality): string => {
  const heightMap: Record<DownloadQuality, number> = {
    "360p": 360,
    "480p": 480,
    "720p": 720,
    "1080p": 1080,
  };
  const maxHeight = heightMap[quality];

  switch (strategy) {
    case "quality":
      // User's preferred quality, WebM-first with progressive fallback
      return `best[height<=${maxHeight}][ext=webm]/bestvideo[height<=${maxHeight}][ext=webm]+bestaudio[ext=webm]/best[height<=${Math.min(maxHeight, 720)}][ext=webm]/best[height<=${Math.min(maxHeight, 480)}][ext=webm]/best[height<=${maxHeight}][ext=mp4][vcodec^=avc1]/bestvideo[height<=${maxHeight}][ext=mp4][vcodec^=avc1]+bestaudio[ext=m4a]/best[height<=${maxHeight}]`;

    case "quality_any":
      // User's preferred quality, any format (no codec restrictions)
      return `best[height<=${maxHeight}]/bestvideo[height<=${maxHeight}]+bestaudio/best[height<=${maxHeight}]`;

    case "fallback":
      // Lower quality fallback (always 480p max for reliability)
      return `best[height<=480]/bestvideo[height<=480]+bestaudio/best[height<=480]`;

    case "best":
      // Just get anything that works
      return `bv*+ba/b/best`;

    case "hls":
      // HLS streaming fallback (bypasses SABR-affected formats)
      return `bv*[protocol=m3u8]+ba[protocol=m3u8]/b[protocol=m3u8]/best`;

    default:
      // Fallback to quality strategy
      return getFormatString("quality", quality);
  }
};

/**
 * Determine fallback action based on error message and type
 */
const determineFallbackAction = (errorMessage: string, errorType: string): FallbackAction => {
  const lowerMessage = errorMessage.toLowerCase();
  const lowerType = errorType.toLowerCase();

  // No fallback for auth-required errors
  if (
    lowerMessage.includes("sign-in") ||
    lowerMessage.includes("sign in") ||
    lowerMessage.includes("login") ||
    lowerMessage.includes("age-restricted") ||
    lowerType === "auth_required"
  ) {
    return "no_fallback";
  }

  // Player client issues - try next client
  if (
    lowerMessage.includes("n challenge") ||
    lowerMessage.includes("nsig") ||
    lowerMessage.includes("sabr") ||
    lowerMessage.includes("http error 403") ||
    lowerType === "http_403_forbidden"
  ) {
    return "next_client";
  }

  // Format availability issues - try simpler format
  if (
    lowerMessage.includes("format not available") ||
    lowerMessage.includes("requested format") ||
    lowerMessage.includes("no video formats") ||
    lowerMessage.includes("unable to download") ||
    lowerMessage.includes("format is not available")
  ) {
    return "next_format";
  }

  // Rate limiting - delay and retry same config
  if (lowerMessage.includes("http error 429") || lowerType === "http_429_rate_limited") {
    return "delay_retry";
  }

  // Generic HTTP errors - try next client
  if (lowerMessage.includes("http error") || lowerType.includes("http_error")) {
    return "next_client";
  }

  // Default: try next format (less disruptive than changing client)
  return "next_format";
};

/**
 * Check if error is eligible for automatic fallback
 */
export const shouldAutoFallback = (errorMessage: string, errorType: string): boolean => {
  const action = determineFallbackAction(errorMessage, errorType);
  return action !== "no_fallback";
};

/**
 * Get next fallback state based on current state and error type
 * Returns null if no more fallbacks are available
 */
export const getNextFallbackState = (
  current: FallbackState,
  errorMessage: string,
  errorType: string
): FallbackState | null => {
  // Check if we've exceeded max attempts
  if (current.fallbackAttempts >= current.maxFallbackAttempts) {
    logger.debug("[fallback-strategy] Max fallback attempts reached", {
      attempts: current.fallbackAttempts,
      max: current.maxFallbackAttempts,
    });
    return null;
  }

  const action = determineFallbackAction(errorMessage, errorType);

  if (action === "no_fallback") {
    logger.debug("[fallback-strategy] Error not eligible for fallback", {
      errorMessage,
      errorType,
    });
    return null;
  }

  let nextClientIndex = current.playerClientIndex;
  let nextFormatIndex = current.formatStrategyIndex;

  if (action === "next_client") {
    // Try next player client, reset format strategy
    nextClientIndex = current.playerClientIndex + 1;
    nextFormatIndex = 0; // Reset format strategy for new client

    // If we've exhausted all clients, cycle back to first client with next format
    if (nextClientIndex >= PLAYER_CLIENTS.length) {
      nextClientIndex = 0;
      nextFormatIndex = current.formatStrategyIndex + 1;

      // If we've also exhausted all formats, no more fallbacks
      if (nextFormatIndex >= FORMAT_STRATEGIES.length) {
        logger.debug("[fallback-strategy] All player clients and formats exhausted");
        return null;
      }
    }
  } else if (action === "next_format" || action === "delay_retry") {
    // Try next format strategy with same client
    nextFormatIndex = current.formatStrategyIndex + 1;

    // If we've exhausted formats for this client, try next client
    if (nextFormatIndex >= FORMAT_STRATEGIES.length) {
      nextClientIndex = current.playerClientIndex + 1;
      nextFormatIndex = 0;

      // If we've exhausted all clients too, no more fallbacks
      if (nextClientIndex >= PLAYER_CLIENTS.length) {
        logger.debug("[fallback-strategy] All formats and player clients exhausted");
        return null;
      }
    }
  }

  const nextState: FallbackState = {
    playerClientIndex: nextClientIndex,
    formatStrategyIndex: nextFormatIndex,
    fallbackAttempts: current.fallbackAttempts + 1,
    maxFallbackAttempts: current.maxFallbackAttempts,
  };

  logger.info("[fallback-strategy] Advancing to next fallback", {
    previousClient: PLAYER_CLIENTS[current.playerClientIndex],
    previousFormat: FORMAT_STRATEGIES[current.formatStrategyIndex],
    nextClient: PLAYER_CLIENTS[nextClientIndex],
    nextFormat: FORMAT_STRATEGIES[nextFormatIndex],
    attempt: nextState.fallbackAttempts,
    maxAttempts: nextState.maxFallbackAttempts,
    action,
  });

  return nextState;
};

/**
 * Create initial fallback state for a new download
 */
export const createInitialFallbackState = (maxAttempts = 10): FallbackState => ({
  playerClientIndex: 0,
  formatStrategyIndex: 0,
  fallbackAttempts: 0,
  maxFallbackAttempts: maxAttempts,
});

/**
 * Get human-readable fallback status string for UI display
 */
export const getFallbackStatusString = (state: FallbackState): string | null => {
  if (state.fallbackAttempts === 0) {
    return null; // No fallback yet, don't show anything
  }

  const client = PLAYER_CLIENTS[state.playerClientIndex];
  const format = FORMAT_STRATEGIES[state.formatStrategyIndex];

  return `Fallback ${state.fallbackAttempts}/${state.maxFallbackAttempts}: ${client} client, ${format} format`;
};
