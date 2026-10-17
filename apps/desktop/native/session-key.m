/**
 * [INPUT]: A SHA-256 profile scope, the host app's provisioned access group and macOS Security APIs.
 * [OUTPUT]: A 32-byte application-private key, or a silent typed OS error. Reads never create a key.
 * [POS]: Data Protection Keychain boundary. No legacy ACL edits, biometric prompts or iCloud synchronization.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
#import <Foundation/Foundation.h>
#import <LocalAuthentication/LocalAuthentication.h>
#import <Security/Security.h>
#include <node_api.h>
#include <string.h>

static void erase(void *data, size_t length) {
  volatile unsigned char *bytes = data;
  while (length--) *bytes++ = 0;
}

static napi_value fail(napi_env env, OSStatus status) {
  char code[40]; snprintf(code, sizeof(code), "KEYCHAIN_%d", (int)status);
  napi_throw_error(env, code, "Protected session storage is unavailable");
  return NULL;
}

napi_value delete_session_key(napi_env env, napi_callback_info info) {
  @autoreleasepool {
    napi_value arg, result;
    size_t argc = 1, length = 0; char scope[65];
    if (napi_get_cb_info(env, info, &argc, &arg, NULL, NULL) != napi_ok || argc != 1 ||
        napi_get_value_string_utf8(env, arg, NULL, 0, &length) != napi_ok || length != 64 ||
        napi_get_value_string_utf8(env, arg, scope, sizeof(scope), &length) != napi_ok || strspn(scope, "0123456789abcdef") != 64) {
      napi_throw_type_error(env, NULL, "Invalid protected session scope"); return NULL;
    }
    LAContext *context = [[LAContext alloc] init]; context.interactionNotAllowed = YES;
    NSDictionary *query = @{
      (__bridge id)kSecClass: (__bridge id)kSecClassGenericPassword,
      (__bridge id)kSecAttrService: @"com.goalloom.desktop.sync.session.v1",
      (__bridge id)kSecAttrAccount: [NSString stringWithUTF8String:scope],
      (__bridge id)kSecUseDataProtectionKeychain: @YES,
      (__bridge id)kSecAttrSynchronizable: @NO,
      (__bridge id)kSecUseAuthenticationContext: context,
    };
    OSStatus status = SecItemDelete((__bridge CFDictionaryRef)query);
    if (status != errSecSuccess && status != errSecItemNotFound) return fail(env, status);
    napi_get_undefined(env, &result); return result;
  }
}

napi_value session_key(napi_env env, napi_callback_info info) {
  @autoreleasepool {
    napi_value args[2], result;
    size_t argc = 2, length = 0;
    char scope[65]; bool create = false;
    if (napi_get_cb_info(env, info, &argc, args, NULL, NULL) != napi_ok || argc != 2 ||
        napi_get_value_string_utf8(env, args[0], NULL, 0, &length) != napi_ok || length != 64 ||
        napi_get_value_string_utf8(env, args[0], scope, sizeof(scope), &length) != napi_ok ||
        strspn(scope, "0123456789abcdef") != 64 || napi_get_value_bool(env, args[1], &create) != napi_ok) {
      napi_throw_type_error(env, NULL, "Invalid protected session scope"); return NULL;
    }
    LAContext *context = [[LAContext alloc] init];
    context.interactionNotAllowed = YES;
    NSMutableDictionary *query = [@{
      (__bridge id)kSecClass: (__bridge id)kSecClassGenericPassword,
      (__bridge id)kSecAttrService: @"com.goalloom.desktop.sync.session.v1",
      (__bridge id)kSecAttrAccount: [NSString stringWithUTF8String:scope],
      (__bridge id)kSecUseDataProtectionKeychain: @YES,
      (__bridge id)kSecAttrSynchronizable: @NO,
      (__bridge id)kSecUseAuthenticationContext: context,
      (__bridge id)kSecReturnData: @YES,
      (__bridge id)kSecMatchLimit: (__bridge id)kSecMatchLimitOne,
    } mutableCopy];
    CFTypeRef found = NULL;
    OSStatus status = SecItemCopyMatching((__bridge CFDictionaryRef)query, &found);
    if (status == errSecItemNotFound && create) {
      unsigned char bytes[32];
      status = SecRandomCopyBytes(kSecRandomDefault, sizeof(bytes), bytes);
      if (status != errSecSuccess) return fail(env, status);
      NSMutableData *key = [NSMutableData dataWithBytes:bytes length:sizeof(bytes)];
      erase(bytes, sizeof(bytes));
      NSMutableDictionary *add = [query mutableCopy];
      [add removeObjectForKey:(__bridge id)kSecReturnData];
      [add removeObjectForKey:(__bridge id)kSecMatchLimit];
      add[(__bridge id)kSecAttrAccessible] = (__bridge id)kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly;
      add[(__bridge id)kSecValueData] = key;
      status = SecItemAdd((__bridge CFDictionaryRef)add, NULL);
      erase(key.mutableBytes, key.length);
      // Another process may win first creation. Always read the committed key.
      if (status == errSecSuccess || status == errSecDuplicateItem)
        status = SecItemCopyMatching((__bridge CFDictionaryRef)query, &found);
    }
    if (status == errSecItemNotFound && !create) { napi_get_null(env, &result); return result; }
    if (status != errSecSuccess) { if (found) CFRelease(found); return fail(env, status); }
    if (!found || CFGetTypeID(found) != CFDataGetTypeID() || CFDataGetLength((CFDataRef)found) != 32) {
      if (found) CFRelease(found); return fail(env, errSecDecode);
    }
    napi_status copied = napi_create_buffer_copy(env, 32, CFDataGetBytePtr((CFDataRef)found), NULL, &result);
    CFRelease(found);
    return copied == napi_ok ? result : NULL;
  }
}
