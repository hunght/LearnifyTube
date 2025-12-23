import { atom } from "jotai";

// Atom for tracking text selection in the transcript (for Sidebar UI)
export const transcriptSelectionAtom = atom<{
  trigger: number; // Timestamp to force updates
  selectedText?: string;
  currentTime?: number;
} | null>(null);
