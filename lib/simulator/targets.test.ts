import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { encodePlaceholderArgs, lastConcreteContractName, listCallableFunctions, pickDefaultFunction } from "./targets";

const demo = (name: string) => readFileSync(join(__dirname, "../../fixtures/demo", `${name}.sol`), "utf8");

describe("listCallableFunctions", () => {
  it("lists state-changing external/public functions with canonical arg types", () => {
    expect(listCallableFunctions(demo("BrokenDEX"))).toEqual([
      { name: "swap", inputTypes: ["uint256"] },
      { name: "withdrawFees", inputTypes: ["address"] },
    ]);
  });

  it("skips view/pure/private functions and the constructor", () => {
    expect(listCallableFunctions(demo("ParallelSafe")).map((f) => f.name)).toEqual(["increment", "deposit"]);
  });

  it("returns [] for unparseable source", () => {
    expect(listCallableFunctions("contract X {")).toEqual([]);
  });
});

describe("pickDefaultFunction (same result in the browser and on the server)", () => {
  it("keeps the original zero-arg choice", () => {
    expect(pickDefaultFunction(listCallableFunctions(demo("BadNFT")))?.name).toBe("mint");
    expect(pickDefaultFunction(listCallableFunctions(demo("ParallelSafe")))?.name).toBe("deposit");
  });

  it("falls back to a function with supported args", () => {
    expect(pickDefaultFunction(listCallableFunctions(demo("BrokenDEX")))?.name).toBe("swap");
  });

  it("returns null when nothing is callable", () => {
    expect(pickDefaultFunction([{ name: "f", inputTypes: ["string"] }])).toBeNull();
  });
});

describe("encodePlaceholderArgs", () => {
  it("uint -> 1000, address -> sender, bool -> true, bytes32 -> 0", () => {
    const sender = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
    const out = encodePlaceholderArgs(["uint256", "address", "bool", "bytes32"], sender);
    expect(out).toBe(
      "0".repeat(61) + "3e8" + "0".repeat(24) + sender.slice(2).toLowerCase() + "0".repeat(63) + "1" + "0".repeat(64)
    );
  });

  it("caps the uint placeholder to the type's max so the ABI decoder does not revert", () => {
    expect(encodePlaceholderArgs(["uint8"], "0x0")).toBe("0".repeat(62) + "ff");
    expect(encodePlaceholderArgs(["uint16"], "0x0")).toBe("0".repeat(61) + "3e8");
  });

  it("throws on unsupported types", () => {
    expect(() => encodePlaceholderArgs(["string"], "0x0")).toThrow(/Unsupported/);
  });
});

describe("lastConcreteContractName", () => {
  it("uses source order, not solc's alphabetical order, and skips interfaces/abstract contracts", () => {
    const src = `pragma solidity ^0.8.20;
      contract Zeta { uint x; function f() external { x++; } }
      contract Alpha { uint y; function g() external { y++; } }
      interface IOmega { function h() external; }
      abstract contract Base { function k() external virtual; }`;
    expect(lastConcreteContractName(src)).toBe("Alpha");
    expect(listCallableFunctions(src).map((f) => f.name)).toEqual(["g"]);
  });
});
