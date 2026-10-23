// Runs inside Netflix's own watch page, in the window Tamkeen lays over its player's stage (the
// computer's video window, app/netflix_overlay.py), after web/js/netflix-common.js. Netflix's video
// is copy-protected, so it can only play in Netflix's player; this script makes that player part of
// Tamkeen's page:
//   - only the picture shows: Netflix's own controls, subtitles and buttons are hidden, because
//     Tamkeen shows its own clickable subtitles and controls (except when Netflix needs the viewer:
//     "Are you still watching?" or an error, which stay visible);
//   - when a title starts, the soundtrack is switched to the language being learned when Netflix
//     has one, then the subtitles: Netflix then downloads that subtitle file, which the app's
//     window notices and keeps as the transcript;
//   - the app asks it where the player is (state) and tells it what to do (cmd).
// Netflix's player is reached through the API its own page uses:
//   netflix.appContext.state.playerApp.getAPI().videoPlayer -> getVideoPlayerBySessionId(...)
// whose times are in milliseconds. (Setting the <video>'s currentTime directly makes Netflix stop
// with an error: always seek through it.)
//
// Like the other scripts that run inside someone else's website it is plain script, uses no
// innerHTML and leaves the page's own code alone.
(function () {
  if (window.top !== window || window.__tamkeenNetflixPlayer) return;
  var cfg = window.__tamkeenNetflixCfg || {};
  var hosts = cfg.hosts || ["www.netflix.com", "netflix.com"];
  var lib = window.__tamkeenNetflixLib;
  if (hosts.indexOf(location.hostname) < 0 || !lib) return;
  // The language being learned. Read each time: the browser extension (extension/) tells the page
  // only once it has read its settings, a moment after this script starts.
  var LANG = "";
  function readLang() { LANG = String((window.__tamkeenNetflixCfg || cfg).lang || ""); return LANG; }
  readLang();

  var style = document.createElement("style");
  // Netflix's subtitles never show (Tamkeen shows its own); while a title plays, nothing but the
  // picture does. (visibility, not display: Netflix's own code keeps working, and the video,
  // made visible again inside its hidden boxes, still fills the window.)
  style.textContent = ".player-timedtext, .player-timedtext-text-container { display: none !important; }" +
    "html.tk-only-video, html.tk-only-video body { background: #000 !important; cursor: default !important; }" +
    "html.tk-only-video body * { visibility: hidden !important; }" +
    "html.tk-only-video video { visibility: visible !important; }";
  (document.head || document.documentElement).appendChild(style);

  // ---------- Netflix's page ----------
  /** The player of the title playing (the last session), or null while there is none. */
  function player() {
    try {
      var vp = window.netflix.appContext.state.playerApp.getAPI().videoPlayer;
      var ids = vp.getAllPlayerSessionIds();
      return ids && ids.length ? { p: vp.getVideoPlayerBySessionId(ids[ids.length - 1]), sid: String(ids[ids.length - 1]) } : null;
    } catch (e) { return null; }
  }
  function pageKind() {
    var path = location.pathname;
    if (/^\/watch\//.test(path)) return "watch";
    // The sign-in page, or Netflix's front page for visitors ("/", "/us/", "/gb-en/"): not signed in.
    if (/^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?(?:login|signup)/i.test(path) || /^\/(?:[a-z]{2}(?:-[a-z]{2})?\/?)?$/i.test(path) ||
        document.querySelector("form[data-uia='login-page-container'], input[name='userLoginId']")) return "login";
    if (/^\/profiles/.test(path) || document.querySelector(".profile-gate-container, [data-uia='profile-gate']")) return "profiles";
    return "other";
  }
  function visibleText(el) {
    if (!el) return "";
    var r = el.getBoundingClientRect ? el.getBoundingClientRect() : null;
    if (r && (r.width < 2 || r.height < 2)) return "";
    return String(el.innerText || el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 300);
  }
  /** Netflix saying something went wrong ("Pardon the interruption", too many screens…). */
  function errorText() {
    return visibleText(document.querySelector(".nf-error, .error-page, [data-uia='player-error'], [data-uia='error-page'], " +
      ".watch-video--error-container, .nfp-fatal-error-view"));
  }
  /** Netflix asking the viewer something ("Are you still watching?"). */
  function prompt() {
    return document.querySelector("[data-uia*='interrupt'], .interrupter-modal");
  }
  function video() {
    var list = document.querySelectorAll("video");
    return list.length ? list[list.length - 1] : null;
  }
  function call(p, name) {
    try { return typeof p[name] === "function" ? p[name]() : undefined; } catch (e) { return undefined; }
  }

  // ---------- once per title: soundtrack, then subtitles ----------
  var session = "";
  var subs = { status: "waiting", bcp47: "", name: "" };
  var sound = { status: "waiting", name: "" };
  var textAt = 0;     // when to choose the subtitles (a moment after switching the soundtrack)
  var textTries = 0;

  function choose(found) {
    var p = found.p;
    var now = Date.now();
    if (found.sid !== session) { // a new title (or the next episode)
      session = found.sid;
      subs = { status: "waiting", bcp47: "", name: "" };
      sound = { status: "waiting", name: "" };
      textAt = 0;
      textTries = 0;
    }
    if (!readLang()) return;
    if (sound.status === "waiting") {
      var list = call(p, "getAudioTrackList");
      if (!list) return;
      var current = call(p, "getAudioTrack");
      var pick = lib.chooseAudioTrack(list, LANG, current);
      if (pick) {
        try { p.setAudioTrack(pick); } catch (e) { /* this one can't be switched to */ }
        sound = { status: "switched", name: String(pick.displayName || pick.bcp47 || "") };
        textAt = now + 1500; // the list of subtitles follows the soundtrack
      } else {
        sound = { status: current && lib.base(current.bcp47) === lib.base(LANG) ? "already" : "none",
                  name: String((current && current.displayName) || "") };
        textAt = now;
      }
      return;
    }
    if (subs.status !== "waiting" || now < textAt) return;
    var tracks = call(p, "getTextTrackList") || [];
    if (!tracks.length && ++textTries < 15) { textAt = now + 700; return; }
    var heard = call(p, "getAudioTrack");
    var choice = lib.chooseTextTrack(tracks, LANG, heard && heard.bcp47);
    if (!choice) { subs = { status: "none", bcp47: "", name: "" }; return; }
    var named = { bcp47: String(choice.track.bcp47 || ""), name: String(choice.track.displayName || "") };
    if (choice.image) { subs = { status: "image", bcp47: named.bcp47, name: named.name }; return; }
    subs = { status: "chosen", bcp47: named.bcp47, name: named.name };
    try {
      var done = p.setTextTrack(choice.track);
      if (done && done.catch) done.catch(function () { subs.status = "failed"; });
    } catch (e) { subs.status = "failed"; }
  }

  /** Netflix's own description of the title playing, when its page has it. */
  function readInfo(id) {
    try {
      var vm = window.netflix.appContext.state.playerApp.getState().videoPlayer.videoMetadata;
      var entry = vm && (vm[id] || vm[Number(id)]);
      var meta = entry && (entry._metadata ? entry._metadata.video : entry.video || null);
      return meta ? lib.titleInfo(meta, id) : null;
    } catch (e) { return null; }
  }

  function tick() {
    // Only on a title's own page (/watch/...): Netflix's home and browse pages play trailers with a
    // player of their own, and treating one as the title playing hid the whole page but the trailer
    // (dark once scrolled past it) and changed the trailer's soundtrack.
    var found = pageKind() === "watch" ? player() : null;
    document.documentElement.classList.toggle("tk-only-video", !!(found && video() && !prompt() && !errorText()));
    if (found) choose(found);
  }
  setInterval(tick, 400);
  tick();

  function state() {
    var found = player();
    var p = found && found.p;
    var v = video();
    var id = lib.watchId(location.href);
    var t = p ? Number(call(p, "getCurrentTime")) / 1000 : 0;
    var d = p && typeof p.getDuration === "function" ? Number(call(p, "getDuration")) / 1000 : 0;
    if (!(d > 0) && v && isFinite(v.duration)) d = v.duration;
    var paused = p ? !!call(p, "isPaused") : true;
    var asking = prompt();
    return {
      v: 1, page: pageKind(), id: id, sid: found ? found.sid : "", ready: !!p, video: !!v,
      t: isFinite(t) ? Math.max(0, t) : 0, d: isFinite(d) && d > 0 ? d : 0, paused: paused,
      ended: !!(v && v.ended) || (!!p && paused && d > 0 && t >= d - 0.6),
      rate: p ? Number(call(p, "getPlaybackRate")) || 1 : 1,
      error: errorText(), prompt: asking ? visibleText(asking) || "?" : "",
      subs: subs, audio: sound, info: id ? readInfo(id) : null,
    };
  }

  function cmd(name, value) {
    var found = player();
    var p = found && found.p;
    if (!p) return state();
    try {
      if (name === "play") p.play();
      else if (name === "pause") p.pause();
      else if (name === "seek") p.seek(Math.max(0, Math.round(Number(value) * 1000)));
      else if (name === "rate") {
        var r = Math.max(0.5, Math.min(2, Number(value) || 1));
        try { p.setPlaybackRate(r); } catch (e) { var v = video(); if (v) v.playbackRate = r; }
      } else if (name === "continue") {
        var asking = prompt();
        var b = asking && asking.querySelector("button");
        if (b) b.click();
      }
    } catch (e) { /* Netflix refused this one: the next state says where it is */ }
    return state();
  }

  window.__tamkeenNetflixPlayer = { state: state, cmd: cmd };
})();
