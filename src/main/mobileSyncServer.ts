import * as fs from "fs";
import * as path from "path";
import * as http from "http";
import * as os from "os";
import { eq, and, inArray, count } from "drizzle-orm";
import { logger } from "../helpers/logger";
import defaultDb from "../api/db";
import {
  youtubeVideos,
  videoTranscripts,
  channels,
  channelPlaylists,
  customPlaylists,
  playlistItems,
  customPlaylistItems,
  favorites,
} from "../api/db/schema";
import { app } from "electron";
import { getMdnsService } from "./mdnsService";
import { parseVttToSegments } from "../api/routers/transcripts";
import { downloadImageToCache } from "../api/utils/ytdlp-utils/thumbnail";

/**
 * HTTP server for mobile sync - allows the mobile companion app
 * to discover and download videos over local WiFi.
 */

const DEFAULT_PORT = 53318;

type FavoriteEntityType = "video" | "custom_playlist" | "channel_playlist";
function isFavoriteEntityType(s: string): s is FavoriteEntityType {
  return s === "video" || s === "custom_playlist" || s === "channel_playlist";
}

// API response types matching mobile app expectations
interface ServerInfo {
  name: string;
  version: string;
  videoCount: number;
}

interface RemoteVideo {
  id: string;
  title: string;
  channelTitle: string;
  duration: number;
  fileSize: number;
  hasTranscript: boolean;
  thumbnailUrl?: string;
}

interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

interface VideoMeta {
  id: string;
  title: string;
  channelTitle: string;
  duration: number;
  transcript?: {
    language: string;
    segments: TranscriptSegment[];
  };
}

export interface ConnectedDevice {
  ip: string;
  lastSeen: number;
  requestCount: number;
  userAgent?: string;
}

// Sync API response types
interface RemoteChannel {
  channelId: string;
  channelTitle: string;
  thumbnailUrl: string | null;
  videoCount: number;
}

interface RemotePlaylist {
  playlistId: string;
  title: string;
  thumbnailUrl: string | null;
  itemCount: number | null;
  channelId: string | null;
  type: "channel" | "custom";
  downloadedCount: number;
}

interface RemoteVideoWithStatus {
  id: string;
  title: string;
  channelTitle: string;
  duration: number;
  thumbnailUrl: string | null;
  downloadStatus: "completed" | "downloading" | "queued" | "pending" | null;
  downloadProgress: number | null;
  fileSize: number | null;
}

interface RemoteFavorite {
  id: string;
  entityType: "video" | "custom_playlist" | "channel_playlist";
  entityId: string;
  // Populated fields based on type
  video?: RemoteVideoWithStatus;
  playlist?: RemotePlaylist;
}

interface ServerDownloadStatus {
  videoId: string;
  status: "queued" | "downloading" | "completed" | "failed" | "pending" | null;
  progress: number | null;
  error: string | null;
}

type MobileSyncServer = {
  start: (port?: number) => Promise<number>;
  stop: () => Promise<void>;
  getPort: () => number;
  isRunning: () => boolean;
  getConnectedDevices: () => ConnectedDevice[];
};

/**
 * Get the local IP address for LAN access
 */
export function getLocalIpAddress(): string | null {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      // Skip internal and non-IPv4 addresses
      if (iface.family === "IPv4" && !iface.internal) {
        return iface.address;
      }
    }
  }
  return null;
}

const createMobileSyncServer = (): MobileSyncServer => {
  let server: http.Server | null = null;
  let port = 0;
  const connectedDevices = new Map<string, ConnectedDevice>();

  // Clean up stale devices (not seen in last 5 minutes)
  const cleanupStaleDevices = (): void => {
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    for (const [ip, device] of connectedDevices.entries()) {
      if (device.lastSeen < fiveMinutesAgo) {
        connectedDevices.delete(ip);
      }
    }
  };

  const trackDevice = (req: http.IncomingMessage): void => {
    const ip = req.socket.remoteAddress?.replace("::ffff:", "") ?? "unknown";
    const userAgent = req.headers["user-agent"];

    const existing = connectedDevices.get(ip);
    if (existing) {
      existing.lastSeen = Date.now();
      existing.requestCount++;
      if (userAgent) existing.userAgent = userAgent;
    } else {
      connectedDevices.set(ip, {
        ip,
        lastSeen: Date.now(),
        requestCount: 1,
        userAgent,
      });
      logger.info("[MobileSyncServer] New device connected:", { ip, userAgent });
    }

    // Cleanup stale devices periodically
    cleanupStaleDevices();
  };

  const sendJson = (res: http.ServerResponse, data: unknown, statusCode = 200): void => {
    logger.info(`[MobileSyncServer] → ${statusCode} JSON response`);
    res.writeHead(statusCode, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end(JSON.stringify(data));
  };

  const sendError = (res: http.ServerResponse, message: string, statusCode = 500): void => {
    sendJson(res, { error: message }, statusCode);
  };

  const handleApiInfo = async (res: http.ServerResponse): Promise<void> => {
    try {
      const videos = await defaultDb
        .select()
        .from(youtubeVideos)
        .where(eq(youtubeVideos.downloadStatus, "completed"));

      const info: ServerInfo = {
        name: "LearnifyTube",
        version: app.getVersion(),
        videoCount: videos.length,
      };
      sendJson(res, info);
    } catch (error) {
      logger.error("[MobileSyncServer] Error getting server info", error);
      sendError(res, "Failed to get server info");
    }
  };

  const handleApiVideos = async (res: http.ServerResponse): Promise<void> => {
    try {
      const videos = await defaultDb
        .select()
        .from(youtubeVideos)
        .where(eq(youtubeVideos.downloadStatus, "completed"));

      // Check which videos have transcripts
      const transcripts = await defaultDb.select().from(videoTranscripts);
      const videosWithTranscripts = new Set(transcripts.map((t) => t.videoId));

      const remoteVideos: RemoteVideo[] = videos.map((video) => {
        // Always use local URL - thumbnails will be downloaded on-demand if missing
        const hasThumbnailSource = video.thumbnailPath || video.thumbnailUrl;
        return {
          id: video.videoId,
          title: video.title,
          channelTitle: video.channelTitle,
          duration: video.durationSeconds ?? 0,
          fileSize: video.downloadFileSize ?? 0,
          hasTranscript: videosWithTranscripts.has(video.videoId),
          thumbnailUrl: hasThumbnailSource
            ? `http://${getLocalIpAddress()}:${port}/api/video/${video.videoId}/thumbnail`
            : undefined,
        };
      });

      sendJson(res, { videos: remoteVideos });
    } catch (error) {
      logger.error("[MobileSyncServer] Error getting videos", error);
      sendError(res, "Failed to get videos");
    }
  };

  const handleVideoMeta = async (res: http.ServerResponse, videoId: string): Promise<void> => {
    try {
      const videos = await defaultDb
        .select()
        .from(youtubeVideos)
        .where(eq(youtubeVideos.videoId, videoId))
        .limit(1);

      if (videos.length === 0) {
        sendError(res, "Video not found", 404);
        return;
      }

      const video = videos[0];

      // Get transcript if available
      const transcripts = await defaultDb
        .select()
        .from(videoTranscripts)
        .where(eq(videoTranscripts.videoId, videoId))
        .limit(1);

      let transcript: VideoMeta["transcript"];
      if (transcripts.length > 0) {
        const t = transcripts[0];
        let segments: TranscriptSegment[] = [];

        // Try segmentsJson first (if cached)
        if (t.segmentsJson) {
          try {
            // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
            segments = JSON.parse(t.segmentsJson) as TranscriptSegment[];
          } catch {
            logger.warn("[MobileSyncServer] Failed to parse segmentsJson", { videoId });
          }
        }

        // Fall back to parsing rawVtt if no cached segments
        if (segments.length === 0 && t.rawVtt) {
          try {
            segments = parseVttToSegments(t.rawVtt);
            logger.info("[MobileSyncServer] Parsed segments from rawVtt", {
              videoId,
              segmentCount: segments.length,
            });
          } catch (e) {
            logger.warn("[MobileSyncServer] Failed to parse rawVtt", { videoId, error: e });
          }
        }

        if (segments.length > 0) {
          transcript = {
            language: t.language ?? "en",
            segments,
          };
        }
      }

      const meta: VideoMeta = {
        id: video.videoId,
        title: video.title,
        channelTitle: video.channelTitle,
        duration: video.durationSeconds ?? 0,
        transcript,
      };

      sendJson(res, meta);
    } catch (error) {
      logger.error("[MobileSyncServer] Error getting video meta", { videoId, error });
      sendError(res, "Failed to get video metadata");
    }
  };

  const handleVideoFile = async (
    req: http.IncomingMessage,
    res: http.ServerResponse,
    videoId: string
  ): Promise<void> => {
    try {
      const videos = await defaultDb
        .select()
        .from(youtubeVideos)
        .where(eq(youtubeVideos.videoId, videoId))
        .limit(1);

      if (videos.length === 0 || !videos[0].downloadFilePath) {
        sendError(res, "Video not found", 404);
        return;
      }

      const filePath = videos[0].downloadFilePath;

      if (!fs.existsSync(filePath)) {
        logger.warn("[MobileSyncServer] Video file not found", { videoId, filePath });
        sendError(res, "Video file not found", 404);
        return;
      }

      const stat = fs.statSync(filePath);
      const fileSize = stat.size;
      const ext = path.extname(filePath).toLowerCase();
      const contentType =
        ext === ".mp4"
          ? "video/mp4"
          : ext === ".webm"
            ? "video/webm"
            : ext === ".mkv"
              ? "video/x-matroska"
              : "application/octet-stream";

      // Handle range requests for video seeking
      const range = req.headers.range;

      if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunkSize = end - start + 1;

        logger.debug("[MobileSyncServer] Range request", {
          videoId,
          start,
          end,
          chunkSize,
          fileSize,
        });

        const fileStream = fs.createReadStream(filePath, { start, end });

        res.writeHead(206, {
          "Content-Range": `bytes ${start}-${end}/${fileSize}`,
          "Accept-Ranges": "bytes",
          "Content-Length": chunkSize,
          "Content-Type": contentType,
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-cache",
        });

        fileStream.pipe(res);

        fileStream.on("error", (err) => {
          logger.error("[MobileSyncServer] Stream error", { videoId, error: err });
          if (!res.headersSent) {
            res.writeHead(500);
          }
          res.end();
        });
      } else {
        // Full file response
        logger.debug("[MobileSyncServer] Full file request", { videoId, fileSize });

        res.writeHead(200, {
          "Content-Length": fileSize,
          "Content-Type": contentType,
          "Accept-Ranges": "bytes",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-cache",
        });

        const fileStream = fs.createReadStream(filePath);
        fileStream.pipe(res);

        fileStream.on("error", (err) => {
          logger.error("[MobileSyncServer] Stream error", { videoId, error: err });
          if (!res.headersSent) {
            res.writeHead(500);
          }
          res.end();
        });
      }
    } catch (error) {
      logger.error("[MobileSyncServer] Error streaming video file", { videoId, error });
      sendError(res, "Failed to stream video");
    }
  };

  const handleVideoThumbnail = async (res: http.ServerResponse, videoId: string): Promise<void> => {
    try {
      const videos = await defaultDb
        .select()
        .from(youtubeVideos)
        .where(eq(youtubeVideos.videoId, videoId))
        .limit(1);

      if (videos.length === 0) {
        sendError(res, "Video not found", 404);
        return;
      }

      const video = videos[0];
      let filePath = video.thumbnailPath;

      // If no local thumbnail or file doesn't exist, try to download from YouTube URL
      if (!filePath || !fs.existsSync(filePath)) {
        if (video.thumbnailUrl) {
          logger.info("[MobileSyncServer] Downloading video thumbnail on-demand", {
            videoId,
            url: video.thumbnailUrl,
          });

          const downloadedPath = await downloadImageToCache(video.thumbnailUrl, `video_${videoId}`);

          if (downloadedPath) {
            // Update database with the new path
            await defaultDb
              .update(youtubeVideos)
              .set({ thumbnailPath: downloadedPath })
              .where(eq(youtubeVideos.videoId, videoId));

            filePath = downloadedPath;
          }
        }
      }

      if (!filePath || !fs.existsSync(filePath)) {
        sendError(res, "Thumbnail not found", 404);
        return;
      }

      const stat = fs.statSync(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const contentType =
        ext === ".jpg" || ext === ".jpeg"
          ? "image/jpeg"
          : ext === ".png"
            ? "image/png"
            : ext === ".webp"
              ? "image/webp"
              : "application/octet-stream";

      res.writeHead(200, {
        "Content-Length": stat.size,
        "Content-Type": contentType,
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "max-age=86400",
      });

      const fileStream = fs.createReadStream(filePath);
      fileStream.pipe(res);

      fileStream.on("error", (err) => {
        logger.error("[MobileSyncServer] Thumbnail stream error", { videoId, error: err });
        if (!res.headersSent) {
          res.writeHead(500);
        }
        res.end();
      });
    } catch (error) {
      logger.error("[MobileSyncServer] Error serving thumbnail", { videoId, error });
      sendError(res, "Failed to serve thumbnail");
    }
  };

  // Helper to convert video to RemoteVideoWithStatus
  const videoToRemoteVideoWithStatus = (
    video: typeof youtubeVideos.$inferSelect
  ): RemoteVideoWithStatus => {
    // Always use local URL - thumbnails will be downloaded on-demand if missing
    const hasThumbnailSource = video.thumbnailPath || video.thumbnailUrl;
    return {
      id: video.videoId,
      title: video.title,
      channelTitle: video.channelTitle,
      duration: video.durationSeconds ?? 0,
      thumbnailUrl: hasThumbnailSource
        ? `http://${getLocalIpAddress()}:${port}/api/video/${video.videoId}/thumbnail`
        : null,
      downloadStatus:
        video.downloadStatus === "completed" ||
        video.downloadStatus === "downloading" ||
        video.downloadStatus === "queued" ||
        video.downloadStatus === "pending"
          ? video.downloadStatus
          : null,
      downloadProgress: video.downloadProgress ?? null,
      fileSize: video.downloadFileSize ?? null,
    };
  };

  // GET /api/channels - List all channels with downloaded video counts
  const handleApiChannels = async (res: http.ServerResponse): Promise<void> => {
    try {
      // Get all channels
      const channelList = await defaultDb.select().from(channels);

      // Count downloaded videos per channel
      const videoCounts = await defaultDb
        .select({
          channelId: youtubeVideos.channelId,
          count: count(),
        })
        .from(youtubeVideos)
        .where(eq(youtubeVideos.downloadStatus, "completed"))
        .groupBy(youtubeVideos.channelId);

      const countMap = new Map(videoCounts.map((vc) => [vc.channelId, vc.count]));

      const remoteChannels: RemoteChannel[] = channelList.map((c) => {
        // Always use local URL - thumbnails will be downloaded on-demand if missing
        const hasThumbnailSource = c.thumbnailPath || c.thumbnailUrl;
        return {
          channelId: c.channelId,
          channelTitle: c.channelTitle,
          thumbnailUrl: hasThumbnailSource
            ? `http://${getLocalIpAddress()}:${port}/api/channel/${c.channelId}/thumbnail`
            : null,
          videoCount: countMap.get(c.channelId) ?? 0,
        };
      });

      // Sort by video count descending
      remoteChannels.sort((a, b) => b.videoCount - a.videoCount);

      sendJson(res, { channels: remoteChannels });
    } catch (error) {
      logger.error("[MobileSyncServer] Error getting channels", error);
      sendError(res, "Failed to get channels");
    }
  };

  // GET /api/channel/:id/videos - Videos for a channel with download status
  const handleChannelVideos = async (
    res: http.ServerResponse,
    channelId: string
  ): Promise<void> => {
    try {
      const videoList = await defaultDb
        .select()
        .from(youtubeVideos)
        .where(eq(youtubeVideos.channelId, channelId));

      const videos: RemoteVideoWithStatus[] = videoList.map(videoToRemoteVideoWithStatus);

      // Sort: downloaded first, then by title
      videos.sort((a, b) => {
        if (a.downloadStatus === "completed" && b.downloadStatus !== "completed") return -1;
        if (a.downloadStatus !== "completed" && b.downloadStatus === "completed") return 1;
        return a.title.localeCompare(b.title);
      });

      sendJson(res, { videos });
    } catch (error) {
      logger.error("[MobileSyncServer] Error getting channel videos", { channelId, error });
      sendError(res, "Failed to get channel videos");
    }
  };

  // GET /api/channel/:id/thumbnail - Serve channel thumbnail
  const handleChannelThumbnail = async (
    res: http.ServerResponse,
    channelId: string
  ): Promise<void> => {
    try {
      const channelList = await defaultDb
        .select()
        .from(channels)
        .where(eq(channels.channelId, channelId))
        .limit(1);

      if (channelList.length === 0) {
        sendError(res, "Channel not found", 404);
        return;
      }

      const channel = channelList[0];
      let filePath = channel.thumbnailPath;

      // If no local thumbnail or file doesn't exist, try to download from YouTube URL
      if (!filePath || !fs.existsSync(filePath)) {
        if (channel.thumbnailUrl) {
          logger.info("[MobileSyncServer] Downloading channel thumbnail on-demand", {
            channelId,
            url: channel.thumbnailUrl,
          });

          const downloadedPath = await downloadImageToCache(
            channel.thumbnailUrl,
            `channel_${channelId}`
          );

          if (downloadedPath) {
            // Update database with the new path
            await defaultDb
              .update(channels)
              .set({ thumbnailPath: downloadedPath })
              .where(eq(channels.channelId, channelId));

            filePath = downloadedPath;
          }
        }
      }

      if (!filePath || !fs.existsSync(filePath)) {
        sendError(res, "Channel thumbnail not found", 404);
        return;
      }

      const stat = fs.statSync(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const contentType =
        ext === ".jpg" || ext === ".jpeg"
          ? "image/jpeg"
          : ext === ".png"
            ? "image/png"
            : ext === ".webp"
              ? "image/webp"
              : "application/octet-stream";

      res.writeHead(200, {
        "Content-Length": stat.size,
        "Content-Type": contentType,
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "max-age=86400",
      });

      const fileStream = fs.createReadStream(filePath);
      fileStream.pipe(res);

      fileStream.on("error", (err) => {
        logger.error("[MobileSyncServer] Channel thumbnail stream error", {
          channelId,
          error: err,
        });
        if (!res.headersSent) {
          res.writeHead(500);
        }
        res.end();
      });
    } catch (error) {
      logger.error("[MobileSyncServer] Error serving channel thumbnail", { channelId, error });
      sendError(res, "Failed to serve channel thumbnail");
    }
  };

  // GET /api/playlists - List all playlists (channel + custom)
  const handleApiPlaylists = async (res: http.ServerResponse): Promise<void> => {
    try {
      // Get channel playlists
      const channelPlaylistList = await defaultDb.select().from(channelPlaylists);

      // Get custom playlists
      const customPlaylistList = await defaultDb.select().from(customPlaylists);

      // Get downloaded video IDs for counting
      const downloadedVideos = await defaultDb
        .select({ videoId: youtubeVideos.videoId })
        .from(youtubeVideos)
        .where(eq(youtubeVideos.downloadStatus, "completed"));
      const downloadedSet = new Set(downloadedVideos.map((v) => v.videoId));

      // Get playlist items for channel playlists
      const channelPlaylistItemList = await defaultDb.select().from(playlistItems);
      const channelPlaylistItemMap = new Map<string, string[]>();
      for (const item of channelPlaylistItemList) {
        const existing = channelPlaylistItemMap.get(item.playlistId) ?? [];
        existing.push(item.videoId);
        channelPlaylistItemMap.set(item.playlistId, existing);
      }

      // Get playlist items for custom playlists
      const customPlaylistItemList = await defaultDb.select().from(customPlaylistItems);
      const customPlaylistItemMap = new Map<string, string[]>();
      for (const item of customPlaylistItemList) {
        const existing = customPlaylistItemMap.get(item.playlistId) ?? [];
        existing.push(item.videoId);
        customPlaylistItemMap.set(item.playlistId, existing);
      }

      const remotePlaylists: RemotePlaylist[] = [];

      // Add channel playlists
      for (const p of channelPlaylistList) {
        const videoIds = channelPlaylistItemMap.get(p.playlistId) ?? [];
        const downloadedCount = videoIds.filter((id) => downloadedSet.has(id)).length;

        // Always use local URL - thumbnails will be downloaded on-demand if missing
        const hasThumbnailSource = p.thumbnailPath || p.thumbnailUrl;
        remotePlaylists.push({
          playlistId: p.playlistId,
          title: p.title,
          thumbnailUrl: hasThumbnailSource
            ? `http://${getLocalIpAddress()}:${port}/api/playlist/${p.playlistId}/thumbnail`
            : null,
          itemCount: p.itemCount,
          channelId: p.channelId,
          type: "channel",
          downloadedCount,
        });
      }

      // Add custom playlists
      for (const p of customPlaylistList) {
        const videoIds = customPlaylistItemMap.get(p.id) ?? [];
        const downloadedCount = videoIds.filter((id) => downloadedSet.has(id)).length;

        remotePlaylists.push({
          playlistId: p.id,
          title: p.name,
          thumbnailUrl: null, // Custom playlists don't have thumbnails
          itemCount: p.itemCount,
          channelId: null,
          type: "custom",
          downloadedCount,
        });
      }

      // Sort by downloaded count descending
      remotePlaylists.sort((a, b) => b.downloadedCount - a.downloadedCount);

      sendJson(res, { playlists: remotePlaylists });
    } catch (error) {
      logger.error("[MobileSyncServer] Error getting playlists", error);
      sendError(res, "Failed to get playlists");
    }
  };

  // GET /api/playlist/:id/videos - Videos in a playlist with download status
  const handlePlaylistVideos = async (
    res: http.ServerResponse,
    playlistId: string
  ): Promise<void> => {
    try {
      // First check if it's a channel playlist
      const channelPlaylist = await defaultDb
        .select()
        .from(channelPlaylists)
        .where(eq(channelPlaylists.playlistId, playlistId))
        .limit(1);

      if (channelPlaylist.length > 0) {
        // Get videos from channel playlist
        const items = await defaultDb
          .select()
          .from(playlistItems)
          .where(eq(playlistItems.playlistId, playlistId))
          .orderBy(playlistItems.position);

        const videoIds = items.map((i) => i.videoId);
        if (videoIds.length === 0) {
          sendJson(res, { videos: [] });
          return;
        }

        const videoList = await defaultDb
          .select()
          .from(youtubeVideos)
          .where(inArray(youtubeVideos.videoId, videoIds));

        // Create map for ordering
        const videoMap = new Map(videoList.map((v) => [v.videoId, v]));

        const videos: RemoteVideoWithStatus[] = videoIds
          .map((id) => videoMap.get(id))
          .filter((v): v is typeof youtubeVideos.$inferSelect => v !== undefined)
          .map(videoToRemoteVideoWithStatus);

        sendJson(res, { videos });
        return;
      }

      // Check if it's a custom playlist
      const customPlaylist = await defaultDb
        .select()
        .from(customPlaylists)
        .where(eq(customPlaylists.id, playlistId))
        .limit(1);

      if (customPlaylist.length > 0) {
        // Get videos from custom playlist
        const items = await defaultDb
          .select()
          .from(customPlaylistItems)
          .where(eq(customPlaylistItems.playlistId, playlistId))
          .orderBy(customPlaylistItems.position);

        const videoIds = items.map((i) => i.videoId);
        if (videoIds.length === 0) {
          sendJson(res, { videos: [] });
          return;
        }

        const videoList = await defaultDb
          .select()
          .from(youtubeVideos)
          .where(inArray(youtubeVideos.videoId, videoIds));

        // Create map for ordering
        const videoMap = new Map(videoList.map((v) => [v.videoId, v]));

        const videos: RemoteVideoWithStatus[] = videoIds
          .map((id) => videoMap.get(id))
          .filter((v): v is typeof youtubeVideos.$inferSelect => v !== undefined)
          .map(videoToRemoteVideoWithStatus);

        sendJson(res, { videos });
        return;
      }

      sendError(res, "Playlist not found", 404);
    } catch (error) {
      logger.error("[MobileSyncServer] Error getting playlist videos", { playlistId, error });
      sendError(res, "Failed to get playlist videos");
    }
  };

  // GET /api/playlist/:id/thumbnail - Serve playlist thumbnail
  const handlePlaylistThumbnail = async (
    res: http.ServerResponse,
    playlistId: string
  ): Promise<void> => {
    try {
      const playlistList = await defaultDb
        .select()
        .from(channelPlaylists)
        .where(eq(channelPlaylists.playlistId, playlistId))
        .limit(1);

      if (playlistList.length === 0) {
        sendError(res, "Playlist not found", 404);
        return;
      }

      const playlist = playlistList[0];
      let filePath = playlist.thumbnailPath;

      // If no local thumbnail or file doesn't exist, try to download from YouTube URL
      if (!filePath || !fs.existsSync(filePath)) {
        if (playlist.thumbnailUrl) {
          logger.info("[MobileSyncServer] Downloading playlist thumbnail on-demand", {
            playlistId,
            url: playlist.thumbnailUrl,
          });

          const downloadedPath = await downloadImageToCache(
            playlist.thumbnailUrl,
            `playlist_${playlistId}`
          );

          if (downloadedPath) {
            // Update database with the new path
            await defaultDb
              .update(channelPlaylists)
              .set({ thumbnailPath: downloadedPath })
              .where(eq(channelPlaylists.playlistId, playlistId));

            filePath = downloadedPath;
          }
        }
      }

      if (!filePath || !fs.existsSync(filePath)) {
        sendError(res, "Playlist thumbnail not found", 404);
        return;
      }

      const stat = fs.statSync(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const contentType =
        ext === ".jpg" || ext === ".jpeg"
          ? "image/jpeg"
          : ext === ".png"
            ? "image/png"
            : ext === ".webp"
              ? "image/webp"
              : "application/octet-stream";

      res.writeHead(200, {
        "Content-Length": stat.size,
        "Content-Type": contentType,
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "max-age=86400",
      });

      const fileStream = fs.createReadStream(filePath);
      fileStream.pipe(res);

      fileStream.on("error", (err) => {
        logger.error("[MobileSyncServer] Playlist thumbnail stream error", {
          playlistId,
          error: err,
        });
        if (!res.headersSent) {
          res.writeHead(500);
        }
        res.end();
      });
    } catch (error) {
      logger.error("[MobileSyncServer] Error serving playlist thumbnail", { playlistId, error });
      sendError(res, "Failed to serve playlist thumbnail");
    }
  };

  // POST /api/favorites - Add a favorite
  const handleAddFavorite = async (
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): Promise<void> => {
    try {
      let body = "";
      for await (const chunk of req) {
        body += chunk;
      }

      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- request body is untrusted JSON
      const parsed = JSON.parse(body) as {
        entityType?: "video" | "custom_playlist" | "channel_playlist";
        entityId?: string;
      };
      const { entityType, entityId } = parsed;

      if (!entityType || !entityId) {
        sendError(res, "entityType and entityId are required", 400);
        return;
      }

      // Check if already favorited
      const existing = await defaultDb
        .select()
        .from(favorites)
        .where(and(eq(favorites.entityType, entityType), eq(favorites.entityId, entityId)))
        .limit(1);

      if (existing.length > 0) {
        sendJson(res, { success: true, id: existing[0].id, message: "Already favorited" });
        return;
      }

      // Create new favorite
      const id = `fav_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      await defaultDb.insert(favorites).values({
        id,
        entityType,
        entityId,
        createdAt: Date.now(),
      });

      logger.info("[MobileSyncServer] Added favorite", { entityType, entityId, id });
      sendJson(res, { success: true, id });
    } catch (error) {
      logger.error("[MobileSyncServer] Error adding favorite", error);
      sendError(res, "Failed to add favorite");
    }
  };

  // DELETE /api/favorites/:entityType/:entityId - Remove a favorite
  const handleRemoveFavorite = async (
    res: http.ServerResponse,
    entityType: string,
    entityId: string
  ): Promise<void> => {
    try {
      if (!isFavoriteEntityType(entityType)) {
        sendError(res, "Invalid entityType", 400);
        return;
      }

      await defaultDb
        .delete(favorites)
        .where(and(eq(favorites.entityType, entityType), eq(favorites.entityId, entityId)));

      logger.info("[MobileSyncServer] Removed favorite", { entityType, entityId });
      sendJson(res, { success: true });
    } catch (error) {
      logger.error("[MobileSyncServer] Error removing favorite", error);
      sendError(res, "Failed to remove favorite");
    }
  };

  // GET /api/favorites - User's favorites (videos + playlists)
  const handleApiFavorites = async (res: http.ServerResponse): Promise<void> => {
    try {
      const favoriteList = await defaultDb.select().from(favorites);

      const remoteFavorites: RemoteFavorite[] = [];

      for (const fav of favoriteList) {
        const remoteFav: RemoteFavorite = {
          id: fav.id,
          entityType: fav.entityType,
          entityId: fav.entityId,
        };

        if (fav.entityType === "video") {
          const videos = await defaultDb
            .select()
            .from(youtubeVideos)
            .where(eq(youtubeVideos.videoId, fav.entityId))
            .limit(1);

          if (videos.length > 0) {
            remoteFav.video = videoToRemoteVideoWithStatus(videos[0]);
          }
        } else if (fav.entityType === "channel_playlist") {
          const playlists = await defaultDb
            .select()
            .from(channelPlaylists)
            .where(eq(channelPlaylists.playlistId, fav.entityId))
            .limit(1);

          if (playlists.length > 0) {
            const p = playlists[0];
            // Get downloaded count
            const items = await defaultDb
              .select()
              .from(playlistItems)
              .where(eq(playlistItems.playlistId, p.playlistId));

            const videoIds = items.map((i) => i.videoId);
            let downloadedCount = 0;
            if (videoIds.length > 0) {
              const downloaded = await defaultDb
                .select({ videoId: youtubeVideos.videoId })
                .from(youtubeVideos)
                .where(
                  and(
                    inArray(youtubeVideos.videoId, videoIds),
                    eq(youtubeVideos.downloadStatus, "completed")
                  )
                );
              downloadedCount = downloaded.length;
            }

            remoteFav.playlist = {
              playlistId: p.playlistId,
              title: p.title,
              thumbnailUrl: p.thumbnailPath
                ? `http://${getLocalIpAddress()}:${port}/api/playlist/${p.playlistId}/thumbnail`
                : p.thumbnailUrl,
              itemCount: p.itemCount,
              channelId: p.channelId,
              type: "channel",
              downloadedCount,
            };
          }
        } else if (fav.entityType === "custom_playlist") {
          const playlists = await defaultDb
            .select()
            .from(customPlaylists)
            .where(eq(customPlaylists.id, fav.entityId))
            .limit(1);

          if (playlists.length > 0) {
            const p = playlists[0];
            // Get downloaded count
            const items = await defaultDb
              .select()
              .from(customPlaylistItems)
              .where(eq(customPlaylistItems.playlistId, p.id));

            const videoIds = items.map((i) => i.videoId);
            let downloadedCount = 0;
            if (videoIds.length > 0) {
              const downloaded = await defaultDb
                .select({ videoId: youtubeVideos.videoId })
                .from(youtubeVideos)
                .where(
                  and(
                    inArray(youtubeVideos.videoId, videoIds),
                    eq(youtubeVideos.downloadStatus, "completed")
                  )
                );
              downloadedCount = downloaded.length;
            }

            remoteFav.playlist = {
              playlistId: p.id,
              title: p.name,
              thumbnailUrl: null,
              itemCount: p.itemCount,
              channelId: null,
              type: "custom",
              downloadedCount,
            };
          }
        }

        remoteFavorites.push(remoteFav);
      }

      sendJson(res, { favorites: remoteFavorites });
    } catch (error) {
      logger.error("[MobileSyncServer] Error getting favorites", error);
      sendError(res, "Failed to get favorites");
    }
  };

  // GET /api/download/status/:videoId - Check download progress on server
  const handleDownloadStatus = async (res: http.ServerResponse, videoId: string): Promise<void> => {
    try {
      const videos = await defaultDb
        .select()
        .from(youtubeVideos)
        .where(eq(youtubeVideos.videoId, videoId))
        .limit(1);

      if (videos.length === 0) {
        const payload: ServerDownloadStatus = {
          videoId,
          status: null,
          progress: null,
          error: null,
        };
        sendJson(res, payload);
        return;
      }

      const video = videos[0];
      const status: ServerDownloadStatus = {
        videoId,
        status:
          video.downloadStatus === "completed" ||
          video.downloadStatus === "downloading" ||
          video.downloadStatus === "queued" ||
          video.downloadStatus === "failed" ||
          video.downloadStatus === "pending"
            ? video.downloadStatus
            : null,
        progress: video.downloadProgress ?? null,
        error: video.lastErrorMessage ?? null,
      };

      sendJson(res, status);
    } catch (error) {
      logger.error("[MobileSyncServer] Error getting download status", { videoId, error });
      sendError(res, "Failed to get download status");
    }
  };

  // POST /api/download/request - Request server to download a YouTube video
  const handleDownloadRequest = async (
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): Promise<void> => {
    try {
      // Read request body
      let body = "";
      for await (const chunk of req) {
        body += chunk;
      }

      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- request body is untrusted JSON
      const { videoId, url } = JSON.parse(body) as { videoId?: string; url?: string };

      if (!videoId && !url) {
        sendError(res, "videoId or url required", 400);
        return;
      }

      // For now, we'll just check if the video exists and return its status
      // The actual download implementation would need to hook into the desktop app's download system
      if (videoId) {
        const videos = await defaultDb
          .select()
          .from(youtubeVideos)
          .where(eq(youtubeVideos.videoId, videoId))
          .limit(1);

        if (videos.length > 0) {
          const video = videos[0];
          sendJson(res, {
            success: true,
            videoId,
            status: video.downloadStatus,
            message:
              video.downloadStatus === "completed"
                ? "Video already downloaded"
                : "Video exists in database",
          });
          return;
        }
      }

      // Video doesn't exist - in a full implementation, this would trigger a download
      sendJson(res, {
        success: false,
        videoId: videoId ?? null,
        status: null,
        message:
          "Download request received. Note: Actual download triggering requires integration with desktop app download system.",
      });
    } catch (error) {
      logger.error("[MobileSyncServer] Error handling download request", error);
      sendError(res, "Failed to process download request");
    }
  };

  const handleRequest = async (
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): Promise<void> => {
    const url = req.url;
    const method = req.method;

    // Handle CORS preflight
    if (method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Range",
        "Access-Control-Max-Age": "86400",
      });
      res.end();
      return;
    }

    if (!url || (method !== "GET" && method !== "POST" && method !== "DELETE")) {
      sendError(res, "Method not allowed", 405);
      return;
    }

    // Track connected device
    trackDevice(req);

    logger.info(`[MobileSyncServer] ← ${method} ${url}`);

    // Route matching - support both /api/* and /* routes for compatibility
    // with both mobile app (uses /api/*) and P2P client (uses /*)
    if (url === "/api/info" || url === "/info") {
      await handleApiInfo(res);
      return;
    }

    if (url === "/api/videos" || url === "/videos") {
      await handleApiVideos(res);
      return;
    }

    // Match /api/video/:id/meta or /video/:id/meta
    const metaMatch = url.match(/^(?:\/api)?\/video\/([^/]+)\/meta$/);
    if (metaMatch) {
      await handleVideoMeta(res, metaMatch[1]);
      return;
    }

    // Match /api/video/:id/file or /video/:id/file
    const fileMatch = url.match(/^(?:\/api)?\/video\/([^/]+)\/file$/);
    if (fileMatch) {
      await handleVideoFile(req, res, fileMatch[1]);
      return;
    }

    // Match /api/video/:id/thumbnail or /video/:id/thumbnail
    const thumbnailMatch = url.match(/^(?:\/api)?\/video\/([^/]+)\/thumbnail$/);
    if (thumbnailMatch) {
      await handleVideoThumbnail(res, thumbnailMatch[1]);
      return;
    }

    // === Sync API Routes ===

    // GET /api/channels
    if (url === "/api/channels" || url === "/channels") {
      await handleApiChannels(res);
      return;
    }

    // GET /api/channel/:id/videos
    const channelVideosMatch = url.match(/^(?:\/api)?\/channel\/([^/]+)\/videos$/);
    if (channelVideosMatch) {
      await handleChannelVideos(res, channelVideosMatch[1]);
      return;
    }

    // GET /api/channel/:id/thumbnail
    const channelThumbnailMatch = url.match(/^(?:\/api)?\/channel\/([^/]+)\/thumbnail$/);
    if (channelThumbnailMatch) {
      await handleChannelThumbnail(res, channelThumbnailMatch[1]);
      return;
    }

    // GET /api/playlists
    if (url === "/api/playlists" || url === "/playlists") {
      await handleApiPlaylists(res);
      return;
    }

    // GET /api/playlist/:id/videos
    const playlistVideosMatch = url.match(/^(?:\/api)?\/playlist\/([^/]+)\/videos$/);
    if (playlistVideosMatch) {
      await handlePlaylistVideos(res, playlistVideosMatch[1]);
      return;
    }

    // GET /api/playlist/:id/thumbnail
    const playlistThumbnailMatch = url.match(/^(?:\/api)?\/playlist\/([^/]+)\/thumbnail$/);
    if (playlistThumbnailMatch) {
      await handlePlaylistThumbnail(res, playlistThumbnailMatch[1]);
      return;
    }

    // GET /api/favorites
    if ((url === "/api/favorites" || url === "/favorites") && method === "GET") {
      await handleApiFavorites(res);
      return;
    }

    // POST /api/favorites - Add favorite
    if ((url === "/api/favorites" || url === "/favorites") && method === "POST") {
      await handleAddFavorite(req, res);
      return;
    }

    // DELETE /api/favorites/:entityType/:entityId - Remove favorite
    const deleteFavoriteMatch = url.match(/^(?:\/api)?\/favorites\/([^/]+)\/([^/]+)$/);
    if (deleteFavoriteMatch && method === "DELETE") {
      await handleRemoveFavorite(
        res,
        decodeURIComponent(deleteFavoriteMatch[1]),
        decodeURIComponent(deleteFavoriteMatch[2])
      );
      return;
    }

    // GET /api/download/status/:videoId
    const downloadStatusMatch = url.match(/^(?:\/api)?\/download\/status\/([^/]+)$/);
    if (downloadStatusMatch) {
      await handleDownloadStatus(res, downloadStatusMatch[1]);
      return;
    }

    // POST /api/download/request
    if ((url === "/api/download/request" || url === "/download/request") && method === "POST") {
      await handleDownloadRequest(req, res);
      return;
    }

    sendError(res, "Not found", 404);
  };

  const start = async (requestedPort?: number): Promise<number> => {
    if (server) {
      return port;
    }

    const targetPort = requestedPort ?? DEFAULT_PORT;

    return new Promise((resolve, reject) => {
      server = http.createServer((req, res) => {
        handleRequest(req, res).catch((err) => {
          logger.error("[MobileSyncServer] Request handler error", err);
          if (!res.headersSent) {
            res.writeHead(500);
            res.end("Internal server error");
          }
        });
      });

      server.on("error", (err) => {
        logger.error("[MobileSyncServer] Server error", err);
        reject(err);
      });

      // Listen on all interfaces (0.0.0.0) for LAN access
      logger.info(`[MobileSyncServer] Attempting to start on port ${targetPort}...`);
      server.listen(targetPort, "0.0.0.0", async () => {
        const address = server?.address();
        if (address && typeof address === "object") {
          port = address.port;
          const ip = getLocalIpAddress();
          logger.info(`[MobileSyncServer] ✓ HTTP server started`);
          logger.info(`[MobileSyncServer] URL: http://${ip ?? "0.0.0.0"}:${port}`);
          logger.info(`[MobileSyncServer] Local IP: ${ip}`);
          logger.info(`[MobileSyncServer] Port: ${port}`);

          // Publish mDNS service for discovery
          logger.info("[MobileSyncServer] Publishing mDNS service for discovery...");
          try {
            const videos = await defaultDb
              .select()
              .from(youtubeVideos)
              .where(eq(youtubeVideos.downloadStatus, "completed"));
            logger.info(`[MobileSyncServer] Found ${videos.length} completed videos to share`);
            getMdnsService().publish(port, videos.length);
            logger.info("[MobileSyncServer] ✓ mDNS service published");
          } catch (error) {
            logger.error("[MobileSyncServer] ✗ Failed to publish mDNS service", error);
          }

          resolve(port);
        } else {
          logger.error("[MobileSyncServer] ✗ Failed to get server address");
          reject(new Error("Failed to get server address"));
        }
      });
    });
  };

  const stop = async (): Promise<void> => {
    // Unpublish mDNS service
    getMdnsService().unpublish();

    if (!server) {
      return;
    }

    return new Promise((resolve) => {
      server?.close(() => {
        logger.info("[MobileSyncServer] Stopped");
        server = null;
        port = 0;
        resolve();
      });
    });
  };

  const getPort = (): number => port;

  const isRunning = (): boolean => server !== null;

  const getConnectedDevices = (): ConnectedDevice[] => {
    cleanupStaleDevices();
    return Array.from(connectedDevices.values());
  };

  return {
    start,
    stop,
    getPort,
    isRunning,
    getConnectedDevices,
  };
};

// Singleton instance
let mobileSyncServerInstance: MobileSyncServer | null = null;

export const getMobileSyncServer = (): MobileSyncServer => {
  if (!mobileSyncServerInstance) {
    mobileSyncServerInstance = createMobileSyncServer();
  }
  return mobileSyncServerInstance;
};
