# Lumen Trade — Production Environment Variables Checklist

**Project:** wufhbvshqhiiwjrvfzey (Supabase)
**Date:** 2026-06-16
**Status:** ✅ Ready for deployment

---

## 1. Frontend (Vite / Build Time)

These are set in your hosting provider (Vercel, Netlify, etc.) or `.env` file during build.

| Variable | Required | Value | Notes |
|----------|----------|-------|-------|
| `VITE_SUPABASE_URL` | ✅ | `https://wufhbvshqhiiwjrvfzey.supabase.co` | Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | ✅ | `eyJ...` | Supabase Dashboard → API → Project API keys → Anon key |
| `VITE_ANA_SAHNE_ENABLED` | ⚠️ | `true` | Toggle for Ana Sahne feature |
| `VITE_VAPID_PUBLIC_KEY` | ⚠️ | `BF...` | Generated via `npx web-push generate-vapid-keys` (push notifications) |
| `VITE_SENTRY_DSN` | ⚠️ | `https://...@sentry.io/...` | Optional — Sentry project DSN (error tracking) |

---

## 2. Edge Functions (Supabase Secrets)

Set via: `npx supabase secrets set --project-ref wufhbvshqhiiwjrvfzey`

### Required (will block deployment if missing)

| Variable | Value | Notes |
|----------|-------|-------|
| `SUPABASE_URL` | `https://wufhbvshqhiiwjrvfzey.supabase.co` | Same as above |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJ...` | Supabase Dashboard → API → Project API keys → Service role key (**NEVER expose to browser**) |
| `SUPABASE_ANON_KEY` | `eyJ...` | Same as VITE_SUPABASE_PUBLISHABLE_KEY |
| `LOVABLE_API_KEY` | `lov-...` | Lovable platform API key |

### Optional (graceful degradation when missing)

| Variable | Value | Notes |
|----------|-------|-------|
| `VAPID_PUBLIC_KEY` | `BF...` | Same as VITE_VAPID_PUBLIC_KEY |
| `VAPID_PRIVATE_KEY` | `xxx...` | **SECRET** — server-side only, never in browser |
| `VAPID_SUBJECT` | `mailto:admin@lumen.trade` | Push notification subject |
| `UPSTASH_REDIS_REST_URL` | `https://xxx.upstash.io` | Upstash Dashboard → Redis → REST URL |
| `UPSTASH_REDIS_REST_TOKEN` | `xxx...` | Upstash Dashboard → Redis → REST Token (**SECRET**) |
| `SENTRY_DSN` | `https://...@sentry.io/...` | Same as VITE_SENTRY_DSN (backend observability) |
| `LOG_LEVEL` | `info` | Optional — `debug`, `info`, `warn`, `error` |

---

## 3. How to Get Each Key

### 3.1 Supabase (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY)

1. Go to [supabase.com](https://supabase.com) → Dashboard → wufhbvshqhiiwjrvfzey
2. Settings → API → Project API keys
3. Copy:
   - `anon` (public) → `VITE_SUPABASE_PUBLISHABLE_KEY` + `SUPABASE_ANON_KEY`
   - `service_role` (secret) → `SUPABASE_SERVICE_ROLE_KEY` (**NEVER commit this**)

### 3.2 VAPID Keys (Push Notifications)

```bash
npm install -g web-push
npx web-push generate-vapid-keys
```

Output:
```
Public Key:  BFxxxxxxxx...
Private Key: xxxxxxxx...
```

- Public → `VITE_VAPID_PUBLIC_KEY` (frontend) + `VAPID_PUBLIC_KEY` (backend)
- Private → `VAPID_PRIVATE_KEY` (backend only, **NEVER in frontend**)

### 3.3 Upstash Redis

1. Go to [console.upstash.com](https://console.upstash.com)
2. Create Redis database (region: closest to your Supabase edge function region)
3. Copy:
   - REST API URL → `UPSTASH_REDIS_REST_URL`
   - REST API Token → `UPSTASH_REDIS_REST_TOKEN`

### 3.4 Sentry

1. Go to [sentry.io](https://sentry.io)
2. Create project → Platform: `javascript`
3. Settings → Projects → Client Keys (DSN)
4. Copy DSN → `VITE_SENTRY_DSN` + `SENTRY_DSN`

### 3.5 Lovable API Key

1. Go to [lovable.dev](https://lovable.dev) → Dashboard
2. API Keys → Copy key
3. → `LOVABLE_API_KEY`

---

## 4. Set Commands

### 4.1 Supabase Secrets

```bash
# Step 1: Login
npx supabase login

# Step 2: Set required secrets
npx supabase secrets set \
  SUPABASE_URL="https://wufhbvshqhiiwjrvfzey.supabase.co" \
  SUPABASE_SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY" \
  SUPABASE_ANON_KEY="YOUR_ANON_KEY" \
  LOVABLE_API_KEY="YOUR_LOVABLE_KEY" \
  --project-ref wufhbvshqhiiwjrvfzey

# Step 3: Set optional secrets
npx supabase secrets set \
  VAPID_PUBLIC_KEY="YOUR_VAPID_PUBLIC_KEY" \
  VAPID_PRIVATE_KEY="YOUR_VAPID_PRIVATE_KEY" \
  VAPID_SUBJECT="mailto:admin@lumen.trade" \
  UPSTASH_REDIS_REST_URL="YOUR_UPSTASH_URL" \
  UPSTASH_REDIS_REST_TOKEN="YOUR_UPSTASH_TOKEN" \
  SENTRY_DSN="YOUR_SENTRY_DSN" \
  LOG_LEVEL="info" \
  --project-ref wufhbvshqhiiwjrvfzey

# Step 4: Verify
npx supabase secrets list --project-ref wufhbvshqhiiwjrvfzey
```

### 4.2 Frontend (Vercel / Netlify / Hosting)

```bash
# Vercel
vercel env add VITE_SUPABASE_URL production
vercel env add VITE_SUPABASE_PUBLISHABLE_KEY production
vercel env add VITE_ANA_SAHNE_ENABLED production
vercel env add VITE_VAPID_PUBLIC_KEY production  # optional
vercel env add VITE_SENTRY_DSN production          # optional
```

Or set in hosting dashboard:
- Vercel: Dashboard → Project → Settings → Environment Variables
- Netlify: Dashboard → Site → Site Settings → Environment Variables

---

## 5. Validation

After setting all keys:

```bash
# 1. Verify Supabase secrets
npx supabase secrets list --project-ref wufhbvshqhiiwjrvfzey

# 2. Verify frontend build
npm run build

# 3. Run all tests
npm run test
npx vitest run -c supabase/functions/__tests__/vitest.config.ts

# 4. Run hard audit
npx tsx scripts/audit/_run_all.ts
```

---

## 6. Security Notes

- ✅ `SUPABASE_SERVICE_ROLE_KEY` — **NEVER in frontend, NEVER commit**
- ✅ `VAPID_PRIVATE_KEY` — **NEVER in frontend, NEVER commit**
- ✅ `UPSTASH_REDIS_REST_TOKEN` — **NEVER in frontend, NEVER commit**
- ✅ `LOVABLE_API_KEY` — **NEVER in frontend, NEVER commit**
- ✅ `VAPID_PUBLIC_KEY` — Safe for frontend (it's public by design)
- ✅ `SUPABASE_ANON_KEY` — Safe for frontend (it's public by design)
- ✅ `.env` is in `.gitignore` — won't be committed

---

## 7. Quick Reference

| # | Key | Dashboard | Public? | Priority |
|---|-----|-----------|---------|----------|
| 1 | Supabase URL | Supabase Dashboard | ✅ Public | Required |
| 2 | Supabase Anon Key | Supabase Dashboard | ✅ Public | Required |
| 3 | Supabase Service Role | Supabase Dashboard | ❌ Secret | Required |
| 4 | Lovable API Key | Lovable Dashboard | ❌ Secret | Required |
| 5 | VAPID Public | CLI (web-push) | ✅ Public | Optional |
| 6 | VAPID Private | CLI (web-push) | ❌ Secret | Optional |
| 7 | Upstash URL | Upstash Dashboard | ❌ Secret | Optional |
| 8 | Upstash Token | Upstash Dashboard | ❌ Secret | Optional |
| 9 | Sentry DSN | Sentry Dashboard | ✅ Public | Optional |

**Required for launch:** 4 keys (Supabase URL, Anon, Service Role, Lovable)
**Optional for launch:** 5 keys (VAPID, Upstash, Sentry)

---

**Project Status: ✅ Production Ready — 4 required keys + 5 optional keys documented**
