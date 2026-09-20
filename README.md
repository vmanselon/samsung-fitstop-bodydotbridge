# FitStop Bodydot Bridge

Portrait Android tablet application that reads BODYDOT measurement data and renders the FitStop frame-correction result flow. The frontend is React + TypeScript + Vite; the native/mobile shell is Tauri 2 with Rust.

## Target display

The design target is a Samsung Galaxy Tab S9 FE+ in portrait mode (1600 × 2560 physical pixels). The root font size uses the 1600-wide design baseline, where `1rem` equals 10 design units.

## Structure

- `src/components` — result, loading, camera scanner, and shared UI
- `src/hooks/useBodyResult.ts` — configurable latest-session polling and last-known-good state
- `src/services/bodydotClient.ts` — BAS session validation and UI-shape adapter
- `src/services/qrToken.ts` — printer-kiosk-compatible HMAC QR validation
- `src/services/resultSave.ts` — replaceable mock/save adapter
- `src/types/bodyResult.ts` — UI/API boundary types
- `src/data/mockBodyResult.ts` — development result matching the supplied design
- `src-tauri` — Rust/Tauri app and Android camera configuration
- `configure-android.mjs` — reapplies portrait, fullscreen, and camera configuration

The bundled front, side, and back characters each alternate between `_0.svg`
and `_1.svg` frames to simulate a GIF without raster animation. Both frames are
preloaded before the result screen appears. A section-level `imageUrl` from the
real API replaces the animation with that single image.

## Development and debug mode

```powershell
Copy-Item .env.example .env
npm install
npm run dev
```

Mock data is enabled by default. The result screen includes a debug control for
simulating new Bodydot data. When mock saving is enabled, the scanner includes
valid and invalid QR simulations, and saves log the decoded user payload and
current result to the developer console.

When `VITE_USE_MOCK_DATA=false`, launch with `npm run tauri dev`, not
`npm run dev`. BAS access uses a native Rust command and therefore is not
available in a regular browser tab.

Result retrieval and saving have independent mock switches. To test real result retrieval while still preventing database writes, set `VITE_USE_MOCK_DATA=false` and leave `VITE_USE_MOCK_SAVE=true`.

## Environment variables

Copy `.env.example` to `.env` for local development. Variables beginning with
`VITE_` are compiled into the frontend bundle and must never contain secrets.

| Variable | Default | Purpose |
| --- | --- | --- |
| `BDOT_CLIENT_ID` | None | Native-only BAS OAuth client ID |
| `BDOT_CLIENT_SECRET` | None | Native-only BAS OAuth client secret |
| `BDOT_KIOSK_CLIENT_ID` | Built-in kiosk ID | Optional initial kiosk ID; the in-app setting overrides it |
| `QR_SECRET` | None | Native-only HMAC secret shared with the Samsung printer kiosk |
| `VITE_USE_MOCK_DATA` | `true` | Use local measurement data instead of the BAS API |
| `VITE_BDOT_LOG_SESSION` | `false` | Log full BAS sessions with the `[BODYDOT BAS SESSION]` label |
| `VITE_BDOT_POLL_INTERVAL_MS` | `12000` | Milliseconds between latest-measurement API calls |
| `VITE_USE_MOCK_SAVE` | `true` | Use local saves and show the QR test controls |
| `VITE_FITSTOP_SAVE_URL` | Empty | Destination for production result saves |

Restart the development process or rebuild the app after changing a `VITE_`
variable. An invalid, zero, or negative polling interval falls back to 12,000
milliseconds. Polling never starts a second request while one is in progress.

Full BAS sessions can contain measurement data. Enable
`VITE_BDOT_LOG_SESSION` only while debugging and leave it disabled in
production.

## Bodydot BAS configuration

The BAS OAuth client ID and OAuth secret are used only by the Rust backend.
Never prefix these values with `VITE_`: Vite exposes such variables to the
webview bundle.

For desktop development, provide the variables in the shell that launches
Tauri, or add the same unprefixed names to the ignored local `.env` file:

```powershell
$env:BDOT_CLIENT_ID = "<BAS OAuth client ID>"
$env:BDOT_CLIENT_SECRET = "<BAS OAuth client secret>"
npm run tauri dev
```

Desktop builds first read the process environment at runtime. Android does not
provide a conventional process environment, so release APKs use the OAuth
variables at Rust compile time:

```powershell
$env:BDOT_CLIENT_ID = "<BAS OAuth client ID>"
$env:BDOT_CLIENT_SECRET = "<BAS OAuth client secret>"
npm run android:build
```

The OAuth values are compiled into the native Rust library for Android, not the
frontend JavaScript assets. For stronger at-rest protection than an embedded
mobile credential, BAS would need to support a trusted server-side proxy or a
device credential store/provisioning flow.

The Bodydot kiosk client ID defaults to
`ff31aaa2-6621-4561-a756-ffb6d50dfa7b`. On the result or result-loading error
screen, press and hold the invisible 150 × 150 px area in the top-right corner
for five seconds to edit it. Releasing early cancels the gesture. The selected
value is stored in the app's private data directory, is used immediately, and
remains selected after the app restarts. This allows the same APK to be
installed on different kiosks.

On any screen, drag down at least 72 px from within the top 260 px to fully
refresh the application.

The kiosk settings dialog also contains an emergency Bodydot API toggle. When
disabled, frontend polling stops and the native backend rejects new Bodydot
requests. The app continues to show the most recently loaded result, or its
built-in dummy result when no real result has loaded yet. This safeguard is
deliberately session-only and resets to Enabled whenever the app restarts; it
is never written to persistent storage.

While the Bodydot API is enabled, tapping the invisible 150 × 150 px area in
the result screen's top-left corner three times consecutively replaces the
displayed result with the built-in dummy data. The tap sequence resets after
600 milliseconds without another tap. Polling continues, and the dummy result remains
visible until Bodydot returns a different measurement ID.

`get_latest_measurement` takes no frontend arguments. It returns the complete
BAS `MeasurementSession`, or a structured command error with codes including
`MEASUREMENT_SESSION_NOT_FOUND`, `NETWORK_ERROR`, `AUTHENTICATION_FAILED`, and
`RATE_LIMITED`. The Rust client caches tokens in memory, refreshes within 60
seconds of expiry, retries one time after a 401, and honors numeric
`Retry-After` values (falling back to 30 seconds).

## QR security

For a production Tauri build, set `QR_SECRET` to the same HMAC secret used by
the Samsung printer kiosk. The native verifier and the Valid QR debug action
both retrieve this one value. It is never exposed through a `VITE_` variable or
included directly in the frontend assets.

## Production frontend configuration

To use BAS retrieval and the real result-save API:

```env
VITE_USE_MOCK_DATA=false
VITE_BDOT_LOG_SESSION=false
VITE_BDOT_POLL_INTERVAL_MS=12000
VITE_USE_MOCK_SAVE=false
VITE_FITSTOP_SAVE_URL=https://main-app.example.com/api/bodydot/results
```

The initial loading screen remains visible for at least 500 milliseconds and
does not close until the measurement, result images, and required fonts are
ready. This prevents an incomplete result screen from flashing into view.

The red offline banner uses both the device's connectivity state and real BAS
`NETWORK_ERROR` responses. It remains available on the loading, error, result,
and QR scanner screens.

The current result design requires three sections containing three metrics each.
`src/services/bodydotClient.ts` maps the BAS `valueCode` fields to the front,
side, and flexibility cards and classifies each result as normal, moderate, or
attention. BAS `twoPointDistance` values used by the shoulder-flexibility rules
are converted from metres to centimetres before classification.

After a valid QR scan, production save mode sends `POST application/json` to
`VITE_FITSTOP_SAVE_URL`. The body contains `userId`, `nickname`,
`measurementId`, `measuredAt`, `sections`, and the verified QR metadata under
`qr`. The mapping is isolated in `toBodydotSavePayload`, so it can be adjusted
to the main app's final DTO without changing the scanner or result screens. Any
2xx response is treated as success and returns to the result page; a network or
non-2xx response keeps the scanner open and shows a retry message.

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
