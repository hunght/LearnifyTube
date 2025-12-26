import { z } from "zod";
import { publicProcedure, t } from "@/api/trpc";
import { logger } from "@/helpers/logger";
import { eq, desc, inArray, sql } from "drizzle-orm";
import { youtubeVideos, videoWatchStats } from "@/api/db/schema";
import defaultDb from "@/api/db";

// Return types for watch-stats router
type RecordProgressSuccess = {
  success: true;
};

type RecordProgressFailure = {
  success: false;
};

type RecordProgressResult = RecordProgressSuccess | RecordProgressFailure;

type WatchedVideoWithStats = {
  id: string;
  videoId: string;
  title: string;
  description: string | null;
  channelId: string | null;
  channelTitle: string;
  thumbnailUrl: string | null;
  thumbnailPath: string | null;
  durationSeconds: number | null;
  viewCount: number | null;
  publishedAt: number | null;
  totalWatchSeconds: number | null;
  lastPositionSeconds: number | null;
  lastWatchedAt: number;
};

type ListRecentWatchedResult = WatchedVideoWithStats[];

type RecentVideoInfo = {
  id: string;
  videoId: string;
  title: string;
  description: string | null;
  channelId: string | null;
  channelTitle: string;
  thumbnailUrl: string | null;
  thumbnailPath: string | null;
  durationSeconds: number | null;
  viewCount: number | null;
  publishedAt: number | null;
  downloadStatus: string | null;
  downloadProgress: number | null;
  downloadFilePath: string | null;
};

type ListRecentVideosResult = RecentVideoInfo[];

export const watchStatsRouter = t.router({
  // Record watch progress (accumulated seconds and last position)
  recordProgress: publicProcedure
    .input(
      z.object({
        videoId: z.string(),
        deltaSeconds: z.number().min(0).max(3600),
        positionSeconds: z.number().min(0).optional(),
      })
    )
    .mutation(async ({ input, ctx }): Promise<RecordProgressResult> => {
      const db = ctx.db ?? defaultDb;
      const now = Date.now();
      try {
        const existing = await db
          .select()
          .from(videoWatchStats)
          .where(eq(videoWatchStats.videoId, input.videoId))
          .limit(1);

        if (existing.length === 0) {
          await db.insert(videoWatchStats).values({
            id: crypto.randomUUID(),
            videoId: input.videoId,
            totalWatchSeconds: Math.floor(input.deltaSeconds),
            lastPositionSeconds: Math.floor(input.positionSeconds ?? 0),
            lastWatchedAt: now,
            createdAt: now,
            updatedAt: now,
          });
        } else {
          const prev = existing[0];
          await db
            .update(videoWatchStats)
            .set({
              totalWatchSeconds: Math.max(
                0,
                (prev.totalWatchSeconds ?? 0) + Math.floor(input.deltaSeconds)
              ),
              lastPositionSeconds: Math.floor(
                input.positionSeconds ?? prev.lastPositionSeconds ?? 0
              ),
              lastWatchedAt: now,
              updatedAt: now,
            })
            .where(eq(videoWatchStats.videoId, input.videoId));
        }
        return { success: true };
      } catch (e) {
        logger.error("[watch-stats] recordProgress failed", e);
        return { success: false };
      }
    }),

  // List recently watched videos joined with metadata
  listRecentWatched: publicProcedure
    .input(z.object({ limit: z.number().min(1).max(200).optional() }).optional())
    .query(async ({ input, ctx }): Promise<ListRecentWatchedResult> => {
      const db = ctx.db ?? defaultDb;
      const limit = input?.limit ?? 30;
      // Get recent watch stats
      const stats = await db
        .select()
        .from(videoWatchStats)
        .orderBy(desc(videoWatchStats.lastWatchedAt))
        .limit(limit);

      const videoIds = stats.map((s) => s.videoId);
      if (videoIds.length === 0) return [];

      const vids = await db
        .select()
        .from(youtubeVideos)
        .where(inArray(youtubeVideos.videoId, videoIds));

      const map = new Map<string, (typeof vids)[0]>();
      vids.forEach((v) => map.set(v.videoId, v));
      return stats
        .map((s) => {
          const v = map.get(s.videoId);
          if (!v) return null;
          return {
            id: v.id,
            videoId: v.videoId,
            title: v.title,
            description: v.description,
            channelId: v.channelId,
            channelTitle: v.channelTitle,
            thumbnailUrl: v.thumbnailUrl,
            thumbnailPath: v.thumbnailPath,
            durationSeconds: v.durationSeconds,
            viewCount: v.viewCount,
            publishedAt: v.publishedAt,
            totalWatchSeconds: s.totalWatchSeconds,
            lastPositionSeconds: s.lastPositionSeconds,
            lastWatchedAt: s.lastWatchedAt,
          };
        })
        .filter((v): v is WatchedVideoWithStats => v !== null);
    }),

  // List videos by most recently added (watch history fallback)
  listRecentVideos: publicProcedure
    .input(z.object({ limit: z.number().min(1).max(200).optional() }).optional())
    .query(async ({ input, ctx }): Promise<ListRecentVideosResult> => {
      const db = ctx.db ?? defaultDb;
      const limit = input?.limit ?? 30;
      const rows = await db
        .select()
        .from(youtubeVideos)
        .orderBy(desc(sql`${youtubeVideos.createdAt}`))
        .limit(limit);
      return rows.map((row) => ({
        id: row.id,
        videoId: row.videoId,
        title: row.title,
        description: row.description,
        channelId: row.channelId,
        channelTitle: row.channelTitle,
        thumbnailUrl: row.thumbnailUrl,
        thumbnailPath: row.thumbnailPath,
        durationSeconds: row.durationSeconds,
        viewCount: row.viewCount,
        publishedAt: row.publishedAt,
        downloadStatus: row.downloadStatus,
        downloadProgress: row.downloadProgress,
        downloadFilePath: row.downloadFilePath,
      }));
    }),
});

// Router type not exported (unused)
