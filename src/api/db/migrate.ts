import { migrate } from "drizzle-orm/libsql/migrator";
import { sql } from "drizzle-orm";
import { z } from "zod";
import fs from "fs";
import path from "path";
import { getDatabasePath } from "../../utils/paths";
import db from ".";
import { logger } from "../../helpers/logger";

// Safely import app from electron, might not be available in non-Electron contexts
let app: Electron.App | null = null;

// Initialize app asynchronously
const initApp = async (): Promise<void> => {
  try {
    const electron = await import("electron");
    app = electron.app;
  } catch {
    app = null;
  }
};

// Start initialization immediately
void initApp();

// Zod schemas for validation
const packageJsonSchema = z.object({
  version: z.string(),
});

const integrityCheckSchema = z.object({
  integrity_check: z.string(),
});

const pragmaHashSchema = z.object({
  hash: z.string(),
});

interface MigrationOptions {
  verifyOnly?: boolean;
  createBackup?: boolean;
  force?: boolean;
}

/**
 * Creates a backup of the database before running migrations
 */
async function createDatabaseBackup(dbPath: string): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  // Use package.json version when running outside Electron, app version when inside
  let appVersion: string;
  try {
    appVersion = app?.getVersion() || "unknown";
  } catch {
    // Fallback to package.json version when not in Electron context
    try {
      const packageJsonPath = path.join(__dirname, "../../../package.json");
      const packageJsonContent = fs.readFileSync(packageJsonPath, "utf8");
      const packageJson = packageJsonSchema.parse(JSON.parse(packageJsonContent));
      appVersion = packageJson.version;
    } catch {
      appVersion = "unknown";
    }
  }
  const backupPath = `${dbPath}.${appVersion}.${timestamp}.backup`;

  if (fs.existsSync(dbPath)) {
    logger.info(`Creating database backup: ${backupPath}`);
    fs.copyFileSync(dbPath, backupPath);

    // Keep only the last 5 backups to avoid disk space issues
    const backupDir = path.dirname(dbPath);
    const files = fs
      .readdirSync(backupDir)
      .filter((file) => file.startsWith(path.basename(dbPath)) && file.includes(".backup"))
      .map((file) => ({
        name: file,
        path: path.join(backupDir, file),
        stat: fs.statSync(path.join(backupDir, file)),
      }))
      .sort((a, b) => b.stat.mtime.getTime() - a.stat.mtime.getTime());

    // Remove old backups, keep only the 5 most recent
    if (files.length > 5) {
      for (let i = 5; i < files.length; i++) {
        logger.info(`Removing old backup: ${files[i].name}`);
        fs.unlinkSync(files[i].path);
      }
    }

    return backupPath;
  }

  throw new Error("Database file not found for backup");
}

/**
 * Validates database schema integrity
 */
async function validateDatabaseIntegrity(): Promise<boolean> {
  try {
    // Check if we can connect and run a simple query
    await db.run(sql`SELECT 1`);

    // Check database pragma for corruption
    const result: unknown[] = await db.all(sql`PRAGMA integrity_check`);
    const parseResult = result[0] ? integrityCheckSchema.safeParse(result[0]) : null;
    const isValid = parseResult?.success && parseResult.data.integrity_check === "ok";

    if (!isValid) {
      logger.error("Database integrity check failed:", result);
      return false;
    }

    logger.info("Database integrity check passed");
    return true;
  } catch (error) {
    logger.error("Database validation failed:", error);
    return false;
  }
}

/**
 * Gets the current database version/migration state
 */
async function getCurrentMigrationState(): Promise<string | null> {
  try {
    // Check if the migrations table exists
    const result = await db.all(sql`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name='__drizzle_migrations'
    `);

    if (result.length === 0) {
      logger.info("No migrations table found - fresh database");
      return null;
    }

    // Get the latest migration
    const migrationResult: unknown[] = await db.all(sql`
      SELECT hash FROM __drizzle_migrations
      ORDER BY created_at DESC
      LIMIT 1
    `);

    if (migrationResult.length > 0) {
      const parseResult = pragmaHashSchema.safeParse(migrationResult[0]);
      if (parseResult.success) {
        const latestHash = String(parseResult.data.hash);
        logger.info(`Current migration state: ${latestHash}`);
        return latestHash;
      }
    }

    return null;
  } catch (error) {
    logger.warn("Could not determine migration state:", error);
    return null;
  }
}

/**
 * Ensures database directory and file exist
 */
async function ensureDatabaseExists(dbPath: string): Promise<void> {
  const dbDir = path.dirname(dbPath);
  logger.info("Database directory:", dbDir);

  // Create database directory if it doesn't exist
  if (!fs.existsSync(dbDir)) {
    logger.info("Creating database directory...");
    fs.mkdirSync(dbDir, { recursive: true });
  }

  // Create empty database file if it doesn't exist
  if (!fs.existsSync(dbPath)) {
    logger.info("Creating empty database file...");
    fs.writeFileSync(dbPath, "");
  }
}

/**
 * Main migration function with comprehensive error handling
 */
async function runMigrations(options: MigrationOptions = {}): Promise<void> {
  const dbPath = getDatabasePath().replace("file:", "");
  logger.info("Database path:", dbPath);

  // Ensure database exists
  await ensureDatabaseExists(dbPath);

  // Validate database integrity before migration
  if (fs.existsSync(dbPath) && fs.statSync(dbPath).size > 0) {
    const isValid = await validateDatabaseIntegrity();
    if (!isValid && !options.force) {
      throw new Error("Database integrity check failed. Use --force to proceed anyway.");
    }
  }

  // Get current migration state
  const currentState = await getCurrentMigrationState();
  logger.info("Current migration state:", currentState || "none");

  // Create backup before migration (unless it's a fresh database)
  if (options.createBackup && fs.existsSync(dbPath) && fs.statSync(dbPath).size > 0) {
    await createDatabaseBackup(dbPath);
  }

  // Resolve migrations path with multiple fallbacks to support centralized package
  const candidatePaths: string[] = [];
  try {
    if (app?.isPackaged) {
      // Packaged: expect migrations bundled into resources
      candidatePaths.push(path.join(process.resourcesPath, "drizzle"));
    } else {
      // Dev: first, conventional local folder next to app
      candidatePaths.push(path.join(app?.getAppPath() || process.cwd(), "drizzle"));
    }
  } catch {
    // Not in Electron context
    candidatePaths.push(path.join(process.cwd(), "drizzle"));
  }

  // Additional fallbacks pointing to the shared database package
  candidatePaths.push(
    // From apps/electron -> packages/database/drizzle
    path.resolve(process.cwd(), "../../packages/database/drizzle"),
    // From repo root (in case cwd differs)
    path.resolve(process.cwd(), "packages/database/drizzle"),
    // Relative to compiled file location
    path.resolve(__dirname, "../../../../packages/database/drizzle"),
    path.resolve(__dirname, "../../../packages/database/drizzle")
  );

  const migrationsPath = candidatePaths.find((p) => fs.existsSync(p));

  logger.info("Migrations folder resolution candidates:", JSON.stringify(candidatePaths, null, 2));
  logger.info("Selected migrations folder:", migrationsPath || "<none>");

  if (!migrationsPath) {
    throw new Error(`Migrations folder not found. Checked: \n${candidatePaths.join("\n")}`);
  }

  if (options.verifyOnly) {
    logger.info("Migration verification completed - no changes made");
    return;
  }

  // Run migrations with transaction safety
  try {
    await migrate(db, { migrationsFolder: migrationsPath });
    logger.info("Database migrations completed successfully");

    // Validate integrity after migration
    const postMigrationValid = await validateDatabaseIntegrity();
    if (!postMigrationValid) {
      throw new Error("Database integrity check failed after migration");
    }

    // Log final migration state
    const finalState = await getCurrentMigrationState();
    logger.info("Final migration state:", finalState);
  } catch (error) {
    logger.error("Migration failed:", error);
    throw error;
  }
}

/**
 * CLI entry point
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const options: MigrationOptions = {
    verifyOnly: args.includes("--verify-only"),
    createBackup: !args.includes("--no-backup"),
    force: args.includes("--force"),
  };

  logger.info("Starting database migration with options:", options);

  try {
    await runMigrations(options);
    logger.info("Migration process completed successfully");
    process.exit(0);
  } catch (error) {
    logger.error("Migration process failed:", error);
    process.exit(1);
  }
}

// Export for use in other modules
export { runMigrations, validateDatabaseIntegrity };

// Run if called directly from CLI (not when imported as a module in Electron app)
// DISABLED: This was causing the app to exit in packaged builds
// To run migrations standalone, use: RUN_MIGRATIONS_STANDALONE=true node path/to/migrate.js
if (process.env.RUN_MIGRATIONS_STANDALONE === "true") {
  main().catch((err) => {
    try {
      logger.error("Migration runner error", err);
    } catch {
      // If logger fails, write directly to stderr as last resort
      process.stderr.write(`Migration runner error: ${err}\n`);
    }
    process.exit(1);
  });
}
