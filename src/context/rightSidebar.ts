import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";

type RightSidebarContent = "queue" | "annotations" | "ai-summary" | "quiz" | null;

// Right sidebar state atoms
export const rightSidebarOpenAtom = atomWithStorage<boolean>("right-sidebar-open", true);

export const rightSidebarContentAtom = atom<RightSidebarContent>("queue");

// Data atom - only holds data, not callbacks
export const annotationsSidebarDataAtom = atom<{
  videoId: string;
  videoRef: React.RefObject<HTMLVideoElement>;
  videoTitle?: string;
  videoDescription?: string;
  currentTime: number;
} | null>(null);

// Derived atom for toggling sidebar
export const toggleRightSidebarAtom = atom(null, (get, set): void => {
  const current = get(rightSidebarOpenAtom);
  set(rightSidebarOpenAtom, !current);
});
