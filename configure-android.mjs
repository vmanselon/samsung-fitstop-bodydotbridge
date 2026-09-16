import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const manifestPath = resolve("src-tauri/gen/android/app/src/main/AndroidManifest.xml");

try {
  const original = await readFile(manifestPath, "utf8");
  const updated = original.includes("android:screenOrientation=")
    ? original.replace(/android:screenOrientation="[^"]*"/u, 'android:screenOrientation="portrait"')
    : original.replace(/(<activity\b[^>]*android:name="\.MainActivity")/u, '$1 android:screenOrientation="portrait"');
  if (updated === original && !original.includes('android:screenOrientation="portrait"')) {
    throw new Error("MainActivity was not found in AndroidManifest.xml");
  }
  await writeFile(manifestPath, updated, "utf8");
  console.log("Android orientation configured: portrait");
} catch (error) {
  console.error("Run `npm run android:init` after installing the Android prerequisites.");
  throw error;
}
