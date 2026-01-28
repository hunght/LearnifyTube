import { z } from "zod";
import { publicProcedure, t } from "@/api/trpc";
import { logger } from "@/helpers/logger";
import { eq, and, desc, inArray } from "drizzle-orm";
import {
  favorites,
  youtubeVideos,
  customPlaylists,
  channelPlaylists,
  customPlaylistItems,
} from "@/api/db/schema";
import defaultDb from "@/api/db";

const entityTypeSchema = z.enum(["video", "custom_playlist", "channel_playlist"]);

export const favoritesRouter = t.router({
  // Toggle favorite status (add if not exists, remove if exists)
  toggle: publicProcedure
    .input(
      z.object({
        entityType: entityTypeSchema,
        entityId: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = ctx.db ?? defaultDb;
      const now = Date.now();

      try {
        // Check if already favorited
        const [existing] = await db
          .select()
          .from(favorites)
          .where(
            and(eq(favorites.entityType, input.entityType), eq(favorites.entityId, input.entityId))
          )
          .limit(1);

        if (existing) {
          // Remove from favorites
          await db.delete(favorites).where(eq(favorites.id, existing.id));

          logger.info("[favorites] Removed from favorites", {
            entityType: input.entityType,
            entityId: input.entityId,
          });

          return { success: true, isFavorite: false };
        } else {
          // Add to favorites
          const id = crypto.randomUUID();
          await db.insert(favorites).values({
            id,
            entityType: input.entityType,
            entityId: input.entityId,
            createdAt: now,
            updatedAt: now,
          });

          logger.info("[favorites] Added to favorites", {
            entityType: input.entityType,
            entityId: input.entityId,
          });

          return { success: true, isFavorite: true };
        }
      } catch (e) {
        logger.error("[favorites] toggle failed", {
          entityType: input.entityType,
          entityId: input.entityId,
          error: String(e),
        });
        return { success: false, isFavorite: false, message: "Failed to toggle favorite" };
      }
    }),

  // Check if a single item is favorited
  isFavorite: publicProcedure
    .input(
      z.object({
        entityType: entityTypeSchema,
        entityId: z.string(),
      })
    )
    .query(async ({ input, ctx }) => {
      const db = ctx.db ?? defaultDb;

      try {
        const [existing] = await db
          .select()
          .from(favorites)
          .where(
            and(eq(favorites.entityType, input.entityType), eq(favorites.entityId, input.entityId))
          )
          .limit(1);

        return { isFavorite: !!existing };
      } catch (e) {
        logger.error("[favorites] isFavorite check failed", {
          entityType: input.entityType,
          entityId: input.entityId,
          error: String(e),
        });
        return { isFavorite: false };
      }
    }),

  // Batch check multiple items (useful for list views)
  checkMultiple: publicProcedure
    .input(
      z.object({
        items: z.array(
          z.object({
            entityType: entityTypeSchema,
            entityId: z.string(),
          })
        ),
      })
    )
    .query(async ({ input, ctx }) => {
      const db = ctx.db ?? defaultDb;

      if (input.items.length === 0) {
        return { favorites: {} };
      }

      try {
        const allFavorites = await db.select().from(favorites);

        // Create a map of entityType:entityId -> true
        const favoriteMap: Record<string, boolean> = {};
        for (const fav of allFavorites) {
          favoriteMap[`${fav.entityType}:${fav.entityId}`] = true;
        }

        // Check which requested items are in favorites
        const result: Record<string, boolean> = {};
        for (const item of input.items) {
          const key = `${item.entityType}:${item.entityId}`;
          result[key] = !!favoriteMap[key];
        }

        return { favorites: result };
      } catch (e) {
        logger.error("[favorites] checkMultiple failed", { error: String(e) });
        return { favorites: {} };
      }
    }),

  // List all favorites with entity details
  listAll: publicProcedure
    .input(z.object({ limit: z.number().min(1).max(500).optional() }).optional())
    .query(async ({ input, ctx }) => {
      const db = ctx.db ?? defaultDb;
      const limit = input?.limit ?? 100;

      try {
        const allFavorites = await db
          .select()
          .from(favorites)
          .orderBy(desc(favorites.createdAt))
          .limit(limit);

        // Group by entity type
        const videoIds = allFavorites
          .filter((f) => f.entityType === "video")
          .map((f) => f.entityId);
        const customPlaylistIds = allFavorites
          .filter((f) => f.entityType === "custom_playlist")
          .map((f) => f.entityId);
        const channelPlaylistIds = allFavorites
          .filter((f) => f.entityType === "channel_playlist")
          .map((f) => f.entityId);

        // Fetch entity details
        const videos =
          videoIds.length > 0
            ? await db.select().from(youtubeVideos).where(inArray(youtubeVideos.videoId, videoIds))
            : [];

        const customPlaylistsData =
          customPlaylistIds.length > 0
            ? await db
                .select()
                .from(customPlaylists)
                .where(inArray(customPlaylists.id, customPlaylistIds))
            : [];

        // Get preview thumbnails for custom playlists
        const customPlaylistsWithPreviews = await Promise.all(
          customPlaylistsData.map(async (playlist) => {
            const previewItems = await db
              .select({
                videoId: customPlaylistItems.videoId,
                video: youtubeVideos,
              })
              .from(customPlaylistItems)
              .leftJoin(youtubeVideos, eq(customPlaylistItems.videoId, youtubeVideos.videoId))
              .where(eq(customPlaylistItems.playlistId, playlist.id))
              .orderBy(customPlaylistItems.position)
              .limit(1);

            const firstVideo = previewItems[0]?.video;
            return {
              ...playlist,
              thumbnailUrl: firstVideo?.thumbnailUrl ?? null,
              thumbnailPath: firstVideo?.thumbnailPath ?? null,
            };
          })
        );

        const channelPlaylistsData =
          channelPlaylistIds.length > 0
            ? await db
                .select()
                .from(channelPlaylists)
                .where(inArray(channelPlaylists.playlistId, channelPlaylistIds))
            : [];

        // Create lookup maps
        const videoMap = new Map(videos.map((v) => [v.videoId, v]));
        const customPlaylistMap = new Map(customPlaylistsWithPreviews.map((p) => [p.id, p]));
        const channelPlaylistMap = new Map(channelPlaylistsData.map((p) => [p.playlistId, p]));

        // Build result array maintaining favorites order
        type VideoFavorite = {
          favoriteId: string;
          entityType: "video";
          entityId: string;
          createdAt: number;
          video: {
            videoId: string;
            title: string;
            channelTitle: string;
            thumbnailUrl: string | null;
            thumbnailPath: string | null;
            durationSeconds: number | null;
            downloadStatus: string | null;
          };
        };
        type CustomPlaylistFavorite = {
          favoriteId: string;
          entityType: "custom_playlist";
          entityId: string;
          createdAt: number;
          customPlaylist: {
            id: string;
            name: string;
            description: string | null;
            itemCount: number | null;
            thumbnailUrl: string | null;
            thumbnailPath: string | null;
          };
        };
        type ChannelPlaylistFavorite = {
          favoriteId: string;
          entityType: "channel_playlist";
          entityId: string;
          createdAt: number;
          channelPlaylist: {
            playlistId: string;
            title: string;
            description: string | null;
            itemCount: number | null;
            thumbnailUrl: string | null;
            thumbnailPath: string | null;
          };
        };
        type FavoriteResult = VideoFavorite | CustomPlaylistFavorite | ChannelPlaylistFavorite;

        const result: FavoriteResult[] = [];

        for (const fav of allFavorites) {
          if (fav.entityType === "video") {
            const video = videoMap.get(fav.entityId);
            if (video) {
              result.push({
                favoriteId: fav.id,
                entityType: "video",
                entityId: fav.entityId,
                createdAt: fav.createdAt,
                video: {
                  videoId: video.videoId,
                  title: video.title,
                  channelTitle: video.channelTitle,
                  thumbnailUrl: video.thumbnailUrl,
                  thumbnailPath: video.thumbnailPath,
                  durationSeconds: video.durationSeconds,
                  downloadStatus: video.downloadStatus,
                },
              });
            }
          } else if (fav.entityType === "custom_playlist") {
            const playlist = customPlaylistMap.get(fav.entityId);
            if (playlist) {
              result.push({
                favoriteId: fav.id,
                entityType: "custom_playlist",
                entityId: fav.entityId,
                createdAt: fav.createdAt,
                customPlaylist: {
                  id: playlist.id,
                  name: playlist.name,
                  description: playlist.description,
                  itemCount: playlist.itemCount,
                  thumbnailUrl: playlist.thumbnailUrl,
                  thumbnailPath: playlist.thumbnailPath,
                },
              });
            }
          } else if (fav.entityType === "channel_playlist") {
            const playlist = channelPlaylistMap.get(fav.entityId);
            if (playlist) {
              result.push({
                favoriteId: fav.id,
                entityType: "channel_playlist",
                entityId: fav.entityId,
                createdAt: fav.createdAt,
                channelPlaylist: {
                  playlistId: playlist.playlistId,
                  title: playlist.title,
                  description: playlist.description,
                  itemCount: playlist.itemCount,
                  thumbnailUrl: playlist.thumbnailUrl,
                  thumbnailPath: playlist.thumbnailPath,
                },
              });
            }
          }
        }

        return result;
      } catch (e) {
        logger.error("[favorites] listAll failed", { error: String(e) });
        return [];
      }
    }),

  // Explicit remove (alternative to toggle)
  remove: publicProcedure
    .input(
      z.object({
        entityType: entityTypeSchema,
        entityId: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = ctx.db ?? defaultDb;

      try {
        await db
          .delete(favorites)
          .where(
            and(eq(favorites.entityType, input.entityType), eq(favorites.entityId, input.entityId))
          );

        logger.info("[favorites] Removed from favorites", {
          entityType: input.entityType,
          entityId: input.entityId,
        });

        return { success: true };
      } catch (e) {
        logger.error("[favorites] remove failed", {
          entityType: input.entityType,
          entityId: input.entityId,
          error: String(e),
        });
        return { success: false, message: "Failed to remove from favorites" };
      }
    }),
});
