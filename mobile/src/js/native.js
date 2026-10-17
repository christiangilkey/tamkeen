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
/** Installs a new release's APK from inside the app (android/.../AppUpdaterPlugin.java). Android only. */
export const AppUpdater = isNative && Capacitor.getPlatform() === "android" ? registerPlugin("AppUpdater") : null;
/** Cards left to review today on the app icon (a silent notification) and the home-screen widget
 *  (android/.../AppBadgePlugin.java). Android only. */
export const AppBadge = isNative && Capacitor.getPlatform() === "android" ? registerPlugin("AppBadge") : null;
/** Reset Tamkeen: clears the cookies of the app's browser windows (android/.../AppResetPlugin.java). */
export const AppReset = isNative && Capacitor.getPlatform() === "android" ? registerPlugin("AppReset") : null;
