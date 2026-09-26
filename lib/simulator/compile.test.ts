import { describe, expect, it } from "vitest";
import { compileSolidityWithTimeout } from "./compile";

const SRC = "pragma solidity ^0.8.20; contract C { uint256 x; function f() external { x++; } }";

describe("compileSolidityWithTimeout", () => {
  it("compiles in a worker", async () => {
    const result = await compileSolidityWithTimeout(SRC, 20_000);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.contracts.map((c) => c.name)).toEqual(["C"]);
  });

  it("gives up once the limit passes", async () => {
    // Loading solc alone takes far longer than 1 ms.
    expect(await compileSolidityWithTimeout(SRC, 1)).toEqual({ ok: false, error: "Compilation exceeded the 0.001s limit." });
  });

  it("reports solc errors like the sync version", async () => {
    const result = await compileSolidityWithTimeout("contract {", 20_000);
    expect(result.ok).toBe(false);
  });
});
