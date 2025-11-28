import { spawn } from "child_process";
import { app } from "electron";
import path from "path";
import { requireQueueManager } from "./queue-manager";
import type { Database } from "@/api/db";
import type { WorkerState } from "./types";
import fs from "fs";
import { logger } from "@/helpers/logger";

/**
 * Active download workers
 * Maps download ID to worker state
 */
const activeWorkers = new Map<string, WorkerState>();

/**
 * Get yt-dlp binary filename based on platform
 */
const getYtDlpAssetName = (platform: NodeJS.Platform): string => {
  switch (platform) {
    case "win32":
      return "yt-dlp.exe";
    case "darwin":
      return "yt-dlp_macos";
    default:
      return "yt-dlp";
  }
};

/**
 * Get yt-dlp binary path
 */
const getYtDlpPath = (): string => {
  const binDir = path.join(app.getPath("userData"), "bin");
  return path.join(binDir, getYtDlpAssetName(process.platform));
};

/**
 * Spawn a download worker for a queued item
 */
export const spawnDownload = async (
  db: Database,
  downloadId: string,
  videoId: string | null,
  url: string,
  format: string | null,
  outputPath: string
): Promise<void> => {
  try {
    // Check if already downloading
    if (activeWorkers.has(downloadId)) {
      logger.warn(`Download already active`, { downloadId });
      return;
    }

    // Status will be updated by queue manager before calling this function

    // Get yt-dlp binary path
    const ytDlpPath = getYtDlpPath();

    // Build yt-dlp command arguments
    const args = [
      url,
      "--newline", // Output progress on new lines
      "--no-playlist", // Don't download playlists
      "-o",
      outputPath,
      // Ensure proper merging when separate video+audio streams are downloaded
      // Note: Since we now prefer single-file formats, merging should be rare
      "--no-mtime", // Don't set file modification time (avoids merge issues)
    ];

    // Add format if specified, otherwise prefer WebM or H.264-compatible MP4
    let selectedFormat: string;
    if (format) {
      selectedFormat = format;
      args.push("-f", format);
      logger.info("[download-worker] Using user-specified format", {
        downloadId,
        videoId,
        format: selectedFormat,
      });
    } else {
      // Prefer WebM (always works) or H.264 MP4 (Chromium-compatible)
      // Format string with quality restrictions to prevent huge file sizes:
      // - Limit to 1080p max (height<=1080)
      // - Prefer single-file formats (video+audio combined) to avoid merging issues
      // - Only use separate video+audio as last resort
      // Format priority:
      // 1. Single WebM file (video+audio) - best compatibility, no merging
      // 2. Single H.264 MP4 file (video+audio) - good compatibility, no merging
      // 3. Separate WebM video+audio (requires merging)
      // 4. Separate H.264 MP4 video+audio (requires merging)
      // 5. Best available single file
      selectedFormat =
        "best[height<=1080][ext=webm]/best[height<=1080][ext=mp4][vcodec^=avc1]/bestvideo[height<=1080][ext=webm]+bestaudio[ext=webm]/bestvideo[height<=1080][ext=mp4][vcodec^=avc1]+bestaudio[ext=m4a]/best[height<=1080]";
      args.push("-f", selectedFormat);
      logger.info("[download-worker] Using format preference for Chromium compatibility", {
        downloadId,
        videoId,
        preferredFormat: selectedFormat,
        note: "Format priority: Single-file WebM > Single-file H.264 MP4 > Separate WebM streams > Separate MP4 streams > Best available (all max 1080p)",
      });
    }

    // Log full command for debugging
    logger.info("[download-worker] Starting yt-dlp download", {
      downloadId,
      videoId,
      url,
      ytDlpPath,
      outputPath,
      format: selectedFormat,
      fullCommand: `${ytDlpPath} ${args.join(" ")}`,
    });

    // Spawn yt-dlp process
    const process = spawn(ytDlpPath, args);

    // Store worker state
    const worker: WorkerState = {
      downloadId,
      process,
      startTime: Date.now(),
      lastProgressUpdate: Date.now(),
      lastKnownFilePath: undefined,
      outputDir: path.dirname(outputPath),
      videoId,
    };
    activeWorkers.set(downloadId, worker);

    // Store format in closure for completion logging
    const formatUsed = selectedFormat;

    // Handle stdout - parse progress and file path
    process.stdout?.on("data", (data: Buffer) => {
      const output = data.toString();

      // Log format selection messages
      if (output.includes("[info]") || output.includes("format")) {
        logger.debug("[download-worker] yt-dlp info output", { downloadId, videoId, output });
      }

      // Check for format selection - multiple patterns
      // Pattern 1: [info] 123: format description (details)
      const formatMatch = output.match(/\[info\]\s+(\d+):\s+(.+?)(?:\s+\((.+?)\))?/);
      if (formatMatch) {
        const formatDescription = formatMatch[2];
        const formatDetails = formatMatch[3] || "";

        // Extract resolution/height from format description (e.g., "1080p", "720p", "4K")
        const resolutionMatch = formatDescription.match(/(\d+)p|(\d+)x(\d+)|(\d+)K/i);
        let resolution: string | null = null;
        if (resolutionMatch) {
          if (resolutionMatch[1]) {
            resolution = `${resolutionMatch[1]}p`;
          } else if (resolutionMatch[2] && resolutionMatch[3]) {
            resolution = `${resolutionMatch[2]}x${resolutionMatch[3]}`;
          } else if (resolutionMatch[4]) {
            resolution = `${resolutionMatch[4]}K`;
          }
        }

        logger.info("[download-worker] yt-dlp format info", {
          downloadId,
          videoId,
          formatId: formatMatch[1],
          formatDescription,
          formatDetails,
          resolution,
          note: resolution ? `Selected resolution: ${resolution}` : undefined,
        });
      }

      // Pattern 2: [info] Available formats for...
      if (output.includes("Available formats")) {
        logger.debug("[download-worker] yt-dlp listing available formats", {
          downloadId,
          videoId,
          output: output.trim(),
        });
      }

      // Pattern 3: [info] Selecting format...
      if (output.includes("Selecting format") || output.includes("format selected")) {
        logger.info("[download-worker] yt-dlp format selection", {
          downloadId,
          videoId,
          output: output.trim(),
        });
      }

      // Pattern 4: [info] Downloading X format(s): 123+456-789 (video+audio merge)
      const downloadingFormatsMatch = output.match(
        /\[info\].*Downloading\s+(\d+)\s+format\(s\):\s+(.+)/
      );
      if (downloadingFormatsMatch) {
        const formatCount = downloadingFormatsMatch[1];
        const formatIds = downloadingFormatsMatch[2].trim();
        const isMerging = formatIds.includes("+") || formatIds.includes("-");
        logger.info("[download-worker] yt-dlp downloading formats", {
          downloadId,
          videoId,
          formatCount: parseInt(formatCount, 10),
          formatIds,
          isMerging,
          note: isMerging
            ? "Downloading separate video+audio streams (will be merged)"
            : "Downloading single format file",
        });
      }

      // Check for audio-only warnings
      if (
        output.toLowerCase().includes("audio only") ||
        output.toLowerCase().includes("audio-only")
      ) {
        logger.warn("[download-worker] Audio-only format detected", {
          downloadId,
          videoId,
          output: output.trim(),
        });
      }

      // Check for video+audio merging
      if (output.includes("[Merger]") || output.includes("Merging formats")) {
        logger.info("[download-worker] yt-dlp merging video+audio", {
          downloadId,
          videoId,
          output: output.trim(),
        });
      }

      // Check for merge completion
      if (
        output.includes("has already been downloaded") ||
        output.includes("Deleting original file")
      ) {
        logger.debug("[download-worker] yt-dlp post-merge cleanup", {
          downloadId,
          videoId,
          output: output.trim(),
        });
      }

      // Check for merge errors or warnings
      if (
        output.toLowerCase().includes("error merging") ||
        output.toLowerCase().includes("merge failed") ||
        output.toLowerCase().includes("could not merge")
      ) {
        logger.error("[download-worker] yt-dlp merge error detected", {
          downloadId,
          videoId,
          output: output.trim(),
        });
      }

      parseProgressAndMetadata(db, downloadId, output);
    });

    // Handle stderr - log errors and warnings
    process.stderr?.on("data", (data: Buffer) => {
      const errorOutput = data.toString();

      // Log all stderr output for debugging format issues
      logger.info("[download-worker] yt-dlp stderr output", {
        downloadId,
        videoId,
        output: errorOutput.trim(),
      });

      // Check for format-related errors
      if (
        errorOutput.toLowerCase().includes("format") ||
        errorOutput.toLowerCase().includes("codec") ||
        errorOutput.toLowerCase().includes("not available")
      ) {
        logger.warn("[download-worker] Format-related message in stderr", {
          downloadId,
          videoId,
          message: errorOutput.trim(),
        });
      }
    });

    // Handle process completion
    process.on("close", async (code: number | null) => {
      activeWorkers.delete(downloadId);

      if (code === 0) {
        // Success
        const queueManager = requireQueueManager();
        // Determine final path: prefer parsed, else search by [videoId]
        const w = worker;
        let finalPath: string | null = w.lastKnownFilePath ?? null;
        if (!finalPath && w.videoId && w.outputDir && fs.existsSync(w.outputDir)) {
          try {
            const files = fs.readdirSync(w.outputDir);
            const matches = files.filter((f) => f.includes(`[${w.videoId}]`));

            // Check for multiple files (indicates failed merge)
            if (matches.length > 1) {
              logger.warn(
                "[download-worker] Multiple files found for video - merge may have failed",
                {
                  downloadId,
                  videoId,
                  fileCount: matches.length,
                  files: matches,
                  note: "yt-dlp may have downloaded separate video/audio files without merging",
                }
              );
            }

            // Prefer files without format codes (merged files) over format-specific files
            const mergedFile = matches.find((f) => !f.match(/\.f\d+\./));
            const match = mergedFile || matches[0];
            if (match) finalPath = path.join(w.outputDir, match);
          } catch {
            // Ignore file system errors when searching for video file
          }
        }
        const completedPath = finalPath || outputPath;
        await queueManager.markCompleted(downloadId, completedPath);

        // Log file details for debugging format issues
        let fileExtension: string | null = null;
        let fileSize: number | null = null;
        let fileExists = false;

        if (completedPath && fs.existsSync(completedPath)) {
          fileExists = true;
          fileExtension = path.extname(completedPath).toLowerCase();
          try {
            const stats = fs.statSync(completedPath);
            fileSize = stats.size;
          } catch {
            // Ignore stat errors
          }
        }

        logger.info("[download-worker] Download completed successfully", {
          downloadId,
          videoId,
          finalPath: completedPath,
          fileExtension,
          fileSize: fileSize ? `${(fileSize / 1024 / 1024).toFixed(2)} MB` : null,
          fileExists,
          formatUsed,
          note:
            fileExtension === ".webm" && fileSize && fileSize < 10 * 1024 * 1024
              ? "Small WebM file - may be audio-only"
              : undefined,
        });
      } else {
        // Failed
        const queueManager = requireQueueManager();
        await queueManager.markFailed(
          downloadId,
          `yt-dlp exited with code ${code}`,
          "process_error"
        );
        logger.error("[download-worker] Download failed", { downloadId, exitCode: code });
      }
    });

    // Handle process errors
    process.on("error", async (error: Error) => {
      activeWorkers.delete(downloadId);
      const queueManager = requireQueueManager();
      await queueManager.markFailed(downloadId, error.message, "spawn_error");
      logger.error("[download-worker] Download process error", error, { downloadId });
    });
  } catch (error) {
    activeWorkers.delete(downloadId);
    const queueManager = requireQueueManager();
    await queueManager.markFailed(
      downloadId,
      error instanceof Error ? error.message : "Unknown error",
      "spawn_error"
    );
    logger.error("[download-worker] Failed to spawn download", error, { downloadId });
  }
};

/**
 * Parse progress and metadata from yt-dlp output
 */
const parseProgressAndMetadata = (db: Database, downloadId: string, output: string): void => {
  // Parse comprehensive download progress information
  // Example formats:
  // "[download]  45.3% of 10.5MiB at 1.2MiB/s ETA 00:15"
  // "[download]  45.3% of ~10.5MiB at 1.2MiB/s ETA 00:15"
  // "[download] 100% of 10.5MiB in 00:08"

  const progressLineMatch = output.match(
    /\[download\]\s+(\d+(?:\.\d+)?)%(?:\s+of\s+~?([\d.]+(?:K|M|G)?i?B))?(?:\s+at\s+([\d.]+(?:K|M|G)?i?B\/s))?(?:\s+ETA\s+([\d:]+))?/i
  );

  if (progressLineMatch) {
    const progress = parseFloat(progressLineMatch[1]);
    const totalSize = progressLineMatch[2] || null;
    const speed = progressLineMatch[3] || null;
    const eta = progressLineMatch[4] || null;

    // Calculate downloaded size if we have total size and progress
    let downloadedSize: string | null = null;
    if (totalSize && progress > 0) {
      const totalBytes = parseSize(totalSize);
      if (totalBytes > 0) {
        const downloadedBytes = (totalBytes * progress) / 100;
        downloadedSize = formatSize(downloadedBytes);
      }
    }

    // Update progress in database (throttled)
    const worker = activeWorkers.get(downloadId);
    if (worker) {
      const now = Date.now();
      // Update at most every 500ms
      if (now - worker.lastProgressUpdate >= 500) {
        worker.lastProgressUpdate = now;
        const queueManager = requireQueueManager();
        queueManager
          .updateProgress(downloadId, Math.round(progress), {
            downloadSpeed: speed,
            downloadedSize,
            totalSize,
            eta,
          })
          .catch((err: Error) =>
            logger.error("[download-worker] Failed to update progress", err, { downloadId })
          );
      }
    }
  }

  // Look for destination/merged file path
  // Example: [download] Destination: /path/to/file.mp4
  const destMatch = output.match(/\[download\]\s+Destination:\s+(.+)/);
  // Example: [Merger] Merging formats into "/path/to/file.mp4"
  const mergeMatch = output.match(/\[Merger\]\s+Merging formats into\s+"(.+?)"/);

  const foundPath = destMatch?.[1] || mergeMatch?.[1];
  if (foundPath) {
    const worker = activeWorkers.get(downloadId);
    if (worker) {
      // Normalize quotes and whitespace
      const cleaned = foundPath.replace(/^"|"$/g, "").trim();
      worker.lastKnownFilePath = cleaned;
    }
  }
};

/**
 * Parse size string to bytes (e.g., "10.5MiB" -> bytes)
 */
const parseSize = (sizeStr: string): number => {
  const match = sizeStr.match(/([\d.]+)\s*(K|M|G)?(i)?B/i);
  if (!match) return 0;

  const value = parseFloat(match[1]);
  const unit = match[2]?.toUpperCase() || "";
  const isBinary = match[3] === "i"; // MiB vs MB

  const multiplier = isBinary ? 1024 : 1000;

  switch (unit) {
    case "K":
      return value * multiplier;
    case "M":
      return value * Math.pow(multiplier, 2);
    case "G":
      return value * Math.pow(multiplier, 3);
    default:
      return value;
  }
};

/**
 * Format bytes to human-readable size
 */
const formatSize = (bytes: number): string => {
  const units = ["B", "KiB", "MiB", "GiB"];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(1)}${units[unitIndex]}`;
};

/**
 * Kill a download worker
 */
export const killDownload = (downloadId: string): boolean => {
  const worker = activeWorkers.get(downloadId);
  if (worker?.process) {
    worker.process.kill("SIGTERM");
    activeWorkers.delete(downloadId);
    return true;
  }
  return false;
};
