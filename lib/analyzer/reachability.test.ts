import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeSolidityCode } from "./index";

const load = (name: string) => readFileSync(join(__dirname, "../../fixtures/solidity", name), "utf8");

describe("modifier reachability (CLAUDE.md §6)", () => {
  it("weighs a function by whether its modifiers check the caller", () => {
    const { findings } = analyzeSolidityCode(load("REACHABILITY.modifiers.sol"));
    const weights = Object.fromEntries(
      findings.filter((f) => f.ruleId === "P1_GLOBAL_COUNTER").map((f) => [f.functionName, f.reachabilityWeight])
    );
    expect(weights).toEqual({
      guarded: 1, // nonReentrant reads/writes its own lock, never the caller
      pausable: 1, // whenNotPaused
      rewarded: 1, // nonReentrant + updateReward(msg.sender): msg.sender is an argument, not a check
      listed: 0.5, // require(whitelisted[msg.sender])
      proven: 0.5, // merkle proof over msg.sender
      helperChecked: 0.5, // caller check one call deep (_checkAllowed)
      mixed: 0.5, // any restricting modifier wins
      // admin (onlyOwner) is owner-gated: P1 is dropped (§5C)
    });
  });

  it("keeps unresolvable modifiers broad-restricted", () => {
    const { findings } = analyzeSolidityCode(`
      contract Imported {
        uint256 calls;
        function f() external someImportedModifier { calls += 1; }
      }
    `);
    expect(findings.map((f) => f.reachabilityWeight)).toEqual([0.5]);
  });
});
