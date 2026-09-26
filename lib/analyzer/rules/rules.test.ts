import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { analyzeSolidityCode } from "../index";

const FIXTURES_DIR = join(__dirname, "../../../fixtures/solidity");

interface ExpectedFixture {
  findings: { ruleId: string; line: number }[];
}

function fixtureIds(): string[] {
  const files = readdirSync(FIXTURES_DIR);
  const ids = new Set<string>();
  for (const file of files) {
    const match = file.match(/^([^.]+)\.(positive|negative)\.sol$/);
    if (match) ids.add(match[1]);
  }
  return Array.from(ids).sort();
}

describe("rule fixtures", () => {
  for (const ruleId of fixtureIds()) {
    for (const kind of ["positive", "negative"] as const) {
      it(`${ruleId} ${kind} fixture matches expected.json`, () => {
        const source = readFileSync(join(FIXTURES_DIR, `${ruleId}.${kind}.sol`), "utf-8");
        const expected: ExpectedFixture = JSON.parse(
          readFileSync(join(FIXTURES_DIR, `${ruleId}.${kind}.expected.json`), "utf-8")
        );

        const result = analyzeSolidityCode(source);
        expect(result.error).toBeNull();

        const actual = result.findings
          .filter((f) => f.ruleId === ruleId)
          .map((f) => ({ ruleId: f.ruleId, line: f.line }));

        expect(actual).toEqual(expected.findings);
      });
    }
  }
});

describe("rule interplay", () => {
  const load = (name: string) => readFileSync(join(FIXTURES_DIR, name), "utf-8");

  it("P1 defers to P8 on AMM reserves, and P8 findings never offer a fix", () => {
    const { findings } = analyzeSolidityCode(load("P8_INHERENT.positive.sol"));
    expect(findings.filter((f) => f.ruleId === "P1_GLOBAL_COUNTER")).toEqual([]);
    expect(findings.filter((f) => f.ruleId === "P8_INHERENT").every((f) => f.fixTemplateId === undefined)).toBe(true);
  });

  it("the P8 negative (non-reserve totals) is still caught, as P3", () => {
    const { findings } = analyzeSolidityCode(load("P8_INHERENT.negative.sol"));
    expect(findings.filter((f) => f.ruleId === "P3_GLOBAL_ACCUMULATOR").map((f) => f.variable)).toEqual([
      "totalVolume",
      "totalFees",
    ]);
  });

  it("accumulators written alongside the reserves are P8, elsewhere still P3", () => {
    const { findings } = analyzeSolidityCode(load("P8_INHERENT.accumulator.sol"));
    const byRule = (id: string) => findings.filter((f) => f.ruleId === id).map((f) => [f.variable, f.line]);
    expect(byRule("P8_INHERENT")).toEqual([
      ["price0CumulativeLast", 18],
      ["price1CumulativeLast", 19],
      ["reserve0", 21],
      ["reserve1", 22],
    ]);
    expect(byRule("P3_GLOBAL_ACCUMULATOR")).toEqual([["protocolFees", 27]]);
    expect(findings.every((f) => f.ruleId !== "P8_INHERENT" || f.fixTemplateId === undefined)).toBe(true);
  });

  it("P1 is for constant steps, P3 for per-call amounts, and P3 offers no fix", () => {
    const { findings } = analyzeSolidityCode(load("P3_GLOBAL_ACCUMULATOR.positive.sol"));
    expect(findings.filter((f) => f.ruleId === "P1_GLOBAL_COUNTER").map((f) => f.variable)).toEqual(["tradeCount"]);
    const p3 = findings.filter((f) => f.ruleId === "P3_GLOBAL_ACCUMULATOR");
    expect(p3.map((f) => f.variable)).toEqual(["protocolFees"]);
    expect(p3.every((f) => f.fixTemplateId === undefined)).toBe(true);
  });

  it("SafeMath-style and self-assignment counter steps are P1", () => {
    const pos = analyzeSolidityCode(load("P1_GLOBAL_COUNTER.safemath.positive.sol"));
    expect(pos.findings.map((f) => [f.ruleId, f.variable, f.line])).toEqual([
      ["P1_GLOBAL_COUNTER", "mintCount", 16], // mintCount.add(1)
      ["P1_GLOBAL_COUNTER", "mintCount", 20], // mintCount + 1
      ["P1_GLOBAL_COUNTER", "mintCount", 21], // 1 + mintCount
      ["P1_GLOBAL_COUNTER", "burnCount", 25], // burnCount.sub(1)
      ["P1_GLOBAL_COUNTER", "burnCount", 26], // burnCount - 1
    ]);
    expect(analyzeSolidityCode(load("P1_GLOBAL_COUNTER.safemath.negative.sol")).findings).toEqual([]);
  });

  it("SafeMath-style and self-assignment per-call amounts are P3", () => {
    const pos = analyzeSolidityCode(load("P3_GLOBAL_ACCUMULATOR.safemath.positive.sol"));
    expect(pos.findings.map((f) => [f.ruleId, f.variable, f.line])).toEqual([
      ["P3_GLOBAL_ACCUMULATOR", "_totalSupply", 16], // .add(amount)
      ["P3_GLOBAL_ACCUMULATOR", "_totalSupply", 21], // .sub(amount)
      ["P3_GLOBAL_ACCUMULATOR", "_totalSupply", 26], // + amount
    ]);
    expect(analyzeSolidityCode(load("P3_GLOBAL_ACCUMULATOR.safemath.negative.sol")).findings).toEqual([]);
  });

  it("state writes in a modifier count for each function that uses it, at its weight", () => {
    const { findings } = analyzeSolidityCode(load("P1_GLOBAL_COUNTER.modifier.positive.sol"));
    expect(findings.map((f) => [f.ruleId, f.variable, f.line, f.functionName])).toEqual([
      ["P1_GLOBAL_COUNTER", "calls", 11, "ping"],
      ["P3_GLOBAL_ACCUMULATOR", "volume", 16, "trade"],
    ]);
    expect(findings[0].message).toContain("ping (via modifier `countCall`)");
    // countCall and trackVolume don't check the caller, so they don't restrict access.
    expect(findings.map((f) => f.reachabilityWeight)).toEqual([1, 1]);
  });

  it("owner-only, read-only and unused modifiers add nothing", () => {
    expect(analyzeSolidityCode(load("P1_GLOBAL_COUNTER.modifier.negative.sol")).findings).toEqual([]);
  });

  it("reentrancy-guard writes are C1 info with the transient suggestion, never P1/P3", () => {
    const { findings, score } = analyzeSolidityCode(load("C1_REENTRANCY_GUARD.positive.sol"));
    expect(findings.every((f) => f.ruleId === "C1_REENTRANCY_GUARD" && f.severity === "info")).toBe(true);
    expect(findings.every((f) => f.fixTemplateId === undefined && f.message.includes("ReentrancyGuardTransient"))).toBe(
      true
    );
    expect(findings[0].message).toContain("stake, withdraw");
    expect(score).toBe(100);
  });

  it("accumulators one internal call away from the reserves are P8", () => {
    const { findings } = analyzeSolidityCode(load("P8_INHERENT.calls.positive.sol"));
    expect(findings.filter((f) => f.ruleId === "P3_GLOBAL_ACCUMULATOR")).toEqual([]);
    const p8 = findings.filter((f) => f.ruleId === "P8_INHERENT" && !f.variable?.startsWith("reserve"));
    expect(p8.map((f) => [f.variable, f.functionName])).toEqual([
      ["totalSupply", "_mintShares"], // only caller mint() calls _update
      ["totalFees", "swap"], // swap() itself calls _update
    ]);
    expect(p8[0].message).toContain("only called from mint (via _update)");
    expect(p8[1].message).toContain("swap also calls _update");
  });

  it("accumulators that can be reached without the reserves stay P3", () => {
    const { findings } = analyzeSolidityCode(load("P8_INHERENT.calls.negative.sol"));
    expect(findings.filter((f) => f.ruleId === "P3_GLOBAL_ACCUMULATOR").map((f) => [f.variable, f.functionName])).toEqual([
      ["totalSupply", "_mintShares"], // donate() reaches it without _update
      ["_totalSupply", "_update"], // PlainToken: no reserves
    ]);
  });

  it("x = f() where f reads x is a P3 read-modify-write", () => {
    const { findings } = analyzeSolidityCode(load("P3_GLOBAL_ACCUMULATOR.derived.positive.sol"));
    expect(findings.map((f) => [f.ruleId, f.variable, f.line, f.functionName])).toEqual([
      ["P3_GLOBAL_ACCUMULATOR", "rewardPerTokenStored", 19, "stake"], // via modifier updateReward
      ["P3_GLOBAL_ACCUMULATOR", "checkpoint", 26, "poke"], // internal view helper
    ]);
    expect(findings[0].message).toContain("with rewardPerToken(), which reads it");
    expect(analyzeSolidityCode(load("P3_GLOBAL_ACCUMULATOR.derived.negative.sol")).findings).toEqual([]);
  });

  it("a write in a shared modifier is one finding, at the highest caller weight", () => {
    const { findings } = analyzeSolidityCode(load("P3_GLOBAL_ACCUMULATOR.shared-modifier.sol"));
    expect(findings.map((f) => [f.ruleId, f.variable, f.line, f.functionName ?? null, f.reachabilityWeight])).toEqual([
      ["P3_GLOBAL_ACCUMULATOR", "rewardPerTokenStored", 20, null, 1], // updateReward: 4 functions, max weight
      ["P1_GLOBAL_COUNTER", "calls", 25, null, 1], // countCall: stake, withdraw
      ["P3_GLOBAL_ACCUMULATOR", "totalStaked", 45, "stake", 1], // function bodies: one per function
      ["P3_GLOBAL_ACCUMULATOR", "totalStaked", 49, "withdraw", 1],
      // countAdminCall runs only in owner-gated functions: max weight 0.05, dropped (§5C)
    ]);
    expect(findings[0].message).toContain(
      "in stake, withdraw, getReward, notifyRewardAmount (via modifier `updateReward`)"
    );
    expect(findings[1].message).toContain("stake, withdraw (via modifier `countCall`)");
  });

  it("M1 findings point at the block-timestamp template with its trade-offs", () => {
    const { findings } = analyzeSolidityCode(load("M1_BLOCK_TIME_ASSUMPTION.positive.sol"));
    const m1 = findings.filter((f) => f.ruleId === "M1_BLOCK_TIME_ASSUMPTION");
    expect(m1.length).toBeGreaterThan(0);
    expect(m1.every((f) => f.fixTemplateId === "block-timestamp" && (f.tradeoffs?.length ?? 0) > 0)).toBe(true);
  });
});
