import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { trpcClient } from "@/utils/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Loader2,
  Sparkles,
  RefreshCw,
  Clock,
  ChevronRight,
  BookmarkPlus,
  Check,
  ChevronDown,
} from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useAtom } from "jotai";
import { translationTargetLangAtom } from "@/context/transcriptSettings";

interface AISummarySidebarProps {
  videoId: string;
  videoRef: React.RefObject<HTMLVideoElement>;
  videoTitle?: string;
  videoDescription?: string;
}

interface Section {
  title: string;
  summary: string;
  startTime?: string;
}

interface VocabularyItem {
  word: string;
  definition: string;
}

interface DetailedSummary {
  overview: string;
  sections: Section[];
  keyTakeaways: string[];
  vocabulary: string[] | VocabularyItem[]; // Support both old and new formats
}

type SummaryType = "quick" | "detailed" | "key_points";

const isDetailedSummary = (summary: unknown): summary is DetailedSummary => {
  if (!summary || typeof summary !== "object") {
    return false;
  }

  // Use type narrowing with 'in' operator instead of type assertions
  const hasOverview = "overview" in summary && typeof summary.overview === "string";
  const hasSections = "sections" in summary && Array.isArray(summary.sections);
  const hasKeyTakeaways = "keyTakeaways" in summary && Array.isArray(summary.keyTakeaways);
  const hasVocabulary = "vocabulary" in summary && Array.isArray(summary.vocabulary);

  return hasOverview && hasSections && hasKeyTakeaways && hasVocabulary;
};

// Helper function to parse timestamp strings to seconds
function parseTimestampToSeconds(timestamp: string): number {
  const parts = timestamp.split(":").map(Number);
  if (parts.length === 3) {
    // HH:MM:SS
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    // MM:SS
    return parts[0] * 60 + parts[1];
  }
  return 0;
}

// Helper function to render description with clickable timestamps
function renderDescriptionWithTimestamps(
  description: string,
  onSeek: (seconds: number) => void
): React.ReactNode {
  // Regex to match timestamps like 00:00, 03:44, 01:14:43
  const timestampRegex = /\b(\d{1,2}:\d{2}(?::\d{2})?)\b/g;

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;

  while ((match = timestampRegex.exec(description)) !== null) {
    const timestamp = match[1];
    const matchIndex = match.index;

    // Add text before timestamp
    if (matchIndex > lastIndex) {
      parts.push(description.substring(lastIndex, matchIndex));
    }

    // Add clickable timestamp
    const seconds = parseTimestampToSeconds(timestamp);
    parts.push(
      <button
        key={`timestamp-${matchIndex}`}
        onClick={(e): void => {
          e.preventDefault();
          onSeek(seconds);
        }}
        className="inline-flex cursor-pointer items-center gap-0.5 font-medium text-primary hover:text-primary/80 hover:underline"
      >
        <Clock className="inline h-3 w-3" />
        {timestamp}
      </button>
    );

    lastIndex = matchIndex + timestamp.length;
  }

  // Add remaining text
  if (lastIndex < description.length) {
    parts.push(description.substring(lastIndex));
  }

  return parts.length > 0 ? parts : description;
}

export function AISummarySidebar({
  videoId,
  videoRef,
  videoTitle,
  videoDescription,
}: AISummarySidebarProps): React.JSX.Element {
  // Always use detailed summary
  const summaryType: SummaryType = "detailed";

  const queryClient = useQueryClient();

  // Check for cached summary on mount
  const summaryQuery = useQuery({
    queryKey: ["ai-summary", videoId, summaryType],
    queryFn: async () => {
      return await trpcClient.ai.getSummary.query({ videoId, type: summaryType });
    },
    staleTime: Infinity,
  });

  // Generate summary mutation
  const summarizeMutation = useMutation({
    mutationFn: async ({
      videoId,
      type,
      forceRegenerate,
    }: {
      videoId: string;
      type: SummaryType;
      forceRegenerate?: boolean;
    }) => {
      return await trpcClient.ai.summarize.mutate({ videoId, type, forceRegenerate });
    },
    onSuccess: (data) => {
      // Update the query cache with the new result
      queryClient.setQueryData(["ai-summary", videoId, summaryType], data);
    },
  });

  const handleGenerate = (): void => {
    // If there's already a summary, this is a regenerate request
    const forceRegenerate = summaryData?.success === true;
    summarizeMutation.mutate({ videoId, type: summaryType, forceRegenerate });
  };

  const seekToTimestamp = (timestamp: string | number): void => {
    if (!videoRef.current) return;

    let seconds = 0;
    if (typeof timestamp === "string") {
      // Parse timestamp like "2:30" or "1:23:45"
      const parts = timestamp.split(":").map(Number);
      if (parts.length === 3) {
        seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
      } else if (parts.length === 2) {
        seconds = parts[0] * 60 + parts[1];
      } else {
        seconds = parts[0];
      }
    } else {
      seconds = timestamp;
    }

    videoRef.current.currentTime = seconds;
    videoRef.current.play();
  };

  const isLoading = summarizeMutation.isPending || summaryQuery.isLoading;
  const summaryData = summarizeMutation.data || summaryQuery.data;
  const error = summarizeMutation.error;

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">AI Summary</h2>
      </div>

      {videoTitle && (
        <p className="mb-4 line-clamp-2 text-sm text-muted-foreground">{videoTitle}</p>
      )}

      {/* Video Description - Collapsible */}
      {videoDescription && (
        <Collapsible className="mb-4">
          <Card className="border-none bg-transparent shadow-none">
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="group mb-1 flex h-auto w-full items-center justify-between p-0 hover:bg-transparent hover:text-primary"
              >
                <span className="text-xs font-semibold text-muted-foreground transition-colors group-hover:text-primary">
                  Video Info
                </span>
                <ChevronDown className="h-3 w-3 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
                <div className="max-h-[150px] overflow-y-auto pr-1">
                  <div className="whitespace-pre-wrap break-words leading-relaxed">
                    {renderDescriptionWithTimestamps(videoDescription, seekToTimestamp)}
                  </div>
                </div>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      )}

      <ScrollArea className="flex-1 px-1">
        <Button
          onClick={handleGenerate}
          disabled={isLoading}
          className="mb-4 w-full"
          variant={summaryData?.success ? "outline" : "default"}
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Generating...
            </>
          ) : summaryData?.success ? (
            <>
              <RefreshCw className="mr-2 h-4 w-4" />
              Regenerate
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-4 w-4" />
              Generate Summary
            </>
          )}
        </Button>

        {error && (
          <Card className="mb-4 border-destructive/50 bg-destructive/10">
            <CardContent className="p-3">
              <p className="text-sm text-destructive">
                {error instanceof Error ? error.message : "Failed to generate summary"}
              </p>
            </CardContent>
          </Card>
        )}

        {summaryData?.success === false && "error" in summaryData && (
          <Card className="mb-4 border-amber-500/50 bg-amber-500/10">
            <CardContent className="p-3">
              <p className="text-sm text-amber-700 dark:text-amber-300">{summaryData.error}</p>
            </CardContent>
          </Card>
        )}

        {summaryData?.success &&
          "summary" in summaryData &&
          isDetailedSummary(summaryData.summary) && (
            <DetailedSummaryView
              summary={summaryData.summary}
              onSeek={seekToTimestamp}
              videoId={videoId}
            />
          )}

        {!summaryData && !isLoading && (
          <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
            <Sparkles className="mb-2 h-8 w-8 opacity-50" />
            <p className="text-sm">Click "Generate Summary" to create a detailed AI summary.</p>
            <p className="mt-2 text-xs opacity-75">The summary will be cached for future views.</p>
          </div>
        )}

        {summaryData && "cached" in summaryData && summaryData.cached && (
          <p className="mt-2 text-center text-xs text-muted-foreground">✨ Using cached summary</p>
        )}
      </ScrollArea>
    </div>
  );
}

// Helper function to normalize vocabulary to new format
function normalizeVocabulary(vocabulary: string[] | VocabularyItem[]): VocabularyItem[] {
  if (!vocabulary || vocabulary.length === 0) return [];

  // Check if it's the old format (array of strings)
  const firstItem = vocabulary[0];
  if (typeof firstItem === "string") {
    return vocabulary
      .map((word) => {
        if (typeof word === "string") {
          return {
            word,
            definition: "No definition available (regenerate summary for definitions)",
          };
        }
        return null;
      })
      .filter((item): item is VocabularyItem => item !== null);
  }

  // Type guard: check if it's VocabularyItem[]
  if (firstItem && typeof firstItem === "object" && "word" in firstItem) {
    return vocabulary.filter((v): v is VocabularyItem => {
      if (v === null || typeof v !== "object") {
        return false;
      }
      if (!("word" in v)) {
        return false;
      }
      // Use type narrowing with 'in' operator
      const wordValue = "word" in v ? v.word : undefined;
      return typeof wordValue === "string";
    });
  }

  return [];
}

// Vocabulary Card Component
function VocabularyCard({
  item,
  videoId,
}: {
  item: VocabularyItem;
  videoId: string;
}): React.JSX.Element {
  const [isSaved, setIsSaved] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const [translationTargetLang] = useAtom(translationTargetLangAtom);

  const handleSaveToMyWords = async (): Promise<void> => {
    setIsLoading(true);
    try {
      // First, translate the word to get it into the translation cache
      // We'll use the user's preferred language from preferences
      const translateResult = await trpcClient.utils.translateText.query({
        videoId, // Pass the actual video ID
        text: item.word,
        timestampSeconds: 0, // Not tied to a specific timestamp
        targetLang: translationTargetLang,
        sourceLang: "auto",
      });

      if (translateResult.success && translateResult.translationId) {
        // Now save to My Words with the definition as notes
        await trpcClient.translation.saveWord.mutate({
          translationId: translateResult.translationId,
          notes: item.definition, // Save the definition as notes
        });

        setIsSaved(true);
      }
    } catch (error) {
      // Silently fail - error handling can be added via toast if needed
      // Error is already handled by the mutation's onError if needed
      void error;
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="rounded-lg border bg-card p-3 transition-colors hover:bg-accent/50">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 space-y-1">
          <h4 className="text-sm font-semibold">{item.word}</h4>
          <p className="text-xs leading-relaxed text-muted-foreground">{item.definition}</p>
        </div>
        <Button
          size="sm"
          variant={isSaved ? "secondary" : "ghost"}
          onClick={handleSaveToMyWords}
          disabled={isLoading || isSaved}
          className="flex-shrink-0"
          title={isSaved ? "Saved to My Words" : "Add to My Words"}
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : isSaved ? (
            <>
              <Check className="mr-1 h-4 w-4" />
              Saved
            </>
          ) : (
            <>
              <BookmarkPlus className="mr-1 h-4 w-4" />
              Save
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

// Detailed Summary View
function DetailedSummaryView({
  summary,
  onSeek,
  videoId,
}: {
  summary: DetailedSummary;
  onSeek: (timestamp: string) => void;
  videoId: string;
}): React.JSX.Element {
  return (
    <div className="space-y-4">
      {/* Overview */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Overview</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-sm leading-relaxed text-muted-foreground">{summary.overview}</p>
        </CardContent>
      </Card>

      {/* Sections */}
      {summary.sections && summary.sections.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Sections</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            {summary.sections.map((section, idx) => (
              <div key={idx} className="border-l-2 border-primary/30 pl-3">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-medium">{section.title}</h4>
                  {section.startTime && (
                    <button
                      onClick={() => onSeek(section.startTime!)}
                      className="flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary hover:bg-primary/20"
                    >
                      <Clock className="h-3 w-3" />
                      {section.startTime}
                    </button>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{section.summary}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Key Takeaways */}
      {summary.keyTakeaways && summary.keyTakeaways.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Key Takeaways</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ul className="space-y-2">
              {summary.keyTakeaways.map((takeaway, idx) => (
                <li key={idx} className="flex items-start gap-2 text-sm">
                  <ChevronRight className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
                  <span>{takeaway}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Vocabulary */}
      {summary.vocabulary && summary.vocabulary.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Key Vocabulary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            {normalizeVocabulary(summary.vocabulary).map((item, idx) => (
              <VocabularyCard key={idx} item={item} videoId={videoId} />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
