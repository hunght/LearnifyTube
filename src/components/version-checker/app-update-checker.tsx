import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { trpcClient } from "@/utils/trpc";
import { logger } from "@/helpers/logger";
import { UpdateAvailableModal } from "./update-available-modal";

const UPDATE_CHECK_CACHE_KEY = "learnifytube-last-update-check";
const UPDATE_DISMISSED_KEY = "learnifytube-update-dismissed";
const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

interface UpdateInfo {
  updateAvailable: boolean;
  currentVersion: string;
  latestVersion: string;
  downloadUrl?: string;
  releaseNotes?: string;
}

/**
 * Component that checks for app updates on startup and shows a modal if an update is available.
 * Uses localStorage to cache the check result and avoid checking too frequently.
 */
export function AppUpdateChecker(): React.JSX.Element | null {
  const [showModal, setShowModal] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);

  // Get current app version
  const { data: appVersionResult } = useQuery({
    queryKey: ["learnifytube-app-version"],
    queryFn: () => trpcClient.utils.getAppVersion.query(),
    staleTime: Infinity,
  });

  const currentVersion = appVersionResult?.version ?? "";

  // Check if we should perform an update check
  const shouldCheckForUpdates = useCallback((): boolean => {
    try {
      const lastCheck = localStorage.getItem(UPDATE_CHECK_CACHE_KEY);
      if (!lastCheck) return true;

      const lastCheckTime = parseInt(lastCheck, 10);
      const now = Date.now();
      return now - lastCheckTime > CACHE_DURATION_MS;
    } catch {
      return true;
    }
  }, []);

  // Check if the user dismissed this version's update
  const wasUpdateDismissed = useCallback((version: string): boolean => {
    try {
      const dismissed = localStorage.getItem(UPDATE_DISMISSED_KEY);
      return dismissed === version;
    } catch {
      return false;
    }
  }, []);

  // Mark update check as done
  const markUpdateChecked = useCallback(() => {
    try {
      localStorage.setItem(UPDATE_CHECK_CACHE_KEY, Date.now().toString());
    } catch {
      // Ignore storage errors
    }
  }, []);

  // Mark update as dismissed for this version
  const markUpdateDismissed = useCallback((version: string) => {
    try {
      localStorage.setItem(UPDATE_DISMISSED_KEY, version);
    } catch {
      // Ignore storage errors
    }
  }, []);

  // Perform the update check
  const checkForUpdates = useCallback(async () => {
    if (!currentVersion) return;
    if (!shouldCheckForUpdates()) {
      logger.info("[app-update-checker] Skipping update check (cached)");
      return;
    }

    try {
      logger.info("[app-update-checker] Checking for updates...");
      const result = await trpcClient.utils.checkForUpdates.query();
      markUpdateChecked();

      if (result.updateAvailable) {
        logger.info("[app-update-checker] Update available:", result.latestVersion);

        // Check if user dismissed this version
        if (wasUpdateDismissed(result.latestVersion)) {
          logger.info("[app-update-checker] Update was dismissed by user");
          return;
        }

        setUpdateInfo({
          updateAvailable: true,
          currentVersion: result.currentVersion,
          latestVersion: result.latestVersion,
          downloadUrl: result.downloadUrl,
          releaseNotes: result.releaseNotes,
        });
        setShowModal(true);
      } else {
        logger.info("[app-update-checker] App is up to date");
      }
    } catch (error) {
      logger.error("[app-update-checker] Failed to check for updates", error);
    }
  }, [currentVersion, shouldCheckForUpdates, markUpdateChecked, wasUpdateDismissed]);

  // Check for updates on mount
  useEffect(() => {
    if (currentVersion) {
      void checkForUpdates();
    }
  }, [currentVersion, checkForUpdates]);

  const handleModalClose = useCallback(
    (open: boolean) => {
      setShowModal(open);
      if (!open && updateInfo?.latestVersion) {
        // User dismissed the modal, remember this version
        markUpdateDismissed(updateInfo.latestVersion);
      }
    },
    [updateInfo?.latestVersion, markUpdateDismissed]
  );

  if (!updateInfo || !showModal) {
    return null;
  }

  return (
    <UpdateAvailableModal
      open={showModal}
      onOpenChange={handleModalClose}
      currentVersion={updateInfo.currentVersion}
      latestVersion={updateInfo.latestVersion}
      downloadUrl={updateInfo.downloadUrl ?? ""}
      releaseNotes={updateInfo.releaseNotes}
    />
  );
}
