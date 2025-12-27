import React, { useRef, useState, useEffect, useCallback } from "react";
import { useSetAtom } from "jotai";
import { useSearch, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Rewind, FastForward } from "lucide-react";
import { toast } from "sonner";
import { useWatchProgress } from "./hooks/useWatchProgress";
import { VideoPlayer } from "./components/VideoPlayer";
import { DownloadStatus } from "./components/DownloadStatus";
import { TranscriptPanel } from "./components/TranscriptPanel";
import { VideoDescription } from "./components/VideoDescription";
import { PlaylistNavigation } from "./components/PlaylistNavigation";
import { ExternalLink } from "@/components/ExternalLink";
import {
  rightSidebarContentAtom,
  annotationsSidebarDataAtom,
  rightSidebarOpenAtom,
} from "@/context/rightSidebar";
import {
  beginVideoPlayback,
  usePlayerStore,
  updateCurrentTime,
  setPlaybackData,
} from "@/context/playerStore";
import { trpcClient } from "@/utils/trpc";
import { logger } from "@/helpers/logger";

export default function PlayerPage(): React.JSX.Element {
  const search = useSearch({ from: "/player" });
  const videoId = search.videoId;
  const playlistId = search.playlistId;
  const playlistIndex = search.playlistIndex;

  // Video reference for playback control
  const videoRef = useRef<HTMLVideoElement>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // External store state
  const playerState = usePlayerStore();

  // Local seek indicator state (replaces atom)
  const [seekIndicator, setSeekIndicator] = useState<{
    direction: "forward" | "backward";
    amount: number;
  } | null>(null);

  // Timeout ref for seek indicator
  const seekTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Track if video file failed to load (e.g., file was deleted)
  const [videoLoadError, setVideoLoadError] = useState(false);

  // Auto-clear seek indicator after 800ms
  useEffect(() => {
    if (!seekIndicator) {
      if (seekTimeoutRef.current) {
        clearTimeout(seekTimeoutRef.current);
        seekTimeoutRef.current = null;
      }
      return;
    }
    if (seekTimeoutRef.current) clearTimeout(seekTimeoutRef.current);
    seekTimeoutRef.current = setTimeout(() => setSeekIndicator(null), 800);
    return () => {
      if (seekTimeoutRef.current) {
        clearTimeout(seekTimeoutRef.current);
      }
    };
  }, [seekIndicator]);

  const { data: playback, isLoading: playbackIsLoading } = useQuery({
    queryKey: ["video-playback", videoId],
    queryFn: async () => {
      if (!videoId) return null;
      return await trpcClient.ytdlp.getVideoPlayback.query({ videoId });
    },
    enabled: !!videoId,
    refetchInterval: (q) => {
      const status = q.state.data?.status;
      if (!status || typeof status !== "string") return false;
      return ["downloading", "queued", "paused"].includes(status) ? 1500 : false;
    },
  });

  const ensuredDirectoryRef = useRef<Set<string>>(new Set());

  const startDownloadMutation = useMutation({
    mutationFn: async () => {
      if (!videoId) throw new Error("Missing videoId");

      // If video has error or is being re-downloaded, reset the download status first
      if (videoLoadError || playback?.status === "completed") {
        await trpcClient.ytdlp.resetDownloadStatus.mutate({ videoId });
      }

      const url = `https://www.youtube.com/watch?v=${videoId}`;
      return await trpcClient.queue.addToQueue.mutate({ urls: [url] });
    },
    onSuccess: (result) => {
      // Clear error state when starting a new download
      setVideoLoadError(false);
      queryClient.invalidateQueries({ queryKey: ["video-playback", videoId] });
      // Invalidate queue status to resume polling and update sidebar
      queryClient.invalidateQueries({ queryKey: ["queue", "status"] });

      if (result.success) {
        toast.success("Download started");
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to start download");
    },
  });

  const ensureDirectoryAccessMutation = useMutation({
    mutationFn: async (targetFile?: string) => {
      return await trpcClient.preferences.ensureDownloadDirectoryAccess.mutate({
        filePath: targetFile,
      });
    },
  });

  // Reset error state when videoId or filePath changes
  useEffect(() => {
    setVideoLoadError(false);
    autoStartedRef.current = false;
  }, [videoId, playback?.filePath]);

  // Auto-start download once if file is missing and not already downloading
  const autoStartedRef = useRef(false);
  useEffect(() => {
    if (!videoId) return;
    if (playback?.filePath) return; // We already have the file

    const st = playback?.status;
    const isActive = typeof st === "string" && ["downloading", "queued", "paused"].includes(st);

    if (!isActive && !autoStartedRef.current) {
      autoStartedRef.current = true;
      startDownloadMutation.mutate();
    }
  }, [videoId, playback?.filePath, playback?.status]);

  // When status flips to completed but filePath not yet populated, force a refresh once
  const completionRefetchRef = useRef(false);
  useEffect(() => {
    if (!videoId) return;
    if (playback?.filePath) return;
    if (playback?.status === "completed" && !completionRefetchRef.current) {
      completionRefetchRef.current = true;
      queryClient.invalidateQueries({ queryKey: ["video-playback", videoId] });
    }
  }, [playback?.status, playback?.filePath, videoId]);

  // WATCH PROGRESS (using existing hook)
  // Only calculate initial start time when video changes, not on every time update
  const initialStartTime = React.useMemo(() => {
    if (playerState.videoId === videoId && playerState.currentTime > 0) {
      return playerState.currentTime;
    }
    return playback?.lastPositionSeconds ?? 0;
  }, [videoId, playerState.videoId, playback?.lastPositionSeconds]);

  const { currentTime, handleTimeUpdate } = useWatchProgress(videoId, videoRef, initialStartTime, {
    onCurrentTimeChange: (time) => updateCurrentTime(time),
  });

  // Extract playback data for easier access
  const videoTitle = playback?.title ?? "Untitled";
  const filePath = playback?.filePath ?? null;
  const mediaUrl = playback?.mediaUrl ?? null; // HTTP streaming URL

  // Initialize / update store when video changes
  useEffect(() => {
    if (!videoId) return;
    beginVideoPlayback({
      videoId,
      playlistId: playlistId || null,
      playlistIndex: playlistIndex ?? null,
      startTime: initialStartTime,
    });
  }, [videoId, playlistId, playlistIndex, initialStartTime]);

  // Update playback data in external store
  useEffect(() => {
    setPlaybackData(playback || null);
  }, [playback]);

  // Fetch playlist details if we have a playlistId
  const playlistQuery = useQuery({
    queryKey: ["playlist-details", playlistId],
    queryFn: async () => {
      if (!playlistId) return null;
      return await trpcClient.playlists.getDetails.query({ playlistId });
    },
    enabled: !!playlistId,
    staleTime: Infinity,
    gcTime: Infinity,
    networkMode: "offlineFirst",
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  // Update playback position mutation
  const updatePlaybackMutation = useMutation({
    mutationFn: ({ videoIndex, watchTime }: { videoIndex: number; watchTime?: number }) =>
      trpcClient.playlists.updatePlayback.mutate({
        playlistId: playlistId!,
        currentVideoIndex: videoIndex,
        watchTimeSeconds: watchTime,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ytdlp", "all-playlists"] });
    },
  });

  const playlistData = playlistQuery.data;
  const playlistVideos = playlistData?.videos ?? [];
  const playlistCurrentIndex = playlistIndex ?? 0;

  // Check if there's a next/previous video
  const playlistHasNext = playlistCurrentIndex < playlistVideos.length - 1;
  const playlistHasPrevious = playlistCurrentIndex > 0;

  // Navigate to next video
  const goToNextVideo = useCallback(() => {
    if (!playlistHasNext || !playlistId) return;

    const nextIndex = playlistCurrentIndex + 1;
    const nextVideo = playlistVideos[nextIndex];

    if (nextVideo) {
      updatePlaybackMutation.mutate({ videoIndex: nextIndex });
      navigate({
        to: "/player",
        search: {
          videoId: nextVideo.videoId,
          playlistId,
          playlistIndex: nextIndex,
        },
      });
    }
  }, [
    playlistHasNext,
    playlistId,
    playlistCurrentIndex,
    playlistVideos,
    updatePlaybackMutation,
    navigate,
  ]);

  // Navigate to previous video
  const goToPreviousVideo = useCallback(() => {
    if (!playlistHasPrevious || !playlistId) return;

    const previousIndex = playlistCurrentIndex - 1;
    const previousVideo = playlistVideos[previousIndex];

    if (previousVideo) {
      updatePlaybackMutation.mutate({ videoIndex: previousIndex });
      navigate({
        to: "/player",
        search: {
          videoId: previousVideo.videoId,
          playlistId,
          playlistIndex: previousIndex,
        },
      });
    }
  }, [
    playlistHasPrevious,
    playlistId,
    playlistCurrentIndex,
    playlistVideos,
    updatePlaybackMutation,
    navigate,
  ]);

  const isPlaylist = !!playlistId && !!playlistData;
  const playlistTitle = playlistData?.title;
  const playlistTotalVideos = playlistVideos.length;

  // Right sidebar atoms
  const setRightSidebarContent = useSetAtom(rightSidebarContentAtom);
  const setRightSidebarOpen = useSetAtom(rightSidebarOpenAtom);
  const setAnnotationsSidebarData = useSetAtom(annotationsSidebarDataAtom);

  const playbackStatus = playback && typeof playback.status === "string" ? playback.status : null;

  // Handle video load error (e.g., file was deleted)
  const handleVideoLoadError = useCallback(() => {
    logger.error("[PlayerPage] Video load error reported by VideoPlayer", {
      videoId,
      filePath,
    });
    setVideoLoadError(true);
  }, [videoId, filePath]);

  const handleSeek = useCallback((seconds: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = seconds;
      videoRef.current.play();
    }
  }, []);

  useEffect(() => {
    if (!videoId) return;
    if (!filePath && playbackStatus === "completed") {
      logger.warn("[PlayerPage] Completed download missing file path", { videoId });
    }

    return () => {
      // Cleanup on unmount
    };
  }, [videoId, filePath, playbackStatus]);

  useEffect(() => {
    if (!filePath) return;
    const normalizedPath = filePath.toLowerCase();
    if (ensuredDirectoryRef.current.has(normalizedPath)) {
      return;
    }

    ensureDirectoryAccessMutation.mutate(filePath, {
      onSuccess: (result) => {
        if (result.success) {
          ensuredDirectoryRef.current.add(normalizedPath);
        } else {
          logger.warn("[PlayerPage] Failed to gain directory access", {
            videoId,
            filePath,
            result,
          });
          toast.error(result.message || "LearnifyTube needs access to this folder.");
          setVideoLoadError(true);
        }
      },
      onError: (error) => {
        logger.error("[PlayerPage] Directory access request failed", {
          videoId,
          filePath,
          error,
        });
        toast.error(error instanceof Error ? error.message : "Unable to access download folder");
        setVideoLoadError(true);
      },
    });
  }, [filePath]);

  // Set sidebar to show annotations when on PlayerPage
  // Set sidebar to show annotations when entering PlayerPage
  useEffect(() => {
    // Only switch to annotations if we're not already viewing AI summary
    setRightSidebarContent((prev) => (prev === "ai-summary" ? "ai-summary" : "annotations"));

    // Reset to queue when leaving PlayerPage (unmounting)
    return () => {
      setRightSidebarContent("queue");
      setAnnotationsSidebarData(null);
    };
  }, [videoId, setRightSidebarContent, setAnnotationsSidebarData]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      // Ignore if input is focused
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA" ||
        document.activeElement?.getAttribute("contenteditable") === "true"
      ) {
        return;
      }

      // Alt+C: Open Quick Capture
      if (e.altKey && (e.key === "c" || e.key === "C")) {
        e.preventDefault();
        setRightSidebarContent("capture");
        setRightSidebarOpen(true);
        toast("Quick Capture Input Opened", { icon: "⚡" });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [setRightSidebarContent, setRightSidebarOpen]);

  // Update sidebar data constantly as video plays
  useEffect(() => {
    if (videoId) {
      setAnnotationsSidebarData({
        videoId,
        videoRef,
        videoTitle: playback?.title || undefined,
        videoDescription: playback?.description || undefined,
        currentTime,
      });
    }
  }, [videoId, playback?.title, playback?.description, currentTime, setAnnotationsSidebarData]);

  return (
    <>
      {/* Global Seek Indicator Overlay - Always rendered to prevent layout shifts */}
      <div
        className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center"
        style={{ contain: "layout style paint" }}
        aria-hidden={!seekIndicator}
      >
        {seekIndicator && (
          <div className="flex items-center gap-3 rounded-lg bg-black/80 px-6 py-4 shadow-lg backdrop-blur-sm duration-200 animate-in fade-in zoom-in-95">
            {seekIndicator.direction === "backward" ? (
              <>
                <Rewind className="h-8 w-8 text-white" />
                <div className="text-white">
                  <p className="text-2xl font-bold">-{seekIndicator.amount}s</p>
                  <p className="text-xs text-white/70">Backward</p>
                </div>
              </>
            ) : (
              <>
                <div className="text-right text-white">
                  <p className="text-2xl font-bold">+{seekIndicator.amount}s</p>
                  <p className="text-xs text-white/70">Forward</p>
                </div>
                <FastForward className="h-8 w-8 text-white" />
              </>
            )}
          </div>
        )}
      </div>

      <div className="container relative mx-auto space-y-6 p-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">
              <ExternalLink
                href={`https://www.youtube.com/watch?v=${videoId}`}
                className="transition-colors hover:text-primary"
                iconClassName="h-3.5 w-3.5 opacity-50 group-hover:opacity-100"
              >
                {videoTitle}
              </ExternalLink>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {playbackIsLoading ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : !videoId ? (
              <Alert>
                <AlertTitle>Missing video</AlertTitle>
                <AlertDescription>No video id provided.</AlertDescription>
              </Alert>
            ) : !playback ? (
              <Alert>
                <AlertTitle>Not found</AlertTitle>
                <AlertDescription>Could not find that video.</AlertDescription>
              </Alert>
            ) : !filePath ? (
              <DownloadStatus
                videoId={videoId}
                status={typeof playback?.status === "string" ? playback.status : undefined}
                progress={playback?.progress ?? null}
                onStartDownload={() => startDownloadMutation.mutate()}
                isStarting={startDownloadMutation.isPending}
                thumbnailPath={playback?.thumbnailPath}
                thumbnailUrl={playback?.thumbnailUrl}
                title={playback?.title}
              />
            ) : videoLoadError ? (
              <Alert variant="destructive">
                <AlertTitle>Video file not found</AlertTitle>
                <AlertDescription className="space-y-3">
                  <p>The video file could not be loaded. It may have been deleted or moved.</p>
                  <Button
                    onClick={() => startDownloadMutation.mutate()}
                    disabled={startDownloadMutation.isPending}
                  >
                    {startDownloadMutation.isPending ? "Starting download..." : "Re-download video"}
                  </Button>
                </AlertDescription>
              </Alert>
            ) : (
              <div className="space-y-4">
                <VideoPlayer
                  videoRef={videoRef}
                  videoSrc={mediaUrl} // Use HTTP streaming URL
                  onTimeUpdate={handleTimeUpdate}
                  onError={handleVideoLoadError}
                  onSeekIndicator={(indicator) => setSeekIndicator(indicator)}
                />

                {/* Transcript - Self-contained, owns all its state */}
                <TranscriptPanel
                  videoId={videoId}
                  videoRef={videoRef}
                  currentTime={currentTime}
                  playbackData={playback || null}
                  onSeekIndicator={(indicator) => setSeekIndicator(indicator)}
                />

                {playback?.description && (
                  <VideoDescription description={playback.description} onSeek={handleSeek} />
                )}
                {/* Playlist Navigation - Show when playing from a playlist */}
                {isPlaylist && (
                  <PlaylistNavigation
                    playlistTitle={playlistTitle}
                    currentIndex={playlistCurrentIndex}
                    totalVideos={playlistTotalVideos}
                    hasNext={playlistHasNext}
                    hasPrevious={playlistHasPrevious}
                    onNext={goToNextVideo}
                    onPrevious={goToPreviousVideo}
                  />
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
