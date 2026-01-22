import React, { useState, useEffect, useRef } from "react";
import { trpcClient } from "@/utils/trpc";
import { Flashcard } from "@/api/db/schema";
import { Button } from "@/components/ui/button";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { VideoPlayer } from "@/pages/player/components/VideoPlayer";
import { PronunciationButton } from "@/components/PronunciationButton";
import { Loader2, ChevronDown } from "lucide-react";

interface StudyModeProps {
  cards: Flashcard[];
  onComplete: () => void;
}

const ContextPlayer = ({
  videoId,
  timestamp,
  autoplay = false,
}: {
  videoId: string;
  timestamp: number;
  autoplay?: boolean;
}): React.JSX.Element => {
  const videoRef = useRef<HTMLVideoElement>(null);

  const { data: playback, isLoading } = useQuery({
    queryKey: ["video-playback", videoId],
    queryFn: async () => trpcClient.ytdlp.getVideoPlayback.query({ videoId }),
  });

  useEffect(() => {
    if (videoRef.current && timestamp) {
      videoRef.current.currentTime = Math.max(0, timestamp - 2);
      if (autoplay) {
        videoRef.current.play().catch(() => {});
      }
    }
  }, [playback, timestamp, autoplay]);

  if (isLoading)
    return (
      <div className="flex aspect-video items-center justify-center rounded-lg bg-muted">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  if (!playback)
    return (
      <div className="flex aspect-video items-center justify-center rounded-lg bg-muted text-sm text-muted-foreground">
        Video not available
      </div>
    );

  return (
    <div className="overflow-hidden rounded-lg bg-black">
      <VideoPlayer
        videoRef={videoRef}
        videoSrc={playback.mediaUrl ?? null}
        onTimeUpdate={() => {}}
        className="aspect-video w-full"
        autoPlay={false}
      />
    </div>
  );
};

export function StudyMode({ cards, onComplete }: StudyModeProps): React.JSX.Element {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const queryClient = useQueryClient();
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsFlipped(false);
    // Scroll content to top when card changes
    if (contentRef.current) {
      contentRef.current.scrollTop = 0;
    }
  }, [currentIndex]);

  const currentCard = cards[currentIndex];
  const isLastCard = currentIndex === cards.length - 1;
  const progress = ((currentIndex + 1) / cards.length) * 100;

  const reviewMutation = useMutation({
    mutationFn: async ({ id, grade }: { id: string; grade: number }) => {
      return await trpcClient.flashcards.review.mutate({ id, grade });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["flashcards"] });
      if (isLastCard) {
        onComplete();
      } else {
        setCurrentIndex((prev) => prev + 1);
      }
    },
  });

  const handleGrade = (grade: number): void => {
    if (reviewMutation.isPending) return;
    reviewMutation.mutate({ id: currentCard.id, grade });
  };

  if (!currentCard) return <div>No cards to study.</div>;

  const isCloze = currentCard.cardType === "cloze" || currentCard.clozeContent;

  const renderClozeFront = (text: string): string => {
    return text.replace(/{{c1::(.*?)}}/g, "[...]");
  };

  const renderClozeBack = (text: string): React.JSX.Element => {
    const parts = text.split(/({{c1::.*?}})/g);
    return (
      <span>
        {parts.map((part, i) => {
          if (part.startsWith("{{c1::")) {
            const content = part.replace("{{c1::", "").replace("}}", "");
            return (
              <span
                key={i}
                className="rounded bg-primary/20 px-1.5 py-0.5 font-semibold text-primary"
              >
                {content}
              </span>
            );
          }
          return <span key={i}>{part}</span>;
        })}
      </span>
    );
  };

  const hasVideo = currentCard.videoId && currentCard.timestampSeconds !== null;

  return (
    <div className="flex h-[520px] flex-col">
      {/* Progress Bar */}
      <div className="h-1 w-full bg-muted">
        <div
          className="h-full bg-primary transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-sm text-muted-foreground">
          Card {currentIndex + 1} of {cards.length}
        </span>
        <div className="flex items-center gap-2">
          {currentCard.cardType && (
            <span className="rounded-full bg-muted px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {currentCard.cardType}
            </span>
          )}
          <span className="text-sm text-muted-foreground">
            {cards.length - currentIndex - 1} left
          </span>
        </div>
      </div>

      {/* Card Content - Fixed Height with Scroll */}
      <div ref={contentRef} className="flex-1 overflow-y-auto px-4">
        <div className="flex min-h-full flex-col rounded-xl border bg-card">
          {/* Main Content Area */}
          <div className="flex flex-1 flex-col items-center justify-center p-6">
            {!isFlipped ? (
              /* Front Side */
              <div className="flex w-full flex-col items-center justify-center gap-4 text-center">
                <div className="flex items-center gap-3">
                  <h2 className="text-2xl font-medium leading-relaxed">
                    {isCloze
                      ? renderClozeFront(currentCard.clozeContent || currentCard.frontContent)
                      : currentCard.frontContent}
                  </h2>
                  <PronunciationButton
                    text={currentCard.frontContent}
                    size="sm"
                    variant="outline"
                    className="shrink-0"
                  />
                </div>
                <button
                  onClick={() => setIsFlipped(true)}
                  className="mt-4 flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  <ChevronDown className="h-4 w-4" />
                  Tap to reveal answer
                </button>
              </div>
            ) : (
              /* Back Side */
              <div className="w-full space-y-4">
                {/* Question (small) */}
                <div className="text-center text-sm text-muted-foreground">
                  {isCloze
                    ? renderClozeBack(currentCard.clozeContent || currentCard.frontContent)
                    : currentCard.frontContent}
                </div>

                {/* Divider */}
                <div className="mx-auto h-px w-16 bg-border" />

                {/* Answer */}
                {!isCloze && (
                  <div className="flex items-center justify-center gap-3">
                    <h2 className="text-2xl font-bold text-primary">{currentCard.backContent}</h2>
                    <PronunciationButton
                      text={currentCard.backContent}
                      size="sm"
                      variant="outline"
                      className="shrink-0"
                    />
                  </div>
                )}

                {/* Context Text */}
                {currentCard.contextText && (
                  <div className="mx-auto max-w-md rounded-lg bg-muted/50 px-4 py-3 text-center text-sm italic text-muted-foreground">
                    "{currentCard.contextText}"
                  </div>
                )}

                {/* Video Context */}
                {hasVideo && (
                  <div className="mx-auto w-full max-w-md pt-2">
                    <ContextPlayer
                      videoId={currentCard.videoId!}
                      timestamp={currentCard.timestampSeconds!}
                      autoplay={false}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer Actions - Fixed */}
      <div className="shrink-0 border-t bg-background px-4 py-3">
        {!isFlipped ? (
          <Button size="lg" onClick={() => setIsFlipped(true)} className="h-11 w-full font-medium">
            Show Answer
          </Button>
        ) : (
          <div className="grid grid-cols-4 gap-2">
            <button
              onClick={() => handleGrade(1)}
              disabled={reviewMutation.isPending}
              className="flex flex-col items-center gap-1 rounded-lg bg-red-500/10 px-3 py-2 text-red-600 transition-colors hover:bg-red-500/20 disabled:opacity-50 dark:text-red-400"
            >
              <span className="text-sm font-medium">Again</span>
              <span className="text-[10px] opacity-70">1m</span>
            </button>
            <button
              onClick={() => handleGrade(2)}
              disabled={reviewMutation.isPending}
              className="flex flex-col items-center gap-1 rounded-lg bg-orange-500/10 px-3 py-2 text-orange-600 transition-colors hover:bg-orange-500/20 disabled:opacity-50 dark:text-orange-400"
            >
              <span className="text-sm font-medium">Hard</span>
              <span className="text-[10px] opacity-70">10m</span>
            </button>
            <button
              onClick={() => handleGrade(3)}
              disabled={reviewMutation.isPending}
              className="flex flex-col items-center gap-1 rounded-lg bg-blue-500/10 px-3 py-2 text-blue-600 transition-colors hover:bg-blue-500/20 disabled:opacity-50 dark:text-blue-400"
            >
              <span className="text-sm font-medium">Good</span>
              <span className="text-[10px] opacity-70">1d</span>
            </button>
            <button
              onClick={() => handleGrade(4)}
              disabled={reviewMutation.isPending}
              className="flex flex-col items-center gap-1 rounded-lg bg-green-500/10 px-3 py-2 text-green-600 transition-colors hover:bg-green-500/20 disabled:opacity-50 dark:text-green-400"
            >
              <span className="text-sm font-medium">Easy</span>
              <span className="text-[10px] opacity-70">4d</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
