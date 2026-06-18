/**
 * Body Size Limit Module
 *
 * Provides a `checkBodySize()` utility that rejects requests whose body
 * exceeds a configurable byte limit using a two-phase approach:
 *
 * 1. **Fast path** – If the `Content-Length` header exceeds the limit, return
 *    413 immediately without reading the body.
 * 2. **Fallback** – Clone the request and read the body as text with a 500 ms
 *    timeout (via `AbortController` + `Promise.race`). If the resulting
 *    string is longer than the limit, return 413.
 *
 * ── Usage ───────────────────────────────────────────────────────────────────
 *
 *   import { checkBodySize } from "../_shared/body-size-limit.ts";
 *
 *   const bodyError = await checkBodySize(req);
 *   if (bodyError) return bodyError;
 *
 * ── Custom limit ────────────────────────────────────────────────────────────
 *
 *   const bodyError = await checkBodySize(req, 512 * 1024); // 512 KB
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

const DEFAULT_MAX_SIZE_BYTES = 1_048_576; // 1 MB
const BODY_READ_TIMEOUT_MS = 500;

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
};

/**
 * Check whether the request body exceeds the given size limit.
 *
 * @param req          - The incoming request. On the fallback path the body is
 *                       consumed, but `req.clone()` is used so the original
 *                       stream is preserved for downstream handlers.
 * @param maxSizeBytes - Maximum allowed body size in bytes (default 1 MB).
 *
 * @returns A 413 `Response` if the payload is too large, or `null` if OK.
 */
export async function checkBodySize(
  req: Request,
  maxSizeBytes: number = DEFAULT_MAX_SIZE_BYTES,
): Promise<Response | null> {
  // ── Fast path: Content-Length header ──────────────────────────────────
  const contentLength = req.headers.get("content-length");
  if (contentLength !== null) {
    const length = parseInt(contentLength, 10);
    if (!isNaN(length) && length > maxSizeBytes) {
      return create413Response(maxSizeBytes);
    }
    // Header present and within limit → definitely OK, skip body read.
    return null;
  }

  // ── Fallback: read body as text with AbortController timeout ──────────
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), BODY_READ_TIMEOUT_MS);

  try {
    const clonedReq = req.clone();
    const text = await Promise.race([
      clonedReq.text(),
      new Promise<string>((_, reject) => {
        controller.signal.addEventListener("abort", () => {
          reject(new Error("Body read timeout"));
        }, { once: true });
      }),
    ]);

    if (text.length > maxSizeBytes) {
      return create413Response(maxSizeBytes);
    }

    return null;
  } catch {
    // Read failure (timeout, network error, etc.) → err on the side of
    // leniency; let the downstream handler make the final call.
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Build a 413 Payload Too Large response.
 */
function create413Response(maxSizeBytes: number): Response {
  return new Response(
    JSON.stringify({
      error: "İstek çok büyük",
      code: "PAYLOAD_TOO_LARGE",
      max_size_bytes: maxSizeBytes,
    }),
    {
      status: 413,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "application/json",
      },
    },
  );
}
