import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const manifestPath = resolve("src-tauri/gen/android/app/src/main/AndroidManifest.xml");
const activityPath = resolve(
  "src-tauri/gen/android/app/src/main/java/com/samsunglife/fitstop/bodydotbridge/MainActivity.kt",
);

const immersiveActivity = `package com.samsunglife.fitstop.bodydotbridge

import android.os.Build
import android.os.Bundle
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.WindowManager

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    scheduleImmersiveMode()
  }

  override fun onWindowFocusChanged(hasFocus: Boolean) {
    super.onWindowFocusChanged(hasFocus)
    if (hasFocus) {
      scheduleImmersiveMode()
    }
  }

  private fun scheduleImmersiveMode() {
    window.decorView.post { enterImmersiveMode() }
  }

  @Suppress("DEPRECATION")
  private fun enterImmersiveMode() {
    val decorView = window.decorView
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      window.setDecorFitsSystemWindows(false)
      decorView.windowInsetsController?.apply {
        hide(WindowInsets.Type.systemBars())
        systemBarsBehavior =
          WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
      }
    } else {
      decorView.systemUiVisibility =
        View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY or
          View.SYSTEM_UI_FLAG_FULLSCREEN or
          View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
          View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or
          View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION or
          View.SYSTEM_UI_FLAG_LAYOUT_STABLE
    }
  }
}
`;

try {
  const original = await readFile(manifestPath, "utf8");
  const updated = original.includes("android:screenOrientation=")
    ? original.replace(/android:screenOrientation="[^"]*"/u, 'android:screenOrientation="portrait"')
    : original.replace(/(<activity\b[^>]*android:name="\.MainActivity")/u, '$1 android:screenOrientation="portrait"');
  if (updated === original && !original.includes('android:screenOrientation="portrait"')) {
    throw new Error("MainActivity was not found in AndroidManifest.xml");
  }
  await writeFile(manifestPath, updated, "utf8");
  await writeFile(activityPath, immersiveActivity, "utf8");
  console.log("Android configured: portrait, immersive fullscreen");
} catch (error) {
  console.error("Run `npm run android:init` after installing the Android prerequisites.");
  throw error;
}
