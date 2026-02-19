import { compareYtDlpVersions, isYtDlpUpdateAvailable } from "./version";

describe("yt-dlp version utils", () => {
  test("compares date-style versions correctly", () => {
    expect(compareYtDlpVersions("2026.01.08", "2025.12.31")).toBe(1);
    expect(compareYtDlpVersions("2025.12.31", "2026.01.08")).toBe(-1);
    expect(compareYtDlpVersions("2025.12.31", "2025.12.31")).toBe(0);
  });

  test("handles prefixed versions", () => {
    expect(compareYtDlpVersions("v2026.02.01", "2026.01.31")).toBe(1);
  });

  test("treats invalid versions as not comparable", () => {
    expect(compareYtDlpVersions("unknown", "2026.01.01")).toBe(0);
    expect(compareYtDlpVersions("2026.01.01", "unknown")).toBe(0);
  });

  test("detects update availability", () => {
    expect(isYtDlpUpdateAvailable("2026.01.01", "2026.01.02")).toBe(true);
    expect(isYtDlpUpdateAvailable("2026.01.02", "2026.01.02")).toBe(false);
    expect(isYtDlpUpdateAvailable("2026.01.03", "2026.01.02")).toBe(false);
    expect(isYtDlpUpdateAvailable(null, "2026.01.02")).toBe(false);
  });
});
