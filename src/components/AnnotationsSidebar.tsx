import React, { useRef, useMemo, useEffect, useCallback, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAtom } from "jotai";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Trash2, Clock, Plus, X, Quote, Send, Camera, Square, Film } from "lucide-react";
import { trpcClient } from "@/utils/trpc";
import { toast } from "sonner";
import { transcriptSelectionAtom } from "@/context/annotations";

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
        note,
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/consistent-type-assertions
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
        console.error("Recording failed", err);
        toast.error("Could not start recording.");
      }
    }
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
        setIsFlashcardMode(true); // Auto-enable flashcard mode on screenshot
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
    <div className="flex h-full flex-col">
      <div className="mb-4">
        <h2 className="text-lg font-semibold">Notes</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {annotations.length} {annotations.length === 1 ? "note" : "notes"}
        </p>
      </div>

      {/* Add Note Section */}
      <Card className="mb-4 border bg-muted/20 shadow-sm">
        <CardContent className="space-y-3 p-3">
          {selectedText && (
            <div className="relative rounded border bg-background p-3 text-sm italic text-muted-foreground shadow-sm">
              <Quote className="absolute -left-2 -top-2 h-4 w-4 fill-primary/10 text-primary" />
              <span className="block pl-1">"{selectedText}"</span>
              <button
                onClick={handleClearSelection}
                className="absolute -right-2 -top-2 rounded-full border bg-background p-1 text-muted-foreground shadow transition-all hover:text-foreground hover:shadow-md"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}

          <div className="mb-1 flex items-center justify-between px-1 text-xs font-medium text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              {formatTimestamp(timestamp)}
            </span>
          </div>

          {screenshotPreview && (
            <div className="relative mb-2 overflow-hidden rounded-md border border-border">
              {screenshotPreview.startsWith("data:video") ? (
                <video
                  src={screenshotPreview}
                  autoPlay
                  loop
                  muted
                  className="max-h-[150px] w-full object-cover"
                />
              ) : (
                <img
                  src={screenshotPreview}
                  alt="Screenshot"
                  className="h-auto max-h-[120px] w-full object-cover"
                />
              )}
              <button
                className="absolute right-1 top-1 rounded-full bg-black/50 p-1 text-white hover:bg-black/70"
                onClick={() => setScreenshotPreview(null)}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}

          <Textarea
            id="note-textarea"
            placeholder={selectedText ? "Add a thought..." : "Type a note at current time..."}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="min-h-[80px] resize-none border-input/50 bg-background text-sm shadow-sm focus-visible:ring-1 focus-visible:ring-primary/30"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSave();
              }
            }}
          />

          <div className="flex items-center justify-between pt-1">
            <div className="flex gap-1.5">
              {EMOJI_REACTIONS.map((reaction) => (
                <button
                  key={reaction.label}
                  onClick={() => setEmoji(emoji === reaction.emoji ? null : reaction.emoji)}
                  className={`rounded-md p-1.5 transition-all hover:scale-105 hover:bg-muted-foreground/10 active:scale-95 ${
                    emoji === reaction.emoji
                      ? "bg-primary/10 text-primary ring-1 ring-primary/30"
                      : "text-muted-foreground"
                  }`}
                  title={reaction.label}
                >
                  <span className="text-lg leading-none drop-shadow-sm filter">
                    {reaction.emoji}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Tools */}
            <button
              onClick={captureScreenshot}
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title="Capture Screenshot"
            >
              <Camera className="h-4 w-4" />
            </button>
            <button
              onClick={handleRecordToggle}
              className={`rounded-md p-1.5 transition-colors ${isRecording ? "animate-pulse bg-destructive text-destructive-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
              title={isRecording ? "Stop Recording" : "Record Video Loop"}
            >
              {isRecording ? (
                <Square className="h-4 w-4 fill-current" />
              ) : (
                <Film className="h-4 w-4" />
              )}
            </button>

            <div className="mx-1 h-4 w-[1px] bg-border" />

            <Button
              size="sm"
              onClick={handleSave}
              disabled={
                (!note.trim() && !emoji && !screenshotPreview) || createAnnotationMutation.isPending
              }
              className="gap-2 shadow-sm transition-all active:scale-95"
            >
              {createAnnotationMutation.isPending
                ? "Saving..."
                : isFlashcardMode
                  ? "Add Note & Card"
                  : "Add Note"}
              <Send className="h-3.5 w-3.5" />
            </Button>
          </div>
        </CardContent>
      </Card>

      <ScrollArea className="flex-1">
        {annotationsQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading notes...</p>
        ) : annotations.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Plus className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="mb-1 text-sm font-medium">No notes yet</h3>
            <p className="text-xs text-muted-foreground">
              Select text in the transcript to add a specific note, or just type above to catch a
              thought.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {annotations.map((annotation) => {
              const isActive = annotation.id === activeAnnotationId;
              return (
                <Card
                  key={annotation.id}
                  ref={(el) => {
                    if (el) {
                      annotationRefs.current.set(annotation.id, el);
                    } else {
                      annotationRefs.current.delete(annotation.id);
                    }
                  }}
                  className={`group border transition-all duration-200 hover:shadow-md ${
                    isActive
                      ? "border-primary/20 bg-primary/5 shadow-sm"
                      : "bg-card hover:border-primary/20"
                  }`}
                >
                  <CardContent className="space-y-2.5 p-3.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {annotation.emoji && (
                          <span
                            className="text-lg leading-none drop-shadow-sm filter"
                            title="Category"
                          >
                            {annotation.emoji}
                          </span>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleSeek(annotation.timestampSeconds)}
                          className={`flex h-auto items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium transition-colors ${
                            isActive
                              ? "bg-primary text-primary-foreground hover:bg-primary/90"
                              : "bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary"
                          }`}
                        >
                          <Clock className="h-3 w-3" />
                          {formatTimestamp(annotation.timestampSeconds)}
                        </Button>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteAnnotationMutation.mutate(annotation.id)}
                        className="h-6 w-6 text-muted-foreground opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>

                    {annotation.selectedText && (
                      <div className="relative border-l-2 border-primary/20 py-0.5 pl-3">
                        <p className="line-clamp-3 text-xs italic leading-relaxed text-muted-foreground">
                          "{annotation.selectedText}"
                        </p>
                      </div>
                    )}

                    {annotation.note && (
                      <p className="whitespace-pre-wrap break-words text-sm font-normal leading-relaxed text-foreground/90">
                        {annotation.note}
                      </p>
                    )}

                    <div className="flex items-center justify-between pt-1">
                      <p className="text-[10px] font-medium text-muted-foreground/60">
                        {new Date(annotation.createdAt).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })}
                        {" • "}
                        {new Date(annotation.createdAt).toLocaleTimeString(undefined, {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
