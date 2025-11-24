import React, { useMemo, useState, useEffect } from "react";
import { useAtom } from "jotai";
import { Clock, Languages, Loader2, BookmarkPlus, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { trpcClient } from "@/utils/trpc";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  translationTargetLangAtom,
  includeTranslationInNoteAtom,
  currentTranscriptLangAtom,
} from "@/context/transcriptSettings";
import { toast } from "sonner";
import { openAnnotationFormAtom } from "@/context/annotations";
import { PlaybackData } from "@/context/playerStore";

interface AnnotationFormProps {
  videoId: string;
  videoRef: React.RefObject<HTMLVideoElement> | null;
  currentTime: number;
  playbackData?: PlaybackData | null; // optional if needed later
}

// Emoji reaction types for quick note categorization
const EMOJI_REACTIONS = [
  { emoji: "❓", label: "Confused", description: "Mark as unclear or confusing" },
  { emoji: "💡", label: "Insight", description: "Important learning moment" },
  { emoji: "⭐", label: "Important", description: "Key point to remember" },
  { emoji: "🔖", label: "Bookmark", description: "Save for later review" },
] as const;

export function AnnotationForm({
  videoId,
  videoRef,
  currentTime,
}: AnnotationFormProps): React.JSX.Element {
  const queryClient = useQueryClient();

  // Atoms for settings and shared state
  const [translationTargetLang] = useAtom(translationTargetLangAtom);
  const [includeTranslationInNote] = useAtom(includeTranslationInNoteAtom);
  const [currentTranscriptLang] = useAtom(currentTranscriptLangAtom);
  const [openTrigger, setOpenTrigger] = useAtom(openAnnotationFormAtom);

  // Component owns ALL its state
  const [open, setOpen] = useState(false);
  const [selectedText, setSelectedText] = useState("");
  const [note, setNote] = useState("");
  const [emoji, setEmoji] = useState<string | null>(null);
  const [wordSaved, setWordSaved] = useState(false);
  const [timestampWhenOpened, setTimestampWhenOpened] = useState(0);

  // Listen to open trigger from other components
  useEffect(() => {
    if (openTrigger && openTrigger.trigger > 0) {
      setOpen(true);
      setSelectedText(openTrigger.selectedText || "");
      setTimestampWhenOpened(openTrigger.currentTime || currentTime);
      // Clear the trigger
      setOpenTrigger(null);
    }
  }, [openTrigger, currentTime, setOpenTrigger]);

  // Create annotation mutation
  const createAnnotationMutation = useMutation({
    mutationFn: async () => {
      if (!videoId) throw new Error("Missing videoId");
      return await trpcClient.annotations.create.mutate({
        videoId,
        timestampSeconds: timestampWhenOpened,
        selectedText: selectedText || undefined,
        note,
        emoji: emoji || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["annotations", videoId] });
      // Reset form
      setNote("");
      setSelectedText("");
      setEmoji(null);
      setOpen(false);
      toast.success("Note saved!");
    },
    onError: (error) => {
      toast.error("Failed to save note: " + String(error));
    },
  });

  // Mutation for saving word to My Words
  const saveWordMutation = useMutation({
    mutationFn: async (translationId: string) => {
      return await trpcClient.translation.saveWord.mutate({ translationId });
    },
    onSuccess: (data) => {
      setWordSaved(true);
      toast.success(data.alreadySaved ? "Word already in My Words" : "Word saved to My Words! 📚");
      queryClient.invalidateQueries({ queryKey: ["saved-words"] });
    },
    onError: (error) => {
      toast.error("Failed to save word: " + String(error));
    },
  });

  // Auto-pause video when form opens
  useEffect(() => {
    if (!videoRef || !videoRef.current) return;

    if (open) {
      // Pause video when form opens
      if (!videoRef.current.paused) {
        videoRef.current.pause();
      }
    }
  }, [open, videoRef]);

  // Handle cancel
  const handleCancel = (): void => {
    setOpen(false);
    setNote("");
    setSelectedText("");
    setEmoji(null);
    setWordSaved(false);
  };

  // Handle save with translation auto-append
  const handleSave = (): void => {
    // If setting is enabled and translation is available, append it to the note
    if (includeTranslationInNote && translationQuery.data?.success) {
      const translation = translationQuery.data.translation;
      const currentNote = note.trim();

      // Only append if translation is not already in the note
      if (currentNote && !currentNote.includes(translation)) {
        setNote(`${currentNote}\n\n→ ${translation}`);
      } else if (!currentNote) {
        setNote(`→ ${translation}`);
      }
    }

    // Save after brief delay to ensure state is updated
    setTimeout(() => {
      createAnnotationMutation.mutate();
    }, 0);
  };

  // Handle emoji selection
  const handleEmojiClick = (newEmoji: string): void => {
    setEmoji(emoji === newEmoji ? null : newEmoji);
  };

  // Determine source and target languages
  const sourceLang = useMemo(() => {
    if (!currentTranscriptLang) return undefined;
    // Extract language code (e.g., "en" from "en-US")
    return currentTranscriptLang.split("-")[0];
  }, [currentTranscriptLang]);

  const targetLang = translationTargetLang || "en"; // Use user preference or default to English

  // Reset wordSaved state when dialog closes or text changes
  useEffect(() => {
    if (!open) {
      setWordSaved(false);
    }
  }, [open]);

  useEffect(() => {
    setWordSaved(false);
  }, [selectedText]);

  // Auto-translate when text is selected and dialog opens
  const translationQuery = useQuery({
    queryKey: ["translate", selectedText, sourceLang, targetLang, videoId, timestampWhenOpened],
    queryFn: async () => {
      if (!selectedText) return null;
      return await trpcClient.utils.translateText.query({
        text: selectedText,
        sourceLang,
        targetLang,
        // Video context is required for all translations
        videoId,
        timestampSeconds: Math.floor(timestampWhenOpened),
        contextText: selectedText, // Use the selected text as context
      });
    },
    enabled: !!selectedText && !!videoId && open, // Require videoId to be present
    staleTime: Infinity, // Cache translation results
  });

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleCancel()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            Add note at {Math.floor(timestampWhenOpened / 60)}:
            {String(Math.floor(timestampWhenOpened % 60)).padStart(2, "0")}
          </DialogTitle>
          {selectedText && (
            <DialogDescription asChild>
              <div className="mt-2 rounded border border-primary/20 bg-muted/50 p-3">
                <p className="mb-1 text-xs font-medium text-muted-foreground">Selected text:</p>
                <p className="text-sm italic leading-relaxed text-foreground/90">
                  "{selectedText}"
                </p>
              </div>
            </DialogDescription>
          )}
        </DialogHeader>
        <div className="space-y-4 py-4">
          {/* Auto Translation - only show if there's selected text */}
          {selectedText && (
            <div className="rounded-lg border border-blue-500/20 bg-gradient-to-br from-blue-500/5 to-blue-500/10 p-3">
              <div className="flex items-start gap-3">
                <Languages className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-500" />
                <div className="flex-1 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold">
                      Translation ({targetLang.toUpperCase()})
                    </p>
                  </div>

                  <div className="space-y-2">
                    {translationQuery.isLoading && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Translating...
                      </div>
                    )}

                    {translationQuery.data?.success && (
                      <>
                        <div className="rounded border bg-background p-2 text-sm">
                          <p className="font-medium text-foreground">
                            {translationQuery.data.translation}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {translationQuery.data.sourceLang} → {translationQuery.data.targetLang}
                          </p>
                        </div>

                        {/* Save to My Words Button */}
                        <div className="flex items-center gap-2">
                          {wordSaved ? (
                            <div className="flex items-center gap-1.5 rounded border border-green-200 bg-green-50 px-3 py-1.5 text-xs text-green-600 dark:border-green-800 dark:bg-green-950/30 dark:text-green-400">
                              <Check className="h-3 w-3" />
                              <span>Saved to My Words</span>
                            </div>
                          ) : translationQuery.data.success &&
                            "translationId" in translationQuery.data &&
                            typeof translationQuery.data.translationId === "string" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                if (
                                  translationQuery.data?.success &&
                                  "translationId" in translationQuery.data &&
                                  typeof translationQuery.data.translationId === "string"
                                ) {
                                  saveWordMutation.mutate(translationQuery.data.translationId);
                                }
                              }}
                              disabled={saveWordMutation.isPending}
                              className="h-7 text-xs"
                            >
                              {saveWordMutation.isPending ? (
                                <>
                                  <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                                  Saving...
                                </>
                              ) : (
                                <>
                                  <BookmarkPlus className="mr-1.5 h-3 w-3" />
                                  Save to My Words
                                </>
                              )}
                            </Button>
                          ) : null}
                        </div>
                      </>
                    )}

                    {translationQuery.data && !translationQuery.data.success && (
                      <p className="text-xs text-destructive">
                        Translation failed. Please try again.
                      </p>
                    )}

                    {translationQuery.isError && (
                      <p className="text-xs text-destructive">
                        Unable to connect to translation service.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Emoji Reactions */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">
              Quick categorize (optional)
            </label>
            <div className="flex gap-2">
              {EMOJI_REACTIONS.map((reaction) => (
                <Button
                  key={reaction.emoji}
                  type="button"
                  variant={emoji === reaction.emoji ? "default" : "outline"}
                  size="sm"
                  className="flex-1 gap-1.5"
                  onClick={() => handleEmojiClick(reaction.emoji)}
                  title={reaction.description}
                >
                  <span className="text-base">{reaction.emoji}</span>
                  <span className="text-xs">{reaction.label}</span>
                </Button>
              ))}
            </div>
          </div>

          <Textarea
            placeholder="Write your note... (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="min-h-24 resize-none text-sm"
            autoFocus
            onKeyDown={(e) => {
              if (
                e.key === "Enter" &&
                (e.ctrlKey || e.metaKey) &&
                !createAnnotationMutation.isPending
              ) {
                e.preventDefault();
                handleSave();
              }
            }}
          />
        </div>
        <DialogFooter className="flex-col gap-2 sm:flex-row">
          {emoji && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground sm:mr-auto">
              <span className="text-base">{emoji}</span>
              <span>Selected</span>
            </div>
          )}
          <div className="flex gap-2 sm:ml-auto">
            <Button
              variant="outline"
              onClick={handleCancel}
              disabled={createAnnotationMutation.isPending}
            >
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={createAnnotationMutation.isPending}>
              {createAnnotationMutation.isPending
                ? "Saving..."
                : emoji
                  ? `Save ${emoji}`
                  : "Save note"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
