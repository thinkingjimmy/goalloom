#!/bin/bash
# Release preflight checks
# Catches common issues before they waste CI time
set -euo pipefail

echo "🔍 Running release preflight checks..."
echo ""

FAILED=0

# Check 1: Apple Profile validation (if in release environment)
if [ -n "${APPLE_API_KEY:-}" ] && [ -n "${APPLE_API_KEY_ID:-}" ]; then
  echo "✓ Checking Apple Developer profile..."

  if command -v xcrun >/dev/null 2>&1; then
    # On macOS: verify profile via session-profile.mjs if available
    if [ -f "apps/desktop/scripts/build/session-profile.mjs" ]; then
      if node apps/desktop/scripts/build/session-profile.mjs --verify 2>/dev/null; then
        echo "  ✓ Apple profile valid"
      else
        echo "  ❌ Apple profile check failed or profile invalid"
        echo "  Action: Regenerate profile in Apple Developer portal"
        FAILED=1
      fi
    else
      echo "  ⚠️  Profile script not found, skipping detailed check"
    fi
  else
    echo "  ⚠️  Not on macOS, skipping profile check"
  fi
else
  echo "⚠️  Apple credentials not set, skipping profile check"
fi

echo ""

# Check 2: Signing credentials
echo "✓ Checking signing credentials..."

if [ -n "${CSC_LINK:-}" ]; then
  echo "  ✓ CSC_LINK present"
else
  echo "  ⚠️  CSC_LINK not set (required for release signing)"
  if [ "${GOALLOOM_REQUIRE_NOTARIZATION:-0}" = "1" ]; then
    FAILED=1
  fi
fi

if [ -n "${CSC_KEY_PASSWORD:-}" ]; then
  echo "  ✓ CSC_KEY_PASSWORD present"
else
  echo "  ⚠️  CSC_KEY_PASSWORD not set"
  if [ "${GOALLOOM_REQUIRE_NOTARIZATION:-0}" = "1" ]; then
    FAILED=1
  fi
fi

echo ""

# Check 3: Notarization credentials
echo "✓ Checking notarization credentials..."

REQUIRED_CREDS=("APPLE_API_KEY" "APPLE_API_KEY_ID" "APPLE_API_ISSUER")
MISSING_CREDS=()

for cred in "${REQUIRED_CREDS[@]}"; do
  if [ -n "${!cred:-}" ]; then
    echo "  ✓ $cred present"
  else
    echo "  ⚠️  $cred not set"
    MISSING_CREDS+=("$cred")
  fi
done

if [ ${#MISSING_CREDS[@]} -gt 0 ] && [ "${GOALLOOM_REQUIRE_NOTARIZATION:-0}" = "1" ]; then
  echo "  ❌ Missing required credentials: ${MISSING_CREDS[*]}"
  FAILED=1
fi

echo ""

# Check 4: Display resolution (macOS only, for native tests)
if command -v system_profiler >/dev/null 2>&1; then
  echo "✓ Checking display resolution..."

  RESOLUTION=$(system_profiler SPDisplaysDataType 2>/dev/null | grep -o 'Resolution: [0-9]* x [0-9]*' || echo "Resolution: 0 x 0")
  WIDTH=$(echo "$RESOLUTION" | grep -o '[0-9]*' | head -1)

  if [ "${WIDTH:-0}" -ge 1440 ]; then
    echo "  ✓ Display resolution adequate: $RESOLUTION"
  else
    echo "  ⚠️  Display resolution may be too small: $RESOLUTION"
    echo "  Native interaction tests require at least 1440x900"
  fi
else
  echo "⚠️  Not on macOS, skipping display check"
fi

echo ""

# Check 5: pnpm and node versions
echo "✓ Checking toolchain versions..."

if command -v node >/dev/null 2>&1; then
  NODE_VERSION=$(node --version)
  echo "  ✓ Node: $NODE_VERSION"
else
  echo "  ❌ Node not found"
  FAILED=1
fi

if command -v pnpm >/dev/null 2>&1; then
  PNPM_VERSION=$(pnpm --version)
  echo "  ✓ pnpm: $PNPM_VERSION"
else
  echo "  ❌ pnpm not found"
  FAILED=1
fi

echo ""

# Summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ $FAILED -eq 0 ]; then
  echo "✅ All preflight checks passed"
  exit 0
else
  echo "❌ Preflight checks failed"
  echo ""
  echo "Please fix the issues above before releasing."
  echo "Run this script again to verify fixes."
  exit 1
fi
