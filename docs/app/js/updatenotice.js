// "A new version is available" popup, shown when the app opens. Where the app can update itself
// (a packaged desktop build, or the Android app) it has an "Update now" button that downloads and
// installs the new version in place; otherwise, and always as "What's new", it links to the release
// page on GitHub. Each app shell checks in its own way and calls showUpdateNotice() when there is one.

import { h } from "./app.js";

/** Version numbers as comparable lists: "0.10.1" -> [0, 10, 1]. */
export function parseVersion(v) {
  const nums = String(v || "").split("-")[0].match(/\d+/g) || [];
  return nums.slice(0, 3).map(Number);
}

export function isNewer(latest, current) {
  const a = parseVersion(latest);
  const b = parseVersion(current);
  for (let i = 0; i < 3; i++) {
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
  }
  return false;
}

/** Only ever a link to the app's own releases on GitHub. */
function releaseUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname === "github.com" ? u.href : "";
  } catch {
    return "";
  }
}

/** What the popup says for an update's progress: {stage, done, total, message, error}. */
export function progressText(s) {
  if (!s) return "";
  if (s.stage === "downloading") {
    const mb = (n) => (n / 1048576).toFixed(n > 100 * 1048576 ? 0 : 1);
    return s.total ? `Downloading… ${Math.floor((100 * s.done) / s.total)}% (${mb(s.done)} of ${mb(s.total)} MB)`
      : s.done ? `Downloading… ${mb(s.done)} MB` : "Downloading…";
  }
  if (s.stage === "installing") return s.message || "Installing. Tamkeen will close and open again by itself.";
  if (s.stage === "error") return s.error || "The update failed.";
  return s.message || "";
}

/**
 * Show the popup for version `latest`. It stays until closed (once per app start).
 * `install(report)`: present when this app can update itself. It downloads and installs, calling
 * `report({stage, done, total, message})` as it goes, and rejects with an Error if it fails.
 */
export function showUpdateNotice({ latest, current, url, install, note = "" }) {
  const link = releaseUrl(url);
  if (!latest || (!link && !install) || document.getElementById("update-notice")) return null;
  const el = h(`<div class="update-notice" id="update-notice" role="status">
    <div class="update-main">
      <span class="update-ico">⬆</span>
      <span class="update-text"><strong></strong><span class="small update-sub"></span></span>
      <button type="button" class="ghost icon update-close" title="Not now" aria-label="Close">✕</button>
    </div>
    <div class="update-bar" hidden><span></span></div>
    <div class="update-actions">
      <a class="update-notes" target="_blank" rel="noopener">What's new ↗</a>
      <button type="button" class="update-now">Update now</button>
    </div>
  </div>`);
  el.querySelector("strong").textContent = `Tamkeen ${latest} is available${current ? ` (you have ${current})` : ""}`;
  const sub = el.querySelector(".update-sub");
  const notes = el.querySelector(".update-notes");
  const now = el.querySelector(".update-now");
  const bar = el.querySelector(".update-bar");
  if (link) notes.href = link; else notes.remove();
  if (install) {
    sub.textContent = "It installs here, and your library stays as it is.";
  } else {
    sub.textContent = note || "Download it from the release page.";
    now.textContent = "Download";
    now.onclick = () => { window.open(link, "_blank", "noopener"); el.remove(); };
  }
  el.querySelector(".update-close").onclick = () => el.remove();

  const report = (s) => {
    sub.textContent = progressText(s);
    const pct = s && s.stage === "downloading" && s.total ? Math.min(100, (100 * s.done) / s.total) : null;
    bar.hidden = !(s && (s.stage === "downloading" || s.stage === "installing"));
    bar.classList.toggle("busy", pct === null);
    bar.firstElementChild.style.width = pct === null ? "" : `${pct}%`;
  };
  if (install) {
    now.onclick = async () => {
      now.disabled = true;
      now.textContent = "Updating…";
      report({ stage: "downloading", done: 0, total: 0 });
      try {
        await install(report);
      } catch (e) {
        report({ stage: "error", error: e.message || "The update failed." });
        bar.hidden = true;
        now.disabled = false;
        now.textContent = "Try again";
      }
    };
  }
  document.body.append(el);
  return el;
}
