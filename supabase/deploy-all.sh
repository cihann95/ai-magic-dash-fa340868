#!/usr/bin/env bash
set -euo pipefail

# Edge Functions Deploy Script
# Usage: bash supabase/deploy-all.sh [--project-ref <ref>]

PROJECT_REF="${1:-}"

# Parse --project-ref flag
while [[ $# -gt 0 ]]; do
  case $1 in
    --project-ref) PROJECT_REF="$2"; shift 2 ;;
    *) shift ;;
  esac
done

if [[ -z "$PROJECT_REF" ]]; then
  echo "❌ Usage: bash deploy-all.sh --project-ref <SUPABASE_PROJECT_REF>"
  exit 1
fi

echo "🚀 Deploying Edge Functions to project: $PROJECT_REF"

# Public endpoints (no JWT verification)
PUBLIC_FUNCTIONS=("price-feed" "news-feed")

# Auth-required functions
AUTH_FUNCTIONS=(
  "execute-trade"
  "manage-order"
  "ai-chat"
  "ai-analyze"
  "ai-risk-monitor"
  "ai-strategy"
  "ai-trade-coach"
  "blitz-join-private"
  "blitz-matchmake"
  "blitz-settle-room"
  "blitz-tick-order"
  "blitz-admin-topup"
  "blitz-analytics-writer"
  "daily-brief"
  "weekly-digest"
  "send-push"
  "trade-mirror"
  "reset-demo-account"
  "manage-follow"
  "manage-copy-settings"
  "health"
  "admin-list-users"
  "admin-set-user-role"
  "admin-ban-user"
  "admin-cancel-room"
  "admin-settle-room"
  "admin-slippage-config"
)

DEPLOYED=0
FAILED=0

echo ""
echo "📡 Deploying public endpoints (no JWT)..."
for fn in "${PUBLIC_FUNCTIONS[@]}"; do
  echo -n "  Deploying $fn... "
  if supabase functions deploy "$fn" --project-ref "$PROJECT_REF" --no-verify-jwt 2>&1; then
    echo "✅"
    ((DEPLOYED++))
  else
    echo "❌"
    ((FAILED++))
  fi
done

echo ""
echo "🔐 Deploying auth-required endpoints..."
for fn in "${AUTH_FUNCTIONS[@]}"; do
  echo -n "  Deploying $fn... "
  if supabase functions deploy "$fn" --project-ref "$PROJECT_REF" 2>&1; then
    echo "✅"
    ((DEPLOYED++))
  else
    echo "❌"
    ((FAILED++))
  fi
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Deployed: $DEPLOYED"
echo "❌ Failed: $FAILED"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [[ $FAILED -gt 0 ]]; then
  echo "⚠️  Some deployments failed. Check logs above."
  exit 1
fi

echo "🎉 All functions deployed successfully!"
