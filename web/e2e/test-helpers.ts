import { type Page } from "@playwright/test";

/**
 * Prepares the page for testing by disabling the onboarding tour
 * and suppressing initial modal popups.
 */
export async function setupPageEnvironment(page: Page) {
  await page.addInitScript(() => {
    const origGet = localStorage.getItem.bind(localStorage);
    localStorage.getItem = (key: string) => {
      if (key && (key.includes("onboarding") || key.includes("tour"))) {
        return "true";
      }
      return origGet(key);
    };
  });
}

/**
 * Ensures the welcome modal is dismissed if it somehow appears.
 */
export async function dismissWelcomeIfVisible(page: Page) {
  try {
    const exploreBtn = page.getByRole("button", { name: /Explore on My Own/i });
    if (await exploreBtn.isVisible({ timeout: 1500 })) {
      await exploreBtn.click();
    }
  } catch {
    // modal wasn't present, proceed
  }
}

