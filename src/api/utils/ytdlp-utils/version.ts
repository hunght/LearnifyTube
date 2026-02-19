const VERSION_TOKEN_REGEX = /[^0-9]+/g;

const parseVersionTokens = (version: string): number[] => {
  const normalized = version.trim().replace(/^v/i, "");
  return normalized
    .split(VERSION_TOKEN_REGEX)
    .filter((token) => token.length > 0)
    .map((token) => Number.parseInt(token, 10))
    .filter((value) => Number.isFinite(value));
};

/**
 * Compare two yt-dlp version strings.
 * Returns:
 * - 1 when `left` is newer than `right`
 * - -1 when `left` is older than `right`
 * - 0 when equal or not comparable
 */
export const compareYtDlpVersions = (left: string, right: string): number => {
  const leftParts = parseVersionTokens(left);
  const rightParts = parseVersionTokens(right);

  if (leftParts.length === 0 || rightParts.length === 0) {
    return 0;
  }

  const maxLen = Math.max(leftParts.length, rightParts.length);
  for (let i = 0; i < maxLen; i++) {
    const l = leftParts[i] ?? 0;
    const r = rightParts[i] ?? 0;

    if (l > r) return 1;
    if (l < r) return -1;
  }

  return 0;
};

export const isYtDlpUpdateAvailable = (
  installedVersion: string | null,
  latestVersion: string | null
): boolean => {
  if (!installedVersion || !latestVersion) {
    return false;
  }

  return compareYtDlpVersions(latestVersion, installedVersion) > 0;
};
