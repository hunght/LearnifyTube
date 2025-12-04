import {
  NOTIFICATION_SEND_CHANNEL,
  NOTIFICATION_CLOSE_CHANNEL,
  NOTIFICATION_ACTION_CHANNEL,
} from "./notification-channels";

import { safelyRegisterListener } from "../safelyRegisterListener";
import { closeNotificationWindow } from "../../../main/windows/notification";
import { sendNotificationToWindow } from "../../notification/notification-window-utils";
import { logger } from "../../logger";

export const addNotificationEventListeners = (): void => {
  logger.debug("NotificationListeners: Adding notification listeners");

  // Send notification handler
  safelyRegisterListener(NOTIFICATION_SEND_CHANNEL, async (_event, data) => {
    try {
      logger.debug("Notification requested", data);
      await sendNotificationToWindow(data);
    } catch (error) {
      logger.error("Failed to send notification", error);
    }
  });

  // Close notification handler
  safelyRegisterListener(NOTIFICATION_CLOSE_CHANNEL, async () => {
    try {
      logger.debug("Closing notification window");
      closeNotificationWindow();
      logger.debug("Notification window close command sent");
    } catch (error) {
      logger.error("Failed to close notification window", { error });
      throw error; // Re-throw so the IPC call fails appropriately
    }
  });

  // Notification action handler
  safelyRegisterListener(NOTIFICATION_ACTION_CHANNEL, () => {
    try {
      logger.debug("Notification action triggered");
      // You can add custom action handling here
    } catch (error) {
      logger.error("Failed to handle notification action", { error });
    }
  });
};
