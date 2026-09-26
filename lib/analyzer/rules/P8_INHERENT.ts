import * as parser from "@solidity-parser/parser";
import type { Finding } from "../../types";
import { accumulationsIn } from "../accumulation";
import { calleesOf, callersOf, isInternal } from "../calls";
import { bodiesOf, ModifierSites } from "../modifiers";
import { weightOfFunction } from "../reachability";
import type { AnalysisContext, Rule } from "./index";

// Heuristic: AMM pool reserves are contended by design — every swap on the
// pool must see the latest pair to keep the pricing invariant. Name-based
// for now; P1 defers to this rule for these variables.
const INHERENT_VAR = /^_?reserves?\d*$/i;

export function isInherentlyContendedVar(name: string): boolean {
  return INHERENT_VAR.test(name);
}

const WRITE_OPERATORS = new Set(["=", "+=", "-=", "*=", "/="]);

/** Inherent (reserve) variables written in `fn`, with the first write of each. */
export function inherentWritesIn(fn: any, inherent: ReadonlySet<string>): Map<string, any> {
  const writes = new Map<string, any>();
  const record = (node: any, variable: string) => {
    if (!writes.has(variable)) writes.set(variable, node);
  };
  parser.visit(fn, {
    BinaryOperation(node: any) {
      if (WRITE_OPERATORS.has(node.operator) && node.left?.type === "Identifier" && inherent.has(node.left.name)) {
        record(node, node.left.name);
      }
    },
    UnaryOperation(node: any) {
      if ((node.operator === "++" || node.operator === "--") && inherent.has(node.subExpression?.name)) {
        record(node, node.subExpression.name);
      }
    },
  });
  return writes;
}

export function inherentVarNames(ctx: AnalysisContext): Set<string> {
  return new Set(
    ctx.symbols.filter((v) => !v.isMapping && !v.isDynamicArray && isInherentlyContendedVar(v.name)).map((v) => v.name)
  );
}

/** Reserve variables `fn` writes itself (own body and modifiers). */
function ownReserveWrites(ast: any, fn: any, inherent: ReadonlySet<string>): string[] {
  const names = new Set<string>();
  for (const { node } of bodiesOf(ast, fn)) for (const name of inherentWritesIn(node, inherent).keys()) names.add(name);
  return [...names];
}

/** Reserve variables written by `fn` or by an internal function it calls (one level). */
function reserveWritesOneLevel(ast: any, fn: any, inherent: ReadonlySet<string>): { reserves: string[]; via?: string } {
  const own = ownReserveWrites(ast, fn, inherent);
  if (own.length > 0) return { reserves: own };
  for (const callee of calleesOf(ast, fn)) {
    const reserves = ownReserveWrites(ast, callee, inherent);
    if (reserves.length > 0) return { reserves, via: callee.name };
  }
  return { reserves: [] };
}

const quoted = (names: string[]) => names.map((v) => `"${v}"`).join(" and ");

/**
 * Why calls to `fn` already serialize on the pool reserves, or undefined. Accumulators
 * written in such a function add no contention of their own (P8, not P3):
 * - `fn` writes the reserves itself (Uniswap V2 `_update`: price accumulators);
 * - `fn` calls an internal function that does (one level: `mint` -> `_update`);
 * - `fn` is internal and every caller in the file is one of the above
 *   (Uniswap V2 `_mint`, only called from `mint`).
 */
export function reserveContext(ast: any, fn: any, inherent: ReadonlySet<string>): string | undefined {
  if (inherent.size === 0 || fn.isConstructor) return undefined;
  const where = fn.name ?? "this function";
  const direct = reserveWritesOneLevel(ast, fn, inherent);
  if (direct.reserves.length > 0) {
    return direct.via
      ? `${where} also calls ${direct.via}, which writes ${quoted(direct.reserves)}`
      : `${where} also writes ${quoted(direct.reserves)}`;
  }
  const callers = isInternal(fn) ? callersOf(ast, fn) : [];
  if (callers.length === 0) return undefined;
  const reserves = new Set<string>();
  const names: string[] = [];
  for (const caller of callers) {
    const reached = reserveWritesOneLevel(ast, caller, inherent);
    if (reached.reserves.length === 0) return undefined;
    reached.reserves.forEach((r) => reserves.add(r));
    names.push(`${caller.name ?? "constructor"}${reached.via ? ` (via ${reached.via})` : ""}`);
  }
  return `${where} is only called from ${names.join(", ")}, which also write${callers.length === 1 ? "s" : ""} ${quoted([...reserves])}`;
}

export const rule: Rule = {
  id: "P8_INHERENT",
  severity: "info",

  check(ctx: AnalysisContext): Finding[] {
    const findings: Finding[] = [];
    const inherent = inherentVarNames(ctx);
    if (inherent.size === 0) return findings;

    // Accumulators written in the same function as the reserves (e.g. Uniswap V2's
    // price0CumulativeLast): P3 skips these, reported here instead.
    const accumulators = new Set(
      ctx.symbols.filter((v) => !v.isMapping && !v.isDynamicArray && !inherent.has(v.name)).map((v) => v.name)
    );

    const modifierSites = new ModifierSites<Finding>();

    parser.visit(ctx.ast, {
      FunctionDefinition(fn: any) {
        if (fn.isConstructor) return;
        const bodies = bodiesOf(ctx.ast, fn);
        // variable -> first write and the modifier it is in, if any
        const writes = new Map<string, { node: any; modifier?: string }>();
        for (const { node: body, modifier } of bodies) {
          for (const [variable, node] of inherentWritesIn(body, inherent)) {
            if (!writes.has(variable)) writes.set(variable, { node, modifier });
          }
        }
        const context = reserveContext(ctx.ast, fn, inherent);
        if (writes.size === 0 && !context) return;
        const weight = weightOfFunction(fn, ctx.ast);

        const emit = (
          node: any,
          variable: string,
          modifier: string | undefined,
          conflictNote: string,
          describe: (site: string) => string
        ) => {
          const build = (site: string, w: number, name: string | undefined): Finding => ({
            ruleId: "P8_INHERENT",
            severity: "info",
            line: node.loc?.start.line ?? 0,
            column: node.loc?.start.column ?? 0,
            variable,
            functionName: name,
            reachabilityWeight: w,
            conflictNote,
            message: describe(site),
          });
          if (modifier) modifierSites.add(node, fn.name, weight, modifier, build);
          else findings.push(build(fn.name ?? "call", weight, fn.name ?? undefined));
        };

        for (const [variable, { node, modifier }] of writes) {
          emit(
            node,
            variable,
            modifier,
            `Read-write conflict on slot of \`${variable}\` (expected)`,
            (site) =>
              `"${variable}" is updated by every ${site} on this pool. This contention is inherent: sharding it would break the pool's pricing invariant, so no fix is offered.`
          );
        }

        const seen = new Set<string>();
        for (const { node: body, modifier } of bodies) {
          for (const { node, variable } of accumulationsIn(body, accumulators)) {
            if (seen.has(variable)) continue;
            seen.add(variable);
            emit(
              node,
              variable,
              modifier,
              `Read-write conflict on slot of \`${variable}\` (expected, alongside the reserves)`,
              (site) =>
                modifier
                  ? `"${variable}" is written in ${site}, and each of these calls also reaches the pool reserves. Those calls already serialize on the reserves, so this adds no contention of its own; no fix is offered.`
                  : `"${variable}" is written in ${site}, and ${context}. Those calls already serialize on the reserves, so this adds no contention of its own; no fix is offered.`
            );
          }
        }
      },
    });

    return [...findings, ...modifierSites.findings()];
  },
};
