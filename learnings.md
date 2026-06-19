# trade-mirror: OpenRouter error mapping, timeout, timing

## Change
Added AbortController 30s timeout, structured OpenRouter error responses, and request timing to `supabase/functions/trade-mirror/index.ts`.

## What changed
- **Timing**: `const start = Date.now()` added after auth check; all exit paths now include `{event: "request", duration_ms: N}`
- **Timeout**: OpenRouter fetch wrapped in `AbortController` with 30s timeout → returns 504 `{error: "AI zaman aşımı", code: "AI_TIMEOUT"}`
- **500/502/503**: Instead of `throw new Error(...)`, returns 503 with `{skipped: true, reason: "ai_error", code: "AI_<status>", event: "request", duration_ms: N}`
- **429/402**: Preserved existing behavior (503 skipped with reason), timing field appended
- **no_tool_call / success / catch**: All include `event` + `duration_ms`

## Files modified
- `supabase/functions/trade-mirror/index.ts`
- `learnings.md` (this file)
