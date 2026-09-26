// Shared by the browser (function picker) and the server (tx builder); keep free of Node APIs.
import * as parser from "@solidity-parser/parser";
import { safeParse } from "../analyzer/parse";

export interface CallableFn {
  name: string;
  inputTypes: string[]; // canonical ABI types, e.g. "uint256"
}

const HOT_FUNCTION_NAME = /mint|swap|deposit|claim|increment|transfer|buy|stake|trade|record/i;

export function isSupportedArgType(type: string): boolean {
  return /^uint(\d+)?$/.test(type) || type === "address" || type === "bool" || type === "bytes32";
}

export const UINT_PLACEHOLDER = 1000;

export const SUPPORTED_ARGS_TEXT = `uint* → ${UINT_PLACEHOLDER} (capped to the type's max), address → sender, bool → true, bytes32 → 0x0`;

export function signatureOf(fn: CallableFn): string {
  return `${fn.name}(${fn.inputTypes.join(",")})`;
}

export function unsupportedTypes(fn: CallableFn): string[] {
  return fn.inputTypes.filter((t) => !isSupportedArgType(t));
}

/**
 * Default target: prefer zero-argument functions (the original behavior),
 * then fall back to functions whose arguments we can fill. Within each
 * group, a mint/swap/deposit-like name wins, then alphabetical order
 * (matches solc's ABI ordering).
 */
export function pickDefaultFunction(fns: CallableFn[]): CallableFn | null {
  const sorted = [...fns].sort((a, b) => a.name.localeCompare(b.name));
  const pick = (group: CallableFn[]) => group.find((f) => HOT_FUNCTION_NAME.test(f.name)) ?? group[0] ?? null;
  return (
    pick(sorted.filter((f) => f.inputTypes.length === 0)) ??
    pick(sorted.filter((f) => f.inputTypes.length > 0 && unsupportedTypes(f).length === 0))
  );
}

const word = (hex: string) => hex.replace(/^0x/, "").padStart(64, "0");

/** ABI-encodes placeholder args (all static types, one 32-byte word each). */
export function encodePlaceholderArgs(inputTypes: string[], sender: string): string {
  return inputTypes
    .map((t) => {
      const uint = t.match(/^uint(\d+)?$/);
      if (uint) {
        // 1000 rather than 1 so that e.g. `fee = amount / 100` is non-zero and actually writes.
        const max = (BigInt(1) << BigInt(uint[1] ?? 256)) - BigInt(1);
        const value = BigInt(UINT_PLACEHOLDER) < max ? BigInt(UINT_PLACEHOLDER) : max;
        return word(value.toString(16));
      }
      if (t === "bool") return word("1");
      if (t === "address") return word(sender.toLowerCase());
      if (t === "bytes32") return word("0");
      throw new Error(`Unsupported argument type: ${t}`);
    })
    .join("");
}

function canonicalType(typeName: any): string {
  if (typeName?.type === "ArrayTypeName") {
    return `${canonicalType(typeName.baseTypeName)}[${typeName.length?.number ?? ""}]`;
  }
  if (typeName?.type !== "ElementaryTypeName") return typeName?.type === "UserDefinedTypeName" ? typeName.namePath : "unknown";
  const name: string = typeName.name;
  if (name === "uint") return "uint256";
  if (name === "int") return "int256";
  if (name === "address payable") return "address";
  return name;
}

function lastConcreteContract(source: string): any {
  const parsed = safeParse(source);
  if (!parsed.ok) return null;
  let target: any = null;
  parser.visit(parsed.ast, {
    ContractDefinition(node: any) {
      if (node.kind === "contract") target = node;
    },
  });
  return target;
}

/** The contract the server deploys: the last non-abstract contract in source order. */
export function lastConcreteContractName(source: string): string | null {
  return lastConcreteContract(source)?.name ?? null;
}

/**
 * State-changing external/public functions of the last concrete contract
 * in the file (the one the server deploys). Inherited functions are not
 * listed — the file has to be flattened anyway.
 */
export function listCallableFunctions(source: string): CallableFn[] {
  const target = lastConcreteContract(source);
  if (!target) return [];

  const fns: CallableFn[] = [];
  for (const node of target.subNodes ?? []) {
    if (node.type !== "FunctionDefinition" || !node.name || node.isConstructor) continue;
    if (node.visibility !== "external" && node.visibility !== "public") continue;
    if (node.stateMutability === "view" || node.stateMutability === "pure") continue;
    fns.push({ name: node.name, inputTypes: (node.parameters ?? []).map((p: any) => canonicalType(p.typeName)) });
  }
  return fns;
}
