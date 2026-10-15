/**
 * React Native has no `continue` returnKeyType. On iOS this asks the focused
 * field to use UIReturnKeyType.continue and keep it across later prop updates.
 * Android sets IME_ACTION_GO plus the localized label; keyboards that ignore
 * a custom label still get a go action. Before prebuild the call is a no-op
 * and the field keeps returnKeyType "done" with returnKeyLabel.
 */
import { requireOptionalNativeModule } from 'expo-modules-core'

type NativeModule = { applyContinueReturnKey(label: string): void }

const native = requireOptionalNativeModule<NativeModule>('ContinueReturnKey')

export function applyContinueReturnKey(label: string): void {
  try {
    native?.applyContinueReturnKey(label)
  } catch {
    // A dev client built before this module was linked has nothing to call.
  }
}
