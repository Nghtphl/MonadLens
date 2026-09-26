import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { baseVariableName, locateVariable } from "./locate";

const demo = (name: string) => readFileSync(join(__dirname, "../../fixtures/demo", `${name}.sol`), "utf8");

describe("locateVariable", () => {
  it("finds the declaration and the write inside the measured function", () => {
    expect(locateVariable(demo("BadNFT"), "totalSupply", "mint")).toEqual({ declarationLine: 6, writeLines: [11] });
  });

  it("falls back to every write when the function does not write the variable", () => {
    expect(locateVariable(demo("BadNFT"), "totalSupply", "nope").writeLines).toEqual([11, 18]);
  });

  it("handles indexed writes and both AMM reserves", () => {
    const amm = demo("AMMPool");
    expect(locateVariable(amm, "reserve0", "swap").writeLines).toEqual([18, 23]);
    expect(locateVariable(amm, "reserve1", "swap").writeLines).toEqual([19, 22]);
    const sharded = `pragma solidity ^0.8.20; contract S { uint256[16] private shards;
      function f() external {
        shards[1] += 1;
      } }`;
    expect(locateVariable(sharded, "shards", "f")).toEqual({ declarationLine: 1, writeLines: [3] });
  });

  it("counts .push() as a write and survives unparseable source", () => {
    expect(locateVariable(demo("BrokenDEX"), "traders", "swap").writeLines).toEqual([20]);
    expect(locateVariable("contract X {", "x")).toEqual({ declarationLine: null, writeLines: [] });
  });
});

describe("baseVariableName", () => {
  it("strips a trailing element index", () => {
    expect(baseVariableName("_shardCounts[3]")).toBe("_shardCounts");
    expect(baseVariableName("totalSupply")).toBe("totalSupply");
  });
});
