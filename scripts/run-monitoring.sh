#!/usr/bin/env bash
# Run Blitz monitoring queries and exit with alert status.
# Usage: ./scripts/run-monitoring.sh [--json]
# Requires: psql with $DATABASE_URL or $SUPABASE_DB_URL set

set -euo pipefail

DB_URL="${DATABASE_URL:-${SUPABASE_DB_URL:-}}"
if [ -z "$DB_URL" ]; then
  echo "ERROR: Set DATABASE_URL or SUPABASE_DB_URL" >&2
  exit 1
fi

ALERT=0
QUERY_FILE="$(dirname "$0")/monitoring-queries.sql"

while IFS= read -r line; do
  if [[ "$line" == SELECT* ]]; then
    alert_type=$(echo "$line" | sed -n "s/.*'\([^']*\)'.*/\1/p")
    result=$(psql "$DB_URL" -t -A -c "$line" 2>/dev/null || echo "ERROR")
    
    if [[ "$result" == "ERROR" ]]; then
      echo "[ERROR] Failed to run check: $alert_type" >&2
      ALERT=1
    elif [[ "$result" != "0" && "$result" != "[]" && -n "$result" ]]; then
      echo "[ALERT] $alert_type: $result"
      ALERT=1
    else
      echo "[OK] $alert_type: clean"
    fi
  fi
done < "$QUERY_FILE"

exit $ALERT
