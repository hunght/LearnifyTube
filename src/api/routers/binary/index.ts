import { z } from "zod";
import { publicProcedure, t } from "@/api/trpc";
import { logger } from "@/helpers/logger";
import { app, net } from "electron";
import fs from "fs";
import path from "path";
import os from "os";
import {
  getDirectLatestDownloadUrl,
  getLatestReleaseApiUrl,
  getYtDlpAssetName,
} from "@/api/utils/ytdlp-utils/ytdlp-utils";

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
});

export type BinaryRouter = typeof binaryRouter;

// Export utilities for use by other routers
export { getBinaryFilePath };
