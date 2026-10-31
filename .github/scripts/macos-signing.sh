#!/usr/bin/env bash
# macOS Developer ID signing and notarization for the release workflow.
# Prints secret names only. Never prints CSC_LINK, CSC_KEY_PASSWORD,
# APPLE_API_KEY_P8, the keychain password, or the .p8 contents.
# [INPUT]: Release signing secrets, a temporary keychain and signed builder artifacts.
# [OUTPUT]: Signing setup, timestamp-signed/notarized DMG, verification and credential cleanup.
# [POS]: Hosted release adapter; shared build/notarize.mjs owns Apple submission/wait/stapling.
#
# Usage (from the repository root, on the macOS runner):
#   macos-signing.sh prepare
#   macos-signing.sh unlock
#   macos-signing.sh notarize-dmg
#   macos-signing.sh verify
#   macos-signing.sh cleanup
set -euo pipefail

command="${1:?prepare|unlock|notarize-dmg|verify|cleanup}"

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
  # Keep release notarization credentials separate from inherited Apple ID settings.
  # APPLE_TEAM_ID stays set for signature verification. The notarization helper
  # uses API-key credentials without --team-id.
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
  # unsigned: lets a non-Apple caller (electron-builder's node) use the key without a SecurityAgent prompt.
  local partition_out partition_status=0
  partition_out="$(security set-key-partition-list -S apple-tool:,apple:,codesign:,unsigned: -s -k "$password" "$keychain_path" 2>&1)" || partition_status=$?
  if [[ "$partition_status" -eq 0 ]]; then
    echo "set-key-partition-list succeeded."
  else
    echo "::error::set-key-partition-list failed."
    printf '%s\n' "$partition_out" | grep -F -v -- "$password" || true
    exit 1
  fi
  # shellcheck disable=SC2046
  security list-keychains -d user -s "$keychain_path" $(security list-keychains -d user | tr -d '"')

  # CSC_NAME is the common name only. electron-builder rejects the "Developer ID Application:" prefix.
  if [[ -z "${CSC_NAME:-}" || "$CSC_NAME" == *"Developer ID Application:"* ]]; then
    echo "::error::CSC_NAME must be the Developer ID common name, without the certificate prefix."
    exit 1
  fi
  if ! security find-identity -p codesigning -v "$keychain_path" | grep -F -q "\"Developer ID Application: ${CSC_NAME}\""; then
    echo "::error::Imported CSC_LINK has no Developer ID Application identity for CSC_NAME."
    exit 1
  fi

  if [[ -n "${GITHUB_ENV:-}" ]]; then
    printf 'APPLE_API_KEY=%s\n' "$key_path" >> "$GITHUB_ENV"
    # electron-builder 26.15.3, with CSC_LINK unset: MacPackager.codeSigningInfo
    # reads CSC_KEYCHAIN, buildSignOptions sets SignOptions.keychain, and
    # @electron/osx-sign adds `codesign --keychain`. mac.keychain is not a config key.
    printf 'CSC_KEYCHAIN=%s\n' "$keychain_path" >> "$GITHUB_ENV"
    # Keep alternate Apple credentials out of later release steps.
    # APPLE_KEYCHAIN is that flow's keychain name, not CSC_KEYCHAIN.
    printf 'APPLE_ID=\nAPPLE_APP_SPECIFIC_PASSWORD=\nAPPLE_KEYCHAIN=\nAPPLE_KEYCHAIN_PROFILE=\n' >> "$GITHUB_ENV"
  fi
  echo "Developer ID signing uses CSC_NAME (${CSC_NAME}) in the prepared keychain. Notarytool will use the App Store Connect API key at \$RUNNER_TEMP/AuthKey.p8."
}

unlock() {
  [[ -f "$password_path" && -f "$keychain_path" ]] || {
    echo "::error::Signing keychain is missing. The prepare step did not finish."
    exit 1
  }
  if [[ -z "${CSC_NAME:-}" || "$CSC_NAME" == *"Developer ID Application:"* ]]; then
    echo "::error::CSC_NAME must be the Developer ID common name, without the certificate prefix."
    exit 1
  fi
  local password identity probe entitlements pid i
  password="$(cat "$password_path")"
  security unlock-keychain -p "$password" "$keychain_path"
  # shellcheck disable=SC2046
  security list-keychains -d user -s "$keychain_path" $(security list-keychains -d user | tr -d '"')
  security default-keychain -s "$keychain_path"
  identity="Developer ID Application: ${CSC_NAME}"
  # Same flags as the codesign that hung (--timestamp --options runtime --entitlements)
  # on a Mach-O copy, and no --keychain so this uses the search list. osx-sign itself
  # still receives --keychain from CSC_KEYCHAIN; see the note in prepare.
  entitlements="apps/desktop/build/entitlements.mac.inherit.plist"
  [[ -f "$entitlements" ]] || {
    echo "::error::Missing ${entitlements}"
    exit 1
  }
  probe="${RUNNER_TEMP}/goalloom-sign-probe"
  cp /usr/bin/true "$probe"
  chmod u+w "$probe"
  codesign --sign "$identity" --force --timestamp --options runtime --entitlements "$entitlements" "$probe" &
  pid=$!
  for i in $(seq 1 20); do
    if ! kill -0 "$pid" 2>/dev/null; then
      if wait "$pid"; then
        rm -f "$probe"
        echo "codesign can use the prepared keychain."
        return
      fi
      rm -f "$probe"
      echo "::error::codesign could not sign a probe file with CSC_NAME."
      exit 1
    fi
    sleep 1
  done
  kill -9 "$pid" 2>/dev/null || true
  wait "$pid" 2>/dev/null || true
  rm -f "$probe"
  echo "::error::codesign did not finish in 20s. The keychain is probably waiting for an access prompt."
  exit 1
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
  if [[ -z "${CSC_NAME:-}" || "$CSC_NAME" == *"Developer ID Application:"* ]]; then
    echo "::error::CSC_NAME must be the Developer ID common name, without the certificate prefix."
    exit 1
  fi
  identity="Developer ID Application: ${CSC_NAME}"
  if ! security find-identity -p codesigning -v "$keychain_path" | grep -F -q "\"${identity}\""; then
    echo "::error::No Developer ID Application identity for CSC_NAME is available to sign the disk image."
    exit 1
  fi
  # The afterSign hook already notarized the app. Sign the container with the
  # secure timestamp missing from electron-builder 26's DMG signing path.
  echo "Signing the disk image with ${identity} and a secure timestamp."
  codesign --force --sign "$identity" --keychain "$keychain_path" --timestamp --verbose=2 "$dmg"
  node apps/desktop/scripts/build/notarize.mjs "$dmg"
}

verify() {
  local version app dmg zip meta dmg_gate
  require_secrets APPLE_TEAM_ID
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

  # codesign -dv prints the TeamIdentifier embedded in the signature. The comparison
  # below never prints APPLE_TEAM_ID.
  require_team() {
    local label="$1" file="$2" details team
    details="$(codesign -dv --verbose=4 "$file" 2>&1)"
    printf '%s\n' "$details"
    grep -q 'Developer ID Application' <<<"$details"
    if [[ "$label" == "Application" ]] && ! grep -q '(runtime)' <<<"$details"; then
      echo "::error::Application is not signed with the hardened runtime."
      exit 1
    fi
    team="$(sed -n 's/^TeamIdentifier=//p' <<<"$details" | head -n 1)"
    if [[ -z "$team" || "$team" == "not set" ]]; then
      echo "::error::${label} codesign -dv did not report a TeamIdentifier."
      exit 1
    fi
    echo "${label} TeamIdentifier=${team}"
    if [[ "$team" != "$APPLE_TEAM_ID" ]]; then
      echo "::error::${label} TeamIdentifier does not match APPLE_TEAM_ID."
      exit 1
    fi
  }

  echo "Verifying the application bundle."
  codesign --verify --deep --strict --verbose=2 "$app"
  require_team "Application" "$app"

  echo "Verifying the disk image."
  codesign --verify --deep --strict --verbose=2 "$dmg"
  require_team "Disk image" "$dmg"

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

  node apps/desktop/scripts/build/notarize.mjs --validate-ticket "$app"
  node apps/desktop/scripts/build/notarize.mjs --validate-ticket "$dmg"
  echo "macOS code signing, Gatekeeper assessment, and stapled notarization tickets passed."
}

cleanup() {
  set +e
  security delete-keychain "$keychain_path" >/dev/null 2>&1
  rm -f "$key_path" "$p12_path" "$password_path" "$keychain_path" "${RUNNER_TEMP}/goalloom.provisionprofile"
  set -e
  echo "Removed the temporary Apple API key, certificate, and signing keychain."
}

case "$command" in
  prepare) prepare ;;
  unlock) unlock ;;
  notarize-dmg) notarize_dmg ;;
  verify) verify ;;
  cleanup) cleanup ;;
  *)
    echo "Unknown command: ${command}" >&2
    exit 2
    ;;
esac
