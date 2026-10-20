# Mobile assets

INPUT: Existing Goalloom brand geometry and platform asset requirements.
OUTPUT: Bundled home-screen icon, launch artwork and offline web SQLite runtime.
POS: Mobile-only assets. Desktop artwork keeps its own platform presentation.

- `icon.svg`: Editable iOS icon source. Reuses the path and ink color from the website brand mark, with an opaque full-bleed square background. No inset tile, pre-masked outer corner, border, shadow or specular highlight is baked in.
- `icon.png`: 1024×1024 RGB export of `icon.svg`, used by `app.json` for the default and iOS icon. The system supplies the outer mask and effects. Never flatten the finished desktop icon into this file.
- `adaptive-icon.png`: Existing Android foreground artwork, configured independently by `android.adaptiveIcon`.
- `splash.png`: Existing launch-screen artwork; independent of the home-screen icon mask.
- `sql-wasm.wasm`: Bundled sql.js runtime for the offline web preview.

To export the PNG with Sharp 0.34.5, use `sharp('icon.svg').resize(1024, 1024).removeAlpha().png().toFile('icon.png')` from this directory. Sharp is an export tool, not an app dependency. Regenerate native assets with Expo prebuild and rebuild/install the app; Metro reload cannot update the installed icon. Verify the home screen at native icon size.

[PROTOCOL]: Update this header when making changes, then check README.md.
