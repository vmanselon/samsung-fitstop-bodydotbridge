# FitStop Bodydot Bridge

Portrait Android tablet application that reads BODYDOT measurement data and renders the FitStop frame-correction result flow. The frontend is React + TypeScript + Vite; the native/mobile shell is Tauri 2 with Rust.

## Target display

The design target is a Samsung Galaxy Tab S9+ in portrait mode (1752 × 2800 physical pixels). The Android WebView uses density-independent pixels, and the desktop preview defaults to 800 × 1280 for convenient development.

## Structure

- `src/components` — result, loading, camera scanner, and shared UI
- `src/hooks/useBodyResult.ts` — loading, refresh, and mock/API selection
- `src/services/bodydotClient.ts` — replaceable Tauri HTTP repository and response validation
- `src/services/qrToken.ts` — printer-kiosk-compatible HMAC QR validation
- `src/services/resultSave.ts` — replaceable mock/save adapter
- `src/types/bodyResult.ts` — UI/API boundary types
- `src/data/mockBodyResult.ts` — development result matching the supplied design
- `src-tauri` — Rust/Tauri app and Android camera configuration
- `configure-android.mjs` — reapplies portrait, fullscreen, and camera configuration

The included character is a shared FitStop placeholder. Replace it or provide `imageUrl` values from the real API for dedicated front, side, and back Bodydot images.

## Development and debug mode

```powershell
Copy-Item .env.example .env
npm install
npm run dev
```

Mock data is enabled by default. The result screen includes a debug control for simulating new Bodydot data. The scanner includes valid and invalid QR simulations. Mock saves log both the decoded user payload and current result to the developer console.

Result retrieval and saving have independent mock switches. To test real result retrieval while still preventing database writes, set `VITE_USE_MOCK_DATA=false` and leave `VITE_USE_MOCK_SAVE=true`.

For a production Tauri build, set `QR_SECRET` to the same HMAC secret used by the Samsung printer kiosk. `VITE_QR_SECRET` is a development/mock-only convenience and must not expose a production secret in frontend assets.

To use the future API:

```env
VITE_USE_MOCK_DATA=false
VITE_BODYDOT_API_BASE_URL=https://api.example.com
VITE_USE_MOCK_SAVE=false
VITE_BODYDOT_SAVE_URL=https://main-app.example.com/api/bodydot/results
```

The placeholder endpoint currently reads `GET /measurements/{measurementId}` using the `measurementId` query parameter. Replace the `BodyResultRepository` implementation once the latest-result API contract is ready. Replace the placeholder API origin in the Tauri capabilities and CSP at the same time.

After a valid QR scan, production save mode sends `POST application/json` to `VITE_BODYDOT_SAVE_URL`. The body contains `userId`, `nickname`, `measurementId`, `measuredAt`, `sections`, and the verified QR metadata under `qr`. The mapping is isolated in `toBodydotSavePayload`, so it can be adjusted to the main app's final DTO without changing the scanner or result screens. Any 2xx response is treated as success and returns to the result page; a network or non-2xx response keeps the scanner open and shows a retry message.

## Expected result shape

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

Run on a connected tablet or emulator with `npm run android:dev`, or build with `npm run android:build`.
