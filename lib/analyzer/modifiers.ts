import * as parser from "@solidity-parser/parser";

/** A body the rules scan for a function: its own, or one of its modifiers'. */
export interface ScannedBody {
  node: any;
  /** Set when `node` is the body of this modifier, invoked by the function. */
  modifier?: string;
  /** The function or modifier definition `node` belongs to (for resolving calls). */
  owner: any;
}

interface ScopeIndex {
  /** contract name -> modifier name -> definition */
  modifiers: Map<string, Map<string, any>>;
  /** contract name -> function name -> definitions (overloads) */
  functions: Map<string, Map<string, any[]>>;
  /** contract name -> base contract names, as written */
  bases: Map<string, string[]>;
  /** function/modifier node -> enclosing contract name */
  contractOf: WeakMap<object, string>;
}

const cache = new WeakMap<object, ScopeIndex>();

function indexOf(ast: any): ScopeIndex {
  let index = cache.get(ast);
  if (index) return index;
  index = { modifiers: new Map(), functions: new Map(), bases: new Map(), contractOf: new WeakMap() };
  const { modifiers, functions, bases, contractOf } = index;

  parser.visit(ast, {
    ContractDefinition(contract: any) {
      const ownModifiers = new Map<string, any>();
      const ownFunctions = new Map<string, any[]>();
      for (const sub of contract.subNodes ?? []) {
        if (sub.type === "ModifierDefinition") {
          contractOf.set(sub, contract.name);
          if (sub.body) ownModifiers.set(sub.name, sub);
        }
        if (sub.type === "FunctionDefinition") {
          contractOf.set(sub, contract.name);
          if (sub.name && sub.body) ownFunctions.set(sub.name, [...(ownFunctions.get(sub.name) ?? []), sub]);
        }
      }
      modifiers.set(contract.name, ownModifiers);
      functions.set(contract.name, ownFunctions);
      bases.set(contract.name, (contract.baseContracts ?? []).map((b: any) => b.baseName?.namePath).filter(Boolean));
    },
  });

  cache.set(ast, index);
  return index;
}

/**
 * Looks `name` up from `contract`: its own members first, then the nearest
 * base (Solidity lists bases from most base-like to most derived, so the
 * last-listed base is searched first). Only this source file is seen.
 */
function lookup<T>(
  index: ScopeIndex,
  table: Map<string, Map<string, T>>,
  contract: string | undefined,
  name: string
): T | undefined {
  const seen = new Set<string>();
  const queue = contract ? [contract] : [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (seen.has(current)) continue;
    seen.add(current);
    const found = table.get(current)?.get(name);
    if (found) return found;
    queue.push(...[...(index.bases.get(current) ?? [])].reverse());
  }
  return undefined;
}

/** Modifier definition for `name` as seen from `from` (a function or modifier node). */
function resolveModifier(index: ScopeIndex, from: any, name: string): any {
  const contract = index.contractOf.get(from);
  const found = lookup(index, index.modifiers, contract, name);
  if (found) return found;
  // Contract unknown (e.g. a free function): any definition with that name.
  for (const own of index.modifiers.values()) {
    const any = own.get(name);
    if (any) return any;
  }
  return undefined;
}

/** Modifiers `fn` invokes, each with its definition when this file has one. */
export function modifiersOf(ast: any, fn: any): { name: string; definition?: any }[] {
  const index = indexOf(ast);
  const result: { name: string; definition?: any }[] = [];
  const done = new Set<string>();
  for (const invocation of fn.modifiers ?? []) {
    const name = invocation?.name;
    if (typeof name !== "string" || done.has(name)) continue;
    done.add(name);
    result.push({ name, definition: resolveModifier(index, fn, name) });
  }
  return result;
}

/**
 * Internal functions a body calls by plain name (`_update(...)`, `rewardPerToken()`),
 * resolved in the caller's contract and its bases. `from` is the function or
 * modifier that contains `body`. Overloads are all returned.
 */
export function calledFunctions(ast: any, from: any, body: any): any[] {
  const index = indexOf(ast);
  const contract = index.contractOf.get(from);
  const found = new Set<any>();
  parser.visit(body, {
    FunctionCall(call: any) {
      if (call.expression?.type !== "Identifier") return;
      for (const definition of lookup(index, index.functions, contract, call.expression.name) ?? []) {
        if (definition !== from) found.add(definition);
      }
    },
  });
  return [...found];
}

/**
 * What the rules scan for `fn`: the function itself, then the body of each
 * modifier it invokes (CLAUDE.md §5: state writes in a modifier count for the
 * function, with the function's reachability weight). Base-constructor calls
 * on constructors look like modifier invocations; they resolve to nothing.
 */
export function bodiesOf(ast: any, fn: any): ScannedBody[] {
  const bodies: ScannedBody[] = [{ node: fn, owner: fn }];
  for (const { name, definition } of modifiersOf(ast, fn)) {
    if (definition) bodies.push({ node: definition.body, modifier: name, owner: definition });
  }
  return bodies;
}

/** Definitions `name(...)` resolves to when called from `from` (own contract, then bases). */
export function resolveCall(ast: any, from: any, name: string): any[] {
  const index = indexOf(ast);
  return lookup(index, index.functions, index.contractOf.get(from), name) ?? [];
}

/** "stake" or "stake, withdraw (via modifier `updateReward`)", for finding messages. */
export function describeSite(functionNames: string | null | undefined | string[], modifier?: string): string {
  const names = Array.isArray(functionNames) ? functionNames.join(", ") : (functionNames ?? "this function");
  return modifier ? `${names} (via modifier \`${modifier}\`)` : names;
}

/**
 * Collects findings for writes inside modifier bodies: one finding per write
 * site, however many functions invoke the modifier (CLAUDE.md §5). The weight
 * is the highest among those functions; the message lists them all.
 */
export class ModifierSites<F> {
  private readonly sites = new Map<
    any,
    { functions: string[]; weight: number; modifier: string; build: SiteBuilder<F> }
  >();

  add(
    node: any,
    functionName: string | null | undefined,
    weight: number,
    modifier: string,
    build: SiteBuilder<F>
  ): void {
    const site = this.sites.get(node) ?? { functions: [], weight: 0, modifier, build };
    const name = functionName ?? "constructor";
    if (!site.functions.includes(name)) site.functions.push(name);
    site.weight = Math.max(site.weight, weight);
    this.sites.set(node, site);
  }

  findings(): F[] {
    return [...this.sites.values()].map(({ functions, weight, modifier, build }) =>
      build(describeSite(functions, modifier), weight, functions.length === 1 ? functions[0] : undefined)
    );
  }
}

/** Builds a finding for a site: its description, weight and single function name (if one). */
export type SiteBuilder<F> = (site: string, weight: number, functionName: string | undefined) => F;
