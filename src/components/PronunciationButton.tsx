import React, { useState, useCallback, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Volume2, VolumeX, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface PronunciationButtonProps {
  text: string;
  lang?: string; // BCP 47 language code (e.g., "en-US", "es-ES", "ja-JP")
  rate?: number; // Speech rate: 0.1 to 10, default 1
  className?: string;
  size?: "sm" | "default" | "lg" | "icon";
  variant?: "default" | "ghost" | "outline" | "secondary";
  showText?: boolean;
}

export function PronunciationButton({
  text,
  lang,
  rate = 0.9,
  className,
  size = "icon",
  variant = "ghost",
  showText = false,
}: PronunciationButtonProps): React.JSX.Element {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isSupported, setIsSupported] = useState(true);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Check if speech synthesis is supported
  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      setIsSupported(false);
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (utteranceRef.current) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const handleSpeak = useCallback(() => {
    if (!isSupported || !text.trim()) return;

    // Cancel any ongoing speech
    window.speechSynthesis.cancel();

    // Clean text for pronunciation (remove brackets, special chars)
    const cleanText = text
      .replace(/\[.*?\]/g, "") // Remove [translations]
      .replace(/{{c1::(.*?)}}/g, "$1") // Extract cloze content
      .replace(/[^\w\s'-]/g, " ") // Remove special chars except apostrophes and hyphens
      .trim();

    if (!cleanText) return;

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utteranceRef.current = utterance;

    // Set language if provided
    if (lang) {
      utterance.lang = lang;
    }

    // Set speech rate
    utterance.rate = rate;

    // Find a voice for the language if available
    const voices = window.speechSynthesis.getVoices();
    if (lang && voices.length > 0) {
      const matchingVoice = voices.find((v) =>
        v.lang.toLowerCase().startsWith(lang.toLowerCase().split("-")[0])
      );
      if (matchingVoice) {
        utterance.voice = matchingVoice;
      }
    }

    utterance.onstart = () => setIsPlaying(true);
    utterance.onend = () => setIsPlaying(false);
    utterance.onerror = () => setIsPlaying(false);

    window.speechSynthesis.speak(utterance);
  }, [text, lang, rate, isSupported]);

  const handleStop = useCallback(() => {
    window.speechSynthesis.cancel();
    setIsPlaying(false);
  }, []);

  if (!isSupported) {
    return (
      <Button
        variant={variant}
        size={size}
        disabled
        className={cn("cursor-not-allowed opacity-50", className)}
        title="Speech synthesis not supported"
      >
        <VolumeX className="h-4 w-4" />
        {showText && <span className="ml-1">Unavailable</span>}
      </Button>
    );
  }

  return (
    <Button
      variant={variant}
      size={size}
      onClick={isPlaying ? handleStop : handleSpeak}
      className={cn(isPlaying && "text-primary", className)}
      title={isPlaying ? "Stop" : "Listen to pronunciation"}
    >
      {isPlaying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Volume2 className="h-4 w-4" />}
      {showText && <span className="ml-1">{isPlaying ? "Playing..." : "Listen"}</span>}
    </Button>
  );
}
