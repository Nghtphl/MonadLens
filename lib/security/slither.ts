import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, isAbsolute, join } from "node:path";
import { promisify } from "node:util";
import type { Finding, Severity } from "../types";

const execFileAsync = promisify(execFile);
const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_OUTPUT_BYTES = 10 * 1024 * 1024;
const SLITHER_UNAVAILABLE_MESSAGE =
  "General security scan runs in the local/Docker setup, see README.";

export type SlitherResult =
  | { available: true; findings: Finding[] }
  | { available: false; reason: string };

interface ExecFailure extends Error {
  code?: string | number;
  killed?: boolean;
  signal?: NodeJS.Signals;
  stdout?: string;
  stderr?: string;
}

interface SlitherElement {
  type?: string;
  name?: string;
  source_mapping?: {
    lines?: number[];
    starting_column?: number;
  };
  type_specific_fields?: {
    parent?: { name?: string };
  };
}

interface SlitherDetector {
  check?: string;
  impact?: string;
  confidence?: string;
  description?: string;
  elements?: SlitherElement[];
}

interface SlitherPayload {
  success?: boolean;
  error?: string | null;
  results?: { detectors?: SlitherDetector[] };
}

function severityFor(impact: string | undefined): Severity {
  switch (impact?.toLowerCase()) {
    case "critical":
      return "critical";
    case "high":
      return "high";
    case "medium":
      return "medium";
    default:
      return "info";
  }
}

function parsePayload(stdout: string): SlitherPayload | undefined {
  if (stdout.trim() === "") return undefined;
  try {
    return JSON.parse(stdout) as SlitherPayload;
  } catch {
    return undefined;
  }
}

export function sanitizeSlitherMessage(message: string): string {
  return message
    .replace(/(?:\.\.?\/|\/)[^()\s:#]*\/Contract\.sol/g, "Contract.sol")
    .replace(/[A-Za-z]:\\[^()\s:#]*\\Contract\.sol/g, "Contract.sol");
}

export function mapSlitherPayload(payload: SlitherPayload): Finding[] {
  return (payload.results?.detectors ?? []).map((detector) => {
    const elements = detector.elements ?? [];
    const located = elements.find((element) => (element.source_mapping?.lines?.length ?? 0) > 0);
    const functionElement = elements.find((element) => element.type === "function");
    const variableElement = elements.find((element) => element.type === "variable");
    const impact = detector.impact ?? "unknown";
    const confidence = detector.confidence ?? "unknown";

    return {
      source: "slither",
      ruleId: detector.check ?? "slither-unknown",
      severity: severityFor(detector.impact),
      line: located?.source_mapping?.lines?.[0] ?? 0,
      column: Math.max(0, (located?.source_mapping?.starting_column ?? 1) - 1),
      variable: variableElement?.name,
      functionName:
        functionElement?.name ?? located?.type_specific_fields?.parent?.name,
      reachabilityWeight: 1,
      conflictNote: `Slither: ${impact} impact, ${confidence} confidence`,
      message: sanitizeSlitherMessage(
        detector.description?.trim() || `Slither detector ${detector.check ?? "unknown"}`
      ),
    } satisfies Finding;
  });
}

function cleanDiagnostic(text: string): string {
  return text
    .split("\n")
    .filter(
      (line) =>
        !line.includes("NotOpenSSLWarning") &&
        !line.includes("urllib3 v2 only supports OpenSSL") &&
        !line.trim().startsWith("warnings.warn(")
    )
    .join("\n")
    .trim()
    .slice(0, 2_000);
}

function compilerMismatchReason(detail: string): string | undefined {
  if (
    /requires different compiler version|compiler version mismatch|version pragma|solc.*version|pragma.*solc/i.test(
      detail
    )
  ) {
    return `Slither could not compile the contract because its solc version does not satisfy the Solidity pragma. Install or select a compatible solc version. ${detail}`;
  }
  return undefined;
}

export async function runSlither(
  source: string,
  options: { timeoutMs?: number } = {}
): Promise<SlitherResult> {
  const slitherPath = process.env.SLITHER_PATH?.trim() || "slither";
  const childPath = isAbsolute(slitherPath)
    ? [dirname(slitherPath), process.env.PATH].filter(Boolean).join(delimiter)
    : process.env.PATH;
  const directory = await mkdtemp(join(tmpdir(), "monadlens-slither-"));
  const sourcePath = join(directory, "Contract.sol");

  try {
    await writeFile(sourcePath, source, "utf8");
    try {
      const { stdout } = await execFileAsync(slitherPath, [sourcePath, "--json", "-"], {
        encoding: "utf8",
        timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        maxBuffer: MAX_OUTPUT_BYTES,
        windowsHide: true,
        env: { ...process.env, PATH: childPath },
      });
      const payload = parsePayload(stdout);
      if (!payload) {
        return { available: false, reason: "Slither returned no valid JSON on stdout." };
      }
      if (payload.success === false) {
        const detail = cleanDiagnostic(payload.error ?? "Slither analysis failed.");
        return {
          available: false,
          reason: compilerMismatchReason(detail) ?? detail ?? "Slither analysis failed.",
        };
      }
      return { available: true, findings: mapSlitherPayload(payload) };
    } catch (error) {
      const failure = error as ExecFailure;
      if (failure.code === "ENOENT") {
        console.error(`[Slither] Executable was not found at "${slitherPath}".`);
        return {
          available: false,
          reason: SLITHER_UNAVAILABLE_MESSAGE,
        };
      }
      if (failure.killed || failure.signal === "SIGTERM") {
        return {
          available: false,
          reason: `Slither timed out after ${options.timeoutMs ?? DEFAULT_TIMEOUT_MS} ms.`,
        };
      }

      const payload = parsePayload(failure.stdout ?? "");
      if (payload?.success && payload.results) {
        return { available: true, findings: mapSlitherPayload(payload) };
      }
      const detail = cleanDiagnostic(
        [payload?.error, failure.stderr, failure.stdout, failure.message]
          .filter(Boolean)
          .join("\n")
      );
      return {
        available: false,
        reason:
          compilerMismatchReason(detail) ??
          (detail ||
            "Slither analysis failed. Ensure a compatible solc executable is installed and available on PATH."),
      };
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export { deduplicateSecurityFindings, removeSlitherDuplicates } from "./dedupe";
