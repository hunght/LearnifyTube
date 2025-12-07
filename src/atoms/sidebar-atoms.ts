import { atomWithStorage } from "jotai/utils";
import type { SidebarPreferences } from "@/lib/types/user-preferences";
import { DEFAULT_SIDEBAR_PREFERENCES } from "@/lib/types/user-preferences";

export const sidebarPreferencesAtom = atomWithStorage<SidebarPreferences>(
  "sidebar-preferences",
  DEFAULT_SIDEBAR_PREFERENCES
);
