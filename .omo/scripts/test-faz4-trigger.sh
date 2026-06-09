#!/usr/bin/env bash
# =============================================================================
# FAZ 4 Integration Test: blitz_payout_trigger
#
# Tests the blitz_payout_trigger() function that:
#   - Records platform_revenue when a room finishes
#   - Pays the winner (pot - fee_collected) via profiles.real_balance
#   - Handles tie (winner_id = null) — no payout, fee still collected
#   - Is idempotent — updating status='finished' twice doesn't double-pay
#
# Prerequisites:
#   - supabase CLI installed and linked (or SUPABASE_DB_URL set)
#   - All migrations applied (blitz tables, platform_revenue, payout trigger)
#
# Usage:
#   bash .omo/scripts/test-faz4-trigger.sh
#   # Or with explicit DB URL:
#   SUPABASE_DB_URL=postgresql://... bash .omo/scripts/test-faz4-trigger.sh
# =============================================================================

set -euo pipefail

PASS=0
FAIL=0
RESULTS=()
EVIDENCE_DIR=".omo/evidence"
mkdir -p "$EVIDENCE_DIR"
EVIDENCE_FILE="$EVIDENCE_DIR/faz4-trigger-test-$(date +%Y%m%d-%H%M%S).log"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
log() { echo "$@" | tee -a "$EVIDENCE_FILE"; }

run_sql() {
  local label="$1"
  local sql="$2"
  log "--- RUN: $label ---"
  echo "$sql" >> "$EVIDENCE_FILE"
  local output
  if output=$(supabase sql "$sql" 2>&1); then
    echo "$output" >> "$EVIDENCE_FILE"
    echo "$output"
  else
    echo "$output" >> "$EVIDENCE_FILE"
    echo "$output"
    return 1
  fi
}

assert_eq() {
  local label="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then
    log "  PASS: $label (expected=$expected)"
    PASS=$((PASS + 1))
    RESULTS+=("PASS: $label")
  else
    log "  FAIL: $label (expected=$expected, got=$actual)"
    FAIL=$((FAIL + 1))
    RESULTS+=("FAIL: $label (expected=$expected, got=$actual)")
  fi
}

assert_contains() {
  local label="$1" needle="$2" haystack="$3"
  if echo "$haystack" | grep -q "$needle"; then
    log "  PASS: $label (contains '$needle')"
    PASS=$((PASS + 1))
    RESULTS+=("PASS: $label")
  else
    log "  FAIL: $label (missing '$needle' in: $haystack)"
    FAIL=$((FAIL + 1))
    RESULTS+=("FAIL: $label")
  fi
}

assert_fails() {
  local label="$1"
  local sql="$2"
  local output
  if output=$(supabase sql "$sql" 2>&1); then
    log "  FAIL: $label (expected failure but succeeded)"
    FAIL=$((FAIL + 1))
    RESULTS+=("FAIL: $label (expected failure)")
  else
    log "  PASS: $label (correctly failed: $(echo "$output" | head -1))"
    PASS=$((PASS + 1))
    RESULTS+=("PASS: $label")
  fi
}

cleanup() {
  log ""
  log "=== CLEANUP ==="
  supabase sql "
    -- Delete test data (cascades to participants/orders)
    DELETE FROM public.blitz_rooms
    WHERE symbol = 'TEST_PAYOUT_TRIGGER';
    DELETE FROM public.platform_revenue
    WHERE room_id IS NULL AND source = 'blitz' AND metadata->>'type' = 'blitz_fee_test';
  " >> "$EVIDENCE_FILE" 2>&1 || true
  log "Cleanup done."
}

# Trap cleanup on exit
trap cleanup EXIT

# ---------------------------------------------------------------------------
# TEST DATA SETUP
# ---------------------------------------------------------------------------
log "============================================"
log "FAZ 4 Integration Tests: blitz_payout_trigger"
log "============================================"
log ""

# We need two test user UUIDs. Use fixed UUIDs for determinism.
USER_A="11111111-1111-1111-1111-111111111111"
USER_B="22222222-2222-2222-2222-222222222222"

# Step 1: Create test users in auth.users + profiles
# Note: Direct INSERT into auth.users may require service_role.
# If auth.users already has these, the INSERT will fail — that's fine.
log "=== SETUP: Creating test users ==="
supabase sql "
  -- Create auth users (ignore if exist)
  INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  VALUES
    ('$USER_A', 'test-a@payout-test.com', crypt('pass', gen_salt('bf')), now(), now(), now()),
    ('$USER_B', 'test-b@payout-test.com', crypt('pass', gen_salt('bf')), now(), now(), now())
  ON CONFLICT (id) DO NOTHING;

  -- Create profiles
  INSERT INTO public.profiles (id, display_name, real_balance, real_balance_locked)
  VALUES
    ('$USER_A', 'TestUserA', 100.00, 0),
    ('$USER_B', 'TestUserB', 200.00, 0)
  ON CONFLICT (id) DO UPDATE
    SET real_balance = EXCLUDED.real_balance,
        real_balance_locked = EXCLUDED.real_balance_locked;
" 2>&1 | tee -a "$EVIDENCE_FILE" || true

log ""

# ===========================================================================
# TEST 1: Winner payout — correct balance update
# ===========================================================================
log "=== TEST 1: Winner payout — balance update ==="

ROOM_ID=$(supabase sql "
  SELECT id FROM public.blitz_rooms
  WHERE symbol = 'TEST_PAYOUT_TRIGGER' AND status = 'finished'
  LIMIT 1;
" 2>/dev/null | tail -1 | tr -d ' ')

# If room still exists from a previous run, skip setup
if [ -z "$ROOM_ID" ] || [ "$ROOM_ID" = "" ]; then
  supabase sql "
    INSERT INTO public.blitz_rooms
      (symbol, entry_fee, status, mode, max_players, pot, fee_collected, winner_id, created_by)
    VALUES
      ('TEST_PAYOUT_TRIGGER', 10.00, 'active', 'public', 2, 20.00, 2.00, NULL, '$USER_A')
    RETURNING id;
  " > /tmp/faz4_room_id.txt 2>/dev/null
  ROOM_ID=$(tail -1 /tmp/faz4_room_id.txt | tr -d ' ')
fi

log "  Room ID: $ROOM_ID"

# Record winner's balance BEFORE
WINNER_BAL_BEFORE=$(supabase sql "
  SELECT real_balance::text FROM public.profiles WHERE id = '$USER_B';
" 2>/dev/null | tail -1 | tr -d ' ')
log "  Winner balance before: $WINNER_BAL_BEFORE"

# Record platform_revenue count BEFORE
REV_COUNT_BEFORE=$(supabase sql "
  SELECT count(*)::text FROM public.platform_revenue
  WHERE room_id = '$ROOM_ID';
" 2>/dev/null | tail -1 | tr -d ' ')
log "  Revenue rows before: $REV_COUNT_BEFORE"

# Finish the room with winner = USER_B
# Prize = pot - fee_collected = 20 - 2 = 18
supabase sql "
  UPDATE public.blitz_rooms
  SET status = 'finished', winner_id = '$USER_B', updated_at = now()
  WHERE id = '$ROOM_ID';
" 2>&1 | tee -a "$EVIDENCE_FILE"

# Assert: winner balance increased by 18 (pot - fee_collected)
WINNER_BAL_AFTER=$(supabase sql "
  SELECT real_balance::text FROM public.profiles WHERE id = '$USER_B';
" 2>/dev/null | tail -1 | tr -d ' ')
log "  Winner balance after: $WINNER_BAL_AFTER"

# Calculate expected: 200 + 18 = 218
assert_eq "Winner real_balance = 218.00" "218.00" "$WINNER_BAL_AFTER"

# Assert: platform_revenue has new row with amount = fee_collected = 2
REV_COUNT_AFTER=$(supabase sql "
  SELECT count(*)::text FROM public.platform_revenue
  WHERE room_id = '$ROOM_ID' AND amount = 2.00 AND source = 'blitz';
" 2>/dev/null | tail -1 | tr -d ' ')
log "  Revenue rows (amount=2, source=blitz): $REV_COUNT_AFTER"

assert_eq "platform_revenue row created" "1" "$REV_COUNT_AFTER"

# Assert: revenue metadata contains correct type
REV_META=$(supabase sql "
  SELECT metadata->>'type' FROM public.platform_revenue
  WHERE room_id = '$ROOM_ID' LIMIT 1;
" 2>/dev/null | tail -1 | tr -d ' ')
assert_eq "Revenue metadata type = blitz_fee" "blitz_fee" "$REV_META"

log ""

# ===========================================================================
# TEST 2: Tie case — winner_id = null, no payout, fee still collected
# ===========================================================================
log "=== TEST 2: Tie case (winner_id = null) ==="

# Create a second room
TIE_ROOM_ID=$(supabase sql "
  INSERT INTO public.blitz_rooms
    (symbol, entry_fee, status, mode, max_players, pot, fee_collected, winner_id, created_by)
  VALUES
    ('TEST_PAYOUT_TRIGGER', 5.00, 'active', 'public', 2, 10.00, 1.00, NULL, '$USER_A')
  RETURNING id;
" 2>/dev/null | tail -1 | tr -d ' ')
log "  Tie Room ID: $TIE_ROOM_ID"

# Record balances before
TIE_BAL_A_BEFORE=$(supabase sql "
  SELECT real_balance::text FROM public.profiles WHERE id = '$USER_A';
" 2>/dev/null | tail -1 | tr -d ' ')
TIE_BAL_B_BEFORE=$(supabase sql "
  SELECT real_balance::text FROM public.profiles WHERE id = '$USER_B';
" 2>/dev/null | tail -1 | tr -d ' ')
log "  Balances before tie: A=$TIE_BAL_A_BEFORE, B=$TIE_BAL_B_BEFORE"

# Finish room with NO winner (tie)
supabase sql "
  UPDATE public.blitz_rooms
  SET status = 'finished', winner_id = NULL, updated_at = now()
  WHERE id = '$TIE_ROOM_ID';
" 2>&1 | tee -a "$EVIDENCE_FILE"

# Assert: balances unchanged
TIE_BAL_A_AFTER=$(supabase sql "
  SELECT real_balance::text FROM public.profiles WHERE id = '$USER_A';
" 2>/dev/null | tail -1 | tr -d ' ')
TIE_BAL_B_AFTER=$(supabase sql "
  SELECT real_balance::text FROM public.profiles WHERE id = '$USER_B';
" 2>/dev/null | tail -1 | tr -d ' ')
log "  Balances after tie: A=$TIE_BAL_A_AFTER, B=$TIE_BAL_B_AFTER"

assert_eq "User A balance unchanged (tie)" "$TIE_BAL_A_BEFORE" "$TIE_BAL_A_AFTER"
assert_eq "User B balance unchanged (tie)" "$TIE_BAL_B_BEFORE" "$TIE_BAL_B_AFTER"

# Assert: platform_revenue still recorded (fee collected even on tie)
TIE_REV=$(supabase sql "
  SELECT count(*)::text FROM public.platform_revenue
  WHERE room_id = '$TIE_ROOM_ID' AND amount = 1.00 AND source = 'blitz';
" 2>/dev/null | tail -1 | tr -d ' ')
assert_eq "Fee still collected on tie" "1" "$TIE_REV"

log ""

# ===========================================================================
# TEST 3: Idempotency — updating status='finished' twice doesn't double-pay
# ===========================================================================
log "=== TEST 3: Idempotency (no double-pay) ==="

# Create a third room
IDEM_ROOM_ID=$(supabase sql "
  INSERT INTO public.blitz_rooms
    (symbol, entry_fee, status, mode, max_players, pot, fee_collected, winner_id, created_by)
  VALUES
    ('TEST_PAYOUT_TRIGGER', 25.00, 'active', 'public', 2, 50.00, 5.00, NULL, '$USER_A')
  RETURNING id;
" 2>/dev/null | tail -1 | tr -d ' ')
log "  Idempotent Room ID: $IDEM_ROOM_ID"

# Record before
IDEM_BAL_BEFORE=$(supabase sql "
  SELECT real_balance::text FROM public.profiles WHERE id = '$USER_B';
" 2>/dev/null | tail -1 | tr -d ' ')
IDEM_REV_BEFORE=$(supabase sql "
  SELECT count(*)::text FROM public.platform_revenue WHERE room_id = '$IDEM_ROOM_ID';
" 2>/dev/null | tail -1 | tr -d ' ')
log "  Balance before: $IDEM_BAL_BEFORE, Revenue count: $IDEM_REV_BEFORE"

# Finish room — first time
supabase sql "
  UPDATE public.blitz_rooms
  SET status = 'finished', winner_id = '$USER_B', updated_at = now()
  WHERE id = '$IDEM_ROOM_ID';
" 2>&1 | tee -a "$EVIDENCE_FILE"

# Try to update status='finished' again (should be a no-op for trigger)
supabase sql "
  UPDATE public.blitz_rooms
  SET updated_at = now()
  WHERE id = '$IDEM_ROOM_ID' AND status = 'finished';
" 2>&1 | tee -a "$EVIDENCE_FILE"

# Also explicitly try re-setting status to finished
supabase sql "
  UPDATE public.blitz_rooms
  SET status = 'finished', updated_at = now()
  WHERE id = '$IDEM_ROOM_ID';
" 2>&1 | tee -a "$EVIDENCE_FILE"

# Assert: balance increased exactly once (50 - 5 = 45)
IDEM_BAL_AFTER=$(supabase sql "
  SELECT real_balance::text FROM public.profiles WHERE id = '$USER_B';
" 2>/dev/null | tail -1 | tr -d ' ')
log "  Balance after double-finish: $IDEM_BAL_AFTER"

# IDEM_BAL_BEFORE was the balance after test1 (218.00), adding 45 = 263.00
IDEM_EXPECTED=$(echo "$IDEM_BAL_BEFORE + 45" | bc)
assert_eq "Balance increased by exactly 45 (not 90)" "$IDEM_EXPECTED" "$IDEM_BAL_AFTER"

# Assert: only ONE platform_revenue row for this room
IDEM_REV_AFTER=$(supabase sql "
  SELECT count(*)::text FROM public.platform_revenue WHERE room_id = '$IDEM_ROOM_ID';
" 2>/dev/null | tail -1 | tr -d ' ')
assert_eq "Only 1 revenue row (not 2)" "1" "$IDEM_REV_AFTER"

log ""

# ===========================================================================
# TEST 4: guard_profiles_financial_update blocks non-service_role
# ===========================================================================
log "=== TEST 4: Guard blocks non-service_role balance tampering ==="

# Simulate an authenticated (non-service_role) caller trying to modify real_balance
# We do this by setting the JWT role claim to 'authenticated'
GUARD_SQL="
  -- Set JWT claim to authenticated (not service_role)
  SELECT set_config('request.jwt.claim.role', 'authenticated', true);

  -- Try to tamper with real_balance directly
  UPDATE public.profiles
  SET real_balance = real_balance + 999999
  WHERE id = '$USER_A';
"

assert_fails "Guard blocks authenticated caller from changing real_balance" "$GUARD_SQL"

# Verify the balance wasn't changed
GUARD_BAL=$(supabase sql "
  SELECT real_balance::text FROM public.profiles WHERE id = '$USER_A';
" 2>/dev/null | tail -1 | tr -d ' ')
log "  User A balance after guard test: $GUARD_BAL"

# Reset JWT role back to service_role for subsequent operations
supabase sql "SELECT set_config('request.jwt.claim.role', 'service_role', true);" 2>&1 >> "$EVIDENCE_FILE"

log ""

# ===========================================================================
# TEST 5: Negative — status change to non-'finished' doesn't trigger payout
# ===========================================================================
log "=== TEST 5: Negative — status='cancelled' does not trigger payout ==="

CANCEL_ROOM_ID=$(supabase sql "
  INSERT INTO public.blitz_rooms
    (symbol, entry_fee, status, mode, max_players, pot, fee_collected, winner_id, created_by)
  VALUES
    ('TEST_PAYOUT_TRIGGER', 15.00, 'active', 'public', 2, 30.00, 3.00, '$USER_A', '$USER_A')
  RETURNING id;
" 2>/dev/null | tail -1 | tr -d ' ')
log "  Cancel Room ID: $CANCEL_ROOM_ID"

CANCEL_BAL_BEFORE=$(supabase sql "
  SELECT real_balance::text FROM public.profiles WHERE id = '$USER_A';
" 2>/dev/null | tail -1 | tr -d ' ')

supabase sql "
  UPDATE public.blitz_rooms
  SET status = 'cancelled', updated_at = now()
  WHERE id = '$CANCEL_ROOM_ID';
" 2>&1 | tee -a "$EVIDENCE_FILE"

CANCEL_BAL_AFTER=$(supabase sql "
  SELECT real_balance::text FROM public.profiles WHERE id = '$USER_A';
" 2>/dev/null | tail -1 | tr -d ' ')
log "  Balance after cancel: $CANCEL_BAL_AFTER"

assert_eq "Balance unchanged on cancelled" "$CANCEL_BAL_BEFORE" "$CANCEL_BAL_AFTER"

CANCEL_REV=$(supabase sql "
  SELECT count(*)::text FROM public.platform_revenue WHERE room_id = '$CANCEL_ROOM_ID';
" 2>/dev/null | tail -1 | tr -d ' ')
assert_eq "No revenue row on cancelled" "0" "$CANCEL_REV"

log ""

# ===========================================================================
# SUMMARY
# ===========================================================================
log "============================================"
log "RESULTS SUMMARY"
log "============================================"
for r in "${RESULTS[@]}"; do
  log "  $r"
done
log ""
log "Total: $((PASS + FAIL)) | Pass: $PASS | Fail: $FAIL"
log "Evidence: $EVIDENCE_FILE"

if [ "$FAIL" -gt 0 ]; then
  log ""
  log "SOME TESTS FAILED"
  exit 1
fi

log ""
log "ALL TESTS PASSED"
exit 0
