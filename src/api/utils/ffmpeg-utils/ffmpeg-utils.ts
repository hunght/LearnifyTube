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
      // For macOS, use BtbN FFmpeg builds (same as Windows, supports macOS)
      const arch = process.arch === "arm64" ? "arm64" : "x64";
      // Using BtbN FFmpeg builds - reliable and well-maintained
      // Format: https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-{os}-{arch}-gpl.zip
      return `https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-darwin-${arch}-gpl.zip`;
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
export const requiresExtraction = (_platform: SupportedPlatform): boolean => {
  // All platforms use archives (zip for macOS/Windows, tar.xz for Linux)
  return true;
};

/**
 * Get the path to ffmpeg binary inside the archive
 */
export const getFfmpegBinaryPathInArchive = (platform: SupportedPlatform): string => {
  switch (platform) {
    case "win32":
      return "ffmpeg-master-latest-win64-gpl/bin/ffmpeg.exe";
    case "darwin": {
      // BtbN builds for macOS
      const arch = process.arch === "arm64" ? "arm64" : "x64";
      return `ffmpeg-master-latest-darwin-${arch}-gpl/bin/ffmpeg`;
    }
    case "linux":
      return "ffmpeg";
    default:
      return "ffmpeg";
  }
};
