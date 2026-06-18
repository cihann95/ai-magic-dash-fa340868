# Task 5: Supabase Production Project Status

**Date:** 2026-06-18
**Project Ref:** `xynpcusbbjfoyphtfcgz`
**Org ID:** `zrjzxrnnhvruzpnmqmem`
**Supabase CLI:** v2.106.0

---

## 1. Project Overview

| Attribute | Value |
|-----------|-------|
| **Project Name** | cihann95's Project |
| **Project Ref** | `xynpcusbbjfoyphtfcgz` |
| **Region** | West EU (Ireland) — `eu-west-1` |
| **Status** | `ACTIVE_HEALTHY` |
| **PostgreSQL Version** | 17.6.1.127 |
| **Created At** | 2026-06-15 23:14:33 UTC |
| **Organization** | `zrjzxrnnhvruzpnmqmem` |

### Linked Project (Staging)

A second project exists in the same org — **lumen-trade-staging** (`ckcmnhksmjzhlqmrxkap`). This project was the previously-linked project. During this task, `supabase link --project-ref xynpcusbbjfoyphtfcgz` was run to re-link to the main project.

All queries in this report were run against `xynpcusbbjfoyphtfcgz` via `--linked` flag.

---

## 2. Migration Status

### Summary

| Check | Result |
|-------|--------|
| Local migration files | **37** |
| Applied in remote DB | **37** |
| Pending migrations | **0** |
| Match local ↔ remote | ✅ **All 37 match** |
| `supabase db remote changes` | ⛔ **Not available** (requires Docker) |
| `supabase db diff --linked` | ⛔ **Not available** (requires Docker) |

### Applied Migrations (all 37 confirmed)

| # | Version | Name |
|---|---------|------|
| 1 | `20260417103732` | `e491246f-19d3-423e-9ebb-ccdd4a8cfa4d` |
| 2 | `20260417111010` | `61686f6f-6da7-4833-b75b-551605c69c53` |
| 3 | `20260420074338` | `f92fdbc3-51ba-4c33-ac84-5feb76fc1c02` |
| 4 | `20260421082651` | `c11f22fb-cd84-42eb-ac19-8431958dcf42` |
| 5 | `20260421082708` | `232827cb-b8ee-45bd-a965-ca6ab81bb55f` |
| 6 | `20260423163013` | `dee2b787-70e1-486c-ba55-70b9b624fb46` |
| 7 | `20260424060912` | `102c54a8-e65d-4f20-a706-750df87431d3` |
| 8 | `20260505061855` | `4a6bebd8-7116-4e0c-b349-d0e7c1a8c45d` |
| 9 | `20260505063712` | `e53708eb-4a9d-4719-8846-6620eccffe67` |
| 10 | `20260505070823` | `8924cb41-3e3e-4850-a722-9f24fa9bd0ad` |
| 11 | `20260505074053` | `4117374b-3cb8-4b48-87a4-3cb24169d160` |
| 12 | `20260505075826` | `f94fde75-7746-4109-af31-e83bbb265097` |
| 13 | `20260506090228` | `b533d05d-db2b-4faf-b3e8-c04936e6db8c` |
| 14 | `20260605072952` | `43e4b19f-5974-471e-ae4b-c494fedc12ed` |
| 15 | `20260605073107` | `f43eda95-c7ea-4b12-afc8-6fe73bfcffda` |
| 16 | `20260605073136` | `a9117c71-9494-4b12-8a60-54117015b2ce` |
| 17 | `20260605073217` | `84076737-88bf-4393-a17a-de5749face5a` |
| 18 | `20260608124235` | `88afb6c3-f0b7-461f-ba4f-6aed1fff5959` |
| 19 | `20260608130000` | `blitz_cron_settler` |
| 20 | `20260609063751` | `a7fad7a7-1fe5-4328-823b-5b95ddfe7f8d` |
| 21 | `20260609065635` | `331de86c-cdad-4b77-ae7f-0f520999227c` |
| 22 | `20260609065651` | `ff02e7f9-3def-411b-9d97-4ad0a3bf44c7` |
| 23 | `20260609234136` | `ana_sahne` |
| 24 | `20260610000000` | `cleanup_stale_rooms` |
| 25 | `20260610000001` | `security_hardening` |
| 26 | `20260610000002` | `settlement_integrity` |
| 27 | `20260610000003` | `analytics_foundation` |
| 28 | `20260610000004` | `observability` |
| 29 | `20260610000005` | `blitz_fixes` |
| 30 | `20260610000006` | `race_condition_and_invariant` |
| 31 | `20260616150000` | `ana_sahne_view_security_invoker` |
| 32 | `20260616170000` | `fix_critical_production_blockers` |
| 33 | `20260616180000` | `fix_all_critical_issues` |
| 34 | `20260616190000` | `fix_zero_balance` |
| 35 | `20260616200000` | `fix_auth_and_profiles_500` |
| 36 | `20260617093000` | `fix_user_stats_and_balance` |
| 37 | `20260617120000` | `deduct_balance_atomic` |

**Verdict: ✅ PASS — All 37 migrations applied, none pending.**

---

## 3. RLS (Row-Level Security) Status

### Tables with RLS Enabled

**Result: 32/32 public tables have RLS enabled** — 0 tables without RLS.

| Table | RLS | Table | RLS |
|-------|:---:|-------|:---:|
| `achievements` | ✅ | `ai_conversations` | ✅ |
| `ai_messages` | ✅ | `analytics_events` | ✅ |
| `analytics_events_staging` | ✅ | `blitz_orders` | ✅ |
| `blitz_participants` | ✅ | `blitz_rooms` | ✅ |
| `coach_insights` | ✅ | `copy_settings` | ✅ |
| `daily_briefs` | ✅ | `emotional_logs` | ✅ |
| `followers` | ✅ | `notifications` | ✅ |
| `observability_log` | ✅ | `orders` | ✅ |
| `platform_revenue` | ✅ | `positions` | ✅ |
| `price_alerts` | ✅ | `price_cache` | ✅ |
| `profiles` | ✅ | `public_profiles` | ✅ |
| `push_subscriptions` | ✅ | `real_balance_ledger` | ✅ |
| `settlement_ledger` | ✅ | `slippage_config` | ✅ |
| `trade_journal` | ✅ | `trades` | ✅ |
| `user_achievements` | ✅ | `user_roles` | ✅ |
| `user_stats` | ✅ | `watchlist` | ✅ |

### Policy Count

- **74 policies** across all public tables (avg ~2.3 policies/table)
- Every table has at least one policy
- Common patterns: `_select_own`, `_insert_own`, `_update_own`, `_delete_own`

**Verdict: ✅ PASS — 100% RLS coverage across all 32 public tables.**

---

## 4. Required Extensions

| Extension | Version | Status |
|-----------|---------|:------:|
| **pgcrypto** | 1.3 | ✅ **Enabled** |
| **pg_stat_statements** | 1.11 | ✅ **Enabled** |

### Additional Extensions Present

| Extension | Version | Purpose |
|-----------|---------|---------|
| `pg_cron` | 1.6.4 | Scheduled job execution (cleanup_stale_rooms cron) |
| `pg_net` | 0.20.3 | Async HTTP requests from PostgreSQL |
| `supabase_vault` | 0.3.1 | Encrypted secrets storage |
| `uuid-ossp` | 1.1 | UUID generation |
| `plpgsql` | 1.0 | Procedural language (built-in) |

**Verdict: ✅ PASS — Both required extensions (pgcrypto, pg_stat_statements) enabled.**

---

## 5. Edge Functions

### Deployed Functions

**Result: 19 functions deployed, all ACTIVE**

| # | Name | Version | Status |
|---|------|:-------:|:------:|
| 1 | `ai-chat` | 5 | ✅ ACTIVE |
| 2 | `ai-risk-monitor` | 5 | ✅ ACTIVE |
| 3 | `ai-analyze` | 5 | ✅ ACTIVE |
| 4 | `ai-strategy` | 5 | ✅ ACTIVE |
| 5 | `ai-trade-coach` | 5 | ✅ ACTIVE |
| 6 | `blitz-admin-topup` | 5 | ✅ ACTIVE |
| 7 | `blitz-analytics-writer` | 5 | ✅ ACTIVE |
| 8 | `blitz-join-private` | 5 | ✅ ACTIVE |
| 9 | `blitz-matchmake` | 5 | ✅ ACTIVE |
| 10 | `blitz-settle-room` | 5 | ✅ ACTIVE |
| 11 | `blitz-tick-order` | 5 | ✅ ACTIVE |
| 12 | `daily-brief` | 5 | ✅ ACTIVE |
| 13 | `execute-trade` | **10** | ✅ ACTIVE |
| 14 | `news-feed` | 5 | ✅ ACTIVE |
| 15 | `price-feed` | **7** | ✅ ACTIVE |
| 16 | `reset-demo-account` | 5 | ✅ ACTIVE |
| 17 | `send-push` | 5 | ✅ ACTIVE |
| 18 | `trade-mirror` | 5 | ✅ ACTIVE |
| 19 | `weekly-digest` | 5 | ✅ ACTIVE |

**All updated at:** 2026-06-17 11:02:18 UTC

### Version Notes

- `execute-trade` at **v10** (highest — complex financial logic, most iterations)
- `price-feed` at **v7** (price data ingestion — iterative improvements)
- Remaining 17 functions at **v5** (baseline stable version)

**Verdict: ✅ PASS — 19/19 Edge Functions deployed and ACTIVE.**

---

## 6. Schema Objects Summary

| Object Type | Count |
|-------------|:-----:|
| Tables (public) | 32 |
| Views | 3 |
| Routines (functions) | 37 |
| RLS Policies | 74 |

---

## 7. Issues Found

| # | Severity | Issue | Status |
|---|----------|-------|:------:|
| 1 | ⚠️ **Limitation** | Docker is not available in this environment. Commands `supabase db remote changes`, `supabase db diff --linked`, and `supabase db push` require Docker. Cannot run `db push --dry-run` to preview pending migrations. | Documented |
| 2 | ⚠️ **Note** | Two Supabase projects exist in the same org: production (`xynpcusbbjfoyphtfcgz`) and staging (`ckcmnhksmjzhlqmrxkap`). The local CLI was initially linked to staging; re-linked during this task. Ensure correct project is targeted for deployment operations. | Documented |
| 3 | ✅ **None** | All 37 migrations match exactly between local and remote. No pending migrations. | Clean |
| 4 | ✅ **None** | All 32 tables have RLS enabled with 74 policies. | Clean |
| 5 | ✅ **None** | Required extensions (pgcrypto, pg_stat_statements) are installed. | Clean |
| 6 | ✅ **None** | All 19 Edge Functions are deployed and ACTIVE. | Clean |

---

## 8. Recommendations

1. **Docker setup**: Install Docker locally to enable `supabase db diff` and `supabase db push` for verifying future migration changes before deployment.
2. **Project linking**: Ensure the CLI is consistently linked to the correct project (`xynpcusbbjfoyphtfcgz`) by running `supabase link --project-ref xynpcusbbjfoyphtfcgz` after any environment reset.
3. **Migration verification**: After any future migration additions, run `supabase db query --linked "SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version;"` to verify they're applied.

---

## 9. Verification Commands Used

```bash
# Project listing and status
supabase projects list -o json
supabase link --project-ref xynpcusbbjfoyphtfcgz

# Migration status
supabase db query --linked "SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version;"
supabase db query --linked "SELECT COUNT(*) FROM supabase_migrations.schema_migrations;"

# RLS status
supabase db query --linked "SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;"
supabase db query --linked "SELECT COUNT(*) as policies FROM pg_policies WHERE schemaname = 'public';"

# Extensions
supabase db query --linked "SELECT extname, extversion FROM pg_extension ORDER BY extname;"

# Schema objects
supabase db query --linked "SELECT 'tables' as t, COUNT(*) FROM pg_tables WHERE schemaname = 'public' UNION ALL ..."

# Edge Functions
supabase functions list --project-ref xynpcusbbjfoyphtfcgz

# DB diff (failed — Docker required)
supabase db diff --use-migra --linked
supabase db remote changes
```
