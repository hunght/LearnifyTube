/* eslint-disable import/no-unused-modules */
/**
 * User Preferences System for LearnifyTube
 * Allows users to customize their learning experience
 */

export type ThemeMode = "light" | "dark";

export type SidebarItem =
  | "dashboard"
  | "channels"
  | "playlists"
  | "subscriptions"
  | "history"
  | "my-words"
  | "flashcards"
  | "storage"
  | "podcast-anything"
  | "logs"
  | "settings";

export type UISize = "compact" | "comfortable" | "spacious";
export type FontScale = "small" | "normal" | "large" | "x-large";
export type AnimationSpeed = "none" | "reduced" | "normal" | "enhanced";

export interface SidebarPreferences {
  visibleItems: SidebarItem[];
  collapsed: boolean;
}

export interface AppearancePreferences {
  themeMode: ThemeMode;
  fontScale: FontScale;
  fontFamily?: "default" | "sans" | "mono" | "dyslexic";
  uiSize: UISize;
  showAnimations: AnimationSpeed;
  reducedMotion: boolean;
  showIcons: boolean;
  roundedCorners: boolean;
}

export interface PlayerPreferences {
  autoPlay: boolean;
  defaultSpeed: number;
  defaultVolume: number;
  showSubtitles: boolean;
  subtitleLanguage: string;
}

export interface LearningPreferences {
  pauseOnNewWord: boolean;
  highlightTranslations: boolean;
  autoSaveWords: boolean;
}

export interface UserPreferences {
  sidebar: SidebarPreferences;
  appearance: AppearancePreferences;
  player: PlayerPreferences;
  learning: LearningPreferences;
  version: number;
  lastUpdated: number;
}

// Defaults
export const DEFAULT_SIDEBAR_PREFERENCES: SidebarPreferences = {
  visibleItems: [
    "dashboard",
    "channels",
    "playlists",
    "subscriptions",
    "history",
    "my-words",
    "flashcards",
    "storage",
    "podcast-anything",
    "logs",
    "settings",
  ],
  collapsed: false,
};

export const DEFAULT_APPEARANCE_PREFERENCES: AppearancePreferences = {
  themeMode: "light",
  fontScale: "normal",
  fontFamily: "default",
  uiSize: "comfortable",
  showAnimations: "normal",
  reducedMotion: false,
  showIcons: true,
  roundedCorners: true,
};

export const DEFAULT_PLAYER_PREFERENCES: PlayerPreferences = {
  autoPlay: false,
  defaultSpeed: 1.0,
  defaultVolume: 70,
  showSubtitles: true,
  subtitleLanguage: "en",
};

export const DEFAULT_LEARNING_PREFERENCES: LearningPreferences = {
  pauseOnNewWord: false,
  highlightTranslations: true,
  autoSaveWords: true,
};

export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  sidebar: DEFAULT_SIDEBAR_PREFERENCES,
  appearance: DEFAULT_APPEARANCE_PREFERENCES,
  player: DEFAULT_PLAYER_PREFERENCES,
  learning: DEFAULT_LEARNING_PREFERENCES,
  version: 1,
  lastUpdated: Date.now(),
};
