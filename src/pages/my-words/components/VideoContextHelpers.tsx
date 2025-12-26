import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { trpcClient } from "@/utils/trpc";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Play, Video, X, Clock } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import Thumbnail from "@/components/Thumbnail";

// Type for video context from API
interface VideoContext {
  id: string;
  videoId: string;
  videoTitle: string | null;
  videoThumbnailPath: string | null;
  videoThumbnailUrl: string | null;
  timestampSeconds: number;
  contextText: string | null;
}

// Video Player Modal Component
function VideoPlayerModal({
  context,
  isOpen,
  onClose,
}: {
  context: VideoContext | null;
  isOpen: boolean;
  onClose: () => void;
}): React.JSX.Element | null {
  const navigate = useNavigate();
  const videoRef = React.useRef<HTMLVideoElement>(null);

  // Fetch video playback info
  const { data: videoData, isLoading } = useQuery({
    queryKey: ["video-playback", context?.videoId],
    queryFn: async () => {
      if (!context?.videoId) return null;
      return trpcClient.ytdlp.getVideoPlayback.query({ videoId: context.videoId });
    },
    enabled: isOpen && !!context?.videoId,
  });

  // Set video time when loaded
  useEffect(() => {
    if (videoRef.current && context?.timestampSeconds && videoData?.mediaUrl) {
      videoRef.current.currentTime = context.timestampSeconds;
      // Try to autoplay
      videoRef.current.play().catch((): void => {
        // Autoplay blocked - user will need to click play
      });
    }
  }, [videoData?.mediaUrl, context?.timestampSeconds]);

  const handleTitleClick = (): void => {
    if (!context) return;
    onClose();
    navigate({
      to: "/player",
      search: {
        videoId: context.videoId,
        playlistId: undefined,
        playlistIndex: undefined,
      },
    });
  };

  if (!context) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl overflow-hidden p-0" onClick={(e) => e.stopPropagation()}>
        <div className="relative">
          {/* Close button */}
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-2 top-2 z-10 h-8 w-8 rounded-full bg-black/50 text-white hover:bg-black/70"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>

          {/* Video Player */}
          {isLoading ? (
            <div className="flex aspect-video items-center justify-center bg-black">
              <Loader2 className="h-8 w-8 animate-spin text-white" />
            </div>
          ) : !videoData?.mediaUrl ? (
            <div className="flex aspect-video flex-col items-center justify-center gap-2 bg-black text-white">
              <Video className="h-12 w-12 opacity-50" />
              <p className="text-sm opacity-70">Video not downloaded yet</p>
            </div>
          ) : (
            <video
              ref={videoRef}
              src={videoData.mediaUrl}
              className="aspect-video w-full bg-black"
              controls
              autoPlay
            />
          )}
        </div>

        {/* Video Info */}
        <div className="p-4">
          <h3
            className="line-clamp-2 cursor-pointer font-semibold hover:text-primary hover:underline"
            onClick={handleTitleClick}
            title="Open in full player"
          >
            {context.videoTitle || context.videoId}
          </h3>
          <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" />
            <span>
              Timestamp: {Math.floor(context.timestampSeconds / 60)}:
              {String(context.timestampSeconds % 60).padStart(2, "0")}
            </span>
          </div>
          {context.contextText && (
            <p className="mt-2 text-sm italic text-muted-foreground">"{context.contextText}"</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Component to show video play button with modal
export function VideoPlayButton({
  translationId,
  sourceText,
}: {
  translationId: string;
  sourceText: string;
}): React.JSX.Element | null {
  const [isListOpen, setIsListOpen] = useState(false);
  const [selectedContext, setSelectedContext] = useState<VideoContext | null>(null);
  const [isPlayerOpen, setIsPlayerOpen] = useState(false);

  const { data: contexts, isLoading } = useQuery({
    queryKey: ["translation-contexts", translationId],
    queryFn: async () => trpcClient.translation.getTranslationContexts.query({ translationId }),
  });

  if (isLoading) {
    return (
      <Button variant="outline" size="sm" disabled className="h-7 gap-1 px-2">
        <Loader2 className="h-3 w-3 animate-spin" />
      </Button>
    );
  }

  if (!contexts || contexts.length === 0) {
    return null;
  }

  const handleVideoSelect = (context: VideoContext): void => {
    setSelectedContext(context);
    setIsListOpen(false);
    setIsPlayerOpen(true);
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="h-7 gap-1 px-2"
        onClick={(e) => {
          e.stopPropagation();
          // If only one video, play directly
          if (contexts.length === 1) {
            handleVideoSelect(contexts[0]);
          } else {
            setIsListOpen(true);
          }
        }}
        title={`Found in ${contexts.length} video(s)`}
      >
        <Video className="h-3 w-3" />
        <span className="text-xs">{contexts.length}</span>
      </Button>

      {/* Video List Modal (for multiple videos) */}
      <Dialog open={isListOpen} onOpenChange={setIsListOpen}>
        <DialogContent className="max-w-lg" onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Video className="h-5 w-5" />
              Videos for "{sourceText}"
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-[400px] space-y-3 overflow-y-auto">
            {contexts.map((context) => (
              <div
                key={context.id}
                className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-accent"
                onClick={() => handleVideoSelect(context)}
              >
                {/* Video Thumbnail */}
                <div className="w-28 flex-shrink-0">
                  <Thumbnail
                    thumbnailPath={context.videoThumbnailPath}
                    thumbnailUrl={context.videoThumbnailUrl}
                    alt={context.videoTitle || "Video"}
                    className="aspect-video w-full rounded object-cover"
                  />
                </div>

                {/* Video Info */}
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm font-medium">
                    {context.videoTitle || context.videoId}
                  </p>
                  <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    <span>
                      {Math.floor(context.timestampSeconds / 60)}:
                      {String(context.timestampSeconds % 60).padStart(2, "0")}
                    </span>
                  </div>
                  {context.contextText && (
                    <p className="mt-1 line-clamp-1 text-xs italic text-muted-foreground">
                      "{context.contextText}"
                    </p>
                  )}
                </div>

                {/* Play Icon */}
                <Play className="h-5 w-5 flex-shrink-0 text-primary" />
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Video Player Modal */}
      <VideoPlayerModal
        context={selectedContext}
        isOpen={isPlayerOpen}
        onClose={() => setIsPlayerOpen(false)}
      />
    </>
  );
}
