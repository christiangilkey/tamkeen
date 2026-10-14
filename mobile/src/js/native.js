// Native features, or null when running in a plain browser (development preview).

import { Capacitor, registerPlugin } from "./vendor/capacitor-core.js";

export const isNative = Capacitor.isNativePlatform();
/** True in the iPhone app. The shared screens treat both phones alike (platform "android" means
 * "the phone app"); this marks the few places where the iPhone has to differ. */
export const isIOS = isNative && Capacitor.getPlatform() === "ios";

/** Google sign-in, the in-app browser and the reel window: our own small plugin, written twice
 * (android/.../GoogleDriveAuthPlugin.java and native-ios/.../GoogleDriveAuthPlugin.swift). */
export const GoogleDriveAuth = isNative ? registerPlugin("GoogleDriveAuth") : null;
export const Filesystem = isNative ? registerPlugin("Filesystem") : null;
export const Share = isNative ? registerPlugin("Share") : null;
export const App = isNative ? registerPlugin("App") : null;
/** Native web requests (no browser cross-site limits): used to download pages to import. */
export const NativeHttp = isNative ? registerPlugin("CapacitorHttp") : null;
/** The Tamkeen deck in AnkiDroid (our own small Android plugin, see android/.../AnkiDroidPlugin.java). */
export const AnkiDroid = isNative && !isIOS ? registerPlugin("AnkiDroid") : null; // AnkiDroid is an Android app
