#!/usr/bin/env bash
# macOS Developer ID signing and notarization for the release workflow.
# Prints secret names only. Never prints CSC_LINK, CSC_KEY_PASSWORD,
# APPLE_API_KEY_P8, the keychain password, or the .p8 contents.
#
# Usage (from the repository root, on the macOS runner):
#   macos-signing.sh prepare
#   macos-signing.sh notarize-dmg
#   macos-signing.sh verify
#   macos-signing.sh cleanup
set -euo pipefail

command="${1:?prepare|notarize-dmg|verify|cleanup}"

key_path="${RUNNER_TEMP:?}/AuthKey.p8"
p12_path="${RUNNER_TEMP}/developer-id.p12"
keychain_path="${RUNNER_TEMP}/goalloom-signing.keychain-db"
password_path="${RUNNER_TEMP}/goalloom-keychain-password"

require_secrets() {
  local missing=() name
  for name in "$@"; do
    if [[ -z "${!name:-}" ]]; then
      missing+=("$name")
    fi
  done
  if ((${#missing[@]})); then
    echo "::error title=macOS signing secrets missing::Refusing to build an unsigned package. Empty: ${missing[*]}"
    exit 1
  fi
}

prepare() {
  require_secrets CSC_LINK CSC_KEY_PASSWORD APPLE_API_KEY_P8 APPLE_API_KEY_ID APPLE_API_ISSUER APPLE_TEAM_ID
  # API-key notarization is selected only when the Apple ID password flow is unset.
  # APPLE_TEAM_ID stays set for the workflow; electron-builder 26 passes teamId to
  # notarytool only for Apple ID credentials, and combining it with an API key is rejected.
  unset APPLE_ID APPLE_APP_SPECIFIC_PASSWORD APPLE_KEYCHAIN APPLE_KEYCHAIN_PROFILE CSC_IDENTITY_AUTO_DISCOVERY

  umask 077
  printf '%s\n' "$APPLE_API_KEY_P8" | tr -d '\r' > "$key_path"
  chmod 600 "$key_path"
  if ! grep -q -- '-----BEGIN PRIVATE KEY-----' "$key_path" && ! grep -q -- '-----BEGIN EC PRIVATE KEY-----' "$key_path"; then
    echo "::error::APPLE_API_KEY_P8 is not a PEM private key. The release workflow expects the raw .p8 text."
    exit 1
  fi

  printf '%s' "$CSC_LINK" | tr -d '[:space:]' | base64 -D > "$p12_path"
  chmod 600 "$p12_path"
  if [[ ! -s "$p12_path" ]]; then
    echo "::error::CSC_LINK did not decode to a certificate file."
    exit 1
  fi

  if [[ -f "$keychain_path" ]]; then
    security delete-keychain "$keychain_path" >/dev/null 2>&1 || true
    rm -f "$keychain_path"
  fi
  local password
  password="$(openssl rand -base64 32)"
  printf '%s' "$password" > "$password_path"
  chmod 600 "$password_path"
  security create-keychain -p "$password" "$keychain_path"
  security set-keychain-settings -lut 21600 "$keychain_path"
  security unlock-keychain -p "$password" "$keychain_path"
  security import "$p12_path" -k "$keychain_path" -P "$CSC_KEY_PASSWORD" -T /usr/bin/codesign -T /usr/bin/security >/dev/null
  rm -f "$p12_path"
  security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$password" "$keychain_path" >/dev/null
  # shellcheck disable=SC2046
  security list-keychains -d user -s "$keychain_path" $(security list-keychains -d user | tr -d '"')

  if ! security find-identity -p codesigning -v "$keychain_path" | grep -q 'Developer ID Application'; then
    echo "::error::Imported CSC_LINK has no Developer ID Application identity."
    exit 1
  fi

  if [[ -n "${GITHUB_ENV:-}" ]]; then
    printf 'APPLE_API_KEY=%s\n' "$key_path" >> "$GITHUB_ENV"
    # Keep the Apple ID flow from stealing notarization if a runner image sets it.
    printf 'APPLE_ID=\nAPPLE_APP_SPECIFIC_PASSWORD=\nAPPLE_KEYCHAIN=\nAPPLE_KEYCHAIN_PROFILE=\n' >> "$GITHUB_ENV"
  fi
  echo "Developer ID signing is enabled. Notarytool will use the App Store Connect API key at \$RUNNER_TEMP/AuthKey.p8."
}

notarize_dmg() {
  require_secrets APPLE_API_KEY APPLE_API_KEY_ID APPLE_API_ISSUER
  [[ -f "$password_path" && -f "$keychain_path" ]] || {
    echo "::error::Signing keychain is missing. The prepare step did not finish."
    exit 1
  }
  local version dmg password identity
  version="$(node -p "require('./apps/desktop/package.json').version")"
  dmg="apps/desktop/release/Goalloom-${version}-mac-arm64.dmg"
  [[ -f "$dmg" ]] || {
    echo "::error::Missing ${dmg}"
    exit 1
  }
  password="$(cat "$password_path")"
  security unlock-keychain -p "$password" "$keychain_path"
  identity="$(security find-identity -p codesigning -v "$keychain_path" | sed -n 's/.*"\(Developer ID Application:[^"]*\)".*/\1/p' | head -n 1)"
  [[ -n "$identity" ]] || {
    echo "::error::No Developer ID Application identity is available to sign the disk image."
    exit 1
  }
  # electron-builder 26 signs a DMG only when dmg.sign is true, and then without a
  # secure timestamp, which notarytool rejects. Sign it here, then notarize the
  # container. The .app was already notarized by electron-builder.
  echo "Signing the disk image with Developer ID and a secure timestamp."
  codesign --force --sign "$identity" --keychain "$keychain_path" --timestamp --verbose=2 "$dmg"
  echo "Submitting the disk image to notarytool."
  xcrun notarytool submit "$dmg" \
    --key "$APPLE_API_KEY" \
    --key-id "$APPLE_API_KEY_ID" \
    --issuer "$APPLE_API_ISSUER" \
    --wait \
    --timeout 30m
  xcrun stapler staple "$dmg"
}

verify() {
  local version app dmg zip meta output team dmg_gate
  version="$(node -p "require('./apps/desktop/package.json').version")"
  app="apps/desktop/release/mac-arm64/Goalloom.app"
  dmg="apps/desktop/release/Goalloom-${version}-mac-arm64.dmg"
  zip="apps/desktop/release/Goalloom-${version}-mac-arm64.zip"
  meta="apps/desktop/release/latest-mac.yml"
  [[ -d "$app" && -f "$dmg" && -s "$zip" && -s "${zip}.blockmap" && -s "$meta" ]] || {
    echo "::error::Signed macOS auto-update files are missing (.app, .dmg, .zip, .blockmap, or latest-mac.yml)."
    exit 1
  }
  if ! grep -F "Goalloom-${version}-mac-arm64.zip" "$meta" >/dev/null; then
    echo "::error::latest-mac.yml does not name the arm64 zip."
    exit 1
  fi

  echo "Verifying the application bundle."
  codesign --verify --deep --strict --verbose=2 "$app"
  output="$(codesign -dv --verbose=4 "$app" 2>&1)"
  printf '%s\n' "$output"
  grep -q 'Developer ID Application' <<<"$output"
  grep -q '(runtime)' <<<"$output"

  echo "Verifying the disk image."
  codesign --verify --deep --strict --verbose=2 "$dmg"
  output="$(codesign -dv --verbose=4 "$dmg" 2>&1)"
  printf '%s\n' "$output"
  grep -q 'Developer ID Application' <<<"$output"
  team="$(sed -n 's/^TeamIdentifier=//p' <<<"$output" | head -n 1)"
  if [[ -z "$team" || "$team" == "not set" ]]; then
    echo "::error::Disk image codesign -dv did not report a TeamIdentifier."
    exit 1
  fi
  echo "Disk image TeamIdentifier=${team}"

  assess() {
    local result
    result="$(spctl -a -vv "$@" 2>&1)" || {
      printf '%s\n' "$result"
      return 1
    }
    printf '%s\n' "$result"
    grep -q 'accepted' <<<"$result"
    grep -E -q 'Notarized Developer ID|source=Notarized' <<<"$result"
  }
  assess --type execute "$app"
  # A disk image is not an executable. Without context:primary-signature,
  # `spctl -t open` reports source=Insufficient Context after the ticket is stapled.
  dmg_gate="$(spctl -a -vvv -t open --context context:primary-signature "$dmg" 2>&1)" || {
    printf '%s\n' "$dmg_gate"
    echo "::error::Disk image Gatekeeper assessment failed."
    exit 1
  }
  printf '%s\n' "$dmg_gate"
  if ! grep -q 'accepted' <<<"$dmg_gate" || ! grep -E -q 'Notarized Developer ID|source=Notarized' <<<"$dmg_gate"; then
    echo "::error::Disk image was not accepted as a notarized Developer ID."
    exit 1
  fi

  staple() {
    local result
    result="$(xcrun stapler validate "$1" 2>&1)" || {
      printf '%s\n' "$result"
      return 1
    }
    printf '%s\n' "$result"
    grep -q 'The validate action worked' <<<"$result"
  }
  staple "$app"
  staple "$dmg"
  echo "macOS code signing, Gatekeeper assessment, and stapled notarization tickets passed."
}

cleanup() {
  set +e
  security delete-keychain "$keychain_path" >/dev/null 2>&1
  rm -f "$key_path" "$p12_path" "$password_path" "$keychain_path"
  set -e
  echo "Removed the temporary Apple API key, certificate, and signing keychain."
}

case "$command" in
  prepare) prepare ;;
  notarize-dmg) notarize_dmg ;;
  verify) verify ;;
  cleanup) cleanup ;;
  *)
    echo "Unknown command: ${command}" >&2
    exit 2
    ;;
esac
