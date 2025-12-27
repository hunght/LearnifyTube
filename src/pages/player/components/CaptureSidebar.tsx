import React, { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { trpcClient } from "@/utils/trpc";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, Type, Brain, ScanText, Camera } from "lucide-react";
import { useAtomValue } from "jotai";
import { currentTranscriptLangAtom } from "@/context/transcriptSettings";

interface CaptureSidebarProps {
  videoId: string;
  videoRef: React.RefObject<HTMLVideoElement>;
  currentTime: number;
}

export function CaptureSidebar({
  videoId,
  videoRef,
  currentTime,
}: CaptureSidebarProps): React.JSX.Element {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Get current language from shared atom (set by TranscriptPanel)
  const currentLang = useAtomValue(currentTranscriptLangAtom);

  // Fetch transcript segments (cached)
  const transcriptSegmentsQuery = useQuery({
    queryKey: ["transcript-segments", videoId, currentLang ?? "__default__"],
    queryFn: async () => {
      if (!videoId) return { segments: [] };
      return await trpcClient.transcripts.getSegments.query({
        videoId,
        lang: currentLang ?? undefined,
      });
    },
    enabled: !!videoId,
    staleTime: Infinity,
  });

  const segments = transcriptSegmentsQuery.data?.segments ?? [];

  // Find current subtitle efficiently
  const currentSubtitle = useMemo(() => {
    if (!segments.length) return "";
    const segment = segments.find((s) => currentTime >= s.start && currentTime < s.end);
    return segment ? segment.text : "";
  }, [segments, currentTime]);

  // Form states
  const [wordFront, setWordFront] = useState("");
  const [wordBack, setWordBack] = useState("");
  const [conceptFront, setConceptFront] = useState("");
  const [conceptBack, setConceptBack] = useState("");
  const [clozeText, setClozeText] = useState("");
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);

  // Auto-fill cloze from subtitle
  React.useEffect(() => {
    if (currentSubtitle) {
      setClozeText(currentSubtitle);
    }
  }, [currentSubtitle]);

  // Handle Cloze Interaction
  const handleInsertCloze = (): void => {
    const textarea = document.getElementById("cloze-textarea") as HTMLTextAreaElement;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;

    if (start === end) return;

    const selection = text.substring(start, end);
    const newText = text.substring(0, start) + `{{c1::${selection}}}` + text.substring(end);

    setClozeText(newText);
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
        toast({ title: "Screenshot captured", description: "Attached to card." });
      }
    } catch (e) {
      toast({
        title: "Capture failed",
        description: "Could not capture screenshot.",
        variant: "destructive",
      });
    }
  };

  const handleSubmit = async (type: "basic" | "cloze" | "concept"): Promise<void> => {
    setIsSubmitting(true);
    try {
      let frontContent = "";
      let backContent = "";
      let clozeContent = "";

      if (type === "basic") {
        if (!wordFront) throw new Error("Front content is required");
        frontContent = wordFront;
        backContent = wordBack;
      } else if (type === "concept") {
        if (!conceptFront) throw new Error("Question is required");
        frontContent = conceptFront;
        backContent = conceptBack;
      } else if (type === "cloze") {
        if (!clozeText) throw new Error("Cloze text is required");
        frontContent = "Cloze Card"; // Placeholder
        clozeContent = clozeText;
      }

      // If we have a screenshot, we should upload/save it.
      // For MVP, we pass the dataURL directly or save it via IPC.
      // Since backend expects a path, we might need an upload endpoint or handle it here.
      // Ideally: await trpcClient.utils.uploadImage({ image: screenshotPreview }) -> returns path
      // BUT, we defined logic to save locally.
      // Let's send the dataURL as 'screenshotPath' for now if the backend can handle it,
      // OR we implement a quick save-image endpoint.
      // The schema says `screenshotPath`.
      // Let's rely on the frontend to just send the dataURL and let the backend/frontend logic deal with rendering it (img src can be dataURL).
      // This increases DB size but is easiest for MVP without file system IPC complexity right now.

      const screenshotPath = screenshotPreview || undefined;

      await trpcClient.flashcards.create.mutate({
        cardType: type,
        frontContent,
        backContent,
        clozeContent,
        videoId,
        timestampSeconds: currentTime,
        contextText: currentSubtitle || undefined,
        screenshotPath,
      });

      toast({
        title: "Card Created",
        description: `Successfully created ${type} card.`,
      });

      // Reset forms
      if (type === "basic") {
        setWordFront("");
        setWordBack("");
      } else if (type === "concept") {
        setConceptFront("");
        setConceptBack("");
      }
      setScreenshotPreview(null);

      queryClient.invalidateQueries({ queryKey: ["flashcards"] });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create card",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex h-full flex-col space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Quick Capture</h3>
        <Button variant="outline" size="sm" onClick={captureScreenshot} title="Capture Screenshot">
          <Camera className="mr-2 h-4 w-4" />
          Screenshot
        </Button>
      </div>

      {screenshotPreview && (
        <div className="relative overflow-hidden rounded-md border border-border">
          <img
            src={screenshotPreview}
            alt="Screenshot"
            className="h-auto max-h-[150px] w-full object-cover"
          />
          <Button
            variant="destructive"
            size="icon"
            className="absolute right-1 top-1 h-6 w-6"
            onClick={() => setScreenshotPreview(null)}
          >
            <Plus className="h-4 w-4 rotate-45" />
          </Button>
        </div>
      )}

      <Tabs defaultValue="basic" className="flex flex-1 flex-col">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="basic">
            <Type className="mr-2 h-4 w-4" />
            Basic
          </TabsTrigger>
          <TabsTrigger value="cloze">
            <ScanText className="mr-2 h-4 w-4" />
            Cloze
          </TabsTrigger>
          <TabsTrigger value="concept">
            <Brain className="mr-2 h-4 w-4" />
            Concept
          </TabsTrigger>
        </TabsList>

        {/* Basic / Word Tab */}
        <TabsContent value="basic" className="mt-4 flex-1 space-y-4">
          <div className="space-y-2">
            <Label>Front (Word/Phrase)</Label>
            <Input
              value={wordFront}
              onChange={(e) => setWordFront(e.target.value)}
              placeholder="e.g. Roche Limit"
            />
          </div>
          <div className="space-y-2">
            <Label>Back (Definition/Answer)</Label>
            <Textarea
              value={wordBack}
              onChange={(e) => setWordBack(e.target.value)}
              placeholder="Describe it..."
              className="min-h-[100px]"
            />
          </div>
          <Button
            className="w-full"
            onClick={() => handleSubmit("basic")}
            disabled={isSubmitting || !wordFront}
          >
            {isSubmitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-2 h-4 w-4" />
            )}
            Create Card
          </Button>
        </TabsContent>

        {/* Cloze Tab */}
        <TabsContent value="cloze" className="mt-4 flex-1 space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Sentence</Label>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleInsertCloze}
                className="h-6 bg-muted/50 text-xs hover:bg-muted"
              >
                Insert Cloze
              </Button>
            </div>
            <Textarea
              id="cloze-textarea"
              value={clozeText}
              onChange={(e) => setClozeText(e.target.value)}
              placeholder="Paste text here and highlight part to hide..."
              className="min-h-[150px] font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Select text and click "Insert Cloze" to hide it (Cmd+Shift+C).
            </p>
          </div>
          <Button
            className="w-full"
            onClick={() => handleSubmit("cloze")}
            disabled={isSubmitting || !clozeText}
          >
            {isSubmitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-2 h-4 w-4" />
            )}
            Create Cloze
          </Button>
        </TabsContent>

        {/* Concept Tab */}
        <TabsContent value="concept" className="mt-4 flex-1 space-y-4">
          <div className="space-y-2">
            <Label>Question</Label>
            <Input
              value={conceptFront}
              onChange={(e) => setConceptFront(e.target.value)}
              placeholder="e.g. Why did..."
            />
          </div>
          <div className="space-y-2">
            <Label>Answer (Context)</Label>
            <Textarea
              value={conceptBack}
              onChange={(e) => setConceptBack(e.target.value)}
              placeholder="Explain..."
              className="min-h-[100px]"
            />
          </div>
          <Button
            className="w-full"
            onClick={() => handleSubmit("concept")}
            disabled={isSubmitting || !conceptFront}
          >
            {isSubmitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-2 h-4 w-4" />
            )}
            Create Card
          </Button>
        </TabsContent>
      </Tabs>
    </div>
  );
}
