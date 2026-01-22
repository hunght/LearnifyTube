import React, { useRef, useMemo, useEffect, useCallback, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAtom } from "jotai";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Trash2, Clock, Plus, X, Send, Camera, Square, Film } from "lucide-react";
import { trpcClient } from "@/utils/trpc";
import { toast } from "sonner";
import { transcriptSelectionAtom } from "@/context/annotations";
import { logger } from "@/helpers/logger";

interface AnnotationsSidebarProps {
  videoId: string;
  videoRef: React.RefObject<HTMLVideoElement>;
  videoTitle?: string;
  currentTime?: number;
}

// Emoji reaction types for quick note categorization
const EMOJI_REACTIONS = [
  { emoji: "❓", label: "Confused", description: "Mark as unclear or confusing" },
  { emoji: "💡", label: "Insight", description: "Important learning moment" },
  { emoji: "⭐", label: "Important", description: "Key point to remember" },
  { emoji: "🔖", label: "Bookmark", description: "Save for later review" },
] as const;

function formatTimestamp(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

// Helper to determine if note should be a flashcard
const isFlashcardContent = (text: string, hasScreenshot: boolean): boolean => {
  return text.includes("{{c1::") || hasScreenshot;
};

export function AnnotationsSidebar({
  videoId,
  videoRef,
  videoTitle: _videoTitle,
  currentTime = 0,
}: AnnotationsSidebarProps): React.JSX.Element {
  const queryClient = useQueryClient();
  const annotationRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Own annotations query
  const annotationsQuery = useQuery({
    queryKey: ["annotations", videoId],
    queryFn: async (): Promise<
      Array<{
        id: string;
        videoId: string;
        timestampSeconds: number;
        note: string;
        emoji: string | null;
        selectedText: string | null;
        createdAt: number;
        updatedAt: number | null;
      }>
    > => {
      if (!videoId) return [] as const;
      return trpcClient.annotations.list.query({ videoId });
    },
    enabled: !!videoId,
  });

  // Fetch transcript segments for context auto-fill
  const transcriptSegmentsQuery = useQuery({
    queryKey: ["transcript-segments", videoId],
    queryFn: async () => {
      if (!videoId) return { segments: [] };
      return await trpcClient.transcripts.getSegments.query({ videoId });
    },
    enabled: !!videoId,
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
  });

  // Own delete mutation
  const deleteAnnotationMutation = useMutation({
    mutationFn: async (annotationId: string) => {
      return await trpcClient.annotations.delete.mutate({ id: annotationId });
    },
    onSuccess: (): void => {
      queryClient.invalidateQueries({ queryKey: ["annotations", videoId] });
    },
  });

  // Own seek handler
  const handleSeek = useCallback(
    (timestampSeconds: number): void => {
      if (videoRef.current) {
        videoRef.current.currentTime = timestampSeconds;
        videoRef.current.play();
      }
    },
    [videoRef]
  );

  const annotations = annotationsQuery.data || [];

  // Find the currently active annotation (closest one before or at current time)
  const activeAnnotationId = useMemo((): string | null => {
    if (!currentTime || annotations.length === 0) return null;

    // Find all annotations at or before current time
    const passedAnnotations = annotations.filter((a): boolean => a.timestampSeconds <= currentTime);

    if (passedAnnotations.length === 0) return null;

    // Return the closest one (highest timestamp that's still <= currentTime)
    const closest = passedAnnotations.reduce((prev, current) =>
      current.timestampSeconds > prev.timestampSeconds ? current : prev
    );

    return closest.id;
  }, [annotations, currentTime]);

  const [transcriptSelection] = useAtom(transcriptSelectionAtom);
  const [note, setNote] = useState("");
  const [selectedText, setSelectedText] = useState("");
  const [emoji, setEmoji] = useState<string | null>(null);
  const [timestamp, setTimestamp] = useState(currentTime);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const [isFlashcardMode, setIsFlashcardMode] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Update form when selection changes
  useEffect(() => {
    if (transcriptSelection) {
      if (transcriptSelection.selectedText) {
        setSelectedText(transcriptSelection.selectedText);
      }
      if (transcriptSelection.currentTime !== undefined) {
        setTimestamp(transcriptSelection.currentTime);
      }
      // Focus the textarea?
      // Maybe not auto-focus to avoid stealing focus if they are just clicking around?
    }
  }, [transcriptSelection]);

  // Create mutation
  const createAnnotationMutation = useMutation({
    mutationFn: async () => {
      if (!videoId) throw new Error("Missing videoId");
      return await trpcClient.annotations.create.mutate({
        videoId,
        timestampSeconds: timestamp,
        selectedText: selectedText || undefined,
        note:
          note ||
          (screenshotPreview
            ? screenshotPreview.startsWith("data:video")
              ? "🎥 Video Loop"
              : "📸 Screenshot"
            : ""),
        emoji: emoji || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["annotations", videoId] });
      setNote("");
      setSelectedText("");
      setEmoji(null);
      // Reset timestamp to current time (dynamic tracking) or keep it fixed?
      // Better to reset to follow playback until next selection
      setTimestamp(currentTime);
      toast.success("Note saved!");
    },
    onError: (error) => {
      toast.error("Failed to save note: " + String(error));
    },
  });

  const handleSave = async (): Promise<void> => {
    if (!note.trim() && !emoji && !screenshotPreview) return;

    // Always create annotation (note)
    createAnnotationMutation.mutate();

    // If Flashcard Mode is active or content looks like a flashcard, create it
    if (isFlashcardMode || isFlashcardContent(note, !!screenshotPreview)) {
      try {
        await trpcClient.flashcards.create.mutate({
          cardType: note.includes("{{c1::") ? "cloze" : "concept", // Detect type
          frontContent: selectedText || "Video Note", // Use selected text as context/front if available
          backContent: note, // The note is the main content (or Cloze raw text)
          clozeContent: note.includes("{{c1::") ? note : undefined,
          videoId,
          timestampSeconds: timestamp,
          contextText: selectedText || undefined,
          screenshotPath: screenshotPreview || undefined,
          tags: emoji ? [emoji] : undefined,
        });
        toast.success("Flashcard created");
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("Failed to create flashcard", err);
        toast.error("Note saved, but Flashcard failed");
      }
    }

    // Clear screenshot after save
    setScreenshotPreview(null);
    setIsFlashcardMode(false);
  };

  const handleRecordToggle = async (): Promise<void> => {
    if (isRecording) {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
        setIsRecording(false);
      }
    } else {
      if (!videoRef.current) return;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/consistent-type-assertions, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        const stream = (videoRef.current as any).captureStream() as MediaStream;
        if (!stream) {
          toast.error("Browser does not support capturing from this video source.");
          return;
        }

        const recorder = new MediaRecorder(stream, { mimeType: "video/webm" });
        mediaRecorderRef.current = recorder;
        chunksRef.current = [];

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };

        recorder.onstop = () => {
          const blob = new Blob(chunksRef.current, { type: "video/webm" });
          const reader = new FileReader();
          reader.onloadend = () => {
            if (typeof reader.result === "string") {
              setScreenshotPreview(reader.result);
              setIsFlashcardMode(true);

              // Auto-insert context if selection is empty
              if (!selectedText) {
                const contextText = getContextAtCurrentTime();
                if (contextText) {
                  setSelectedText(contextText);
                  toast.success("Added context from transcript");
                }
              }

              toast.success("Loop captured!");
            }
          };
          reader.readAsDataURL(blob);
          stream.getTracks().forEach((t) => t.stop());
        };

        recorder.start();
        setIsRecording(true);
        toast.info("Recording loop... Play video!", { duration: 2000 });
        if (videoRef.current.paused) {
          videoRef.current.play().catch(() => {});
        }
      } catch (err) {
        logger.error("Recording failed", err);
        toast.error("Could not start recording.");
      }
    }
  };

  const getContextAtCurrentTime = (): string => {
    const segments = transcriptSegmentsQuery.data?.segments || [];
    if (!segments.length) return "";

    // Find segment covering current time
    const currentSegment = segments.find((s) => currentTime >= s.start && currentTime < s.end);
    if (currentSegment) return currentSegment.text;

    // Fallback: Find closest segment within 1 second
    const closest = segments.find((s) => Math.abs(s.start - currentTime) < 1);
    return closest ? closest.text : "";
  };

  const captureScreenshot = (): void => {
    if (!videoRef.current) return;
    try {
      const canvas = document.createElement("canvas");
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
        setScreenshotPreview(dataUrl);
        setIsFlashcardMode(true);

        // Auto-insert context if selection is empty
        if (!selectedText) {
          const contextText = getContextAtCurrentTime();
          if (contextText) {
            setSelectedText(contextText);
            toast.success("Added context from transcript");
          }
        }

        toast.success("Screenshot captured");
      }
    } catch (e) {
      toast.error("Screenshot failed");
    }
  };

  const handleClearSelection = (): void => {
    setSelectedText("");
    setTimestamp(currentTime);
  };

  // Keep timestamp updated if no manual selection active
  useEffect(() => {
    if (!note && !selectedText && !emoji) {
      setTimestamp(currentTime);
    }
  }, [currentTime, note, selectedText, emoji]);

  // Auto-scroll to active annotation
  useEffect((): void | (() => void) => {
    if (!activeAnnotationId) return;

    const element = annotationRefs.current.get(activeAnnotationId);
    if (element) {
      element.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [activeAnnotationId]);

  return (
    <div className="flex h-full flex-col p-3">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Notes</h2>
          <p className="text-[11px] text-muted-foreground">
            {annotations.length} {annotations.length === 1 ? "note" : "notes"}
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-full bg-muted/50 px-2 py-1 text-[11px] font-medium text-muted-foreground">
          <Clock className="h-3 w-3" />
          {formatTimestamp(timestamp)}
        </div>
      </div>

      {/* Composer Card */}
      <div className="mb-3 rounded-lg border border-border/50 bg-card/50 p-3 shadow-sm">
        {/* Selected Text Quote */}
        {selectedText && (
          <div className="relative mb-3 rounded-md bg-primary/5 p-2.5 pl-3">
            <div className="absolute left-0 top-0 h-full w-1 rounded-l-md bg-primary/40" />
            <p className="line-clamp-2 pr-6 text-xs italic text-muted-foreground">
              "{selectedText}"
            </p>
            <button
              onClick={handleClearSelection}
              className="absolute right-1.5 top-1.5 rounded-full p-1 text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}

        {/* Screenshot Preview */}
        {screenshotPreview && (
          <div className="relative mb-3 overflow-hidden rounded-md">
            {screenshotPreview.startsWith("data:video") ? (
              <video
                src={screenshotPreview}
                autoPlay
                loop
                muted
                className="max-h-[120px] w-full rounded-md object-cover"
              />
            ) : (
              <img
                src={screenshotPreview}
                alt="Screenshot"
                className="max-h-[100px] w-full rounded-md object-cover"
              />
            )}
            <button
              className="absolute right-1.5 top-1.5 rounded-full bg-black/60 p-1 text-white transition-colors hover:bg-black/80"
              onClick={() => setScreenshotPreview(null)}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}

        {/* Text Input */}
        <Textarea
          id="note-textarea"
          placeholder={selectedText ? "Add your thoughts..." : "Write a note..."}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="min-h-[60px] resize-none border-0 bg-transparent p-0 text-sm placeholder:text-muted-foreground/50 focus-visible:ring-0"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSave();
            }
          }}
        />

        {/* Divider */}
        <div className="my-2.5 h-px bg-border/50" />

        {/* Action Bar */}
        <div className="flex items-center justify-between">
          {/* Left: Emoji Tags */}
          <div className="flex items-center gap-0.5">
            {EMOJI_REACTIONS.map((reaction) => (
              <button
                key={reaction.label}
                onClick={() => setEmoji(emoji === reaction.emoji ? null : reaction.emoji)}
                className={`flex h-7 w-7 items-center justify-center rounded-md text-base transition-all hover:bg-muted ${
                  emoji === reaction.emoji ? "bg-primary/10 ring-1 ring-primary/30" : ""
                }`}
                title={reaction.description}
              >
                {reaction.emoji}
              </button>
            ))}
          </div>

          {/* Right: Tools & Submit */}
          <div className="flex items-center gap-1">
            <button
              onClick={captureScreenshot}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title="Screenshot"
            >
              <Camera className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={handleRecordToggle}
              className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
                isRecording
                  ? "animate-pulse bg-red-500/10 text-red-500"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
              title={isRecording ? "Stop" : "Record Loop"}
            >
              {isRecording ? (
                <Square className="h-3.5 w-3.5 fill-current" />
              ) : (
                <Film className="h-3.5 w-3.5" />
              )}
            </button>

            <div className="mx-1 h-5 w-px bg-border/50" />

            <Button
              size="sm"
              onClick={handleSave}
              disabled={
                (!note.trim() && !emoji && !screenshotPreview) || createAnnotationMutation.isPending
              }
              className="h-7 gap-1.5 rounded-md px-3 text-xs font-medium"
            >
              <Send className="h-3 w-3" />
              {createAnnotationMutation.isPending ? "..." : "Save"}
            </Button>
          </div>
        </div>
      </div>

      {/* Notes List */}
      <ScrollArea className="-mx-3 flex-1 px-3">
        {annotationsQuery.isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : annotations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted/50">
              <Plus className="h-5 w-5 text-muted-foreground/60" />
            </div>
            <p className="text-xs font-medium text-muted-foreground">No notes yet</p>
            <p className="mt-1 max-w-[180px] text-[11px] text-muted-foreground/60">
              Select transcript text or type above to add notes
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {annotations.map((annotation) => {
              const isActive = annotation.id === activeAnnotationId;
              return (
                <div
                  key={annotation.id}
                  ref={(el) => {
                    if (el) {
                      annotationRefs.current.set(annotation.id, el);
                    } else {
                      annotationRefs.current.delete(annotation.id);
                    }
                  }}
                  className={`group relative rounded-lg border p-3 transition-all ${
                    isActive
                      ? "border-primary/30 bg-primary/5"
                      : "border-transparent bg-muted/30 hover:border-border/50 hover:bg-muted/50"
                  }`}
                >
                  {/* Delete Button */}
                  <button
                    onClick={() => deleteAnnotationMutation.mutate(annotation.id)}
                    className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground/40 opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>

                  {/* Header: Emoji + Timestamp */}
                  <div className="mb-2 flex items-center gap-2">
                    {annotation.emoji && <span className="text-sm">{annotation.emoji}</span>}
                    <button
                      onClick={() => handleSeek(annotation.timestampSeconds)}
                      className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors ${
                        isActive
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary"
                      }`}
                    >
                      <Clock className="h-2.5 w-2.5" />
                      {formatTimestamp(annotation.timestampSeconds)}
                    </button>
                  </div>

                  {/* Selected Text */}
                  {annotation.selectedText && (
                    <div className="mb-2 border-l-2 border-primary/20 pl-2.5">
                      <p className="line-clamp-2 text-[11px] italic text-muted-foreground">
                        "{annotation.selectedText}"
                      </p>
                    </div>
                  )}

                  {/* Note Content */}
                  {annotation.note && (
                    <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-foreground/90">
                      {annotation.note}
                    </p>
                  )}

                  {/* Footer: Date */}
                  <p className="mt-2 text-[10px] text-muted-foreground/50">
                    {new Date(annotation.createdAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                    {" · "}
                    {new Date(annotation.createdAt).toLocaleTimeString(undefined, {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
