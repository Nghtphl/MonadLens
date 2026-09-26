import * as parser from "@solidity-parser/parser";
import type { FunctionDefinition } from "@solidity-parser/parser/dist/src/ast-types";
import { calledFunctions, modifiersOf } from "./modifiers";

/** Function reachability weighting per CLAUDE.md §6. */
export type FunctionReachability =
  | "open" // external/public, no access modifier, payable or mint/swap/transfer/deposit/claim-like name
  | "broad-restricted" // restricted but broad (whitelist, merkle proof)
  | "owner-gated" // onlyOwner / onlyRole
  | "view-or-pure";

const WEIGHTS: Record<FunctionReachability, number> = {
  open: 1.0,
  "broad-restricted": 0.5,
  "owner-gated": 0.05,
  "view-or-pure": 0,
};

export function weightOf(reachability: FunctionReachability): number {
  return WEIGHTS[reachability];
}

const ADMIN_MODIFIER_PATTERN = /(owner|admin|role|governance)/i;

interface AstNodeLike {
  type?: string;
  name?: string;
  memberName?: string;
  operator?: string;
  expression?: AstNodeLike | null;
  arguments?: AstNodeLike[];
  left?: AstNodeLike;
  right?: AstNodeLike;
  statements?: AstNodeLike[];
  condition?: AstNodeLike;
  trueBody?: AstNodeLike;
  falseBody?: AstNodeLike | null;
}

function isMsgSender(node: AstNodeLike | null | undefined): boolean {
  return (
    node?.type === "MemberAccess" &&
    node.memberName === "sender" &&
    node.expression?.type === "Identifier" &&
    node.expression.name === "msg"
  );
}

function isOwner(node: AstNodeLike | null | undefined): boolean {
  return node?.type === "Identifier" && node.name === "owner";
}

function comparesSenderAndOwner(
  node: AstNodeLike | null | undefined,
  operator: "==" | "!="
): boolean {
  if (node?.type !== "BinaryOperation" || node.operator !== operator) return false;
  return (
    (isMsgSender(node.left) && isOwner(node.right)) ||
    (isOwner(node.left) && isMsgSender(node.right))
  );
}

function isRequireOwnerGuard(statement: AstNodeLike | null | undefined): boolean {
  const call = statement?.type === "ExpressionStatement" ? statement.expression : null;
  return (
    call?.type === "FunctionCall" &&
    call.expression?.type === "Identifier" &&
    call.expression.name === "require" &&
    comparesSenderAndOwner(call.arguments?.[0], "==")
  );
}

function isRevert(statement: AstNodeLike | null | undefined): boolean {
  if (statement?.type === "RevertStatement") return true;
  if (statement?.type === "Block") {
    return statement.statements?.length === 1 && isRevert(statement.statements[0]);
  }

  const call = statement?.type === "ExpressionStatement" ? statement.expression : null;
  return (
    call?.type === "FunctionCall" &&
    call.expression?.type === "Identifier" &&
    call.expression.name === "revert"
  );
}

function isRevertOwnerGuard(statement: AstNodeLike | null | undefined): boolean {
  return (
    statement?.type === "IfStatement" &&
    statement.falseBody == null &&
    comparesSenderAndOwner(statement.condition, "!=") &&
    isRevert(statement.trueBody)
  );
}

/** Returns true only for the explicit administrator gates documented in CLAUDE.md §5C. */
export function isAdminRestrictedFunction(fn: FunctionDefinition): boolean {
  const modifiers: string[] = (fn?.modifiers ?? [])
    .map((modifier) => modifier.name)
    .filter((name: unknown): name is string => typeof name === "string");

  if (modifiers.some((name) => ADMIN_MODIFIER_PATTERN.test(name))) {
    return true;
  }

  const firstStatement = fn?.body?.statements?.[0] as AstNodeLike | undefined;
  return isRequireOwnerGuard(firstStatement) || isRevertOwnerGuard(firstStatement);
}

function mentionsCaller(node: unknown): boolean {
  let found = false;
  parser.visit(node as any, {
    MemberAccess(n: any) {
      if (isMsgSender(n) || (n.memberName === "origin" && n.expression?.name === "tx")) found = true;
    },
    FunctionCall(n: any) {
      if (n.expression?.type === "Identifier" && n.expression.name === "_msgSender") found = true;
    },
  });
  return found;
}

/** A `require`/`assert` or an `if` whose condition looks at the caller. */
function hasCallerCheck(body: unknown): boolean {
  let found = false;
  parser.visit(body as any, {
    FunctionCall(n: any) {
      const callee = n.expression;
      if (callee?.type === "Identifier" && (callee.name === "require" || callee.name === "assert")) {
        if ((n.arguments ?? []).some(mentionsCaller)) found = true;
      }
    },
    IfStatement(n: any) {
      if (mentionsCaller(n.condition)) found = true;
    },
  });
  return found;
}

/**
 * Whether a modifier limits who can call: it checks the caller itself, or an
 * internal function it calls does (one level, e.g. OZ's `_checkOwner()`).
 * A modifier with no definition in this file is assumed to restrict.
 */
function restrictsCaller(ast: unknown, definition: any): boolean {
  if (!definition) return true;
  if (hasCallerCheck(definition.body)) return true;
  return calledFunctions(ast, definition, definition.body).some((f) => hasCallerCheck(f.body));
}

/**
 * Heuristic classifier per CLAUDE.md §6/§5C:
 * - view/pure can't write storage, so they never contend -> 0 weight.
 * - administrator modifiers and leading owner guards -> owner-gated (0.05).
 * - a modifier that checks the caller (whitelist, merkle proof, ...) -> broad-restricted (0.5).
 * - no modifier, or only modifiers that don't check the caller (nonReentrant,
 *   updateReward, whenNotPaused) -> open (1.0). This needs `ast` to resolve
 *   modifier bodies; without it, any modifier counts as broad-restricted.
 */
export function classifyFunction(fn: FunctionDefinition, ast?: unknown): FunctionReachability {
  if (fn?.stateMutability === "view" || fn?.stateMutability === "pure") {
    return "view-or-pure";
  }

  if (isAdminRestrictedFunction(fn)) {
    return "owner-gated";
  }
  if ((fn?.modifiers ?? []).length === 0) {
    return "open";
  }
  if (ast === undefined) {
    return "broad-restricted";
  }
  return modifiersOf(ast, fn).some(({ definition }) => restrictsCaller(ast, definition))
    ? "broad-restricted"
    : "open";
}

export function weightOfFunction(fn: FunctionDefinition, ast?: unknown): number {
  return weightOf(classifyFunction(fn, ast));
}
