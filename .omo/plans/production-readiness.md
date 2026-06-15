# Production Readiness: AI Magic Dash

## TL;DR

> **Quick Summary**: Transform AI Magic Dash from audited prototype into a production-ready platform — Supabase project provisioning, CI/CD automation, full test coverage, security hardening, observability, and phased deployment.
>
> **Deliverables**: 7-phase execution plan with dependency ordering, risk register, parallel execution waves, and production readiness checklist.
>
> **Estimated Effort**: XL — 60+ tasks across 8 waves
> **Parallel Execution**: YES — 8 waves, up to 7 concurrent agents per wave
> **Critical Path**: Discovery → Foundation → CD Pipeline → Tests → Security → Observability → Hardening → Documentation → Final QA

---

## Context

### Original Request
Transform AI Magic Dash from an audited prototype (Phase 2 complete, crash tests PASS) into a production-ready platform. The project currently has:
- **29 SQL migrations** (Phase 1: roles/profiles/positions/orders/blitz — Phase 2: security/settlement/analytics/observability/blitz-fixes)
- **20 Supabase Edge Functions** (4 critical blitz: settle-room, tick-order, matchmake, analytics-writer)
- **18 frontend pages + 12 custom hooks + 8 lib files**
- **14 tests** across 4 test files (coverage <5%)
- **CI only** (no CD, no production Supabase project, no Upstash Redis)
- **1 SQLCipher key** committed in history (rotated in migration 0017)
- **18+ `as any` casts** and admin typed as `any` in settleRoom()
- **Audit scripts** (redis-leak, concurrency-bomb, arbitrage-exploit) — all PASS on mock server
- **Observability** lib exists (client-side only); Edge Functions use `log_observability()` RPC partially
- **VITE_ANA_SAHNE_ENABLED** — single feature flag
- **No ErrorBoundary**, no E2E tests, no `.env` file

### Interview Summary
Full codebase inventory + expert report (`expert-report.md`, `blitz-phase-2-complete.md`, `lumentrade-complete.md`) + `.omo/boulder.json` (`blitz-phase-2-01` completed, `hard-technical-audit` in_progress) + CI/CD config analysis + audit script analysis + Metis gap analysis.

**Key Findings from Metis**:
- `as any` usage — 18+ casts, admin typed as `any` in settleRoom()
- `blitz-settle-room` uses `new Date().toISOString()` instead of `order_timestamp()` RPC
- No CORS headers in Edge Functions
- No `ErrorBoundary` in React app
- Missing `.env` file (only placeholder `.env.example`)
- No CD pipeline (CI exists but no deploy)
- Coverage <5%, no E2E, no integration tests
- 29 migrations need ordering verification
- Observability lib exists but client-side only
- No Sentry/production error tracking
- No rate limiting on Edge Functions
- No health check endpoints
- Redis connection from Edge Functions may expose credentials

### Metis Review
**Identified Gaps** (all addressed in this plan):
- [Gap 1: `as any` casts] → Addressed in Phase 5 (Code Quality Hardening) + Phase 7 (Blitz Hardening)
- [Gap 2: Timestamp RPC] → Addressed in Phase 7 (Blitz Hardening — Task 52)
- [Gap 3: CORS headers] → Addressed in Phase 6 (Observability — Task 39)
- [Gap 4: ErrorBoundary] → Addressed in Phase 4 (Tests — Task 30)
- [Gap 5: Missing env vars] → Addressed in Phase 0 (Discovery — Task 1) + Phase 1 (Foundation — Task 9)
- [Gap 6: No CD] → Addressed in Phase 2 (CD Pipeline)
- [Gap 7: Coverage <5%] → Addressed in Phase 4 (Tests)
- [Gap 8: Migration ordering] → Addressed in Phase 1 (Foundation — Task 4)
- [Gap 9: Observability incomplete] → Addressed in Phase 6 (Observability)
- [Gap 10: No Sentry] → Addressed in Phase 6 (Observability — Task 40)
- [Gap 11: No rate limiting] → Addressed in Phase 5 (Security — Task 31)
- [Gap 12: No health checks] → Addressed in Phase 6 (Observability — Task 41)
- [Gap 13: Redis credentials] → Addressed in Phase 5 (Security — Task 33)

---

## Work Objectives

### Core Objective
Transform AI Magic Dash from an audited prototype (Phase 2 complete) into a production-ready platform: fully CI/CD-pipelined, comprehensively tested (≥70% coverage), security-hardened, observability-instrumented, and deployable to production Supabase + Upstash Redis with zero-regression guarantees.

### Concrete Deliverables
- Production Supabase project provisioned with verified migration order
- Upstash Redis instance configured with credential rotation
- GitHub Actions CD pipeline deploying Edge Functions + DB migrations
- ≥70% test coverage (unit + integration + E2E)
- All `as any` casts eliminated or type-safe
- ErrorBoundary + Sentry + structured logging in production
- Health check endpoints on all Edge Functions
- Rate limiting across all Edge Functions
- CORS headers on all public Edge Functions
- Blitz settlement timestamp corrected to use `order_timestamp()` RPC
- Production readiness checklist signed off

### Definition of Done
- [ ] `npm run build` — PASS
- [ ] `npm run test` — ≥70% coverage, 0 failures
- [ ] CD pipeline deploys Edge Functions to production Supabase on push to `main`
- [ ] CD pipeline runs migrations with confirmation gate
- [ ] Sentry error tracking active and receiving test events
- [ ] Health check: `GET /health` returns `{"status":"ok"}` on all Edge Functions
- [ ] Rate limiting active and verified via load test
- [ ] All `as any` and `@ts-ignore` removed (0 remaining)
- [ ] Production Redis reachable with rotated credentials
- [ ] `blitz-settle-room` uses `order_timestamp()` RPC
- [ ] Crash tests (redis-leak, concurrency-bomb, arbitrage-exploit) PASS against production

### Must Have
- Server-authoritative execution preserved everywhere
- RLS enabled and verified on all production tables
- Settlement ledger append-only (no UPDATE/DELETE)
- Redis read-only from client; writes only from Edge Functions
- Slippage validated server-side, not client-side
- VITE_ANA_SAHNE_ENABLED remains feature-flag controlled
- Mock server remains operational and unbroken throughout
- All financial operations idempotent and auditable
- Rollback capability: all migrations reversible (have `DOWN` blocks)
- `.env` file NEVER committed to version control

### Must NOT Have (Guardrails)
- `as any` or `@ts-ignore` anywhere in production code
- Bypassing RLS for any table
- Financial writes through Redis (Redis is cache-only)
- Disabling or skipping existing tests
- Hardcoded secrets or credentials
- `console.log()` in production Edge Functions
- Unauthenticated financial data exposure
- New Redis keys without documentation
- Changes to `realtime.messages` RLS
- Modifications to existing Edge Function signatures (unless explicitly scoped)
- Discarding the mock server (it's the authorized test double)
- Blocking tests that currently pass
- Adding new npm dependencies without security review

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.
> Acceptance criteria requiring "user manually tests/confirms" are FORBIDDEN.

### Test Decision
- **Infrastructure exists**: YES — vitest + Playwright + 4 existing test files
- **Automated tests**: Tests-after (implement then test). Not TDD.
- **Framework**: vitest + @testing-library/react + Playwright
- **Coverage target**: ≥70% line coverage

### QA Policy
Every task MUST include agent-executable QA scenarios. Evidence saved to `.omo/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Frontend/UI**: Playwright + screenshot comparison
- **Edge Functions (deployed)**: Bash (curl) — invoke, assert response status + body fields
- **Edge Functions (local)**: Bash (supabase functions serve + curl)
- **DB/SQL**: Bash (psql or supabase db query) — assert row counts, RLS violations, constraint checks
- **CI/CD**: Bash (gh workflow run + gh run watch) — assert workflow outcome
- **Security**: Bash (load test tools, SQL injection attempts) — assert rate limiting, RLS enforcement

---

## Risk Register

| ID | Risk | Likelihood | Impact | Mitigation |
|-----|------|-----------|--------|-----------|
| R01 | Supabase project provisioning delays | Medium | High | Pre-provision via Terraform/Pulumi; have backup regions |
| R02 | Migration ordering mismatch on fresh DB | Medium | Critical | Verification script + staging deploy first |
| R03 | Edge Function break on deploy (env mismatch) | Medium | High | Staging → production promotion; env validation in CI |
| R04 | `as any` refactor introduces runtime errors | Low | Medium | Type narrowing + tests before refactor |
| R05 | Redis credential leak during rotation | Low | Critical | Rotate in staging first; audit logs enabled |
| R06 | Test suite flakiness on CI | Medium | Low | Retry policy (3x); isolate flaky tests |
| R07 | Sentry/PII leak in error reports | Low | High | Data scrubbing before send; `beforeSend` hook |
| R08 | CD pipeline deploys breaking change without review | Low | Critical | PR gate + staging deploy + manual confirmation |
| R09 | Rate limiting blocks legitimate users | Medium | Medium | Conservative limits; per-route tuning post-deploy |
| R10 | Staging DB diverges from production after many deploys | Medium | Medium | Migration replay on staging before each prod deploy |

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 0 (Discovery — serial, sequential):
├── Task 1:  Environment inventory + env vars specification
├── Task 2:  Risk register finalization + security threat model
├── Task 3:  Edge Function dependency map + Redis key audit
└── Task 4:  Migration ordering verification script

Wave 1 (Foundation — parallel foundation):
├── Task 5:  Supabase project creation + DB provisioning
├── Task 6:  Upstash Redis instance creation
├── Task 7:  Staging Supabase project creation
├── Task 8:  Supabase CLI login + project linking
├── Task 9:  .env file creation with all secrets
├── Task 10: Type-safe config module (env validation at startup)
├── Task 11: Migration replay on staging (verify ordering)
└── Task 12: Feature flag system enhancement

Wave 2 (CD Pipeline — parallel infra):
├── Task 13: GitHub Actions — Edge Function deploy workflow
├── Task 14: GitHub Actions — DB migration workflow (with gate)
├── Task 15: GitHub Actions — staging deploy workflow
├── Task 16: GitHub Actions — E2E test workflow
├── Task 17: Vercel/Netlify deploy config (frontend)
├── Task 18: Environment promotion script (staging→production)
├── Task 19: Rollback script (migration revert + EF redeploy)
└── Task 20: CD pipeline crash test (dry-run)

Wave 3 (Tests — parallel test expansion):
├── Task 21: Mock server health check + test utility library
├── Task 22: Unit tests — Edge Functions (vitest)
├── Task 23: Unit tests — hooks + lib (vitest + @testing-library/react)
├── Task 24: Unit tests — pages + components (vitest + @testing-library/react)
├── Task 25: Integration tests — auth flow (Playwright)
├── Task 26: Integration tests — Blitz trading flow (Playwright)
├── Task 27: Integration tests — settlement + payout (curl + DB assert)
├── Task 28: E2E — full user journey (Playwright)
├── Task 29: Coverage enforcement (vitest --coverage, ≥70% gate)
└── Task 30: ErrorBoundary component + test

Wave 4 (Security — parallel hardening):
├── Task 31: Rate limiting — Supabase + Edge Function layer
├── Task 32: CORS headers on all public Edge Functions
├── Task 33: Redis credentials rotation + Vault/secret injection
├── Task 34: RLS audit + penetration test (SQL injection attempts)
├── Task 35: SQLCipher key remnant scrub + git history cleanup
├── Task 36: Security audit scripts for CI (leak detector + SAST)
├── Task 37: Production crash test (redis-leak, concurrency-bomb, arbitrage-exploit)
└── Task 38: Security headers (CSP, HSTS, X-Frame-Options)

Wave 5 (Observability — parallel instrumentation):
├── Task 39: Structured logging library for Edge Functions
├── Task 40: Sentry integration (frontend + Edge Functions)
├── Task 41: Health check endpoint on all critical Edge Functions
├── Task 42: Observability dashboard (Supabase + custom)
├── Task 43: Alert configuration (Sentry + Slack/Email)
└── Task 44: log_observability() RPC call standardization

Wave 6 (Hardening — parallel code quality):
├── Task 45:  `as any` elimination — lib files
├── Task 46:  `as any` elimination — hooks
├── Task 47:  `as any` elimination — pages
├── Task 48:  `as any` elimination — Edge Functions
├── Task 49:  Admin type safety (settleRoom admin param)
├── Task 50:  Console.log removal + logger integration
├── Task 51:  Unused import/variable cleanup
├── Task 52:  Blitz settlement timestamp fix (order_timestamp() RPC)
├── Task 53:  Waiting room timeout cleanup (Phase 2 leftover)
└── Task 54:  TypeScript strict mode enablement

Wave 7 (Documentation + Handover):
├── Task 55:  Production readiness checklist sign-off
├── Task 56:  Runbook (incident response, rollback, monitoring)
├── Task 57:  Architecture decision records (ADRs)
├── Task 58:  Environment setup guide (for new devs)
└── Task 59:  Final crash test suite run against production

Wave FINAL (Verification — 4 parallel reviews):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high + playwright)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay

Critical Path: T1→T5→T13→T22→T31→T39→T45→T55→F1-F4
Parallel Speedup: ~75% faster than sequential
Max Concurrent: 8 (Wave 2-6)
```

### Dependency Matrix

- **T1-T4**: — — T5-T12, W1
- **T5**: T1 — T8, T13, W2
- **T6**: T1 — T33, W2
- **T7**: T1 — T15, W2
- **T8**: T5 — T13, T14, W2
- **T9**: T1 — T10, W1
- **T10**: T9 — T45-T48, W6
- **T11**: T5, T7 — T14, W2
- **T12**: — — T26, T30, W3
- **T13**: T5, T8 — T20, W2
- **T14**: T8, T11 — T20, W2
- **T15**: T7 — T20, W2
- **T16**: T21-T28 — T55, W7
- **T17**: — — T55, W7
- **T18**: T13, T15 — T55, W7
- **T19**: T14 — T55, W7
- **T20**: T13-T16 — T37, W4
- **T21**: — — T22-T28, W3
- **T22**: T5 — T29, W3
- **T23**: — — T29, W3
- **T24**: T30 — T29, W3
- **T25**: T21 — T29, W3
- **T26**: T12, T21 — T29, W3
- **T27**: T5 — T29, W3
- **T28**: T21-T27 — T29, W3
- **T29**: T22-T28 — T55, W7
- **T30**: — — T24, W3
- **T31**: T5 — T37, W4
- **T32**: T5 — T37, W4
- **T33**: T6 — T37, W4
- **T34**: T5 — T37, W4
- **T35**: — — T36, W4
- **T36**: T35 — T37, W4
- **T37**: T20, T31-T36 — T55, W7
- **T38**: T13 — T55, W7
- **T39**: T5 — T44, W5
- **T40**: T9 — T55, W7
- **T41**: T5 — T44, W5
- **T42**: T39, T44 — T55, W7
- **T43**: T40 — T55, W7
- **T44**: T39 — T42, W5
- **T45-T54**: T10 — T55, W6 (parallel within W6)
- **T55-T59**: T16-T19, T29, T37, T38, T40, T42, T43, T45-T54 — W7
- **F1-F4**: T55-T59 — DONE

### Agent Dispatch Summary

- **W0**: 4 — T1→`deep`, T2→`deep`, T3→`deep`, T4→`deep`
- **W1**: 8 — T5→`unspecified-high`, T6→`unspecified-high`, T7→`unspecified-high`, T8→`quick`, T9→`unspecified-high`, T10→`deep`, T11→`unspecified-high`, T12→`quick`
- **W2**: 8 — T13→`unspecified-high`, T14→`unspecified-high`, T15→`unspecified-high`, T16→`unspecified-high`, T17→`quick`, T18→`quick`, T19→`quick`, T20→`deep`
- **W3**: 10 — T21→`unspecified-high`, T22→`deep`, T23→`deep`, T24→`deep`, T25→`visual-engineering`, T26→`visual-engineering`, T27→`deep`, T28→`visual-engineering`, T29→`quick`, T30→`quick`
- **W4**: 8 — T31→`deep`, T32→`quick`, T33→`deep`, T34→`deep`, T35→`unspecified-high`, T36→`unspecified-high`, T37→`deep`, T38→`quick`
- **W5**: 6 — T39→`deep`, T40→`unspecified-high`, T41→`quick`, T42→`visual-engineering`, T43→`quick`, T44→`quick`
- **W6**: 10 — T45→`deep`, T46→`deep`, T47→`deep`, T48→`deep`, T49→`deep`, T50→`quick`, T51→`quick`, T52→`quick`, T53→`quick`, T54→`quick`
- **W7**: 5 — T55→`unspecified-high`, T56→`writing`, T57→`writing`, T58→`writing`, T59→`deep`
- **FINAL**: 4 — F1→`oracle`, F2→`unspecified-high`, F3→`unspecified-high`, F4→`deep`

---

## TODOs

> **FORMAT**: All task labels use bare numbers (`1.`, `2.`) — NOT `T1.`, `Task 1.`, `Phase 1:`. Final Wave labels use `F1.`, `F2.`, etc.
> Every task MUST include: What to do, Must NOT do, Agent Profile, Parallelization, References, Acceptance Criteria, QA Scenarios.
> QA Scenarios are MANDATORY and AGENT-EXECUTABLE — no human intervention required.

### Wave 0: Discovery (Serial — prerequisites for everything)

- [x] 1. **Environment Inventory + Env Vars Specification**

  **What to do**:
  - Audit every configurable value in the project: `.env.example` (3 vars), `supabase/config.toml`, Edge Function environment lookups, feature flags
  - Create a complete environment variable specification: name, source (local/CI/production), required/optional, description
  - Identify all secrets (API keys, JWT secrets, Redis credentials, SQLCipher key) and document their rotation schedule
  - Check for hardcoded values in Edge Functions (`_shared/redis.ts` connection string?), frontend config, and migration files
  - Verify no secrets currently exist in `.env` (should be empty placeholder)

  **Must NOT do**:
  - Do NOT create `.env` file yet (that's Task 9)
  - Do NOT commit the env spec to version control (save as `.omo/reports/`)
  - Do NOT modify any source code

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Needs thorough codebase-wide audit for every configurable value; must not miss anything
  - **Skills**: none required

  **Parallelization**:
  - **Can Run In Parallel**: NO (Wave 0 is serial)
  - **Parallel Group**: Sequential
  - **Blocks**: T5, T6, T7, T9
  - **Blocked By**: None (starts immediately)

  **References**:
  - `.env.example` — Current placeholder env vars
  - `supabase/config.toml` — Supabase project configuration
  - `supabase/functions/_shared/redis.ts` — Redis connection setup
  - `supabase/functions/_shared/blitz-types.ts` — Edge Function types
  - `src/config.ts` or equivalent — Frontend configuration pattern
  - `.github/workflows/ci.yml` — CI environment variables

  **Acceptance Criteria**:
  - [ ] Env var specification document created: `.omo/reports/env-spec.md`
  - [ ] Every env var categorized: local/CI/staging/production
  - [ ] Secrets rotation schedule documented
  - [ ] Zero secrets found in source code (or flagged if found)

  **QA Scenarios**:
  ```
  Scenario: Verify env spec completeness
    Tool: Bash (grep + read)
    Preconditions: Task complete
    Steps:
      1. grep -r 'process\.env\.' --include='*.ts' --include='*.tsx' src/ supabase/functions/ | sort -u > /tmp/env-usage.txt
      2. Read .omo/reports/env-spec.md and compare: every env var from code must be documented
      3. Assert: diff between /tmp/env-usage.txt and documented vars is empty
    Expected Result: Zero undocumented env vars found
    Evidence: .omo/evidence/task-1-env-spec-complete.md

  Scenario: Verify no secrets in source
    Tool: Bash (grep)
    Preconditions: Task complete
    Steps:
      1. grep -r '-----BEGIN.*KEY' --include='*.ts' --include='*.json' --include='*.yaml' src/ supabase/ || true
      2. grep -rn 'password\|PASSWORD\|secret\|SECRET\|api_key\|API_KEY' --include='*.ts' --include='*.tsx' src/ supabase/functions/ | grep -v 'node_modules' | grep -v '.env' | grep -v 'process.env' | grep -v '\.env\.'
      3. Assert: No secrets found outside documented locations
    Expected Result: All secrets are referenced via env vars, not hardcoded
    Evidence: .omo/evidence/task-1-no-secrets.log
  ```

  **Evidence to Capture**:
  - [ ] `.omo/evidence/task-1-env-spec-complete.md`
  - [ ] `.omo/evidence/task-1-no-secrets.log`

  **Commit**: YES (with Task 2-4 as group)
  - Message: `docs: add environment inventory and env var specification`
  - Files: `.omo/reports/env-spec.md`
  - Pre-commit: None

- [x] 2. **Risk Register Finalization + Security Threat Model**

  **What to do**:
  - Take the preliminary risk register (R01-R10) from this plan and validate each entry against actual codebase
  - For each risk: verify mitigation is feasible, assign owner category, add specific test/command for verification
  - Create a STRIDE-based threat model: identify Spoofing/Tampering/Repudiation/Information Disclosure/DoS/Elevation of Privilege threats
  - Cross-reference with Metis findings: timestamp injection, Redis credential exposure, `as any` in admin logic
  - Document threat model as `.omo/reports/threat-model.md`

  **Must NOT do**:
  - Do NOT implement mitigations (tasks in later waves handle those)
  - Do NOT ignore existing hard-audit findings

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Security threat modeling requires thorough understanding of all attack surfaces
  - **Skills**: none required

  **Parallelization**:
  - **Can Run In Parallel**: NO (Wave 0 is serial; follows T1)
  - **Parallel Group**: Sequential
  - **Blocks**: T31-T38
  - **Blocked By**: T1

  **References**:
  - `scripts/audit/` — Existing audit scripts (redis-leak, concurrency-bomb, arbitrage-exploit)
  - `.omo/evidence/hard-audit/` — Hard audit results
  - `supabase/functions/blitz-settle-room/index.ts` — Critical financial logic
  - `supabase/functions/_shared/redis.ts` — Redis connection (potential exposure)
  - Expert report section on security gaps

  **Acceptance Criteria**:
  - [ ] Risk register validated against codebase
  - [ ] STRIDE threat model complete: threats documented, categorized, prioritized
  - [ ] `.omo/reports/threat-model.md` created

  **QA Scenarios**:
  ```
  Scenario: Verify threat model covers all Metis findings
    Tool: Bash (grep + read)
    Preconditions: Task complete
    Steps:
      1. Read `.omo/reports/threat-model.md`
      2. Assert document contains: Redis credential exposure, timestamp injection risk, as-any type escape
      3. Assert each Metis finding has a threat entry with severity and mitigation reference
    Expected Result: All known risks have corresponding threat model entries
    Evidence: .omo/evidence/task-2-threat-model.md
  ```

  **Evidence to Capture**:
  - [ ] `.omo/evidence/task-2-threat-model.md`

  **Commit**: YES (with T1, T3-T4 as group)
  - Message: `docs: add threat model and risk register`
  - Files: `.omo/reports/threat-model.md`, `.omo/plans/production-readiness.md`
  - Pre-commit: None

- [x] 3. **Edge Function Dependency Map + Redis Key Audit**

  **What to do**:
  - For each of the 20 Edge Functions, map: function name, trigger type (HTTP/DB/webhook), inputs, outputs, called functions, used env vars, accessed Redis keys, accessed DB tables
  - Create `supabase/functions/DEPENDENCY_MAP.md` documenting the full dependency graph
  - Audit all Redis keys used across all functions: enumerate every `redis.get()`, `redis.set()`, `redis.del()`, `redis.hget()`, `redis.hset()` etc.
  - Check for conflicting key namespaces, missing TTLs, keys that should be volatile vs persistent
  - Document Redis key schema: `{namespace}:{id}:{field}` convention

  **Must NOT do**:
  - Do NOT change any Redis key names (that's for later hardening)
  - Do NOT modify any Edge Function code

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Needs comprehensive code analysis across all 20 functions + Redis key enumeration
  - **Skills**: none required

  **Parallelization**:
  - **Can Run In Parallel**: NO (Wave 0 is serial; follows T2)
  - **Parallel Group**: Sequential
  - **Blocks**: T33, T45-T48
  - **Blocked By**: T2

  **References**:
  - `supabase/functions/*/index.ts` — All 20 Edge Functions
  - `supabase/functions/_shared/redis.ts` — Redis client setup
  - `supabase/functions/_shared/blitz-types.ts` — Shared types
  - Expert report Edge Function inventory

  **Acceptance Criteria**:
  - [ ] DEPENDENCY_MAP.md created at `supabase/functions/DEPENDENCY_MAP.md`
  - [ ] All 20 functions documented with dependencies
  - [ ] Redis key schema documented with namespaces
  - [ ] No undocumented Redis keys

  **QA Scenarios**:
  ```
  Scenario: Verify dependency map covers all 20 functions
    Tool: Bash (ls + wc)
    Preconditions: Task complete
    Steps:
      1. ls -d supabase/functions/*/ | wc -l → count
      2. grep -c '^## ' supabase/functions/DEPENDENCY_MAP.md → count
      3. Assert: number of functions in map >= number of function directories
    Expected Result: All 20 Edge Functions documented
    Evidence: .omo/evidence/task-3-dependency-map.md

  Scenario: Verify Redis key documentation
    Tool: Bash (grep)
    Preconditions: Task complete
    Steps:
      1. grep -rn 'redis\.\(get\|set\|del\|hget\|hset\|hdel\|expire\|ttl\)' supabase/functions/ --include='*.ts' | sort -u > /tmp/redis-ops.txt
      2. Assert: every Redis key pattern in code matches documented schema
    Expected Result: All Redis keys documented in schema
    Evidence: .omo/evidence/task-3-redis-keys.md
  ```

  **Evidence to Capture**:
  - [ ] `.omo/evidence/task-3-dependency-map.md`
  - [ ] `.omo/evidence/task-3-redis-keys.md`

  **Commit**: YES (with T1, T2, T4 as group)
  - Message: `docs: add Edge Function dependency map and Redis key audit`
  - Files: `supabase/functions/DEPENDENCY_MAP.md`
  - Pre-commit: None

- [x] 4. **Migration Ordering Verification Script**

  **What to do**:
  - Read all 29 migration files in `supabase/migrations/`
  - Create a verification script (`scripts/verify-migration-order.ts`) that:
    1. Checks all migrations are numbered sequentially with no gaps
    2. Verifies no DOWN migration data loss (every migration with a DROP has a corresponding CREATE in earlier/later migration)
    3. Checks for conflicting operations (two migrations modifying the same table/column)
    4. Validates that each migration's UP can run on a clean DB after all previous DOWNs
    5. Reports any migration that references tables/columns not yet created at that point
  - Run the script against the current migration directory
  - Fix any ordering issues found (reorder or split migrations if necessary)

  **Must NOT do**:
  - Do NOT modify migration content (only fix ordering if safe)
  - Do NOT run migrations against production DB (none exists yet)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Complex SQL parsing and ordering verification; needs thorough understanding of dependencies
  - **Skills**: none required

  **Parallelization**:
  - **Can Run In Parallel**: NO (Wave 0 is serial; follows T3)
  - **Parallel Group**: Sequential
  - **Blocks**: T11
  - **Blocked By**: T3

  **References**:
  - `supabase/migrations/*.sql` — All 29 migration files
  - `supabase/config.toml` — Supabase project config
  - Expert report migration inventory (Phase 1: 0012-0019, Phase 2: 0021-0029)

  **Acceptance Criteria**:
  - [ ] `scripts/verify-migration-order.ts` created
  - [ ] Script runs: `npx tsx scripts/verify-migration-order.ts` → PASS (no ordering issues)
  - [ ] Migration ordering validated: all 29 files checked
  - [ ] Any issues found are documented in `.omo/reports/migration-issues.md`

  **QA Scenarios**:
  ```
  Scenario: Migration verification script runs
    Tool: Bash (npx tsx)
    Preconditions: Script exists
    Steps:
      1. npx tsx scripts/verify-migration-order.ts
      2. Check exit code (0 = PASS, non-zero = FAIL)
      3. Check stdout for "PASS" or "FAIL" summary
    Expected Result: Script exits 0 with PASS summary
    Evidence: .omo/evidence/task-4-migration-check.log

  Scenario: Verify all 29 migrations checked
    Tool: Bash (grep)
    Preconditions: Script ran
    Steps:
      1. ls supabase/migrations/*.sql | wc -l → 29
      2. grep -c 'Checking migration' /tmp/script-output.txt || read from evidence
    Expected Result: All 29 migrations verified
    Evidence: .omo/evidence/task-4-migration-count.log
  ```

  **Evidence to Capture**:
  - [ ] `.omo/evidence/task-4-migration-check.log`
  - [ ] `.omo/evidence/task-4-migration-count.log`

  **Commit**: YES (with T1-T3 as group)
  - Message: `feat: add migration ordering verification script`
  - Files: `scripts/verify-migration-order.ts`, `.omo/reports/migration-issues.md`
  - Pre-commit: `npx tsx scripts/verify-migration-order.ts`

### Wave 1: Foundation (Parallel — infrastructure provisioning)

- [ ] 5. **Supabase Production Project Creation + DB Provisioning**

  **What to do**:
  - Create production Supabase project via CLI or dashboard (`supabase projects create`)
  - Run all 29 migrations in verified order against the new project
  - Enable required extensions (pgcrypto, pg_stat_statements, etc.)
  - Configure DB settings: connection pooling, statement timeout, max connections
  - Create service role key, anon key, JWT secret for production
  - Verify: all tables created, RLS enabled, triggers installed, functions exist
  - Record project reference ID, URL, and API keys to `.env` (not committed)

  **Must NOT do**:
  - Do NOT commit project credentials to version control
  - Do NOT enable public access before security hardening (Wave 4)
  - Do NOT modify existing migrations

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multi-step infrastructure provisioning requiring Supabase CLI + SQL execution
  - **Skills**: none required

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T6, T7)
  - **Parallel Group**: Wave 1 (with T6, T7, T8)
  - **Blocks**: T8, T11, T13, T22, T27, T31, T32, T34, T37, T39, T41
  - **Blocked By**: T1

  **References**:
  - `supabase/migrations/*.sql` — All 29 migrations to apply
  - `supabase/config.toml` — Base configuration
  - `supabase/seed.sql` — Seed data (if exists)

  **Acceptance Criteria**:
  - [ ] `supabase projects list` shows production project
  - [ ] All 29 migrations applied (`supabase db remote commits` confirms)
  - [ ] RLS enabled on all tables
  - [ ] Edge Functions listed: `supabase functions list` returns all 20

  **QA Scenarios**:
  ```
  Scenario: Verify project exists and migrations applied
    Tool: Bash (supabase CLI)
    Preconditions: Supabase CLI installed, logged in
    Steps:
      1. supabase projects list → capture output
      2. supabase db remote commits --project-ref <PROD_REF>
      3. Assert: production project listed with status "active"
      4. Assert: last migration commit matches latest file name
    Expected Result: Production project active, all 29 migrations applied
    Evidence: .omo/evidence/task-5-project-verified.log

  Scenario: Verify RLS enabled
    Tool: Bash (supabase db query)
    Preconditions: DB accessible
    Steps:
      1. supabase db query "SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname='public' AND rowsecurity=false;" --project-ref <PROD_REF>
      2. Assert: query returns 0 rows
    Expected Result: RLS enabled on all public tables
    Evidence: .omo/evidence/task-5-rls-verified.log
  ```

  **Evidence to Capture**:
  - [ ] `.omo/evidence/task-5-project-verified.log`
  - [ ] `.omo/evidence/task-5-rls-verified.log`

  **Commit**: NO (credentials in .env; do not commit)

- [ ] 6. **Upstash Redis Instance Creation**

  **What to do**:
  - Create production Upstash Redis instance
  - Configure: TLS enabled, eviction policy (allkeys-lru), max memory
  - Generate credentials: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
  - Test connectivity: verify GET/SET works
  - Record credentials to `.env` (not committed)
  - Document rotation procedure

  **Must NOT do**:
  - Do NOT commit Redis credentials to version control
  - Do NOT connect from client-side code (server-authoritative only)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Cloud resource provisioning with security considerations
  - **Skills**: none required

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T5, T7)
  - **Parallel Group**: Wave 1 (with T5, T7, T8)
  - **Blocks**: T33
  - **Blocked By**: T1

  **References**:
  - `supabase/functions/_shared/redis.ts` — Redis client configuration
  - `.env.example` — Credential format

  **Acceptance Criteria**:
  - [ ] Upstash Redis instance created and reachable
  - [ ] `curl $UPSTASH_REDIS_REST_URL/ping` returns `{"result":"PONG"}`
  - [ ] Redis credentials stored in `.env` (not committed)

  **QA Scenarios**:
  ```
  Scenario: Verify Redis connectivity
    Tool: Bash (curl)
    Preconditions: UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in .env
    Steps:
      1. source .env && curl -s -u ":$UPSTASH_REDIS_REST_TOKEN" "$UPSTASH_REDIS_REST_URL/ping"
      2. Assert: response contains "PONG"
      3. curl -s -u ":$UPSTASH_REDIS_REST_TOKEN" "$UPSTASH_REDIS_REST_URL/set/testkey/helloworld"
      4. curl -s -u ":$UPSTASH_REDIS_REST_TOKEN" "$UPSTASH_REDIS_REST_URL/get/testkey"
      5. Assert: GET returns "helloworld"
      6. curl -s -u ":$UPSTASH_REDIS_REST_TOKEN" "$UPSTASH_REDIS_REST_URL/del/testkey"
    Expected Result: Redis responds, read/write/delete all work
    Evidence: .omo/evidence/task-6-redis-connectivity.log
  ```

  **Evidence to Capture**:
  - [ ] `.omo/evidence/task-6-redis-connectivity.log`

  **Commit**: NO (credentials in .env; do not commit)

- [ ] 7. **Staging Supabase Project Creation**

  **What to do**:
  - Create staging Supabase project (separate from production)
  - Apply all 29 migrations to staging
  - Same extensions/pooler settings as production
  - Create separate service role key, anon key, JWT secret
  - Record staging credentials to `.env` (not committed)

  **Must NOT do**:
  - Do NOT use production project for staging
  - Do NOT commit staging credentials to version control

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Similar to T5 but setting up parallel environment
  - **Skills**: none required

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T5, T6)
  - **Parallel Group**: Wave 1 (with T5, T6, T8)
  - **Blocks**: T11, T15
  - **Blocked By**: T1

  **References**:
  - Same as T5 — staging is a copy of production setup

  **Acceptance Criteria**:
  - [ ] Staging Supabase project exists and is separate from production
  - [ ] All 29 migrations applied to staging
  - [ ] Staging credentials in `.env`

  **QA Scenarios**:
  ```
  Scenario: Verify staging project is distinct
    Tool: Bash (supabase CLI)
    Preconditions: Supabase CLI installed
    Steps:
      1. supabase projects list → capture both refs
      2. Assert: production ref != staging ref
    Expected Result: Staging project distinct, migrations applied
    Evidence: .omo/evidence/task-7-staging-verified.log
  ```

  **Evidence to Capture**:
  - [ ] `.omo/evidence/task-7-staging-verified.log`

  **Commit**: NO (credentials in .env; do not commit)

- [ ] 8. **Supabase CLI Login + Project Linking**

  **What to do**:
  - Run `supabase login` with production access token
  - Link local to production: `supabase link --project-ref <PROD_REF>`
  - Link staging: `supabase link --project-ref <STAGING_REF>` (when switching)
  - Document linking process for CI/CD workflows

  **Must NOT do**:
  - Do NOT hardcode project refs in source code

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Straightforward CLI commands
  - **Skills**: none required

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T5, T6, T7)
  - **Parallel Group**: Wave 1 (with T5, T6, T7)
  - **Blocks**: T13, T14
  - **Blocked By**: T5

  **References**:
  - `supabase/config.toml` — Project configuration

  **Acceptance Criteria**:
  - [ ] `supabase link` succeeds for production
  - [ ] `supabase db remote set` returns current project

  **QA Scenarios**:
  ```
  Scenario: Verify project linking
    Tool: Bash (supabase CLI)
    Preconditions: CLI installed, tokens configured
    Steps:
      1. supabase link --project-ref <PROD_REF>
      2. Assert: exit code 0
    Expected Result: Project linked
    Evidence: .omo/evidence/task-8-link-verified.log
  ```

  **Evidence to Capture**:
  - [ ] `.omo/evidence/task-8-link-verified.log`

  **Commit**: NO (project refs in .env; do not commit)

- [x] 9. **.env File Creation with All Secrets**

  **What to do**:
  - Create `.env` with all vars from T1 spec
  - Include: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, JWT_SECRET
  - Include: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN (from T6)
  - Include: VITE_ prefixed vars (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_ANA_SAHNE_ENABLED)
  - Include: SENTRY_DSN (placeholder), LOG_LEVEL
  - Set proper development defaults
  - Add `.env` to `.gitignore` (verify already there)
  - Update `.env.example` with new vars (placeholder values, no secrets)

  **Must NOT do**:
  - Do NOT commit `.env` to version control
  - Do NOT put real production secrets in local `.env`

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Careful secret management
  - **Skills**: none required

  **Parallelization**:
  - **Can Run In Parallel**: YES (after T5, T6)
  - **Parallel Group**: Wave 1 (with T10, T11)
  - **Blocks**: T10, T40
  - **Blocked By**: T1, T5, T6

  **References**:
  - `.env.example` — Current template
  - T1 env spec — Complete variable list

  **Acceptance Criteria**:
  - [ ] `.env` created with all required variables
  - [ ] `.env.example` updated with all vars (placeholder values)
  - [ ] `.env` is in `.gitignore`, `git check-ignore .env` returns `.env`

  **QA Scenarios**:
  ```
  Scenario: Verify .env not tracked
    Tool: Bash (git)
    Preconditions: .env file exists
    Steps:
      1. git check-ignore .env
      2. Assert: returns ".env"
    Expected Result: .env is ignored
    Evidence: .omo/evidence/task-9-gitignore.log
  ```

  **Evidence to Capture**:
  - [ ] `.omo/evidence/task-9-gitignore.log`

  **Commit**: YES
  - Message: `chore: update .env.example with production variables`
  - Files: `.env.example`
  - Pre-commit: `grep -q 'SECRET\|PASSWORD\|KEY' .env.example && exit 1 || true`

- [x] 10. **Type-Safe Config Module (Env Validation at Startup)**

  **What to do**:
  - Create typed config module validating all env vars at startup
  - Edge Function version: `_shared/config.ts` — validates on module load
  - Frontend version: `src/lib/config.ts` — validates VITE_ prefixed vars
  - Use strict mode: missing required var throws ConfigError (fail fast)
  - Export typed config object (replace direct `process.env.X` usage)

  **Must NOT do**:
  - Do NOT import heavy deps in Edge Functions (keep bundle small)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Type design for multi-environment validation
  - **Skills**: none required

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T9, T11)
  - **Parallel Group**: Wave 1 (with T9, T11)
  - **Blocks**: T45-T48
  - **Blocked By**: T9

  **References**:
  - `_shared/redis.ts` — Existing shared module pattern
  - `src/lib/*.ts` — Frontend lib pattern

  **Acceptance Criteria**:
  - [ ] `_shared/config.ts` validates all env vars at module load
  - [ ] `src/lib/config.ts` validates VITE_ vars at startup
  - [ ] Missing required var throws clear ConfigError

  **QA Scenarios**:
  ```
  Scenario: Config module throws on missing required var
    Tool: Bash (npx tsx)
    Preconditions: Config module exists, missing var
    Steps:
      1. VITE_SUPABASE_URL="" npx tsx -e "import './src/lib/config.ts'"
      2. Assert: throws error with "VITE_SUPABASE_URL is required"
    Expected Result: Config validation catches missing vars
    Evidence: .omo/evidence/task-10-config-validation.log
  ```

  **Evidence to Capture**:
  - [ ] `.omo/evidence/task-10-config-validation.log`

  **Commit**: YES
  - Message: `feat: add type-safe config module with env validation`
  - Files: `_shared/config.ts`, `src/lib/config.ts`
  - Pre-commit: `npx tsx -e "import './src/lib/config.ts'"`

- [ ] 11. **Migration Replay on Staging (Verify Ordering)**

  **What to do**:
  - Reset staging DB: `supabase db reset --linked` (staging-linked)
  - Replay all 29 migrations in order
  - Verify: each migration completes without error
  - Run verification queries after replay

  **Must NOT do**:
  - Do NOT run against production

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Hands-on DB operations verification
  - **Skills**: none required

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T9, T10)
  - **Parallel Group**: Wave 1 (with T9, T10)
  - **Blocks**: T14
  - **Blocked By**: T5, T7, T4

  **References**:
  - `scripts/verify-migration-order.ts` — Ordering verification script (T4)
  - `supabase/migrations/*.sql` — All migrations

  **Acceptance Criteria**:
  - [ ] All 29 migrations replay successfully on staging
  - [ ] `supabase db remote commits` shows all migrations

  **QA Scenarios**:
  ```
  Scenario: Verify migrations applied on staging
    Tool: Bash (supabase CLI)
    Preconditions: Staging linked, migrations applied
    Steps:
      1. supabase db remote commits --project-ref <STAGING_REF> | wc -l
      2. ls supabase/migrations/*.sql | wc -l
      3. Assert: commit count == file count
    Expected Result: All 29 migrations applied on staging
    Evidence: .omo/evidence/task-11-staging-replay.log
  ```

  **Evidence to Capture**:
  - [ ] `.omo/evidence/task-11-staging-replay.log`

  **Commit**: NO (no code changes)

- [x] 12. **Feature Flag System Enhancement**

  **What to do**:
  - Create `src/lib/feature-flags.ts` with typed flag definitions
  - Support: boolean flags, env-based overrides, safe defaults (false)
  - Migrate all existing `VITE_ANA_SAHNE_ENABLED` references to use the module
  - Document pattern for adding new flags

  **Must NOT do**:
  - Do NOT add server-side flags (client-side only for now)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Well-scoped, clear pattern
  - **Skills**: none required

  **Parallelization**:
  - **Can Run In Parallel**: YES (Foundation, no infra dependency)
  - **Parallel Group**: Wave 1 (independent)
  - **Blocks**: T26, T30
  - **Blocked By**: None

  **References**:
  - `src/App.tsx` — Current flag usage
  - `import.meta.env.VITE_ANA_SAHNE_ENABLED` references

  **Acceptance Criteria**:
  - [ ] `src/lib/feature-flags.ts` created with typed definitions
  - [ ] All existing `VITE_ANA_SAHNE_ENABLED` references migrated
  - [ ] `hasFeature('ana-sahne')` returns correct value
  - [ ] Defaults to `false` when env var not set

  **QA Scenarios**:
  ```
  Scenario: Feature flag defaults to false
    Tool: Bash (npx tsx)
    Preconditions: Module created, env var NOT set
    Steps:
      1. unset VITE_ANA_SAHNE_ENABLED
      2. npx tsx -e "import { hasFeature } from './src/lib/feature-flags'; console.log(hasFeature('ana-sahne'));"
      3. Assert: prints "false"
    Expected Result: Feature flag safely defaults to false
    Evidence: .omo/evidence/task-12-feature-flag-default.log
  ```

  **Evidence to Capture**:
  - [ ] `.omo/evidence/task-12-feature-flag-default.log`

  **Commit**: YES
  - Message: `refactor: add centralized feature flag system`
  - Files: `src/lib/feature-flags.ts`, modified files
  - Pre-commit: `npm run build && npm run test`

### Wave 2: CD Pipeline (Parallel — deployment automation)

- [ ] 13. **GitHub Actions — Edge Function Deploy Workflow**

  **What to do**:
  - Create `.github/workflows/deploy-edge-functions.yml`
  - Trigger: push to `main` (with paths filter: `supabase/functions/**`)
  - Steps: checkout → setup supabase CLI → `supabase functions deploy` for each changed function
  - Support deploying all functions on first run, then incremental
  - Include: Supabase access token in GitHub secrets
  - Add validation step: run `npx tsc --noEmit` before deploy
  - Add rollback capability: allow manual trigger with function version tag

  **Must NOT do**:
  - Do NOT deploy all functions every time (deploy only changed)
  - Do NOT include secrets in workflow file — use GitHub secrets

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: CI/CD workflow design requiring knowledge of GitHub Actions + Supabase CLI
  - **Skills**: none required

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T14, T15, T16, T17)
  - **Parallel Group**: Wave 2 (with T14, T15, T16, T17)
  - **Blocks**: T20
  - **Blocked By**: T5, T8

  **References**:
  - `.github/workflows/ci.yml` — Existing CI workflow pattern
  - Supabase CLI: `supabase functions deploy`
  - GitHub Actions docs

  **Acceptance Criteria**:
  - [ ] Workflow file created at `.github/workflows/deploy-edge-functions.yml`
  - [ ] Dry run: `act -W .github/workflows/deploy-edge-functions.yml --dry-run` passes
  - [ ] Workflow validates TypeScript before deploying
  - [ ] Function names extracted from `supabase/functions/*/`

  **QA Scenarios**:
  ```
  Scenario: Verify workflow syntax
    Tool: Bash (act)
    Preconditions: Workflow file exists, act installed
    Steps:
      1. act -W .github/workflows/deploy-edge-functions.yml --dry-run
      2. Assert: exit code 0, no syntax errors
    Expected Result: Workflow YAML syntax is valid
    Evidence: .omo/evidence/task-13-workflow-syntax.log
  ```

  **Evidence to Capture**:
  - [ ] `.omo/evidence/task-13-workflow-syntax.log`

  **Commit**: YES
  - Message: `ci: add Edge Function deploy workflow`
  - Files: `.github/workflows/deploy-edge-functions.yml`
  - Pre-commit: `act -W .github/workflows/deploy-edge-functions.yml --dry-run`

- [ ] 14. **GitHub Actions — DB Migration Workflow (with Gate)**

  **What to do**:
  - Create `.github/workflows/deploy-migrations.yml`
  - Trigger: push to `main` (paths filter: `supabase/migrations/**`)
  - Stage 1: Run migration ordering verification script (from T4)
  - Stage 2: Push migrations to staging DB — `supabase db push --linked` (staging)
  - Stage 3: Run verification queries (RLS, triggers, functions)
  - Stage 4: MANUAL CONFIRMATION gate (GitHub Environments)
  - Stage 5: Push migrations to production DB
  - Stage 6: Run rollback script if verification fails at any stage
  - Use Supabase database branching if available (preview per PR)

  **Must NOT do**:
  - Do NOT auto-push to production (require manual gate)
  - Do NOT skip staging verification

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Complex multi-stage workflow with approval gates
  - **Skills**: none required

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T13, T15, T16, T17)
  - **Parallel Group**: Wave 2 (with T13, T15, T16, T17)
  - **Blocks**: T20
  - **Blocked By**: T8, T11

  **References**:
  - `scripts/verify-migration-order.ts` — Ordering verification (T4)
  - GitHub Environments docs: `https://docs.github.com/en/actions/deployment/targeting-different-environments`
  - Supabase CLI: `supabase db push`, `supabase db remote set`

  **Acceptance Criteria**:
  - [ ] Workflow created `.github/workflows/deploy-migrations.yml`
  - [ ] Dry run passes
  - [ ] Staging verification stage exists
  - [ ] Production stage has manual confirmation gate
  - [ ] Rollback stage exists on failure

  **QA Scenarios**:
  ```
  Scenario: Verify workflow has manual gate
    Tool: Bash (yq)
    Preconditions: Workflow file exists
    Steps:
      1. yq '.jobs.production.environment' .github/workflows/deploy-migrations.yml
      2. Assert: environment has 'required_reviewers' or 'wait' step
    Expected Result: Production deploy requires manual approval
    Evidence: .omo/evidence/task-14-gate-verified.log
  ```

  **Evidence to Capture**:
  - [ ] `.omo/evidence/task-14-gate-verified.log`

  **Commit**: YES
  - Message: `ci: add DB migration workflow with manual gate`
  - Files: `.github/workflows/deploy-migrations.yml`
  - Pre-commit: `act -W .github/workflows/deploy-migrations.yml --dry-run`

- [ ] 15. **GitHub Actions — Staging Deploy Workflow**

  **What to do**:
  - Create `.github/workflows/deploy-staging.yml`
  - Trigger: push to `develop` or PR to `main`
  - Steps: checkout → supabase link (staging) → deploy all EFs → push migrations
  - No manual gate needed (staging is safe)
  - Run E2E smoke tests after deploy
  - Notify on failure (Slack/email if configured)

  **Must NOT do**:
  - Do NOT deploy to production from staging workflow

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: CI/CD workflow design
  - **Skills**: none required

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T13, T14, T16, T17)
  - **Parallel Group**: Wave 2
  - **Blocks**: T20
  - **Blocked By**: T7

  **References**:
  - T13, T14 — Patterns for deploy workflows

  **Acceptance Criteria**:
  - [ ] `.github/workflows/deploy-staging.yml` created
  - [ ] Dry run passes
  - [ ] Smoke tests step included

  **QA Scenarios**: (similar to T13)

  **Commit**: YES — `ci: add staging deploy workflow`

- [ ] 16. **GitHub Actions — E2E Test Workflow**

  **What to do**:
  - Create `.github/workflows/e2e-tests.yml`
  - Trigger: push to `main` and PR to `main`
  - Setup: checkout → install deps → start mock server → run Playwright tests
  - Support: Chromium headless, video recording on failure
  - Upload test artifacts (screenshots, videos) on failure
  - Timeout: 15 minutes max
  - Block merge on failure (required check)

  **Must NOT do**:
  - Do NOT run E2E against production

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: E2E test infrastructure with Playwright
  - **Skills**: none required

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T13, T14, T15, T17)
  - **Parallel Group**: Wave 2
  - **Blocks**: T20
  - **Blocked By**: T21-T28 (test creation tasks)

  **References**:
  - Existing `.github/workflows/ci.yml` — Current crash test workflow
  - Playwright GitHub Action: `https://github.com/microsoft/playwright-github-action`

  **Acceptance Criteria**:
  - [ ] `.github/workflows/e2e-tests.yml` created
  - [ ] Dry run passes
  - [ ] Mock server starts in workflow
  - [ ] Artifact upload on failure configured

  **Commit**: YES — `ci: add E2E test workflow`

- [x] 17. **Vercel/Netlify Deploy Config (Frontend)**

  **What to do**:
  - Review CI (current crash-test workflow) — determine if frontend deploys anywhere
  - If Vercel/Netlify: add/update vercel.json or netlify.toml for builds
  - Configure: build command (`npm run build`), output dir (`dist/`), env vars
  - If no hosting yet: add configuration file so it's ready for deploy
  - Add preview deployments for PR branches

  **Must NOT do**:
  - Do NOT deploy without CD workflow (T13) being ready

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Configuration file creation
  - **Skills**: none required

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T13-T16)
  - **Parallel Group**: Wave 2
  - **Blocks**: T55
  - **Blocked By**: None

  **References**:
  - `package.json` — Build scripts
  - Existing deploy config (if any)

  **Acceptance Criteria**:
  - [ ] `vercel.json` or `netlify.toml` created (if not already present)
  - [ ] Build command works: `npm run build` → produces `dist/`

  **Commit**: YES — `chore: add frontend deploy configuration`

- [ ] 18. **Environment Promotion Script (Staging→Production)**

  **What to do**:
  - Create `scripts/promote-to-production.ts`
  - Logic: verify staging is healthy → tag staging deploy as release candidate → run full regression tests → on approval, promote to production
  - Include: migration diff check, Edge Function version consistency check
  - Dry-run mode: `--dry-run` flag

  **Must NOT do**:
  - Do NOT auto-promote without human approval

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Script with clear logic
  - **Skills**: none required

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T13-T17, T19)
  - **Parallel Group**: Wave 2
  - **Blocks**: T55
  - **Blocked By**: T13, T15

  **Acceptance Criteria**:
  - [ ] `scripts/promote-to-production.ts` created
  - [ ] `--dry-run` flag works
  - [ ] Verification steps included

  **Commit**: YES — `feat: add staging-to-production promotion script`

- [ ] 19. **Rollback Script (Migration Revert + EF Redeploy)**

  **What to do**:
  - Create `scripts/rollback.ts`
  - Logic: given a target migration version → revert migrations sequentially using DOWN blocks → redeploy previous Edge Function versions
  - Support: full rollback (to initial state) or partial (to specific version)
  - Include: pre-rollback DB snapshot (pg_dump), post-rollback verification
  - Dry-run mode

  **Must NOT do**:
  - Do NOT rollback without confirming data loss is acceptable

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Script with clear logic
  - **Skills**: none required

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T13-T18)
  - **Parallel Group**: Wave 2
  - **Blocks**: T55
  - **Blocked By**: T14

  **References**:
  - `supabase/migrations/*.sql` — DOWN blocks in migrations
  - PostgreSQL: `pg_dump`

  **Acceptance Criteria**:
  - [ ] `scripts/rollback.ts` created
  - [ ] Dry-run mode works
  - [ ] Pre-rollback snapshot step included

  **Commit**: YES — `feat: add rollback script with DB snapshot`

- [ ] 20. **CD Pipeline Crash Test (Dry-Run)**

  **What to do**:
  - Run all CD workflows in dry-run mode
  - Verify: every workflow parses, all steps are valid, permissions are correct
  - Check: secrets are referenced correctly (not inline), environment names match
  - Simulate: `act` or GitHub Actions workflow dispatch with `--dry-run`
  - Document any issues found and fix
  - Final: all CD workflows ready for real execution

  **Must NOT do**:
  - Do NOT trigger actual deploys (dry-run only)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Integration testing of all CD workflows together
  - **Skills**: none required

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on all CD workflows existing)
  - **Parallel Group**: After Wave 2 CD tasks
  - **Blocks**: T37
  - **Blocked By**: T13, T14, T15, T16

  **References**:
  - `.github/workflows/deploy-*.yml` — All CD workflows
  - GitHub docs: `https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions`

  **Acceptance Criteria**:
  - [ ] All CD workflows pass dry-run validation
  - [ ] No syntax errors
  - [ ] All secrets referenced correctly
  - [ ] Documentation of any issues and fixes

  **QA Scenarios**:
  ```
  Scenario: All CD workflows pass dry-run
    Tool: Bash (act)
    Preconditions: All workflow files exist
    Steps:
      1. for f in .github/workflows/deploy-*.yml; do act -W "$f" --dry-run || exit 1; done
      2. Assert: all workflows exit 0
    Expected Result: All deployment workflows are valid
    Evidence: .omo/evidence/task-20-cd-crash-test.log
  ```

  **Evidence to Capture**:
  - [ ] `.omo/evidence/task-20-cd-crash-test.log`

  **Commit**: NO (fixes applied within T13-T19 commits)

### Wave 3: Tests (Parallel — comprehensive test expansion)

- [ ] 21. **Mock Server Health Check + Test Utility Library**

  **What to do**:
  - Create `src/test-utils/` directory with shared test helpers
  - Mock server health check: script that verifies mock server is running and responsive
  - Test utilities: render helpers, mock data factories, auth context wrappers
  - Reusable mocks for: Edge Function responses, Redis responses, Supabase client
  - Create `src/test-utils/setup.ts` with vitest global setup
  - Verify mock server starts/stops cleanly in test hooks

  **Must NOT do**:
  - Do NOT mock what you don't own
  - Do NOT break existing mock server functionality

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Test infrastructure building with reusable utilities
  - **Skills**: none required

  **Parallelization**:
  - **Can Run In Parallel**: YES (foundation for all test tasks)
  - **Parallel Group**: Wave 3 (prerequisite for T22-T28)
  - **Blocks**: T22, T23, T24, T25, T26, T27, T28
  - **Blocked By**: None

  **References**:
  - `src/__tests__/` — Existing test patterns
  - `vitest.config.ts` — Test configuration
  - `scripts/audit/mock_server/` — Existing mock server

  **Acceptance Criteria**:
  - [ ] `src/test-utils/` created with setup.ts, factories.ts, mocks.ts
  - [ ] Mock server health check script created
  - [ ] Existing tests still pass after refactor

  **QA Scenarios**:
  ```
  Scenario: Test utilities import cleanly
    Tool: Bash (npx vitest)
    Preconditions: src/test-utils/ created
    Steps:
      1. npx vitest run src/test-utils/ --reporter=verbose
      2. Assert: exit code 0, no import errors
    Expected Result: Test utilities compile cleanly
    Evidence: .omo/evidence/task-21-test-utils.log
  ```

  **Evidence to Capture**:
  - [ ] `.omo/evidence/task-21-test-utils.log`

  **Commit**: YES
  - Message: `test: add test utility library and mock server health check`
  - Files: `src/test-utils/**`
  - Pre-commit: `npx vitest run`

- [ ] 22. **Unit Tests — Edge Functions (vitest)**

  **What to do**:
  - Add vitest unit tests for each critical Edge Function: blitz-settle-room, blitz-tick-order, blitz-matchmake, blitz-analytics-writer
  - Test: input validation, Redis interaction, DB writes, error handling, edge cases
  - Mock Redis and Supabase client for isolated testing
  - Cover: happy path, missing params, auth failure, timeout, concurrent access
  - Test files in `supabase/functions/*/__tests__/` directories
  - Target: ≥80% line coverage on critical functions

  **Must NOT do**:
  - Do NOT test external dependencies (mock them)
  - Do NOT deploy tests as Edge Functions

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Complex testing requiring deep understanding of Edge Function logic
  - **Skills**: none required

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T23, T24)
  - **Parallel Group**: Wave 3 (with T23, T24)
  - **Blocks**: T28, T29
  - **Blocked By**: T21

  **References**:
  - `supabase/functions/blitz-*/index.ts` — Critical function implementations
  - `scripts/audit/` — Existing audit test patterns
  - vitest docs: mocking, setup

  **Acceptance Criteria**:
  - [ ] Critical EF test files created: `blitz-settle-room`, `blitz-tick-order`, `blitz-matchmake`, `blitz-analytics-writer`
  - [ ] `npx vitest run supabase/functions/blitz-*/__tests__/` → PASS
  - [ ] ≥80% line coverage on each critical function

  **QA Scenarios**:
  ```
  Scenario: Critical EF unit tests pass
    Tool: Bash (npx vitest)
    Preconditions: Test files exist
    Steps:
      1. npx vitest run supabase/functions/blitz-*/__tests__/ --reporter=verbose
      2. Assert: exit code 0, all tests pass
      3. Assert: coverage report shows ≥80% for each function
    Expected Result: All critical EF tests pass with good coverage
    Evidence: .omo/evidence/task-22-ef-tests.log
  ```

  **Evidence to Capture**:
  - [ ] `.omo/evidence/task-22-ef-tests.log`

  **Commit**: YES — `test: add unit tests for critical Edge Functions`
  - Files: `supabase/functions/blitz-*/__tests__/*.test.ts`
  - Pre-commit: `npx vitest run supabase/functions/blitz-*/__tests__/ --reporter=verbose`

- [ ] 23. **Unit Tests — Hooks + Lib (vitest + @testing-library/react)**

  **What to do**:
  - Add vitest unit tests for all 12 custom hooks
  - Add vitest tests for 8 lib files (supabase client, api, utils, formatting)
  - Test: render hooks in test wrapper, assert state changes, mock context
  - Use `@testing-library/react` for hook rendering and state assertions
  - Cover: loading states, error states, empty data, normal data, cleanup
  - Target: ≥70% line coverage on hooks + lib

  **Must NOT do**:
  - Do NOT test implementation details (test behavior, not internals)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Hook testing requires understanding of React patterns and mocking
  - **Skills**: none required

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T22, T24)
  - **Parallel Group**: Wave 3 (with T22, T24)
  - **Blocks**: T28, T29
  - **Blocked By**: T21

  **References**:
  - `src/hooks/*.ts`, `src/lib/*.ts` — Source files to test
  - `@testing-library/react` docs: `renderHook`, `waitFor`

  **Acceptance Criteria**:
  - [ ] Test files for all 12 hooks and 8 lib modules
  - [ ] `npx vitest run src/hooks/ src/lib/` → PASS
  - [ ] ≥70% line coverage

  **Commit**: YES — `test: add unit tests for hooks and lib modules`

- [ ] 24. **Unit Tests — Pages + Components (vitest + @testing-library/react)**

  **What to do**:
  - Add vitest tests for key pages (BlitzRoom, Dashboard, Profile) and shared components
  - Use `@testing-library/react` with `render()` for component testing
  - Mock: auth context, feature flags, API responses
  - Test: rendering with different states, user interactions, conditional rendering
  - Target: ≥60% line coverage on pages + components

  **Must NOT do**:
  - Do NOT test every single component (focus on critical paths)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Component testing with complex mocking
  - **Skills**: none required

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T22, T23)
  - **Parallel Group**: Wave 3 (with T22, T23)
  - **Blocks**: T28, T29
  - **Blocked By**: T21

  **References**:
  - `src/pages/`, `src/components/` — Source files to test
  - `src/__tests__/` — Existing test patterns

  **Acceptance Criteria**:
  - [ ] Test files for BlitzRoom, Dashboard, Profile, and 3+ shared components
  - [ ] `npx vitest run src/pages/ src/components/` → PASS
  - [ ] ≥60% line coverage

  **Commit**: YES — `test: add unit tests for pages and components`

- [ ] 25. **Integration Tests — Auth Flow (Playwright)**

  **What to do**:
  - Create Playwright E2E tests for authentication flow
  - Test: login page renders → valid login → redirect to dashboard → invalid login → error shown → logout → redirect to login
  - Test: protected routes redirect to login when unauthenticated
  - Use mock server for auth (not real Supabase)
  - Capture screenshots at each step

  **Must NOT do**:
  - Do NOT test against production Supabase auth
  - Do NOT use real credentials

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: UI interaction testing with Playwright
  - **Skills**: none required

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T26, T27)
  - **Parallel Group**: Wave 3 (with T26, T27)
  - **Blocks**: T28, T29
  - **Blocked By**: T21

  **References**:
  - Existing auth pages: `src/pages/Login.tsx`, `src/pages/Dashboard.tsx`
  - Playwright docs: navigation, assertions, screenshots

  **Acceptance Criteria**:
  - [ ] Playwright auth test file: `e2e/auth.flow.spec.ts`
  - [ ] `npx playwright test e2e/auth.flow.spec.ts` → PASS
  - [ ] Screenshots captured for login, dashboard, error states

  **Commit**: YES — `test: add Playwright auth flow integration tests`

- [ ] 26. **Integration Tests — Blitz Trading Flow (Playwright)**

  **What to do**:
  - Create Playwright E2E tests for Blitz trading flow
  - Test: create room → join room → place order → see orderbook updates → match execution → room settlement
  - Use mock server for Blitz backend
  - Test: real-time updates via Presence/Realtime
  - Test: edge cases (empty orderbook, max positions, concurrent orders)
  - Capture screenshots at key UI states

  **Must NOT do**:
  - Do NOT test with real Supabase or Redis

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Complex UI interaction with real-time features
  - **Skills**: none required

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T25, T27)
  - **Parallel Group**: Wave 3 (with T25, T27)
  - **Blocks**: T28, T29
  - **Blocked By**: T21, T12

  **References**:
  - `src/pages/BlitzRoom.tsx` — Main Blitz trading UI
  - `scripts/audit/mock_server/` — Mock server for testing
  - T12 — Feature flags (Ana Sahne visibility)

  **Acceptance Criteria**:
  - [ ] Playwright Blitz test file: `e2e/blitz-trading.spec.ts`
  - [ ] `npx playwright test e2e/blitz-trading.spec.ts` → PASS
  - [ ] Covers: create room, join, order placement, matching, settlement

  **Commit**: YES — `test: add Playwright Blitz trading flow integration tests`

- [ ] 27. **Integration Tests — Settlement + Payout (curl + DB Assert)**

  **What to do**:
  - Create integration tests for settlement logic
  - Use Bash (curl) to invoke Edge Functions directly (bypassing UI)
  - Test: settle room → verify DB state → check payout distribution
  - Test: edge cases (draw/tie, single player, abandoned room)
  - Test: idempotency (settle twice → same result)
  - Assert: append-only ledger, correct RLS enforcement

  **Must NOT do**:
  - Do NOT test against production (staging or mock only)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Financial logic validation with DB assertions
  - **Skills**: none required

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T25, T26)
  - **Parallel Group**: Wave 3 (with T25, T26)
  - **Blocks**: T28, T29
  - **Blocked By**: T21, T5

  **References**:
  - `supabase/functions/blitz-settle-room/index.ts` — Settlement logic
  - `supabase/migrations/` — Settlement schema

  **Acceptance Criteria**:
  - [ ] Settlement test script: `scripts/tests/settlement.test.ts`
  - [ ] Covers: happy path, draw/tie, idempotency, RLS enforcement
  - [ ] `npx tsx scripts/tests/settlement.test.ts` → PASS

  **Commit**: YES — `test: add settlement and payout integration tests`

- [ ] 28. **E2E — Full User Journey (Playwright)**

  **What to do**:
  - Create a single comprehensive Playwright test covering the full user journey
  - Flow: register → login → view dashboard → create Blitz room → wait → join → place orders → watch matching → room settles → check payout history → logout
  - Use the mock server for all backend interactions
  - Capture video of the full run
  - Timeout: 60 seconds (generous for full flow)

  **Must NOT do**:
  - Do NOT skip steps (must be full end-to-end)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Comprehensive user journey testing
  - **Skills**: none required

  **Parallelization**:
  - **Can Run In Parallel**: YES (after all other test tasks)
  - **Parallel Group**: Wave 3 (final E2E integration)
  - **Blocks**: T29
  - **Blocked By**: T22, T23, T24, T25, T26, T27

  **References**:
  - All test files from T22-T27 — Individual flows to compose

  **Acceptance Criteria**:
  - [ ] `e2e/full-journey.spec.ts` created
  - [ ] `npx playwright test e2e/full-journey.spec.ts` → PASS (≤60s)
  - [ ] Video recording saved on successful completion

  **Commit**: YES — `test: add full user journey E2E test`

- [ ] 29. **Coverage Enforcement (vitest --coverage, ≥70% gate)**

  **What to do**:
  - Configure vitest to enforce coverage thresholds
  - Update `vitest.config.ts` with coverage config:
    - Branches: ≥60%, Functions: ≥70%, Lines: ≥70%, Statements: ≥70%
  - Add `--coverage` flag to test script in `package.json`
  - Add CI step to fail if coverage drops below thresholds
  - Run full test suite and verify thresholds pass

  **Must NOT do**:
  - Do NOT lower thresholds without explicit approval
  - Do NOT exclude files from coverage to game numbers

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Configuration change with clear verification
  - **Skills**: none required

  **Parallelization**:
  - **Can Run In Parallel**: YES (after individual test tasks)
  - **Parallel Group**: Wave 3 (final coverage enforcement)
  - **Blocks**: T55
  - **Blocked By**: T22, T23, T24, T25, T26, T27, T28

  **References**:
  - `vitest.config.ts` — Existing vitest config
  - `package.json` — Test scripts
  - vitest coverage docs: `https://vitest.dev/guide/coverage.html`

  **Acceptance Criteria**:
  - [ ] vitest coverage configured: lines ≥70%, functions ≥70%, branches ≥60%
  - [ ] `npm run test -- --coverage` → PASS (thresholds met)
  - [ ] CI coverage gate configured

  **QA Scenarios**:
  ```
  Scenario: Coverage thresholds pass
    Tool: Bash (npx vitest)
    Preconditions: All tests written, coverage configured
    Steps:
      1. npx vitest run --coverage --reporter=verbose
      2. Assert: exit code 0
      3. Assert: coverage output shows Lines ≥70%, Functions ≥70%
    Expected Result: Coverage thresholds met
    Evidence: .omo/evidence/task-29-coverage.log
  ```

  **Evidence to Capture**:
  - [ ] `.omo/evidence/task-29-coverage.log`

  **Commit**: YES
  - Message: `ci: enforce coverage thresholds (≥70% lines, ≥70% functions)`
  - Files: `vitest.config.ts`, `package.json`
  - Pre-commit: `npx vitest run --coverage`

- [ ] 30. **ErrorBoundary Component + Test**

  **What to do**:
  - Create `src/components/ErrorBoundary.tsx`:
    - Class component with `componentDidCatch` and `getDerivedStateFromError`
    - Displays user-friendly error UI (not raw stack trace in production)
    - Logs errors to console in dev, optionally to Sentry (when integrated in T40)
    - Props: `fallback` (custom UI), `onError` (callback)
  - Wrap root app in ErrorBoundary (in `App.tsx` or `main.tsx`)
  - Add vitest test: renders children normally, catches error, shows fallback
  - Add Playwright test: trigger error, verify fallback renders

  **Must NOT do**:
  - Do NOT expose stack traces to users in production

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Well-defined React pattern
  - **Skills**: none required

  **Parallelization**:
  - **Can Run In Parallel**: YES (independent)
  - **Parallel Group**: Wave 3 (with T22-T24)
  - **Blocks**: T55
  - **Blocked By**: T12 (feature flags for conditional behavior)

  **References**:
  - React docs: `https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary`
  - `src/App.tsx` — Where to integrate

  **Acceptance Criteria**:
  - [ ] `src/components/ErrorBoundary.tsx` created
  - [ ] App wrapped in ErrorBoundary in `App.tsx`
  - [ ] `npx vitest run src/components/ErrorBoundary` → PASS
  - [ ] `npx playwright test` with error trigger → PASS (fallback shown)

  **Commit**: YES — `feat: add ErrorBoundary component with tests`
  - Files: `src/components/ErrorBoundary.tsx`, `src/__tests__/ErrorBoundary.test.tsx`
  - Pre-commit: `npx vitest run`

### Wave 4: Security (Parallel — hardening)

- [ ] 31. **Rate Limiting — Supabase + Edge Function Layer**

  **What to do**:
  - Implement rate limiting on all public Edge Functions (HTTP-triggered)
  - Use Supabase's built-in rate limiting (if available) or implement token bucket in Edge Functions
  - Store rate limit state in Redis (with TTL auto-expiry)
  - Default limits: 100 req/min per IP, 10 req/min per auth user on sensitive endpoints
  - Return `429 Too Many Requests` with `Retry-After` header when exceeded
  - Add configuration env var: `RATE_LIMIT_RPM` (requests per minute, default 100)
  - Test: fire 120 requests in 10s → 100 succeed, 20 get 429

  **Must NOT do**:
  - Do NOT apply rate limiting to internal/DB-triggered functions
  - Do NOT use IP-based limiting alone (also key on user ID when authenticated)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Rate limiting design with Redis state management
  - **Skills**: none required

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T32, T33, T34)
  - **Parallel Group**: Wave 4 (with T32, T33, T34, T35)
  - **Blocks**: T37
  - **Blocked By**: T5

  **References**:
  - `supabase/functions/_shared/redis.ts` — Redis client for rate limit state
  - HTTP 429 spec: `https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/429`

  **Acceptance Criteria**:
  - [ ] Rate limiter implemented in `_shared/rate-limiter.ts`
  - [ ] All public HTTP Edge Functions wrapped with rate limiter
  - [ ] Returns 429 with Retry-After when exceeded
  - [ ] Configurable via env var

  **QA Scenarios**:
  ```
  Scenario: Rate limiter blocks excess requests
    Tool: Bash (curl + for loop)
    Preconditions: Edge Function deployed with rate limit 100/min
    Steps:
      1. for i in $(seq 1 120); do curl -s -o /dev/null -w "%{http_code}" $EF_URL; done > /tmp/status-codes.txt
      2. sort /tmp/status-codes.txt | uniq -c
      3. Assert: first 100 requests return 200, remaining 20 return 429
    Expected Result: Rate limiter correctly enforces 100 req/min limit
    Evidence: .omo/evidence/task-31-rate-limit.log
  ```

  **Evidence to Capture**:
  - [ ] `.omo/evidence/task-31-rate-limit.log`

  **Commit**: YES
  - Message: `feat: add rate limiting to public Edge Functions`
  - Files: `_shared/rate-limiter.ts`, modified EF files
  - Pre-commit: `npm run build`

- [ ] 32. **CORS Headers on All Public Edge Functions**

  **What to do**:
  - Create `_shared/cors.ts` with CORS header configuration
  - Apply to all HTTP-triggered Edge Functions (not DB/webhook triggers)
  - Headers: `Access-Control-Allow-Origin: *` (or configurable), `Access-Control-Allow-Methods: GET,POST,OPTIONS`, `Access-Control-Allow-Headers: Authorization, Content-Type`
  - Handle OPTIONS preflight requests properly
  - Add env var: `CORS_ORIGIN` (default `*` for dev, restrict in production)
  - Test with curl: OPTIONS request returns correct headers

  **Must NOT do**:
  - Do NOT allow credentials in CORS with wildcard origin (security issue)
  - Do NOT apply to internal functions (no CORS needed)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Well-known pattern, straightforward implementation
  - **Skills**: none required

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T31, T33, T34)
  - **Parallel Group**: Wave 4
  - **Blocks**: T37
  - **Blocked By**: T5

  **References**:
  - MDN CORS docs: `https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS`

  **Acceptance Criteria**:
  - [ ] `_shared/cors.ts` created
  - [ ] All public HTTP Edge Functions handle CORS
  - [ ] `curl -X OPTIONS` returns correct CORS headers
  - [ ] Configurable via `CORS_ORIGIN` env var

  **QA Scenarios**:
  ```
  Scenario: CORS headers returned on OPTIONS
    Tool: Bash (curl)
    Preconditions: EF deployed
    Steps:
      1. curl -s -X OPTIONS -i $EF_URL | grep -i 'access-control-'
      2. Assert: Access-Control-Allow-Origin header present
    Expected Result: CORS headers returned correctly
    Evidence: .omo/evidence/task-32-cors.log
  ```

  **Evidence to Capture**:
  - [ ] `.omo/evidence/task-32-cors.log`

  **Commit**: YES — `feat: add CORS headers to public Edge Functions`

- [ ] 33. **Redis Credentials Rotation + Vault/Secret Injection**

  **What to do**:
  - Rotate Redis credentials for production environment
  - Verify old credentials revoked after rotation
  - Implement secret injection pattern: read Redis credentials from env vars (not hardcoded)
  - Update `_shared/redis.ts` to use env vars with config module (T10)
  - Document rotation procedure in runbook (T56)
  - Test: deploy EF with new credentials, verify Redis connectivity

  **Must NOT do**:
  - Do NOT commit credentials to version control
  - Do NOT use the same credentials in staging and production

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Credential rotation with security implications
  - **Skills**: none required

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T31, T32, T34)
  - **Parallel Group**: Wave 4
  - **Blocks**: T37
  - **Blocked By**: T6

  **References**:
  - `_shared/redis.ts` — Current Redis connection
  - T10 — Config module for env var validation

  **Acceptance Criteria**:
  - [ ] Redis credentials rotated in production
  - [ ] Old credentials revoked
  - [ ] Connection test: new credentials work
  - [ ] `_shared/redis.ts` uses config module

  **Commit**: NO (involves secrets; do not commit credential changes)

- [ ] 34. **RLS Audit + Penetration Test**

  **What to do**:
  - Audit RLS policies on all tables in the production DB
  - Verify: every table has RLS enabled, policies correctly restrict access
  - Check for: missing policies, overly permissive policies (public access), incorrect role checks
  - Test with: anon key (should fail), service role (should pass), authenticated user (should pass their own data only)
  - SQL injection attempts on all public Edge Functions
  - Document findings and fix issues (strengthen policies if needed)

  **Must NOT do**:
  - Do NOT disable RLS on any table
  - Do NOT use `service_role` key in client-side code

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Security audit with SQL knowledge
  - **Skills**: none required

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T31, T32, T33)
  - **Parallel Group**: Wave 4
  - **Blocks**: T37
  - **Blocked By**: T5

  **References**:
  - `supabase/migrations/*.sql` — RLS policies in migrations
  - Supabase RLS docs: `https://supabase.com/docs/guides/auth/row-level-security`

  **Acceptance Criteria**:
  - [ ] RLS audit report: `omo/reports/rls-audit.md`
  - [ ] All tables with RLS enabled and policies verified
  - [ ] SQL injection tests: all fail (no data exposed)
  - [ ] Anon key: cannot read/write protected data
  - [ ] Any issues found and fixed

  **Commit**: YES — `fix: strengthen RLS policies based on audit findings`

- [ ] 35. **SQLCipher Key Remnant Scrub + Git History Cleanup**

  **What to do**:
  - Search git history for any remaining SQLCipher key references (from migration 0017 era)
  - Use `git log --all --diff-filter=A -- '*.ts' '*.sql' '*.env*'` to find committed secrets
  - If found: use `git filter-branch` or `bfg` to remove from history
  - Verify: `git log --all -S 'sqlcipher_key'` returns empty
  - Add pre-commit hook to prevent future secret commits (detect pattern)

  **Must NOT do**:
  - Do NOT force-push rewritten history without team coordination
  - Do NOT skip this step ("it was already rotated")

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Git history manipulation with security implications
  - **Skills**: none required

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T31-T34)
  - **Parallel Group**: Wave 4
  - **Blocks**: T36, T37
  - **Blocked By**: None

  **References**:
  - Git history cleanup docs: `https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository`
  - Migration 0017 area

  **Acceptance Criteria**:
  - [ ] `git log --all -S 'sqlcipher_key'` returns empty
  - [ ] No secrets in current HEAD
  - [ ] Pre-commit hook installed for secret detection

  **Commit**: NO (cleanup commits should be coordinated)

- [ ] 36. **Security Audit Scripts for CI (Leak Detector + SAST)**

  **What to do**:
  - Create `.github/workflows/security-audit.yml`
  - Add leak detection step: scan for secrets, API keys, tokens in code
  - Add SAST step: `grep` for dangerous patterns (`eval`, `exec`, `child_process`, SQL injection vulnerabilities)
  - Add dependency scan: `npm audit` or `snyk`
  - Add RLS verification: run query against staging DB to verify RLS is enabled
  - Fail pipeline on any finding

  **Must NOT do**:
  - Do NOT push findings to public logs
  - Do NOT add false-positive-heavy scanners

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: CI security workflow
  - **Skills**: none required

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T31-T35)
  - **Parallel Group**: Wave 4
  - **Blocks**: T37
  - **Blocked By**: T35

  **Acceptance Criteria**:
  - [ ] `.github/workflows/security-audit.yml` created
  - [ ] Leak detection step present
  - [ ] SAST pattern scanning step present
  - [ ] RLS verification step present
  - [ ] `act --dry-run` passes

  **Commit**: YES — `ci: add security audit workflow (leak detection + SAST)`

- [ ] 37. **Production Crash Test (redis-leak, concurrency-bomb, arbitrage-exploit)**

  **What to do**:
  - Run all 3 crash test audit scripts against the production (or staging) environment
  - `redis-leak-probe`: verify no Redis memory leak
  - `concurrency-bomb`: verify no race conditions under load
  - `arbitrage-exploit`: verify no arbitrage vulnerabilities
  - Record results in `.omo/evidence/`
  - Compare against existing results (mock server PASS); flag any new failures
  - If any test fails: document the issue and create remediation tasks

  **Must NOT do**:
  - Do NOT skip any of the 3 tests
  - Do NOT run against mock server only (must hit real/staging infrastructure)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Complex multi-test execution and analysis
  - **Skills**: none required

  **Parallelization**:
  - **Can Run In Parallel**: YES (after other Wave 4 tasks)
  - **Parallel Group**: Wave 4 (final integration)
  - **Blocks**: T55
  - **Blocked By**: T20, T31, T32, T33, T34, T36

  **References**:
  - `scripts/audit/redis-leak-probe/` — Redis leak test
  - `scripts/audit/concurrency-bomb/` — Concurrency test
  - `scripts/audit/arbitrage-exploit/` — Arbitrage test
  - `.omo/evidence/hard-audit/` — Previous results

  **Acceptance Criteria**:
  - [ ] All 3 audit scripts: **PASS** against staging/production
  - [ ] Results recorded in `.omo/evidence/`
  - [ ] Comparison report against previous mock server results

  **QA Scenarios**:
  ```
  Scenario: All 3 crash tests pass
    Tool: Bash (node)
    Preconditions: Environment ready, scripts exist
    Steps:
      1. node scripts/audit/redis-leak-probe/index.ts 2>&1 | tee /tmp/redis-leak.log
      2. node scripts/audit/concurrency-bomb/index.ts 2>&1 | tee /tmp/concurrency.log
      3. node scripts/audit/arbitrage-exploit/index.ts 2>&1 | tee /tmp/arbitrage.log
      4. Assert: all 3 exit with code 0, output shows PASS
    Expected Result: All production crash tests pass
    Evidence: .omo/evidence/task-37-crash-tests.log
  ```

  **Evidence to Capture**:
  - [ ] `.omo/evidence/task-37-crash-tests.log`

  **Commit**: YES (if issues found — documents fixes)
  - Message: `fix: resolve crash test failures in production`
  - Files: Fixes to issues found

- [ ] 38. **Security Headers (CSP, HSTS, X-Frame-Options)**

  **What to do**:
  - Configure security headers for the frontend deployment
  - Content-Security-Policy: restrict script sources, block inline scripts except nonce
  - Strict-Transport-Security: `max-age=31536000; includeSubDomains`
  - X-Frame-Options: `DENY` (prevent clickjacking)
  - X-Content-Type-Options: `nosniff`
  - Referrer-Policy: `strict-origin-when-cross-origin`
  - Add to: CD workflow (T13) as deploy-time headers, or platform config
  - Test with: `curl -I` to verify headers present
  - Document header choices and trade-offs

  **Must NOT do**:
  - Do NOT set overly restrictive CSP that breaks app functionality
  - Do NOT enable HSTS on localhost

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Configuration changes, well-understood security headers
  - **Skills**: none required

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T31-T36)
  - **Parallel Group**: Wave 4
  - **Blocks**: T55
  - **Blocked By**: T13

  **References**:
  - Security headers guide: `https://securityheaders.com/`
  - MDN CSP docs: `https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP`

  **Acceptance Criteria**:
  - [ ] Security headers configured on deployed frontend
  - [ ] `curl -I $FRONTEND_URL` returns CSP, HSTS, X-Frame-Options headers
  - [ ] App functionality not broken (no CSP violations)

  **QA Scenarios**:
  ```
  Scenario: Security headers present
    Tool: Bash (curl)
    Preconditions: Frontend deployed
    Steps:
      1. curl -s -I $FRONTEND_URL | grep -i 'content-security-policy\|strict-transport-security\|x-frame-options\|x-content-type-options'
      2. Assert: all 4 headers present
    Expected Result: Security headers configured
    Evidence: .omo/evidence/task-38-security-headers.log
  ```

  **Evidence to Capture**:
  - [ ] `.omo/evidence/task-38-security-headers.log`

  **Commit**: YES
  - Message: `feat: add security headers (CSP, HSTS, X-Frame-Options)`
  - Files: CD workflow / platform config
  - Pre-commit: `curl -I http://localhost:5173 | grep -i 'content-security-policy'`

### Wave 5: Observability (Parallel — instrumentation)

- [ ] 39. **Structured Logging Library for Edge Functions**

  **What to do**:
  - Create `_shared/logger.ts` for structured JSON logging in Edge Functions
  - Support log levels: DEBUG, INFO, WARN, ERROR (configurable via `LOG_LEVEL` env var)
  - Include: timestamp, function name, request ID, correlation ID, message, metadata
  - Each log entry: single JSON line (parsable by log aggregation tools)
  - Integrate with existing `log_observability()` RPC for persistent storage
  - Replace all `console.log()` in Edge Functions with structured logger
  - Update T50 (console.log removal) to reference this logger

  **Must NOT do**:
  - Do NOT log sensitive data (credentials, tokens, PII)
  - Do NOT use string concatenation — always structured JSON

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Logging library design with structured output
  - **Skills**: none required

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T40, T41)
  - **Parallel Group**: Wave 5 (with T40, T41, T42, T43)
  - **Blocks**: T44, T50
  - **Blocked By**: T5

  **References**:
  - `supabase/functions/_shared/` — Shared module pattern
  - Structured logging best practices

  **Acceptance Criteria**:
  - [ ] `_shared/logger.ts` created with structured JSON logging
  - [ ] Log levels: DEBUG, INFO, WARN, ERROR
  - [ ] Configurable via `LOG_LEVEL` env var
  - [ ] All Edge Functions have logger integrated

  **QA Scenarios**:
  ```
  Scenario: Logger produces valid JSON
    Tool: Bash (node)
    Preconditions: Logger module created
    Steps:
      1. node -e "const log = require('./_shared/logger'); log.info('test', { key: 'value' });" 2>&1 | head -1
      2. node -e "console.log(JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')))" 2>&1
      3. Assert: output is valid JSON with timestamp, level, message, metadata fields
    Expected Result: Logger produces parseable JSON with required fields
    Evidence: .omo/evidence/task-39-logger-output.log
  ```

  **Evidence to Capture**:
  - [ ] `.omo/evidence/task-39-logger-output.log`

  **Commit**: YES — `feat: add structured JSON logger for Edge Functions`
  - Files: `_shared/logger.ts`, modified EF files
  - Pre-commit: `npm run build`

- [ ] 40. **Sentry Integration (Frontend + Edge Functions)**

  **What to do**:
  - Create Sentry account/project for AI Magic Dash (if not exists)
  - Frontend: Add `@sentry/react` package, initialize in `main.tsx` with `Sentry.init()`
  - Configure: DSN from env var (`SENTRY_DSN`), environment name, release tag
  - Integrate with ErrorBoundary (T30) for automatic error capture
  - Edge Functions: Add `@sentry/serverless` or use Supabase Edge Runtime's fetch-based Sentry
  - Test: trigger a test error, verify it appears in Sentry dashboard
  - Set up alert: email/Slack on new error in production

  **Must NOT do**:
  - Do NOT send PII or sensitive data to Sentry (configure `beforeSend` hook)
  - Do NOT block on Sentry (app should work without it)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multi-environment error tracking setup
  - **Skills**: none required

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T39, T41)
  - **Parallel Group**: Wave 5
  - **Blocks**: T55
  - **Blocked By**: T9 (.env with SENTRY_DSN)

  **References**:
  - Sentry JS docs: `https://docs.sentry.io/platforms/javascript/`
  - T30 — ErrorBoundary integration point

  **Acceptance Criteria**:
  - [ ] `@sentry/react` installed and initialized in frontend
  - [ ] Test error appears in Sentry dashboard
  - [ ] ErrorBoundary (T30) reports errors to Sentry
  - [ ] `beforeSend` configured to strip PII

  **QA Scenarios**:
  ```
  Scenario: Sentry captures test error
    Tool: Playwright + Sentry dashboard check
    Preconditions: Sentry initialized, SENTRY_DSN set
    Steps:
      1. Navigate to page that triggers an error
      2. Wait 5s for Sentry to send event
      3. Check Sentry dashboard/API for new event
    Expected Result: Error captured in Sentry within 10s
    Evidence: .omo/evidence/task-40-sentry-test.log
  ```

  **Evidence to Capture**:
  - [ ] `.omo/evidence/task-40-sentry-test.log`

  **Commit**: YES
  - Message: `feat: add Sentry error tracking (frontend + Edge Functions)`
  - Files: `package.json`, `src/main.tsx`, `_shared/sentry.ts`
  - Pre-commit: `npm run build`

- [ ] 41. **Health Check Endpoint on All Critical Edge Functions**

  **What to do**:
  - Add `GET /health` handler to each critical Edge Function: blitz-settle-room, blitz-tick-order, blitz-matchmake, blitz-analytics-writer
  - Health check returns: `{"status":"ok","timestamp":"...","version":"...","uptime":...}`
  - Also check dependencies: Redis connectivity, DB connectivity (lightweight query)
  - Return 200 if healthy, 503 if degraded
  - Create `_shared/health.ts` with shared health check logic
  - Create a meta health endpoint in a new utility EF that aggregates all EF health

  **Must NOT do**:
  - Do NOT expose internal details in health check response
  - Do NOT make health check endpoints rate-limited (exclude from T31)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple endpoint, shared pattern
  - **Skills**: none required

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T39, T40, T42)
  - **Parallel Group**: Wave 5
  - **Blocks**: T42, T44
  - **Blocked By**: T5

  **References**:
  - Kubernetes liveness/readiness probe pattern
  - `_shared/redis.ts` — Redis connectivity check

  **Acceptance Criteria**:
  - [ ] `_shared/health.ts` created with shared health logic
  - [ ] All critical Edge Functions have /health endpoint
  - [ ] `curl $EF_URL/health` returns 200 with `{"status":"ok"}`
  - [ ] Health check verifies Redis + DB connectivity

  **QA Scenarios**:
  ```
  Scenario: Health endpoint returns ok
    Tool: Bash (curl)
    Preconditions: EF deployed with health endpoint
    Steps:
      1. curl -s $EF_URL/health
      2. Assert: response contains "status":"ok"
      3. Assert: response includes timestamp and version fields
    Expected Result: Health check returns correct status
    Evidence: .omo/evidence/task-41-health-check.log
  ```

  **Evidence to Capture**:
  - [ ] `.omo/evidence/task-41-health-check.log`

  **Commit**: YES — `feat: add health check endpoints to critical Edge Functions`

- [ ] 42. **Observability Dashboard (Supabase + Custom)**

  **What to do**:
  - Build a simple observability dashboard page in the frontend
  - Show: Edge Function health status (from T41), recent errors (from Sentry/T40 last 24h), test results, system metrics
  - Use `log_observability()` RPC data for historical views
  - Accessible at `/ops/observability` (protected by admin role)
  - Auto-refresh every 30 seconds
  - Status indicators: green (ok), yellow (degraded), red (down)

  **Must NOT do**:
  - Do NOT expose observability data to non-admin users
  - Do NOT make it the primary error dashboard (Sentry is primary)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: UI dashboard with real-time data
  - **Skills**: none required

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T39, T40, T41)
  - **Parallel Group**: Wave 5
  - **Blocks**: T55
  - **Blocked By**: T39, T41, T44

  **References**:
  - `src/pages/` — Page creation pattern
  - T12 — Feature flags for access control
  - Existing `log_observability()` RPC

  **Acceptance Criteria**:
  - [ ] `/ops/observability` page created
  - [ ] Shows: EF health, recent errors, system metrics
  - [ ] Auto-refresh works
  - [ ] Admin-only access enforced

  **Commit**: YES — `feat: add observability dashboard page`

- [ ] 43. **Alert Configuration (Sentry + Slack/Email)**

  **What to do**:
  - Configure Sentry alert rules for production
  - Alerts: new error (instant), error spike (>10 in 5min), critical error type
  - Configure notification channel: Slack webhook or email
  - Create runbook entry (T56): how to respond to each alert type
  - Test: trigger an alert, verify notification received

  **Must NOT do**:
  - Do NOT configure alerts for staging (noise)
  - Do NOT set alert thresholds too low (alert fatigue)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Configuration, not code
  - **Skills**: none required

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T39-T42)
  - **Parallel Group**: Wave 5
  - **Blocks**: T56
  - **Blocked By**: T40

  **Acceptance Criteria**:
  - [ ] Sentry alerts configured for production
  - [ ] Slack/email notification working
  - [ ] Test alert received

  **Commit**: NO (config-only; document in runbook)

- [ ] 44. **log_observability() RPC Call Standardization**

  **What to do**:
  - Audit all existing `log_observability()` RPC calls across Edge Functions
  - Ensure consistent call pattern: all functions call it the same way with same params
  - Standardize: required fields (event, user_id, metadata), timing, error handling
  - Add call to functions that are missing observability logging
  - Ensure async, non-blocking — observability should never block core logic
  - Add fallback: if RPC fails, log to structured logger (T39) instead of crashing

  **Must NOT do**:
  - Do NOT make observability calls synchronous (fire-and-forget)
  - Do NOT log to observability before critical operations complete

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Pattern standardization across multiple files
  - **Skills**: none required

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T39-T43)
  - **Parallel Group**: Wave 5
  - **Blocks**: T42
  - **Blocked By**: T39

  **References**:
  - All EF files using `log_observability()` — Find via grep
  - T39 — Structured logger fallback

  **Acceptance Criteria**:
  - [ ] All Edge Functions call `log_observability()` consistently
  - [ ] Required fields present in every call
  - [ ] Async, non-blocking pattern used everywhere
  - [ ] Fallback to structured logger on RPC failure

  **Commit**: YES — `refactor: standardize log_observability() calls across Edge Functions`

### Wave 6: Hardening (Parallel — code quality)

- [ ] 45. **`as any` Elimination — Lib Files**

  **What to do**:
  - Find all `as any` casts in `src/lib/` files
  - For each: determine the correct type and replace with proper type assertion
  - If type is complex: extract interface or type alias, then use proper cast
  - If truly dynamic: use `unknown` first, then narrow with type guards
  - Verify: `npx tsc --noEmit` passes with strict mode
  - Run existing tests to confirm no regressions

  **Must NOT do**:
  - Do NOT use `@ts-ignore` as escape hatch
  - Do NOT add `as any` to suppress type errors (must fix properly)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Type-narrowing work requiring understanding of codebase types
  - **Skills**: none required

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T46, T47, T48, T49)
  - **Parallel Group**: Wave 6 (with T46, T47, T48, T49)
  - **Blocks**: T55
  - **Blocked By**: T10

  **References**:
  - `src/lib/*.ts` — Target files
  - T10 — Config module for proper env var types

  **Acceptance Criteria**:
  - [ ] Zero `as any` in `src/lib/` files
  - [ ] `npx tsc --noEmit` passes
  - [ ] All existing tests pass

  **QA Scenarios**:
  ```
  Scenario: No as any in lib files
    Tool: Bash (grep)
    Preconditions: Fixes applied
    Steps:
      1. grep -rn 'as any' src/lib/ --include='*.ts' --include='*.tsx'
      2. Assert: empty (no matches)
      3. npx tsc --noEmit
      4. Assert: exit code 0
    Expected Result: Zero as any casts in lib files
    Evidence: .omo/evidence/task-45-lib-typesafe.log
  ```

  **Evidence to Capture**:
  - [ ] `.omo/evidence/task-45-lib-typesafe.log`

  **Commit**: YES (group with T46-T49)
  - Message: `refactor: eliminate as any casts in lib files`

- [ ] 46. **`as any` Elimination — Hooks**

  **What to do**:
  - Find all `as any` casts in `src/hooks/` files
  - Replace with proper types, type guards, or `unknown` narrowing
  - Extract shared types if same pattern appears in multiple hooks
  - Verify: `npx tsc --noEmit` passes

  **Must NOT do**:
  - Same constraints as T45

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Same as T45
  - **Skills**: none required

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T45, T47, T48, T49)
  - **Parallel Group**: Wave 6
  - **Blocks**: T55
  - **Blocked By**: T10

  **Acceptance Criteria**:
  - [ ] Zero `as any` in `src/hooks/`
  - [ ] `npx tsc --noEmit` passes

  **Commit**: YES (with T45-T49 group) — `refactor: eliminate as any casts in hooks`

- [ ] 47. **`as any` Elimination — Pages**

  **What to do**:
  - Find all `as any` casts in `src/pages/` files  
  - Same approach as T45: proper types, unknown narrowing, type guards
  - Verify: `npx tsc --noEmit` passes

  **Must NOT do**:
  - Same constraints as T45

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Same as T45
  - **Skills**: none required

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T45, T46, T48, T49)
  - **Parallel Group**: Wave 6
  - **Blocks**: T55
  - **Blocked By**: T10

  **Acceptance Criteria**:
  - [ ] Zero `as any` in `src/pages/`
  - [ ] `npx tsc --noEmit` passes

  **Commit**: YES (with T45-T49 group) — `refactor: eliminate as any casts in pages`

- [ ] 48. **`as any` Elimination — Edge Functions**

  **What to do**:
  - Find all `as any` casts in `supabase/functions/` files
  - Same approach as T45
  - Pay special attention to `admin` parameter in settleRoom (Metis finding)
  - Verify: `npx tsc --noEmit` passes

  **Must NOT do**:
  - Same constraints as T45

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Same as T45
  - **Skills**: none required

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T45, T46, T47, T49)
  - **Parallel Group**: Wave 6
  - **Blocks**: T55
  - **Blocked By**: T10

  **References**:
  - `supabase/functions/blitz-settle-room/index.ts` — admin typed as `any`
  - `supabase/functions/*/index.ts` — Other as any occurrences

  **Acceptance Criteria**:
  - [ ] Zero `as any` in `supabase/functions/`
  - [ ] `npx tsc --noEmit` passes

  **Commit**: YES (with T45-T49 group) — `refactor: eliminate as any casts in Edge Functions`

- [ ] 49. **Admin Type Safety (settleRoom admin param)**

  **What to do**:
  - Specifically fix the `admin` parameter typed as `any` in `blitz-settle-room/index.ts`
  - Create proper `Admin` type in `_shared/blitz-types.ts`
  - Type should include: `id`, `role`, `profile_id`, and any other fields used
  - Update the settleRoom function signature and all call sites
  - Verify: type-safe access to admin properties

  **Must NOT do**:
  - Do NOT widen the type to include unnecessary fields

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Critical type safety fix for financial logic
  - **Skills**: none required

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T45, T46, T47, T48)
  - **Parallel Group**: Wave 6
  - **Blocks**: T55
  - **Blocked By**: T10, T3

  **References**:
  - `supabase/functions/blitz-settle-room/index.ts` — Source
  - `supabase/functions/_shared/blitz-types.ts` — Type definitions
  - T3 — Dependency map (identifies call sites)

  **Acceptance Criteria**:
  - [ ] `Admin` type defined in `_shared/blitz-types.ts`
  - [ ] settleRoom uses typed admin parameter
  - [ ] All call sites updated
  - [ ] `npx tsc --noEmit` passes
  - [ ] Settlement crash test still passes

  **Commit**: YES (with T45-T48 group)
  - Message: `fix: add proper Admin type to settleRoom (was any)`
  - Files: `_shared/blitz-types.ts`, `blitz-settle-room/index.ts`

- [ ] 50. **Console.log Removal + Logger Integration**

  **What to do**:
  - Find all `console.log()` statements in production code (src/ and supabase/functions/)
  - For each:
    - In Edge Functions: replace with structured logger (T39) call
    - In frontend: if debugging-only, remove; if important, replace with `console.info()` or structured logging
    - In test files: OK to keep (tests need stdout)
  - Add ESLint rule: `no-console` warning in production code
  - Verify: zero `console.log()` in production code (except test files)

  **Must NOT do**:
  - Do NOT remove console statements from test files
  - Do NOT replace with empty functions (either remove or use proper logger)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Pattern-based replacement
  - **Skills**: none required

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T45-T49, T51)
  - **Parallel Group**: Wave 6 (with T45-T54)
  - **Blocks**: T55
  - **Blocked By**: T39

  **References**:
  - T39 — Structured logger module

  **Acceptance Criteria**:
  - [ ] Zero `console.log()` in src/ and supabase/functions/ (non-test)
  - [ ] ESLint `no-console` rule configured
  - [ ] `npm run lint` passes

  **Commit**: YES — `refactor: replace console.log with structured logger`

- [ ] 51. **Unused Import/Variable Cleanup**

  **What to do**:
  - Run `npx tsc --noEmit` and fix all unused import/variable warnings
  - Run ESLint with `no-unused-vars` rule
  - Remove dead code paths detected by TypeScript
  - Verify: no warnings on TypeScript compilation
  - Add lint step to CI

  **Must NOT do**:
  - Do NOT remove imports that are used for side effects (e.g., `import 'module'`)
  - Do NOT remove types used only at compile time (TS will handle this)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Tool-driven cleanup
  - **Skills**: none required

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T45-T50, T52-T54)
  - **Parallel Group**: Wave 6
  - **Blocks**: T55
  - **Blocked By**: None

  **References**:
  - `tsconfig.json` — TypeScript config
  - ESLint or biome config

  **Acceptance Criteria**:
  - [ ] `npx tsc --noEmit` produces zero warnings
  - [ ] `npm run lint` passes with zero errors
  - [ ] CI includes lint step

  **Commit**: YES — `refactor: remove unused imports and variables`

- [ ] 52. **Blitz Settlement Timestamp Fix (order_timestamp() RPC)**

  **What to do**:
  - In `blitz-settle-room/index.ts`: replace `new Date().toISOString()` with `order_timestamp()` RPC call
  - The RPC ensures server-authoritative timestamp (cannot be client-influenced)
  - Update all references to settlement timestamp to use the RPC value
  - Verify: settlement records show correct chronological order
  - Test: concurrent settlements get correct timestamps

  **Must NOT do**:
  - Do NOT use client-side timestamps for any settlement operation
  - Do NOT change the existing timestamp value format (ISO 8601)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Targeted fix for known Metis finding
  - **Skills**: none required

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T45-T51, T53-T54)
  - **Parallel Group**: Wave 6
  - **Blocks**: T55
  - **Blocked By**: T3

  **References**:
  - `supabase/functions/blitz-settle-room/index.ts` — Current `new Date().toISOString()`
  - `order_timestamp()` RPC — Server-authoritative timestamp function
  - Metis finding: timestamp injection risk

  **Acceptance Criteria**:
  - [ ] `blitz-settle-room` uses `order_timestamp()` RPC instead of `new Date()`
  - [ ] Settlement records have server-authoritative timestamps
  - [ ] Settlement crash test still passes
  - [ ] No client-timestamp influenced ordering

  **QA Scenarios**:
  ```
  Scenario: Settlement uses server timestamp
    Tool: Bash (grep + supabase db query)
    Preconditions: Fix applied
    Steps:
      1. grep -n 'toISOString' supabase/functions/blitz-settle-room/index.ts
      2. Assert: no match (new Date().toISOString removed)
      3. supabase db query "SELECT settle_ts FROM settlement_ledger LIMIT 1" 
      4. Assert: timestamp is NOT null and IS within expected range
    Expected Result: Server-authoritative timestamps used
    Evidence: .omo/evidence/task-52-timestamp-fix.log
  ```

  **Evidence to Capture**:
  - [ ] `.omo/evidence/task-52-timestamp-fix.log`

  **Commit**: YES
  - Message: `fix: use order_timestamp() RPC instead of new Date() in settleRoom`
  - Files: `supabase/functions/blitz-settle-room/index.ts`
  - Pre-commit: `npx tsx scripts/audit/concurrency-bomb/index.ts` (verify no regression)

- [ ] 53. **Waiting Room Timeout Cleanup (Phase 2 Leftover)**

  **What to do**:
  - Audit current waiting room behavior: what happens when a player doesn't join?
  - Check: blitz-matchmake for timeout logic, Redis key TTL for room state
  - Ensure: unjoined rooms expire after timeout (configurable, ~5min default)
  - Ensure: players are notified when opponent doesn't show
  - Add: cleanup cron or check in matchmake for stale waiting rooms
  - Test: create waiting room → wait for timeout → verify room cleaned up

  **Must NOT do**:
  - Do NOT change existing game room mechanics (only waiting state)
  - Do NOT introduce breaking changes to room creation flow

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Targeted cleanup for known Phase 2 leftover
  - **Skills**: none required

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T45-T52, T54)
  - **Parallel Group**: Wave 6
  - **Blocks**: T55
  - **Blocked By**: T3

  **References**:
  - `supabase/functions/blitz-matchmake/index.ts` — Matchmaking logic
  - Phase 2 completion report (blitz-phase-2-complete.md)

  **Acceptance Criteria**:
  - [ ] Stale waiting rooms cleaned up after timeout
  - [ ] Timeout configurable via env var
  - [ ] Test: room cleaned within timeout + 30s grace period

  **Commit**: YES — `feat: add waiting room timeout cleanup`

- [ ] 54. **TypeScript Strict Mode Enablement**

  **What to do**:
  - Enable `strict: true` in `tsconfig.json` and `supabase/functions/tsconfig.json`
  - Fix all new type errors revealed by strict mode
  - Common issues: strict null checks, no implicit any, strict function types
  - If too many errors: enable strict incrementally (`strictNullChecks` first, then others)
  - Verify: `npx tsc --noEmit` passes with strict mode

  **Must NOT do**:
  - Do NOT add `// @ts-nocheck` to bypass strict mode
  - Do NOT revert to non-strict after enabling

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Configuration + systematic fixes
  - **Skills**: none required

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T45-T53)
  - **Parallel Group**: Wave 6 (final hardening)
  - **Blocks**: T55
  - **Blocked By**: T45, T46, T47, T48, T49 (as any cleanup must happen first)

  **References**:
  - `tsconfig.json` — Frontend TS config
  - `supabase/functions/tsconfig.json` — EF TS config
  - TypeScript strict mode docs: `https://www.typescriptlang.org/tsconfig/#strict`

  **Acceptance Criteria**:
  - [ ] `strict: true` in both tsconfig files
  - [ ] `npx tsc --noEmit` passes
  - [ ] `npm run build` succeeds
  - [ ] `npm run test` passes

  **QA Scenarios**:
  ```
  Scenario: TypeScript strict mode passes
    Tool: Bash (npx tsc)
    Preconditions: strict: true configured
    Steps:
      1. npx tsc --noEmit
      2. Assert: exit code 0, zero errors
      3. npm run build
      4. Assert: build succeeds
    Expected Result: TypeScript strict mode enabled without errors
    Evidence: .omo/evidence/task-54-strict-mode.log
  ```

  **Evidence to Capture**:
  - [ ] `.omo/evidence/task-54-strict-mode.log`

  **Commit**: YES
  - Message: `chore: enable TypeScript strict mode`
  - Files: `tsconfig.json`, `supabase/functions/tsconfig.json`
  - Pre-commit: `npx tsc --noEmit && npm run build`

### Wave 7: Documentation + Handover (Sequential)

- [ ] 55. **Production Readiness Checklist Sign-Off**

  **What to do**:
  - Review the Definition of Done checklist from this plan
  - For each item: verify it's complete with evidence
  - Create `.omo/reports/readiness-signoff.md` with:
    - All checklist items with PASS/FAIL status
    - Evidence references (links to .omo/evidence/ files)
    - Known issues (items not yet complete with remediation plan)
    - Final verdict: READY / NOT READY for production
  - Present to team/PO for review and approval

  **Must NOT do**:
  - Do NOT mark items PASS without verification
  - Do NOT skip sign-off even if all items pass

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Comprehensive review of all prior work
  - **Skills**: none required

  **Parallelization**:
  - **Can Run In Parallel**: NO (Wave 7 is sequential)
  - **Parallel Group**: Wave 7 (after all hardening tasks)
  - **Blocks**: T56
  - **Blocked By**: T16, T17, T18, T19, T29, T30, T37, T38, T40, T42, T43, T45-T54

  **References**:
  - Definition of Done from this plan
  - `.omo/evidence/` — All evidence files

  **Acceptance Criteria**:
  - [ ] `.omo/reports/readiness-signoff.md` created
  - [ ] All DoD items have PASS/FAIL with evidence
  - [ ] Known issues documented with remediation
  - [ ] Final verdict documented

  **Commit**: YES — `docs: add production readiness sign-off report`
  - Files: `.omo/reports/readiness-signoff.md`

- [ ] 56. **Runbook (Incident Response, Rollback, Monitoring)**

  **What to do**:
  - Create `.omo/reports/runbook.md` covering:
    - Incident response: how to identify, triage, escalate
    - Rollback procedure: step-by-step for DB + Edge Functions (from T19)
    - Monitoring: what to watch in Sentry, health checks, dashboard
    - Alert response: for each alert type (T43), what to do
    - Contact list: who to notify for different severity levels
    - Post-mortem process

  **Must NOT do**:
  - Do NOT include secrets or credentials
  - Do NOT skip the incident response section

  **Recommended Agent Profile**:
  - **Category**: `writing`
    - Reason: Operations documentation
  - **Skills**: none required

  **Parallelization**:
  - **Can Run In Parallel**: NO (Wave 7 sequential)
  - **Parallel Group**: Wave 7
  - **Blocks**: T57
  - **Blocked By**: T55

  **Acceptance Criteria**:
  - [ ] `.omo/reports/runbook.md` created with all required sections
  - [ ] Incident response section: identification, triage, escalation, severity levels
  - [ ] Rollback procedure: DB revert steps, EF redeploy steps
  - [ ] Alert response: one paragraph per alert type (from T43)
  - [ ] Monitoring: Sentry, health checks, dashboard URL
  - [ ] Contact list: roles (not names) to notify per severity
  - [ ] Post-mortem process documented

  **QA Scenarios**:
  ```
  Scenario: Runbook contains all required sections
    Tool: Bash (grep)
    Preconditions: .omo/reports/runbook.md exists
    Steps:
      1. grep -c '^## ' .omo/reports/runbook.md
      2. grep -i 'incident\|rollback\|monitoring\|alert\|escalat\|post-mortem' .omo/reports/runbook.md
      3. Assert: each section heading from requirements is present
    Expected Result: All runbook sections are documented
    Evidence: .omo/evidence/task-56-runbook-sections.log
  ```

  **Evidence to Capture**:
  - [ ] `.omo/evidence/task-56-runbook-sections.log`

  **Commit**: YES — `docs: add production runbook`

- [ ] 57. **Architecture Decision Records (ADRs)**

  **What to do**:
  - Create `.omo/reports/adr/` directory
  - Write ADRs for key architectural decisions:
    - ADR-001: Supabase as primary DB (existing decision)
    - ADR-002: Upstash Redis for caching/state (existing)
    - ADR-003: Server-authoritative execution pattern
    - ADR-004: Settlement ledger append-only design
    - ADR-005: Feature flag strategy (VITE_ANA_SAHNE_ENABLED pattern)
    - ADR-006: CD pipeline architecture (this plan)
  - Each ADR: title, status, context, decision, consequences

  **Must NOT do**:
  - Do NOT ADR trivial decisions
  - Do NOT change ADR status to "accepted" without review

  **Recommended Agent Profile**:
  - **Category**: `writing`
    - Reason: Technical documentation
  - **Skills**: none required

  **Parallelization**:
  - **Can Run In Parallel**: NO (Wave 7 sequential)
  - **Parallel Group**: Wave 7
  - **Blocks**: T58
  - **Blocked By**: T56

  **Acceptance Criteria**:
  - [ ] `.omo/reports/adr/` directory created with ADR-001 through ADR-006
  - [ ] Each ADR has: title, status, context, decision, consequences
  - [ ] Status set to "accepted" (existing) or "proposed" (new)
  - [ ] Commit message references ADR numbers

  **QA Scenarios**:
  ```
  Scenario: All 6 ADRs exist with proper structure
    Tool: Bash (grep + ls)
    Preconditions: ADR directory exists
    Steps:
      1. ls .omo/reports/adr/ADR-*.md | wc -l
      2. Assert: 6 ADR files exist
      3. For each ADR: grep -c '^## \(Title\|Status\|Context\|Decision\|Consequences\)' $file
      4. Assert: each ADR has all 5 required sections
    Expected Result: All 6 ADRs present with required structure
    Evidence: .omo/evidence/task-57-adrs.log
  ```

  **Evidence to Capture**:
  - [ ] `.omo/evidence/task-57-adrs.log`

  **Commit**: YES — `docs: add architecture decision records`

- [ ] 58. **Environment Setup Guide (For New Devs)**

  **What to do**:
  - Update/create `SETUP.md` with step-by-step instructions for new developers
  - Cover: prerequisites (Node, Supabase CLI, Docker), clone, install deps, configure .env, run migrations, start dev server, run tests
  - Include: troubleshooting section (common issues and fixes)
  - Add: environment comparison (local vs staging vs production)
  - Reference: runbook (T56) for operational tasks

  **Must NOT do**:
  - Do NOT include actual secrets (use placeholder values)
  - Do NOT skip troubleshooting section

  **Recommended Agent Profile**:
  - **Category**: `writing`
    - Reason: Developer documentation
  - **Skills**: none required

  **Parallelization**:
  - **Can Run In Parallel**: NO (Wave 7 sequential)
  - **Parallel Group**: Wave 7
  - **Blocks**: T59
  - **Blocked By**: T57

  **Acceptance Criteria**:
  - [ ] `SETUP.md` exists and is readable in under 5 minutes by a new developer
  - [ ] Covers: prerequisites, clone, install, configure .env, run migrations, dev server, test suite
  - [ ] Troubleshooting section covers ≥5 common issues
  - [ ] Environment comparison table: local vs staging vs production
  - [ ] References runbook (T56) for operational tasks

  **QA Scenarios**:
  ```
  Scenario: SETUP.md contains all required sections
    Tool: Bash (grep)
    Preconditions: SETUP.md exists
    Steps:
      1. grep -c '^## ' SETUP.md
      2. grep -i 'prerequisites\|install\|configure\|\.env\|migration\|test\|troubleshoot' SETUP.md
      3. Assert: each required section heading is present
      4. grep -i 'local.*staging.*production\|environment comparison' SETUP.md
      5. Assert: environment comparison table exists
    Expected Result: Setup guide is complete and covers all environments
    Evidence: .omo/evidence/task-58-setup-guide.log
  ```

  **Evidence to Capture**:
  - [ ] `.omo/evidence/task-58-setup-guide.log`

  **Commit**: YES — `docs: add environment setup guide for new developers`

- [ ] 59. **Final Crash Test Suite Run Against Production**

  **What to do**:
  - Run the full crash test suite against the production environment
  - Tests: redis-leak-probe, concurrency-bomb, arbitrage-exploit (same as T37)
  - Also run: npm run build, npm run test (coverage gate), npm run lint
  - Also run: CD pipeline dry-run, CD pipeline full (against staging)
  - Verify: crash test audit scripts PASS against production
  - Record all results in `.omo/evidence/final/`
  - If anything fails: document as known issue in readiness sign-off (T55)

  **Must NOT do**:
  - Do NOT skip any test even if "they passed before"
  - Do NOT deploy to production if crash tests fail

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Final comprehensive verification
  - **Skills**: none required

  **Parallelization**:
  - **Can Run In Parallel**: NO (Wave 7 final)
  - **Parallel Group**: Wave 7 (last task)
  - **Blocks**: F1-F4
  - **Blocked By**: T55, T56, T57, T58

  **References**:
  - `scripts/audit/` — All audit scripts
  - T37 — Previous crash test results

  **Acceptance Criteria**:
  - [ ] All crash tests PASS against production
  - [ ] Build + coverage + lint all pass
  - [ ] CD pipelines functional
  - [ ] Results recorded in `.omo/evidence/final/`

  **QA Scenarios**:
  ```
  Scenario: Final crash test suite passes
    Tool: Bash (node + npm)
    Preconditions: Production environment ready
    Steps:
      1. npm run build → exit 0
      2. npm run test -- --coverage → exit 0, ≥70% coverage
      3. npm run lint → exit 0
      4. node scripts/audit/redis-leak-probe/index.ts → PASS
      5. node scripts/audit/concurrency-bomb/index.ts → PASS
      6. node scripts/audit/arbitrage-exploit/index.ts → PASS
    Expected Result: All tests and checks pass
    Evidence: .omo/evidence/task-59-final-tests.log
  ```

  **Evidence to Capture**:
  - [ ] `.omo/evidence/task-59-final-tests.log`

  **Commit**: NO (tests only, no code changes)

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
> Do NOT auto-proceed after verification. Wait for explicit approval.

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in `.omo/evidence/`. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `npx tsc --noEmit` + linter + `npm run test`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, `console.log` in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names (`data`/`result`/`item`/`temp`).
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high` (+ playwright skill if UI)
  Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration. Test edge cases: empty state, invalid input, rapid actions. Save to `.omo/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect cross-task contamination. Flag unaccounted changes.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| Batch | Wave | Files | Message |
|-------|------|-------|---------|
| C1 | W0 | `.omo/reports/env-spec.md`, `.omo/reports/threat-model.md`, `scripts/verify-migration-order.ts` | `docs: add environment inventory, threat model, and migration verifier` |
| C2 | W1 | `.env.example`, `_shared/config.ts`, `src/lib/config.ts`, `src/lib/feature-flags.ts` | `feat: add config module and feature flag system` |
| C3 | W2 | `.github/workflows/deploy-*.yml`, `scripts/promote-to-production.ts`, `scripts/rollback.ts` | `ci: add CD pipelines and deployment scripts` |
| C4 | W3 | `src/test-utils/`, `src/**/*.test.ts`, `e2e/*.spec.ts`, `supabase/functions/*/__tests__/` | `test: add comprehensive test suite (unit, integration, E2E)` |
| C5 | W3 | `vitest.config.ts`, `package.json` | `ci: enforce coverage thresholds (≥70%)` |
| C6 | W3 | `src/components/ErrorBoundary.tsx` | `feat: add ErrorBoundary component` |
| C7 | W4 | `_shared/rate-limiter.ts`, `_shared/cors.ts`, modified EFs | `feat: add rate limiting, CORS headers, and security hardening` |
| C8 | W4 | `.github/workflows/security-audit.yml` | `ci: add security audit workflow` |
| C9 | W4 | Security header configs | `feat: add security headers (CSP, HSTS)` |
| C10 | W5 | `_shared/logger.ts`, `_shared/health.ts`, `@sentry/react` setup | `feat: add observability (structured logging, Sentry, health checks)` |
| C11 | W5 | `/ops/observability` page | `feat: add observability dashboard` |
| C12 | W5 | `log_observability()` standardization | `refactor: standardize observability logging` |
| C13 | W6 | Type fixes (lib, hooks, pages, EFs, admin type) | `refactor: eliminate as any casts and enable strict mode` |
| C14 | W6 | `blitz-settle-room` timestamp fix | `fix: use order_timestamp() RPC in settleRoom` |
| C15 | W6 | Waiting room timeout, logger integration | `feat: add waiting room timeout cleanup` |
| C16 | W7 | `.omo/reports/readiness-signoff.md` | `docs: add production readiness sign-off` |
| C17 | W7 | `.omo/reports/runbook.md` | `docs: add production runbook` |
| C18 | W7 | `.omo/reports/adr/` | `docs: add architecture decision records` |
| C19 | W7 | `SETUP.md` | `docs: add environment setup guide` |

---

## Success Criteria

### Verification Commands
```bash
npm run build                   # Expected: exit 0, production build succeeds
npm run test -- --coverage      # Expected: exit 0, lines ≥70%, functions ≥70%
npm run lint                    # Expected: exit 0, zero warnings
npx tsc --noEmit                # Expected: exit 0, zero errors
supabase functions list         # Expected: 20 functions listed
supabase db remote commits      # Expected: 29 migrations applied
curl -s $EF_URL/health          # Expected: {"status":"ok",...}
curl -s -X OPTIONS $EF_URL      # Expected: Access-Control-Allow-Origin header
curl -s $FRONTEND_URL           # Expected: CSP, HSTS, X-Frame-Options headers
gh workflow run deploy-migrations.yml --dry-run  # Expected: workflow parsed OK
```

### Final Checklist
- [ ] Production Supabase project active with 29 migrations
- [ ] Upstash Redis configured and reachable
- [ ] CD pipeline deploys Edge Functions on push
- [ ] CD pipeline runs migrations with manual confirmation gate
- [ ] Staging environment synchronized with production
- [ ] ≥70% line coverage across all tests
- [ ] ErrorBoundary wraps entire app
- [ ] Sentry error tracking active
- [ ] Rate limiting enforced (429 on excess)
- [ ] CORS headers on all public EFs
- [ ] Security headers on frontend deployment
- [ ] RLS enabled on all tables
- [ ] Zero `as any` casts in production code
- [ ] TypeScript strict mode enabled
- [ ] Settlement uses server-authoritative timestamps
- [ ] All crash tests PASS against production
- [ ] Runbook + ADRs + Setup guide complete
- [ ] All 4 final reviewers (F1-F4) APPROVE


