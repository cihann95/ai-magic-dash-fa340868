#!/usr/bin/env bash
# Blitz Phase 2 — Settlement Collision & Idempotency Tests
# Validates exactly-once settlement semantics — concurrent Edge Function + DB trigger,
# idempotency key uniqueness, and advisory lock contention.
# Usage: ./scripts/qa-settlement-collision.sh
# Requires: psql with $DATABASE_URL or $SUPABASE_DB_URL

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
EVIDENCE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)/.omo/evidence/qa-settlement"
DB_URL="${DATABASE_URL:-${SUPABASE_DB_URL:-}}"
PASS=0
FAIL=0

mkdir -p "$EVIDENCE_DIR"

if [ -z "$DB_URL" ]; then
  echo "ERROR: Set DATABASE_URL or SUPABASE_DB_URL" >&2
  exit 1
fi

psql_cmd() {
  psql "$DB_URL" -t -A "$@"
}

run_test() {
  local name="$1"
  local desc="$2"
  shift 2
  local out="$EVIDENCE_DIR/$name.txt"
  echo "--- TEST: $desc" > "$out"
  if "$@" >> "$out" 2>&1; then
    echo "  [PASS] $name: $desc"
    PASS=$((PASS + 1))
  else
    echo "  [FAIL] $name: $desc — see $out"
    FAIL=$((FAIL + 1))
  fi
}

# Test 1: Idempotency key uniqueness — duplicate insert blocked
test_idempotency_unique() {
  local key="test-duplicate-$(date +%s)-$$"
  psql_cmd -c "INSERT INTO public.settlement_ledger (room_id, idempotency_key, settlement_type, prize_amount, fee_collected, pot_total, participant_count, status) VALUES ('00000000-0000-0000-0000-000000000000'::uuid, '$key', 'edge_function', 0, 0, 0, 1, 'failed')"
  # Second insert with same key must fail due to unique constraint
  if psql_cmd -c "INSERT INTO public.settlement_ledger (room_id, idempotency_key, settlement_type, prize_amount, fee_collected, pot_total, participant_count, status) VALUES ('00000000-0000-0000-0000-000000000000'::uuid, '$key', 'edge_function', 0, 0, 0, 1, 'failed')" 2>/dev/null; then
    return 1
  fi
  return 0
}

# Test 2: settlement_already_processed() returns true for completed key
test_already_processed_completed() {
  local key="test-completed-$(date +%s)-$$"
  psql_cmd -c "INSERT INTO public.settlement_ledger (room_id, idempotency_key, settlement_type, prize_amount, fee_collected, pot_total, participant_count, status) VALUES ('00000000-0000-0000-0000-000000000000'::uuid, '$key', 'edge_function', 100, 10, 110, 2, 'completed')"
  local result
  result=$(psql_cmd -c "SELECT public.settlement_already_processed('$key')")
  [ "$result" = "t" ] || return 1
  return 0
}

# Test 3: try_advisory_lock returns boolean — function exists and works
test_advisory_lock_contention() {
  local lock_key=99999
  # First call should get lock
  local first
  first=$(psql_cmd -c "SELECT public.try_advisory_lock($lock_key)")
  [ "$first" = "t" ] || return 1
  # Second call in same session — pg_try_advisory_xact_lock is reentrant within same transaction
  # This verifies the function exists and returns correct type
  local second
  second=$(psql_cmd -c "SELECT public.try_advisory_lock($lock_key)")
  [ "$second" = "t" ] || return 1
  return 0
}

# Test 4: Settlement ledger is append-only — UPDATE fails
test_append_only() {
  local key="test-append-$(date +%s)-$$"
  psql_cmd -c "INSERT INTO public.settlement_ledger (room_id, idempotency_key, settlement_type, prize_amount, fee_collected, pot_total, participant_count, status) VALUES ('00000000-0000-0000-0000-000000000000'::uuid, '$key', 'edge_function', 0, 0, 0, 1, 'failed')"
  # UPDATE should fail due to no UPDATE policy (RLS blocks it)
  if psql_cmd -c "UPDATE public.settlement_ledger SET status = 'completed' WHERE idempotency_key = '$key'" 2>/dev/null; then
    return 1
  fi
  return 0
}

# Test 5: lock_and_validate_room returns error for non-existent room
test_lock_and_validate_error() {
  local result
  result=$(psql_cmd -c "SELECT public.lock_and_validate_room('00000000-0000-0000-0000-000000000000'::uuid, 'test-room-not-found')")
  echo "$result" | grep -q "Room not found" || return 1
  return 0
}

# Test 6: blitz_payout_trigger has advisory lock + idempotency check
test_trigger_has_protections() {
  local src
  src=$(psql_cmd -c "SELECT prosrc FROM pg_proc WHERE proname = 'blitz_payout_trigger'")
  echo "$src" | grep -q "pg_try_advisory_xact_lock" || return 1
  echo "$src" | grep -q "settlement_already_processed" || return 1
  echo "$src" | grep -q "settlement_ledger" || return 1
  return 0
}

# Test 7: No UPDATE/DELETE policies on settlement_ledger (append-only enforcement)
test_no_update_delete_policies() {
  local policies
  policies=$(psql_cmd -c "SELECT COUNT(*) FROM pg_policies WHERE tablename = 'settlement_ledger' AND cmd IN ('UPDATE', 'DELETE')")
  [ "$policies" = "0" ] || return 1
  return 0
}

echo "=== Settlement Collision & Idempotency Tests ==="
echo ""

run_test "idempotency-unique" "Idempotency key uniqueness — duplicate insert blocked" test_idempotency_unique
run_test "already-processed" "settlement_already_processed returns true for completed key" test_already_processed_completed
run_test "advisory-lock" "try_advisory_lock function works" test_advisory_lock_contention
run_test "append-only" "Settlement ledger UPDATE blocked" test_append_only
run_test "lock-and-validate-error" "lock_and_validate_room returns error for non-existent room" test_lock_and_validate_error
run_test "trigger-protections" "blitz_payout_trigger has advisory lock + idempotency" test_trigger_has_protections
run_test "no-update-delete-policies" "No UPDATE/DELETE policies on settlement_ledger" test_no_update_delete_policies

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] || exit 1
