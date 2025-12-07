import React, { useState } from "react";
import { Mic, Play, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpcClient } from "@/utils/trpc";
import { toast } from "sonner";
import { useMutation } from "@tanstack/react-query";
import { logger } from "@/helpers/logger";

export default function PodcastAnythingPage(): React.JSX.Element {
  const [inputUrl, setInputUrl] = useState("");
  const [inputText, setInputText] = useState("");
  const [generatedScript, setGeneratedScript] = useState<string | null>(null);

  const generateMutation = useMutation({
    mutationFn: async (input: { content: string; type: "url" | "text" }) => {
      return await trpcClient.podcast.generateScript.mutate(input);
    },
    onSuccess: (data) => {
      setGeneratedScript(data.script);
      toast.success("Podcast script generated successfully!");
    },
    onError: (error) => {
      logger.error("Failed to generate podcast script", error);
      toast.error(error.message || "Failed to generate podcast script");
    },
  });

  const isGenerating = generateMutation.isPending;

  const handleGenerate = (): void => {
    const content = inputUrl || inputText;
    const type = inputUrl ? "url" : "text";

    if (!content) return;

    setGeneratedScript(null);
    generateMutation.mutate({ content, type });
  };

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight text-primary dark:text-white">
          Podcast Anything
        </h1>
        <p className="text-muted-foreground">
          Turn any URL or text into an engaging podcast episode using AI.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Source Material</CardTitle>
              <CardDescription>
                Provide a link or paste text to generate your podcast.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="url">URL (Optional)</Label>
                <Input
                  id="url"
                  placeholder="https://example.com/article"
                  value={inputUrl}
                  onChange={(e) => setInputUrl(e.target.value)}
                />
              </div>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">Or paste text</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="text">Content</Label>
                <Textarea
                  id="text"
                  placeholder="Paste your article text, notes, or ideas here..."
                  className="min-h-[200px]"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                />
              </div>

              <Button
                onClick={handleGenerate}
                disabled={(!inputUrl && !inputText) || isGenerating}
                className="w-full"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating Episode...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Generate Podcast
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          {generatedScript ? (
            <Card className="flex-1">
              <CardHeader>
                <CardTitle>Your Podcast</CardTitle>
                <CardDescription>Listen to your generated episode.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="rounded-lg bg-accent/10 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/20 text-primary">
                        <Mic className="h-6 w-6" />
                      </div>
                      <div>
                        <h3 className="font-semibold">Generated Episode</h3>
                        <p className="text-sm text-muted-foreground">Duration: 2:15</p>
                      </div>
                    </div>
                    <Button size="icon" variant="secondary" className="h-12 w-12 rounded-full">
                      <Play className="ml-1 h-6 w-6" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <h3 className="font-semibold">Script Preview</h3>
                  <div className="max-h-[300px] overflow-y-auto rounded-md border p-4 text-sm text-muted-foreground">
                    {generatedScript}
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="flex h-full flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center text-muted-foreground">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-accent/10">
                <Mic className="h-8 w-8 text-accent" />
              </div>
              <h3 className="mb-2 text-lg font-semibold">Ready to Record</h3>
              <p className="max-w-xs text-sm">
                Your generated podcast episode will appear here once you provide content and hit
                generate.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
