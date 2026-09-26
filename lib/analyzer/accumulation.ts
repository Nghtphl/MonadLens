import * as parser from "@solidity-parser/parser";
import { resolveCall } from "./modifiers";

/**
 * One read-modify-write of a state variable by a step:
 *   x++  x--  ++x  --x
 *   x += c  x -= c  x *= c  x /= c
 *   x = x + c  x = c + x  x = x - c
 *   x = x.add(c)  x = x.sub(c)          (SafeMath)
 * `constantStep` is true for ++/-- and literal steps: that is a counter (P1).
 * A per-call amount is an accumulator (P3). Shared by P1, P3 and P8.
 */
export interface StateUpdate {
  node: any;
  variable: string;
  /** "++", "--", "+=", "-=", "*=", "/=", "+", "-", "add", "sub" */
  operator: string;
  constantStep: boolean;
}

// P1 is a counter: `x++` or `x += <literal>`. `x += amount` is an
// accumulator and belongs to P3 (CLAUDE.md §5).
export function isConstantStep(node: any): boolean {
  return node?.type === "NumberLiteral";
}

const COMPOUND_OPERATORS = new Set(["+=", "-=", "*=", "/="]);
const SAFE_MATH_METHODS = new Set(["add", "sub"]);

const isIdentifier = (node: any, name: string) => node?.type === "Identifier" && node.name === name;

/** For `x = <rhs>`: the step if rhs is `x + c`, `c + x`, `x - c`, `x.add(c)` or `x.sub(c)`. */
function selfStep(variable: string, rhs: any): { operator: string; step: any } | undefined {
  if (rhs?.type === "BinaryOperation") {
    if (rhs.operator === "+" || rhs.operator === "-") {
      if (isIdentifier(rhs.left, variable)) return { operator: rhs.operator, step: rhs.right };
      if (rhs.operator === "+" && isIdentifier(rhs.right, variable)) return { operator: "+", step: rhs.left };
    }
    return undefined;
  }
  const callee = rhs?.type === "FunctionCall" ? rhs.expression : undefined;
  if (
    callee?.type === "MemberAccess" &&
    SAFE_MATH_METHODS.has(callee.memberName) &&
    isIdentifier(callee.expression, variable) &&
    rhs.arguments?.length === 1
  ) {
    return { operator: callee.memberName, step: rhs.arguments[0] };
  }
  return undefined;
}

export function stateUpdatesIn(body: any, candidates: ReadonlySet<string>): StateUpdate[] {
  const found: StateUpdate[] = [];
  parser.visit(body, {
    UnaryOperation(node: any) {
      const { operator, subExpression } = node;
      if ((operator === "++" || operator === "--") && subExpression?.type === "Identifier" && candidates.has(subExpression.name)) {
        found.push({ node, variable: subExpression.name, operator, constantStep: true });
      }
    },
    BinaryOperation(node: any) {
      const { operator, left, right } = node;
      if (left?.type !== "Identifier" || !candidates.has(left.name)) return;
      if (COMPOUND_OPERATORS.has(operator)) {
        found.push({ node, variable: left.name, operator, constantStep: isConstantStep(right) });
      } else if (operator === "=") {
        const self = selfStep(left.name, right);
        if (self) found.push({ node, variable: left.name, operator: self.operator, constantStep: isConstantStep(self.step) });
      }
    },
  });
  return found;
}

const ACCUMULATE_OPERATORS = new Set(["+=", "-=", "+", "-", "add", "sub"]);

/** Per-call additions/subtractions (P3's pattern); constant steps are P1's. */
export function accumulationsIn(body: any, candidates: ReadonlySet<string>): StateUpdate[] {
  return stateUpdatesIn(body, candidates).filter((u) => !u.constantStep && ACCUMULATE_OPERATORS.has(u.operator));
}

/** Counter steps (P1's pattern): ++/--, or a compound/self-assignment by a literal. */
export function counterUpdatesIn(body: any, candidates: ReadonlySet<string>): StateUpdate[] {
  return stateUpdatesIn(body, candidates).filter((u) => u.constantStep);
}

function mentions(node: any, name: string): boolean {
  let found = false;
  parser.visit(node, {
    Identifier(n: any) {
      if (n.name === name) found = true;
    },
  });
  return found;
}

/**
 * `x = f(...)` where `f` is a view or internal function of this contract (or a
 * base) whose body reads `x`: a read-modify-write of `x` through a call, e.g.
 * Synthetix `rewardPerTokenStored = rewardPerToken()`. One call level only.
 * `owner` is the function or modifier that contains `body`, for resolving `f`.
 */
export function selfDerivedAssignmentsIn(
  ast: any,
  owner: any,
  body: any,
  candidates: ReadonlySet<string>
): { node: any; variable: string; via: string }[] {
  const found: { node: any; variable: string; via: string }[] = [];
  parser.visit(body, {
    BinaryOperation(node: any) {
      const { operator, left, right } = node;
      if (operator !== "=" || left?.type !== "Identifier" || !candidates.has(left.name)) return;
      if (right?.type !== "FunctionCall" || right.expression?.type !== "Identifier") return;
      const via = right.expression.name;
      const readsTarget = resolveCall(ast, owner, via).some(
        (f) =>
          (f.stateMutability === "view" || f.visibility === "internal" || f.visibility === "private") &&
          mentions(f.body, left.name)
      );
      if (readsTarget) found.push({ node, variable: left.name, via });
    },
  });
  return found;
}
