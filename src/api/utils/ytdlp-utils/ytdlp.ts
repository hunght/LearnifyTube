import { spawn, type StdioOptions } from "node:child_process";
import { logger } from "@/helpers/logger";

/**
 * Helper to extract video ID from YouTube URL
 */
export function extractVideoId(url: string): string | undefined {
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return match?.[1];
}

/**
 * Wrapper around spawn() that logs all yt-dlp invocations for cost tracking.
 * Logs: command, arguments, operation type, and timing information.
 */
export function spawnYtDlpWithLogging(
  binPath: string,
  args: string[],
  options: { stdio?: StdioOptions },
  context: {
    operation: string;
    url?: string;
    videoId?: string;
    channelId?: string;
    playlistId?: string;
    other?: Record<string, unknown>;
  }
): ReturnType<typeof spawn> {
  const startTime = Date.now();

  // Add default extractor args for YouTube to suppress JS runtime warning
  // See: https://github.com/yt-dlp/yt-dlp/wiki/EJS
  const finalArgs = [...args, "--extractor-args", "youtube:player_client=default"];

  const fullCommand = `${binPath} ${finalArgs.join(" ")}`;

  logger.info("[yt-dlp] CALL_START", {
    operation: context.operation,
    command: fullCommand,
    args: finalArgs,
    url: context.url,
    videoId: context.videoId,
    channelId: context.channelId,
    playlistId: context.playlistId,
    ...context.other,
    timestamp: new Date().toISOString(),
  });

  const proc = spawn(binPath, finalArgs, options);

  // Track process lifecycle
  proc.on("spawn", () => {
    logger.debug("[yt-dlp] PROCESS_SPAWNED", {
      operation: context.operation,
      pid: proc.pid,
    });
  });

  let stdoutData = "";
  let stderrData = "";

  if (proc.stdout) {
    proc.stdout.on("data", (d: Buffer | string) => {
      stdoutData += d.toString();
    });
  }

  if (proc.stderr) {
    proc.stderr.on("data", (d: Buffer | string) => {
      stderrData += d.toString();
    });
  }

  proc.on("close", (code, signal) => {
    const durationMs = Date.now() - startTime;
    const success = code === 0;

    if (success) {
      logger.info("[yt-dlp] CALL_SUCCESS", {
        operation: context.operation,
        exitCode: code,
        signal,
        durationMs,
        stdoutLength: stdoutData.length,
        stderrLength: stderrData.length,
        url: context.url,
        videoId: context.videoId,
        channelId: context.channelId,
        playlistId: context.playlistId,
      });
    } else {
      logger.error("[yt-dlp] CALL_FAILED", {
        operation: context.operation,
        exitCode: code,
        signal,
        durationMs,
        error: stderrData || `Process exited with code ${code}`,
        stdoutLength: stdoutData.length,
        stderrLength: stderrData.length,
        url: context.url,
        videoId: context.videoId,
        channelId: context.channelId,
        playlistId: context.playlistId,
      });
    }
  });

  proc.on("error", (err) => {
    const durationMs = Date.now() - startTime;
    logger.error("[yt-dlp] CALL_ERROR", {
      operation: context.operation,
      error: String(err),
      durationMs,
      url: context.url,
      videoId: context.videoId,
      channelId: context.channelId,
      playlistId: context.playlistId,
    });
  });

  return proc;
}

export const runYtDlpJson = async (binPath: string, url: string): Promise<unknown> => {
  const startTime = Date.now();

  const metaJson = await new Promise<string>((resolve, reject) => {
    const proc = spawnYtDlpWithLogging(
      binPath,
      ["-J", url],
      { stdio: ["ignore", "pipe", "pipe"] },
      {
        operation: "fetch_metadata",
        url,
        videoId: extractVideoId(url),
      }
    );
    let out = "";
    let err = "";

    proc.stdout?.on("data", (d: Buffer | string) => {
      out += d.toString();
    });

    proc.stderr?.on("data", (d: Buffer | string) => {
      err += d.toString();
    });

    proc.on("error", (error) => {
      const duration = Date.now() - startTime;
      logger.error("[yt-dlp] runYtDlpJson process error", {
        url,
        durationMs: duration,
        error: String(error),
      });
      reject(error);
    });

    // Add timeout to detect hanging processes
    const timeout = setTimeout(() => {
      const duration = Date.now() - startTime;
      logger.error("[yt-dlp] runYtDlpJson timeout", {
        url,
        durationMs: duration,
        timeoutMs: 120000,
        pid: proc.pid,
      });
      proc.kill("SIGTERM");
      reject(new Error(`yt-dlp timeout after ${duration}ms for URL: ${url}`));
    }, 120000); // 2 minute timeout

    proc.on("close", (code, signal) => {
      clearTimeout(timeout);

      if (code === 0) {
        if (out.length === 0) {
          logger.warn("[yt-dlp] runYtDlpJson got empty stdout", { url });
          reject(new Error("yt-dlp returned empty output"));
        } else {
          resolve(out);
        }
      } else {
        logger.error("[yt-dlp] runYtDlpJson process failed", {
          url,
          exitCode: code,
          signal,
          stderr: err.substring(0, 1000),
        });
        reject(new Error(err || `yt-dlp -J exited with code ${code}`));
      }
    });
  });

  try {
    return JSON.parse(metaJson);
  } catch (parseError) {
    logger.error("[yt-dlp] runYtDlpJson JSON parse failed", {
      url,
      error: parseError instanceof Error ? parseError.message : String(parseError),
    });
    throw parseError;
  }
};
