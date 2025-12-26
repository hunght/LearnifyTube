import { z } from "zod";
import { publicProcedure, t } from "@/api/trpc";
import { BrowserWindow, Tray } from "electron";
import { logger } from "@/helpers/logger";

// Global references to main window and tray
let mainWindowRef: BrowserWindow | null = null;
let trayRef: Tray | null = null;

// Function to set references (called from main process)
export const setWindowReferences = (mainWindow: BrowserWindow, tray: Tray | null): void => {
  mainWindowRef = mainWindow;
  trayRef = tray;
};

// Return types for window router endpoints
type WindowActionResult = {
  success: true;
};

export const windowRouter = t.router({
  // WIN_MINIMIZE_CHANNEL
  minimize: publicProcedure.mutation(async (): Promise<WindowActionResult> => {
    try {
      if (!mainWindowRef) {
        throw new Error("Main window not available");
      }
      mainWindowRef.minimize();
      return { success: true };
    } catch (error) {
      logger.error("Failed to minimize window", { error });
      throw error;
    }
  }),

  // WIN_MAXIMIZE_CHANNEL
  maximize: publicProcedure.mutation(async (): Promise<WindowActionResult> => {
    try {
      if (!mainWindowRef) {
        throw new Error("Main window not available");
      }

      if (mainWindowRef.isMaximized()) {
        mainWindowRef.unmaximize();
      } else {
        mainWindowRef.maximize();
      }
      return { success: true };
    } catch (error) {
      logger.error("Failed to maximize/unmaximize window", { error });
      throw error;
    }
  }),

  // WIN_CLOSE_CHANNEL
  close: publicProcedure.mutation(async (): Promise<WindowActionResult> => {
    try {
      if (!mainWindowRef) {
        throw new Error("Main window not available");
      }
      mainWindowRef.close();
      return { success: true };
    } catch (error) {
      logger.error("Failed to close window", { error });
      throw error;
    }
  }),

  // WIN_UPDATE_TRAY_TITLE_CHANNEL
  updateTrayTitle: publicProcedure
    .input(z.object({ title: z.string() }))
    .mutation(async ({ input }): Promise<WindowActionResult> => {
      try {
        if (!trayRef) {
          throw new Error("Tray not available");
        }
        trayRef.setTitle(input.title);
        return { success: true };
      } catch (error) {
        logger.error("Failed to update tray title", { error, title: input.title });
        throw error;
      }
    }),
});
