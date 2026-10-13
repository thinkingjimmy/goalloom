#!/usr/bin/env bash
# Create or update a draft GitHub Release and upload auto-update assets.
# Never publishes, never passes --prerelease, and never edits a published release.
#
# Usage: draft-release.sh <asset-dir>
# Run from the repository root. Requires GH_TOKEN and GITHUB_SHA.
# GITHUB_REF is checked only when it is a tag.
set -euo pipefail

asset_dir="${1:?asset directory}"
version="$(node -p "require('./apps/desktop/package.json').version")"
root_version="$(node -p "require('./package.json').version")"
if [[ "$version" != "$root_version" ]]; then
  echo "Root package.json version ${root_version} does not match apps/desktop ${version}." >&2
  exit 1
fi

tag="v${version}"
notes="docs/releases/${tag}.md"
if [[ ! -f "$notes" ]]; then
  echo "Release notes not found: ${notes}" >&2
  exit 1
fi

if [[ "${GITHUB_REF:-}" == refs/tags/* ]]; then
  pushed="${GITHUB_REF#refs/tags/}"
  if [[ "$pushed" != "$tag" ]]; then
    echo "Pushed tag ${pushed} does not match package version ${tag}." >&2
    exit 1
  fi
fi

expected=(
  "Goalloom-${version}-mac-arm64.dmg"
  "Goalloom-${version}-mac-arm64.zip"
  "Goalloom-${version}-mac-arm64.zip.blockmap"
  "latest-mac.yml"
  "Goalloom-${version}-win-x64.exe"
  "Goalloom-${version}-win-x64.exe.blockmap"
  "latest.yml"
)

for name in "${expected[@]}"; do
  if [[ ! -f "${asset_dir}/${name}" ]]; then
    echo "Missing auto-update asset: ${asset_dir}/${name}" >&2
    exit 1
  fi
done

sums="${asset_dir}/SHA256SUMS.txt"
: > "$sums"
for name in "${expected[@]}"; do
  (cd "$asset_dir" && sha256sum "$name") >> "$sums"
done

tag_elsewhere=0
peeled="$(git ls-remote origin "refs/tags/${tag}^{}")"
target="${peeled%%[[:space:]]*}"
if [[ -n "$target" && "$target" != "$GITHUB_SHA" ]]; then
  tag_elsewhere=1
  echo "Tag ${tag} currently points at ${target}, not ${GITHUB_SHA}."
fi

# gh release create without --draft publishes after uploading files. Assets are
# uploaded in a separate call, and --draft=false / --prerelease are never passed.
if json="$(gh release view "$tag" --json isDraft,isPrerelease)"; then
  draft="$(jq -r '.isDraft' <<<"$json")"
  prerelease="$(jq -r '.isPrerelease' <<<"$json")"
  if [[ "$draft" != "true" ]]; then
    echo "Release ${tag} is already published. Refusing to publish, unpublish, or change prerelease (${prerelease})." >&2
    exit 1
  fi
  echo "Updating draft ${tag}. prerelease stays ${prerelease}; this script does not pass --prerelease."
  gh release edit "$tag" --draft --target "$GITHUB_SHA" --title "Goalloom ${version}" --notes-file "$notes"
else
  if [[ "$tag_elsewhere" == "1" ]]; then
    echo "Tag ${tag} points at another commit and there is no draft release to update. Refusing to move it." >&2
    exit 1
  fi
  echo "Creating draft ${tag} at ${GITHUB_SHA}."
  gh release create "$tag" --draft --target "$GITHUB_SHA" --title "Goalloom ${version}" --notes-file "$notes"
fi

upload=()
for name in "${expected[@]}"; do
  upload+=("${asset_dir}/${name}")
done
upload+=("$sums")
gh release upload "$tag" "${upload[@]}" --clobber

json="$(gh release view "$tag" --json isDraft,isPrerelease,url)"
draft="$(jq -r '.isDraft' <<<"$json")"
if [[ "$draft" != "true" ]]; then
  echo "Release ${tag} is not a draft after upload. This workflow must not publish." >&2
  exit 1
fi
echo "Draft release ready: $(jq -r '.url' <<<"$json")"
