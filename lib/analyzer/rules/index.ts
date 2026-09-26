import type { ASTNode } from "@solidity-parser/parser/dist/src/ast-types";
import type { Finding, Severity } from "../../types";
import type { StateVarInfo } from "../symbols";

export interface AnalysisContext {
  ast: ASTNode;
  source: string;
  symbols: StateVarInfo[];
}

export interface Rule {
  id: string;
  severity: Severity;
  check(ctx: AnalysisContext): Finding[];
}

import { rule as P1_GLOBAL_COUNTER } from "./P1_GLOBAL_COUNTER";
import { rule as P2_ARRAY_PUSH } from "./P2_ARRAY_PUSH";
import { rule as P3_GLOBAL_ACCUMULATOR } from "./P3_GLOBAL_ACCUMULATOR";
import { rule as M1_BLOCK_TIME_ASSUMPTION } from "./M1_BLOCK_TIME_ASSUMPTION";
import { rule as P8_INHERENT } from "./P8_INHERENT";
import { rule as C1_REENTRANCY_GUARD } from "./C1_REENTRANCY_GUARD";

/**
 * TODO: per CLAUDE.md §18, P4-P7 and M2-M5 are Tier 2 item 6 (after
 * all of Tier 1 and the rest of Tier 2). See
 * .claude/skills/add-detection-rule/SKILL.md for how to add one.
 */
export const rules: Rule[] = [
  P1_GLOBAL_COUNTER,
  P2_ARRAY_PUSH,
  P3_GLOBAL_ACCUMULATOR,
  P8_INHERENT,
  M1_BLOCK_TIME_ASSUMPTION,
  C1_REENTRANCY_GUARD,
];
