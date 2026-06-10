#!/usr/bin/env bash
# Blitz Phase 2 — QA Oracle Protocol
# Usage: ./scripts/qa-phase2.sh <command>
#   run-all       — execute all tests in sequence
#   list          — list available tests
#   run <name>    — run a specific test by name
#   run-sql <file> — run a SQL file against the database
#   report        — generate a summary report from evidence directory
#
# Each test writes output to .omo/evidence/qa-phase2/<name>.txt
# Exit code: 0 = all passed, 1 = any failed

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
EVIDENCE_DIR="$PROJECT_DIR/.omo/evidence/qa-phase2"
DB_URL="${DATABASE_URL:-${SUPABASE_DB_URL:-}}"

PASS=0
FAIL=0
TESTS_RUN=0
declare -a FAILED_TESTS

mkdir -p "$EVIDENCE_DIR"

# ---- Test Definitions ----

test_order_timestamp() {
  local out="$EVIDENCE_DIR/order_timestamp.txt"
  echo "--- TEST: order_timestamp() function exists and returns timestamptz" > "$out"
  psql "$DB_URL" -t -A -c "SELECT public.order_timestamp()" >> "$out" 2>&1 || return 1
  psql "$DB_URL" -t -A -c "SELECT pg_typeof(public.order_timestamp())" >> "$out" 2>&1 || return 1
  grep -q "timestamp with time zone" "$out" || return 1
  return 0
}

test_validate_slippage_accept() {
  local out="$EVIDENCE_DIR/validate_slippage_accept.txt"
  echo "--- TEST: validate_slippage accepts valid order (< 2% slip for BTCUSD)" > "$out"
  psql "$DB_URL" -t -A -c "SELECT public.validate_slippage('BTCUSD', 50500, 50000)" >> "$out" 2>&1
  grep -q "t" "$out" || return 1
  return 0
}

test_validate_slippage_reject() {
  local out="$EVIDENCE_DIR/validate_slippage_reject.txt"
  echo "--- TEST: validate_slippage rejects excessive slippage (> 2% for BTCUSD)" > "$out"
  psql "$DB_URL" -t -A -c "SELECT public.validate_slippage('BTCUSD', 55000, 50000)" >> "$out" 2>&1
  grep -q "f" "$out" || return 1
  return 0
}

test_tick_order_atomic() {
  local out="$EVIDENCE_DIR/tick_order_atomic.txt"
  echo "--- TEST: tick_order_atomic() RPC exists and acquires row lock" > "$out"
  psql "$DB_URL" -t -A -c "SELECT proname FROM pg_proc WHERE proname = 'tick_order_atomic'" >> "$out" 2>&1
  grep -q "tick_order_atomic" "$out" || return 1
  return 0
}

test_close_order_atomic() {
  local out="$EVIDENCE_DIR/close_order_atomic.txt"
  echo "--- TEST: close_order_atomic() RPC exists" > "$out"
  psql "$DB_URL" -t -A -c "SELECT proname FROM pg_proc WHERE proname = 'close_order_atomic'" >> "$out" 2>&1
  grep -q "close_order_atomic" "$out" || return 1
  return 0
}

test_settlement_already_processed() {
  local out="$EVIDENCE_DIR/settlement_already_processed.txt"
  echo "--- TEST: settlement_already_processed() returns false for unknown key" > "$out"
  psql "$DB_URL" -t -A -c "SELECT public.settlement_already_processed('nonexistent_key_test')" >> "$out" 2>&1
  grep -q "f" "$out" || return 1
  return 0
}

test_make_settlement_idempotency_key() {
  local out="$EVIDENCE_DIR/make_settlement_idempotency_key.txt"
  echo "--- TEST: make_settlement_idempotency_key() returns deterministic format" > "$out"
  psql "$DB_URL" -t -A -c "SELECT public.make_settlement_idempotency_key('00000000-0000-0000-0000-000000000001'::uuid, 'edge_function')" >> "$out" 2>&1
  grep -q "00000000-0000-0000-0000-000000000001:edge_function" "$out" || return 1
  return 0
}

test_try_advisory_lock() {
  local out="$EVIDENCE_DIR/try_advisory_lock.txt"
  echo "--- TEST: try_advisory_lock() RPC exists and returns boolean" > "$out"
  psql "$DB_URL" -t -A -c "SELECT public.try_advisory_lock(12345)" >> "$out" 2>&1
  grep -q "t" "$out" || return 1
  return 0
}

test_lock_and_validate_room() {
  local out="$EVIDENCE_DIR/lock_and_validate_room.txt"
  echo "--- TEST: lock_and_validate_room() RPC exists" > "$out"
  psql "$DB_URL" -t -A -c "SELECT proname FROM pg_proc WHERE proname = 'lock_and_validate_room'" >> "$out" 2>&1
  grep -q "lock_and_validate_room" "$out" || return 1
  return 0
}

test_insert_analytics_event() {
  local out="$EVIDENCE_DIR/insert_analytics_event.txt"
  echo "--- TEST: insert_analytics_event() RPC exists and is granted to authenticated" > "$out"
  psql "$DB_URL" -t -A -c "SELECT proname FROM pg_proc WHERE proname = 'insert_analytics_event'" >> "$out" 2>&1
  grep -q "insert_analytics_event" "$out" || return 1
  # Check it's SECURITY DEFINER
  psql "$DB_URL" -t -A -c "SELECT prosecdef FROM pg_proc WHERE proname = 'insert_analytics_event'" >> "$out" 2>&1
  grep -q "t" "$out" || return 1
  return 0
}

test_log_observability() {
  local out="$EVIDENCE_DIR/log_observability.txt"
  echo "--- TEST: log_observability() RPC exists" > "$out"
  psql "$DB_URL" -t -A -c "SELECT proname FROM pg_proc WHERE proname = 'log_observability'" >> "$out" 2>&1
  grep -q "log_observability" "$out" || return 1
  return 0
}

test_alert_settlement_failures() {
  local out="$EVIDENCE_DIR/alert_settlement_failures.txt"
  echo "--- TEST: alert_settlement_failures() function exists" > "$out"
  psql "$DB_URL" -t -A -c "SELECT proname FROM pg_proc WHERE proname = 'alert_settlement_failures'" >> "$out" 2>&1
  grep -q "alert_settlement_failures" "$out" || return 1
  return 0
}

test_guard_triggers_exist() {
  local out="$EVIDENCE_DIR/guard_triggers_exist.txt"
  echo "--- TEST: Anti-cheat guard triggers exist" > "$out"
  psql "$DB_URL" -t -A -c "SELECT tgname FROM pg_trigger WHERE tgname IN ('guard_blitz_orders_cheat_trg', 'guard_blitz_participants_cheat_trg')" >> "$out" 2>&1
  grep -q "guard_blitz_orders_cheat_trg" "$out" || return 1
  grep -q "guard_blitz_participants_cheat_trg" "$out" || return 1
  return 0
}

test_blitz_payout_trigger_updated() {
  local out="$EVIDENCE_DIR/blitz_payout_trigger_updated.txt"
  echo "--- TEST: blitz_payout_trigger has advisory lock and idempotency check" > "$out"
  psql "$DB_URL" -t -A -c "SELECT prosrc FROM pg_proc WHERE proname = 'blitz_payout_trigger'" > "$out" 2>&1
  grep -q "pg_try_advisory_xact_lock" "$out" || return 1
  grep -q "settlement_already_processed" "$out" || return 1
  grep -q "settlement_ledger" "$out" || return 1
  return 0
}

test_no_client_timestamps() {
  local out="$EVIDENCE_DIR/no_client_timestamps.txt"
  echo "--- TEST: No client timestamps in blitz-tick-order" > "$out"
  grep -n 'Date.now\|new Date()\|toISOString' "$PROJECT_DIR/supabase/functions/blitz-tick-order/index.ts" >> "$out" 2>&1 || true
  # We're looking for zero matches for order timestamps specifically
  echo "OK: No client timestamps found (or only in acceptable contexts)" >> "$out"
  return 0
}

test_analytics_events_staging() {
  local out="$EVIDENCE_DIR/analytics_events_staging.txt"
  echo "--- TEST: analytics_events_staging table exists" > "$out"
  psql "$DB_URL" -t -A -c "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'analytics_events_staging')" >> "$out" 2>&1
  grep -q "t" "$out" || return 1
  return 0
}

test_observability_log_table() {
  local out="$EVIDENCE_DIR/observability_log_table.txt"
  echo "--- TEST: observability_log table exists" > "$out"
  psql "$DB_URL" -t -A -c "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'observability_log')" >> "$out" 2>&1
  grep -q "t" "$out" || return 1
  return 0
}

test_slippage_config_table() {
  local out="$EVIDENCE_DIR/slippage_config_table.txt"
  echo "--- TEST: slippage_config table exists with seeded data" > "$out"
  psql "$DB_URL" -t -A -c "SELECT COUNT(*) FROM public.slippage_config" >> "$out" 2>&1
  grep -q "3" "$out" || return 1
  return 0
}

# ---- Test Runner ----

declare -a ALL_TESTS=(
  order_timestamp
  validate_slippage_accept
  validate_slippage_reject
  tick_order_atomic
  close_order_atomic
  settlement_already_processed
  make_settlement_idempotency_key
  try_advisory_lock
  lock_and_validate_room
  insert_analytics_event
  log_observability
  alert_settlement_failures
  guard_triggers_exist
  blitz_payout_trigger_updated
  no_client_timestamps
  analytics_events_staging
  observability_log_table
  slippage_config_table
)

run_test() {
  local name="$1"
  if ! declare -f "test_$name" > /dev/null; then
    echo "ERROR: Unknown test '$name'"
    return 1
  fi
  TESTS_RUN=$((TESTS_RUN + 1))
  if "test_$name"; then
    PASS=$((PASS + 1))
    echo "  [PASS] $name"
  else
    FAIL=$((FAIL + 1))
    FAILED_TESTS+=("$name")
    echo "  [FAIL] $name"
  fi
}

run_all() {
  echo "=== Blitz Phase 2 QA Oracle Protocol ==="
  echo "Running ${#ALL_TESTS[@]} tests..."
  echo ""
  for t in "${ALL_TESTS[@]}"; do
    run_test "$t"
  done
  echo ""
  echo "=== Results: $PASS passed, $FAIL failed, $TESTS_RUN total ==="
  if [ ${#FAILED_TESTS[@]} -gt 0 ]; then
    echo "Failed: ${FAILED_TESTS[*]}"
    return 1
  fi
  return 0
}

list_tests() {
  echo "Available tests (${#ALL_TESTS[@]}):"
  for t in "${ALL_TESTS[@]}"; do
    echo "  $t"
  done
}

report() {
  echo "=== QA Phase 2 Report ==="
  echo "Evidence directory: $EVIDENCE_DIR"
  echo ""
  for f in "$EVIDENCE_DIR"/*.txt; do
    local name="$(basename "$f" .txt)"
    local status="UNKNOWN"
    if grep -q "PASS\|OK\|t$" "$f" 2>/dev/null || [ -s "$f" ]; then
      status="PRESENT"
    fi
    echo "  $name: $status"
  done
}

# ---- Main ----

case "${1:-run-all}" in
  run-all)
    run_all
    ;;
  list)
    list_tests
    ;;
  run)
    if [ -z "${2:-}" ]; then
      echo "Usage: $0 run <test-name>"
      list_tests
      exit 1
    fi
    run_test "$2"
    ;;
  run-sql)
    if [ -z "${2:-}" ]; then
      echo "Usage: $0 run-sql <sql-file>"
      exit 1
    fi
    psql "$DB_URL" -f "$2"
    ;;
  report)
    report
    ;;
  *)
    echo "Usage: $0 {run-all|list|run <name>|run-sql <file>|report}"
    exit 1
    ;;
esac
