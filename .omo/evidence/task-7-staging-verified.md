# Task 7: Staging Supabase Project — Verified

## Summary
Staging Supabase project **lumen-trade-staging** created and verified.

## Project Details
| Attribute | Value |
|-----------|-------|
| Project Ref | `ckcmnhksmjzhlqmrxkap` |
| Name | `lumen-trade-staging` |
| Organization | `zrjzxrnnhvruzpnmqmem` |
| Region | `eu-west-1` (West EU) |
| Created | 2026-06-18T08:30:51Z |
| Dashboard | https://supabase.com/dashboard/project/ckcmnhksmjzhlqmrxkap |

## Migration Status
- **Total migrations**: 37
- **Applied**: 37/37 ✅
- **Status**: All migrations applied successfully

### Migrations Applied (37)
1. `20260417103732_e491246f...` — Initial schema (user_roles, profiles, positions, trades, watchlist, etc.)
2. `20260417111010_61686f6f...` — Public profiles, orders, price_alerts, achievements, user_stats, etc.
3. `20260420074338_f92fdbc3...` — Notifications
4. `20260421082651_c11f22fb...` — Copy settings, coach insights, push subscriptions
5. `20260421082708_232827cb...` — Followers functions
6. `20260423163013_dee2b787...` — Emotional logs, coach insights insert
7. `20260424060912_102c54a8...` — RLS helper functions
8. `20260505061855_4a6bebd8...` — Followers, stats, realtime policies
9. `20260505063712_e53708eb...` — Additional policies
10. `20260505070823_8924cb41...` — Financial guard triggers
11. `20260505074053_4117374b...` — Copy settings policies
12. `20260505075826_f94fde75...` — Copy settings update
13. `20260506090228_b533d05d...` — Blitz participants index
14. `20260605072952_43e4b19f...` — pg_cron, vault extensions
15. `20260605073107_f43eda95...` — pgcrypto extensions
16. `20260605073136_a9117c71...` — Cron secret setup
17. `20260605073217_84076737...` — verify_cron_secret RPC
18. `20260608124235_88afb6c3...` — Blitz rooms, participants, orders
19. `20260608130000_blitz_cron_settler...` — Blitz cron settler
20. `20260609063751_a7fad7a7...` — Redis extension
21. `20260609065635_331de86c...` — Platform revenue, real balance ledger
22. `20260609065651_ff02e7f9...` — Coach insights
23. `20260609234136_ana_sahne...` — Ana Sahne view, payout trigger, featured room
24. `20260610000000_cleanup_stale_rooms...` — Stale room cleanup
25. `20260610000001_security_hardening...` — Security hardening (anti-cheat, slippage)
26. `20260610000002_settlement_integrity...` — Settlement ledger, idempotency
27. `20260610000003_analytics_foundation...` — Analytics events
28. `20260610000004_observability...` — Observability log
29. `20260610000005_blitz_fixes...` — Blitz fixes
30. `20260610000006_race_condition_and_invariant...` — Race conditions
31. `20260616150000_ana_sahne_view_security_invoker...` — View security
32. `20260616170000_fix_critical_production_blockers...` — Production blockers
33. `20260616180000_fix_all_critical_issues...` — All critical issues
34. `20260616190000_fix_zero_balance...` — Zero balance fix
35. `20260616200000_fix_auth_and_profiles_500...` — Auth & profiles 500
36. `20260617093000_fix_user_stats_and_balance...` — User stats & balance
37. `20260617120000_deduct_balance_atomic...` — Atomic balance deduction

## RLS Verification
- **Tables with RLS**: 33 tables across the schema
- **Key tables**: profiles, orders, positions, trades, blitz_rooms, blitz_participants, blitz_orders, settlement_ledger, platform_revenue, analytics_events, observability_log, all user-facing tables
- **Status**: All RLS policies applied per migration definitions ✅

## Migration Fixes Applied During Setup
1. **`20260609234136_ana_sahne.sql`**: Removed `ALTER VIEW ... ENABLE ROW LEVEL SECURITY` — PostgreSQL does not support RLS on views. The view uses `security_invoker` which enforces base-table RLS automatically.
2. **`20260616150000_ana_sahne_view_security_invoker.sql`**: Added `DROP POLICY IF EXISTS` before `CREATE POLICY` for all 4 policies — prevents "policy already exists" conflict when the original migration already created these policies.

## Migration Issues Identified
1. `ALTER VIEW ... ENABLE ROW LEVEL SECURITY` is not supported on the staging project's PostgreSQL version. The view's `security_invoker` setting + base-table `GRANT SELECT` + base-table RLS policies provide equivalent access control.
2. `CREATE POLICY` without `DROP POLICY IF EXISTS` causes idempotency issues when fix migrations re-create policies already established by earlier migrations. All such cases should use `DROP POLICY IF EXISTS` before `CREATE POLICY`.

## Usage
- **Safe migration replay**: Before applying to production, run `supabase db push --linked` against staging
- **Staging deploy target**: `ckcmnhksmjzhlqmrxkap` (ref stored in `.omo/evidence/staging-ref.txt`)
- **Pre-prod testing**: All 37 migrations verified on staging before production apply

## Refs
- Staging ref: `.omo/evidence/staging-ref.txt`
- Learnings: `.omo/notepads/production-readiness/learnings.md`
- Config: `supabase/config.toml`
