import * as parser from "@solidity-parser/parser";
import { safeParse } from "./parse";

export interface VariableLocation {
  declarationLine: number | null;
  /** Lines writing the variable, restricted to `functionName` when it writes there. */
  writeLines: number[];
}

const ASSIGNMENT_OPERATORS = new Set(["=", "+=", "-=", "*=", "/=", "%=", "|=", "&=", "^=", "<<=", ">>="]);

/** `_shardCounts[3]` -> `_shardCounts` (storage-layout labels include the element index). */
export function baseVariableName(label: string): string {
  return label.replace(/\[\d+\]$/, "");
}

function rootIdentifier(node: any): string | null {
  if (!node) return null;
  if (node.type === "Identifier") return node.name;
  if (node.type === "IndexAccess") return rootIdentifier(node.base);
  if (node.type === "MemberAccess") return rootIdentifier(node.expression);
  return null;
}

export function locateVariable(source: string, name: string, functionName?: string): VariableLocation {
  const parsed = safeParse(source);
  if (!parsed.ok) return { declarationLine: null, writeLines: [] };

  let declarationLine: number | null = null;
  const writesByFunction = new Map<string, Set<number>>();

  parser.visit(parsed.ast, {
    StateVariableDeclaration(node: any) {
      if (node.variables?.some((v: any) => v.name === name)) declarationLine = node.loc?.start.line ?? null;
    },
    FunctionDefinition(fn: any) {
      const lines = new Set<number>();
      const add = (node: any) => node.loc && lines.add(node.loc.start.line);
      parser.visit(fn, {
        BinaryOperation(node: any) {
          if (ASSIGNMENT_OPERATORS.has(node.operator) && rootIdentifier(node.left) === name) add(node);
        },
        UnaryOperation(node: any) {
          if (["++", "--", "delete"].includes(node.operator) && rootIdentifier(node.subExpression) === name) add(node);
        },
        FunctionCall(node: any) {
          const callee = node.expression;
          if (callee?.type === "MemberAccess" && ["push", "pop"].includes(callee.memberName) && rootIdentifier(callee.expression) === name) {
            add(node);
          }
        },
      });
      if (lines.size > 0) writesByFunction.set(fn.name ?? (fn.isConstructor ? "constructor" : ""), lines);
    },
  });

  const inFunction = functionName ? writesByFunction.get(functionName) : undefined;
  const lines = inFunction ?? new Set([...writesByFunction.values()].flatMap((s) => [...s]));
  return { declarationLine, writeLines: [...lines].sort((a, b) => a - b) };
}
