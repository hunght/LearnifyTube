import { Page, expect } from "@playwright/test";

export type DashboardPage = ReturnType<typeof createDashboardPage>;

export const createDashboardPage = (page: Page) => {
  const settingsLink = page.locator('a[href="/settings"]');
  const channelsLink = page.locator('a[href="/channels"]');
  const searchInput = page.locator('input[placeholder*="youtube.com"]');
  const downloadButton = page.locator('button:has-text("Download")');

  const navigateToSettings = async () => {
    await settingsLink.click();
  };

  const navigateToChannels = async () => {
    await channelsLink.click();
  };

  const searchAndDownloadVideo = async (url: string) => {
    await searchInput.fill(url);
    // Wait for download button to be enabled
    await expect(downloadButton).toBeEnabled({ timeout: 10000 });
    await downloadButton.click();
    // Wait for confirmation toast or duplicate message
    // If video is already downloaded, the toast might be different or not appear.
    // We'll try to wait for the success toast, but proceed if it times out,
    // assuming the subsequent checks (video in channels) will validate the state.
    try {
      await page.waitForSelector("text=Download added to queue", { timeout: 5000 });
    } catch (e) {
      console.log("Download toast not found, possibly already downloaded. Proceeding...");
    }
  };

  return {
    navigateToSettings,
    navigateToChannels,
    searchAndDownloadVideo,
  };
};
