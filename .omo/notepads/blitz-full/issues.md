
# Task 2: RLS Verification for ana_sahne_view

## Status: COMPLETE
- Evidence: `.omo/evidence/task-02-rls-verify.txt`

## Findings
- `ana_sahne_view` has GRANT SELECT to both `anon` and `authenticated` (lines 84-85)
- Base tables (`blitz_rooms`, `blitz_participants`, `blitz_orders`) have GRANT SELECT to `authenticated` only — no anon access
- `public_profiles` RLS `pp_select_active` policy is unchanged and intact
- View is SECURITY DEFINER — bypasses base-table RLS intentionally
- No `has_role()` usage in view (correct for anon compatibility)
- Security model is sound: anon reads view → view runs as owner → joins profiles → returns only featured room data without PII

## No Issues Found
All RLS policies and GRANTs are correctly configured. No migration changes needed.

# Task 4: useAnaSahne Hook

## Status: COMPLETE

## Issues
### as never cast — CLOSED (commit 80caa83)
- `ana_sahne_view` added to `src/integrations/supabase/types.ts` Views section.
- `as never` cast removed from `.from("ana_sahne_view")` call.
- `as unknown as AnaSahneRoom` cast remains (intentional: view returns `participants: Json`, interface expects `AnaSahneParticipant[]`).

### i18n string cleanup — CLOSED (commit 80caa83)
- EmptyArena.tsx: default message now uses `t(lang).no_live_match` instead of hardcoded English string.
- FinishedBanner.tsx: "Prize:" and "Unknown" strings replaced with `t(lang).prize_pool` and `t(lang).player_unknown`.
