import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { app } from "electron";
import { logger } from "@/helpers/logger";

const getTargetBinaryName = (): string => (process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg");

const getUserDataBinaryPath = (): string => {
  const binDir = path.join(app.getPath("userData"), "bin");
  fs.mkdirSync(binDir, { recursive: true });
  return path.join(binDir, getTargetBinaryName());
};

const resolveAsarAwarePath = (maybeAsarPath: string): string | null => {
  if (fs.existsSync(maybeAsarPath)) {
    return maybeAsarPath;
  }

  if (maybeAsarPath.includes("app.asar")) {
    const unpackedPath = maybeAsarPath.replace("app.asar", "app.asar.unpacked");
    if (fs.existsSync(unpackedPath)) {
      return unpackedPath;
    }
  }

  return null;
};

const getFfmpegStaticSource = (): string | null => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const ffmpegStatic: string | undefined = require("ffmpeg-static");
    if (!ffmpegStatic || typeof ffmpegStatic !== "string") {
      return null;
    }
    const resolved = resolveAsarAwarePath(ffmpegStatic);
    if (!resolved) {
      logger.warn("[ffmpeg-static] Source binary not found", { ffmpegStatic });
    }
    return resolved;
  } catch (error) {
    logger.debug("[ffmpeg-static] require failed", { error });
    return null;
  }
};

const copyIfNeeded = (sourcePath: string, targetPath: string): void => {
  let needsCopy = true;
  try {
    if (fs.existsSync(targetPath)) {
      const sourceStats = fs.statSync(sourcePath);
      const targetStats = fs.statSync(targetPath);
      needsCopy =
        sourceStats.size !== targetStats.size || sourceStats.mtimeMs > targetStats.mtimeMs;
    }
  } catch {
    needsCopy = true;
  }

  if (!needsCopy) {
    return;
  }

  fs.copyFileSync(sourcePath, targetPath);
  if (process.platform !== "win32") {
    fs.chmodSync(targetPath, 0o755);
  }
  logger.info("[ffmpeg-static] Copied binary to userData/bin", { targetPath });
};

const safeGetVersion = (binaryPath: string): string | null => {
  try {
    const output = execSync(`"${binaryPath}" -version`, {
      encoding: "utf-8",
      timeout: 5000,
    });
    const match = output.match(/ffmpeg version ([^\s]+)/);
    return match ? match[1] : "unknown";
  } catch (error) {
    logger.debug("[ffmpeg-static] Unable to determine ffmpeg version", { error });
    return null;
  }
};

export const ensureFfmpegStaticAvailable = (): { path: string | null; version: string | null } => {
  const sourcePath = getFfmpegStaticSource();
  if (!sourcePath) {
    return { path: null, version: null };
  }

  const targetPath = getUserDataBinaryPath();
  copyIfNeeded(sourcePath, targetPath);
  const version = safeGetVersion(targetPath);
  return { path: targetPath, version };
};
