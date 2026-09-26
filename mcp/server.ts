#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod/v4";
import { analyzeSolidityCode } from "../lib/analyzer";
import { measureContract } from "../lib/simulator/trace";

const MAX_SOURCE_CHARS = 50_000;
const MIN_TX_COUNT = 2;
const MAX_TX_COUNT = 200;

export function analyzeContract(source: string) {
  return analyzeSolidityCode(source);
}

export async function measureContractSource(source: string, txCount: number) {
  const result = await measureContract({ source, txCount });
  return result.state;
}

export function createMonadLensServer() {
  const server = new McpServer({ name: "monadlens", version: "0.1.0" });

  server.registerTool(
    "analyze_contract",
    {
      title: "Analyze Solidity contract",
      description:
        "Run MonadLens static analysis and return findings, the heuristic parallel score, and any parse error.",
      inputSchema: {
        source: z.string().min(1).max(MAX_SOURCE_CHARS).describe("Flattened Solidity source code"),
      },
    },
    async ({ source }) => {
      const result = analyzeContract(source);
      const structuredContent = { ...result };
      return {
        content: [{ type: "text", text: JSON.stringify(structuredContent, null, 2) }],
        structuredContent,
      };
    }
  );

  server.registerTool(
    "measure_contract",
    {
      title: "Measure Solidity contract contention",
      description:
        "Compile the contract, run transactions against a fresh local Anvil node, and return the measured simulation state.",
      inputSchema: {
        source: z.string().min(1).max(MAX_SOURCE_CHARS).describe("Flattened Solidity source code"),
        txCount: z
          .number()
          .int()
          .min(MIN_TX_COUNT)
          .max(MAX_TX_COUNT)
          .default(100)
          .describe("Number of transactions to include in one block"),
      },
    },
    async ({ source, txCount }) => {
      const result = await measureContractSource(source, txCount);
      const structuredContent = { ...result };
      return {
        content: [{ type: "text", text: JSON.stringify(structuredContent, null, 2) }],
        structuredContent,
      };
    }
  );

  return server;
}

async function main() {
  const server = createMonadLensServer();
  await server.connect(new StdioServerTransport());
}

main().catch((error: unknown) => {
  console.error("MonadLens MCP server failed:", error);
  process.exitCode = 1;
});
