import { describe, expect, it } from "vitest";
import { rules } from "../analyzer";
import { STATIC_EXPLANATIONS, staticExplanation } from "./fallbacks";

const sentences = (text: string) => text.split(/(?<=[.!?])\s+(?=[A-Z`])/).length;

describe("static explanations (CLAUDE.md §13)", () => {
  it("exist for every MonadLens rule", () => {
    for (const rule of rules) expect(STATIC_EXPLANATIONS[rule.id], rule.id).toBeDefined();
  });

  it("are 3-4 sentences, name a docs section, and state no numbers", () => {
    for (const [id, { text, section }] of Object.entries(STATIC_EXPLANATIONS)) {
      expect(sentences(text), id).toBeGreaterThanOrEqual(3);
      expect(sentences(text), id).toBeLessThanOrEqual(4);
      expect(section, id).toMatch(/^docs\/monad\/[\w-]+\.md § /);
      expect(text.replace("EIP-1153", ""), id).not.toMatch(/\d/); // EIP-1153 is the one allowed number
    }
  });

  it("fall back to a generic text for unknown rules", () => {
    expect(staticExplanation("reentrancy-eth").text).toContain("reentrancy-eth");
  });
});

describe("docs/monad sections cited by the static explanations", () => {
  it("exist", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    for (const { section } of Object.values(STATIC_EXPLANATIONS)) {
      const [file, heading] = section.split(" § ");
      const text = readFileSync(join(__dirname, "../..", file), "utf8");
      expect(text, section).toContain(`## ${heading}`);
    }
  });
});
