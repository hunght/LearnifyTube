import { z } from "zod";
import { logger } from "@/helpers/logger";

// Zod schema for yt-dlp video metadata (lenient - never throws, returns defaults)
const ytDlpMetadataSchema = z
  .object({
    id: z.string().optional().catch(undefined),
    video_id: z.string().optional().catch(undefined),
    fulltitle: z.string().optional().catch(undefined),
    title: z.string().optional().catch(undefined),
    description: z.string().nullable().optional().catch(null),
    channel_id: z.string().optional().catch(undefined),
    channelId: z.string().optional().catch(undefined),
    channel: z.string().optional().catch(undefined),
    uploader: z.string().optional().catch(undefined),
    channel_title: z.string().optional().catch(undefined),
    duration: z.number().optional().catch(undefined),
    view_count: z.number().optional().catch(undefined),
    like_count: z.number().optional().catch(undefined),
    thumbnails: z
      .array(z.object({ url: z.string().optional().catch(undefined) }))
      .optional()
      .catch([]),
    thumbnail: z.string().optional().catch(undefined),
    upload_date: z.string().optional().catch(undefined),
    tags: z.array(z.string()).optional().catch([]),
  })
  .passthrough(); // Allow other properties

// Define the return type using a type alias
type MappedMetadata = {
  readonly videoId: string;
  readonly title: string;
  readonly description: string | null;
  readonly channelId: string | null;
  readonly channelTitle: string;
  readonly durationSeconds: number | null;
  readonly viewCount: number | null;
  readonly likeCount: number | null;
  readonly thumbnailUrl: string | null;
  readonly publishedAt: number | null;
  readonly tags: string | null;
  readonly raw: string;
};

export const mapYtDlpMetadata = (meta: unknown): MappedMetadata => {
  const validated = ytDlpMetadataSchema.parse(meta);

  return {
    videoId: validated.id ?? validated.video_id ?? "",
    title: validated.fulltitle ?? validated.title ?? "Untitled",
    description: validated.description ?? null,
    channelId: validated.channel_id ?? validated.channelId ?? null,
    channelTitle:
      validated.channel ?? validated.uploader ?? validated.channel_title ?? "Unknown Channel",
    durationSeconds: validated.duration ? Math.round(validated.duration) : null,
    viewCount: validated.view_count ?? null,
    likeCount: validated.like_count ?? null,
    thumbnailUrl: Array.isArray(validated.thumbnails)
      ? (validated.thumbnails[validated.thumbnails.length - 1]?.url ?? null)
      : (validated.thumbnail ?? null),
    publishedAt: validated.upload_date
      ? Date.parse(
          `${validated.upload_date.slice(0, 4)}-${validated.upload_date.slice(4, 6)}-${validated.upload_date.slice(6, 8)}`
        )
      : null,
    tags: Array.isArray(validated.tags) ? JSON.stringify(validated.tags) : null,
    raw: JSON.stringify(validated),
  } as const;
};

// Schema for subtitle metadata (lenient - never throws)
const subtitleMetadataSchema = z
  .object({
    subtitles: z
      .record(z.array(z.object({ ext: z.string().optional().catch(undefined) })))
      .optional()
      .catch({}),
    automatic_captions: z
      .record(z.array(z.object({ ext: z.string().optional().catch(undefined) })))
      .optional()
      .catch({}),
  })
  .passthrough();

/**
 * Extract available subtitle languages from yt-dlp metadata
 */
export const extractSubtitleLanguages = (
  meta: unknown
): Array<{
  lang: string;
  hasManual: boolean;
  hasAuto: boolean;
  manualFormats: string[];
  autoFormats: string[];
}> => {
  const validated = subtitleMetadataSchema.parse(meta);
  const subs = validated.subtitles ?? {};
  const autos = validated.automatic_captions ?? {};

  const map = new Map<
    string,
    { hasManual: boolean; hasAuto: boolean; manualFormats: string[]; autoFormats: string[] }
  >();

  for (const key of Object.keys(subs)) {
    const k = String(key).toLowerCase();
    const fmts = Array.isArray(subs[k])
      ? subs[k].map((f) => f.ext).filter((ext): ext is string => typeof ext === "string")
      : [];
    map.set(k, {
      hasManual: true,
      hasAuto: false,
      manualFormats: Array.from(new Set(fmts)),
      autoFormats: [],
    });
  }

  for (const key of Object.keys(autos)) {
    const k = String(key).toLowerCase();
    const fmts = Array.isArray(autos[k])
      ? autos[k].map((f) => f.ext).filter((ext): ext is string => typeof ext === "string")
      : [];
    const prev = map.get(k) ?? {
      hasManual: false,
      hasAuto: false,
      manualFormats: [],
      autoFormats: [],
    };
    prev.hasAuto = true;
    prev.autoFormats = Array.from(new Set([...(prev.autoFormats ?? []), ...fmts]));
    map.set(k, prev);
  }

  return Array.from(map.entries())
    .map(([lang, info]) => ({ lang, ...info }))
    .sort((a, b) => {
      if (a.lang === "en") return -1;
      if (b.lang === "en") return 1;
      if (a.hasManual && !b.hasManual) return -1;
      if (!a.hasManual && b.hasManual) return -1;
      return a.lang.localeCompare(b.lang);
    });
};

// Schema for channel metadata (lenient - never throws)
const channelMetadataSchema = z
  .object({
    channel_id: z.string().optional().catch(undefined),
    channelId: z.string().optional().catch(undefined),
    uploader_id: z.string().optional().catch(undefined),
    channel: z.string().optional().catch(undefined),
    uploader: z.string().optional().catch(undefined),
    channel_title: z.string().optional().catch(undefined),
    channel_description: z.string().optional().catch(undefined),
    channel_url: z.string().optional().catch(undefined),
    channel_thumbnails: z
      .array(z.object({ url: z.string().optional().catch(undefined) }))
      .optional()
      .catch([]),
    thumbnails: z
      .array(
        z.object({
          url: z.string().optional().catch(undefined),
          id: z.string().optional().catch(undefined),
        })
      )
      .optional()
      .catch([]),
    uploader_avatar: z.string().optional().catch(undefined),
    channel_avatar: z.string().optional().catch(undefined),
    channel_follower_count: z.number().optional().catch(undefined),
    uploader_url: z.string().optional().catch(undefined),
  })
  .passthrough();

type ExtractedChannelData = {
  readonly channelId: string;
  readonly channelTitle: string;
  readonly channelDescription: string | null;
  readonly channelUrl: string | null;
  readonly thumbnailUrl: string | null;
  readonly subscriberCount: number | null;
  readonly videoCount: null;
  readonly viewCount: null;
  readonly customUrl: string | null;
  readonly raw: string;
};

export const extractChannelData = (meta: unknown): ExtractedChannelData | null => {
  const validated = channelMetadataSchema.parse(meta);
  const channelId = validated.channel_id ?? validated.channelId ?? null;

  logger.debug("[metadata] Processing channel data", {
    hasChannelId: !!channelId,
    channelId,
    channel_id: validated.channel_id,
    channelIdAlt: validated.channelId,
    uploader_id: validated.uploader_id,
    channel: validated.channel,
    uploader: validated.uploader,
    hasChannelThumbnails: Array.isArray(validated.channel_thumbnails)
      ? validated.channel_thumbnails.length
      : 0,
    hasThumbnails: Array.isArray(validated.thumbnails) ? validated.thumbnails.length : 0,
    uploader_avatar: validated.uploader_avatar,
    channel_avatar: validated.channel_avatar,
  });

  if (!channelId) {
    logger.warn("[metadata] No channel_id found in metadata");
    return null;
  }

  // Extract channel thumbnail (profile photo)
  // Priority:
  // 1. thumbnails with id="avatar_uncropped" (from flat-playlist)
  // 2. channel_thumbnails (highest quality)
  // 3. thumbnails (highest quality - fallback)
  // 4. uploader_avatar / channel_avatar
  let channelThumbnail: string | null = null;

  // Check generic thumbnails first (often used in flat-playlist)
  const thumbnails = validated.thumbnails ?? [];
  const avatarUncropped = thumbnails.find((t) => t.id === "avatar_uncropped");

  if (avatarUncropped?.url) {
    channelThumbnail = avatarUncropped.url;
  } else if (
    validated.channel_thumbnails &&
    Array.isArray(validated.channel_thumbnails) &&
    validated.channel_thumbnails.length > 0
  ) {
    // Get the highest quality thumbnail
    channelThumbnail =
      validated.channel_thumbnails[validated.channel_thumbnails.length - 1]?.url ?? null;
  } else if (thumbnails.length > 0) {
    // Fallback to highest quality generic thumbnail
    channelThumbnail = thumbnails[thumbnails.length - 1]?.url ?? null;
  } else if (validated.uploader_avatar ?? validated.channel_avatar) {
    channelThumbnail = validated.uploader_avatar ?? validated.channel_avatar ?? null;
  }

  logger.debug("[metadata] thumbnail selection", {
    selected: channelThumbnail,
    avatar_uncropped: avatarUncropped?.url,
    channel_thumbnails_last: Array.isArray(validated.channel_thumbnails)
      ? validated.channel_thumbnails[validated.channel_thumbnails.length - 1]?.url
      : undefined,
    thumbnails_last: thumbnails[thumbnails.length - 1]?.url,
  });

  return {
    channelId,
    channelTitle:
      validated.channel ?? validated.uploader ?? validated.channel_title ?? "Unknown Channel",
    channelDescription: validated.channel_description ?? null,
    channelUrl:
      validated.channel_url ?? (channelId ? `https://www.youtube.com/channel/${channelId}` : null),
    thumbnailUrl: channelThumbnail,
    subscriberCount: validated.channel_follower_count ?? null,
    videoCount: null, // Not typically in video metadata
    viewCount: null, // Not typically in video metadata
    customUrl: validated.uploader_url?.includes("@")
      ? (validated.uploader_url.split("@")[1] ?? null)
      : null,
    raw: JSON.stringify(validated),
  };
};
