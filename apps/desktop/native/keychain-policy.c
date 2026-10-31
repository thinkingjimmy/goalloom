/**
 * [INPUT]: macOS Security framework and stable Node-API v8.
 * [OUTPUT]: disableInteraction() and application-private sessionKey() from session-key.m.
 * [POS]: Native credential boundary; legacy policy and modern noninteractive storage share one signed module.
 */
#include <Security/Security.h>
#include <node_api.h>

extern napi_value session_key(napi_env env, napi_callback_info info);
extern napi_value delete_session_key(napi_env env, napi_callback_info info);

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
      napi_set_named_property(env, exports, "disableInteraction", callback) != napi_ok ||
      napi_create_function(env, "sessionKey", NAPI_AUTO_LENGTH, session_key, NULL, &callback) != napi_ok ||
      napi_set_named_property(env, exports, "sessionKey", callback) != napi_ok ||
      napi_create_function(env, "deleteSessionKey", NAPI_AUTO_LENGTH, delete_session_key, NULL, &callback) != napi_ok ||
      napi_set_named_property(env, exports, "deleteSessionKey", callback) != napi_ok) return NULL;
  return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, initialize)
