import { BrowserWindow, Tray } from "electron";
import { addThemeEventListeners } from "./theme/theme-listeners";
// import { addWindowEventListeners } from "./window/window-listeners"; // Now handled by tRPC
import { addNotificationEventListeners } from "./notification/notification-listeners";

export default function registerListeners(_mainWindow: BrowserWindow, _tray: Tray | null): void {
  // Register listeners (window listeners now handled by tRPC)
  // addWindowEventListeners(mainWindow, tray); // Converted to tRPC
  addThemeEventListeners();
  addNotificationEventListeners();
}
