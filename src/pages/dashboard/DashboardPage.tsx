import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { trpcClient } from "@/utils/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageContainer } from "@/components/ui/page-container";
import { toast } from "sonner";
import { logger } from "@/helpers/logger";
import {
  Download,
  Clock,
  Eye,
  Users,
  CheckCircle2,
  Loader2,
  Video,
  TrendingUp,
  List as ListIcon,
} from "lucide-react";

const isValidUrl = (value: string): boolean => {
  try {
    const u = new URL(value);
    return ["http:", "https:"].includes(u.protocol);
  } catch {
    return false;
  }
};

const extractPlaylistId = (url: string): string | null => {
  try {
    const u = new URL(url);
    return u.searchParams.get("list");
  } catch {
    return null;
  }
};

const isChannelUrl = (url: string): boolean => {
  try {
    const u = new URL(url);
    if (!u.hostname.includes("youtube.com")) return false;
    const pathname = u.pathname;
    // Match patterns: /@channelname, /channel/ID, /c/channelname, /user/username
    return (
      /^\/@[^/]+/.test(pathname) ||
      /^\/channel\/[^/]+/.test(pathname) ||
      /^\/c\/[^/]+/.test(pathname) ||
      /^\/user\/[^/]+/.test(pathname)
    );
  } catch {
    return false;
  }
};

const normalizeChannelUrl = (url: string): string => {
  try {
    const u = new URL(url);
    if (!u.hostname.includes("youtube.com")) return url;

    const pathname = u.pathname;

    // Extract base channel path (remove /playlists, /videos, /about, etc.)
    let basePath = pathname;

    // Match /@channelname/playlists or /@channelname/videos etc.
    const atMatch = pathname.match(/^\/@([^/]+)/);
    if (atMatch) {
      basePath = `/@${atMatch[1]}`;
    }
    // Match /channel/ID/playlists or /channel/ID/videos etc.
    else if (/^\/channel\/[^/]+/.test(pathname)) {
      const channelMatch = pathname.match(/^\/channel\/([^/]+)/);
      if (channelMatch) {
        basePath = `/channel/${channelMatch[1]}`;
      }
    }
    // Match /c/channelname/playlists or /c/channelname/videos etc.
    else if (/^\/c\/[^/]+/.test(pathname)) {
      const cMatch = pathname.match(/^\/c\/([^/]+)/);
      if (cMatch) {
        basePath = `/c/${cMatch[1]}`;
      }
    }
    // Match /user/username/playlists or /user/username/videos etc.
    else if (/^\/user\/[^/]+/.test(pathname)) {
      const userMatch = pathname.match(/^\/user\/([^/]+)/);
      if (userMatch) {
        basePath = `/user/${userMatch[1]}`;
      }
    }

    // Reconstruct URL with normalized path
    u.pathname = basePath;
    u.search = ""; // Remove query params
    return u.toString();
  } catch {
    return url;
  }
};

const formatDuration = (seconds: number | null): string => {
  if (!seconds) return "Unknown";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
};

// Type matching the backend FetchChannelInfoResult
type ChannelInfoResponse = {
  success: true;
  channel: {
    id: string;
    channelId: string;
    channelTitle: string;
    channelDescription: string | null;
    channelUrl: string | null;
    thumbnailUrl: string | null;
    thumbnailPath: string | null;
    bannerUrl: string | null;
    subscriberCount: number | null;
    videoCount: number | null;
    viewCount: number | null;
    customUrl: string | null;
    raw: string | null;
    createdAt: number;
    updatedAt: number | null;
  } | null;
};

export default function DashboardPage(): React.JSX.Element {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [url, setUrl] = useState("");
  // Type inferred from tRPC ytdlp.fetchVideoInfo mutation (VideoInfoData from backend)
  const [previewInfo, setPreviewInfo] = useState<{
    videoId: string;
    title: string;
    description: string | null;
    channelId: string | null;
    channelTitle: string | null;
    durationSeconds: number | null;
    viewCount: number | null;
    likeCount: number | null;
    thumbnailUrl: string | null;
    publishedAt: number | null;
    tags: string | null;
    raw: string;
  } | null>(null);
  // Playlist preview state
  const [playlistPreviewInfo, setPlaylistPreviewInfo] = useState<{
    playlistId: string;
    title: string;
    description: string | null;
    thumbnailUrl: string | null;
    itemCount: number | null;
  } | null>(null);
  // Channel preview state
  const [channelPreviewInfo, setChannelPreviewInfo] = useState<{
    channelId: string;
    channelTitle: string;
    channelDescription: string | null;
    thumbnailUrl: string | null;
    subscriberCount: number | null;
    customUrl: string | null;
  } | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [thumbnailError, setThumbnailError] = useState(false);

  // Fetch preview mutation (debounced via effect)
  const previewMutation = useMutation({
    mutationFn: (u: string) => trpcClient.ytdlp.fetchVideoInfo.mutate({ url: u }),
    onSuccess: (res): void => {
      setIsLoadingPreview(false);
      if (res.success) {
        logger.debug("Dashboard preview loaded", { info: res.info });
        setPreviewInfo(res.info);
        setPlaylistPreviewInfo(null);
        setChannelPreviewInfo(null);
        setThumbnailError(false);
        // Set initial thumbnail URL
        setThumbnailUrl(res.info.thumbnailUrl);
      } else {
        toast.error(res.message ?? "Failed to fetch video info");
        setPreviewInfo(null);
        setPlaylistPreviewInfo(null);
        setChannelPreviewInfo(null);
        setThumbnailUrl(null);
      }
    },
    onError: (e) => {
      setIsLoadingPreview(false);
      toast.error(e?.message ?? "Failed to fetch video info");
      setPreviewInfo(null);
      setPlaylistPreviewInfo(null);
      setChannelPreviewInfo(null);
      setThumbnailUrl(null);
    },
  });

  // Fetch playlist preview mutation
  const playlistPreviewMutation = useMutation({
    mutationFn: (playlistId: string) => trpcClient.playlists.getDetails.query({ playlistId }),
    onSuccess: (res): void => {
      setIsLoadingPreview(false);
      if (res) {
        logger.debug("Dashboard playlist preview loaded", { playlistId: res.playlistId });
        setPlaylistPreviewInfo({
          playlistId: res.playlistId,
          title: res.title,
          description: res.description,
          thumbnailUrl: res.thumbnailUrl,
          itemCount: res.itemCount,
        });
        setPreviewInfo(null);
        setChannelPreviewInfo(null);
        setThumbnailError(false);
        setThumbnailUrl(res.thumbnailUrl);
      } else {
        toast.error("Failed to fetch playlist info");
        setPlaylistPreviewInfo(null);
        setPreviewInfo(null);
        setChannelPreviewInfo(null);
        setThumbnailUrl(null);
      }
    },
    onError: (e) => {
      setIsLoadingPreview(false);
      toast.error(e?.message ?? "Failed to fetch playlist info");
      setPlaylistPreviewInfo(null);
      setPreviewInfo(null);
      setChannelPreviewInfo(null);
      setThumbnailUrl(null);
    },
  });

  // Fetch channel preview mutation
  const channelPreviewMutation = useMutation({
    mutationFn: (channelUrl: string) =>
      trpcClient.ytdlp.fetchChannelInfo.mutate({ url: channelUrl }),
    onSuccess: (res: ChannelInfoResponse): void => {
      setIsLoadingPreview(false);
      if (res.channel) {
        const channel = res.channel;
        logger.debug("Dashboard channel preview loaded", { channelId: channel.channelId });
        setChannelPreviewInfo({
          channelId: channel.channelId,
          channelTitle: channel.channelTitle,
          channelDescription: channel.channelDescription ?? null,
          thumbnailUrl: channel.thumbnailUrl ?? null,
          subscriberCount: channel.subscriberCount ?? null,
          customUrl: channel.customUrl ?? null,
        });
        setPreviewInfo(null);
        setPlaylistPreviewInfo(null);
        setThumbnailError(false);
        setThumbnailUrl(channel.thumbnailUrl ?? null);
      }
    },
    onError: (e) => {
      setIsLoadingPreview(false);
      toast.error(e?.message ?? "Failed to fetch channel info");
      setChannelPreviewInfo(null);
      setPreviewInfo(null);
      setPlaylistPreviewInfo(null);
      setThumbnailUrl(null);
    },
  });

  // Debounce preview fetch on URL change
  useEffect(() => {
    if (!isValidUrl(url)) {
      setPreviewInfo(null);
      setPlaylistPreviewInfo(null);
      setChannelPreviewInfo(null);
      setIsLoadingPreview(false);
      setThumbnailUrl(null);
      setThumbnailError(false);
      return;
    }
    setIsLoadingPreview(true);
    const timer = setTimeout(() => {
      // Check if URL is a channel URL
      if (isChannelUrl(url)) {
        const normalizedUrl = normalizeChannelUrl(url);
        logger.debug("Dashboard fetching channel preview", { url, normalizedUrl });
        channelPreviewMutation.mutate(normalizedUrl);
      } else {
        // Check if URL contains a playlist
        const playlistId = extractPlaylistId(url);
        if (playlistId) {
          logger.debug("Dashboard fetching playlist preview", { url, playlistId });
          playlistPreviewMutation.mutate(playlistId);
        } else {
          logger.debug("Dashboard fetching video preview", { url });
          previewMutation.mutate(url);
        }
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [url]);

  const startMutation = useMutation({
    mutationFn: (u: string) => trpcClient.queue.addToQueue.mutate({ urls: [u] }),
    onSuccess: (res) => {
      if (res.success) {
        // Invalidate queue status to resume polling if it was stopped
        queryClient.invalidateQueries({ queryKey: ["queue", "status"] });
        toast.success(`Download added to queue (${res.downloadIds.length})`);
      } else {
        toast.error(res.message ?? "Failed to start download");
      }
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to add to queue"),
  });

  // Add channel to database mutation
  const addChannelMutation = useMutation({
    mutationFn: (channelUrl: string) =>
      trpcClient.ytdlp.fetchChannelInfo.mutate({ url: channelUrl }),
    onSuccess: (res: ChannelInfoResponse) => {
      if (res.channel) {
        queryClient.invalidateQueries({ queryKey: ["ytdlp", "channels"] });
        toast.success(`Channel "${res.channel.channelTitle}" added successfully`);
        setUrl(""); // Clear the input
        setChannelPreviewInfo(null);
      }
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to add channel"),
  });

  const canStart = useMemo(
    () => isValidUrl(url) && !startMutation.isPending && !addChannelMutation.isPending,
    [url, startMutation.isPending, addChannelMutation.isPending]
  );

  const isPlaylistUrl = useMemo(() => {
    return isValidUrl(url) && extractPlaylistId(url) !== null;
  }, [url]);

  const isChannelUrlMemo = useMemo(() => {
    return isValidUrl(url) && isChannelUrl(url);
  }, [url]);

  const onSubmit = (e: React.FormEvent): void => {
    e.preventDefault();
    if (!isValidUrl(url)) {
      toast.error("Please enter a valid URL");
      return;
    }

    // Check if URL is a channel URL
    if (isChannelUrl(url)) {
      const normalizedUrl = normalizeChannelUrl(url);
      logger.debug("Dashboard adding channel", { url, normalizedUrl });
      addChannelMutation.mutate(normalizedUrl);
      return;
    }

    // Check if URL contains a playlist
    const playlistId = extractPlaylistId(url);
    if (playlistId) {
      logger.debug("Dashboard navigating to playlist", { url, playlistId });
      // Navigate to playlist page
      navigate({ to: "/playlist", search: { playlistId, type: undefined } });
      return;
    }

    logger.debug("Dashboard start download", { url });
    startMutation.mutate(url);
  };

  // Load channels
  const channelsQuery = useQuery({
    queryKey: ["ytdlp", "channels"],
    queryFn: () => trpcClient.ytdlp.listChannels.query({ limit: 30 }),
    refetchOnWindowFocus: false,
  });

  return (
    <PageContainer>
      {/* Header Section */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl">
            Dashboard
          </h1>
          <p className="mt-1 text-sm text-muted-foreground sm:text-base">
            Download and manage your YouTube videos
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-sm text-muted-foreground">
          <TrendingUp className="h-4 w-4" />
          <span className="hidden sm:inline">Quick access to your content</span>
        </div>
      </div>

      {/* Download Input Section */}
      <Card className="border-2 shadow-lg transition-shadow hover:shadow-xl">
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <Download className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg sm:text-xl">Start a Download</CardTitle>
          </div>
          <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
            Paste any YouTube video, playlist, or channel URL
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="flex flex-col gap-3 sm:flex-row sm:gap-2">
            <div className="relative flex-1">
              <Input
                placeholder="https://www.youtube.com/watch?v=..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="h-11 pr-10 sm:h-10"
                inputMode="url"
              />
              {isValidUrl(url) && (
                <CheckCircle2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-green-500" />
              )}
            </div>
            <Button
              type="submit"
              disabled={!canStart}
              className="h-11 gap-2 sm:h-10 sm:min-w-[120px]"
              size="lg"
            >
              {startMutation.isPending || addChannelMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Starting...</span>
                </>
              ) : isChannelUrlMemo ? (
                <>
                  <Users className="h-4 w-4" />
                  <span>Add Channel</span>
                </>
              ) : isPlaylistUrl ? (
                <>
                  <ListIcon className="h-4 w-4" />
                  <span>Open Playlist</span>
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  <span>Download</span>
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Preview Loading State */}
      {isLoadingPreview && (
        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
              <CardTitle className="text-base sm:text-lg">Loading Preview...</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
              <div className="h-32 w-full animate-pulse rounded-lg bg-muted sm:h-28 sm:w-48 sm:flex-shrink-0" />
              <div className="flex-1 space-y-3">
                <div className="h-5 w-full animate-pulse rounded bg-muted sm:w-3/4" />
                <div className="h-4 w-3/4 animate-pulse rounded bg-muted sm:w-1/2" />
                <div className="flex gap-3">
                  <div className="h-3 w-20 animate-pulse rounded bg-muted" />
                  <div className="h-3 w-24 animate-pulse rounded bg-muted" />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Preview Info */}
      {!isLoadingPreview && previewInfo && (
        <Card className="overflow-hidden border-l-4 border-l-green-500 shadow-md transition-all hover:shadow-lg">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Video className="h-4 w-4 text-green-500" />
              <CardTitle className="text-base sm:text-lg">Video Preview</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4 sm:flex-row sm:gap-4">
              {/* Thumbnail */}
              {thumbnailUrl && !thumbnailError ? (
                <div className="relative overflow-hidden rounded-lg sm:w-48 sm:flex-shrink-0">
                  <img
                    src={thumbnailUrl}
                    alt="Thumbnail"
                    className="h-auto w-full object-cover sm:h-28"
                    onError={() => {
                      logger.warn("Dashboard thumbnail failed to load, trying fallback", {
                        original: thumbnailUrl,
                      });
                      if (thumbnailUrl.includes(".webp")) {
                        const fallbackUrl = thumbnailUrl
                          .replace(/\.webp$/, ".jpg")
                          .replace(/vi_webp/, "vi");
                        setThumbnailUrl(fallbackUrl);
                        logger.debug("Dashboard thumbnail fallback", { fallback: fallbackUrl });
                      } else {
                        setThumbnailError(true);
                        logger.error("Dashboard thumbnail all fallbacks failed", {
                          url: thumbnailUrl,
                        });
                      }
                    }}
                  />
                </div>
              ) : (
                <div className="flex h-32 w-full items-center justify-center rounded-lg bg-muted text-sm text-muted-foreground sm:h-28 sm:w-48 sm:flex-shrink-0">
                  <Video className="h-8 w-8 opacity-50" />
                </div>
              )}

              {/* Video Info */}
              <div className="min-w-0 flex-1 space-y-2">
                <h3 className="line-clamp-2 text-base font-semibold leading-tight sm:text-lg">
                  {previewInfo.title}
                </h3>
                {previewInfo.channelTitle && (
                  <p className="truncate text-sm text-muted-foreground">
                    {previewInfo.channelTitle}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground sm:text-sm">
                  {previewInfo.durationSeconds && (
                    <div className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" />
                      <span>{formatDuration(previewInfo.durationSeconds)}</span>
                    </div>
                  )}
                  {previewInfo.viewCount !== null && (
                    <div className="flex items-center gap-1.5">
                      <Eye className="h-3.5 w-3.5" />
                      <span>{previewInfo.viewCount.toLocaleString()} views</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Playlist Preview Info */}
      {!isLoadingPreview && playlistPreviewInfo && (
        <Card className="overflow-hidden border-l-4 border-l-purple-500 shadow-md transition-all hover:shadow-lg">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <ListIcon className="h-4 w-4 text-purple-500" />
              <CardTitle className="text-base sm:text-lg">Playlist Preview</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4 sm:flex-row sm:gap-4">
              {/* Thumbnail */}
              {thumbnailUrl && !thumbnailError ? (
                <div className="relative overflow-hidden rounded-lg sm:w-48 sm:flex-shrink-0">
                  <img
                    src={thumbnailUrl}
                    alt="Playlist Thumbnail"
                    className="h-auto w-full object-cover sm:h-28"
                    onError={() => {
                      logger.warn("Dashboard playlist thumbnail failed to load", {
                        original: thumbnailUrl,
                      });
                      setThumbnailError(true);
                    }}
                  />
                </div>
              ) : (
                <div className="flex h-32 w-full items-center justify-center rounded-lg bg-muted text-sm text-muted-foreground sm:h-28 sm:w-48 sm:flex-shrink-0">
                  <ListIcon className="h-8 w-8 opacity-50" />
                </div>
              )}

              {/* Playlist Info */}
              <div className="min-w-0 flex-1 space-y-2">
                <h3 className="line-clamp-2 text-base font-semibold leading-tight sm:text-lg">
                  {playlistPreviewInfo.title}
                </h3>
                {playlistPreviewInfo.description && (
                  <p className="line-clamp-2 text-sm text-muted-foreground">
                    {playlistPreviewInfo.description}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground sm:text-sm">
                  {playlistPreviewInfo.itemCount !== null && (
                    <div className="flex items-center gap-1.5">
                      <Video className="h-3.5 w-3.5" />
                      <span>{playlistPreviewInfo.itemCount} videos</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Channel Preview Info */}
      {!isLoadingPreview && channelPreviewInfo && (
        <Card className="overflow-hidden border-l-4 border-l-orange-500 shadow-md transition-all hover:shadow-lg">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-orange-500" />
              <CardTitle className="text-base sm:text-lg">Channel Preview</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4 sm:flex-row sm:gap-4">
              {/* Thumbnail */}
              {thumbnailUrl && !thumbnailError ? (
                <div className="relative overflow-hidden rounded-full sm:h-32 sm:w-32 sm:flex-shrink-0">
                  <img
                    src={thumbnailUrl}
                    alt="Channel Avatar"
                    className="h-full w-full object-cover"
                    onError={() => {
                      logger.warn("Dashboard channel thumbnail failed to load", {
                        original: thumbnailUrl,
                      });
                      setThumbnailError(true);
                    }}
                  />
                </div>
              ) : (
                <div className="flex h-32 w-32 flex-shrink-0 items-center justify-center rounded-full bg-muted text-sm text-muted-foreground">
                  <Users className="h-8 w-8 opacity-50" />
                </div>
              )}

              {/* Channel Info */}
              <div className="min-w-0 flex-1 space-y-2">
                <h3 className="line-clamp-2 text-base font-semibold leading-tight sm:text-lg">
                  {channelPreviewInfo.channelTitle}
                </h3>
                {channelPreviewInfo.customUrl && (
                  <p className="text-sm text-muted-foreground">@{channelPreviewInfo.customUrl}</p>
                )}
                {channelPreviewInfo.channelDescription && (
                  <p className="line-clamp-2 text-sm text-muted-foreground">
                    {channelPreviewInfo.channelDescription}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground sm:text-sm">
                  {channelPreviewInfo.subscriberCount !== null && (
                    <div className="flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5" />
                      <span>{channelPreviewInfo.subscriberCount.toLocaleString()} subscribers</span>
                    </div>
                  )}
                </div>
                <p className="text-xs text-muted-foreground sm:text-sm">
                  Click &quot;Add Channel&quot; to add this channel to your database
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Channels Section */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg sm:text-xl">Channels</CardTitle>
            </div>
            {channelsQuery.data && channelsQuery.data.length > 0 && (
              <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                {channelsQuery.data.length}
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {channelsQuery.isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="h-14 w-14 animate-pulse rounded-full bg-muted sm:h-16 sm:w-16" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
                    <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
                  </div>
                </div>
              ))}
            </div>
          ) : channelsQuery.data && channelsQuery.data.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {channelsQuery.data.map((channel) => (
                <Link
                  key={channel.channelId}
                  to="/channel"
                  search={{ channelId: channel.channelId }}
                  className="group flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-sm transition-all hover:shadow-md"
                >
                  {/* Channel Avatar and Title */}
                  <div className="flex items-center gap-3">
                    {channel.thumbnailUrl ? (
                      <div className="relative h-14 w-14 flex-shrink-0 overflow-hidden rounded-full ring-2 ring-primary/10 transition-all group-hover:ring-primary/30 sm:h-16 sm:w-16">
                        <img
                          src={channel.thumbnailUrl}
                          alt={channel.channelTitle}
                          className="h-full w-full object-cover"
                          onError={(e) => {
                            e.currentTarget.style.display = "none";
                          }}
                        />
                      </div>
                    ) : (
                      <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary sm:h-16 sm:w-16 sm:text-base">
                        {channel.channelTitle.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <h4 className="line-clamp-2 font-semibold leading-tight group-hover:text-primary">
                        {channel.channelTitle}
                      </h4>
                    </div>
                  </div>

                  {/* Channel Stats */}
                  <div className="space-y-2 border-t pt-3">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Video className="h-3.5 w-3.5" />
                        <span>
                          {channel.videoCount} {channel.videoCount === 1 ? "video" : "videos"}
                        </span>
                      </div>
                      {channel.lastUpdated && (
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          <span>{new Date(channel.lastUpdated).toLocaleDateString()}</span>
                        </div>
                      )}
                    </div>
                    {channel.subscriberCount && (
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Users className="h-3.5 w-3.5" />
                        <span>{channel.subscriberCount.toLocaleString()} subscribers</span>
                      </div>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
              <div className="rounded-full bg-muted p-4">
                <Users className="h-8 w-8 text-muted-foreground" />
              </div>
              <div className="space-y-1">
                <p className="font-medium">No channels yet</p>
                <p className="text-sm text-muted-foreground">
                  Channels will appear here after you download videos
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
}
