// Native features, or null when running in a plain browser (development preview).

import { Capacitor, registerPlugin } from "./vendor/capacitor-core.js";

export const isNative = Capacitor.isNativePlatform();
/** True in the iPhone app. The shared screens treat both phones alike (platform "android" means
 * "the phone app"); this marks the few places where the iPhone has to differ. */
export const isIOS = isNative && Capacitor.getPlatform() === "ios";
/** True in the web app (the phone app's screens served from GitHub Pages, see webapp/build-web.mjs),
 *  which sets window.TAMKEEN_WEB before loading. Not the same as a development preview. */
export const isWeb = !isNative && typeof window !== "undefined" && window.TAMKEEN_WEB === true;
const PROXY = (typeof window !== "undefined" && window.TAMKEEN_PROXY) || "";
/** In the web app, another website is read through Tamkeen's go-between server (webapp/worker.js),
 *  since a web page may not read other sites itself. Elsewhere the address is returned as it is. */
export const proxied = (url) => (isWeb && PROXY ? `${PROXY.replace(/\/$/, "")}/fetch?url=${encodeURIComponent(url)}` : url);
/** The "Web" Google client: Supabase trusts its ID tokens, Android asks for them on its behalf,
 *  and the web app signs in with it directly. */
export const GOOGLE_WEB_CLIENT_ID = "419555269865-0954ljffgrnbveq04lvh3ii6c032rhv3.apps.googleusercontent.com";
/** fetch() through the go-between server. Some sites (YouTube, Apple) turn away part of the
 *  requests coming from Cloudflare's computers (403/429); the next try usually leaves from another
 *  one and gets through, so up to 4 tries. Outside the web app: an ordinary fetch. */
export async function webFetch(url, opts = {}) {
  if (!isWeb) return fetch(url, opts);
  let res;
  for (let attempt = 0; attempt < 4; attempt++) {
    res = await fetch(proxied(url), opts);
    if (res.status !== 403 && res.status !== 429) break;
    await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
  }
  return res;
}
/** Where a fetch through the go-between server really ended up (after forwarding). */
export const finalUrl = (res, asked) => (res.headers && res.headers.get("X-Final-Url")) || res.url || asked;

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
// Android's own clipboard (ClipboardPlugin.java): the web view may refuse a page that reads it.
export const TamkeenClipboard = isNative && !isIOS ? registerPlugin("TamkeenClipboard") : null;
/** Installs a new release's APK from inside the app (android/.../AppUpdaterPlugin.java). Android only. */
export const AppUpdater = isNative && Capacitor.getPlatform() === "android" ? registerPlugin("AppUpdater") : null;
/** Cards left to review today on the app icon (a silent notification) and the home-screen widget
 *  (android/.../AppBadgePlugin.java). Android only. */
export const AppBadge = isNative && Capacitor.getPlatform() === "android" ? registerPlugin("AppBadge") : null;
/** Reset Tamkeen: clears the cookies of the app's browser windows (android/.../AppResetPlugin.java). */
export const AppReset = isNative && Capacitor.getPlatform() === "android" ? registerPlugin("AppReset") : null;
