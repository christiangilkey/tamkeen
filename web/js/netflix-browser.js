// Injected into every page of the app's own browser window on the computer (app/desktop.py), after
// web/js/netflix-common.js. It does nothing except on Netflix, where:
//   - it opens on Netflix's titles in the language being learned ("Browse by Languages"), choosing
//     that language in the page's language menu by itself;
//   - picking a title to watch hands it to Tamkeen, which plays it in its own player (Netflix's
//     player, laid over Tamkeen's stage, with clickable subtitles) instead of in this window: the
//     window would otherwise play it too, and Netflix may only allow one screen at a time.
// The hand-over: window.pywebview.api.watch_title(id, info), which answers once the app has it.
// The window is told (window.__tamkeenNetflix) the language, its names, the addresses that list
// titles by language and its messages in the user's language: see _netflix_config in app/desktop.py.
//
// The browser extension (extension/) runs it in Netflix's own tab too, with `handOver: false`: there
// a title picked plays right there, in Netflix's player, with Tamkeen's subtitle bar over it, so
// only the language choice and the messages are used. It reads its settings a moment after the page
// starts, so then this waits for window.__tamkeenNetflixStart(config).
//
// Like the other scripts that run inside someone else's website it is plain script, uses no
// innerHTML, and keeps what it shows in a closed shadow root.
(function run() {
  if (window.top !== window || window.__tamkeenNetflixBrowser) return;
  if (!window.__tamkeenNetflix) {
    window.__tamkeenNetflixStart = function (config) { window.__tamkeenNetflix = config || {}; run(); };
    return;
  }
  var cfg = window.__tamkeenNetflix || {};
  var hosts = cfg.hosts || ["www.netflix.com", "netflix.com"];
  var lib = window.__tamkeenNetflixLib;
  if (hosts.indexOf(location.hostname) < 0 || !lib) return;
  window.__tamkeenNetflixBrowser = true;
  var handOver = cfg.handOver !== false; // the computer's window hands titles to the app
  var text = cfg.text || {};
  var T = function (key, english) { return text[key] || english; };

  // ----- a small message near the bottom of the page -----
  var pill = null;
  var pillTimer = 0;
  function say(message, good) {
    if (!message) return;
    if (!pill) {
      var host = document.createElement("div");
      host.style.cssText = "all:initial;position:fixed;left:0;right:0;bottom:62px;z-index:2147483647;display:flex;justify-content:center;pointer-events:none;";
      pill = document.createElement("div");
      host.attachShadow({ mode: "closed" }).appendChild(pill);
      (document.body || document.documentElement).appendChild(host);
      pill.__host = host;
    }
    if (!pill.__host.isConnected) (document.body || document.documentElement).appendChild(pill.__host);
    pill.style.cssText = "font:600 15px/1.3 system-ui,-apple-system,'Segoe UI',sans-serif;padding:10px 18px;border-radius:999px;" +
      "max-width:80vw;text-align:center;" +
      (good === false ? "background:#7f1d1d;color:#fee2e2;" : good ? "background:#2dd4bf;color:#062a26;" : "background:#1c1c1a;color:#f2f1ec;");
    pill.textContent = message;
    pill.__host.style.display = "flex";
    clearTimeout(pillTimer);
    pillTimer = setTimeout(function () { pill.__host.style.display = "none"; }, good === undefined ? 12000 : 6000);
  }

  function pauseVideos() {
    try {
      var list = document.querySelectorAll("video");
      for (var i = 0; i < list.length; i++) list[i].pause();
    } catch (e) { /* nothing playing */ }
  }

  function clean(s) { return String(s || "").replace(/\s+/g, " ").trim(); }

  /** What the page shows about the title behind a link: its name and picture, when it has them. */
  function linkInfo(a) {
    var info = { title: "", image: "" };
    if (!a) return info;
    var box = a.closest ? (a.closest(".title-card, .slider-item, .titleCard, [data-uia*='title-card'], .previewModal--container") || a) : a;
    var img = (a.querySelector && a.querySelector("img")) || (box.querySelector && box.querySelector("img"));
    var named = clean(a.getAttribute && a.getAttribute("aria-label")) || clean(img && img.getAttribute("alt")) ||
      clean(box.querySelector && box.querySelector(".fallback-text, .title-card-title, .titleCard-title_text") &&
            box.querySelector(".fallback-text, .title-card-title, .titleCard-title_text").textContent);
    info.title = named.slice(0, 200);
    var src = img ? String(img.currentSrc || img.src || "") : "";
    if (/^https:\/\//.test(src)) info.image = src;
    return info;
  }

  /** Netflix's own description of a title (its name; for a series, the episode it would play). */
  function fetchInfo(id) {
    var url = location.origin + "/nq/website/memberapi/release/metadata?movieid=" + encodeURIComponent(id);
    var timeout = new Promise(function (resolve) { setTimeout(function () { resolve(null); }, 3000); });
    var asked = fetch(url, { credentials: "include" }).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { return j && j.video ? lib.titleInfo(j.video, id) : null; })
      .catch(function () { return null; });
    return Promise.race([asked, timeout]);
  }

  var busy = false;
  /** Hand title `id` to the app. `onPage`: Netflix's own watch page for it is already open here. */
  function open(id, info, onPage) {
    if (busy) return;
    var api = window.pywebview && window.pywebview.api;
    if (!api || !api.watch_title) { say("Still loading… try again in a moment.", false); return; }
    busy = true;
    say(T("opening", "Opening in Tamkeen…"));
    fetchInfo(id).then(function (meta) {
      var merged = { title: (meta && meta.title) || info.title || "", show: (meta && meta.show) || "",
                     season: (meta && meta.season) || 0, episode: (meta && meta.episode) || 0,
                     episode_title: (meta && meta.episode_title) || "", image: (meta && meta.image) || info.image || "",
                     duration: (meta && meta.duration) || 0 };
      return api.watch_title((meta && meta.id) || id, merged);
    }).then(function (r) {
      if (r && r.ok) {
        say(T("opened", "✓ Opened in Tamkeen"), true);
        if (onPage) { // leave Netflix's page for it, so it doesn't play here as well
          pauseVideos();
          if (history.length > 1) history.back(); else location.replace(location.origin + "/browse");
        }
      } else {
        say((r && r.error) || T("failed", "Couldn't open this title."), false);
      }
    }).catch(function (e) {
      say(T("failed", "Couldn't open this title.") + " " + (e && e.message ? e.message : ""), false);
    }).then(function () { busy = false; });
  }

  // Picking a title to watch (a play button, an episode): take it before Netflix does.
  window.addEventListener("click", function (e) {
    if (!handOver || e.button || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    var path = e.composedPath ? e.composedPath() : [];
    var link = null;
    for (var i = 0; i < path.length && !link; i++) {
      if (path[i] && path[i].tagName === "A" && path[i].href) link = path[i];
    }
    if (!link && e.target && e.target.closest) link = e.target.closest("a[href]");
    var id = link ? lib.watchId(link.href, location.href) : "";
    if (!id || new URL(link.href, location.href).hostname !== location.hostname) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    open(id, linkInfo(link), false);
  }, true);

  // A watch page reached some other way (Netflix's own buttons change the page without a link).
  var handled = "";
  function checkPage() {
    var id = lib.watchId(location.href);
    if (!id) { handled = ""; return; }
    if (id === handled || busy) return;
    handled = id;
    pauseVideos();
    open(id, { title: clean(document.title).replace(/\s*[-|–]\s*Netflix\s*$/i, "").replace(/^Netflix$/i, ""), image: "" }, true);
  }

  // ----- titles in the language being learned -----
  var LANG = String(cfg.lang || "");
  var NAMES = (cfg.names || []).map(function (n) { return clean(n).toLowerCase(); }).filter(Boolean);
  var BROWSE = cfg.browse || [];
  var store = function (kind) { try { return kind === "local" ? window.localStorage : window.sessionStorage; } catch (e) { return null; } };
  var get = function (kind, key) { var s = store(kind); try { return s ? s.getItem(key) : null; } catch (e) { return null; } };
  var put = function (kind, key, value) { var s = store(kind); try { if (s) s.setItem(key, value); } catch (e) { /* not kept */ } };
  var KEY = "tamkeen-nf-language:" + LANG;

  function languagePage() { return /^\/browse\/(original-audio|audio|subtitles)(\/|$)/.test(location.pathname); }
  function homePage() { return /^\/browse\/?$/.test(location.pathname); }
  function profileGate() { return !!document.querySelector(".profile-gate-container, .list-profiles, [data-uia='profile-gate']"); }
  function named(el) {
    var t = clean(el.textContent).toLowerCase();
    if (!t || t.length > 40) return false;
    return NAMES.some(function (n) { return t === n || t.replace(/\s*\(.*\)\s*$/, "") === n; });
  }
  /** Something on the page that names the language: a link or an entry of the language menu. */
  function findChoice() {
    var list = document.querySelectorAll("a[href*='/browse/'], [role='option'], [role='menuitem'], [role='menuitemradio'], li, .sub-menu-link");
    var best = null;
    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      if (!named(el) || (el.closest && el.closest("[aria-selected='true'], .selected, .active"))) continue;
      if (el.tagName === "A") return el;
      best = best || el;
    }
    return best;
  }
  /** The language menu's button already says the language: it is chosen. */
  function chosen() {
    var toggles = document.querySelectorAll("[aria-haspopup], .nfDropDown .label, [class*='ropDown'] [role='button'], [class*='ropdown'] [role='button']");
    for (var i = 0; i < toggles.length; i++) if (named(toggles[i])) return true;
    return false;
  }

  var tries = 0;
  var opened = [];
  function pickLanguage() {
    if (!LANG || !NAMES.length || get("session", "tamkeen-nf-done") === "1") return;
    if (profileGate()) return; // "Who's watching?" first
    if (homePage()) {
      // The address of the titles by language didn't hold (Netflix sent the window to its home
      // page): the next of the known addresses, then the user's own way there.
      var step = Number(get("session", "tamkeen-nf-step") || "0");
      if (step < BROWSE.length) {
        put("session", "tamkeen-nf-step", String(step + 1));
        location.assign(BROWSE[step]);
      } else {
        put("session", "tamkeen-nf-done", "1");
        say(T("nolang", "Netflix didn't open its titles by language. Use “Browse by Languages” in Netflix's menu."));
      }
      return;
    }
    if (!languagePage()) return;
    put("session", "tamkeen-nf-step", String(BROWSE.length)); // this page exists: no more trying others
    var kept = get("local", KEY);
    if (kept && kept !== location.href && get("session", "tamkeen-nf-kept") !== "1") {
      put("session", "tamkeen-nf-kept", "1");
      location.assign(kept); // where the language was found last time
      return;
    }
    if (chosen()) {
      put("session", "tamkeen-nf-done", "1");
      put("local", KEY, location.href);
      return;
    }
    var choice = findChoice();
    if (choice) {
      put("session", "tamkeen-nf-done", "1");
      choice.click();
      setTimeout(function () { if (languagePage()) put("local", KEY, location.href); }, 1500);
      return;
    }
    // The language menu is closed: open its menus one by one and look again.
    var toggles = document.querySelectorAll("[aria-haspopup], .nfDropDown .label, [class*='ropDown'] [role='button'], [class*='ropdown'] [role='button']");
    for (var i = 0; i < toggles.length; i++) {
      if (opened.indexOf(toggles[i]) >= 0) continue;
      opened.push(toggles[i]);
      try { toggles[i].click(); } catch (e) { /* not a menu after all */ }
      break;
    }
    if (++tries > 14) {
      put("session", "tamkeen-nf-done", "1");
      say(T("choose", "Choose the language you're learning in Netflix's language menu."));
    }
  }

  function signInPage() { return /^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?(?:login|signup)/i.test(location.pathname); }

  var greeted = "";
  function tick() {
    if (handOver) checkPage();
    try { pickLanguage(); } catch (e) { /* Netflix's page changed: the user can choose by hand */ }
    var where = signInPage() ? "signin" : /^\/browse/.test(location.pathname) ? "browse" : "";
    if (where && where !== greeted) {
      greeted = where;
      if (where === "signin") say(T("signin", "Sign in to Netflix here. Only Netflix sees your password."));
      else say(T("tap", "Pick a title to watch it in Tamkeen"), true);
    }
  }
  setInterval(tick, 600);
  tick();
})();
