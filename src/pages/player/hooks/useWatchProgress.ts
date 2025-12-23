import { useState, useRef, useCallback, useEffect } from "react";
import { trpcClient } from "@/utils/trpc";
import { logger } from "@/helpers/logger";

interface UseWatchProgressOptions {
  onCurrentTimeChange?: (time: number) => void;
}

export function useWatchProgress(
  videoId: string | undefined,
  videoRef: React.RefObject<HTMLVideoElement>,
  lastPositionSeconds?: number | undefined,
  options?: UseWatchProgressOptions
): {
  currentTime: number;
  handleTimeUpdate: (e: React.SyntheticEvent<HTMLVideoElement, Event>) => void;
} {
  const [currentTime, setCurrentTime] = useState(0);
  const positionRestoredRef = useRef<boolean>(false);

  const lastTimeRef = useRef<number>(0);
  const accumulatedRef = useRef<number>(0);
  const flushTimerRef = useRef<NodeJS.Timeout | null>(null);
  const onCurrentTimeChange = options?.onCurrentTimeChange;

  const handleTimeUpdate = useCallback(
    (e: React.SyntheticEvent<HTMLVideoElement, Event>) => {
      const el = e.currentTarget;
      const current = el.currentTime;
      setCurrentTime(current);
      onCurrentTimeChange?.(current);
      const prev = lastTimeRef.current;
      if (current > prev) {
        accumulatedRef.current += current - prev;
      }
      lastTimeRef.current = current;
    },
    [onCurrentTimeChange]
  );

  const flushProgress = useCallback(async () => {
    if (!videoId) return;
    const delta = Math.floor(accumulatedRef.current);
    if (delta <= 0) return;
    accumulatedRef.current = 0;
    try {
      await trpcClient.watchStats.recordProgress.mutate({
        videoId,
        deltaSeconds: delta,
        positionSeconds: Math.floor(lastTimeRef.current || 0),
      });
    } catch {
      // Ignore - progress recording is not critical
    }
  }, [videoId]);

  // Restore last position when video is ready
  useEffect(() => {
    if (!videoRef.current || !videoId || positionRestoredRef.current) return;
    if (lastPositionSeconds === undefined || lastPositionSeconds <= 0) return;

    const video = videoRef.current;

    const restorePosition = (): void => {
      if (positionRestoredRef.current) return;
      try {
        video.currentTime = lastPositionSeconds;
        setCurrentTime(lastPositionSeconds);
        onCurrentTimeChange?.(lastPositionSeconds);
        lastTimeRef.current = lastPositionSeconds;
        positionRestoredRef.current = true;
      } catch (err) {
        logger.error("[useWatchProgress] Failed to restore position", err);
      }
    };

    // Try to restore position when video is ready
    if (video.readyState >= 2) {
      // HAVE_CURRENT_DATA or higher - enough data to seek
      restorePosition();
    } else {
      // Wait for video to load
      video.addEventListener("loadedmetadata", restorePosition, { once: true });
      video.addEventListener("canplay", restorePosition, { once: true });
    }

    return () => {
      video.removeEventListener("loadedmetadata", restorePosition);
      video.removeEventListener("canplay", restorePosition);
    };
  }, [videoId, videoRef, lastPositionSeconds, onCurrentTimeChange]);

  // Reset position restored flag when video changes
  useEffect(() => {
    positionRestoredRef.current = false;
  }, [videoId]);

  useEffect(() => {
    // Flush every 10 seconds
    flushTimerRef.current = setInterval(() => {
      flushProgress();
    }, 10000);
    return () => {
      if (flushTimerRef.current) {
        clearInterval(flushTimerRef.current);
      }
      flushProgress();
    };
  }, [flushProgress]);

  return {
    currentTime,
    handleTimeUpdate,
  };
}
