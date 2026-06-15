# Task 2: Risk Register Finalization + Security Threat Model — Completion Certificate

**Wave:** 0 (Discovery)
**Task:** 2 — Risk Register Finalization + STRIDE Threat Model
**Status:** ✅ COMPLETE
**Date:** 2026-06-10
**Executor:** Sisyphus-Junior

---

## Deliverables

| # | Deliverable | Status | Path |
|---|-------------|--------|------|
| 1 | STRIDE threat model document | ✅ | `.omo/reports/threat-model.md` |
| 2 | Risk register validated (R01-R10) | ✅ | See threat model Section 1 |
| 3 | All 6 STRIDE categories documented | ✅ | See threat model Section 2 |
| 4 | 28 threats documented with severity/priority | ✅ | See threat model Section 2.1-2.6 |
| 5 | All Metis gaps addressed (13/13) | ✅ | See threat model Section 3 |
| 6 | Evidence file | ✅ | This file |

---

## Audit Summary

### Files Analyzed

| File | Purpose | Findings |
|------|---------|----------|
| `supabase/functions/blitz-settle-room/index.ts` | Critical financial logic | T-T01 (timestamp), T-R01 (audit trail), T-E04 (user trigger), T-T05 (admin: any) |
| `supabase/functions/_shared/redis.ts` | Redis connection | T-I01 (credential exposure), T-T02 (price cache poisoning), T-D03 (exhaustion) |
| `supabase/functions/blitz-tick-order/index.ts` | Order execution | Server-authoritative confirmed; uses `order_timestamp()` RPC correctly |
| `supabase/functions/blitz-matchmake/index.ts` | Matchmaking | T-D02 (concurrency bomb) |
| `supabase/functions/blitz-analytics-writer/index.ts` | Analytics flush | T-S04 (service role comparison) |
| `supabase/functions/blitz-admin-topup/index.ts` | Admin topup | T-E02 (admin escalation) |
| `src/pages/Settings.tsx` | Frontend | T-I04 (VAPID hardcoded) |
| `scripts/audit/redis-leak-probe.ts` | Redis leak test | PASS evidence for T-D03 |
| `scripts/audit/concurrency-bomb.ts` | Concurrency test | PASS evidence for T-D02 |
| `scripts/audit/arbitrage-exploit.ts` | Exploit test | PASS evidence for T-T01 |
| `.omo/evidence/hard-audit/summary.md` | Hard audit results | All 3 crash tests PASS |
| `.omo/reports/env-spec.md` | Env var inventory | Task 1 output, cross-referenced |

### Codebase Scans Performed

| Scan | Pattern | Result |
|------|---------|--------|
| `as any` in edge functions | `as any` in `supabase/functions/` | 4 casts in 2 files |
| `as any` in frontend | `as any` in `src/` | 27 casts in 10 files |
| `admin: any` parameter | `admin: any` in edge functions | 4 functions |
| Service role key usage | `SERVICE_ROLE` in edge functions | 32 references in 16 files |
| CORS wildcards | `Allow-Origin: *` in edge functions | 19 functions (all) |
| Rate limiting | `rate.limit\|throttle\|429` | 0 matches (none exist) |
| Console.log env exposure | `console.log.*Deno.env` | 0 matches (clean) |

### Risk Register Validation Results

| ID | Risk | Validated | Verification Evidence |
|----|------|-----------|----------------------|
| R01 | Supabase project provisioning delays | ✅ | No project exists; 19 functions depend on `SUPABASE_URL` |
| R02 | Migration ordering mismatch | ✅ | 29 migrations; Phase 2 depends on Phase 1 tables |
| R03 | Edge Function break on deploy | ✅ | 32 non-null assertions on env vars; no startup validation |
| R04 | `as any` refactor runtime errors | ✅ | 31 total `as any` casts; `admin: any` in 4 functions |
| R05 | Redis credential leak during rotation | ✅ | Credentials read at module scope; fail-open in dev, critical in prod |
| R06 | Test suite flakiness on CI | ✅ | No retry policy; mock server timing-dependent |
| R07 | Sentry/PII leak in error reports | ✅ | No Sentry yet; `console.error` unstructured; PII risk on integration |
| R08 | CD pipeline breaking change | ✅ | No CD pipeline exists; risk is forward-looking |
| R09 | Rate limiting blocks legitimate users | ✅ | No rate limiting exists; risk is forward-looking |
| R10 | Staging DB diverges from production | ✅ | No staging project; shared migration files |

### STRIDE Coverage

| Category | Threats | P0 | P1 | P2 | P3 | P4 |
|----------|---------|-----|-----|-----|-----|-----|
| Spoofing (S) | 4 | 0 | 3 | 1 | 0 | 0 |
| Tampering (T) | 5 | 0 | 2 | 1 | 1 | 1 |
| Repudiation (R) | 3 | 0 | 0 | 2 | 1 | 0 |
| Information Disclosure (I) | 4 | 0 | 1 | 0 | 2 | 1 |
| Denial of Service (D) | 4 | 0 | 1 | 2 | 1 | 0 |
| Elevation of Privilege (E) | 6 | 2 | 1 | 2 | 1 | 0 |
| **Total** | **28** | **2** | **8** | **8** | **6** | **2** |

### Metis Gap Cross-Reference

| Gap # | Finding | Addressed Via |
|-------|---------|---------------|
| 1 | `as any` casts | T-E06, T-T05 |
| 2 | `blitz-settle-room` timestamp | T-T01 |
| 3 | No CORS headers | T-E05 |
| 4 | No ErrorBoundary | Reliability gap (not security) |
| 5 | Missing `.env` | R03 validated |
| 6 | No CD pipeline | R08 validated |
| 7 | Coverage <5% | R06 validated |
| 8 | Migration ordering | R02 validated |
| 9 | Observability incomplete | T-R01, T-R02 |
| 10 | No Sentry | R07 validated |
| 11 | No rate limiting | T-D01 |
| 12 | No health checks | T-D03, T-D04 |
| 13 | Redis credentials | T-I01 |

---

## Key Findings

### Critical Threats (P0)

1. **T-E01: RLS Bypass via Service Role Key** — 16/19 functions use service role key; leak = full DB access
2. **T-E03: Client JWT Financial Mutation** — Guard triggers exist but need verification testing

### High-Priority Gaps

1. **T-D01: No Rate Limiting** — All 19 functions unprotected; DoS trivial
2. **T-T01: Timestamp Injection** — `blitz-settle-room` uses `new Date()` instead of `order_timestamp()` RPC
3. **T-I01: Redis Credential Exposure** — REST credentials at module scope; no env dump protection
4. **T-R02: No Balance Audit Trail** — Settlement modifies balance without ledger entry

### Hard Audit Validation

All 3 crash tests PASS against mock server:
- CRSH-001: Redis connection leak — **PASS** (drift=0)
- CRSH-002: Concurrency bombardment — **PASS** (p95=2ms, 0 deadlocks)
- CRSH-003: Exploit & idempotency — **PASS** (stale→409, injection→400, spam→dedup)

---

## Blocking Dependencies Fulfilled

This task blocks:
- [ ] T31-T38 (Security hardening wave)
- [ ] T52 (Settlement timestamp fix)
- [ ] T45-T49 (Code quality hardening)
- [ ] T55 (Production readiness checklist)

---

## Downstream Task References

| Task | Wave | Threat IDs Addressed |
|------|------|---------------------|
| T30 | W3 | ErrorBoundary (reliability) |
| T31 | W4 | T-D01, T-D02 |
| T32 | W4 | T-E05 |
| T33 | W4 | T-I01, T-T02 |
| T34 | W4 | T-S02, T-E02, T-E03, T-E04 |
| T36 | W4 | T-I01 |
| T37 | W4 | T-D01, T-D02, T-D03, T-T02, T-T03 |
| T38 | W4 | T-S01, T-E05, T-I03 |
| T39 | W5 | T-R01, T-R02, T-R03 |
| T40 | W5 | T-I02, T-S04, R07 |
| T41 | W5 | T-D03, T-D04 |
| T43 | W5 | T-R01 |
| T45-T48 | W6 | T-E06, T-T05 |
| T49 | W6 | T-T05, T-E02, T-E04 |
| T50 | W6 | T-I01 |
| T52 | W6 | T-T01 |
| T54 | W6 | T-E06 |

---

*Task 2 of Wave 0 complete. Ready for downstream security hardening tasks.*
