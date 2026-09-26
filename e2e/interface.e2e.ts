import { expect, test } from "@playwright/test";

test("landing: every scene is readable without motion and the CTA opens the workspace", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "MonadLens" })).toBeVisible();
  await expect(page.getByText("See what slows your contract down.")).toBeVisible();
  for (const name of ["Different users. One shared bottleneck.", "Inspect. Measure. Improve."]) {
    const heading = page.getByRole("heading", { level: 2, name });
    await heading.scrollIntoViewIfNeeded();
    await expect(heading).toBeVisible();
  }
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375);
  await page.getByRole("button", { name: "Test your contract" }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: "Test your contract" })).toBeFocused();
  await expect(page).toHaveURL(/#workspace$/);
  // Back to the overview and in again keeps the editor content.
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await expect(page.getByText("See what slows your contract down.")).toBeVisible();
  await page.getByRole("button", { name: "Test your contract" }).first().click();
  await expect(page.locator(".editor-heading")).toContainText("BadNFT.sol");
});

test("demo chips, Inspect and mobile layouts remain usable", async ({ page }) => {
  await page.goto("/#workspace");
  for (const demo of ["BadNFT", "BadLending", "AMMPool", "BrokenDEX", "ParallelSafe"]) {
    const chip = page.getByRole("button", { name: demo, exact: true });
    await chip.click();
    await expect(chip).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".editor-heading")).toContainText(`${demo}.sol`);
    await expect(page.locator(".score-number")).not.toContainText("—");
  }
  await page.getByRole("button", { name: "AMMPool", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Expected pool contention" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Review fixes" })).toHaveCount(0);

  await page.getByRole("button", { name: "BadNFT", exact: true }).click();
  await expect(page.getByRole("button", { name: "Explain", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Inspect", exact: true }).first().click();
  await expect(page.getByRole("button", { name: "Explain", exact: true })).toBeVisible();
  await expect(page.getByText("P1_GLOBAL_COUNTER").first()).toBeVisible();
  await expect(page.locator(".monaco-editor").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".squiggly-error").first()).toBeVisible();
  const line11 = page.getByRole("button", { name: "Line 11: show in editor", exact: true });
  await line11.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".monadlens-line-highlight")).toBeVisible();

  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375);
  await page.screenshot({ path: "test-results/workspace-mobile.png", fullPage: true });
  const review = page.getByRole("button", { name: "Review fixes", exact: true });
  await review.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375);
  await page.screenshot({ path: "test-results/fix-mobile.png", animations: "disabled" });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(review).toBeFocused();
  await review.click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await page.getByRole("link", { name: "Real-contract findings" }).click();
  await expect(page.getByRole("heading", { name: "Findings on real contracts" })).toBeVisible();
  await page.screenshot({ path: "test-results/findings-mobile.png" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375);
});

test("a fix template that cannot be applied is reported, not offered", async ({ page }) => {
  await page.goto("/#workspace");
  await expect(page.locator(".monaco-editor").first()).toBeVisible({ timeout: 30_000 });
  await page.evaluate(() => {
    const editor = (window as unknown as { monaco: any }).monaco.editor.getEditors()[0];
    editor.setValue("contract Counter { uint256 public count; function increment() external { count++; } }");
  });
  await expect(page.getByRole("heading", { name: "Shared counter contention" })).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "Shared counter contention" })).toBeVisible();
  await expect(page.getByText(/could not be applied to this code automatically/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Review fixes" })).toHaveCount(0);
});
