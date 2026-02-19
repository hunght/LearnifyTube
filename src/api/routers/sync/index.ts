import { z } from "zod";
import { publicProcedure, t } from "@/api/trpc";
import { logger } from "@/helpers/logger";
import { eq } from "drizzle-orm";
import { userPreferences } from "@/api/db/schema";
import defaultDb, { type Database } from "@/api/db";
import type { UserPreferences, SyncPreferences } from "@/lib/types/user-preferences";
import { DEFAULT_USER_PREFERENCES, DEFAULT_SYNC_PREFERENCES } from "@/lib/types/user-preferences";
import {
  getMobileSyncServer,
  getLocalIpAddress,
  type ConnectedDevice,
} from "@/main/mobileSyncServer";
import { getMdnsService, type DiscoveredMobileDevice } from "@/main/mdnsService";

// Return types
export interface SyncStatus {
  enabled: boolean;
  running: boolean;
  ip: string | null;
  port: number;
  connectedDevices: ConnectedDevice[];
  discoveredDevices: DiscoveredMobileDevice[];
}

export interface StartStopResult {
  success: boolean;
  message?: string;
}

export interface ToggleResult {
  success: boolean;
  enabled: boolean;
  running: boolean;
  ip: string | null;
  port: number;
}

// Helper to get sync preferences from database
const getSyncPreferences = async (db: Database): Promise<SyncPreferences> => {
  try {
    const rows = await db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.id, "default"))
      .limit(1);

    if (rows.length === 0 || !rows[0].customizationSettings) {
      return DEFAULT_SYNC_PREFERENCES;
    }

    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    const stored = JSON.parse(rows[0].customizationSettings) as unknown as UserPreferences;
    return {
      ...DEFAULT_SYNC_PREFERENCES,
      ...stored.sync,
    };
  } catch (error) {
    logger.error("[sync] Error getting sync preferences", { error });
    return DEFAULT_SYNC_PREFERENCES;
  }
};

// Helper to update sync preferences in database
const updateSyncPreferences = async (
  db: Database,
  updates: Partial<SyncPreferences>
): Promise<void> => {
  try {
    const rows = await db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.id, "default"))
      .limit(1);

    const storedSettings = rows[0]?.customizationSettings;
    const current = storedSettings
      ? // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        (JSON.parse(storedSettings) as unknown as UserPreferences)
      : DEFAULT_USER_PREFERENCES;

    const updated: UserPreferences = {
      ...current,
      sync: {
        ...DEFAULT_SYNC_PREFERENCES,
        ...current.sync,
        ...updates,
      },
      lastUpdated: Date.now(),
    };

    await db
      .update(userPreferences)
      .set({
        customizationSettings: JSON.stringify(updated),
        updatedAt: Date.now(),
      })
      .where(eq(userPreferences.id, "default"));

    logger.info("[sync] Sync preferences updated", { updates });
  } catch (error) {
    logger.error("[sync] Error updating sync preferences", { error, updates });
    throw error;
  }
};

export const syncRouter = t.router({
  // Get current sync status
  getStatus: publicProcedure.query(async ({ ctx }): Promise<SyncStatus> => {
    const db = ctx.db ?? defaultDb;
    const prefs = await getSyncPreferences(db);
    const server = getMobileSyncServer();
    const mdns = getMdnsService();

    return {
      enabled: prefs.enabled,
      running: server.isRunning(),
      ip: getLocalIpAddress(),
      port: server.isRunning() ? server.getPort() : prefs.port,
      connectedDevices: server.isRunning() ? server.getConnectedDevices() : [],
      discoveredDevices: server.isRunning() ? mdns.getDiscoveredDevices() : [],
    };
  }),

  // Start the sync server
  start: publicProcedure
    .input(
      z
        .object({
          port: z.number().min(1024).max(65535).optional(),
        })
        .optional()
    )
    .mutation(async ({ input, ctx }): Promise<StartStopResult> => {
      const db = ctx.db ?? defaultDb;
      const server = getMobileSyncServer();

      if (server.isRunning()) {
        return { success: true, message: "Server already running" };
      }

      try {
        const prefs = await getSyncPreferences(db);
        const port = input?.port ?? prefs.port;
        await server.start(port);
        logger.info("[sync] Mobile sync server started", { port: server.getPort() });
        return { success: true };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error("[sync] Failed to start mobile sync server", { error });
        return { success: false, message };
      }
    }),

  // Stop the sync server
  stop: publicProcedure.mutation(async (): Promise<StartStopResult> => {
    const server = getMobileSyncServer();

    if (!server.isRunning()) {
      return { success: true, message: "Server not running" };
    }

    try {
      await server.stop();
      logger.info("[sync] Mobile sync server stopped");
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("[sync] Failed to stop mobile sync server", { error });
      return { success: false, message };
    }
  }),

  // Toggle sync on/off and persist preference
  toggle: publicProcedure.mutation(async ({ ctx }): Promise<ToggleResult> => {
    const db = ctx.db ?? defaultDb;
    const prefs = await getSyncPreferences(db);
    const server = getMobileSyncServer();
    const newEnabled = !prefs.enabled;

    try {
      if (newEnabled) {
        // Enable and start
        if (!server.isRunning()) {
          await server.start(prefs.port);
        }
      } else {
        // Disable and stop
        if (server.isRunning()) {
          await server.stop();
        }
      }

      // Persist the preference
      await updateSyncPreferences(db, { enabled: newEnabled });

      logger.info("[sync] Mobile sync toggled", { enabled: newEnabled });

      return {
        success: true,
        enabled: newEnabled,
        running: server.isRunning(),
        ip: getLocalIpAddress(),
        port: server.isRunning() ? server.getPort() : prefs.port,
      };
    } catch (error) {
      logger.error("[sync] Failed to toggle mobile sync", { error });
      return {
        success: false,
        enabled: prefs.enabled,
        running: server.isRunning(),
        ip: getLocalIpAddress(),
        port: prefs.port,
      };
    }
  }),

  // Update sync port preference
  updatePort: publicProcedure
    .input(z.object({ port: z.number().min(1024).max(65535) }))
    .mutation(async ({ input, ctx }): Promise<StartStopResult> => {
      const db = ctx.db ?? defaultDb;

      try {
        await updateSyncPreferences(db, { port: input.port });

        // If server is running, restart with new port
        const server = getMobileSyncServer();
        if (server.isRunning()) {
          await server.stop();
          await server.start(input.port);
        }

        logger.info("[sync] Sync port updated", { port: input.port });
        return { success: true };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error("[sync] Failed to update sync port", { error });
        return { success: false, message };
      }
    }),
});
