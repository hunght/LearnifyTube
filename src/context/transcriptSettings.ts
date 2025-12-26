import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";

// Transcript settings atoms with localStorage persistence
export const fontFamilyAtom = atomWithStorage<"system" | "serif" | "mono">(
  "transcript-font-family",
  "system"
);

export const fontSizeAtom = atomWithStorage<number>("transcript-font-size", 14);

export const translationTargetLangAtom = atomWithStorage<string>(
  "transcript-translation-target-lang",
  "vi"
);

export const includeTranslationInNoteAtom = atomWithStorage<boolean>(
  "transcript-include-translation-in-note",
  true
);

export const showInlineTranslationsAtom = atomWithStorage<boolean>(
  "transcript-show-inline-translations",
  false
);

// Current transcript language (shared with AnnotationsSidebar)
// This is the effective language of the currently displayed transcript
export const currentTranscriptLangAtom = atom<string | undefined>(undefined);

// Transcript panel collapsed state (persisted)
export const transcriptCollapsedAtom = atomWithStorage<boolean>("transcript-collapsed", true);

// Dual subtitles settings
export const showDualSubtitlesAtom = atomWithStorage<boolean>("transcript-show-dual-subs", false);
export const secondarySubtitleLangAtom = atomWithStorage<string>("transcript-secondary-lang", "vi");
