/**
 * Background Jobs Service Types
 *
 * Types for managing long-running yt-dlp operations that run in the background.
 * Unlike downloads (which have progress/pause/resume), these are "fire and forget"
 * metadata fetching operations.
 */

export type BackgroundJobType =
  | "playlist_fetch"
  | "channel_fetch"
  | "channel_latest"
  | "channel_popular"
  | "channel_playlists";

export type BackgroundJobStatus = "pending" | "running" | "completed" | "failed";

export interface BackgroundJob {
  id: string;
  type: BackgroundJobType;
  status: BackgroundJobStatus;
  title: string; // Human-readable description, e.g., "Loading playlist: Music 2024"
  entityId?: string; // playlistId, channelId, etc.
  error?: string;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
}

export interface BackgroundJobsStatus {
  jobs: BackgroundJob[];
  runningCount: number;
  pendingCount: number;
  completedCount: number;
  failedCount: number;
}

export interface CreateJobParams {
  type: BackgroundJobType;
  title: string;
  entityId?: string;
}
