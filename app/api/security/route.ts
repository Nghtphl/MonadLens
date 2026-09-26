import { runSlither } from "@/lib/security/slither";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_SOURCE_CHARS = 50_000;

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { available: false, reason: "Body must be JSON." },
      { status: 400 }
    );
  }

  const source =
    typeof body === "object" && body !== null && "source" in body
      ? (body as { source?: unknown }).source
      : undefined;

  if (typeof source !== "string" || source.trim() === "") {
    return Response.json(
      { available: false, reason: "`source` must be a non-empty string." },
      { status: 400 }
    );
  }
  if (source.length > MAX_SOURCE_CHARS) {
    return Response.json(
      { available: false, reason: `Source exceeds ${MAX_SOURCE_CHARS} characters.` },
      { status: 413 }
    );
  }

  try {
    return Response.json(await runSlither(source, { timeoutMs: 20_000 }));
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown error";
    return Response.json({
      available: false,
      reason: `Slither could not start: ${detail}`,
    });
  }
}
