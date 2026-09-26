import { describe, expect, it } from "vitest";
import { accessSetFromTraces, pickTargetFunction } from "./trace";
import { compileSolidity } from "./compile";

const A = "0xAbC0000000000000000000000000000000000001";
const s0 = "0x" + "0".repeat(64);
const s1 = "0x" + "0".repeat(63) + "1";

describe("accessSetFromTraces", () => {
  it("reads come from the non-diff trace, writes from diffMode pre ∪ post (shapes seen on anvil 1.5.1)", () => {
    // tx0 from the probe: slot0 0 -> 1 (pre omits zero), slot1 read-only.
    const set = accessSetFromTraces(
      { [A]: { storage: { [s0]: "0x0", [s1]: "0x2a" } } },
      { pre: {}, post: { [A]: { storage: { [s0]: "0x1" } } } }
    );
    const a = A.toLowerCase();
    expect(set.reads.sort()).toEqual([`${a}:${s0}`, `${a}:${s1}`]);
    expect(set.writes).toEqual([`${a}:${s0}`]);
  });

  it("a slot cleared to zero (present in pre, absent in post) still counts as a write", () => {
    const set = accessSetFromTraces({ [A]: { storage: { [s0]: "0x5" } } }, { pre: { [A]: { storage: { [s0]: "0x5" } } }, post: {} });
    expect(set.writes).toEqual([`${A.toLowerCase()}:${s0}`]);
  });
});

describe("pickTargetFunction", () => {
  const compiled = compileSolidity(`
    pragma solidity ^0.8.20;
    contract T {
      uint256 x;
      function a() external { x = 1; }
      function mint() external { x++; }
      function set(uint256 v) external { x = v; }
      function get() external view returns (uint256) { return x; }
    }`);
  if (!compiled.ok) throw new Error(compiled.error);
  const contract = compiled.contracts[0];

  it("prefers a hot-looking zero-arg state-changing function", () => {
    expect(pickTargetFunction(contract)).toEqual({ fn: { name: "mint", inputTypes: [] } });
  });

  it("honors an explicit choice, including functions with supported args", () => {
    expect(pickTargetFunction(contract, "a")).toEqual({ fn: { name: "a", inputTypes: [] } });
    expect(pickTargetFunction(contract, "set")).toEqual({ fn: { name: "set", inputTypes: ["uint256"] } });
    expect(pickTargetFunction(contract, "get")).toHaveProperty("error");
  });

  it("rejects unsupported argument types with a reason", () => {
    const c = compileSolidity(`pragma solidity ^0.8.20; contract U { string s; function f(string calldata v) external { s = v; } }`);
    if (!c.ok) throw new Error(c.error);
    const r = pickTargetFunction(c.contracts[0], "f");
    expect("error" in r && r.error).toMatch(/unsupported argument type \(string\)/);
    expect(pickTargetFunction(c.contracts[0])).toHaveProperty("error");
  });

  it("labels plain and fixed-array storage slots", () => {
    const c = compileSolidity(`pragma solidity ^0.8.20; contract S { uint256 a; uint256[4] shards; function f() external { a++; } }`);
    if (!c.ok) throw new Error(c.error);
    const labels = c.contracts[0].slotLabels;
    expect(labels.get(BigInt(0))).toBe("a");
    expect(labels.get(BigInt(3))).toBe("shards[2]");
  });
});
