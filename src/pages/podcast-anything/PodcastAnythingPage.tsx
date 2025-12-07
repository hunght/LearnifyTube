import React, { useState, useRef } from "react";
import { Mic, Play, Loader2, Sparkles, Upload, FileText, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpcClient } from "@/utils/trpc";
import { toast } from "sonner";
import { useMutation } from "@tanstack/react-query";
import { logger } from "@/helpers/logger";
import { cn } from "@/lib/utils";
import type { GeneratePodcastInput } from "@/api/routers/podcast";

const PODCAST_STYLES = [
  { id: "Roast", label: "Roast", description: "Comedic take with witty sarcasm", icon: "🔥" },
  { id: "ELI5", label: "ELI5", description: "Simple explanations for everyone", icon: "👶" },
  {
    id: "Steel vs Straw",
    label: "Steel vs Straw",
    description: "Debate format with counterarguments",
    icon: "⚔️",
  },
] as const;

const PODCAST_LENGTHS = ["2-4 min", "4-6 min", "6-8 min"] as const;

export default function PodcastAnythingPage(): React.JSX.Element {
  const [inputUrl, setInputUrl] = useState("");
  const [inputText, setInputText] = useState("");
  const [selectedFile, setSelectedFile] = useState<{ name: string; base64: string } | null>(null);
  const [selectedStyle, setSelectedStyle] = useState<(typeof PODCAST_STYLES)[number]["id"]>("ELI5");
  const [selectedLength, setSelectedLength] = useState<(typeof PODCAST_LENGTHS)[number]>("2-4 min");

  const [result, setResult] = useState<{
    script: string;
    audioData: string;
    audioMimeType?: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const generateMutation = useMutation({
    mutationFn: async (input: GeneratePodcastInput) => {
      return await trpcClient.podcast.generatePodcast.mutate(input);
    },
    onSuccess: (data) => {
      setResult({
        script: data.script,
        audioData: data.audioData,

        audioMimeType: data.audioMimeType,
      });
      toast.success("Podcast generated successfully!");
    },
    onError: (error) => {
      logger.error("Failed to generate podcast", error);
      toast.error(error.message || "Failed to generate podcast");
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        toast.error("File size must be less than 10MB");
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          const base64 = reader.result.split(",")[1];
          setSelectedFile({ name: file.name, base64 });
        }
        setInputText(""); // Clear text if file is selected
        setInputUrl(""); // Clear URL if file is selected
      };
      reader.readAsDataURL(file);
    }
  };

  const handleGenerate = (): void => {
    let type: "url" | "text" | "pdf" = "text";
    let content = inputText;
    let fileData: string | undefined;

    if (selectedFile) {
      type = "pdf";
      fileData = selectedFile.base64;
    } else if (inputUrl) {
      type = "url";
      content = inputUrl;
    } else if (!inputText) {
      return;
    }

    setResult(null);
    generateMutation.mutate({
      content,
      fileData,
      type,
      style: selectedStyle,
      length: selectedLength,
    });
  };

  const isGenerating = generateMutation.isPending;

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight text-primary dark:text-white">
          Podcast Anything
        </h1>
        <p className="text-muted-foreground">
          Turn any URL, PDF, or text into an engaging audio podcast using Gemini AI.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Input Section */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>1. Source Material</CardTitle>
              <CardDescription>Choose your content source.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* File Upload */}
              <div
                className={cn(
                  "flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 transition-colors hover:bg-accent/50",
                  selectedFile ? "border-primary bg-accent/10" : "border-border"
                )}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  type="file"
                  accept=".pdf,.txt"
                  className="hidden"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                />
                {selectedFile ? (
                  <div className="flex flex-col items-center gap-2">
                    <FileText className="h-8 w-8 text-primary" />
                    <p className="font-medium">{selectedFile.name}</p>
                    <p className="text-xs text-muted-foreground">Click to replace</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Upload className="h-8 w-8" />
                    <p className="font-medium">Drag & Drop or Click to Upload</p>
                    <p className="text-xs">PDF or TXT (Max 10MB)</p>
                  </div>
                )}
              </div>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">Or</span>
                </div>
              </div>

              {/* URL Input */}
              <div className="space-y-2">
                <Label>URL</Label>
                <Input
                  placeholder="https://example.com/article"
                  value={inputUrl}
                  onChange={(e) => {
                    setInputUrl(e.target.value);
                    if (e.target.value) {
                      setSelectedFile(null);
                      setInputText("");
                    }
                  }}
                />
              </div>

              {/* Text Input */}
              <div className="space-y-2">
                <Label>Text Content</Label>
                <Textarea
                  placeholder="Paste text notes here..."
                  className="min-h-[100px]"
                  value={inputText}
                  onChange={(e) => {
                    setInputText(e.target.value);
                    if (e.target.value) {
                      setSelectedFile(null);
                      setInputUrl("");
                    }
                  }}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>2. Podcast Settings</CardTitle>
              <CardDescription>Customize the style and length.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-3">
                <Label>Podcast Style</Label>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {PODCAST_STYLES.map((style) => (
                    <div
                      key={style.id}
                      className={cn(
                        "cursor-pointer rounded-lg border p-3 transition-all hover:bg-accent/50",
                        selectedStyle === style.id
                          ? "border-primary bg-accent/10 ring-1 ring-primary"
                          : "border-border"
                      )}
                      onClick={() => setSelectedStyle(style.id)}
                    >
                      <div className="mb-1 text-2xl">{style.icon}</div>
                      <div className="font-semibold">{style.label}</div>
                      <div className="text-xs text-muted-foreground">{style.description}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <Label>Length</Label>
                <div className="flex flex-wrap gap-2">
                  {PODCAST_LENGTHS.map((len) => (
                    <Button
                      key={len}
                      variant={selectedLength === len ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSelectedLength(len)}
                    >
                      {len}
                    </Button>
                  ))}
                </div>
              </div>

              <Button
                onClick={handleGenerate}
                disabled={(!inputUrl && !inputText && !selectedFile) || isGenerating}
                className="h-12 w-full text-lg font-semibold"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Generating Audio...
                  </>
                ) : (
                  <>
                    <Mic className="mr-2 h-5 w-5" />
                    Generate Podcast
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Results Section */}
        <div className="flex flex-col gap-6">
          {result ? (
            <div className="flex h-full flex-col gap-6">
              {/* Audio Player Card */}
              <Card className="border-primary/50 shadow-lg">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-primary" />
                    Your Episode is Ready
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex flex-col items-center justify-center rounded-xl bg-accent/10 p-8">
                    <div className="mb-4 flex h-20 w-20 animate-pulse items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xl">
                      <Play className="ml-1 h-10 w-10" />
                    </div>
                    <h3 className="text-xl font-bold">{selectedStyle} Podcast</h3>
                    <p className="text-sm text-muted-foreground">Generated by Gemini</p>

                    <audio
                      controls
                      className="mt-6 w-full max-w-md"
                      src={`data:${result.audioMimeType || "audio/wav"};base64,${result.audioData}`}
                    >
                      Your browser does not support the audio element.
                    </audio>
                  </div>

                  <div className="flex justify-center">
                    <a
                      href={`data:${result.audioMimeType || "audio/wav"};base64,${result.audioData}`}
                      download={`podcast-${Date.now()}.${result.audioMimeType?.includes("wav") ? "wav" : result.audioMimeType?.includes("mp3") ? "mp3" : "wav"}`}
                    >
                      <Button variant="outline" className="gap-2">
                        <Download className="h-4 w-4" />
                        Download Audio
                      </Button>
                    </a>
                  </div>
                </CardContent>
              </Card>

              {/* Script Card */}
              <Card className="flex flex-1 flex-col">
                <CardHeader>
                  <CardTitle>Script</CardTitle>
                </CardHeader>
                <CardContent className="min-h-[300px] flex-1">
                  <div className="h-full max-h-[500px] overflow-y-auto whitespace-pre-wrap rounded-md border bg-muted/30 p-4 font-mono text-sm">
                    {result.script}
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center rounded-xl border-2 border-dashed bg-muted/10 p-12 text-center text-muted-foreground">
              <div className="mb-6 rounded-full bg-accent/10 p-6">
                <Mic className="h-12 w-12 text-primary" />
              </div>
              <h3 className="mb-2 text-2xl font-semibold text-foreground">Ready to Create</h3>
              <p className="max-w-md text-lg">
                Upload a document or paste a link, choose your style, and let AI generate a full
                audio podcast for you.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
