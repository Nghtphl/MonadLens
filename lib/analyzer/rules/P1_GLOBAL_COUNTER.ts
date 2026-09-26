import * as parser from "@solidity-parser/parser";
import type { Finding } from "../../types";
import { weightOfFunction } from "../reachability";
import { counterUpdatesIn } from "../accumulation";
import { bodiesOf, ModifierSites } from "../modifiers";
import { isGuardWrite } from "./C1_REENTRANCY_GUARD";
import { isInherentlyContendedVar } from "./P8_INHERENT";
import type { AnalysisContext, Rule } from "./index";

export const rule: Rule = {
  id: "P1_GLOBAL_COUNTER",
  severity: "critical",

  check(ctx: AnalysisContext): Finding[] {
    const findings: Finding[] = [];
    const modifierSites = new ModifierSites<Finding>();
    const stateVarNames = new Set(
      ctx.symbols
        .filter((v) => !v.isMapping && !v.isDynamicArray && !isInherentlyContendedVar(v.name))
        .map((v) => v.name)
    );

    parser.visit(ctx.ast, {
      FunctionDefinition(fn: any) {
        const weight = weightOfFunction(fn, ctx.ast);

        for (const { node: body, modifier } of bodiesOf(ctx.ast, fn)) {
          for (const { node, variable } of counterUpdatesIn(body, stateVarNames)) {
            if (isGuardWrite(modifier, variable)) continue; // C1_REENTRANCY_GUARD reports it
            if (modifier) {
              modifierSites.add(node, fn.name, weight, modifier, (site, w, name) =>
                buildFinding(node, variable, site, name, w)
              );
            } else {
              findings.push(buildFinding(node, variable, fn.name ?? "this function", fn.name, weight));
            }
          }
        }
      },
    });

    return [...findings, ...modifierSites.findings()];
  },
};

function buildFinding(
  node: any,
  variable: string,
  site: string,
  functionName: string | null | undefined,
  reachabilityWeight: number
): Finding {
  const line = node.loc?.start.line ?? 0;
  return {
    ruleId: "P1_GLOBAL_COUNTER",
    severity: "critical",
    line,
    column: node.loc?.start.column ?? 0,
    variable,
    functionName: functionName ?? undefined,
    reachabilityWeight,
    conflictNote: `Read-write conflict on slot of \`${variable}\``,
    message: `Global counter "${variable}" is incremented/decremented directly, serializing every call to ${site} on a single storage slot.`,
    fixTemplateId: "sharded-counter",
    tradeoffs: [
      "IDs become non-sequential across shards.",
      "Per-shard sell-out is possible even while other shards still have capacity.",
      `Reading the aggregate ("${variable}()") costs N shard reads instead of 1.`,
    ],
  };
}
