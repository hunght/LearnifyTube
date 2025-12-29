import React, { useState, useEffect, useRef } from "react";
import { trpcClient } from "@/utils/trpc";
import { Flashcard } from "@/api/db/schema";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { VideoPlayer } from "@/pages/player/components/VideoPlayer";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

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

  // Auto-seek when ready
  useEffect(() => {
    if (videoRef.current && timestamp) {
      // seek to timestamp - 2s for context
      videoRef.current.currentTime = Math.max(0, timestamp - 2);
      if (autoplay) {
        videoRef.current.play().catch(() => {});
      }
    }
  }, [playback, timestamp, autoplay]);

  if (isLoading)
    return (
      <div className="flex justify-center rounded-lg bg-black/5 p-8">
        <Loader2 className="animate-spin" />
      </div>
    );
  if (!playback)
    return <div className="rounded-lg border p-4 text-destructive">Video not found</div>;

  return (
    <div className="space-y-2 overflow-hidden rounded-lg border bg-black">
      <VideoPlayer
        videoRef={videoRef}
        videoSrc={playback.mediaUrl ?? null}
        onTimeUpdate={() => {}} // No-op for context view
        className="aspect-video w-full"
      />
    </div>
  );
};

export function StudyMode({ cards, onComplete }: StudyModeProps): React.JSX.Element {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const queryClient = useQueryClient();

  // Reset state when card changes
  useEffect(() => {
    setIsFlipped(false);
  }, [currentIndex]);

  const currentCard = cards[currentIndex];
  const isLastCard = currentIndex === cards.length - 1;

  const reviewMutation = useMutation({
    mutationFn: async ({ id, grade }: { id: string; grade: number }) => {
      return await trpcClient.flashcards.review.mutate({ id, grade });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["flashcards"] });
      if (isLastCard) {
        onComplete();
      } else {
        // Next card
        setCurrentIndex((prev) => prev + 1);
      }
    },
  });

  const handleGrade = (grade: number): void => {
    if (reviewMutation.isPending) return;
    reviewMutation.mutate({ id: currentCard.id, grade });
  };

  if (!currentCard) return <div>No cards to study.</div>;

  // Cloze parsing logic
  const isCloze = currentCard.cardType === "cloze" || currentCard.clozeContent;

  const renderClozeFront = (text: string): string => {
    // Replace {{c1::answer}} with [...]
    return text.replace(/{{c1::(.*?)}}/g, "[...]");
  };

  const renderClozeBack = (text: string): React.JSX.Element => {
    // Highlight answer in bold/color
    const parts = text.split(/({{c1::.*?}})/g);
    return (
      <span>
        {parts.map((part, i) => {
          if (part.startsWith("{{c1::")) {
            const content = part.replace("{{c1::", "").replace("}}", "");
            return (
              <span key={i} className="rounded bg-primary/10 px-1 font-bold text-primary">
                {content}
              </span>
            );
          }
          return <span key={i}>{part}</span>;
        })}
      </span>
    );
  };

  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center justify-center space-y-4 py-4">
      <div className="flex w-full items-center justify-between text-sm text-muted-foreground">
        <span>
          Card {currentIndex + 1} of {cards.length}
        </span>
        <span className="flex items-center gap-2">
          {currentCard.cardType && (
            <span className="rounded bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
              {currentCard.cardType}
            </span>
          )}
          <span>{cards.length - currentIndex - 1} remaining</span>
        </span>
      </div>

      <div className="perspective-1000 relative w-full">
        <Card
          className={cn(
            "flex min-h-[500px] w-full flex-col overflow-hidden transition-all duration-300"
            // If flipped, we might want a different border color or something, but standard card is fine
          )}
        >
          <div className="flex max-h-[70vh] flex-1 flex-col items-center justify-center overflow-y-auto p-8 text-center">
            {/* Front Side Content */}
            {!isFlipped ? (
              <div className="w-full space-y-6 animate-in fade-in zoom-in-95">
                <div className="text-3xl font-medium leading-relaxed">
                  {isCloze
                    ? renderClozeFront(currentCard.clozeContent || currentCard.frontContent)
                    : currentCard.frontContent}
                </div>

                <p className="mt-8 text-sm text-muted-foreground">Tap reveal to check answer</p>
              </div>
            ) : (
              /* Back Side Content */
              <div className="w-full space-y-8 animate-in fade-in slide-in-from-bottom-4">
                {/* Question (Front) Repeater (Small) */}
                <div className="border-b pb-4 text-lg text-muted-foreground opacity-80">
                  {isCloze
                    ? renderClozeBack(currentCard.clozeContent || currentCard.frontContent)
                    : currentCard.frontContent}
                </div>

                {/* Answer (Back) */}
                {!isCloze && (
                  <div className="text-3xl font-bold text-primary">{currentCard.backContent}</div>
                )}

                {/* Context Text */}
                {currentCard.contextText && (
                  <div className="rounded-lg bg-muted/30 p-4 text-lg italic text-muted-foreground">
                    "{currentCard.contextText}"
                  </div>
                )}

                {/* Embedded Video Context */}
                {currentCard.videoId && currentCard.timestampSeconds !== null && (
                  <div className="mt-4 w-full overflow-hidden rounded-lg shadow-sm">
                    <ContextPlayer
                      videoId={currentCard.videoId}
                      timestamp={currentCard.timestampSeconds}
                      autoplay={true}
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="w-full border-t bg-muted/5 p-4">
            {!isFlipped ? (
              <Button size="lg" onClick={() => setIsFlipped(true)} className="h-12 w-full text-lg">
                Show Answer
              </Button>
            ) : (
              <div className="grid w-full grid-cols-4 gap-2">
                <div className="flex flex-col gap-1">
                  <Button variant="destructive" className="h-12" onClick={() => handleGrade(1)}>
                    Again
                  </Button>
                  <span className="text-center text-xs text-muted-foreground">1m</span>
                </div>
                <div className="flex flex-col gap-1">
                  <Button
                    variant="secondary"
                    className="h-12 border-orange-200 bg-orange-100 text-orange-900 hover:bg-orange-200"
                    onClick={() => handleGrade(2)}
                  >
                    Hard
                  </Button>
                  <span className="text-center text-xs text-muted-foreground">10m</span>
                </div>
                <div className="flex flex-col gap-1">
                  <Button
                    variant="secondary"
                    className="h-12 border-blue-200 bg-blue-100 text-blue-900 hover:bg-blue-200"
                    onClick={() => handleGrade(3)}
                  >
                    Good
                  </Button>
                  <span className="text-center text-xs text-muted-foreground">1d</span>
                </div>
                <div className="flex flex-col gap-1">
                  <Button
                    variant="secondary"
                    className="h-12 border-green-200 bg-green-100 text-green-900 hover:bg-green-200"
                    onClick={() => handleGrade(4)}
                  >
                    Easy
                  </Button>
                  <span className="text-center text-xs text-muted-foreground">4d</span>
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
