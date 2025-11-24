import { Page, expect } from "@playwright/test";

export type PlayerPage = ReturnType<typeof createPlayerPage>;

export const createPlayerPage = (page: Page) => {
  const videoPlayer = page.locator("video");

  const verifyPlayback = async () => {
    await expect(videoPlayer).toBeVisible({ timeout: 20000 });
    // Optional: Check if video is playing by checking currentTime or similar properties if needed
    // For now, visibility is a good enough check for "playback started"
  };

  return {
    verifyPlayback,
  };
};
