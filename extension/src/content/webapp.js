// Tamkeen for Netflix, on the Tamkeen web app's own pages (christiangilkey.github.io/tamkeen/app/).
// The extension can't read the web app's library or settings itself (each website's storage is kept
// apart), so this part of it, which runs beside the web app's page, passes them over
// (web/js/extbridge.js explains the messages; mobile/src/js/web-extension.js is the web app's side):
//   - it marks the page (data-tamkeen-extension on <html>), so the web app knows the extension is here;
//   - the web app gives it the settings for looking words up; they are kept in chrome.storage.local;
//   - it gives the web app the words saved and titles watched in Netflix, and forgets each once the
//     web app has said it kept it.
// It takes messages only from this page's own window and address, carrying this visit's token.
(function () {
  if (window.top !== window || window.__tamkeenExtWebApp) return;
  window.__tamkeenExtWebApp = true;
  document.documentElement.dataset.tamkeenExtension = chrome.runtime.getManifest().version;

  import(chrome.runtime.getURL("js/extbridge.js")).then(start).catch(function (e) { console.warn("Tamkeen extension:", e); });

  function start(B) {
    var nonce = B.newNonce();
    var ready = false;
    var tries = 0;
    var post = function (type, fields) { window.postMessage(B.message(B.EXT, type, nonce, fields), location.origin); };

    async function sendPending() {
      var all = await chrome.storage.local.get(null);
      var p = B.pendingFrom(all);
      if (p.words.length || p.titles.length) post("pending", p);
    }

    // After the extension is updated, reloaded or turned off, this copy of it stays on the page but can
    // no longer reach the extension (the browser doesn't put the new one into pages already open). The
    // web app is told, so it can ask for the page to be loaded again: otherwise a language changed here
    // would never reach Netflix's tabs.
    var gone = false;
    function alive() {
      try { return !!(chrome.runtime && chrome.runtime.id); } catch (x) { return false; }
    }

    window.addEventListener("message", async function (e) {
      var d = B.checkMessage(e, { win: window, tag: B.APP, nonce: nonce });
      if (!d) return;
      if (!alive()) {
        if (!gone && ready) { gone = true; post("gone"); }
        return;
      }
      if (d.type === "hello") {
        if (d.nonce !== nonce) return;
        ready = true;
        await sendPending();
        return;
      }
      if (!ready) return;
      if (d.type === "settings") { // (on every change: the language being learned included; Netflix's tabs follow at once)
        await chrome.storage.local.set({ settings: B.cleanSettings(d.settings), device: B.cleanDevice(d.device), settings_at: Date.now() });
      } else if (d.type === "ack") {
        var all = await chrome.storage.local.get(null);
        var keys = B.keysToForget(all, d);
        if (keys.length) await chrome.storage.local.remove(keys);
      }
    });

    // Hello until the web app answers (it starts a moment after this page does).
    (function hello() {
      if (ready || ++tries > 90 || !alive()) return;
      post("hello");
      setTimeout(hello, 1000);
    })();

    // A word saved in a Netflix tab while this page is open: over it goes (a moment later, together
    // with anything saved at the same time).
    var soon = 0;
    chrome.storage.onChanged.addListener(function (changes, area) {
      if (!ready || area !== "local") return;
      var added = Object.keys(changes).some(function (k) {
        return (k.indexOf(B.WORD_KEY) === 0 || k.indexOf(B.TITLE_KEY) === 0) && changes[k].newValue;
      });
      if (!added) return;
      clearTimeout(soon);
      soon = setTimeout(function () { sendPending().catch(function () {}); }, 400);
    });
  }
})();
