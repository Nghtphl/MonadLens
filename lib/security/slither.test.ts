import { describe, expect, it, vi } from "vitest";
import type { Finding } from "../types";
import { deduplicateSecurityFindings } from "./dedupe";
import { mapSlitherPayload, runSlither } from "./slither";

function finding(source: Finding["source"], line: number, ruleId: string): Finding {
  return {
    source,
    ruleId,
    severity: "high",
    line,
    column: 0,
    reachabilityWeight: 1,
    conflictNote: "test",
    message: "test",
  };
}

describe("Slither integration", () => {
  it("maps detector JSON to Slither findings", () => {
    const findings = mapSlitherPayload({
      success: true,
      results: {
        detectors: [
          {
            check: "reentrancy-eth",
            impact: "High",
            confidence: "Medium",
            description: "Reentrancy in Vault.withdraw()",
            elements: [
              {
                type: "function",
                name: "withdraw",
                source_mapping: { lines: [17, 18], starting_column: 5 },
              },
            ],
          },
        ],
      },
    });

    expect(findings).toEqual([
      expect.objectContaining({
        source: "slither",
        ruleId: "reentrancy-eth",
        severity: "high",
        line: 17,
        column: 4,
        functionName: "withdraw",
      }),
    ]);
  });

  it("removes temporary directories from detector messages", () => {
    const [finding] = mapSlitherPayload({
      success: true,
      results: {
        detectors: [
          {
            check: "solc-version",
            impact: "Informational",
            confidence: "High",
            description:
              "Version is used by /var/folders/j7/random/T/monadlens-slither-AbCd/Contract.sol#2 and ../tmp/monadlens-slither-EfGh/Contract.sol#7",
          },
        ],
      },
    });

    expect(finding.message).toBe(
      "Version is used by Contract.sol#2 and Contract.sol#7"
    );
  });

  it("keeps MonadLens when both analyzers report the same line", () => {
    const monad = finding(undefined, 12, "P1_GLOBAL_COUNTER");
    const duplicate = finding("slither", 12, "costly-loop");
    const unique = finding("slither", 20, "reentrancy-eth");

    expect(deduplicateSecurityFindings([monad], [duplicate, unique])).toEqual([monad, unique]);
  });

  it("returns an unavailable result when Slither is not installed", async () => {
    const previousPath = process.env.SLITHER_PATH;
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    process.env.SLITHER_PATH = "/definitely/missing/slither";
    try {
      await expect(runSlither("contract Example {}", { timeoutMs: 100 })).resolves.toEqual({
        available: false,
        reason: "General security scan runs in the local/Docker setup, see README.",
      });
      expect(consoleError).toHaveBeenCalledWith(
        '[Slither] Executable was not found at "/definitely/missing/slither".'
      );
    } finally {
      consoleError.mockRestore();
      if (previousPath === undefined) delete process.env.SLITHER_PATH;
      else process.env.SLITHER_PATH = previousPath;
    }
  });
});
