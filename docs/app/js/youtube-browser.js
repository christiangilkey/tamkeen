// Injected into every page shown in the app's own web browser (the computer's browser window,
// see app/desktop.py, and the phone's InAppBrowser.java). It does nothing except on youtube.com,
// where tapping a video hands that video to Tamkeen, which opens it in its own player (YouTube's
// embedded player with clickable captions) instead of on YouTube's page.
//
// How the hand-over travels:
//   - computer: window.pywebview.api.watch_video(id), which answers once the app has the captions;
//   - phone: the page asks to go to "tamkeen-video://watch?v=<id>", an address only the app's browser
//     understands (it has no other way to talk to the app, on purpose).
//
// On a channel's page it also shows a Follow button, which adds the channel to the app's followed
// channels (the same list as the Follow button in the app's player); see further down.
//
// Like browser-toolbar.js this runs inside someone else's website, so it is plain script (not a
// module), uses no innerHTML, and keeps what it shows in closed shadow roots.
(function () {
  if (window.top !== window || window.__tamkeenYouTube) return;
  if (location.hostname.replace(/^(www|m|music)\./, "") !== "youtube.com") return;
  window.__tamkeenYouTube = true;

  /** The video id in a YouTube address, or null (same rules as videoId in ytcaptions.js). */
  function videoId(href) {
    var u;
    try { u = new URL(href, location.href); } catch (e) { return null; }
    var host = u.hostname.toLowerCase().replace(/^(www|m|music)\./, "");
    var id = null;
    if (host === "youtu.be") id = u.pathname.split("/")[1];
    else if (host === "youtube.com") {
      var m = u.pathname.match(/^\/(?:shorts|embed|live|v)\/([\w-]{11})/);
      id = m ? m[1] : u.pathname === "/watch" ? u.searchParams.get("v") : null;
    }
    return id && /^[\w-]{11}$/.test(id) ? id : null;
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
    pillTimer = setTimeout(function () { pill.__host.style.display = "none"; }, good === undefined ? 30000 : 5000);
  }

  function pauseVideos() {
    try {
      var list = document.querySelectorAll("video");
      for (var i = 0; i < list.length; i++) list[i].pause();
    } catch (e) { /* nothing playing */ }
  }

  /** The moment a video's address asks for ("t=95", "t=1m35s"), in seconds, or null. */
  function moment(href) {
    var u;
    try { u = new URL(href, location.href); } catch (e) { return null; }
    var s = String(u.searchParams.get("t") || u.searchParams.get("start") || "").trim().toLowerCase();
    if (!s) return null;
    if (/^\d+(\.\d+)?s?$/.test(s)) return Math.floor(parseFloat(s));
    var m = s.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
    return m ? (Number(m[1]) || 0) * 3600 + (Number(m[2]) || 0) * 60 + (Number(m[3]) || 0) : null;
  }

  var busy = false;
  /** Hand video `id` to the app. `onPage` = YouTube's own page for it is already showing. */
  function open(id, onPage) {
    if (busy) return;
    var at = onPage ? moment(location.href) : null;
    if (window.__tamkeenBridge === "address") { // the phone's browser
      location.href = "tamkeen-video://watch?v=" + id + (at === null ? "" : "&t=" + at);
      return;
    }
    var api = window.pywebview && window.pywebview.api;
    if (!api || !api.watch_video) { say("Still loading… try again in a moment.", false); return; }
    busy = true;
    say("Getting captions…");
    (at === null ? api.watch_video(id) : api.watch_video(id, at)).then(function (r) {
      if (r && r.ok) {
        say("✓ Opened in Tamkeen", true);
        if (onPage) { // leave YouTube's page for the video, so it isn't playing in two places
          pauseVideos();
          if (history.length > 1) history.back(); else location.replace("https://www.youtube.com/");
        }
      } else {
        say((r && r.error) || "Couldn't open this video.", false);
      }
    }).catch(function (e) {
      say("Couldn't open this video. " + (e && e.message ? e.message : ""), false);
    }).then(function () { busy = false; });
  }

  // Tapping a video anywhere on YouTube (thumbnail, title, short): take it before YouTube does.
  window.addEventListener("click", function (e) {
    if (e.button || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    var path = e.composedPath ? e.composedPath() : [];
    var link = null;
    for (var i = 0; i < path.length && !link; i++) {
      if (path[i] && path[i].tagName === "A" && path[i].href) link = path[i];
    }
    if (!link && e.target && e.target.closest) link = e.target.closest("a[href]");
    var id = link ? videoId(link.href) : null;
    if (!id) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    open(id, false);
  }, true);

  // A video's page reached some other way (a typed address, a link opened from elsewhere).
  var handled = "";
  function checkPage() {
    var id = videoId(location.href);
    if (!id) { handled = ""; return; }
    if (id === handled || busy) return;
    handled = id;
    pauseVideos();
    open(id, true);
  }

  // ----- a channel's page: a button to follow the channel in Tamkeen -----
  // The same followed-channels list as the Follow button in the app's player (Library → YouTube).
  //   - computer: window.pywebview.api.following(name) and .follow_channel(name, id, image, on);
  //   - phone: the page asks to go to "tamkeen-video://follow?name=…&id=…&image=…&on=1|0". It
  //     cannot ask the app anything, so it is told the followed names up front
  //     (window.__tamkeenFollowing) and remembers its own presses for the rest of the visit.
  var phone = window.__tamkeenBridge === "address";
  var ACCENT = "#2bb8c6"; // the app's action colour
  var channelInfo = {};   // channel page path -> {name, id, image}
  var shownPath = "";     // the channel page the button is (being) shown for
  var channel = null;
  var following = false;
  var followBusy = false;
  var followHost = null;
  var followBtn = null;

  /** "/@name", "/channel/UC…", "/c/name" or "/user/name" when a channel's page is showing, else "". */
  function channelPath() {
    var m = location.pathname.match(/^\/(channel\/UC[\w-]{20,30}|@[^\/]+|c\/[^\/]+|user\/[^\/]+)(\/|$)/);
    return m ? "/" + m[1] : "";
  }
  function decode(s) {
    return String(s || "").replace(/&#(\d+);/g, function (_, n) { return String.fromCharCode(Number(n)); })
      .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  }
  /** What a channel page's own HTML says about the channel (the tags it offers for link previews). */
  function readChannel(html) {
    var pick = function (rx) { var m = rx.exec(html); return m ? decode(m[1]) : ""; };
    var id = pick(/<meta itemprop="(?:identifier|channelId)" content="(UC[\w-]{20,30})"/);
    var image = pick(/<meta property="og:image" content="(https:\/\/[^"]+)"/);
    return { name: pick(/<meta property="og:title" content="([^"]*)"/).replace(/\s+/g, " ").trim(), id: id, image: image };
  }
  function remembered(name) {
    try { var v = sessionStorage.getItem("tamkeen-follow:" + name); return v === null ? null : v === "1"; } catch (e) { return null; }
  }
  function remember(name, on) {
    try { sessionStorage.setItem("tamkeen-follow:" + name, on ? "1" : "0"); } catch (e) { /* not kept: the app still has it */ }
  }
  function paintFollow() {
    if (!followBtn || !channel) return;
    var name = channel.name.length > 26 ? channel.name.slice(0, 25) + "…" : channel.name;
    followBtn.textContent = (following ? "✓ Following " : "+ Follow ") + name;
    followBtn.title = following ? "You follow this channel in Tamkeen. Press to stop following." : "Follow this channel in Tamkeen: it appears in your Library under YouTube";
    followBtn.style.cssText = "font:600 15px/1.2 system-ui,-apple-system,'Segoe UI',sans-serif;box-sizing:border-box;max-width:78vw;" +
      "padding:10px 18px;border-radius:999px;border:2px solid " + ACCENT + ";cursor:pointer;white-space:nowrap;overflow:hidden;" +
      "text-overflow:ellipsis;box-shadow:0 6px 24px rgba(0,0,0,.45);direction:ltr;" +
      (following ? "background:" + ACCENT + ";color:#03262b;" : "background:#1c1c1a;color:" + ACCENT + ";");
  }
  function showFollow(info) {
    channel = info;
    if (!followHost) {
      followHost = document.createElement("div");
      // Bottom right on the computer (above the browser's bar, beside the round import button when
      // the window has one); bottom left on the phone, where the bottom right corner belongs to it.
      followHost.style.cssText = "all:initial;position:fixed;z-index:2147483647;" +
        (phone ? "left:14px;bottom:18px;" : "right:" + (window.__tamkeenNoImport ? 18 : 84) + "px;bottom:62px;");
      followHost.setAttribute("data-tamkeen", "follow");
      followBtn = document.createElement("button");
      followBtn.onclick = toggleFollow;
      followHost.attachShadow({ mode: "closed" }).appendChild(followBtn);
    }
    if (!followHost.isConnected) (document.body || document.documentElement).appendChild(followHost);
    followHost.style.display = "block";
    var kept = remembered(info.name);
    following = kept !== null ? kept : (window.__tamkeenFollowing || []).indexOf(info.name) >= 0;
    paintFollow();
    if (phone) return;
    var api = window.pywebview && window.pywebview.api;
    if (api && api.following) {
      api.following(info.name).then(function (r) {
        if (channel !== info) return;
        following = !!(r && r.following);
        paintFollow();
      }).catch(function () { /* drawn as not followed */ });
    }
  }
  function hideFollow() {
    channel = null;
    shownPath = "";
    if (followHost) followHost.style.display = "none";
  }
  function toggleFollow() {
    if (!channel || followBusy) return;
    var info = channel;
    var on = !following;
    if (phone) {
      following = on;
      remember(info.name, on);
      paintFollow();
      location.href = "tamkeen-video://follow?name=" + encodeURIComponent(info.name) + "&id=" + encodeURIComponent(info.id) +
        "&image=" + encodeURIComponent(info.image) + "&on=" + (on ? "1" : "0");
      return;
    }
    var api = window.pywebview && window.pywebview.api;
    if (!api || !api.follow_channel) { say("Still loading… try again in a moment.", false); return; }
    followBusy = true;
    api.follow_channel(info.name, info.id, info.image, on).then(function (r) {
      if (r && r.ok) {
        if (channel === info) { following = !!r.following; paintFollow(); }
        remember(info.name, !!r.following);
        say(r.following ? "Following " + info.name + ". It's in your Library under YouTube." : "Stopped following " + info.name + ".", true);
      } else {
        say((r && r.error) || "Couldn't follow this channel.", false);
      }
    }).catch(function (e) {
      say("Couldn't follow this channel. " + (e && e.message ? e.message : ""), false);
    }).then(function () { followBusy = false; });
  }
  /** Show the button on a channel's page, hide it everywhere else. */
  function checkChannel() {
    var path = channelPath();
    if (!path) { if (shownPath) hideFollow(); return; }
    if (path === shownPath) return;
    hideFollow();
    shownPath = path;
    if (channelInfo[path]) { showFollow(channelInfo[path]); return; }
    // YouTube changes pages without reloading, so the page's own tags may describe an earlier
    // page: ask for this channel's page afresh and read them from that.
    fetch(location.origin + path, { credentials: "same-origin" }).then(function (res) { return res.text(); }).then(function (html) {
      var info = readChannel(html);
      if (!info.name) return;
      channelInfo[path] = info;
      if (shownPath === path) showFollow(info);
    }).catch(function () { /* no button this time */ });
  }

  // ----- lists of videos: a small tag on each video YouTube has no captions for -----
  // "No captions · Gemini required" on the thumbnail, before the video is tapped (tapping it shows
  // the "No captions on YouTube" box, which offers Gemini's). The same rules as the web app's list
  // (web/js/ytcaptiontag.js, ytcaptions.js checkCaptions), copied here because this is plain script
  // inside YouTube's page; tests/js/ytcaptiontag.test.mjs keeps the copy alike. Only the videos on
  // screen are checked, a few at a time, with the one question the player asks first (its caption
  // list: nothing of the video is downloaded), and the answers are kept a while by video id. A check
  // that failed never tags. The app tells the page what it needs up front, in the same evaluation as
  // this script, and the setting is taken off `window` at once so YouTube's own scripts never see it:
  //   window.__tamkeenCaptionTag = {lang, taught: [codes], made: [ids with Gemini's captions in the
  //   library], text: the tag (translated), long: the tag for a video too long for Gemini, max: seconds}
  var tagCfg = window.__tamkeenCaptionTag || null;
  try { delete window.__tamkeenCaptionTag; } catch (e) { window.__tamkeenCaptionTag = undefined; }
  var CLIENTS = [{ clientName: "ANDROID", clientVersion: "20.10.38" }, { clientName: "IOS", clientVersion: "20.10.4" }];
  var PERSON_ONLY = { la: true }; // Latin: only captions a person wrote count (ytcaptions.js)
  var KEEP = { yes: 3 * 24 * 3600e3, other: 3 * 24 * 3600e3, none: 6 * 3600e3 };
  var STORE = "tamkeen-captions";
  var AT_ONCE = 3;
  var made = {};
  if (tagCfg && tagCfg.made) for (var mi = 0; mi < tagCfg.made.length; mi++) made[tagCfg.made[mi]] = true;

  function baseLanguage(code) {
    var b = String(code || "").toLowerCase().split(/[-_]/)[0];
    if (b === "fil") return "tl";
    return b === "cmn" || b === "yue" ? "zh" : b;
  }
  /** captionVerdict (ytcaptions.js): "yes" (captions in `wanted`, YouTube's translation included),
   * "other" (only in another taught language) or "none" (nothing the player could use). */
  function verdict(tracks, wanted, taught) {
    var manual = false, auto = false, translatable = false, spoken = [], written = [], i;
    for (i = 0; i < (tracks || []).length; i++) {
      var t = tracks[i];
      if (!t || !t.baseUrl) continue;
      var lang = baseLanguage(t.languageCode);
      var isAuto = t.kind === "asr";
      if (lang === wanted) { if (isAuto) auto = true; else manual = true; } else if (t.isTranslatable !== false) translatable = true;
      (isAuto ? spoken : written).push(lang);
    }
    if (manual) return "yes";
    if (PERSON_ONLY[wanted]) return "none";
    if (auto || (wanted && translatable)) return "yes";
    var from = spoken.length ? spoken : written;
    for (i = 0; i < from.length; i++) if (from[i] !== wanted && (taught || []).indexOf(from[i]) >= 0) return "other";
    return "none";
  }
  /** checkCaptions (ytcaptions.js): {captions: "yes"|"other"|"none"|"unknown", seconds}. */
  function askYouTube(id) {
    var seconds = 0;
    function one(i, empty) {
      if (i >= CLIENTS.length) return { captions: empty ? "none" : "unknown", seconds: seconds };
      var c = CLIENTS[i];
      return fetch(location.origin + "/youtubei/v1/player?prettyPrint=false", {
        method: "POST", credentials: "omit", headers: { "Content-Type": "application/json", "Accept-Language": "en" },
        body: JSON.stringify({ context: { client: { clientName: c.clientName, clientVersion: c.clientVersion, hl: "en" } }, videoId: id }),
      }).then(function (res) { return res && res.status < 400 ? res.json() : null; }).then(function (data) {
        var details = data && data.videoDetails;
        if (!details || ((data.playabilityStatus || {}).status || "") !== "OK") return { captions: "unknown", seconds: seconds };
        seconds = Number(details.lengthSeconds) || 0;
        var renderer = (data.captions || {}).playerCaptionsTracklistRenderer || {};
        var tracks = renderer.captionTracks && renderer.captionTracks.length ? renderer.captionTracks : [];
        if (tracks.length) return { captions: verdict(tracks, tagCfg.lang, tagCfg.taught), seconds: seconds };
        if (details.isLiveContent && !seconds) return { captions: "unknown", seconds: seconds }; // live: Gemini can't caption it
        return one(i + 1, true);
      });
    }
    return Promise.resolve().then(function () { return one(0, false); })
      .catch(function () { return { captions: "unknown", seconds: seconds }; });
  }

  // The answers, by study language and video id: [captions, seconds, kept until].
  var answers = null;
  function loadAnswers() {
    if (answers) return answers;
    try { answers = JSON.parse(localStorage.getItem(STORE) || "{}") || {}; } catch (e) { answers = {}; }
    if (typeof answers !== "object") answers = {};
    return answers;
  }
  function known(id) {
    var a = loadAnswers()[tagCfg.lang + ":" + id];
    return a && a[2] > Date.now() ? { captions: a[0], seconds: a[1] } : null;
  }
  function keepAnswer(id, result) {
    var all = loadAnswers();
    var now = Date.now();
    all[tagCfg.lang + ":" + id] = [result.captions, result.seconds || 0, now + KEEP[result.captions]];
    var keys = Object.keys(all);
    if (keys.length > 500) for (var i = 0; i < keys.length; i++) if (!(all[keys[i]][2] > now) || i < keys.length - 500) delete all[keys[i]];
    try { localStorage.setItem(STORE, JSON.stringify(all)); } catch (e) { /* kept for this page only */ }
  }

  var waiting = [];
  var asking = {};   // id -> true while asked or waiting
  var failed = {};   // id -> when to ask again after a failed check
  var running = 0;
  var fails = 0;
  var pausedUntil = 0; // YouTube refusing again and again: stop asking for a while
  function want(id) {
    if (asking[id] || (failed[id] || 0) > Date.now()) return;
    asking[id] = true;
    waiting.push(id);
    nextCheck();
  }
  function nextCheck() {
    while (running < AT_ONCE && waiting.length && Date.now() >= pausedUntil) {
      var id = waiting.shift();
      running++;
      askYouTube(id).then(function (id) {
        return function (r) {
          running--;
          delete asking[id];
          if (r.captions === "unknown") {
            failed[id] = Date.now() + 120e3;
            if (++fails >= 4) { fails = 0; pausedUntil = Date.now() + 120e3; waiting = []; asking = {}; }
          } else {
            fails = 0;
            keepAnswer(id, r);
          }
          nextCheck();
        };
      }(id));
    }
  }

  var tags = []; // [{link, host, id}]
  function tagOn(link) {
    for (var i = 0; i < tags.length; i++) if (tags[i].link === link) return tags[i];
    return null;
  }
  function addTag(link, id, result) {
    var host = document.createElement("span");
    host.setAttribute("data-tamkeen", "captions");
    host.style.cssText = "all:initial;position:absolute;left:6px;top:6px;z-index:3;pointer-events:none;max-width:calc(100% - 12px);display:block;";
    var label = document.createElement("span");
    label.setAttribute("dir", "auto");
    label.textContent = Number(result.seconds) > (tagCfg.max || 3600) && tagCfg.long ? tagCfg.long : tagCfg.text;
    // Like the app's own small tags: plain, one line.
    label.style.cssText = "display:inline-block;box-sizing:border-box;max-width:100%;font:600 12px/1.5 system-ui,-apple-system,'Segoe UI',sans-serif;" +
      "padding:1px 8px;border-radius:99px;background:#1c1c1a;color:#f2f1ec;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;";
    host.attachShadow({ mode: "closed" }).appendChild(label);
    try {
      var cs = window.getComputedStyle ? window.getComputedStyle(link) : null;
      if (cs && cs.position === "static") link.style.position = "relative";
    } catch (e) { /* placed as it comes */ }
    link.appendChild(host);
    tags.push({ link: link, host: host, id: id });
  }
  function removeTag(t) {
    try { if (t.host.parentNode) t.host.parentNode.removeChild(t.host); } catch (e) { /* already gone */ }
    tags.splice(tags.indexOf(t), 1);
  }
  /** Tag the videos on (or near) the screen that YouTube has no captions for; ask about the rest. */
  function checkTags() {
    if (!tagCfg || !tagCfg.lang || !tagCfg.text || !document.querySelectorAll) return;
    // YouTube reuses its list's elements for other videos as it scrolls: a tag goes with its video.
    for (var k = tags.length - 1; k >= 0; k--) {
      var t = tags[k];
      if (!t.link.isConnected || !t.host.isConnected || videoId(t.link.href) !== t.id) removeTag(t);
    }
    var links = document.querySelectorAll('a[href*="watch?v="], a[href*="/shorts/"]');
    var height = window.innerHeight || 800;
    for (var i = 0; i < links.length; i++) {
      var link = links[i];
      var id = videoId(link.href);
      if (!id || made[id] || tagOn(link)) continue;
      if (!link.querySelector || !link.querySelector("img")) continue; // the thumbnail's link (not the title's)
      var box = link.getBoundingClientRect ? link.getBoundingClientRect() : null;
      if (!box || !box.width || box.bottom < -300 || box.top > height + 300) continue;
      var have = known(id);
      if (!have) want(id);
      else if (have.captions === "none") addTag(link, id, have);
    }
  }
  if (window.__tamkeenTestHooks) window.__tamkeenTestHooks.verdict = verdict;

  setInterval(function () { checkPage(); checkChannel(); checkTags(); }, 700);
  checkPage();
  checkChannel();
  checkTags();
  if (window.__tamkeenBridge !== "address" && !videoId(location.href)) say("Tap a video to watch it in Tamkeen", true);
})();
