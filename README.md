# FitStop Bodydot Bridge

Portrait Android tablet application that reads BODYDOT measurement data and renders the FitStop frame-correction result page. The frontend is React + TypeScript + Vite; the native/mobile shell is Tauri 2 with Rust.

## Target display

The default design target is a **Samsung Galaxy Tab S9+ in portrait mode**:

- Physical resolution: **1752 × 2800 px**
- Portrait aspect ratio: approximately **0.626**
- The Android WebView renders in density-independent logical pixels, so the UI remains responsive while using the Tab S9+ portrait proportions as its design baseline.
- The desktop Tauri preview defaults to `800 × 1280`, which uses the same portrait aspect ratio for convenient development.

## Current structure

- `src/components` — reusable brand and measurement-section UI
- `src/hooks/useBodyResult.ts` — loading, retry, mock/API selection
- `src/services/bodydotClient.ts` — Tauri HTTP bridge and response validation
- `src/types/bodyResult.ts` — UI/API boundary types
- `src/data/mockBodyResult.ts` — development result matching the supplied design
- `src-tauri` — Rust/Tauri app and Android configuration
- `configure-android.mjs` — locks generated Android `MainActivity` to portrait

The included character is a temporary shared FitStop placeholder. Replace it or provide `imageUrl` values from the real API for the dedicated front, side, and back BODYDOT images.

## Development

```powershell
Copy-Item .env.example .env
npm install
npm run dev
```

Mock data is enabled by default. To use the API:

```env
VITE_USE_MOCK_DATA=false
VITE_BODYDOT_API_BASE_URL=https://api.example.com
```

Open the app with a measurement identifier:

```text
http://localhost:1420/?measurementId=BODYDOT_MEASUREMENT_ID
```

The placeholder endpoint is `GET /measurements/{measurementId}`. Update `getBodyResult` in `src/services/bodydotClient.ts` when the real BODYDOT request and response contract is available. Also replace `https://api.example.com/**` in `src-tauri/capabilities/default.json` and the matching CSP entries with the real, narrowly scoped API origin.

## Expected API response

```json
{
  "measurementId": "measurement-123",
  "measuredAt": "2026-09-16T08:00:00.000Z",
  "sections": [
    {
      "id": "front-posture",
      "title": "정면 측정 결과",
      "view": "front",
      "imageUrl": "https://api.example.com/images/front.png",
      "metrics": [
        { "label": "머리 수평", "value": "정상", "tone": "normal" },
        { "label": "어깨 수평", "value": "이상", "tone": "attention" },
        { "label": "골반 수평", "value": "이상", "tone": "attention" }
      ]
    }
  ]
}
```

Exactly three sections and three metrics per section are currently required.

## Android/APK setup

Install Android Studio with the Android SDK, NDK, command-line tools, and its bundled JDK. Then define `JAVA_HOME`, `ANDROID_HOME`, and `NDK_HOME`, and add the Android Rust targets:

```powershell
rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android
npm run android:init
```

The initialization script generates the Android project and applies portrait orientation. Run on a connected Galaxy Tab or emulator:

```powershell
npm run android:dev
```

Build the Android package:

```powershell
npm run android:build
```

Android initialization cannot be completed until the JDK/SDK/NDK environment is available on the machine. See the official [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) and [mobile development guide](https://v2.tauri.app/develop/).
