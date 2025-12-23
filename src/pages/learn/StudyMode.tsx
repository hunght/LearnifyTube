
import React, { useState, useEffect, useRef } from "react";
import { trpcClient } from "@/utils/trpc";
import { Flashcard } from "@/api/db/schema";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Play, RotateCcw, CheckCircle, Brain, XCircle, ArrowRight } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { VideoPlayer } from "@/pages/player/components/VideoPlayer";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";

interface StudyModeProps {
    cards: Flashcard[];
    onComplete: () => void;
}

const ContextPlayer = ({ videoId, timestamp }: { videoId: string; timestamp: number }) => {
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

    if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>;
    if (!playback) return <div className="text-destructive p-4">Video not found</div>;

    return (
        <div className="space-y-2">
            <VideoPlayer
                videoRef={videoRef}
                videoSrc={playback.mediaUrl ?? null}
                onTimeUpdate={() => { }} // No-op for context view
            />
            <p className="text-xs text-muted-foreground text-center">Playing context segment</p>
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

    const handleGrade = (grade: number) => {
        if (reviewMutation.isPending) return;
        reviewMutation.mutate({ id: currentCard.id, grade });
    };

    if (!currentCard) return <div>No cards to study.</div>;

    return (
        <div className="flex flex-col items-center justify-center max-w-2xl mx-auto py-8 space-y-8">
            <div className="w-full flex justify-between items-center text-sm text-muted-foreground">
                <span>Card {currentIndex + 1} of {cards.length}</span>
                <span>{cards.length - currentIndex - 1} remaining</span>
            </div>

            <div className="relative w-full perspective-1000 min-h-[400px]">
                <Card className="w-full min-h-[400px] flex flex-col items-center justify-center p-8 text-center transition-all duration-300">
                    {/* Front Side */}
                    {!isFlipped ? (
                        <div className="space-y-6 animate-in fade-in zoom-in-95 duration-200">
                            <h2 className="text-4xl font-bold">{currentCard.frontContent}</h2>
                            <p className="text-muted-foreground">Tap to reveal definition</p>
                            <Button
                                size="lg"
                                onClick={() => setIsFlipped(true)}
                                className="mt-8"
                            >
                                Show Answer
                            </Button>
                        </div>
                    ) : (
                        <div className="space-y-6 animate-in fade-in zoom-in-95 duration-200 w-full">
                            <div className="space-y-2 border-b pb-4">
                                <h3 className="text-sm font-medium text-muted-foreground">Front</h3>
                                <p className="text-2xl font-semibold">{currentCard.frontContent}</p>
                            </div>

                            <div className="space-y-2 pb-4">
                                <h3 className="text-sm font-medium text-muted-foreground">Back</h3>
                                <p className="text-3xl font-bold text-primary">{currentCard.backContent}</p>
                                {currentCard.contextText && (
                                    <p className="italic text-muted-foreground mt-2">"{currentCard.contextText}"</p>
                                )}
                            </div>

                            {currentCard.videoId && currentCard.timestampSeconds !== null && (
                                <Button variant="outline" onClick={() => setShowContext(true)} className="gap-2">
                                    <Play className="w-4 h-4" />
                                    Watch Context
                                </Button>
                            )}

                            <div className="grid grid-cols-4 gap-2 mt-8 pt-4 border-t w-full">
                                <div className="flex flex-col gap-1">
                                    <Button variant="destructive" className="h-12" onClick={() => handleGrade(1)}>Again</Button>
                                    <span className="text-xs text-muted-foreground">1m</span>
                                </div>
                                <div className="flex flex-col gap-1">
                                    <Button variant="secondary" className="h-12 bg-orange-100 hover:bg-orange-200 text-orange-900 border-orange-200" onClick={() => handleGrade(2)}>Hard</Button>
                                    <span className="text-xs text-muted-foreground">10m</span>
                                </div>
                                <div className="flex flex-col gap-1">
                                    <Button variant="secondary" className="h-12 bg-blue-100 hover:bg-blue-200 text-blue-900 border-blue-200" onClick={() => handleGrade(3)}>Good</Button>
                                    <span className="text-xs text-muted-foreground">1d</span>
                                </div>
                                <div className="flex flex-col gap-1">
                                    <Button variant="secondary" className="h-12 bg-green-100 hover:bg-green-200 text-green-900 border-green-200" onClick={() => handleGrade(4)}>Easy</Button>
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
