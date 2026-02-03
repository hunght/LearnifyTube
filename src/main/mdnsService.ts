import { Bonjour, Service } from "bonjour-service";
import { app } from "electron";
import * as os from "os";
import { logger } from "../helpers/logger";

/**
 * mDNS service for local network discovery.
 * Publishes the LearnifyTube service so mobile devices can discover it.
 */

const SERVICE_TYPE = "learnify";
const SERVICE_NAME = (): string => `LearnifyTube-${os.hostname()}`;

type MdnsService = {
  publish: (port: number, videoCount: number) => void;
  unpublish: () => void;
  updateVideoCount: (count: number) => void;
  isPublished: () => boolean;
};

const createMdnsService = (): MdnsService => {
  let bonjour: Bonjour | null = null;
  let publishedService: Service | null = null;
  let currentPort = 0;
  let _currentVideoCount = 0;

  logger.info("[mDNS] Creating mDNS service instance");

  const publish = (port: number, videoCount: number): void => {
    logger.info(`[mDNS] Publishing service request: port=${port}, videoCount=${videoCount}`);

    // Unpublish any existing service first
    unpublish();

    try {
      logger.info("[mDNS] Creating Bonjour instance");
      bonjour = new Bonjour();
      currentPort = port;
      _currentVideoCount = videoCount;

      const serviceName = SERVICE_NAME();
      logger.info(`[mDNS] Service name: ${serviceName}`);
      logger.info(`[mDNS] Service type: _${SERVICE_TYPE}._tcp`);

      publishedService = bonjour.publish({
        name: serviceName,
        type: SERVICE_TYPE,
        port,
        txt: {
          videoCount: String(videoCount),
          version: app.getVersion(),
          platform: "desktop",
        },
      });

      logger.info(
        `[mDNS] ✓ Published service: ${serviceName} on port ${port} with ${videoCount} videos`
      );
      logger.info(
        `[mDNS] Service details: _${SERVICE_TYPE}._tcp.local. TXT: videoCount=${videoCount}, platform=desktop`
      );
    } catch (error) {
      logger.error("[mDNS] ✗ Failed to publish service", error);
    }
  };

  const unpublish = (): void => {
    logger.info("[mDNS] Unpublishing service...");

    if (publishedService) {
      try {
        publishedService.stop?.();
        logger.info("[mDNS] ✓ Service stopped");
      } catch (error) {
        logger.error("[mDNS] ✗ Failed to stop service", error);
      }
      publishedService = null;
    }

    if (bonjour) {
      try {
        bonjour.destroy();
        logger.info("[mDNS] ✓ Bonjour instance destroyed");
      } catch (error) {
        logger.error("[mDNS] ✗ Failed to destroy bonjour instance", error);
      }
      bonjour = null;
    }

    currentPort = 0;
    _currentVideoCount = 0;
    logger.info("[mDNS] Service unpublished");
  };

  const updateVideoCount = (count: number): void => {
    logger.info(`[mDNS] Updating video count to ${count}`);
    if (publishedService && currentPort > 0) {
      // Republish with updated video count
      publish(currentPort, count);
    } else {
      logger.warn("[mDNS] Cannot update video count - service not published");
    }
  };

  const isPublished = (): boolean => {
    const published = publishedService !== null;
    logger.debug(`[mDNS] isPublished: ${published}`);
    return published;
  };

  return {
    publish,
    unpublish,
    updateVideoCount,
    isPublished,
  };
};

// Singleton instance
let mdnsServiceInstance: MdnsService | null = null;

export const getMdnsService = (): MdnsService => {
  if (!mdnsServiceInstance) {
    mdnsServiceInstance = createMdnsService();
  }
  return mdnsServiceInstance;
};
