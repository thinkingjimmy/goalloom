#!/bin/bash
# Local preflight checks before triggering release workflow
# Run this on your dev machine before clicking "Run workflow"
set -euo pipefail

echo "🚀 Local release preflight checks"
echo ""
echo "This script verifies your local environment before you trigger"
echo "the GitHub Actions release workflow."
echo ""

FAILED=0

# Check 1: Clean working directory
echo "✓ Checking git status..."
if [ -n "$(git status --porcelain)" ]; then
  echo "  ⚠️  Working directory has uncommitted changes:"
  git status --short
  echo ""
  read -p "  Continue anyway? (y/n) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
  fi
else
  echo "  ✓ Working directory clean"
fi

echo ""

# Check 2: On main branch
echo "✓ Checking current branch..."
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "main" ]; then
  echo "  ⚠️  You are on branch '$CURRENT_BRANCH' (not 'main')"
  read -p "  Continue anyway? (y/n) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
  fi
else
  echo "  ✓ On main branch"
fi

echo ""

# Check 3: Up to date with remote
echo "✓ Checking if up to date with origin..."
git fetch origin -q
LOCAL=$(git rev-parse @)
REMOTE=$(git rev-parse @{u} 2>/dev/null || echo "")
BASE=$(git merge-base @ @{u} 2>/dev/null || echo "")

if [ -z "$REMOTE" ]; then
  echo "  ⚠️  No upstream branch set"
elif [ "$LOCAL" = "$REMOTE" ]; then
  echo "  ✓ Up to date with origin/$CURRENT_BRANCH"
elif [ "$LOCAL" = "$BASE" ]; then
  echo "  ⚠️  Local branch is behind origin/$CURRENT_BRANCH"
  echo "  Run: git pull"
  FAILED=1
elif [ "$REMOTE" = "$BASE" ]; then
  echo "  ⚠️  Local branch has unpushed commits"
  echo "  Run: git push"
  FAILED=1
else
  echo "  ⚠️  Local and remote have diverged"
  FAILED=1
fi

echo ""

# Check 4: Version in package.json
echo "✓ Checking version..."
VERSION=$(cat package.json | grep '"version"' | head -1 | grep -o '[0-9]\+\.[0-9]\+\.[0-9]\+')
echo "  Current version: $VERSION"
echo "  Make sure this is the version you want to release"

echo ""

# Check 5: Recent verify passed
echo "✓ Checking recent verify..."
if [ -f "apps/desktop/output/tests/verify-latest.log" ]; then
  VERIFY_AGE=$(( $(date +%s) - $(stat -f %m apps/desktop/output/tests/verify-latest.log 2>/dev/null || stat -c %Y apps/desktop/output/tests/verify-latest.log 2>/dev/null || echo 0) ))
  if [ $VERIFY_AGE -lt 3600 ]; then
    echo "  ✓ Recent verify found (${VERIFY_AGE}s ago)"
  else
    echo "  ⚠️  verify is old (${VERIFY_AGE}s ago)"
    echo "  Recommend running: pnpm verify:parallel"
  fi
else
  echo "  ⚠️  No recent verify found"
  echo "  Recommend running: pnpm verify:parallel"
fi

echo ""

# Check 6: Apple credentials check (if available)
if [ -f "$HOME/.goalloom-release-credentials" ]; then
  echo "✓ Release credentials configured"
else
  echo "⚠️  Release credentials file not found: $HOME/.goalloom-release-credentials"
  echo "  (This is OK if you don't have release access)"
fi

echo ""

# Summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ $FAILED -eq 0 ]; then
  echo "✅ Local preflight checks passed"
  echo ""
  echo "You can now trigger the release workflow on GitHub:"
  echo "  1. Go to: https://github.com/thinkingjimmy/goalloom/actions/workflows/release.yml"
  echo "  2. Click 'Run workflow'"
  echo "  3. Check 'update_draft' if you want to publish to GitHub Releases"
  echo ""
  exit 0
else
  echo "❌ Local preflight checks failed"
  echo ""
  echo "Please fix the issues above before releasing."
  exit 1
fi
