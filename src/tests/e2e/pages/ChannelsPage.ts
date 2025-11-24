import { Page } from "@playwright/test";

export type ChannelsPage = ReturnType<typeof createChannelsPage>;

export const createChannelsPage = (page: Page) => {
  const selectChannel = async (channelName: string) => {
    // Use .first() to avoid strict mode violation if multiple elements match
    const channelLocator = page.locator(`text=${channelName}`).first();
    await channelLocator.waitFor({ state: "visible", timeout: 30000 });
    await channelLocator.click();
  };

  const selectVideo = async (videoTitle: string) => {
    // Find the video card that contains the title
    const videoCard = page
      .locator("div.rounded-lg.border")
      .filter({ has: page.getByRole("heading", { name: videoTitle }) })
      .first();

    // Find the Play button within that card
    const playButton = videoCard.getByRole("link", { name: "Play" });

    await playButton.waitFor({ state: "visible", timeout: 10000 });
    await playButton.click();
  };

  return {
    selectChannel,
    selectVideo,
  };
};
