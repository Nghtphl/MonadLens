import * as parser from "@solidity-parser/parser";
import type { Finding } from "../../types";
import { bodiesOf } from "../modifiers";
import { weightOfFunction } from "../reachability";
import type { AnalysisContext, Rule } from "./index";

// CLAUDE.md §5C: reentrancy-guard writes are info only. They are recognized by
// the modifier name (nonReentrant, noReentrancy, Uniswap V2's `lock`, a mutex)
// or by the lock variable's usual names (OZ `_status`, OZ 2.x `_guardCounter`,
// Uniswap V2 `unlocked`).
const GUARD_MODIFIER = /reentran|^lock$|mutex/i;
const GUARD_VARIABLE = /^_?(status|guardCounter|locked|unlocked|reentrancyStatus|reentrancyLock|reentrancyGuard)$/i;

export function isGuardWrite(modifier: string | undefined, variable: string): boolean {
  return modifier !== undefined && (GUARD_MODIFIER.test(modifier) || GUARD_VARIABLE.test(variable));
}

const WRITE_OPERATORS = new Set(["=", "+=", "-=", "*=", "/="]);

/** Plain state variables written in `body`, with the first write of each. */
function writesIn(body: any, stateVars: ReadonlySet<string>): Map<string, any> {
  const writes = new Map<string, any>();
  const record = (node: any, name: string) => {
    if (stateVars.has(name) && !writes.has(name)) writes.set(name, node);
  };
  parser.visit(body, {
    BinaryOperation(node: any) {
      if (WRITE_OPERATORS.has(node.operator) && node.left?.type === "Identifier") record(node, node.left.name);
    },
    UnaryOperation(node: any) {
      if ((node.operator === "++" || node.operator === "--") && node.subExpression?.type === "Identifier") {
        record(node, node.subExpression.name);
      }
    },
  });
  return writes;
}

export const rule: Rule = {
  id: "C1_REENTRANCY_GUARD",
  severity: "info",

  check(ctx: AnalysisContext): Finding[] {
    const stateVars = new Set(ctx.symbols.filter((v) => !v.isMapping && !v.isDynamicArray).map((v) => v.name));
    // One finding per guard write site, listing every function that runs it.
    const sites = new Map<any, { variable: string; modifier: string; functions: string[]; weight: number }>();

    parser.visit(ctx.ast, {
      FunctionDefinition(fn: any) {
        const weight = weightOfFunction(fn, ctx.ast);
        if (weight === 0) return;
        for (const { node: body, modifier } of bodiesOf(ctx.ast, fn)) {
          if (!modifier) continue;
          for (const [variable, node] of writesIn(body, stateVars)) {
            if (!isGuardWrite(modifier, variable)) continue;
            const site = sites.get(node) ?? { variable, modifier, functions: [], weight: 0 };
            site.functions.push(fn.name ?? "constructor");
            site.weight = Math.max(site.weight, weight);
            sites.set(node, site);
          }
        }
      },
    });

    return [...sites.entries()].map(([node, site]) => ({
      ruleId: "C1_REENTRANCY_GUARD",
      severity: "info" as const,
      line: node.loc?.start.line ?? 0,
      column: node.loc?.start.column ?? 0,
      variable: site.variable,
      functionName: site.functions.length === 1 ? site.functions[0] : undefined,
      reachabilityWeight: site.weight,
      conflictNote: `Reentrancy-guard write to \`${site.variable}\`; contention not claimed unless measured`,
      message:
        `"${site.variable}" is written by the reentrancy guard \`${site.modifier}\` on every call to ` +
        `${site.functions.join(", ")}. Consider OpenZeppelin's ReentrancyGuardTransient, which keeps the lock ` +
        `in transient storage (EIP-1153) instead of a storage slot. MonadLens does not count this as ` +
        `contention; measure the function to see whether the slot shows up as hot.`,
    }));
  },
};
