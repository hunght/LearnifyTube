import {
  createDefaultFallbackState,
  getFallbackRetryDelayMs,
  getNextFallbackState,
  shouldAutoFallback,
  PLAYER_CLIENTS,
  FORMAT_STRATEGIES,
} from "./fallback-strategy";

describe("download fallback strategy", () => {
  test("default fallback state covers all client/format combinations", () => {
    const state = createDefaultFallbackState();
    expect(state.maxFallbackAttempts).toBe(PLAYER_CLIENTS.length * FORMAT_STRATEGIES.length);
  });

  test("429 error retries same configuration with delay", () => {
    const initial = createDefaultFallbackState();
    const next = getNextFallbackState(
      initial,
      "HTTP Error 429: Too Many Requests",
      "http_429_rate_limited"
    );
    expect(next).not.toBeNull();
    expect(next?.playerClientIndex).toBe(initial.playerClientIndex);
    expect(next?.formatStrategyIndex).toBe(initial.formatStrategyIndex);
    expect(next?.fallbackAttempts).toBe(1);

    const delay = getFallbackRetryDelayMs(
      "HTTP Error 429: Too Many Requests",
      "http_429_rate_limited",
      next?.fallbackAttempts ?? 1
    );
    expect(delay).toBeGreaterThan(0);
  });

  test("ffmpeg errors move to next format strategy", () => {
    const initial = createDefaultFallbackState();
    const next = getNextFallbackState(
      initial,
      "ffmpeg is not installed, cannot merge formats",
      "ffmpeg_missing"
    );
    expect(next).not.toBeNull();
    expect(next?.playerClientIndex).toBe(initial.playerClientIndex);
    expect(next?.formatStrategyIndex).toBe(initial.formatStrategyIndex + 1);
  });

  test("auth errors do not auto fallback", () => {
    expect(shouldAutoFallback("Sign in to confirm you're not a bot", "auth_required")).toBe(false);
  });

  test("spawn/binary availability errors do not auto fallback", () => {
    expect(shouldAutoFallback("yt-dlp binary is not available", "spawn_error")).toBe(false);
  });
});
