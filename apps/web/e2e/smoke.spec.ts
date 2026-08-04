import { expect, test } from "@playwright/test";

test("home loads TripLedger shell", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("body")).toBeVisible();
  // Brand or primary app chrome should render without a hard crash.
  await expect(page.getByText(/TripLedger|Trips|Sign/i).first()).toBeVisible({
    timeout: 15_000,
  });
});
