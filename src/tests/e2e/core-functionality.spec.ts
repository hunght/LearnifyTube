import { test, _electron as electron, ElectronApplication, Page } from "@playwright/test";
import { findLatestBuild, parseElectronApp } from "electron-playwright-helpers";
import { createDashboardPage, type DashboardPage } from "./pages/DashboardPage";
import { createSettingsPage, type SettingsPage } from "./pages/SettingsPage";
import { createChannelsPage, type ChannelsPage } from "./pages/ChannelsPage";
import { createPlayerPage, type PlayerPage } from "./pages/PlayerPage";

let electronApp: ElectronApplication;
let page: Page;
let dashboardPage: DashboardPage;
let settingsPage: SettingsPage;
let channelsPage: ChannelsPage;
let playerPage: PlayerPage;

test.beforeAll(async () => {
  // Try to find latest build, fallback to dev build
  let latestBuild;
  let appInfo;

  try {
    latestBuild = findLatestBuild();
    console.log("Found latest build:", latestBuild);
    appInfo = parseElectronApp(latestBuild);
  } catch (error) {
    console.log("No packaged build found, using development build");
    latestBuild = ".vite/build/main.js";
    appInfo = { main: latestBuild };
  }

  // Set environment variables for testing
  process.env.CI = "e2e";
  process.env.NODE_ENV = "production"; // Simulating production environment
  process.env.LEARNIFYTUBE_FORCE_DEV_DB = "true";

  electronApp = await electron.launch({
    args: [appInfo.main],
    env: {
      ...process.env,
      NODE_ENV: "production",
      LEARNIFYTUBE_FORCE_DEV_DB: "true",
      PRESERVE_DB: "true",
    },
  });

  // Setup event handlers for debugging
  electronApp.on("window", async (page) => {
    const filename = page.url()?.split("/").pop();
    console.log(`Window opened: ${filename}`);

    if (page.url().startsWith("devtools://")) {
      await page.close();
      return;
    }

    page.on("pageerror", (error) => {
      console.error(error);
    });
    page.on("console", (msg) => {
      console.log(msg.text());
    });
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

  // Wait for load
  await page.waitForLoadState("networkidle");

  // Initialize Page Objects
  dashboardPage = createDashboardPage(page);
  settingsPage = createSettingsPage(page);
  channelsPage = createChannelsPage(page);
  playerPage = createPlayerPage(page);

  // Bypass authentication if needed (copied from existing test)
  await page.evaluate(() => {
    const userId = Math.random().toString(36).substring(2, 15);
    localStorage.setItem("user.currentUserId", userId);
    window.location.reload();
  });
  await page.waitForLoadState("networkidle");
});

test.afterAll(async () => {
  await electronApp.close();
});

test.describe("Core Functionality", () => {
  test("App Launch and Basic Navigation", async () => {
    // Verify we are on Dashboard
    await page.waitForTimeout(1000); // Stability wait

    // Navigate to Settings
    await dashboardPage.navigateToSettings();
    await page.waitForLoadState("networkidle");

    // Navigate back to Dashboard
    await settingsPage.navigateBackToDashboard();
    await page.waitForLoadState("networkidle");
  });

  test("Download and Playback Flow", async () => {
    test.setTimeout(180000); // 3 minutes timeout for download

    const videoUrl = "https://www.youtube.com/watch?v=jNQXAC9IVRw"; // Me at the zoo

    // Search and Download
    await dashboardPage.searchAndDownloadVideo(videoUrl);

    // Wait for download to complete (simulated wait + check)
    // In a real scenario, we might want a more robust way to check download status,
    // but for now we wait a bit and check channels.
    console.log("Waiting for download to complete...");
    await page.waitForTimeout(20000);

    // Navigate to Channels
    await dashboardPage.navigateToChannels();
    await page.waitForLoadState("networkidle");

    // Select Channel
    await channelsPage.selectChannel("jawed");

    // Select Video
    await channelsPage.selectVideo("Me at the zoo");

    // Verify Playback
    await playerPage.verifyPlayback();
  });
});
