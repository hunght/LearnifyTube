import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { trpcClient } from "@/utils/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Trash2, TrendingUp, Clock, Loader2, BookmarkCheck, Brain } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import { VideoPlayButton } from "./VideoContextHelpers";
import { PronunciationButton } from "@/components/PronunciationButton";

export function SavedWordsTab(): React.JSX.Element {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [expandedTranslations, setExpandedTranslations] = useState<Set<string>>(new Set());

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout((): void => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return (): void => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch saved words (not all translations - only user-saved ones)
  const {
    data: savedWordsData,
    isLoading: savedWordsLoading,
    refetch: refetchSavedWords,
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
      queryClient.invalidateQueries({ queryKey: ["flashcards"] });
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
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base font-semibold">
          Saved Words {savedWordsData && savedWordsData.total > 0 && `(${savedWordsData.total})`}
        </CardTitle>
        <div className="relative w-64">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search words..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8"
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-2">
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
                          <div className="flex items-center gap-2">
                            <p className="text-xl font-bold">{translation.sourceText}</p>
                            <PronunciationButton
                              text={translation.sourceText}
                              lang={translation.sourceLang}
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 shrink-0"
                            />
                          </div>
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
                          <div className="flex items-center gap-2">
                            <p className="text-xl font-bold text-primary">
                              {translation.translatedText}
                            </p>
                            <PronunciationButton
                              text={translation.translatedText}
                              lang={translation.targetLang}
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 shrink-0"
                            />
                          </div>
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
  );
}
