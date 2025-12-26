import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { trpcClient } from "@/utils/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Search,
  Trash2,
  TrendingUp,
  Clock,
  Loader2,
  BookmarkCheck,
  Brain,
  RefreshCw,
  Play,
  Video,
  X,
  GraduationCap,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import { useNavigate } from "@tanstack/react-router";
import Thumbnail from "@/components/Thumbnail";
import { StudyMode } from "@/pages/learn/StudyMode";

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
function VideoPlayButton({
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

export default function MyWordsPage(): React.JSX.Element {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [expandedTranslations, setExpandedTranslations] = useState<Set<string>>(new Set());
  const [isStudyMode, setIsStudyMode] = useState(false);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout((): void => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return (): void => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch due flashcards for study
  const { data: dueCards } = useQuery({
    queryKey: ["flashcards", "due"],
    queryFn: async () => await trpcClient.flashcards.getDue.query(),
  });

  const dueCount = dueCards?.length || 0;

  // Fetch saved words (not all translations - only user-saved ones)
  const {
    data: savedWordsData,
    isLoading: savedWordsLoading,
    refetch: refetchSavedWords,
    isFetching,
  } = useQuery({
    queryKey: ["saved-words"],
    queryFn: async () =>
      trpcClient.translation.getSavedWords.query({
        limit: 100,
        offset: 0,
      }),
  });

  // Search all translations (includes saved and unsaved)
  const { data: searchResults, isLoading: searchLoading } = useQuery({
    queryKey: ["translation-search", debouncedSearch],
    queryFn: async () => {
      if (!debouncedSearch) return [];
      return trpcClient.translation.searchTranslations.query({ query: debouncedSearch });
    },
    enabled: debouncedSearch.length > 0,
  });

  const handleDelete = async (translationId: string): Promise<void> => {
    try {
      // Only remove from saved_words, keep in translation_cache for future use
      await trpcClient.translation.unsaveWord.mutate({ translationId });
      refetchSavedWords();
    } catch (error) {
      // Error handling via UI toast
    }
  };

  const createFlashcardMutation = useMutation({
    mutationFn: async (translationId: string) => {
      return await trpcClient.flashcards.create.mutate({ translationId });
    },
    onSuccess: () => {
      toast({
        title: "Flashcard Created",
        description: "Word added to your flashcard deck.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to create flashcard: " + error.message,
        variant: "destructive",
      });
    },
  });

  const handleAddToFlashcard = (translationId: string): void => {
    createFlashcardMutation.mutate(translationId);
  };

  const toggleExpanded = (translationId: string): void => {
    setExpandedTranslations((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(translationId)) {
        newSet.delete(translationId);
      } else {
        newSet.add(translationId);
      }
      return newSet;
    });
  };

  const handleRefresh = (): void => {
    refetchSavedWords();
  };

  // Format saved words to match the expected structure
  const savedWords =
    savedWordsData?.words.map((w) => ({
      ...w.translation,
      savedWordId: w.id,
      notes: w.notes,
      reviewCount: w.reviewCount,
      lastReviewedAt: w.lastReviewedAt,
      savedAt: w.createdAt,
    })) || [];

  const displayTranslations = debouncedSearch ? searchResults || [] : savedWords;

  const isLoading = debouncedSearch ? searchLoading : savedWordsLoading;

  return (
    <div className="container mx-auto space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-3xl font-bold">My Words</h1>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search words..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-64 pl-9"
            />
          </div>
          {searchQuery && (
            <Button variant="ghost" size="sm" onClick={() => setSearchQuery("")}>
              Clear
            </Button>
          )}
          <Button
            onClick={handleRefresh}
            disabled={isFetching}
            size="sm"
            variant="outline"
            className="flex items-center gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            onClick={() => setIsStudyMode(true)}
            disabled={dueCount === 0}
            size="sm"
            className="flex items-center gap-2"
          >
            <GraduationCap className="h-4 w-4" />
            Study Now {dueCount > 0 && `(${dueCount})`}
          </Button>
        </div>
      </div>

      {/* Study Mode Dialog */}
      <Dialog open={isStudyMode} onOpenChange={setIsStudyMode}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GraduationCap className="h-5 w-5" />
              Flashcard Study
            </DialogTitle>
          </DialogHeader>
          {dueCards && dueCards.length > 0 ? (
            <StudyMode
              cards={dueCards}
              onComplete={() => {
                setIsStudyMode(false);
                queryClient.invalidateQueries({ queryKey: ["flashcards"] });
              }}
            />
          ) : (
            <div className="flex flex-col items-center justify-center space-y-4 py-12 text-center text-muted-foreground">
              <Brain className="h-12 w-12 opacity-50" />
              <div className="space-y-2">
                <h3 className="text-xl font-semibold">No cards due for review</h3>
                <p className="text-sm">
                  You're all caught up! Add words to flashcards by clicking the brain icon on word
                  cards.
                </p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Words List Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Saved Words {savedWordsData && savedWordsData.total > 0 && `(${savedWordsData.total})`}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Translations List */}
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : displayTranslations.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              {debouncedSearch ? (
                <p>No saved words found for "{debouncedSearch}"</p>
              ) : (
                <div className="space-y-2">
                  <p>No saved words yet.</p>
                  <p className="text-sm">
                    Hover over words in video transcripts for 800ms and click "Save to My Words" to
                    build your vocabulary!
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {displayTranslations.map((translation) => {
                const isFlipped = expandedTranslations.has(translation.id);
                const hasNotes =
                  "notes" in translation &&
                  typeof translation.notes === "string" &&
                  translation.notes;

                return (
                  <div
                    key={translation.id}
                    className="perspective-1000 group h-48 cursor-pointer"
                    onClick={() => toggleExpanded(translation.id)}
                  >
                    <div
                      className={`transform-style-3d relative h-full w-full transition-transform duration-500 ${
                        isFlipped ? "rotate-y-180" : ""
                      }`}
                      style={{
                        transformStyle: "preserve-3d",
                        transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)",
                      }}
                    >
                      {/* Front of card - Source word */}
                      <div
                        className="backface-hidden absolute inset-0 rounded-lg border bg-card p-4"
                        style={{ backfaceVisibility: "hidden" }}
                      >
                        <div className="flex h-full flex-col justify-between">
                          <div>
                            <div className="mb-2 flex items-center gap-2">
                              <Badge variant="outline" className="text-xs">
                                {translation.sourceLang.toUpperCase()}
                              </Badge>
                              <BookmarkCheck className="h-4 w-4 text-blue-500" />
                            </div>
                            <p className="text-xl font-bold">{translation.sourceText}</p>
                          </div>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <TrendingUp className="h-3 w-3" />
                              <span>{translation.queryCount}x</span>
                            </div>
                            <span className="text-xs text-muted-foreground">Click to flip</span>
                          </div>
                        </div>
                      </div>

                      {/* Back of card - Translation */}
                      <div
                        className="backface-hidden absolute inset-0 rounded-lg border bg-primary/5 p-4"
                        style={{
                          backfaceVisibility: "hidden",
                          transform: "rotateY(180deg)",
                        }}
                      >
                        <div className="flex h-full flex-col justify-between">
                          <div>
                            <div className="mb-2 flex items-center gap-2">
                              <Badge variant="outline" className="text-xs">
                                {translation.targetLang.toUpperCase()}
                              </Badge>
                            </div>
                            <p className="text-xl font-bold text-primary">
                              {translation.translatedText}
                            </p>
                            {hasNotes && (
                              <p className="mt-2 line-clamp-2 text-sm italic text-muted-foreground">
                                {String(translation.notes)}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              <span>
                                {formatDistanceToNow(
                                  new Date(
                                    "savedAt" in translation &&
                                    typeof translation.savedAt === "number"
                                      ? translation.savedAt
                                      : translation.createdAt
                                  ),
                                  { addSuffix: true }
                                )}
                              </span>
                            </div>
                            <div className="flex gap-1">
                              <VideoPlayButton
                                translationId={translation.id}
                                sourceText={translation.sourceText}
                              />
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleAddToFlashcard(translation.id);
                                }}
                                title="Add to Flashcards"
                                disabled={createFlashcardMutation.isPending}
                              >
                                <Brain className="h-4 w-4 text-primary" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDelete(translation.id);
                                }}
                                title="Remove from My Words"
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Load More */}
          {!debouncedSearch && savedWordsData?.hasMore && (
            <div className="flex justify-center pt-4">
              <Button variant="outline">Load More</Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
