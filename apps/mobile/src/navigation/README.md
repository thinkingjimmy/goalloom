# Mobile bottom navigation

INPUT: Active section, scroll-driven compact state, safe-area offsets, theme, translated copy and device accessibility preferences.
OUTPUT: Board/Flow/Settings selection and the shared capture action. Navigation does not write workspace data.
POS: App-shell chrome. `../view.tsx` owns screen routing and the Android blur target; this module owns material and selection feedback.

- `bar.tsx`: `TabBar` and `TAB_HEIGHT`; one native-driver spring moves the selection capsule between measured slots. Rapid taps retarget it. Initial layout, size changes and Reduce Motion place it immediately. Accessibility settings are read before effects start and update live; the web preview uses the reduced-transparency media query because React Native Web does not expose the native transparency API.
- `material.tsx`: `NavigationMaterial` and `NavigationGlassGroup`; iOS 26+ uses Expo's native Liquid Glass after API/compiler checks. Other platforms use Expo BlurView, with an explicit content target on Android. Reduce Transparency uses an opaque theme surface. Glass ancestors retain opacity 1.

The separate capture button uses the same material and keeps a 52pt minimum target in compact mode. Labels retain full accessibility names and cap scaling inside the fixed-height bar. Existing section state, safe-area spacing, compact-bar behavior and task placement stay with the app shell. No whole-screen slide delays section navigation.

Adding `expo-glass-effect` requires `pod install` and a native rebuild; Metro reload alone cannot add it. Native checks and repeatable evidence belong under root `output/tests/mobile-navigation/`.

[PROTOCOL]: Update this header when making changes, then check README.md.
