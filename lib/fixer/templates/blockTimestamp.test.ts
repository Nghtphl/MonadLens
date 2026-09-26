import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeSolidityCode } from "../../analyzer";
import { compileSolidity } from "../../simulator/compile";
import { applyBlockTimestampTemplate, blockTimestampTemplate } from "./blockTimestamp";

const BAD_LENDING = readFileSync(
  join(__dirname, "../../../fixtures/demo/BadLending.sol"),
  "utf8"
);

describe("block timestamp fix template", () => {
  it("patches only block-time assumptions and preserves Loan and borrow", () => {
    const modified = applyBlockTimestampTemplate(BAD_LENDING);

    expect(modified).toContain("struct Loan {");
    expect(modified).toContain("function borrow(uint256 principal) external");
    expect(modified).toContain("loans[msg.sender] = Loan({");
    expect(modified).toContain("SECONDS_PER_YEAR = 365 days");
    expect(modified).toContain("openedAtTime: block.timestamp");
    expect(modified).toContain("block.timestamp - loan.openedAtTime");
    expect(modified).not.toContain("BLOCKS_PER_YEAR");
    expect(modified).not.toContain("block.number");
    expect(compileSolidity(modified)).toMatchObject({ ok: true });
  });

  it("removes the M1 finding and includes migration costs", () => {
    const before = analyzeSolidityCode(BAD_LENDING);
    const modified = applyBlockTimestampTemplate(BAD_LENDING);
    const after = analyzeSolidityCode(modified);

    expect(before.findings.some((finding) => finding.ruleId === "M1_BLOCK_TIME_ASSUMPTION")).toBe(true);
    expect(after.error).toBeNull();
    expect(after.findings.some((finding) => finding.ruleId === "M1_BLOCK_TIME_ASSUMPTION")).toBe(false);
    expect(blockTimestampTemplate.tradeoffs).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/migrated/i),
        expect.stringMatching(/share one timestamp/i),
        expect.stringMatching(/rounds down/i),
      ])
    );
  });
});
