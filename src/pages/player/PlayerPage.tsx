import React, { useRef, useState, useEffect, useCallback } from "react";
import { useSearch, useNavigate } from "@tanstack/react-router";
import { useSetAtom, useAtomValue } from "jotai";
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
import { AnnotationForm } from "./components/AnnotationForm";
import { PlaylistNavigation } from "./components/PlaylistNavigation";
import { rightSidebarContentAtom, annotationsSidebarDataAtom } from "@/context/rightSidebar";
import {
  videoRefAtom,
  currentTimeAtom,
  filePathAtom,
  playbackDataAtom,
  seekIndicatorAtom,
  thumbnailPathAtom,
  thumbnailUrlAtom,
} from "@/context/player";
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

  // Atom setters for shared state
  const setVideoRefAtom = useSetAtom(videoRefAtom);
  const setCurrentTimeAtom = useSetAtom(currentTimeAtom);
  const setFilePathAtom = useSetAtom(filePathAtom);
  const setPlaybackDataAtom = useSetAtom(playbackDataAtom);
  const setSeekIndicatorAtom = useSetAtom(seekIndicatorAtom);
  const setThumbnailPathAtom = useSetAtom(thumbnailPathAtom);
  const setThumbnailUrlAtom = useSetAtom(thumbnailUrlAtom);
  const seekIndicator = useAtomValue(seekIndicatorAtom);

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

    if (seekTimeoutRef.current) {
      clearTimeout(seekTimeoutRef.current);
    }

    seekTimeoutRef.current = setTimeout(() => {
      setSeekIndicatorAtom(null);
    }, 800);

    return () => {
      if (seekTimeoutRef.current) {
        clearTimeout(seekTimeoutRef.current);
      }
    };
  }, [seekIndicator, setSeekIndicatorAtom]);

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

  // ============================================================================
  // WATCH PROGRESS (using existing useWatchProgress hook - complex reusable logic)
  // ============================================================================

  // Determine start time: prefer atom if valid and matches current video, else server data
  const storedPlaybackData = useAtomValue(playbackDataAtom);
  const storedCurrentTime = useAtomValue(currentTimeAtom);

  // Clear atom state when videoId changes to prevent using previous video's state
  useEffect(() => {
    if (storedPlaybackData?.videoId && storedPlaybackData.videoId !== videoId) {
      logger.info("[PlayerPage] Clearing atom state for new video", {
        previousVideoId: storedPlaybackData.videoId,
        newVideoId: videoId,
      });
      setCurrentTimeAtom(0);
      setPlaybackDataAtom(null);
    }
  }, [videoId, storedPlaybackData?.videoId, setCurrentTimeAtom, setPlaybackDataAtom]);

  const initialStartTime = React.useMemo(() => {
    // If we have a stored time for THIS video, use it (client-side state is fresher than server)
    if (storedPlaybackData?.videoId === videoId && storedCurrentTime > 0) {
      logger.info("[PlayerPage] Using stored atom time", { videoId, storedCurrentTime });
      return storedCurrentTime;
    }
    // Otherwise, use the server's last position from the database
    logger.info("[PlayerPage] Using server lastPositionSeconds", {
      videoId,
      lastPositionSeconds: playback?.lastPositionSeconds,
    });
    return playback?.lastPositionSeconds;
  }, [videoId, storedPlaybackData, storedCurrentTime, playback]);

  const { currentTime, handleTimeUpdate } = useWatchProgress(videoId, videoRef, initialStartTime, {
    onCurrentTimeChange: (time) => {
      // logger.debug("[PlayerPage] onCurrentTimeChange", { time });
      setCurrentTimeAtom(time);
    },
  });

  // Update videoRef atom when ref changes
  useEffect(() => {
    setVideoRefAtom(videoRef);
  }, [setVideoRefAtom]);

  // Update currentTime atom when time changes
  // Update filePath atom when playback data changes
  useEffect(() => {
    setFilePathAtom(playback?.filePath || null);
  }, [playback?.filePath, setFilePathAtom]);

  // Update playbackData atom when playback data changes
  useEffect(() => {
    setPlaybackDataAtom(playback || null);
  }, [playback, setPlaybackDataAtom]);

  // Update thumbnail atoms when playback data changes
  useEffect(() => {
    setThumbnailPathAtom(playback?.thumbnailPath ?? null);
    setThumbnailUrlAtom(playback?.thumbnailUrl ?? null);
  }, [playback?.thumbnailPath, playback?.thumbnailUrl, setThumbnailPathAtom, setThumbnailUrlAtom]);

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
  const setAnnotationsSidebarData = useSetAtom(annotationsSidebarDataAtom);

  const filePath = playback?.filePath || null;
  const videoTitle = playback?.title || playback?.videoId || "Video";
  const playbackStatus = playback && typeof playback.status === "string" ? playback.status : null;

  // Handle video load error (e.g., file was deleted)
  const handleVideoLoadError = useCallback(() => {
    logger.error("[PlayerPage] Video load error reported by VideoPlayer", {
      videoId,
      filePath,
    });
    setVideoLoadError(true);
  }, [videoId, filePath]);

  useEffect(() => {
    if (!videoId) return;
    if (filePath) {
      logger.info("[PlayerPage] Ready to play local file", { videoId, filePath });
    } else if (playbackStatus === "completed") {
      logger.warn("[PlayerPage] Completed download missing file path", { videoId });
    } else {
      logger.debug("[PlayerPage] Awaiting file availability", {
        videoId,
        playbackStatus,
      });
    }

    return () => {
      logger.info("[PlayerPage] Unmounting/Changing video", { videoId });
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
          toast.error(result.message || "LearnifyTube needs access to this folder.");
          setVideoLoadError(true);
        }
      },
      onError: (error) => {
        toast.error(error instanceof Error ? error.message : "Unable to access download folder");
        setVideoLoadError(true);
      },
    });
  }, [filePath]);

  // Set sidebar to show annotations when on PlayerPage
  useEffect(() => {
    setRightSidebarContent("annotations");

    // Only set data when we have videoId
    if (videoId) {
      setAnnotationsSidebarData({
        videoId,
        videoRef,
        videoTitle: playback?.title || undefined,
        videoDescription: playback?.description || undefined,
        currentTime,
      });
    }

    // Reset to queue when leaving PlayerPage
    return () => {
      setRightSidebarContent("queue");
      setAnnotationsSidebarData(null);
    };
  }, [videoId, playback?.title, playback?.description, currentTime]);

  return (
    <div className="container relative mx-auto space-y-6 p-6">
      {/* Global Seek Indicator Overlay */}
      {seekIndicator && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center">
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
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{videoTitle}</CardTitle>
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
                onTimeUpdate={handleTimeUpdate}
                onError={handleVideoLoadError}
              />

              {/* Transcript - Self-contained, owns all its state */}
              <TranscriptPanel videoId={videoId} />

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

              {/* Annotation Form Dialog - Self-contained, owns all its state */}
              <AnnotationForm videoId={videoId} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
