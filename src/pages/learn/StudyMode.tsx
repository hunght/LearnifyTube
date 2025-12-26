import React, { useState, useEffect, useRef } from "react";
import { trpcClient } from "@/utils/trpc";
import { Flashcard } from "@/api/db/schema";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Play } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { VideoPlayer } from "@/pages/player/components/VideoPlayer";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";

interface StudyModeProps {
  cards: Flashcard[];
  onComplete: () => void;
}

const ContextPlayer = ({
  videoId,
  timestamp,
}: {
  videoId: string;
  timestamp: number;
}): React.JSX.Element => {
  const videoRef = useRef<HTMLVideoElement>(null);

  const { data: playback, isLoading } = useQuery({
    queryKey: ["video-playback", videoId],
    queryFn: async () => trpcClient.ytdlp.getVideoPlayback.query({ videoId }),
  });

  // Auto-seek when ready
  useEffect(() => {
    if (videoRef.current && timestamp) {
      // seek to timestamp - 5s
      videoRef.current.currentTime = Math.max(0, timestamp - 5);
    }
  }, [playback, timestamp]);

  if (isLoading)
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="animate-spin" />
      </div>
    );
  if (!playback) return <div className="p-4 text-destructive">Video not found</div>;

  return (
    <div className="space-y-2">
      <VideoPlayer
        videoRef={videoRef}
        videoSrc={playback.mediaUrl ?? null}
        onTimeUpdate={() => {}} // No-op for context view
      />
      <p className="text-center text-xs text-muted-foreground">Playing context segment</p>
    </div>
  );
};

export function StudyMode({ cards, onComplete }: StudyModeProps): React.JSX.Element {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [showContext, setShowContext] = useState(false);
  const queryClient = useQueryClient();

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
        setIsFlipped(false);
        setShowContext(false);
        setCurrentIndex((prev) => prev + 1);
      }
    },
  });

  const handleGrade = (grade: number): void => {
    if (reviewMutation.isPending) return;
    reviewMutation.mutate({ id: currentCard.id, grade });
  };

  if (!currentCard) return <div>No cards to study.</div>;

  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center justify-center space-y-8 py-8">
      <div className="flex w-full items-center justify-between text-sm text-muted-foreground">
        <span>
          Card {currentIndex + 1} of {cards.length}
        </span>
        <span>{cards.length - currentIndex - 1} remaining</span>
      </div>

      <div className="perspective-1000 relative h-[500px] w-full">
        <Card className="flex h-[500px] w-full flex-col items-center justify-center overflow-y-auto p-8 text-center transition-all duration-300">
          {/* Front Side */}
          {!isFlipped ? (
            <div className="space-y-6 duration-200 animate-in fade-in zoom-in-95">
              <h2 className="text-4xl font-bold">{currentCard.frontContent}</h2>
              <p className="text-muted-foreground">Tap to reveal definition</p>
              <Button size="lg" onClick={() => setIsFlipped(true)} className="mt-8">
                Show Answer
              </Button>
            </div>
          ) : (
            <div className="w-full space-y-6 duration-200 animate-in fade-in zoom-in-95">
              <div className="space-y-2 border-b pb-4">
                <h3 className="text-sm font-medium text-muted-foreground">Front</h3>
                <p className="text-2xl font-semibold">{currentCard.frontContent}</p>
              </div>

              <div className="space-y-2 pb-4">
                <h3 className="text-sm font-medium text-muted-foreground">Back</h3>
                <p className="text-3xl font-bold text-primary">{currentCard.backContent}</p>
                {currentCard.contextText && (
                  <p className="mt-2 italic text-muted-foreground">"{currentCard.contextText}"</p>
                )}
              </div>

              {currentCard.videoId && currentCard.timestampSeconds !== null && (
                <Button variant="outline" onClick={() => setShowContext(true)} className="gap-2">
                  <Play className="h-4 w-4" />
                  Watch Context
                </Button>
              )}

              <div className="mt-8 grid w-full grid-cols-4 gap-2 border-t pt-4">
                <div className="flex flex-col gap-1">
                  <Button variant="destructive" className="h-12" onClick={() => handleGrade(1)}>
                    Again
                  </Button>
                  <span className="text-xs text-muted-foreground">1m</span>
                </div>
                <div className="flex flex-col gap-1">
                  <Button
                    variant="secondary"
                    className="h-12 border-orange-200 bg-orange-100 text-orange-900 hover:bg-orange-200"
                    onClick={() => handleGrade(2)}
                  >
                    Hard
                  </Button>
                  <span className="text-xs text-muted-foreground">10m</span>
                </div>
                <div className="flex flex-col gap-1">
                  <Button
                    variant="secondary"
                    className="h-12 border-blue-200 bg-blue-100 text-blue-900 hover:bg-blue-200"
                    onClick={() => handleGrade(3)}
                  >
                    Good
                  </Button>
                  <span className="text-xs text-muted-foreground">1d</span>
                </div>
                <div className="flex flex-col gap-1">
                  <Button
                    variant="secondary"
                    className="h-12 border-green-200 bg-green-100 text-green-900 hover:bg-green-200"
                    onClick={() => handleGrade(4)}
                  >
                    Easy
                  </Button>
                  <span className="text-xs text-muted-foreground">4d</span>
                </div>
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Video Context Dialog */}
      <Dialog open={showContext} onOpenChange={setShowContext}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Video Context</DialogTitle>
          </DialogHeader>
          {currentCard.videoId && currentCard.timestampSeconds !== null && (
            <ContextPlayer videoId={currentCard.videoId} timestamp={currentCard.timestampSeconds} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
