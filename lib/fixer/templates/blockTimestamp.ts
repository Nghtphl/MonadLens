import * as parser from "@solidity-parser/parser";
import type { MemberAccess, StateVariableDeclaration } from "@solidity-parser/parser/dist/src/ast-types";
import type { Token } from "@solidity-parser/parser/dist/src/types";
import { applySourceEdits, type SourceEdit } from "./sourceEdits";
import type { FixTemplate } from "./types";

const original = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract BadLending {
    uint256 public constant BLOCKS_PER_YEAR = 2_628_000;
    uint256 public constant ANNUAL_RATE_BPS = 500;

    struct Loan {
        uint256 principal;
        uint256 openedAtBlock;
    }

    mapping(address => Loan) public loans;

    function borrow(uint256 principal) external {
        loans[msg.sender] = Loan({
            principal: principal,
            openedAtBlock: block.number
        });
    }

    function accruedInterest(address borrower) external view returns (uint256) {
        Loan memory loan = loans[borrower];
        uint256 elapsedBlocks = block.number - loan.openedAtBlock;
        return loan.principal * ANNUAL_RATE_BPS * elapsedBlocks / BLOCKS_PER_YEAR / 10_000;
    }
}
`;

function astRange(node: { range?: [number, number] }): [number, number] {
  if (!node.range) throw new Error("Fix template requires parser ranges");
  return [node.range[0], node.range[1] + 1];
}

function timestampConstant(blockConstant: string): { name: string; value: string } {
  const suffix = blockConstant.replace(/^BLOCKS_PER_/i, "").toUpperCase();
  const values: Record<string, string> = {
    YEAR: "365 days",
    MONTH: "30 days",
    WEEK: "7 days",
    DAY: "1 days",
    HOUR: "1 hours",
  };
  return {
    name: `SECONDS_PER_${suffix}`,
    value: values[suffix] ?? "365 days",
  };
}

function renameTimeIdentifier(name: string): string {
  return name.replace(/Blocks$/, "Seconds").replace(/Block$/, "Time");
}

export function applyBlockTimestampTemplate(source: string): string {
  const ast = parser.parse(source, { loc: true, range: true, tolerant: false });
  let declaration: StateVariableDeclaration | undefined;
  let blockConstant = "";
  const blockNumberAccesses: MemberAccess[] = [];

  parser.visit(ast, {
    StateVariableDeclaration(node) {
      const variable = node.variables.find((candidate) =>
        /^BLOCKS_PER_/i.test(candidate.name ?? "")
      );
      if (!declaration && variable?.name) {
        declaration = node;
        blockConstant = variable.name;
      }
    },
    MemberAccess(node) {
      if (
        node.memberName === "number" &&
        node.expression.type === "Identifier" &&
        node.expression.name === "block"
      ) {
        blockNumberAccesses.push(node);
      }
    },
  });

  if (!declaration || !blockConstant) {
    throw new Error("No BLOCKS_PER_* state constant was found");
  }

  const [declarationStart, declarationEnd] = astRange(declaration);
  const secondsConstant = timestampConstant(blockConstant);
  const blockNumberRanges = blockNumberAccesses.map(astRange);
  const edits: SourceEdit[] = [
    {
      start: declarationStart,
      end: declarationEnd,
      text: `uint256 public constant ${secondsConstant.name} = ${secondsConstant.value};`,
    },
    ...blockNumberRanges.map(([start, end]) => ({ start, end, text: "block.timestamp" })),
  ];

  const tokens = parser.tokenize(source, { range: true }) as Token[];
  for (const token of tokens) {
    if (token.type !== "Identifier" || !token.value || !token.range) continue;
    const [start, end] = token.range;
    if (start >= declarationStart && end <= declarationEnd) continue;
    if (blockNumberRanges.some(([rangeStart, rangeEnd]) => start >= rangeStart && end <= rangeEnd)) {
      continue;
    }

    if (token.value === blockConstant) {
      edits.push({ start, end, text: secondsConstant.name });
      continue;
    }

    const renamed = renameTimeIdentifier(token.value);
    if (renamed !== token.value) edits.push({ start, end, text: renamed });
  }

  return applySourceEdits(source, edits);
}

const modified = applyBlockTimestampTemplate(original);

export const BLOCK_TIMESTAMP_TRADEOFFS = [
  "Stored block-number checkpoints must be migrated or replaced with timestamps.",
  "Several blocks can share one timestamp, so accrual advances at timestamp granularity.",
  "Integer division still rounds down; confirm the rounding policy for small balances.",
] as const;

export const blockTimestampTemplate: FixTemplate = {
  id: "block-timestamp",
  ruleId: "M1_BLOCK_TIME_ASSUMPTION",
  title: "Measure elapsed time in seconds",
  original,
  modified,
  tradeoffs: BLOCK_TIMESTAMP_TRADEOFFS,
  apply: applyBlockTimestampTemplate,
};
