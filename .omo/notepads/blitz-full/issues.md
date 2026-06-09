
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
- `ana_sahne_view` is missing from `src/integrations/supabase/types.ts` Views section — requires `as never` cast in `.from()` call and `as unknown as AnaSahneRoom` cast on response. Not a blocker, but a `supabase gen types` run after deployment would fix this cleanly.
