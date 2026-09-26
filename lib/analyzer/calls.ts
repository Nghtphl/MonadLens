import * as parser from "@solidity-parser/parser";
import { bodiesOf, calledFunctions } from "./modifiers";

/**
 * One level of the in-file call graph: which internal functions a function
 * calls (from its own body and its modifiers'), and who calls a function.
 * Calls are resolved by name in the caller's contract and its bases.
 */
interface CallIndex {
  callees: Map<any, any[]>;
  callers: Map<any, any[]>;
}

const cache = new WeakMap<object, CallIndex>();

function indexOf(ast: any): CallIndex {
  let index = cache.get(ast);
  if (index) return index;
  index = { callees: new Map(), callers: new Map() };
  const { callees, callers } = index;

  parser.visit(ast, {
    FunctionDefinition(fn: any) {
      if (!fn.body) return;
      const found = new Set<any>();
      for (const { node, owner } of bodiesOf(ast, fn)) {
        for (const callee of calledFunctions(ast, owner, node)) found.add(callee);
      }
      callees.set(fn, [...found]);
      for (const callee of found) callers.set(callee, [...(callers.get(callee) ?? []), fn]);
    },
  });

  cache.set(ast, index);
  return index;
}

export function calleesOf(ast: any, fn: any): any[] {
  return indexOf(ast).callees.get(fn) ?? [];
}

export function callersOf(ast: any, fn: any): any[] {
  return indexOf(ast).callers.get(fn) ?? [];
}

export function isInternal(fn: any): boolean {
  return fn.visibility === "internal" || fn.visibility === "private";
}
