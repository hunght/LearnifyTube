import React from "react";
import { useQuery } from "@tanstack/react-query";
import { trpcClient } from "@/utils/trpc";
import { BookOpen, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

type VocabularySidebarProps = {
  videoId: string;
  videoRef: React.RefObject<HTMLVideoElement>;
  videoTitle?: string;
};

export function VocabularySidebar({
  videoId,
  videoRef,
  videoTitle: _videoTitle,
}: VocabularySidebarProps): React.JSX.Element {
  const savedWordsQuery = useQuery({
    queryKey: ["translation", "savedWordsByVideo", videoId],
    queryFn: () => trpcClient.translation.getSavedWordsByVideoId.query({ videoId }),
    enabled: !!videoId,
  });

  const handleSeekToWord = (timestampSeconds: number): void => {
    if (videoRef.current) {
      videoRef.current.currentTime = timestampSeconds;
      videoRef.current.play();
    }
  };

  const formatTimestamp = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">Vocabulary</h3>
        </div>
        {savedWordsQuery.data && savedWordsQuery.data.length > 0 && (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            {savedWordsQuery.data.length} words
          </span>
        )}
      </div>

      {/* Content */}
      {savedWordsQuery.isLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : savedWordsQuery.data && savedWordsQuery.data.length > 0 ? (
        <ScrollArea className="-mx-2 flex-1 px-2">
          <div className="space-y-2 pb-4">
            {savedWordsQuery.data.map((word) => (
              <WordCard
                key={`${word.id}-${word.timestampSeconds}`}
                word={word.sourceText}
                translation={word.translatedText}
                timestamp={word.timestampSeconds}
                notes={word.notes}
                onSeek={() => handleSeekToWord(word.timestampSeconds)}
                formatTimestamp={formatTimestamp}
              />
            ))}
          </div>
        </ScrollArea>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <div className="rounded-full bg-muted p-4">
            <BookOpen className="h-8 w-8 text-muted-foreground" />
          </div>
          <div className="space-y-1">
            <p className="font-medium">No words saved yet</p>
            <p className="text-sm text-muted-foreground">
              Hover over words in the transcript and click "Save" to add them here
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

type WordCardProps = {
  word: string;
  translation: string;
  timestamp: number;
  notes: string | null;
  onSeek: () => void;
  formatTimestamp: (seconds: number) => string;
};

function WordCard({
  word,
  translation,
  timestamp,
  notes,
  onSeek,
  formatTimestamp,
}: WordCardProps): React.JSX.Element {
  return (
    <div className="group rounded-lg border bg-card p-3 transition-colors hover:bg-accent/50">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-foreground">{word}</p>
          <p className="text-sm text-muted-foreground">{translation}</p>
          {notes && <p className="mt-1 text-xs italic text-muted-foreground/70">{notes}</p>}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onSeek}
          className="h-8 shrink-0 gap-1.5 px-2 text-xs opacity-0 transition-opacity group-hover:opacity-100"
        >
          <Play className="h-3 w-3" />
          {formatTimestamp(timestamp)}
        </Button>
      </div>
    </div>
  );
}
