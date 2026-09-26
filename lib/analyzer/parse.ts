import * as parser from "@solidity-parser/parser";
import type { ASTNode } from "@solidity-parser/parser/dist/src/ast-types";

export interface ParseError {
  message: string;
  line?: number;
  column?: number;
}

export type ParseResult =
  | { ok: true; ast: ASTNode }
  | { ok: false; error: ParseError };

/**
 * Safe parse wrapper per CLAUDE.md §10: tolerant parsing with loc/range info,
 * never throws — structured errors flow back to the caller (and the UI)
 * instead of crashing the page.
 */
export function safeParse(source: string): ParseResult {
  try {
    const ast = parser.parse(source, { loc: true, range: true, tolerant: true });
    return { ok: true, ast };
  } catch (error) {
    if (error instanceof Error && "errors" in error) {
      const parserError = error as Error & {
        errors?: { message: string; line?: number; column?: number }[];
      };
      const first = parserError.errors?.[0];
      return {
        ok: false,
        error: { message: parserError.message, line: first?.line, column: first?.column },
      };
    }
    const message = error instanceof Error ? error.message : "Unknown parse error";
    return { ok: false, error: { message } };
  }
}

export function getSourceLine(source: string, lineNumber: number): string | undefined {
  const lines = source.split("\n");
  return lines[lineNumber - 1]?.trim();
}
