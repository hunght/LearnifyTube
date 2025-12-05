import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { trpcClient } from "@/utils/trpc";
import type { UserPreferences } from "@/lib/types/user-preferences";

/**
 * Hook to apply appearance preferences for LearnifyTube
 * Handles font, layout, and animation preferences
 */
export function useAppearancePreferences(): UserPreferences | undefined {
  const { data: preferences } = useQuery({
    queryKey: ["preferences.customization"],
    queryFn: async () => {
      return trpcClient.preferences.getCustomizationPreferences.query();
    },
  });

  useEffect(() => {
    if (!preferences) return;

    const root = document.documentElement;
    const { appearance } = preferences;

    // Apply font scale
    root.setAttribute("data-font-scale", appearance.fontScale);

    // Apply font family
    if (appearance.fontFamily) {
      root.setAttribute("data-font-family", appearance.fontFamily);
    }

    // Apply UI size
    root.setAttribute("data-ui-size", appearance.uiSize);

    // Apply animation speed
    root.setAttribute("data-animation-speed", appearance.showAnimations);

    // Apply reduced motion
    root.setAttribute("data-reduced-motion", appearance.reducedMotion.toString());

    // Apply rounded corners preference
    root.setAttribute("data-rounded-corners", appearance.roundedCorners.toString());

    // Apply show icons preference
    if (!appearance.showIcons) {
      root.classList.add("hide-icons");
    } else {
      root.classList.remove("hide-icons");
    }
  }, [preferences]);

  return preferences;
}
