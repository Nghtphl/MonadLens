import { expect, test } from "@playwright/test";

test("demo chips, Inspect and mobile layouts remain usable", async ({ page }) => {
  await page.goto("/");
  for (const demo of ["BadNFT", "BadLending", "AMMPool", "BrokenDEX", "ParallelSafe"]) {
    const chip = page.getByRole("button", { name: demo, exact: true });
    await chip.click();
    await expect(chip).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".editor-heading")).toContainText(`${demo}.sol`);
    await expect(page.locator(".score-number")).not.toContainText("—");
  }
  await page.getByRole("button", { name: "BadNFT", exact: true }).click();
  await expect(page.getByRole("button", { name: "Explain", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Inspect", exact: true }).first().click();
  await expect(page.getByRole("button", { name: "Explain", exact: true })).toBeVisible();
  await expect(page.locator(".monaco-editor").first()).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "line 11", exact: true }).click();
  await expect(page.locator(".monadlens-line-highlight")).toBeVisible();
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375);
  await page.getByRole("button", { name: "Fix", exact: true }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("link", { name: "Real-contract findings" }).click();
  await expect(page.getByRole("heading", { name: "Findings on real contracts" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375);
});
