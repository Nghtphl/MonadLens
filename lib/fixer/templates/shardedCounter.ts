import * as parser from "@solidity-parser/parser";
import type {
  ASTNode,
  BinaryOperation,
  ContractDefinition,
  ExpressionStatement,
  FunctionDefinition,
  Identifier,
  IndexAccess,
  StateVariableDeclaration,
} from "@solidity-parser/parser/dist/src/ast-types";
import { applySourceEdits, indentationAt, type SourceEdit } from "./sourceEdits";
import type { FixContext, FixTemplate } from "./types";

const original = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract BadNFT {
    string public name = "BadNFT";
    uint256 public totalSupply;

    mapping(uint256 => address) public ownerOf;

    function mint() external {
        totalSupply++;
        ownerOf[totalSupply] = msg.sender;
    }

    function burn(uint256 tokenId) external {
        require(ownerOf[tokenId] == msg.sender, "not owner");
        delete ownerOf[tokenId];
        totalSupply -= 1;
    }
}
`;

function astRange(node: { range?: [number, number] }): [number, number] {
  if (!node.range) throw new Error("Fix template requires parser ranges");
  return [node.range[0], node.range[1] + 1];
}

function asExpressionStatement(node: ASTNode): ExpressionStatement | undefined {
  return node.type === "ExpressionStatement" ? node : undefined;
}

function updatedIdentifier(statement: ExpressionStatement): string | undefined {
  const expression = statement.expression;
  if (
    expression?.type === "UnaryOperation" &&
    expression.operator === "++" &&
    expression.subExpression.type === "Identifier"
  ) {
    return expression.subExpression.name;
  }
  if (
    expression?.type === "BinaryOperation" &&
    expression.operator === "+=" &&
    expression.left.type === "Identifier"
  ) {
    return expression.left.name;
  }
  return undefined;
}

function findFunction(ast: ASTNode, name: string): FunctionDefinition | undefined {
  let match: FunctionDefinition | undefined;
  parser.visit(ast, {
    FunctionDefinition(node) {
      if (!match && node.name === name) match = node;
    },
  });
  return match;
}

function findCounterUpdate(
  fn: FunctionDefinition,
  requestedVariable?: string
): { statement: ExpressionStatement; variable: string } {
  for (const rawStatement of fn.body?.statements ?? []) {
    const statement = asExpressionStatement(rawStatement as ASTNode);
    if (!statement) continue;
    const variable = updatedIdentifier(statement);
    if (variable && (!requestedVariable || variable === requestedVariable)) {
      return { statement, variable };
    }
  }
  throw new Error(`No incrementing counter found in ${fn.name ?? "target function"}`);
}

function findStateDeclaration(ast: ASTNode, variable: string): StateVariableDeclaration {
  let match: StateVariableDeclaration | undefined;
  parser.visit(ast, {
    StateVariableDeclaration(node) {
      if (node.variables.some((candidate) => candidate.name === variable)) match ??= node;
    },
  });
  if (!match) throw new Error(`State counter "${variable}" was not found`);
  return match;
}

function findContainingContract(
  ast: ASTNode,
  declaration: StateVariableDeclaration
): ContractDefinition {
  const [declarationStart, declarationEnd] = astRange(declaration);
  let match: ContractDefinition | undefined;
  parser.visit(ast, {
    ContractDefinition(node) {
      const [start, end] = astRange(node);
      if (start <= declarationStart && end >= declarationEnd) match ??= node;
    },
  });
  if (!match) throw new Error("Counter contract was not found");
  return match;
}

function findIdIndexes(fn: FunctionDefinition, variable: string): Identifier[] {
  const indexes: Identifier[] = [];
  parser.visit(fn, {
    IndexAccess(node: IndexAccess) {
      if (node.index.type === "Identifier" && node.index.name === variable) {
        indexes.push(node.index);
      }
    },
  });
  return indexes;
}

function findBurnDecrement(
  fn: FunctionDefinition | undefined,
  variable: string
): { operation: BinaryOperation; tokenId: string } | undefined {
  if (!fn) return undefined;
  const tokenId = fn.parameters[0]?.name ?? "tokenId";
  let match: BinaryOperation | undefined;
  parser.visit(fn, {
    BinaryOperation(node) {
      if (
        !match &&
        node.operator === "-=" &&
        node.left.type === "Identifier" &&
        node.left.name === variable
      ) {
        match = node;
      }
    },
  });
  return match ? { operation: match, tokenId } : undefined;
}

export function applyShardedCounterTemplate(source: string, context: FixContext = {}): string {
  const ast = parser.parse(source, { loc: true, range: true, tolerant: false });
  const mint = findFunction(ast, "mint");
  if (!mint) throw new Error('Function "mint" was not found');

  const requestedFunction = context.functionName
    ? findFunction(ast, context.functionName)
    : undefined;
  let counterUpdate: { statement: ExpressionStatement; variable: string };
  try {
    counterUpdate = findCounterUpdate(requestedFunction ?? mint, context.variable);
  } catch {
    counterUpdate = findCounterUpdate(mint, context.variable);
  }
  const { statement: incrementStatement, variable } = counterUpdate;
  const declaration = findStateDeclaration(ast, variable);
  const contract = findContainingContract(ast, declaration);
  const idIndexes = findIdIndexes(mint, variable);
  if (idIndexes.length === 0) {
    throw new Error(`No token id derived from "${variable}" was found`);
  }

  const burnDecrement = findBurnDecrement(findFunction(ast, "burn"), variable);
  const declarationIndent = indentationAt(source, astRange(declaration)[0]);
  const statementIndent = indentationAt(source, astRange(incrementStatement)[0]);
  const [, contractEnd] = astRange(contract);

  const edits: SourceEdit[] = [
    {
      start: astRange(declaration)[0],
      end: astRange(declaration)[1],
      text: [
        "uint256 public constant SHARDS = 16;",
        `${declarationIndent}uint256 public constant MAX_PER_SHARD = type(uint256).max / SHARDS;`,
        `${declarationIndent}uint256[SHARDS] private _shardCounts;`,
        `${declarationIndent}uint256[SHARDS] private _activeByShard;`,
      ].join("\n"),
    },
    {
      start: astRange(incrementStatement)[0],
      end: astRange(incrementStatement)[1],
      text: [
        "uint256 s = uint256(keccak256(abi.encodePacked(msg.sender))) % SHARDS;",
        `${statementIndent}uint256 n = _shardCounts[s];`,
        `${statementIndent}require(n < MAX_PER_SHARD, "shard sold out");`,
        `${statementIndent}uint256 id = n * SHARDS + s;`,
        `${statementIndent}_shardCounts[s] = n + 1;`,
        `${statementIndent}_activeByShard[s] += 1;`,
      ].join("\n"),
    },
    ...idIndexes.map((identifier) => ({
      start: astRange(identifier)[0],
      end: astRange(identifier)[1],
      text: "id",
    })),
    {
      start: contractEnd - 1,
      end: contractEnd - 1,
      text: `\n    function totalSupply() external view returns (uint256 total) {\n        for (uint256 s = 0; s < SHARDS; s++) {\n            total += _activeByShard[s];\n        }\n    }\n`,
    },
  ];

  if (burnDecrement) {
    const left = burnDecrement.operation.left;
    edits.push({
      start: astRange(left)[0],
      end: astRange(left)[1],
      text: `_activeByShard[${burnDecrement.tokenId} % SHARDS]`,
    });
  }

  return applySourceEdits(source, edits);
}

const modified = applyShardedCounterTemplate(original);

export const SHARDED_COUNTER_TRADEOFFS = [
  "IDs are unique but non-sequential across shards.",
  "Users mapped to the same shard cannot mint after that shard sells out, even if other shards still have capacity.",
  "totalSupply() costs SHARDS storage reads instead of one.",
  "Higher gas per mint: because burn is kept, each mint writes two per-shard counters: _shardCounts (the next unique id, never decreases) and _activeByShard (live supply, which burn decrements so totalSupply() stays correct).",
] as const;

export const shardedCounterTemplate: FixTemplate = {
  id: "sharded-counter",
  ruleId: "P1_GLOBAL_COUNTER",
  title: "Shard the hot counter",
  original,
  modified,
  tradeoffs: SHARDED_COUNTER_TRADEOFFS,
  apply: applyShardedCounterTemplate,
};
