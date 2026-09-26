import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DEMO_CONTRACTS } from "./demoContracts";

describe("DEMO_CONTRACTS", () => {
  it.each(DEMO_CONTRACTS.map((d) => [d.id]))("%s matches fixtures/demo/%s.sol", (id) => {
    const demo = DEMO_CONTRACTS.find((d) => d.id === id)!;
    expect(demo.source).toBe(readFileSync(join(__dirname, "../fixtures/demo", `${id}.sol`), "utf8"));
  });
});
