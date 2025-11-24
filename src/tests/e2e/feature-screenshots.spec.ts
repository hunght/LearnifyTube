import { test, _electron as electron, ElectronApplication, Page } from "@playwright/test";
import { findLatestBuild, parseElectronApp } from "electron-playwright-helpers";
import path from "path";
import fs from "fs";
import { createDashboardPage, type DashboardPage } from "./pages/DashboardPage";
import { createSettingsPage, type SettingsPage } from "./pages/SettingsPage";
import { createChannelsPage, type ChannelsPage } from "./pages/ChannelsPage";
import { createPlayerPage, type PlayerPage } from "./pages/PlayerPage";

/**
 * Test file for taking comprehensive screenshots of LearnifyTube pages.
 */

let electronApp: ElectronApplication;
let page: Page;
let dashboardPage: DashboardPage;
let settingsPage: SettingsPage;
let channelsPage: ChannelsPage;
let playerPage: PlayerPage;

// Create screenshots directory if it doesn't exist
const screenshotsDir = path.join(process.cwd(), "screenshots");
if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir, { recursive: true });
}

test.beforeAll(async () => {
  // Try to find latest build, fallback to dev build
  let latestBuild;
  let appInfo;

  try {
    latestBuild = findLatestBuild();
    console.log("Found latest build:", latestBuild);
    appInfo = parseElectronApp(latestBuild);
    console.log("App info main:", appInfo.main);
  } catch (error) {
    console.log("No packaged build found, using development build");
    // Use development build files
    latestBuild = ".vite/build/main.js";
    appInfo = { main: latestBuild };
  }

  // Set environment variables for testing
  process.env.CI = "e2e";
  const screenshotAppEnv = process.env.SCREENSHOT_APP_ENV ?? "production";
  process.env.NODE_ENV = screenshotAppEnv;
  process.env.LEARNIFYTUBE_FORCE_DEV_DB = "true";

  electronApp = await electron.launch({
    args: [appInfo.main],
    env: {
      ...process.env,
      NODE_ENV: screenshotAppEnv,
      LEARNIFYTUBE_FORCE_DEV_DB: "true",
      // Prevent database reset
      PRESERVE_DB: "true",
    },
  });

  async function waitForMainWindow(app: ElectronApplication): Promise<Page> {
    console.log("Waiting for main window...");
    const windows = app.windows();
    console.log("Current windows:", windows.length);
    windows.forEach((w) => console.log("Window URL:", w.url()));

    const nonDevtoolsWindow = app.windows().find((win) => !win.url().startsWith("devtools://"));
    if (nonDevtoolsWindow) {
      console.log("Found existing main window:", nonDevtoolsWindow.url());
      return nonDevtoolsWindow;
    }

    console.log("Waiting for window event...");
    return app.waitForEvent("window", (newWindow) => {
      console.log("New window opened:", newWindow.url());
      return !newWindow.url().startsWith("devtools://");
    });
  }

  page = await waitForMainWindow(electronApp);

  // Manually inject a user ID to bypass authentication
  await page.evaluate(() => {
    const userId = Math.random().toString(36).substring(2, 15);
    localStorage.setItem("user.currentUserId", userId);
    console.log("Manually set userId in localStorage:", userId);
    window.location.reload();
  });

  // Wait for the app to fully load
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2000);

  // Initialize Page Objects
  dashboardPage = createDashboardPage(page);
  settingsPage = createSettingsPage(page);
  channelsPage = createChannelsPage(page);
  playerPage = createPlayerPage(page);
});

test.afterAll(async () => {
  await electronApp.close();
});

test("Screenshot Dashboard", async () => {
  // App starts at Dashboard
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1500);
  await page.screenshot({
    path: path.join(screenshotsDir, "dashboard.png"),
    fullPage: true,
  });
});

test("Screenshot Settings", async () => {
  console.log("Navigating to Settings...");
  await dashboardPage.navigateToSettings();
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1500);
  await page.screenshot({
    path: path.join(screenshotsDir, "settings.png"),
    fullPage: true,
  });

  // Navigate back to Dashboard
  console.log("Navigating back to Dashboard...");
  await settingsPage.navigateBackToDashboard();
  await page.waitForLoadState("networkidle");
});

test("Screenshot Channels", async () => {
  console.log("Navigating to Channels...");
  await dashboardPage.navigateToChannels();
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1500);
  await page.screenshot({
    path: path.join(screenshotsDir, "channels.png"),
    fullPage: true,
  });

  // Navigate back to Dashboard
  console.log("Navigating back to Dashboard...");
  await page.click('a[href="/"]'); // Assuming dashboard link is always available or add method to ChannelsPage
  await page.waitForLoadState("networkidle");
});

test("Download and Play Video", async () => {
  test.setTimeout(180000); // 3 mins
  const videoUrl = "https://www.youtube.com/watch?v=jNQXAC9IVRw"; // Me at the zoo (short)

  // Ensure we are at Dashboard
  console.log("Ensuring Dashboard...");
  await page.click('a[href="/"]');
  await page.waitForLoadState("networkidle");

  // Search and Download
  console.log("Searching and downloading video...");
  await dashboardPage.searchAndDownloadVideo(videoUrl);

  // Wait for download to complete.
  console.log("Waiting for download to complete...");
  await page.waitForTimeout(20000);

  // Go to Channels
  console.log("Navigating to Channels...");
  await dashboardPage.navigateToChannels();
  await page.waitForLoadState("networkidle");

  await page.screenshot({
    path: path.join(screenshotsDir, "debug-channels-page.png"),
    fullPage: true,
  });

  // Select Channel and Video
  console.log("Selecting channel 'jawed'...");
  await channelsPage.selectChannel("jawed");

  console.log("Selecting video 'Me at the zoo'...");
  await channelsPage.selectVideo("Me at the zoo");

  // Verify player
  console.log("Verifying player...");
  await playerPage.verifyPlayback();

  // Wait a bit for playback
  await page.waitForTimeout(2000);

  // Take screenshot
  await page.screenshot({
    path: path.join(screenshotsDir, "player-playing.png"),
    fullPage: true,
  });
  console.log("Player screenshot taken.");
});
