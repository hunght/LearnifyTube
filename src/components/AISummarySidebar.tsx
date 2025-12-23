import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { trpcClient } from "@/utils/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Sparkles, RefreshCw, Clock, ChevronRight } from "lucide-react";

interface AISummarySidebarProps {
  videoId: string;
  videoRef: React.RefObject<HTMLVideoElement>;
  videoTitle?: string;
}

interface Section {
  title: string;
  summary: string;
  startTime?: string;
}

interface DetailedSummary {
  overview: string;
  sections: Section[];
  keyTakeaways: string[];
  vocabulary: string[];
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

export function AISummarySidebar({
  videoId,
  videoRef,
  videoTitle,
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
    mutationFn: async (type: SummaryType) => {
      return await trpcClient.ai.summarize.mutate({ videoId, type });
    },
    onSuccess: (data) => {
      // Update the query cache with the new result
      queryClient.setQueryData(["ai-summary", videoId, summaryType], data);
    },
  });

  const handleGenerate = (): void => {
    summarizeMutation.mutate(summaryType);
  };

  const seekToTimestamp = (timestamp: string): void => {
    if (!videoRef.current) return;

    // Parse timestamp like "2:30" or "1:23:45"
    const parts = timestamp.split(":").map(Number);
    let seconds = 0;
    if (parts.length === 3) {
      seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
    } else if (parts.length === 2) {
      seconds = parts[0] * 60 + parts[1];
    } else {
      seconds = parts[0];
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
            <DetailedSummaryView summary={summaryData.summary} onSeek={seekToTimestamp} />
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

// Detailed Summary View
function DetailedSummaryView({
  summary,
  onSeek,
}: {
  summary: DetailedSummary;
  onSeek: (timestamp: string) => void;
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
          <CardContent className="pt-0">
            <div className="flex flex-wrap gap-2">
              {summary.vocabulary.map((word, idx) => (
                <span key={idx} className="rounded-full bg-secondary px-2 py-1 text-xs font-medium">
                  {word}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
