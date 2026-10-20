# Mobile UI acceptance

INPUT: A demo-seeded native build, a dedicated E2E simulator, local Maestro and Java 21.
OUTPUT: Local JUnit reports, screenshots and motion captures under root `output/tests/`.
POS: Native visual and interaction acceptance for bottom navigation and task details. No Auth or sync acceptance is implied.

Build the demo with `EXPO_PUBLIC_DEMO=1` and install it on an explicitly isolated simulator. These UI flows do not clear app state. Keep Maestro analytics/update checks disabled and its API endpoint local. Never use a personal workspace for the task-detail editing flow.

[PROTOCOL]: Update this header when making changes, then check README.md.

## Bottom navigation

`maestro/navigation-switching.yaml` checks consecutive taps and scroll-driven compact/expanded controls. Use the same command below with that filename and a separate report path. `maestro/navigation.yaml` checks only Board/Flow/Settings routing, both material surfaces and the capture entry. Use the demo-seeded build (`EXPO_PUBLIC_DEMO=1`) on a dedicated E2E simulator. It does not clear app data or use Auth. Set `MATERIAL=liquid` for iOS 26+ or `opaque` after enabling Reduce Transparency. Record a simulator video during the flow to inspect intermediate selection positions; screenshots alone do not verify motion.

```sh
MAESTRO_CLI_NO_ANALYTICS=true MAESTRO_DISABLE_UPDATE_CHECK=true \
MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED=true MAESTRO_API_URL=http://127.0.0.1:54389 \
JAVA_HOME=/private/tmp/goalloom-e2e-tools/jdk-21.0.12.1+1-jre/Contents/Home \
/private/tmp/goalloom-e2e-tools/maestro/bin/maestro test \
  --udid "$GOALLOOM_E2E_DEVICE" --format JUNIT \
  --output output/tests/mobile-navigation/navigation.xml \
  --test-output-dir output/tests/mobile-navigation \
  -e MATERIAL=liquid apps/mobile/tests/maestro/navigation.yaml
```

Repeat on the compact phone, in dark appearance and at large text. With Reduce Motion enabled, selection must change immediately. With Reduce Transparency enabled, assert the `bottom-navigation-opaque` and `capture-material-opaque` test IDs. Check background tasks through the normal and fallback materials before claiming visual acceptance.

## Task detail design parity

`maestro/task-detail.yaml` opens the real demo review task, captures the rounded property/goal/child layout, checks horizon/date/goal routes, flushes an edited description through property navigation, checks independent child completion and opens child details. Use the navigation runner command with this filename and separate output paths under root `output/tests/mobile-detail-parity/`. The flow edits only disposable demo data and never clears a personal workspace. Repeat layout inspection on the compact simulator in dark appearance and at accessibility text size. Counts and inherited checkbox colors must come from saved task data.
