// Tamkeen's karaoke for Spotify: how Spotify's web player (open.spotify.com) shows what it plays.
// Plain script, run first inside Spotify's page (before content/spotify-main.js); everything is on
// window.__tamkeenSpotifyPage. The pure parts are tested on their own (tests/js/spotify-page.test.mjs).
//
// What the page is known to have (2026; Spotify's own names for its parts, data-testid, which stay
// while its styling names change with every update):
//   - the song playing: navigator.mediaSession.metadata {title, artist, album}, the browser's own
//     "now playing" record (shown in its media controls); and in the bar at the bottom,
//     [data-testid="context-item-info-title"] and [data-testid="context-item-info-artist"], with
//     links to the song (/track/<id>, or its album with ?highlight=spotify:track:<id>);
//   - the place in the song: [data-testid="playback-position"] and [data-testid="playback-duration"]
//     ("1:23", "3:49"; "-2:26" when it shows the time left), the progress bar
//     [data-testid="playback-progressbar"] with a hidden slider (input type=range: value and max,
//     aria-valuetext "1:23/3:49") and [data-testid="progress-bar"] (style --progress-bar-transform:
//     37.5%); they move about once a second;
//   - play/pause: [data-testid="control-button-playpause"];
//   - its own lyrics, when the viewer opens them (the microphone button, [data-testid="lyrics-button"]):
//     one [data-testid="lyrics-line"] per line, the lines already sung, the one being sung and those
//     to come each with their own look (class names that change with Spotify's updates: see
//     activeIndex).
(function () {
  var root = typeof window !== "undefined" ? window : globalThis;
  if (root.__tamkeenSpotifyPage) return;

  /** "1:23" -> 83, "1:02:03" -> 3723, "-2:26" -> -146 (time left), else NaN. */
  function clock(text) {
    var s = String(text == null ? "" : text).replace(/[−‒–—]/g, "-").replace(/[^\d:-]/g, "");
    var m = /^(-?)(\d{1,3}):(\d{2})(?::(\d{2}))?$/.exec(s);
    if (!m) return NaN;
    var n = m[4] !== undefined ? Number(m[2]) * 3600 + Number(m[3]) * 60 + Number(m[4]) : Number(m[2]) * 60 + Number(m[3]);
    return m[1] ? -n : n;
  }

  /** Spotify's id of a song (22 letters and digits) in an address: /track/<id>, spotify:track:<id>
   * (also written %3A), else "". */
  function trackIdFrom(href) {
    var m = /(?:\/track\/|spotify(?::|%3A)track(?::|%3A))([A-Za-z0-9]{22})(?![A-Za-z0-9])/i.exec(String(href || ""));
    return m ? m[1] : "";
  }

  /** "37.5%" -> 0.375, else NaN. */
  function percent(text) {
    var m = /(-?\d+(?:\.\d+)?)\s*%/.exec(String(text || ""));
    return m ? Math.min(1, Math.max(0, Number(m[1]) / 100)) : NaN;
  }

  /**
   * Where the song is, from what the bar shows: {t, d, via} (seconds; NaN when unknown).
   *   range:      the hidden slider {value, max, valuetext, disabled} (Spotify's in milliseconds;
   *               seconds are recognised too, by comparing with the time shown)
   *   transform:  the progress bar's --progress-bar-transform ("37.5%")
   *   position, duration: the times shown ("1:23", "3:49" or "-2:26")
   */
  function progressFrom(p) {
    p = p || {};
    var pos = clock(p.position), dur = clock(p.duration);
    if (dur < 0 && pos >= 0) dur = pos - dur; // the time left is shown: the length is both together
    var range = p.range || null;
    var vt = range && range.valuetext ? String(range.valuetext).split("/") : [];
    var vtPos = vt.length === 2 ? clock(vt[0]) : NaN, vtDur = vt.length === 2 ? clock(vt[1]) : NaN;
    var shownDur = vtDur > 0 ? vtDur : dur > 0 ? dur : NaN;
    if (range && !range.disabled && Number(range.max) > 0) {
      var max = Number(range.max), value = Number(range.value);
      // Milliseconds or seconds? Against the length shown; without it, a song isn't 2 hours long.
      var unit = shownDur > 0 ? (Math.abs(max / shownDur - 1000) < Math.abs(max / shownDur - 1) ? 1000 : 1) : max > 7200 ? 1000 : 1;
      if (Number.isFinite(value) && value >= 0) return { t: value / unit, d: max / unit, via: "range" };
    }
    var ratio = percent(p.transform);
    if (shownDur > 0 && Number.isFinite(ratio)) return { t: ratio * shownDur, d: shownDur, via: "bar" };
    if (vtPos >= 0 && vtDur > 0) return { t: vtPos, d: vtDur, via: "text" };
    if (pos >= 0) return { t: pos, d: shownDur, via: "text" };
    return { t: NaN, d: shownDur, via: "" };
  }

  /**
   * Which of Spotify's lyric lines is being sung: the lines already sung share one look, those to
   * come another, and the one being sung has its own (whatever Spotify's class names are this week).
   * `lists`: each line's class names (and any telling attributes). The line whose look no other line
   * has, between the two groups; -1 when no line stands out (before the singing starts, at the end,
   * or lyrics without timings).
   */
  function activeIndex(lists) {
    var n = lists ? lists.length : 0;
    if (n < 2) return -1;
    var common = null;
    for (var i = 0; i < n; i++) {
      var here = {};
      for (var k = 0; k < lists[i].length; k++) here[lists[i][k]] = true;
      if (!common) common = here;
      else for (var c in common) if (!here[c]) delete common[c];
    }
    var sig = [], count = {};
    for (i = 0; i < n; i++) {
      var own = [];
      for (k = 0; k < lists[i].length; k++) if (!common[lists[i][k]]) own.push(lists[i][k]);
      sig.push(own.sort().join(" "));
      count[sig[i]] = (count[sig[i]] || 0) + 1;
    }
    if (Object.keys(count).length < 2) return -1;
    // How alike a group of lines looks: the share of its commonest look, and that look.
    function group(list) {
      var c = {}, top = "", most = 0;
      for (var j = 0; j < list.length; j++) { c[list[j]] = (c[list[j]] || 0) + 1; if (c[list[j]] > most) { most = c[list[j]]; top = list[j]; } }
      return { share: list.length ? most / list.length : 1, look: top };
    }
    var scores = [];
    for (i = 0; i < n; i++) {
      if (count[sig[i]] !== 1) continue;
      var before = group(sig.slice(0, i)), after = group(sig.slice(i + 1));
      var score = before.share + after.share + (i > 0 && i < n - 1 && before.look !== after.look ? 1 : 0);
      scores.push([i, score]);
    }
    var top = -1;
    for (i = 0; i < scores.length; i++) top = Math.max(top, scores[i][1]);
    if (top < 1.5) return -1;
    // (Two lines of their own look, side by side, as a style for "the next line" would make: the earlier.)
    for (i = 0; i < scores.length; i++) if (scores[i][1] >= top - 0.34) return scores[i][0];
    return -1;
  }

  // ---------- reading the page ----------

  function textOf(el) {
    return el ? String(el.textContent || "").replace(/\s+/g, " ").trim() : "";
  }

  /** The song playing: {title, artist, album, id} ("" for what isn't known). */
  function nowPlaying(doc, nav) {
    var md = null;
    try { md = nav && nav.mediaSession && nav.mediaSession.metadata; } catch (e) { md = null; }
    var titleEl = doc.querySelector('[data-testid="now-playing-bar"] [data-testid="context-item-info-title"]') || doc.querySelector('[data-testid="context-item-info-title"]');
    var artists = [];
    var aEls = doc.querySelectorAll('[data-testid="now-playing-bar"] [data-testid="context-item-info-artist"]');
    if (!aEls.length) aEls = doc.querySelectorAll('[data-testid="context-item-info-artist"]');
    for (var i = 0; i < aEls.length; i++) { var a = textOf(aEls[i]); if (a && artists.indexOf(a) < 0) artists.push(a); }
    var id = "";
    var links = doc.querySelectorAll('[data-testid="now-playing-widget"] a[href], [data-testid="context-item-info-title"] a[href], a[data-testid="context-item-link"][href]');
    for (i = 0; i < links.length && !id; i++) id = trackIdFrom(links[i].getAttribute("href"));
    return {
      title: String((md && md.title) || textOf(titleEl) || "").trim().slice(0, 300),
      artist: String((md && md.artist) || artists.join(", ") || "").trim().slice(0, 300),
      album: String((md && md.album) || "").trim().slice(0, 300),
      id: id,
    };
  }

  /** The progress bar as it is now (see progressFrom). */
  function progress(doc) {
    var bar = doc.querySelector('[data-testid="playback-progressbar"]');
    var input = bar && bar.querySelector('input[type="range"]');
    var line = doc.querySelector('[data-testid="playback-progressbar"] [data-testid="progress-bar"]') || doc.querySelector('[data-testid="progress-bar"]');
    return progressFrom({
      range: input ? { value: input.value, max: input.max, valuetext: input.getAttribute("aria-valuetext"), disabled: input.disabled } : null,
      transform: line && line.style ? line.style.getPropertyValue("--progress-bar-transform") : "",
      position: textOf(doc.querySelector('[data-testid="playback-position"]')),
      duration: textOf(doc.querySelector('[data-testid="playback-duration"]')),
    });
  }

  /** Spotify's lyric lines on the page now, with words: [element], in order. */
  function lyricElements(doc) {
    var out = [];
    var els = doc.querySelectorAll('[data-testid="lyrics-line"]');
    for (var i = 0; i < els.length; i++) if (textOf(els[i])) out.push(els[i]);
    return out;
  }

  /** Spotify's own lyrics while it shows them: {lines: [text], active} (see activeIndex), or null. */
  function readLyrics(doc) {
    var els = lyricElements(doc);
    if (!els.length) return null;
    var lines = [], looks = [];
    for (var i = 0; i < els.length; i++) {
      lines.push(textOf(els[i]).slice(0, 500));
      var look = [];
      var parts = [els[i]].concat(els[i].firstElementChild ? [els[i].firstElementChild] : []);
      for (var p = 0; p < parts.length; p++) {
        for (var k = 0; k < parts[p].classList.length; k++) look.push(p + ":" + parts[p].classList[k]);
        var cur = parts[p].getAttribute("aria-current") || parts[p].getAttribute("data-active");
        if (cur) look.push(p + "@" + cur);
      }
      looks.push(look);
    }
    return { lines: lines.slice(0, 400), active: activeIndex(looks) };
  }

  root.__tamkeenSpotifyPage = {
    clock: clock, trackIdFrom: trackIdFrom, percent: percent, progressFrom: progressFrom, activeIndex: activeIndex,
    nowPlaying: nowPlaying, progress: progress, readLyrics: readLyrics, lyricElements: lyricElements,
  };
})();
