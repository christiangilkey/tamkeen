// Tamkeen's karaoke for Spotify, inside Spotify's own page (its "main world", where the sound plays),
// after content/spotify-page.js. It passes Tamkeen's part of the page (content/spotify.js) what is
// playing and where, a few times a second, and does what Tamkeen's panel asks (as page events):
//   "tamkeen:sp-state"  -> {title, artist, album, id, t, d, paused, rate, at, via, lyrics}
//                          (lyrics: Spotify's own lines while its lyrics view shows them, see
//                          spotify-page.js readLyrics; the lines are sent only when they change)
//   "tamkeen:sp-cmd"    <- play, pause, seek (seconds), line (Spotify's own lyric line k: Spotify
//                          jumps to it)
// Spotify's controls are used the way a person uses them (its play button, its progress bar); each
// command is checked a moment later and, if the song didn't follow, tried another way.
// It reads nothing private and keeps nothing: the song's name and where it is.
(function () {
  if (window.top !== window || window.__tamkeenSpMain) return;
  window.__tamkeenSpMain = true;
  var lib = window.__tamkeenSpotifyPage;
  if (!lib) return;

  // ---------- the sound itself ----------
  // Spotify plays through a media element that is often not in the page; the ones started lately are
  // remembered as they start, for the exact time (the bar moves only once a second). Only one whose
  // length is the song's is trusted (not the looping silent "Canvas" videos, not an ad).
  var medias = [];
  var play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    try {
      var i = medias.indexOf(this);
      if (i >= 0) medias.splice(i, 1);
      medias.push(this);
      if (medias.length > 6) medias.shift();
    } catch (e) { /* never in the way of Spotify's own playing */ }
    return play.apply(this, arguments);
  };
  function mainMedia(dur) {
    if (!(dur > 0)) return null;
    var paused = null;
    for (var i = medias.length - 1; i >= 0; i--) {
      var m = medias[i];
      try {
        if (!m || m.loop || (m.tagName === "VIDEO" && m.muted)) continue;
        if (!(m.duration > 0) || !isFinite(m.duration) || Math.abs(m.duration - dur) > 2.5) continue;
        if (!m.paused) return m;
        if (!paused) paused = m;
      } catch (e) { /* gone */ }
    }
    return paused;
  }

  // The browser's "now playing" record, as Spotify updates it (its length and place, when given).
  var session = null;
  try {
    var ms = navigator.mediaSession;
    if (ms && typeof ms.setPositionState === "function") {
      var setPos = ms.setPositionState;
      ms.setPositionState = function (s) {
        try {
          if (s && s.duration > 0 && isFinite(s.duration)) session = { d: s.duration, t: Number(s.position) || 0, rate: Number(s.playbackRate) || 1, at: Date.now() };
        } catch (e) { /* ignore */ }
        return setPos.apply(this, arguments);
      };
    }
  } catch (e) { /* no media session */ }

  // ---------- where the song is ----------
  // The bar's time changes about once a second: between changes it runs on from the moment it last
  // changed, so the karaoke moves smoothly; it counts as paused when it hasn't moved for a while (and
  // nothing better says).
  var anchor = { raw: NaN, at: 0, id: "" };
  function place(np) {
    var now = Date.now();
    var bar = lib.progress(document);
    var d = bar.d;
    var m = mainMedia(d);
    if (m) {
      try { return { t: m.currentTime, d: m.duration, paused: m.paused, rate: m.playbackRate || 1, via: "media" }; } catch (e) { /* gone */ }
    }
    var state = "";
    try { state = navigator.mediaSession && navigator.mediaSession.playbackState; } catch (e) { state = ""; }
    var raw = bar.t;
    if (!Number.isFinite(raw) && session && Math.abs((session.d || 0) - (d || session.d)) < 2.5) {
      var run = state === "paused" ? 0 : (now - session.at) / 1000 * session.rate;
      return { t: Math.min(session.t + run, session.d), d: session.d, paused: state === "paused", rate: session.rate, via: "session" };
    }
    if (!Number.isFinite(raw)) return { t: NaN, d: d, paused: true, rate: 1, via: "" };
    if (raw !== anchor.raw || np.id !== anchor.id || np.title !== anchor.title) anchor = { raw: raw, at: now, id: np.id, title: np.title };
    var moving = now - anchor.at < 1800;
    var paused = state === "paused" ? true : state === "playing" ? false : !moving;
    var t = paused ? raw : Math.min(raw + (now - anchor.at) / 1000, raw + 1.2);
    return { t: t, d: d, paused: paused, rate: 1, via: bar.via };
  }

  // ---------- Spotify's own lyrics, while they show ----------
  function hash(s) {
    var h = 5381;
    for (var i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
    return h.toString(36);
  }
  var lastLyrics = "", sentAt = 0;
  function lyrics() {
    var got = lib.readLyrics(document);
    if (!got) { lastLyrics = ""; return null; }
    var key = hash(got.lines.join("\n"));
    var out = { hash: key, active: got.active, count: got.lines.length };
    if (key !== lastLyrics || Date.now() - sentAt > 3000) { out.lines = got.lines; lastLyrics = key; sentAt = Date.now(); }
    return out;
  }

  function state() {
    var np = lib.nowPlaying(document, navigator);
    var p = place(np);
    return {
      title: np.title, artist: np.artist, album: np.album, id: np.id,
      t: Number.isFinite(p.t) ? Math.round(p.t * 1000) / 1000 : null, d: p.d > 0 ? Math.round(p.d * 1000) / 1000 : null,
      paused: !!p.paused, rate: p.rate || 1, via: p.via, at: Date.now(), lyrics: lyrics(),
    };
  }
  function send() {
    var s;
    try { s = state(); } catch (e) { return; }
    document.dispatchEvent(new CustomEvent("tamkeen:sp-state", { detail: JSON.stringify(s) }));
  }
  setInterval(send, 250);

  // ---------- doing what the panel asks ----------
  function now() { var p = place(lib.nowPlaying(document, navigator)); return p; }

  function clickPlayPause() {
    var b = document.querySelector('[data-testid="now-playing-bar"] [data-testid="control-button-playpause"]') || document.querySelector('[data-testid="control-button-playpause"]');
    if (!b || b.disabled) return false;
    b.click();
    return true;
  }
  function setPlaying(want) {
    var p = now();
    if (p.paused === !want) return;
    var used = clickPlayPause();
    setTimeout(function () { // didn't follow: the sound itself
      var q = now();
      if (q.paused === !want) return;
      var m = mainMedia(q.d);
      if (m) { try { if (want) m.play(); else m.pause(); } catch (e) { /* refused */ } }
      else if (!used) clickPlayPause();
    }, 900);
  }

  // Seeking: Spotify's progress bar's hidden slider (set as a person moving it would: its value, then
  // "input" and "change"); else a click on the bar at that point; else the sound itself.
  function seekSlider(t) {
    var input = document.querySelector('[data-testid="playback-progressbar"] input[type="range"]');
    if (!input || input.disabled || !(Number(input.max) > 0)) return false;
    var d = lib.progress(document).d;
    var max = Number(input.max);
    var unit = d > 0 ? (Math.abs(max / d - 1000) < Math.abs(max / d - 1) ? 1000 : 1) : max > 7200 ? 1000 : 1;
    var step = input.getAttribute("step");
    input.setAttribute("step", "any"); // (so the value isn't rounded to Spotify's 5-second steps)
    var set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    set.call(input, String(Math.round(Math.max(0, Math.min(max, t * unit)))));
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    if (step === null) input.removeAttribute("step"); else input.setAttribute("step", step);
    return true;
  }
  function seekPointer(t) {
    var line = document.querySelector('[data-testid="playback-progressbar"] [data-testid="progress-bar"]') || document.querySelector('[data-testid="progress-bar"]');
    var d = lib.progress(document).d;
    if (!line || !(d > 0)) return false;
    var r = line.getBoundingClientRect();
    if (!r.width) return false;
    var x = r.left + r.width * Math.min(1, Math.max(0, t / d)), y = r.top + r.height / 2;
    var o = { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, button: 0, buttons: 1, pointerId: 1, pointerType: "mouse", isPrimary: true, view: window };
    line.dispatchEvent(new PointerEvent("pointerdown", o));
    line.dispatchEvent(new MouseEvent("mousedown", o));
    o.buttons = 0;
    line.dispatchEvent(new PointerEvent("pointerup", o));
    line.dispatchEvent(new MouseEvent("mouseup", o));
    document.dispatchEvent(new PointerEvent("pointerup", o));
    line.dispatchEvent(new MouseEvent("click", o));
    return true;
  }
  function seekMedia(t) {
    var m = mainMedia(lib.progress(document).d);
    if (!m) return false;
    try { m.currentTime = t; return true; } catch (e) { return false; }
  }
  var seekTry = 0;
  function seek(t) {
    if (!(t >= 0)) return;
    var mine = ++seekTry;
    var ways = [seekSlider, seekPointer, seekMedia];
    var k = 0;
    (function next() {
      while (k < ways.length && !ways[k++](t)) { /* that way isn't there */ }
      setTimeout(function () {
        if (mine !== seekTry || k >= ways.length) return;
        var q = now();
        if (!(Math.abs(q.t - t) <= 2.5)) next();
      }, 900);
    })();
  }

  document.addEventListener("tamkeen:sp-cmd", function (e) {
    var c;
    try { c = typeof e.detail === "string" ? JSON.parse(e.detail) : null; } catch (x) { return; }
    if (!c || typeof c.name !== "string") return;
    var v = Number(c.value);
    if (c.name === "play") setPlaying(true);
    else if (c.name === "pause") setPlaying(false);
    else if (c.name === "seek" && isFinite(v)) seek(Math.max(0, v));
    else if (c.name === "line" && isFinite(v)) { // Spotify's own lyric line: Spotify jumps to it
      var el = lib.lyricElements(document)[Math.floor(v)];
      if (el) el.click();
    }
    setTimeout(send, 50);
  });
})();
