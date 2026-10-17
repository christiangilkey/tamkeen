// Injected into every page shown in the app's own web browser (the computer's browser window,
// see app/desktop.py, and the phone's InAppBrowser.java). It does nothing except on filmot.com,
// the search engine over YouTube's captions that the Vocab page's "Find in a video" button opens
// (see web/js/filmot.js). There, tapping a link to a YouTube video hands the video and the moment
// the link points at to Tamkeen, which opens it in its own player at that moment.
//
// How the hand-over travels (the same two ways as youtube-browser.js):
//   - computer: window.pywebview.api.watch_video(id, seconds), which answers once the app has the captions;
//   - phone: the page asks to go to "tamkeen-video://watch?v=<id>&t=<seconds>".
// The moment is always sent, 0 when the link has none: that is how the app knows the video came
// from a search for a word.
//
// When the browser was opened by "Find in a video" (window.__tamkeenFind, set by the app), it does
// not wait for a tap: once Filmot's results page is showing, it hands over the videos the page
// lists, top first, and the app keeps the first whose captions say the word (findFromResults in
// filmot.js). If Filmot first asks whether you are human, the user answers; this script only says
// what will happen next and never touches that check.
//   - computer: window.pywebview.api.find_results([{id, at}, ...]);
//   - phone: "tamkeen-video://find?c=<id>.<seconds>,<id>.<seconds>,...".
//
// It only reads what Filmot's pages already show. It asks Filmot nothing and presses nothing.
// Like the other browser scripts this is plain script (not a module) and uses no innerHTML.
(function () {
  if (window.top !== window || window.__tamkeenFilmot) return;
  if (location.hostname.replace(/^www\./, "") !== "filmot.com") return;
  window.__tamkeenFilmot = true;

  /** Seconds in a link's "t" or "start": "95", "95s", "1m35s", "1h2m3s". 0 when there is none. */
  function seconds(value) {
    var s = String(value || "").trim().toLowerCase();
    if (/^\d+(\.\d+)?s?$/.test(s)) return Math.floor(parseFloat(s));
    var m = s.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
    if (!m || !s) return 0;
    return (Number(m[1]) || 0) * 3600 + (Number(m[2]) || 0) * 60 + (Number(m[3]) || 0);
  }

  /** The videos the page lists, in the order shown (top first): every link to one, every embedded
   * player and every YouTube thumbnail. A video's moment is the first one any of its links gives. */
  function listed() {
    var seen = {};
    var out = [];
    var nodes = document.querySelectorAll("a[href], iframe[src], img");
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      var v = null;
      if (n.tagName === "IMG") {
        var m = String(n.getAttribute("src") || n.getAttribute("data-src") || "").match(/^(?:https?:)?\/\/i\d?\.ytimg\.com\/(?:vi|vi_webp)\/([\w-]{11})\//);
        if (m) v = { id: m[1], at: 0 };
      } else {
        v = video(n.tagName === "A" ? n.href : n.getAttribute("src"));
      }
      if (!v) continue;
      if (seen[v.id]) { if (!seen[v.id].at && v.at) seen[v.id].at = v.at; continue; }
      seen[v.id] = v;
      out.push(v);
    }
    return out;
  }

  /** {id, at} for a link to a YouTube video, else null. */
  function video(href) {
    var u;
    try { u = new URL(href, location.href); } catch (e) { return null; }
    var host = u.hostname.toLowerCase().replace(/^(www|m|music)\./, "");
    var id = null;
    if (host === "youtu.be") id = u.pathname.split("/")[1];
    else if (host === "youtube.com" || host === "youtube-nocookie.com") {
      var m = u.pathname.match(/^\/(?:shorts|embed|live|v)\/([\w-]{11})/);
      id = m ? m[1] : u.pathname === "/watch" ? u.searchParams.get("v") : null;
    }
    if (!id || !/^[\w-]{11}$/.test(id)) return null;
    var at = seconds(u.searchParams.get("t") || u.searchParams.get("start") || u.searchParams.get("time_continue"));
    return { id: id, at: Math.min(at, 999999) };
  }

  // ----- a small message near the bottom of the page (computer only; the phone shows its own) -----
  var pill = null;
  var pillTimer = 0;
  function say(text, good) {
    if (!text) return;
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
      "box-shadow:0 6px 24px rgba(0,0,0,.45);max-width:80vw;text-align:center;direction:ltr;" +
      (good === false ? "background:#7f1d1d;color:#fee2e2;" : good ? "background:#2dd4bf;color:#062a26;" : "background:#1c1c1a;color:#f2f1ec;");
    pill.textContent = text;
    pill.__host.style.display = "flex";
    clearTimeout(pillTimer);
    pillTimer = setTimeout(function () { pill.__host.style.display = "none"; }, good === undefined ? 30000 : 6000);
  }

  var busy = false;
  function open(v) {
    if (busy) return;
    if (window.__tamkeenBridge === "address") { // the phone's browser
      location.href = "tamkeen-video://watch?v=" + v.id + "&t=" + v.at;
      return;
    }
    var api = window.pywebview && window.pywebview.api;
    if (!api || !api.watch_video) { say("Still loading… try again in a moment.", false); return; }
    busy = true;
    say("Getting captions…");
    api.watch_video(v.id, v.at).then(function (r) {
      if (r && r.ok) say("✓ Opened in Tamkeen", true);
      else say((r && r.error) || "Couldn't open this video.", false);
    }).catch(function (e) {
      say("Couldn't open this video. " + (e && e.message ? e.message : ""), false);
    }).then(function () { busy = false; });
  }

  // Tapping a link to a video anywhere on Filmot (a result's time, title or picture).
  window.addEventListener("click", function (e) {
    if (e.button || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    var path = e.composedPath ? e.composedPath() : [];
    var link = null;
    for (var i = 0; i < path.length && !link; i++) {
      if (path[i] && path[i].tagName === "A" && path[i].href) link = path[i];
    }
    if (!link && e.target && e.target.closest) link = e.target.closest("a[href]");
    var v = link ? video(link.href) : null;
    if (!v) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    open(v);
  }, true);

  // ----- "Find in a video": take the results by themselves -----
  var phone = window.__tamkeenBridge === "address";
  function handOver(list) {
    if (phone) {
      location.href = "tamkeen-video://find?c=" + list.map(function (v) { return v.id + "." + v.at; }).join(",");
      return;
    }
    var api = window.pywebview && window.pywebview.api;
    if (!api || !api.find_results) { say("Tap a result's link to YouTube to open that moment in Tamkeen", true); return; }
    busy = true;
    say(list.length ? "Looking for the word in the top video…" : "Getting the results…");
    api.find_results(list).then(function (r) {
      if (r && r.ok) say("✓ Saved in Tamkeen", true);
      else say((r && r.error) || "Couldn't use these results. Tap one to try it.", false);
    }).catch(function (e) {
      say("Couldn't use these results. " + (e && e.message ? e.message : ""), false);
    }).then(function () { busy = false; });
  }

  // ----- the language of the captions -----
  // The app asks for the language being learned in the search's address ("&lang=…"). When the
  // results page also has its own list of caption languages and another one is chosen in it, the
  // script chooses the learned one there, once per page, as a person would, and waits for the page
  // to show those results. That list names languages in English ("Arabic", "German"), which tells
  // it apart from the site's own interface-language list (which says "Deutsch", "Español").
  var want = window.__tamkeenFind && typeof window.__tamkeenFind === "object" ? window.__tamkeenFind : {};
  function languageList() {
    var lists = document.querySelectorAll("select");
    for (var i = 0; i < lists.length; i++) {
      var texts = [];
      for (var j = 0; j < lists[i].options.length; j++) texts.push(String(lists[i].options[j].text || "").trim());
      if (texts.indexOf("English") >= 0 && (texts.indexOf("German") >= 0 || texts.indexOf("Spanish") >= 0 || texts.indexOf("French") >= 0)) return lists[i];
    }
    return null;
  }
  /** Choose the learned language in the page's list. True when that was done (the page will change). */
  function chooseLanguage() {
    var values = (want.values || []).map(function (v) { return String(v).toLowerCase(); });
    var names = (want.names || []).map(function (v) { return String(v).toLowerCase(); });
    if (!values.length && !names.length) return null;
    var key = "tamkeen-lang:" + location.pathname + location.search;
    try { if (sessionStorage.getItem(key)) return null; } catch (e) { /* not kept: tried once per load */ }
    var list = languageList();
    if (!list) return null;
    var pick = null;
    for (var i = 0; i < list.options.length && !pick; i++) {
      var o = list.options[i];
      if (values.indexOf(String(o.value || "").toLowerCase()) >= 0 || names.indexOf(String(o.text || "").trim().toLowerCase()) >= 0) pick = o;
    }
    if (!pick || list.value === pick.value) return null;
    try { sessionStorage.setItem(key, "1"); } catch (e) { /* see above */ }
    list.value = pick.value;
    list.dispatchEvent(new Event("input", { bubbles: true }));
    list.dispatchEvent(new Event("change", { bubbles: true }));
    return list;
  }

  if (window.__tamkeenFind && /^\/search\//.test(location.pathname)) {
    // Wait for the results to be on the page (it may still be loading), choose the caption
    // language if the page offers a choice, then hand the results over once.
    var waited = 0;
    var chose = null;     // the language list just changed, or null
    var choseAt = -1;
    var asked = false;
    var timer = setInterval(function () {
      waited += 500;
      var ready = document.readyState === "complete";
      if (ready && !asked) {
        asked = true;
        chose = chooseLanguage();
        if (chose) { choseAt = waited; say("Showing videos with captions in the language you're learning…"); return; }
      }
      if (chose) {
        // A page that does not reload by itself when the list changes is sent with its own form.
        if (waited - choseAt === 2000 && chose.form) {
          try { chose.form.requestSubmit ? chose.form.requestSubmit() : chose.form.submit(); } catch (e) { /* the results shown stay */ }
        }
        if (waited - choseAt < 5000) return;  // the page is (probably) on its way with those results
      }
      var list = ready ? listed() : [];
      if ((ready && (list.length || waited >= 6000)) || waited >= 15000) {
        clearInterval(timer);
        handOver(list.slice(0, 8));
      }
    }, 500);
  } else if (window.__tamkeenFind && /captcha|verify/i.test(location.pathname)) {
    say("Answer Filmot's check yourself. Tamkeen then takes the top video by itself.");
  } else if (!phone && /^\/search\//.test(location.pathname)) {
    say("Tap a result's link to YouTube to open that moment in Tamkeen", true);
  }
})();
