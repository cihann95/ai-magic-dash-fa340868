# Environment Variable Specification

**Project:** Lumen Trade (ai-magic-dash-fa340868)  
**Audit Date:** 2026-06-10  
**Auditor:** Sisyphus-Junior (Wave 0, Task 1)  
**Status:** Complete

---

## Executive Summary

| Metric | Value |
|--------|-------|
| Total unique env vars discovered | 14 |
| Frontend (Vite) vars | 3 |
| Edge Function (Deno) vars | 8 |
| Audit script vars | 3 (test-only) |
| Hardcoded secrets found | 0 |
| SQLCipher key remnants in git | 0 (clean) |
| `.env.*` files beyond `.env.example` | 0 |

---

## 1. Frontend Environment Variables (Vite)

These are exposed to the browser via `import.meta.env.VITE_*` and must **never** contain secrets.

| # | Variable | Type | Required | Default | Description | Source | Files Using It |
|---|----------|------|----------|---------|-------------|--------|----------------|
| 1 | `VITE_SUPABASE_URL` | string (URL) | **YES** | — | Supabase project URL (e.g., `https://xxx.supabase.co`) | local, staging, production | `src/integrations/supabase/client.ts`, `src/components/trading/AccountAIPanel.tsx` |
| 2 | `VITE_SUPABASE_PUBLISHABLE_KEY` | string | **YES** | — | Supabase anon/publishable key (public, safe for browser) | local, staging, production | `src/integrations/supabase/client.ts`, `src/components/trading/AccountAIPanel.tsx` |
| 3 | `VITE_ANA_SAHNE_ENABLED` | string (`"true"`/`"false"`) | no | `"true"` | Feature flag for Ana Sahne section on landing page | local, staging, production | `src/pages/Index.tsx` |

**TypeScript declarations:** `src/vite-env.d.ts` — defines `ImportMetaEnv` interface with all 3 vars.

### `.env.example` (current)
```bash
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_PUBLISHABLE_KEY=your_anon_key
VITE_ANA_SAHNE_ENABLED=true
```

---

## 2. Edge Function Environment Variables (Deno)

These are set via Supabase Dashboard → Edge Functions → Environment Variables.

| # | Variable | Type | Required | Description | Used By (Edge Functions) |
|---|----------|------|----------|-------------|--------------------------|
| 1 | `SUPABASE_URL` | string (URL) | **YES** | Supabase project URL (same as `VITE_SUPABASE_URL` but server-side) | ALL 19 edge functions |
| 2 | `SUPABASE_SERVICE_ROLE_KEY` | string | **YES** | Admin/service-role key (SECRET — full access, bypasses RLS) | `blitz-analytics-writer`, `blitz-admin-topup`, `blitz-join-private`, `blitz-tick-order`, `blitz-settle-room`, `blitz-matchmake`, `ai-risk-monitor`, `execute-trade`, `ai-trade-coach`, `ai-strategy`, `price-feed`, `weekly-digest`, `daily-brief`, `reset-demo-account`, `trade-mirror`, `send-push` |
| 3 | `SUPABASE_ANON_KEY` | string | **YES** | Anon/public key (used in user-facing edge functions) | `ai-chat`, `ai-analyze`, `news-feed`, `ai-trade-coach`, `ai-strategy` |
| 4 | `LOVABLE_API_KEY` | string | **YES** | Lovable AI API key for AI features | `ai-chat`, `ai-analyze`, `ai-strategy`, `ai-trade-coach`, `daily-brief`, `news-feed`, `trade-mirror` |
| 5 | `UPSTASH_REDIS_REST_URL` | string (URL) | no* | Upstash Redis REST URL (*gracefully disabled if missing) | `_shared/redis.ts` → used by blitz functions |
| 6 | `UPSTASH_REDIS_REST_TOKEN` | string | no* | Upstash Redis REST token (*gracefully disabled if missing) | `_shared/redis.ts` → used by blitz functions |
| 7 | `VAPID_PUBLIC_KEY` | string (base64url) | no** | Web Push VAPID public key (**required for push notifications) | `send-push` |
| 8 | `VAPID_PRIVATE_KEY` | string (base64url) | no** | Web Push VAPID private key (SECRET — 32-byte raw scalar) | `send-push` |
| 9 | `VAPID_SUBJECT` | string (mailto:) | no | VAPID contact subject (default: `mailto:noreply@lumen.trade`) | `send-push` |

### CORS Configuration
- **No `_shared/cors.ts` file exists.** CORS headers are defined inline in each edge function as:
  ```ts
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
  ```
- Some functions add `x-cron-secret` to the allowed headers: `blitz-analytics-writer`, `blitz-settle-room`, `ai-risk-monitor`, `price-feed`

### Cron Authentication
- Functions `blitz-analytics-writer`, `blitz-settle-room`, `ai-risk-monitor`, `price-feed` accept `x-cron-secret` header
- Verified via `admin.rpc("verify_cron_secret", { _token: cronToken })` — database-side validation, no env var needed

---

## 3. Audit/Test Script Environment Variables (CI/Test Only)

These are **NOT** production env vars. They are used only by audit scripts in `scripts/audit/`.

| # | Variable | Type | Description | Used By |
|---|----------|------|-------------|---------|
| 1 | `TEST_USER_JWT` | string | Pre-issued session JWT for redis-leak-probe | `scripts/audit/redis-leak-probe.ts` |
| 2 | `PARALLEL` | number | Concurrency level for crash tests (default: 50-100) | `scripts/audit/concurrency-bomb.ts`, `scripts/audit/redis-leak-probe.ts` |
| 3 | `MOCK_MODE` | boolean | When `true`, scripts run against mock server instead of real Supabase | `scripts/audit/_run_all.ts` |

### CI Workflow (`.github/workflows/ci.yml`)
- **No env vars configured in CI** — the workflow runs `deno run --frozen --no-prompt -A scripts/audit/_run_all.ts` which injects mock values internally via `Deno.env` overrides in `_run_all.ts` (lines 94-101)
- CI env vars are all mock values: `mock-anon-key-for-testing`, `mock-sr-key-for-testing`, `mock-upstash-token`, `mock-jwt-*`

---

## 4. Frontend Hardcoded Values (Not Env Vars)

| File | Value | Notes |
|------|-------|-------|
| `src/pages/Settings.tsx:17` | `const VAPID_PUBLIC_KEY = ""` | **Hardcoded empty string** — comment says "Server tarafından enjekte edilecek" (will be injected by server). Push notifications are disabled until this is populated. Should be moved to env var or runtime config. |

---

## 5. Secrets Assessment

### Hardcoded Secrets Scan Results
- **API keys:** None hardcoded in source code
- **Passwords:** None hardcoded (only in audit mock server `_mock_server.ts` test fixtures)
- **Connection strings:** None hardcoded
- **Tokens:** None hardcoded
- **SQLCipher key remnants:** None found in current codebase or git history (migration 0017 referenced but no cipher patterns exist)

### Secret-Adjacent Values Found
| Pattern | Location | Verdict |
|---------|----------|---------|
| `"password"` references | `scripts/audit/_mock_server.ts`, `src/pages/Auth.tsx`, `src/pages/ResetPassword.tsx` | ✅ Safe — test mock fixtures and user-facing password input fields |
| `"hashed_token"` | `src/integrations/supabase/types.ts` | ✅ Safe — TypeScript type definition, not a real token |
| `"mock-jwt-*"`, `"mock-refresh"` | `scripts/audit/_run_all.ts`, `_mock_server.ts` | ✅ Safe — test-only mock values |
| `"vapid t=${jwt}"` | `send-push/index.ts` | ✅ Safe — dynamic JWT construction, no hardcoded secret |

---

## 6. Rotation Schedule

| Secret | Rotation Frequency | Owner | Method |
|--------|-------------------|-------|--------|
| `SUPABASE_SERVICE_ROLE_KEY` | Every 90 days | Supabase Admin | Dashboard → API Keys → Regenerate |
| `SUPABASE_ANON_KEY` | Every 180 days | Supabase Admin | Dashboard → API Keys → Regenerate (requires frontend update) |
| `LOVABLE_API_KEY` | Every 90 days | AI Provider | Provider dashboard → Rotate |
| `UPSTASH_REDIS_REST_TOKEN` | Every 90 days | Upstash | Dashboard → Tokens → Regenerate |
| `VAPID_PRIVATE_KEY` | Every 365 days | Ops | `npx web-push generate-vapid-keys` → update both frontend & backend |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Per Supabase anon key rotation | Frontend | Update `.env` files + deployment config |
| Database cron secrets | Per Supabase Vault rotation | DB Admin | `SELECT vault.decrypt_secret('cron_secret')` → rotate in Vault |

---

## 7. Environment Matrix

| Variable | Local Dev | CI (GitHub Actions) | Staging | Production |
|----------|-----------|---------------------|---------|------------|
| `VITE_SUPABASE_URL` | `.env` | — (mock) | Supabase Dashboard | Supabase Dashboard |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `.env` | — (mock) | Supabase Dashboard | Supabase Dashboard |
| `VITE_ANA_SAHNE_ENABLED` | `.env` (default: `true`) | — | `true` | `false` (recommended) |
| `SUPABASE_URL` | Edge Fn env | Mock server | Supabase Dashboard | Supabase Dashboard |
| `SUPABASE_SERVICE_ROLE_KEY` | Edge Fn env | Mock server | Supabase Dashboard | Supabase Dashboard |
| `SUPABASE_ANON_KEY` | Edge Fn env | Mock server | Supabase Dashboard | Supabase Dashboard |
| `LOVABLE_API_KEY` | Edge Fn env | Mock server | Supabase Dashboard | Supabase Dashboard |
| `UPSTASH_REDIS_REST_URL` | Edge Fn env | Mock server | Upstash Dashboard | Upstash Dashboard |
| `UPSTASH_REDIS_REST_TOKEN` | Edge Fn env | Mock server | Upstash Dashboard | Upstash Dashboard |
| `VAPID_PUBLIC_KEY` | Edge Fn env | — | Push provider | Push provider |
| `VAPID_PRIVATE_KEY` | Edge Fn env | — | Push provider | Push provider |
| `VAPID_SUBJECT` | Edge Fn env | — | `mailto:noreply@lumen.trade` | `mailto:noreply@lumen.trade` |

---

## 8. Gap Analysis

### Missing from `.env.example`
The following env vars are required for edge functions but **not documented** in `.env.example`:
1. `SUPABASE_SERVICE_ROLE_KEY` — critical, but should NOT be in `.env.example` (secret)
2. `SUPABASE_ANON_KEY` — used by some edge functions
3. `LOVABLE_API_KEY` — required for all AI features
4. `UPSTASH_REDIS_REST_URL` — optional but used by blitz functions
5. `UPSTASH_REDIS_REST_TOKEN` — optional but used by blitz functions
6. `VAPID_PUBLIC_KEY` — optional, for push notifications
7. `VAPID_PRIVATE_KEY` — optional, for push notifications

**Recommendation:** Add a `.env.edge.example` or document edge function env vars separately. Never put secrets in `.env.example`.

### Hardcoded VAPID Public Key
- `src/pages/Settings.tsx` has `VAPID_PUBLIC_KEY = ""` hardcoded
- Should be moved to `VITE_VAPID_PUBLIC_KEY` env var or fetched from a config endpoint

### No `.env` file exists
- Only `.env.example` exists — no `.env`, `.env.local`, `.env.development`, or `.env.production` found
- This is correct for the repo (`.env` should be gitignored and created per-environment)

---

## 9. File Locations Reference

| Path | Purpose |
|------|---------|
| `.env.example` | Frontend env var template (3 vars) |
| `src/vite-env.d.ts` | TypeScript declarations for `import.meta.env` |
| `src/integrations/supabase/client.ts` | Supabase client initialization |
| `supabase/config.toml` | Project config (only `project_id`) |
| `supabase/functions/_shared/redis.ts` | Upstash Redis adapter |
| `supabase/functions/_shared/blitz-types.ts` | Shared types (no env vars) |
| `.github/workflows/ci.yml` | CI workflow (no env vars, uses mocks) |
| `scripts/audit/_run_all.ts` | Test orchestration (injects mock env vars) |

---

## 10. Evidence Files

| File | Description |
|------|-------------|
| `.omo/evidence/task-1-env-spec-complete.md` | Audit completion certificate |
| `.omo/evidence/task-1-no-secrets.log` | Secrets scan output (zero findings) |

---

*Generated by Wave 0, Task 1 — Environment Inventory + Env Vars Specification*
