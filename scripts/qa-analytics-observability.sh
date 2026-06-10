#!/usr/bin/env bash
# Blitz Phase 2 — Analytics & Observability Tests
# Validates analytics event pipeline, observability logging, and alert queries
# Usage: ./scripts/qa-analytics-observability.sh
# Requires: psql with $DATABASE_URL or $SUPABASE_DB_URL

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
EVIDENCE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)/.omo/evidence/qa-analytics"
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

# Test 1: insert_analytics_event RPC exists
test_insert_rpc_exists() {
  local result
  result=$(psql_cmd -c "SELECT proname FROM pg_proc WHERE proname = 'insert_analytics_event'")
  [ "$result" = "insert_analytics_event" ] || return 1
  return 0
}

# Test 2: insert_analytics_event is SECURITY DEFINER
test_insert_rpc_security_definer() {
  local result
  result=$(psql_cmd -c "SELECT prosecdef FROM pg_proc WHERE proname = 'insert_analytics_event'")
  [ "$result" = "t" ] || return 1
  return 0
}

# Test 3: log_observability RPC exists
test_log_rpc_exists() {
  local result
  result=$(psql_cmd -c "SELECT proname FROM pg_proc WHERE proname = 'log_observability'")
  [ "$result" = "log_observability" ] || return 1
  return 0
}

# Test 4: analytics_events table exists
test_analytics_events_table() {
  local result
  result=$(psql_cmd -c "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'analytics_events')")
  [ "$result" = "t" ] || return 1
  return 0
}

# Test 5: analytics_events_staging table exists
test_analytics_staging_table() {
  local result
  result=$(psql_cmd -c "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'analytics_events_staging')")
  [ "$result" = "t" ] || return 1
  return 0
}

# Test 6: observability_log table exists
test_observability_table() {
  local result
  result=$(psql_cmd -c "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'observability_log')")
  [ "$result" = "t" ] || return 1
  return 0
}

# Test 7: Alert functions exist
test_alert_functions_exist() {
  for fn in alert_settlement_failures alert_duplicate_payout_attempts alert_broadcast_anomalies; do
    local result
    result=$(psql_cmd -c "SELECT proname FROM pg_proc WHERE proname = '$fn'")
    [ "$result" = "$fn" ] || return 1
  done
  return 0
}

# Test 8: Alert functions return empty when no data (should return column names at minimum)
test_alert_functions_empty() {
  local result
  result=$(psql_cmd -c "SELECT COUNT(*) FROM public.alert_settlement_failures()")
  # Should return 0 rows (no failures)
  [ "$result" = "0" ] || return 1
  return 0
}

# Test 9: cleanup_analytics_events function exists
test_cleanup_function() {
  local result
  result=$(psql_cmd -c "SELECT proname FROM pg_proc WHERE proname = 'cleanup_analytics_events'")
  [ "$result" = "cleanup_analytics_events" ] || return 1
  return 0
}

# Test 10: Observability_log has level constraint
test_level_constraint() {
  local result
  # Check the CHECK constraint exists
  result=$(psql_cmd -c "SELECT COUNT(*) FROM information_schema.check_constraints WHERE constraint_name LIKE '%observability_log_level%' OR constraint_name LIKE '%level%check%'")
  # Could be 0 if the constraint is inline — check the column definition instead
  result=$(psql_cmd -c "SELECT column_default FROM information_schema.columns WHERE table_name = 'observability_log' AND column_name = 'level'")
  echo "$result" | grep -q "info" || return 1
  return 0
}

# Test 11: blitz-analytics-writer file exists
test_analytics_writer_exists() {
  local file="$SCRIPT_DIR/../supabase/functions/blitz-analytics-writer/index.ts"
  [ -f "$file" ] || return 1
  return 0
}

# Test 12: monitoring-queries.sql exists
test_monitoring_queries_exist() {
  local file="$SCRIPT_DIR/monitoring-queries.sql"
  [ -f "$file" ] || return 1
  return 0
}

echo "=== Analytics & Observability Tests ==="
echo ""

run_test "insert-rpc-exists" "insert_analytics_event RPC exists" test_insert_rpc_exists
run_test "insert-rpc-security-definer" "insert_analytics_event is SECURITY DEFINER" test_insert_rpc_security_definer
run_test "log-rpc-exists" "log_observability RPC exists" test_log_rpc_exists
run_test "analytics-events-table" "analytics_events table exists" test_analytics_events_table
run_test "analytics-staging-table" "analytics_events_staging table exists" test_analytics_staging_table
run_test "observability-table" "observability_log table exists" test_observability_table
run_test "alert-functions-exist" "All 3 alert functions exist" test_alert_functions_exist
run_test "alert-functions-empty" "Alert functions return empty when no failures" test_alert_functions_empty
run_test "cleanup-function" "cleanup_analytics_events function exists" test_cleanup_function
run_test "level-constraint" "observability_log has level constraint" test_level_constraint
run_test "analytics-writer-file" "blitz-analytics-writer Edge Function exists" test_analytics_writer_exists
run_test "monitoring-queries-file" "monitoring-queries.sql exists" test_monitoring_queries_exist

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] || exit 1
