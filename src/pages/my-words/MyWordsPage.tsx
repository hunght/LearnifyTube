import React, { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { trpcClient } from "@/utils/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Search,
  Trash2,
  TrendingUp,
  Clock,
  Languages,
  BarChart3,
  Loader2,
  Play,
  ChevronDown,
  ChevronUp,
  Video,
  BookmarkCheck,
  Brain,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import { useNavigate } from "@tanstack/react-router";
import Thumbnail from "@/components/Thumbnail";

export default function MyWordsPage(): React.JSX.Element {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [expandedTranslations, setExpandedTranslations] = useState<Set<string>>(new Set());

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
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

  // Fetch statistics
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["translation-statistics"],
    queryFn: async () => trpcClient.translation.getStatistics.query(),
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

  interface FlashcardInput {
    front: string;
    back: string;
    videoId?: string;
    context?: string;
    timestamp?: number;
  }

  interface TranslationItem {
    id: string;
    sourceText: string;
    translatedText: string;
    sourceLang: string;
    targetLang: string;
    queryCount: number;
    createdAt: string | number;
    detectedLang?: string | null;
    notes?: string;
    savedAt?: number;
    reviewCount?: number;
    lastReviewedAt?: string | null;
    savedWordId?: string;
  }

  const createFlashcardMutation = useMutation({
    mutationFn: async (data: FlashcardInput) => {
      return await trpcClient.flashcards.create.mutate(data);
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

  const handleAddToFlashcard = async (translation: TranslationItem): Promise<void> => {
    try {
      // 1. Try to find context for this word
      const contexts = await trpcClient.translation.getTranslationContexts.query({
        translationId: translation.id,
      });

      const bestContext = contexts && contexts.length > 0 ? contexts[0] : null;

      createFlashcardMutation.mutate({
        front: translation.sourceText,
        back: translation.translatedText,
        // Optional context data
        videoId: bestContext?.videoId,
        context: bestContext?.contextText || undefined,
        timestamp: bestContext?.timestampSeconds,
        // Audio URL if we had it (translation structure might need update later for TTS)
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      toast({
        title: "Error",
        description: `Could not prepare flashcard data: ${errorMessage}`,
        variant: "destructive",
      });
    }
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

  const handlePlayFromContext = (videoId: string, _timestampSeconds: number): void => {
    navigate({
      to: "/player",
      search: {
        videoId,
        playlistId: undefined,
        playlistIndex: undefined,
      },
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

  // Helper component to show video contexts for a translation
  const VideoContexts = ({
    translationId,
  }: {
    translationId: string;
  }): React.JSX.Element | null => {
    const { data: contexts, isLoading: contextsLoading } = useQuery({
      queryKey: ["translation-contexts", translationId],
      queryFn: async () => trpcClient.translation.getTranslationContexts.query({ translationId }),
      enabled: expandedTranslations.has(translationId),
    });

    if (!expandedTranslations.has(translationId)) return null;

    if (contextsLoading) {
      return (
        <div className="mt-3 flex items-center justify-center border-t py-4">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      );
    }

    if (!contexts || contexts.length === 0) {
      return (
        <div className="mt-3 border-t pt-3">
          <p className="py-2 text-center text-sm text-muted-foreground">
            No video contexts found. This word will be linked to videos when you translate it while
            watching.
          </p>
        </div>
      );
    }

    return (
      <div className="mt-3 space-y-2 border-t pt-3">
        <div className="mb-2 flex items-center gap-2">
          <Video className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">
            Found in {contexts.length} video{contexts.length !== 1 ? "s" : ""}
          </span>
        </div>

        <div className="space-y-2">
          {contexts.map((context) => (
            <div
              key={context.id}
              className="flex items-center gap-3 rounded-md border p-2 transition-colors hover:bg-accent"
            >
              {/* Video Thumbnail */}
              <div className="w-24 flex-shrink-0">
                <Thumbnail
                  thumbnailPath={context.videoThumbnailPath}
                  thumbnailUrl={context.videoThumbnailUrl}
                  alt={context.videoTitle || "Video"}
                  className="aspect-video w-full rounded object-cover"
                />
              </div>

              {/* Video Info */}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {context.videoTitle || context.videoId}
                </p>
                <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  <span>
                    {Math.floor(context.timestampSeconds / 60)}:
                    {String(context.timestampSeconds % 60).padStart(2, "0")}
                  </span>
                  {context.contextText && <span className="truncate">• {context.contextText}</span>}
                </div>
              </div>

              {/* Play Button */}
              <Button
                size="sm"
                variant="default"
                className="flex-shrink-0"
                onClick={() => handlePlayFromContext(context.videoId, context.timestampSeconds)}
              >
                <Play className="mr-1 h-3 w-3" />
                Play
              </Button>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="container mx-auto space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">My Words</h1>
          <p className="text-muted-foreground">
            Your personal vocabulary learning list - words you've saved for study
          </p>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Saved Words</CardTitle>
            <Languages className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {savedWordsLoading ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                savedWordsData?.total || 0
              )}
            </div>
            <p className="text-xs text-muted-foreground">Words in your learning list</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Queries</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {statsLoading ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                stats?.totalQueries || 0
              )}
            </div>
            <p className="text-xs text-muted-foreground">Times you looked up words</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Language Pairs</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {statsLoading ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                stats?.uniqueLanguagePairs || 0
              )}
            </div>
            <p className="text-xs text-muted-foreground">Different language combinations</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Most Frequent</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="truncate text-lg font-bold">
              {statsLoading ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : stats?.mostFrequent ? (
                stats.mostFrequent.sourceText
              ) : (
                "—"
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {stats?.mostFrequent ? `${stats.mostFrequent.queryCount} times` : "No data"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Search and Filter */}
      <Card>
        <CardHeader>
          <CardTitle>Saved Words</CardTitle>
          <CardDescription>
            Your personal vocabulary learning list - words you've explicitly saved for study
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search Bar */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search saved words..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>

          {/* Info text */}
          {!debouncedSearch && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span>Showing saved words (most recent first)</span>
            </div>
          )}

          {/* Translations List */}
          <div className="space-y-2">
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
                      Hover over words in video transcripts for 800ms and click "Save to My Words"
                      to build your vocabulary!
                    </p>
                  </div>
                )}
              </div>
            ) : (
              displayTranslations.map((translation) => (
                <Card key={translation.id} className="group transition-shadow hover:shadow-md">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 space-y-2">
                        {/* Source and Target Text */}
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                          <div>
                            <div className="mb-1 flex items-center gap-2">
                              <Badge variant="outline" className="text-xs">
                                {translation.sourceLang.toUpperCase()}
                              </Badge>
                              <span className="text-xs text-muted-foreground">Source</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <p className="font-medium">{translation.sourceText}</p>
                              <BookmarkCheck className="h-4 w-4 flex-shrink-0 text-blue-500" />
                            </div>
                          </div>

                          <div>
                            <div className="mb-1 flex items-center gap-2">
                              <Badge variant="outline" className="text-xs">
                                {translation.targetLang.toUpperCase()}
                              </Badge>
                              <span className="text-xs text-muted-foreground">Translation</span>
                            </div>
                            <p className="font-medium text-primary">{translation.translatedText}</p>
                          </div>
                        </div>

                        {/* Notes (if any) */}
                        {"notes" in translation &&
                          typeof translation.notes === "string" &&
                          translation.notes && (
                            <div className="border-t pt-2">
                              <p className="mb-1 text-xs text-muted-foreground">Notes:</p>
                              <p className="text-sm italic">{translation.notes}</p>
                            </div>
                          )}

                        {/* Metadata */}
                        <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <TrendingUp className="h-3 w-3" />
                            <span>
                              {translation.queryCount}{" "}
                              {translation.queryCount === 1 ? "query" : "queries"}
                            </span>
                          </div>

                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            <span>
                              Saved{" "}
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

                          {translation.detectedLang &&
                            translation.detectedLang !== translation.sourceLang && (
                              <div className="flex items-center gap-1">
                                <Languages className="h-3 w-3" />
                                <span>Detected as {translation.detectedLang}</span>
                              </div>
                            )}
                        </div>

                        {/* Show in Videos Button */}
                        <div className="pt-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleExpanded(translation.id)}
                            className="gap-1"
                          >
                            {expandedTranslations.has(translation.id) ? (
                              <>
                                <ChevronUp className="h-4 w-4" />
                                Hide Videos
                              </>
                            ) : (
                              <>
                                <ChevronDown className="h-4 w-4" />
                                Show in Videos
                              </>
                            )}
                          </Button>
                        </div>

                        {/* Video Contexts */}
                        <VideoContexts translationId={translation.id} />
                      </div>

                      {/* Actions */}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(translation.id)}
                        className="opacity-0 transition-opacity group-hover:opacity-100"
                        title="Remove from My Words (keeps in cache)"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>

                      {/* Add to Flashcard */}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleAddToFlashcard(translation)}
                        className="opacity-0 transition-opacity group-hover:opacity-100"
                        title="Add to Flashcards"
                        disabled={createFlashcardMutation.isPending}
                      >
                        <Brain className="h-4 w-4 text-primary" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>

          {/* Load More */}
          {!debouncedSearch && savedWordsData?.hasMore && (
            <div className="pt-4 text-center">
              <Button variant="outline">Load More</Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
