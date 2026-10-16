/**
 * [INPUT]: macOS Security framework and stable Node-API v8.
 * [OUTPUT]: disableInteraction(): whether Keychain UI is disabled for this process.
 * [POS]: Credential interaction policy only; it never reads secrets or changes keychain access controls.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
#include <Security/Security.h>
#include <node_api.h>

static napi_value disable_interaction(napi_env env, napi_callback_info info) {
  (void)info;
  Boolean allowed = true;
  // File-based keychains ignore the newer per-query UI flag. Chromium uses this
  // same process policy until Apple provides an equivalent for those keychains.
  OSStatus status = SecKeychainSetUserInteractionAllowed(false);
  if (status == errSecSuccess) status = SecKeychainGetUserInteractionAllowed(&allowed);
  napi_value result;
  if (napi_get_boolean(env, status == errSecSuccess && !allowed, &result) != napi_ok) return NULL;
  return result;
}

static napi_value initialize(napi_env env, napi_value exports) {
  napi_value callback;
  if (napi_create_function(env, "disableInteraction", NAPI_AUTO_LENGTH, disable_interaction, NULL, &callback) != napi_ok ||
      napi_set_named_property(env, exports, "disableInteraction", callback) != napi_ok) return NULL;
  return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, initialize)
