#!/usr/bin/env bash
# Create a NEW PRIVATE repo and publish only this documentation bundle.
# Requires Git, GitHub CLI, and an authenticated thinkingjimmy account.
# Never changes or deletes existing remote repositories; never force-pushes.
set -euo pipefail

EXPECTED_OWNER="thinkingjimmy"
REPO_NAME="goalloom"
FULL_NAME="${EXPECTED_OWNER}/${REPO_NAME}"
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
cd "$ROOT"

die() { printf '\nERROR: %s\n' "$*" >&2; exit 1; }
for tool in git gh; do
  command -v "$tool" >/dev/null 2>&1 || die "Install ${tool} before running this script."
done
for required in README.md AGENTS.md CREATE_REPO.md docs/PRD.md docs/TODO.md .gitignore .gitattributes; do
  [[ -f "$required" ]] || die "Missing expected bundle file: ${required}"
done

# Never initialize inside another project or reuse a local worktree.
if git rev-parse --is-inside-work-tree >/dev/null 2>&1 || [[ -e .git ]]; then
  die "This folder is already in a Git worktree. Use a fresh extraction, or inspect and publish manually. No changes made."
fi

LOGIN="$(gh api --hostname github.com user --jq .login)" || die "Run gh auth login for github.com, then retry."
[[ "$LOGIN" == "$EXPECTED_OWNER" ]] || die "Signed in as ${LOGIN}, expected ${EXPECTED_OWNER}. Refusing to create or upload."

# A network error may also make this lookup fail. Creation remains the final
# authoritative check; failure there stops before any push to an existing repo.
if gh repo view "github.com/${FULL_NAME}" --json nameWithOwner --jq .nameWithOwner >/dev/null 2>&1; then
  die "Remote ${FULL_NAME} already exists. Refusing to modify it. Inspect it and use a deliberate existing-repo workflow."
fi

[[ -n "$(git config --get user.name || true)" ]] || die "Configure your own Git user.name, then retry."
[[ -n "$(git config --get user.email || true)" ]] || die "Configure your own Git user.email, then retry."

printf 'Preparing documentation for PRIVATE repository github.com/%s\n' "$FULL_NAME"
git init -b main
git add -- README.md AGENTS.md CREATE_REPO.md docs scripts .gitignore .gitattributes
git commit -m "docs: add Goalloom v0.3 product requirements and development plan"

# Deliberately do not use --push: verify privacy before uploading screenshots.
if ! GH_HOST=github.com gh repo create "$FULL_NAME" \
  --private \
  --source=. \
  --remote=origin \
  --description "A goal-linked personal todo board across five time horizons."; then
  die "Remote creation failed or partially completed. Local commit is preserved. Inspect GitHub and origin before retrying; nothing was force-pushed."
fi

VISIBILITY="$(gh repo view "github.com/${FULL_NAME}" --json visibility --jq .visibility)" || die "Unable to verify remote privacy. No documents pushed. Inspect remote before continuing."
[[ "$VISIBILITY" == "PRIVATE" ]] || die "Remote visibility is ${VISIBILITY}, not PRIVATE. No documents pushed."

ORIGIN="$(git remote get-url origin)"
case "$ORIGIN" in
  "https://github.com/${FULL_NAME}.git"|"https://github.com/${FULL_NAME}"|"git@github.com:${FULL_NAME}.git"|"git@github.com:${FULL_NAME}"|"ssh://git@github.com/${FULL_NAME}.git"|"ssh://git@github.com/${FULL_NAME}") ;;
  *) die "Unexpected origin URL. Refusing to push. Inspect git remote -v." ;;
esac

git push -u origin main
gh repo view "github.com/${FULL_NAME}" --json nameWithOwner,visibility,url
printf '\nUpload command completed. Read the README and docs on GitHub to verify the content.\n'
