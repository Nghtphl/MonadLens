import * as parser from "@solidity-parser/parser";
import type { ASTNode } from "@solidity-parser/parser/dist/src/ast-types";

export interface StateVarInfo {
  name: string;
  isMapping: boolean;
  isDynamicArray: boolean;
}

/**
 * Collects contract-level state variables and their storage shape.
 * Rules use this to distinguish e.g. a plain uint counter from a
 * dynamic array or a mapping before deciding which pattern applies.
 *
 * TODO(P3/P4/reachability): this only records declarations today. Rules
 * still need a read/write-per-function map (which function writes which
 * var, and under which modifier) to compute `reachabilityWeight` — see
 * lib/analyzer/reachability.ts.
 */
export function collectStateVariables(ast: ASTNode): StateVarInfo[] {
  const vars: StateVarInfo[] = [];

  parser.visit(ast, {
    StateVariableDeclaration(node: any) {
      for (const variable of node.variables ?? []) {
        const typeName = variable.typeName;
        vars.push({
          name: variable.name,
          isMapping: typeName?.type === "Mapping",
          isDynamicArray:
            typeName?.type === "ArrayTypeName" && typeName.length == null,
        });
      }
    },
  });

  return vars;
}

export function isMsgSenderExpression(node: any): boolean {
  return (
    node?.type === "MemberAccess" &&
    node.memberName === "sender" &&
    node.expression?.type === "Identifier" &&
    node.expression.name === "msg"
  );
}

export function isNumberLiteralOne(node: any): boolean {
  return node?.type === "NumberLiteral" && node.number === "1";
}
