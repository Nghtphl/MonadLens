import * as parser from "@solidity-parser/parser";
import type { Finding } from "../../types";
import { accumulationsIn, selfDerivedAssignmentsIn } from "../accumulation";
import { bodiesOf, ModifierSites } from "../modifiers";
import { weightOfFunction } from "../reachability";
import { isGuardWrite } from "./C1_REENTRANCY_GUARD";
import { inherentVarNames, reserveContext } from "./P8_INHERENT";
import type { AnalysisContext, Rule } from "./index";

// No fixTemplateId: the right fix (per-user accrual, sharding, or keeping it
// next to an already-contended slot) depends on how the total is consumed,
// and there is no template for it yet.
export const rule: Rule = {
  id: "P3_GLOBAL_ACCUMULATOR",
  severity: "high",

  check(ctx: AnalysisContext): Finding[] {
    const findings: Finding[] = [];
    const inherent = inherentVarNames(ctx);
    const accumulators = new Set(
      ctx.symbols.filter((v) => !v.isMapping && !v.isDynamicArray && !inherent.has(v.name)).map((v) => v.name)
    );

    const modifierSites = new ModifierSites<Finding>();

    parser.visit(ctx.ast, {
      FunctionDefinition(fn: any) {
        // Already next to a contended slot: calls to this function serialize on the
        // pool reserves anyway (directly or one call away), so P8 reports these.
        if (reserveContext(ctx.ast, fn, inherent)) return;
        const weight = weightOfFunction(fn, ctx.ast);

        const emit = (
          node: any,
          variable: string,
          modifier: string | undefined,
          describe: (site: string) => string
        ) => {
          const build = (site: string, w: number, name: string | undefined): Finding => ({
            ruleId: "P3_GLOBAL_ACCUMULATOR",
            severity: "high",
            line: node.loc?.start.line ?? 0,
            column: node.loc?.start.column ?? 0,
            variable,
            functionName: name,
            reachabilityWeight: w,
            conflictNote: `Read-write conflict on slot of \`${variable}\``,
            message: describe(site),
          });
          if (modifier) modifierSites.add(node, fn.name, weight, modifier, build);
          else findings.push(build(fn.name ?? "this function", weight, fn.name ?? undefined));
        };

        for (const { node: body, modifier, owner } of bodiesOf(ctx.ast, fn)) {
          for (const { node, variable } of accumulationsIn(body, accumulators)) {
            if (isGuardWrite(modifier, variable)) continue; // C1_REENTRANCY_GUARD reports it
            emit(
              node,
              variable,
              modifier,
              (site) =>
                `"${variable}" accumulates a per-call amount in ${site}, so every caller reads and writes the same slot.`
            );
          }
          for (const { node, variable, via } of selfDerivedAssignmentsIn(ctx.ast, owner, body, accumulators)) {
            if (isGuardWrite(modifier, variable)) continue;
            emit(
              node,
              variable,
              modifier,
              (site) =>
                `"${variable}" is overwritten in ${site} with ${via}(), which reads it, so every caller reads and writes the same slot.`
            );
          }
        }
      },
    });

    return [...findings, ...modifierSites.findings()];
  },
};
