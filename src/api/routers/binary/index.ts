import { z } from "zod";
import { publicProcedure, t } from "@/api/trpc";
import { logger } from "@/helpers/logger";
import { app, net } from "electron";
import fs from "fs";
import path from "path";
import os from "os";
import { execSync } from "child_process";
import {
  getDirectLatestDownloadUrl,
  getLatestReleaseApiUrl,
  getYtDlpAssetName,
} from "@/api/utils/ytdlp-utils/ytdlp-utils";
import {
  getFfmpegDownloadUrl,
  getFfmpegBinaryPathInArchive,
  requiresExtraction,
} from "@/api/utils/ffmpeg-utils/ffmpeg-utils";

// Zod schema for GitHub release API response (fault-tolerant)
const githubReleaseSchema = z
  .object({
    tag_name: z.string().optional().catch(undefined),
    assets: z
      .array(
        z.object({
          name: z.string().optional().catch(undefined),
          browser_download_url: z.string().optional().catch(undefined),
        })
      )
      .optional()
      .catch([]),
  })
  .passthrough();

const getBinDir = (): string => path.join(app.getPath("userData"), "bin");
const getVersionFilePath = (): string => path.join(getBinDir(), "yt-dlp-version.txt");
const getBinaryFilePath = (): string => path.join(getBinDir(), getYtDlpAssetName(process.platform));

// FFmpeg helper functions
const getFfmpegVersionFilePath = (): string => path.join(getBinDir(), "ffmpeg-version.txt");
const getFfmpegBinaryFilePath = (): string => {
  const platform = process.platform;
  if (platform === "win32") {
    return path.join(getBinDir(), "ffmpeg.exe");
  }
  return path.join(getBinDir(), "ffmpeg");
};

const ensureBinDir = (): void => {
  const dir = getBinDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

const setExecutableIfNeeded = (filePath: string): void => {
  if (process.platform === "win32") return; // not needed
  try {
    fs.chmodSync(filePath, 0o755);
  } catch (e) {
    logger.error("[ytdlp] Failed to chmod binary", { error: String(e) });
  }
};

const readInstalledVersion = (): string | null => {
  try {
    const p = getVersionFilePath();
    if (fs.existsSync(p)) {
      return fs.readFileSync(p, "utf8").trim() || null;
    }
    return null;
  } catch (e) {
    logger.error("[ytdlp] Failed to read version file", e);
    return null;
  }
};

const writeInstalledVersion = (version: string): void => {
  try {
    fs.writeFileSync(getVersionFilePath(), version, "utf8");
  } catch (e) {
    logger.error("[ytdlp] Failed to write version file", e);
  }
};

// FFmpeg version helpers
const readFfmpegInstalledVersion = (): string | null => {
  try {
    const p = getFfmpegVersionFilePath();
    if (fs.existsSync(p)) {
      return fs.readFileSync(p, "utf8").trim() || null;
    }
    return null;
  } catch (e) {
    logger.error("[ffmpeg] Failed to read version file", e);
    return null;
  }
};

const writeFfmpegInstalledVersion = (version: string): void => {
  try {
    fs.writeFileSync(getFfmpegVersionFilePath(), version, "utf8");
  } catch (e) {
    logger.error("[ffmpeg] Failed to write version file", e);
  }
};

// Extract archive (for Windows zip and Linux tar.xz)
const extractArchive = async (
  archivePath: string,
  extractTo: string,
  platform: NodeJS.Platform
): Promise<{ success: boolean; error?: string }> => {
  try {
    if (platform === "win32") {
      // For Windows, extract zip using PowerShell
      try {
        execSync(
          `powershell -Command "Expand-Archive -Path '${archivePath}' -DestinationPath '${extractTo}' -Force"`,
          { stdio: "ignore" }
        );
        return { success: true };
      } catch {
        // Fallback: try 7z if available
        try {
          execSync(`7z x "${archivePath}" -o"${extractTo}" -y`, { stdio: "ignore" });
          return { success: true };
        } catch {
          return {
            success: false,
            error: "No extraction tool available. Please install 7-Zip or use Windows 10+",
          };
        }
      }
    } else if (platform === "linux") {
      // For Linux, extract tar.xz
      try {
        execSync(`tar -xf "${archivePath}" -C "${extractTo}"`, { stdio: "ignore" });
        return { success: true };
      } catch (e) {
        return {
          success: false,
          error: `Failed to extract tar.xz: ${String(e)}`,
        };
      }
    }
    return { success: false, error: "Unsupported platform for archive extraction" };
  } catch (e) {
    return { success: false, error: `Extraction error: ${String(e)}` };
  }
};

async function fetchLatestRelease(): Promise<{ version: string; assetUrl: string } | null> {
  try {
    const releaseRes = await fetch(getLatestReleaseApiUrl());
    if (!releaseRes.ok) {
      logger.error("[ytdlp] Failed to fetch latest release", { status: releaseRes.status });
      // Fallback to direct latest download URL without version
      return { version: "unknown", assetUrl: getDirectLatestDownloadUrl(process.platform) };
    }
    const json = githubReleaseSchema.parse(await releaseRes.json());
    const tag = (json.tag_name ?? "").replace(/^v/, "");
    const desiredAsset = getYtDlpAssetName(process.platform);
    const asset = json.assets?.find((a) => a.name === desiredAsset);
    const assetUrl = asset?.browser_download_url ?? getDirectLatestDownloadUrl(process.platform);
    return { version: tag || "unknown", assetUrl };
  } catch (e) {
    logger.error("[ytdlp] Exception fetching latest release", e);
    return { version: "unknown", assetUrl: getDirectLatestDownloadUrl(process.platform) };
  }
}

// Return types for binary router endpoints
type GetInstallInfoResult = {
  installed: boolean;
  version: string | null;
  path: string | null;
};

type ResolveLatestResult = {
  version: string;
  assetUrl: string;
} | null;

type DownloadLatestSuccess = {
  success: true;
  path: string;
  version: string;
  alreadyInstalled: boolean;
};

type DownloadLatestFailure = {
  success: false;
  message: string;
};

type DownloadLatestResult = DownloadLatestSuccess | DownloadLatestFailure;

export const binaryRouter = t.router({
  getInstallInfo: publicProcedure.query(async (): Promise<GetInstallInfoResult> => {
    try {
      const binPath = getBinaryFilePath();
      const installed = fs.existsSync(binPath);
      const version = readInstalledVersion();
      return { installed, version, path: installed ? binPath : null };
    } catch (e) {
      logger.error("[ytdlp] getInstallInfo failed", e);
      return { installed: false, version: null, path: null };
    }
  }),

  resolveLatest: publicProcedure.query(async (): Promise<ResolveLatestResult> => {
    const info = await fetchLatestRelease();
    return info;
  }),

  downloadLatest: publicProcedure
    .input(z.object({ force: z.boolean().optional() }).optional())
    .mutation(async ({ input }): Promise<DownloadLatestResult> => {
      ensureBinDir();
      const binPath = getBinaryFilePath();
      if (fs.existsSync(binPath) && !input?.force) {
        const version = readInstalledVersion();
        logger.info("[ytdlp] Binary already installed", { binPath, version });
        return {
          success: true as const,
          path: binPath,
          version: version ?? "unknown",
          alreadyInstalled: true as const,
        };
      }

      const latest = await fetchLatestRelease();
      if (!latest) {
        return { success: false as const, message: "Failed to resolve latest yt-dlp" };
      }

      const tmpPath = path.join(os.tmpdir(), `yt-dlp-${Date.now()}`);

      logger.info("[ytdlp] Download starting", { url: latest.assetUrl });

      const result = await new Promise<{
        ok: boolean;
        error?: string;
      }>((resolve) => {
        let request: ReturnType<typeof net.request> | undefined;
        try {
          request = net.request({ method: "GET", url: latest.assetUrl });
        } catch (err) {
          logger.error("[ytdlp] net.request failed", err);
          return resolve({ ok: false, error: String(err) });
        }

        request.on("response", (response) => {
          const status = response.statusCode ?? 0;
          if (status >= 300 && status < 400) {
            const locationHeader = response.headers["location"] || response.headers["Location"];
            const location = Array.isArray(locationHeader) ? locationHeader[0] : locationHeader;
            if (location) {
              logger.info("[ytdlp] Redirecting", { to: location });
              response.on("data", () => {});
              response.on("end", () => {
                // Follow one redirect by reissuing request
                const follow = net.request({ method: "GET", url: location });
                follow.on("response", (res2) => {
                  if ((res2.statusCode ?? 0) >= 400) {
                    logger.error("[ytdlp] Download failed after redirect", {
                      status: res2.statusCode,
                    });
                    res2.on("data", () => {});
                    res2.on("end", () => resolve({ ok: false, error: `HTTP ${res2.statusCode}` }));
                    return;
                  }
                  const ws = fs.createWriteStream(tmpPath);
                  res2.on("data", (chunk) => ws.write(chunk));
                  res2.on("end", () => {
                    ws.end();
                    resolve({ ok: true });
                  });
                  res2.on("error", (e) => {
                    ws.destroy();
                    resolve({ ok: false, error: String(e) });
                  });
                });
                follow.on("error", (e) => resolve({ ok: false, error: String(e) }));
                follow.end();
              });
              return;
            }
          }

          if (status >= 400) {
            logger.error("[ytdlp] Download failed", { status });
            response.on("data", () => {});
            response.on("end", () => resolve({ ok: false, error: `HTTP ${status}` }));
            return;
          }

          const ws = fs.createWriteStream(tmpPath);
          response.on("data", (chunk) => ws.write(chunk));
          response.on("end", () => {
            ws.end();
            resolve({ ok: true });
          });
          response.on("error", (e) => {
            ws.destroy();
            resolve({ ok: false, error: String(e) });
          });
        });

        request.on("error", (e) => resolve({ ok: false, error: String(e) }));
        request.end();
      });

      if (!result.ok) {
        logger.error("[ytdlp] Download failed", { error: result.error });
        return { success: false as const, message: result.error ?? "Download failed" };
      }

      try {
        // Move tmp to bin path
        fs.copyFileSync(tmpPath, binPath);
        fs.unlinkSync(tmpPath);
        setExecutableIfNeeded(binPath);
        writeInstalledVersion(latest.version);
        logger.info("[ytdlp] Installed", { binPath, version: latest.version });
        return {
          success: true as const,
          path: binPath,
          version: latest.version,
          alreadyInstalled: false as const,
        };
      } catch (e) {
        logger.error("[ytdlp] Failed to finalize installation", e);
        return { success: false as const, message: `Install error: ${String(e)}` };
      }
    }),

  // FFmpeg procedures
  getFfmpegInstallInfo: publicProcedure.query(async (): Promise<GetInstallInfoResult> => {
    try {
      const binPath = getFfmpegBinaryFilePath();
      const installed = fs.existsSync(binPath);
      const version = readFfmpegInstalledVersion();
      return { installed, version, path: installed ? binPath : null };
    } catch (e) {
      logger.error("[ffmpeg] getInstallInfo failed", e);
      return { installed: false, version: null, path: null };
    }
  }),

  downloadFfmpeg: publicProcedure
    .input(z.object({ force: z.boolean().optional() }).optional())
    .mutation(async ({ input }): Promise<DownloadLatestResult> => {
      ensureBinDir();
      const binPath = getFfmpegBinaryFilePath();
      if (fs.existsSync(binPath) && !input?.force) {
        const version = readFfmpegInstalledVersion();
        logger.info("[ffmpeg] Binary already installed", { binPath, version });
        return {
          success: true as const,
          path: binPath,
          version: version ?? "unknown",
          alreadyInstalled: true as const,
        };
      }

      const platform = process.platform;
      const downloadUrl = getFfmpegDownloadUrl(platform);
      const needsExtraction = requiresExtraction(platform);
      const tmpPath = path.join(
        os.tmpdir(),
        `ffmpeg-${Date.now()}${needsExtraction ? (platform === "win32" ? ".zip" : ".tar.xz") : ""}`
      );

      logger.info("[ffmpeg] Download starting", { url: downloadUrl, platform, needsExtraction });

      // Download the file
      const result = await new Promise<{ ok: boolean; error?: string }>((resolve) => {
        const request = net.request(downloadUrl);
        request.on("response", (response) => {
          if (response.statusCode !== 200) {
            resolve({ ok: false, error: `HTTP ${response.statusCode}` });
            return;
          }

          const ws = fs.createWriteStream(tmpPath);
          response.on("data", (chunk) => ws.write(chunk));
          response.on("end", () => {
            ws.end();
            resolve({ ok: true });
          });
          response.on("error", (e) => {
            ws.destroy();
            resolve({ ok: false, error: String(e) });
          });
        });

        request.on("error", (e) => resolve({ ok: false, error: String(e) }));
        request.end();
      });

      if (!result.ok) {
        logger.error("[ffmpeg] Download failed", { error: result.error });
        return { success: false as const, message: result.error ?? "Download failed" };
      }

      try {
        if (needsExtraction) {
          // Extract archive
          const extractDir = path.join(os.tmpdir(), `ffmpeg-extract-${Date.now()}`);
          fs.mkdirSync(extractDir, { recursive: true });

          const extractResult = await extractArchive(tmpPath, extractDir, platform);
          if (!extractResult.success) {
            fs.unlinkSync(tmpPath);
            return { success: false as const, message: extractResult.error ?? "Extraction failed" };
          }

          // Find the ffmpeg binary in the extracted directory
          const binaryPathInArchive = getFfmpegBinaryPathInArchive(platform);
          const extractedBinaryPath = path.join(extractDir, binaryPathInArchive);

          if (!fs.existsSync(extractedBinaryPath)) {
            // Try to find it by searching
            const findBinary = (dir: string): string | null => {
              const entries = fs.readdirSync(dir, { withFileTypes: true });
              for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                  const found = findBinary(fullPath);
                  if (found) return found;
                } else if (entry.name === "ffmpeg" || entry.name === "ffmpeg.exe") {
                  return fullPath;
                }
              }
              return null;
            };

            const foundPath = findBinary(extractDir);
            if (!foundPath) {
              fs.unlinkSync(tmpPath);
              return {
                success: false as const,
                message: "Could not find ffmpeg binary in archive",
              };
            }
            fs.copyFileSync(foundPath, binPath);
          } else {
            fs.copyFileSync(extractedBinaryPath, binPath);
          }

          // Cleanup
          fs.unlinkSync(tmpPath);
          fs.rmSync(extractDir, { recursive: true, force: true });
        } else {
          // Direct binary (macOS)
          fs.copyFileSync(tmpPath, binPath);
          fs.unlinkSync(tmpPath);
        }

        setExecutableIfNeeded(binPath);

        // Get version by running ffmpeg -version
        try {
          const versionOutput = execSync(`"${binPath}" -version`, {
            encoding: "utf8",
            timeout: 5000,
          });
          const versionMatch = versionOutput.match(/ffmpeg version (.+?)(?:\s|$)/);
          const version = versionMatch ? versionMatch[1] : "unknown";
          writeFfmpegInstalledVersion(version);
          logger.info("[ffmpeg] Installed", { binPath, version });
          return {
            success: true as const,
            path: binPath,
            version,
            alreadyInstalled: false as const,
          };
        } catch {
          // If version check fails, still mark as installed
          writeFfmpegInstalledVersion("unknown");
          logger.info("[ffmpeg] Installed (version check failed)", { binPath });
          return {
            success: true as const,
            path: binPath,
            version: "unknown",
            alreadyInstalled: false as const,
          };
        }
      } catch (e) {
        logger.error("[ffmpeg] Failed to finalize installation", e);
        return { success: false as const, message: `Install error: ${String(e)}` };
      }
    }),
});

export type BinaryRouter = typeof binaryRouter;

// Export utilities for use by other routers
export { getBinaryFilePath, getFfmpegBinaryFilePath };
