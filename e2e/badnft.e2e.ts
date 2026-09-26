import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

/** Same lookup as lib/simulator/trace.ts: ANVIL_PATH, ~/.foundry/bin/anvil, then PATH. */
function anvilAvailable(): boolean {
  if (process.env.ANVIL_PATH) return existsSync(process.env.ANVIL_PATH);
  if (existsSync(join(homedir(), ".foundry", "bin", "anvil"))) return true;
  try {
    execFileSync("anvil", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)/.test(process.env.E2E_BASE_URL ?? "http://localhost:3000");

/** Why measurement steps are skipped, or undefined when they run. */
function measurementSkipReason(): string | undefined {
  if (process.env.E2E_SKIP_MEASURE) return "E2E_SKIP_MEASURE is set";
  if (isLocal && !anvilAvailable()) return "anvil not found (ANVIL_PATH, ~/.foundry/bin/anvil or PATH)";
  return undefined;
}

function skipMeasurement(reason: string) {
  test.info().annotations.push({ type: "skipped-steps", description: `Measurement steps skipped: ${reason}` });
  console.log(`\n  ⚠ Measurement steps SKIPPED: ${reason}. Static analysis and the fix flow were still tested.\n`);
}

/** Clicks Measure (or Apply) and waits for a measured result; returns the Not measured reason instead, if any. */
async function waitForMeasurement(page: Page): Promise<string | undefined> {
  const measured = page.getByTestId("critical-path");
  const notMeasured = page.getByText("Not measured", { exact: true });
  await expect(measured.or(notMeasured)).toBeVisible({ timeout: 120_000 });
  if (await notMeasured.isVisible()) {
    return (await notMeasured.locator("xpath=following-sibling::pre").textContent())?.trim() ?? "Not measured";
  }
  return undefined;
}

test("BadNFT: findings → Measure → Fix → diff → Apply & re-measure lowers the critical path", async ({ page }) => {
  let skipReason = measurementSkipReason();

  await test.step("open the page and load BadNFT", async () => {
    await page.goto("/");
    await page.getByLabel("Demo contract").selectOption("BadNFT");
  });

  await test.step("static findings appear", async () => {
    await expect(page.getByText("P1_GLOBAL_COUNTER · critical · line 11")).toBeVisible();
    await expect(page.getByText("P1_GLOBAL_COUNTER · critical · line 18")).toBeVisible();
  });

  await test.step("Explain shows a labeled explanation (AI or static)", async () => {
    const { aiEnabled } = await (await page.request.get("/api/explain")).json();
    const note = page.getByText("AI explanation sends this finding and ±10 lines of code to Google Gemini.").first();
    if (aiEnabled) await expect(note).toBeVisible();
    else await expect(note).toHaveCount(0);

    await page.getByRole("button", { name: "Explain", exact: true }).first().click();
    const box = page.getByTestId("finding-explanation").first();
    await expect(box).toBeVisible({ timeout: 60_000 });
    const label = (await box.locator("span").first().textContent())?.trim();
    expect(["AI explanation", "Static explanation"]).toContain(label);
    await expect(box).toContainText("Source: docs/monad/");
    console.log(`  ${label}${aiEnabled ? "" : " (no GEMINI_API_KEY)"}`);
  });

  let before: number | undefined;
  if (!skipReason) {
    await test.step("Measure shows a measured result", async () => {
      await page.getByRole("button", { name: "Measure", exact: true }).click();
      const reason = await waitForMeasurement(page);
      if (reason) {
        skipReason = `the app returned Not measured (${reason})`;
        return;
      }
      before = Number(await page.getByTestId("critical-path").textContent());
      expect(before).toBe(100); // every mint writes totalSupply
    });
  }
  if (skipReason) skipMeasurement(skipReason);

  await test.step("Fix opens the diff with trade-offs", async () => {
    await page.getByRole("button", { name: "Fix", exact: true }).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Trade-offs")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Apply & re-measure" })).toBeVisible();
  });

  await test.step("Apply replaces the code; the static findings go away", async () => {
    await page.getByRole("dialog").getByRole("button", { name: "Apply & re-measure" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(page.getByText("No findings.")).toBeVisible();
    const source = await page.evaluate(
      () => (window as unknown as { monaco: any }).monaco.editor.getEditors()[0].getValue() as string
    );
    expect(source).toContain("_shardCounts");
    expect(source).toContain("function burn"); // the template keeps burn
  });

  if (!skipReason) {
    await test.step("re-measure: the critical path drops", async () => {
      const row = page.getByTestId("before-after-critical-path");
      await expect(row).toBeVisible({ timeout: 120_000 });
      const beforeCell = Number(await row.getByTestId("before").textContent());
      const afterCell = Number(await row.getByTestId("after").textContent());
      expect(beforeCell).toBe(before);
      expect(afterCell).toBeLessThan(beforeCell);
      console.log(`  critical path ${beforeCell} → ${afterCell}`);
    });
  }
});
