import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeSolidityCode } from "../../analyzer";
import { compileSolidity } from "../../simulator/compile";
import { applyShardedCounterTemplate, shardedCounterTemplate } from "./shardedCounter";

const BAD_NFT = readFileSync(join(__dirname, "../../../fixtures/demo/BadNFT.sol"), "utf8");

describe("sharded counter fix template", () => {
  it("patches BadNFT in place, preserves burn, and keeps the mint signature", () => {
    const modified = applyShardedCounterTemplate(BAD_NFT);
    const modifiedFromBurnFinding = applyShardedCounterTemplate(BAD_NFT, {
      variable: "totalSupply",
      functionName: "burn",
    });
    const originalSignature = BAD_NFT.match(/function mint\([^)]*\)\s+external/)?.[0];
    const modifiedSignature = modified.match(/function mint\([^)]*\)\s+external/)?.[0];

    expect(modifiedSignature).toBe(originalSignature);
    expect(modified).toContain("function burn(uint256 tokenId) external");
    expect(modified).toContain('require(ownerOf[tokenId] == msg.sender, "not owner")');
    expect(modified).toContain("delete ownerOf[tokenId]");
    expect(modified).toContain("_activeByShard[tokenId % SHARDS] -= 1");
    expect(modifiedFromBurnFinding).toBe(modified);
    expect(compileSolidity(modified)).toMatchObject({ ok: true });
  });

  it("uses full-slot shards, a caller-derived shard, and globally unique ids", () => {
    const modified = applyShardedCounterTemplate(BAD_NFT);

    expect(modified).toContain("uint256[SHARDS] private _shardCounts");
    expect(modified).toContain(
      "uint256 s = uint256(keccak256(abi.encodePacked(msg.sender))) % SHARDS"
    );
    expect(modified).toContain("uint256 n = _shardCounts[s]");
    expect(modified).toContain('require(n < MAX_PER_SHARD, "shard sold out")');
    expect(modified).toContain("id = n * SHARDS + s");
    expect(modified).toContain("_shardCounts[s] = n + 1");
    expect(modified).toContain("function totalSupply() external view returns (uint256 total)");

    const mintBody = modified.match(/function mint\(\)[\s\S]*?\n    }/)?.[0];
    expect(mintBody).toBeDefined();
    expect(mintBody).not.toMatch(/for\s*\(/);
  });

  it("removes the P1 finding while documenting the required costs", () => {
    const modified = applyShardedCounterTemplate(BAD_NFT);
    const after = analyzeSolidityCode(modified);

    expect(after.error).toBeNull();
    expect(after.findings.some((finding) => finding.ruleId === "P1_GLOBAL_COUNTER")).toBe(false);
    expect(shardedCounterTemplate.tradeoffs).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/non-sequential/i),
        expect.stringMatching(/users mapped to the same shard cannot mint/i),
        expect.stringMatching(/storage reads/i),
        expect.stringMatching(/gas per mint.*burn.*two per-shard counters/i),
      ])
    );
  });
});
