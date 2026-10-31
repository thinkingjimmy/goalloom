#!/usr/bin/env bash
# Stages only selected-platform assets in an unpublished draft. Never edits a published release.
set -euo pipefail
asset_dir="${1:?asset directory}"
platform="${GOALLOOM_RELEASE_PLATFORM:?platform is required}"
version="$(node -p "require('./apps/desktop/package.json').version")"
root_version="$(node -p "require('./package.json').version")"
[[ "$version" == "$root_version" ]]
tag="v${version}"
notes="docs/releases/${tag}.md"
[[ -f "$notes" ]]
names=()
case "$platform" in
  mac|both) names+=("Goalloom-${version}-mac-arm64.dmg" "Goalloom-${version}-mac-arm64.zip" "Goalloom-${version}-mac-arm64.zip.blockmap" "latest-mac.yml") ;;
  windows) ;;
  *) exit 1 ;;
esac
if [[ "$platform" == windows || "$platform" == both ]]; then
  names+=("Goalloom-${version}-win-x64.exe" "Goalloom-${version}-win-x64.exe.blockmap" "latest.yml")
fi
for name in "${names[@]}"; do [[ -f "$asset_dir/$name" ]] || { echo "Missing selected-platform asset: $name" >&2; exit 1; }; done
if metadata="$(gh release view "$tag" --json isDraft,targetCommitish)"; then
  [[ "$(jq -r .isDraft <<<"$metadata")" == true ]] || { echo 'Published releases are immutable.' >&2; exit 1; }
  [[ "$(jq -r .targetCommitish <<<"$metadata")" == "$GITHUB_SHA" ]] || { echo 'Draft source differs; inspect it before continuing.' >&2; exit 1; }
else
  # Only an observed HTTP 404 establishes absence. Unknown transport outcomes never authorize creation.
  response="$(mktemp)"
  trap 'rm -f "$response"' EXIT
  require_absent() {
    gh api --include "$1" > "$response" 2>/dev/null || true
    status="$(head -1 "$response" | awk '{print $2}')"
    [[ "$status" == 404 ]] || { echo 'Absence was not confirmed; inspect provider state before continuing.' >&2; exit 1; }
  }
  require_absent "repos/${GITHUB_REPOSITORY}/releases/tags/${tag}"
  require_absent "repos/${GITHUB_REPOSITORY}/git/ref/tags/${tag}"
  gh release create "$tag" --draft --target "$GITHUB_SHA" --title "Goalloom $version" --notes-file "$notes"
fi
sums="$asset_dir/SHA256SUMS.txt"
: > "$sums"
for name in "${names[@]}"; do (cd "$asset_dir" && sha256sum "$name") >> "$sums"; done
upload=()
for name in "${names[@]}"; do upload+=("$asset_dir/$name"); done
gh release upload "$tag" "${upload[@]}" "$sums"
[[ "$(gh release view "$tag" --json isDraft --jq .isDraft)" == true ]]
