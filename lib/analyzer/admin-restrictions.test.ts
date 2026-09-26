import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeSolidityCode } from "./index";

const FIXTURES_DIR = join(__dirname, "../../fixtures/solidity");

const ADMIN_FIXTURES = [
  "P1_GLOBAL_COUNTER.admin-modifiers.negative.sol",
  "P1_GLOBAL_COUNTER.inline-require.negative.sol",
  "P1_GLOBAL_COUNTER.inline-revert.negative.sol",
] as const;

describe("administrator-restricted parallel findings", () => {
  for (const fixture of ADMIN_FIXTURES) {
    it(`suppresses P1-P5 findings for ${fixture}`, () => {
      const source = readFileSync(join(FIXTURES_DIR, fixture), "utf8");
      const result = analyzeSolidityCode(source);

      expect(result.error).toBeNull();
      expect(result.findings.filter((finding) => /^P[1-5]_/.test(finding.ruleId))).toEqual([]);
      expect(result.score).toBe(100);
    });
  }

  it("does not suppress the same write when the owner check is not the first statement", () => {
    const result = analyzeSolidityCode(`
      contract LateOwnerCheck {
        address owner;
        uint256 totalSupply;

        function mint() external {
          totalSupply++;
          require(msg.sender == owner, "not owner");
        }
      }
    `);

    expect(result.findings.some((finding) => finding.ruleId === "P1_GLOBAL_COUNTER")).toBe(true);
  });
});
