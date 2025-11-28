type SupportedPlatform = NodeJS.Platform;

/**
 * Get the download URL for ffmpeg based on platform
 * Using static builds from:
 * - macOS: https://evermeet.cx/ffmpeg/ (official static builds)
 * - Windows: https://github.com/BtbN/FFmpeg-Builds/releases
 * - Linux: https://johnvansickle.com/ffmpeg/ (static builds)
 */
export const getFfmpegDownloadUrl = (platform: SupportedPlatform): string => {
  switch (platform) {
    case "win32":
      // BtbN FFmpeg builds for Windows
      return "https://github.com/BtbN/FFmpeg-Builds/releases/latest/download/ffmpeg-master-latest-win64-gpl.zip";
    case "darwin": {
      // For macOS, detect architecture
      const arch = process.arch === "arm64" ? "arm64" : "x86_64";
      // Using evermeet.cx static builds (official, well-maintained)
      return `https://evermeet.cx/ffmpeg/ffmpeg-${arch}`;
    }
    case "linux":
    default: {
      // For Linux, use John Van Sickle's static builds
      const arch = process.arch === "arm64" ? "arm64" : "amd64";
      return `https://johnvansickle.com/ffmpeg/builds/ffmpeg-git-${arch}-static.tar.xz`;
    }
  }
};

/**
 * Check if the platform requires extracting from archive
 */
export const requiresExtraction = (platform: SupportedPlatform): boolean => {
  return platform === "win32" || platform === "linux";
};

/**
 * Get the path to ffmpeg binary inside the archive (for Windows/Linux)
 */
export const getFfmpegBinaryPathInArchive = (platform: SupportedPlatform): string => {
  switch (platform) {
    case "win32":
      return "ffmpeg-master-latest-win64-gpl/bin/ffmpeg.exe";
    case "linux":
      return "ffmpeg";
    default:
      return "ffmpeg";
  }
};
