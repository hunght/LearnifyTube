import React from "react";
import { CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface VideoDescriptionProps {
  description: string;
  onSeek: (seconds: number) => void;
}

// Helper function to parse timestamp strings to seconds
// Supports both HH:MM:SS and MM:SS formats
function parseTimestampToSeconds(timestamp: string): number | null {
  // Try HH:MM:SS format first (e.g., 00:00:00, 1:23:45)
  const hmsMatch = timestamp.match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
  if (hmsMatch) {
    const hours = parseInt(hmsMatch[1], 10);
    const minutes = parseInt(hmsMatch[2], 10);
    const seconds = parseInt(hmsMatch[3], 10);
    return hours * 3600 + minutes * 60 + seconds;
  }

  // Try MM:SS format (e.g., 1:23, 12:34)
  const msMatch = timestamp.match(/^(\d{1,2}):(\d{2})$/);
  if (msMatch) {
    const minutes = parseInt(msMatch[1], 10);
    const seconds = parseInt(msMatch[2], 10);
    return minutes * 60 + seconds;
  }

  return null;
}

// Helper function to render description with clickable timestamps
function renderDescriptionWithTimestamps(
  description: string,
  onSeek: (seconds: number) => void
): React.ReactNode {
  // Match timestamps like 00:00:00 (HH:MM:SS) or 1:23 (MM:SS)
  // Use word boundaries to avoid matching partial timestamps
  const timestampRegex = /\b(\d{1,2}:\d{2}(?::\d{2})?)\b/g;
  const parts = description.split(timestampRegex);

  return parts.map((part, index) => {
    // Check if this part matches the timestamp pattern
    // When splitting with a capturing group, captured groups are included in the array
    if (part && /^\d{1,2}:\d{2}(?::\d{2})?$/.test(part)) {
      const seconds = parseTimestampToSeconds(part);
      if (seconds !== null) {
        return (
          <button
            key={index}
            onClick={() => onSeek(seconds)}
            className="text-primary hover:underline"
          >
            {part}
          </button>
        );
      }
    }
    return <span key={index}>{part}</span>;
  });
}

export function VideoDescription({
  description,
  onSeek,
}: VideoDescriptionProps): React.JSX.Element {
  return (
    <Collapsible className="rounded-lg border bg-card/50 shadow-sm transition-all hover:border-primary/20">
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="group flex h-auto w-full items-center justify-between px-3 py-2 hover:bg-transparent"
        >
          <div className="flex items-center gap-2">
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-primary">
              <ChevronDown className="h-3 w-3 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
            </div>
            <span className="text-xs font-semibold text-muted-foreground transition-colors group-hover:text-primary">
              Video Description
            </span>
          </div>
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <CardContent className="px-3 pb-3 pt-0">
          <div className="scrollbar-thin scrollbar-thumb-muted-foreground/20 max-h-[300px] overflow-y-auto rounded-md bg-muted/30 p-3 text-sm text-muted-foreground">
            <div className="whitespace-pre-wrap break-words leading-relaxed">
              {renderDescriptionWithTimestamps(description, onSeek)}
            </div>
          </div>
        </CardContent>
      </CollapsibleContent>
    </Collapsible>
  );
}
