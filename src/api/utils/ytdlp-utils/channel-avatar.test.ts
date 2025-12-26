import { extractChannelData } from "./metadata";

describe("extractChannelData", () => {
  test("should extract channel avatar from thumbnails field when channel_thumbnails is missing", () => {
    // Sample JSON from the debug output provided by user
    const mockMeta = {
      id: "@GoogleDevelopers",
      channel: "Google for Developers",
      channel_id: "UC_x5XG1OV2P6uZZ5FSM9Ttw",
      thumbnails: [
        {
          url: "https://yt3.googleusercontent.com/SIjqU1AOPgS2jGXQPZhaz23I_-6ZNTw0u-Udujsu4A5mDtM13tga-0wlilZjPnHOXG1_akTB=w1060-fcrop64=1,00005a57ffffa5a8-k-c0xffffffff-no-nd-rj",
          id: "0",
        },
        {
          url: "https://yt3.googleusercontent.com/WZ_63J_-745xyW_DGxGi3VUyTZAe0Jvhw2ZCg7fdz-tv9esTbNPZTFR9X79QzA0ArIrMjYJCDA=s0",
          id: "avatar_uncropped",
          preference: 1,
        },
      ],
      uploader_id: "@GoogleDevelopers",
      uploader: "Google for Developers",
      _type: "playlist",
    };

    const result = extractChannelData(mockMeta);

    expect(result).not.toBeNull();
    expect(result?.channelId).toBe("UC_x5XG1OV2P6uZZ5FSM9Ttw");
    // Should prioritize avatar_uncropped
    expect(result?.thumbnailUrl).toBe(
      "https://yt3.googleusercontent.com/WZ_63J_-745xyW_DGxGi3VUyTZAe0Jvhw2ZCg7fdz-tv9esTbNPZTFR9X79QzA0ArIrMjYJCDA=s0"
    );
  });

  test("should fallback to last thumbnail if avatar_uncropped is missing", () => {
    const mockMeta = {
      channel_id: "test_channel",
      thumbnails: [
        { url: "low_quality.jpg", id: "0" },
        { url: "high_quality.jpg", id: "1" },
      ],
    };

    const result = extractChannelData(mockMeta);
    expect(result?.thumbnailUrl).toBe("high_quality.jpg");
  });
});
