// Prime Video, read the light way: the rules the browser extension's part in Prime Video's pages
// (extension/src/content/prime.js) uses to read the subtitle line Prime Video's own player is showing on
// the screen, and the title's name. Plain script, put on window.__tamkeenPrimeLib (globalThis where there
// is no window); its other parts import it (web/js/primevideo.js). Tests: tests/js/primevideo.test.mjs,
// against saved sample markup of the player (tests/js/fixtures/primevideo/).
//
// THE LIGHT WAY (the owner's choice, 2026-11-21): Tamkeen only READS what Prime Video already shows: the
// subtitle line on screen and the title's name. It never controls Amazon's player (no play, pause, seek,
// track or subtitle choice: the viewer turns subtitles on in Prime Video's own menu), never changes
// Amazon's page (its own panel is a separate frame beside it), and never downloads video, sound or
// subtitle files.
(function () {
  var root = typeof window !== "undefined" ? window : globalThis;
  if (root.__tamkeenPrimeLib) return;

  // Where Prime Video's web player draws its subtitle lines, its title and its episode line. First
  // the web player's own class names (Amazon's "atvwebplayersdk"), then looser ones in case they change.
  var CAPTION_SEL = [".atvwebplayersdk-captions-text", "[class*='captions-text']", "[class*='captionsText']"];
  var CAPTION_BOX_SEL = [".atvwebplayersdk-captions-overlay", "[class*='captions-overlay']"];
  var TITLE_SEL = [".atvwebplayersdk-title-text", "[class*='webplayersdk-title-text']"];
  var EPISODE_SEL = [".atvwebplayersdk-subtitle-text", "[class*='webplayersdk-subtitle-text']"];
  var PLAYER_SEL = [".webPlayerSDKContainer", "#dv-web-player", "[class*='webPlayerSDKContainer']", ".atvwebplayersdk-overlays-container"];

  function all(doc, sels) {
    for (var i = 0; i < sels.length; i++) {
      var found;
      try { found = doc.querySelectorAll(sels[i]); } catch (e) { continue; }
      if (found && found.length) return Array.prototype.slice.call(found);
    }
    return [];
  }

  /** Text as it reads on screen, on one line: spaces and line breaks made single spaces. */
  function oneLine(s) {
    return String(s == null ? "" : s).replace(/[​﻿]/g, "").replace(/\s+/g, " ").trim();
  }

  /**
   * A subtitle line made plain for reading: one line, sound cues of closed captions ("[door slams]",
   * "(laughs)", "♪") and a speaker's "NAME:" left out, a leading dash of a second speaker kept as a
   * space. "" when nothing readable is left.
   */
  function cleanCaption(s) {
    var t = oneLine(s)
      .replace(/\[[^\]]{0,80}\]/g, " ")        // [door slams]
      .replace(/\([^)]{0,60}\)/g, " ")          // (laughs)
      .replace(/[♪♫]+/g, " ")
      .replace(/(^|\s)[-–—‐]\s*/g, "$1")      // "- Hello - Hi" (two speakers)
      .replace(/^[A-Z][A-Z .'-]{1,30}:\s+/, ""); // "JOHN: …" (a speaker named in capitals)
    return oneLine(t).slice(0, 600);
  }

  /** An element's text, its line breaks (<br>, one box per line) kept as spaces. */
  function textOf(el) {
    if (!el) return "";
    var t = typeof el.innerText === "string" && el.innerText ? el.innerText : el.textContent;
    return oneLine(t);
  }

  /**
   * The subtitle line Prime Video's player shows now, from the page `doc`:
   * {text, image} — text "" between lines; image true when the subtitles show as pictures (no text).
   */
  function readCaption(doc) {
    if (!doc || typeof doc.querySelectorAll !== "function") return { text: "", image: false };
    var parts = all(doc, CAPTION_SEL).map(textOf).filter(Boolean);
    // (one element may sit inside another that matched a looser selector: keep each piece once)
    var seen = [];
    for (var i = 0; i < parts.length; i++) if (seen.indexOf(parts[i]) < 0) seen.push(parts[i]);
    var text = cleanCaption(seen.join(" "));
    var image = false;
    if (!text) {
      var boxes = all(doc, CAPTION_BOX_SEL);
      for (var b = 0; b < boxes.length; b++) {
        var imgs = boxes[b].querySelectorAll ? boxes[b].querySelectorAll("img, canvas") : [];
        if (imgs && imgs.length) { image = true; break; }
      }
    }
    return { text: text, image: image };
  }

  /**
   * The title's name as the player shows it: {title, episode} — for a series the series' name and the
   * episode's line ("Season 1, Ep. 3 The Name"); "" what isn't shown.
   */
  function readTitle(doc) {
    if (!doc || typeof doc.querySelectorAll !== "function") return { title: "", episode: "" };
    var t = all(doc, TITLE_SEL).map(textOf).filter(Boolean)[0] || "";
    var e = all(doc, EPISODE_SEL).map(textOf).filter(Boolean)[0] || "";
    return { title: t.slice(0, 200), episode: e === t ? "" : e.slice(0, 200) };
  }

  /** "Season 1, Ep. 3 The Name" / "S1 E3: The Name" -> {season, episode, name}, else null. */
  function episodeParts(line) {
    var s = oneLine(line);
    var m = s.match(/^(?:season|s)\s*(\d{1,3})\s*[,:·.]?\s*(?:ep(?:isode)?\.?|e)\s*(\d{1,4})\s*[:.·-]?\s*(.*)$/i);
    return m ? { season: Number(m[1]), episode: Number(m[2]), name: m[3] || "" } : null;
  }

  /** Is Prime Video's player open on the page (rather than its pages of titles)? */
  function playerOpen(doc) {
    if (!doc || typeof doc.querySelectorAll !== "function") return false;
    var boxes = all(doc, PLAYER_SEL);
    for (var i = 0; i < boxes.length; i++) {
      var v = boxes[i].querySelector ? boxes[i].querySelector("video") : null;
      if (v) return true;
    }
    return false;
  }

  /** The playing title's <video> in the player (the biggest one there), or null. */
  function playerVideo(doc) {
    if (!doc || typeof doc.querySelectorAll !== "function") return null;
    var best = null, area = -1;
    var boxes = all(doc, PLAYER_SEL);
    for (var i = 0; i < boxes.length; i++) {
      var vids = boxes[i].querySelectorAll ? boxes[i].querySelectorAll("video") : [];
      for (var j = 0; j < vids.length; j++) {
        var r = vids[j].getBoundingClientRect ? vids[j].getBoundingClientRect() : { width: 1, height: 1 };
        var a = (r.width || 0) * (r.height || 0);
        if (a > area) { area = a; best = vids[j]; }
      }
    }
    return best;
  }

  /**
   * The title's number in a Prime Video address, or "": primevideo.com/detail/<id>/,
   * primevideo.com/region/eu/detail/<id>, amazon.<country>/gp/video/detail/<id>, …/dp/<id>.
   */
  function titleId(url) {
    var path;
    try { path = new URL(String(url)).pathname; } catch (e) { return ""; }
    var m = path.match(/\/(?:gp\/video\/)?detail\/(?:[^/]+\/)?([A-Za-z0-9]{8,40})(?:\/|$)/) || path.match(/\/(?:dp|gp\/product)\/([A-Za-z0-9]{8,40})(?:\/|$)/);
    return m ? m[1] : "";
  }

  /** Is `host` a Prime Video address Tamkeen works on (primevideo.com, or Amazon's video pages)? */
  function isPrimeHost(host) {
    var h = String(host || "").toLowerCase();
    return /(^|\.)primevideo\.com$/.test(h) || /(^|\.)amazon\.(com|ca|com\.mx|com\.br|co\.uk|de|fr|it|es|nl|se|pl|com\.tr|ae|sa|eg|in|co\.jp|com\.au|sg)$/.test(h);
  }

  root.__tamkeenPrimeLib = { oneLine: oneLine, cleanCaption: cleanCaption, readCaption: readCaption, readTitle: readTitle,
    episodeParts: episodeParts, playerOpen: playerOpen, playerVideo: playerVideo, titleId: titleId, isPrimeHost: isPrimeHost };
})();
