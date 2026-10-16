/**
 * [INPUT]: A private /private/tmp/goalloom-native-keychain-* fixture path and a synthetic credential operation.
 * [OUTPUT]: Status and interaction policy, as a CLI or test-only Node-API probe; no secret bytes are printed.
 * [POS]: Real macOS trust/lock probe using Chromium's SecItem API shape. Electron mode relies on the production policy and refuses access while UI is allowed.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
#import <Foundation/Foundation.h>
#import <Security/Security.h>
#include <string.h>
#ifdef GOALLOOM_KEYCHAIN_NODE
#include <node_api.h>
#include <limits.h>
#endif

static NSDictionary *operate(const char *action, const char *path, const char *readerPath) {
  @autoreleasepool {
    const char *prefix = "/private/tmp/goalloom-native-keychain-";
    BOOL privateOnly = strncmp(path, prefix, strlen(prefix)) == 0;
    Boolean allowed = true;
    OSStatus policy = SecKeychainGetUserInteractionAllowed(&allowed);
    BOOL disabled = policy == errSecSuccess && !allowed;
    if (!privateOnly || !disabled || strcmp(action, "policy") == 0) {
      return @{@"status": @(privateOnly && disabled ? errSecSuccess : errSecInteractionNotAllowed), @"interactionDisabled": @(disabled), @"privateKeychainOnly": @(privateOnly)};
    }
    const char *password = "synthetic-keychain-password";
    const char *service = "Goalloom Native Credential Fixture";
    const char *account = "fixture-only";
    const char *secret = "synthetic-secret-never-printed";
    SecKeychainRef keychain = NULL;
    OSStatus status;
    if (strcmp(action, "create") == 0) {
      status = SecKeychainCreate(path, (UInt32)strlen(password), password, false, NULL, &keychain);
      if (status == errSecSuccess && (!readerPath || !strlen(readerPath))) {
        NSDictionary *attributes = @{
          (__bridge id)kSecClass: (__bridge id)kSecClassGenericPassword,
          (__bridge id)kSecUseKeychain: (__bridge id)keychain,
          (__bridge id)kSecAttrService: @(service),
          (__bridge id)kSecAttrAccount: @(account),
          (__bridge id)kSecAttrAccessible: (__bridge id)kSecAttrAccessibleWhenUnlocked,
          (__bridge id)kSecValueData: [NSData dataWithBytes:secret length:strlen(secret)],
        };
        status = SecItemAdd((__bridge CFDictionaryRef)attributes, NULL);
      } else if (status == errSecSuccess) {
        SecKeychainAttribute attributes[] = {
          { kSecServiceItemAttr, (UInt32)strlen(service), (void *)service },
          { kSecAccountItemAttr, (UInt32)strlen(account), (void *)account },
        };
        SecKeychainAttributeList list = {2, attributes};
        SecAccessRef access = NULL;
        if (readerPath && strlen(readerPath)) {
          SecTrustedApplicationRef owner = NULL, reader = NULL;
          status = SecTrustedApplicationCreateFromPath(NULL, &owner);
          if (status == errSecSuccess) status = SecTrustedApplicationCreateFromPath(readerPath, &reader);
          if (status == errSecSuccess) {
            const void *values[] = {owner, reader};
            CFArrayRef trusted = CFArrayCreate(NULL, values, 2, &kCFTypeArrayCallBacks);
            status = SecAccessCreate(CFSTR("Goalloom native fixture"), trusted, &access);
            CFRelease(trusted);
          }
          if (owner) CFRelease(owner);
          if (reader) CFRelease(reader);
        }
        if (status == errSecSuccess) status = SecKeychainItemCreateFromContent(kSecGenericPasswordItemClass, &list, (UInt32)strlen(secret), secret, keychain, access, NULL);
        if (access) CFRelease(access);
      }
    } else {
      status = SecKeychainOpen(path, &keychain);
      if (status == errSecSuccess && strcmp(action, "read-locked") != 0) status = SecKeychainUnlock(keychain, (UInt32)strlen(password), password, true);
      if (status == errSecSuccess && strcmp(action, "lock") == 0) {
        status = SecKeychainLock(keychain);
      } else if (status == errSecSuccess && strcmp(action, "delete") == 0) {
        status = SecKeychainDelete(keychain);
      } else if (status == errSecSuccess && (strcmp(action, "read") == 0 || strcmp(action, "read-locked") == 0)) {
        NSDictionary *query = @{
          (__bridge id)kSecClass: (__bridge id)kSecClassGenericPassword,
          (__bridge id)kSecMatchSearchList: @[(__bridge id)keychain],
          (__bridge id)kSecAttrService: @(service),
          (__bridge id)kSecAttrAccount: @(account),
          (__bridge id)kSecMatchLimit: (__bridge id)kSecMatchLimitOne,
          (__bridge id)kSecReturnData: @YES,
          (__bridge id)kSecReturnAttributes: @YES,
        };
        CFTypeRef result = NULL;
        status = SecItemCopyMatching((__bridge CFDictionaryRef)query, &result);
        NSDictionary *found = CFBridgingRelease(result);
        NSData *data = found[(__bridge id)kSecValueData];
        if (status == errSecSuccess && (!data || data.length != strlen(secret) || memcmp(data.bytes, secret, data.length) != 0)) status = errSecDecode;
      } else if (status == errSecSuccess) status = errSecParam;
    }
    if (keychain) CFRelease(keychain);
    return @{@"status": @(status), @"interactionDisabled": @(disabled), @"privateKeychainOnly": @(privateOnly)};
  }
}

#ifdef GOALLOOM_KEYCHAIN_NODE
static napi_value operation(napi_env env, napi_callback_info info) {
  @autoreleasepool {
    size_t count = 3;
    napi_value args[3];
    char values[3][PATH_MAX] = {{0}};
    if (napi_get_cb_info(env, info, &count, args, NULL, NULL) != napi_ok || count != 3) {
      napi_throw_type_error(env, NULL, "Expected action, private path and optional reader path");
      return NULL;
    }
    for (size_t index = 0; index < count; index++) {
      size_t length;
      if (napi_get_value_string_utf8(env, args[index], values[index], PATH_MAX, &length) != napi_ok || length >= PATH_MAX - 1) {
        napi_throw_type_error(env, NULL, "Expected bounded fixture strings");
        return NULL;
      }
    }
    NSData *json = [NSJSONSerialization dataWithJSONObject:operate(values[0], values[1], values[2]) options:0 error:NULL];
    napi_value result;
    if (napi_create_string_utf8(env, json.bytes, json.length, &result) != napi_ok) return NULL;
    return result;
  }
}
static napi_value initialize(napi_env env, napi_value exports) {
  napi_value callback;
  if (napi_create_function(env, "operation", NAPI_AUTO_LENGTH, operation, NULL, &callback) != napi_ok || napi_set_named_property(env, exports, "operation", callback) != napi_ok) return NULL;
  return exports;
}
NAPI_MODULE(NODE_GYP_MODULE_NAME, initialize)
#else
int main(int argc, const char *argv[]) {
  @autoreleasepool {
    if (argc < 3 || SecKeychainSetUserInteractionAllowed(false) != errSecSuccess) return 2;
    NSData *json = [NSJSONSerialization dataWithJSONObject:operate(argv[1], argv[2], argc == 4 ? argv[3] : NULL) options:0 error:NULL];
    puts([[NSString alloc] initWithData:json encoding:NSUTF8StringEncoding].UTF8String);
    return 0;
  }
}
#endif
