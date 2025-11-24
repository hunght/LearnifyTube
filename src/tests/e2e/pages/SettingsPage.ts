import { Page } from "@playwright/test";

export type SettingsPage = ReturnType<typeof createSettingsPage>;

export const createSettingsPage = (page: Page) => {
  const dashboardLink = page.locator('a[href="/"]');

  const navigateBackToDashboard = async () => {
    await dashboardLink.click();
  };

  return {
    navigateBackToDashboard,
  };
};
