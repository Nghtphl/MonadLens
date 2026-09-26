import * as parser from "@solidity-parser/parser";
import type { Finding } from "../../types";
import { bodiesOf, ModifierSites } from "../modifiers";
import { weightOfFunction } from "../reachability";
import type { AnalysisContext, Rule } from "./index";

export const rule: Rule = {
  id: "P2_ARRAY_PUSH",
  severity: "high",

  check(ctx: AnalysisContext): Finding[] {
    const findings: Finding[] = [];
    const modifierSites = new ModifierSites<Finding>();
    const dynamicArrayNames = new Set(ctx.symbols.filter((v) => v.isDynamicArray).map((v) => v.name));

    parser.visit(ctx.ast, {
      ContractDefinition(node: any) {
        const inheritsEnumerable = (node.baseContracts ?? []).some(
          (base: any) => base.baseName?.namePath === "ERC721Enumerable"
        );
        if (inheritsEnumerable) {
          const line = node.loc?.start.line ?? 0;
          findings.push({
            ruleId: "P2_ARRAY_PUSH",
            severity: "high",
            line,
            column: node.loc?.start.column ?? 0,
            functionName: undefined,
            reachabilityWeight: 1.0,
            conflictNote: "Read-write conflict on OpenZeppelin's internal enumeration array/mapping pair",
            message: `Contract "${node.name}" inherits ERC721Enumerable, whose _addTokenToAllTokensEnumeration bookkeeping writes a shared array on every mint/transfer.`,
            fixTemplateId: "mapping-plus-event",
            tradeoffs: [
              "Dropping ERC721Enumerable loses on-chain tokenByIndex/tokenOfOwnerByIndex support; callers must use an off-chain indexer instead.",
            ],
          });
        }
      },

      FunctionDefinition(fn: any) {
        const weight = weightOfFunction(fn, ctx.ast);

        for (const { node: body, modifier } of bodiesOf(ctx.ast, fn)) {
          parser.visit(body, {
            FunctionCall(node: any) {
              const callee = node.expression;
              if (
                callee?.type === "MemberAccess" &&
                callee.memberName === "push" &&
                callee.expression?.type === "Identifier" &&
                dynamicArrayNames.has(callee.expression.name)
              ) {
                const line = node.loc?.start.line ?? 0;
                const variable = callee.expression.name;
                const build = (site: string, w: number, name: string | undefined): Finding => ({
                  ruleId: "P2_ARRAY_PUSH",
                  severity: "high",
                  line,
                  column: node.loc?.start.column ?? 0,
                  variable,
                  functionName: name,
                  reachabilityWeight: w,
                  conflictNote: `Read-write conflict on slot of \`${variable}\` (array length + tail slot)`,
                  message: `".push()" on dynamic storage array "${variable}" in ${site} serializes every caller on the array's length slot.`,
                  fixTemplateId: "mapping-plus-event",
                  tradeoffs: [
                    "Enumeration (e.g. tokenOfOwnerByIndex-style iteration) needs an off-chain indexer or execution events instead of direct array reads.",
                    "If an on-chain count is still needed, pair this with the sharded-counter template.",
                  ],
                });
                if (modifier) modifierSites.add(node, fn.name, weight, modifier, build);
                else findings.push(build(fn.name ?? "this function", weight, fn.name ?? undefined));
              }
            },
          });
        }
      },
    });

    return [...findings, ...modifierSites.findings()];
  },
};
