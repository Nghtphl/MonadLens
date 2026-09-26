import * as parser from "@solidity-parser/parser";
import type { Finding } from "../../types";
import { blockTimestampTemplate } from "../../fixer/templates";
import { weightOfFunction } from "../reachability";
import type { AnalysisContext, Rule } from "./index";

// Common Ethereum block-time-derived constants: blocks/month (12s),
// blocks/month (14s), blocks/day (12s), etc. Any exact hit is almost
// certainly copied from an Ethereum mainnet assumption.
const KNOWN_BLOCK_TIME_CONSTANTS = new Set(["2628000", "2102400", "7200"]);
const BLOCKS_PER_PATTERN = /^BLOCKS_PER_/i;
const ARITHMETIC_OPERATORS = new Set(["+", "-", "*", "/"]);

function isBlockNumberAccess(node: any): boolean {
  return (
    node?.type === "MemberAccess" &&
    node.memberName === "number" &&
    node.expression?.type === "Identifier" &&
    node.expression.name === "block"
  );
}

export const rule: Rule = {
  id: "M1_BLOCK_TIME_ASSUMPTION",
  severity: "critical",

  check(ctx: AnalysisContext): Finding[] {
    const findings: Finding[] = [];
    const flaggedLines = new Set<number>();

    const flag = (node: any, message: string, fn: any) => {
      const line = node.loc?.start.line ?? 0;
      if (flaggedLines.has(line)) return;
      flaggedLines.add(line);
      findings.push({
        ruleId: "M1_BLOCK_TIME_ASSUMPTION",
        severity: "critical",
        line,
        column: node.loc?.start.column ?? 0,
        functionName: fn?.name ?? undefined,
        reachabilityWeight: fn ? weightOfFunction(fn, ctx.ast) : 1.0,
        conflictNote: "Ethereum block-time assumption baked into Monad-bound code",
        message,
        fixTemplateId: blockTimestampTemplate.id,
        tradeoffs: [...blockTimestampTemplate.tradeoffs],
      });
    };

    parser.visit(ctx.ast, {
      NumberLiteral(node: any) {
        if (KNOWN_BLOCK_TIME_CONSTANTS.has(String(node.number).replace(/_/g, ""))) {
          flag(
            node,
            `Literal ${node.number} matches an Ethereum blocks-per-time-unit constant (12s/14s block time). Monad's block time is different, so block-count-based interest/vesting math will drift.`,
            null
          );
        }
      },
      Identifier(node: any) {
        if (BLOCKS_PER_PATTERN.test(node.name)) {
          flag(
            node,
            `Identifier "${node.name}" encodes an assumed block time. Recompute from block.timestamp deltas instead of a hardcoded blocks-per-unit constant.`,
            null
          );
        }
      },
      FunctionDefinition(fn: any) {
        parser.visit(fn, {
          BinaryOperation(node: any) {
            const { operator, left, right } = node;
            if (!ARITHMETIC_OPERATORS.has(operator)) return;
            if (isBlockNumberAccess(left) || isBlockNumberAccess(right)) {
              flag(
                node,
                `block.number is used in arithmetic inside ${
                  fn.name ?? "this function"
                }. Monad's block time is not fixed at Ethereum's ~12s, so interest/vesting/lockup math derived from block-number deltas will be wrong.`,
                fn
              );
            }
          },
        });
      },
    });

    return findings;
  },
};
