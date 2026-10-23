// The rules both Netflix scripts share (web/js/netflix-browser.js in the Netflix window,
// web/js/netflix-player.js in the video window over the player's stage). Plain script, injected
// first into those windows (app/desktop.py, app/netflix_overlay.py); everything is pure and on
// window.__tamkeenNetflixLib (tests: tests/js/netflix.test.mjs). The browser extension (extension/)
// runs it in Netflix's pages too, and its other parts import it (web/js/netflix-ttml.js), also where
// there is no window (its service worker): there it is on globalThis.
(function () {
  var root = typeof window !== "undefined" ? window : globalThis;
  if (root.__tamkeenNetflixLib) return;

  var FOLD = { fil: "tl", cmn: "zh", yue: "zh", iw: "he", nb: "no", nn: "no", "in": "id", per: "fa", fas: "fa" };
  /** "ar-LB" -> "ar", "zh-Hans" -> "zh", "fil" (Netflix's Filipino) -> "tl". */
  function base(code) {
    var b = String(code || "").toLowerCase().replace(/_/g, "-").split("-")[0];
    return FOLD[b] || b;
  }
  // Within a language, which written variant is the app's: simplified Chinese, Brazilian Portuguese.
  var VARIANTS = { zh: ["zh-hans", "zh-cn", "zh-sg", "zh", "zh-hant"], pt: ["pt-br", "pt"], es: ["es", "es-419", "es-es"] };
  function variantRank(lang, code) {
    var list = VARIANTS[lang] || [];
    var i = list.indexOf(String(code || "").toLowerCase());
    return i < 0 ? list.length : i;
  }
  /** An audio-description soundtrack (a voice describing the picture). */
  function described(t) {
    return /audio description|\[ad\]|descripci|descri[cç]|audiodes/i.test(String((t && t.displayName) || ""));
  }
  // Netflix's "Off" entry, as its menu names it in the viewer's own language. Watching Netflix with
  // a real account showed it is not always marked as the "none" track: it carries the soundtrack's
  // language (it shows only the few "forced" lines for signs), so it is told apart by its name too.
  var OFF = /^(off|none|aus|desactivad[oa]s?|désactivés?|disattivat[oi]|desligad[oa]s?|desativad[oa]s?|uit|av|wyłączone|kapalı|выкл\.?|отключены|关闭|關閉|オフ|끄기|ปิด|إيقاف|إيقاف التشغيل|خاموش|बंद)$/i;
  function isOff(t) {
    return !!(t && (t.isNoneTrack || OFF.test(String(t.displayName || "").trim())));
  }
  /** Subtitles for the deaf and hard of hearing: Netflix's ASSISTIVE tracks, closed captions,
   * "English [CC]", SDH. (They describe sounds too, so they are never the first choice.) */
  function isCaptions(t) {
    return !!t && (t.trackType === "ASSISTIVE" || /closed ?captions?/i.test(String(t.rawTrackType || "")) ||
      /\[cc\]|\(cc\)|\bsdh\b/i.test(String(t.displayName || "")));
  }

  /**
   * The subtitle track to show for `lang` (the language being learned), from Netflix's list:
   * {track, image} or null. Never "Off" (the "none" track, or one named so) or the forced ones (a
   * few lines for signs); a text track before one drawn as pictures (`image`: Netflix only has pictures, which
   * Tamkeen can't read); the variant of the soundtrack being heard ("ar-LB" with Lebanese speech);
   * ordinary subtitles (PRIMARY) before closed captions (ASSISTIVE, "[CC]"); the app's own
   * variant of the language; Netflix's order.
   */
  function chooseTextTrack(list, lang, audioCode) {
    var want = base(lang);
    var heard = String(audioCode || "").toLowerCase();
    var usable = [];
    (list || []).forEach(function (t, i) {
      if (!t || isOff(t) || t.isForcedNarrative || !want || base(t.bcp47) !== want) return;
      usable.push({ t: t, i: i });
    });
    if (!usable.length) return null;
    var key = function (u) {
      return [u.t.isImageBased ? 1 : 0, String(u.t.bcp47 || "").toLowerCase() === heard ? 0 : 1, isCaptions(u.t) ? 1 : 0,
        variantRank(want, u.t.bcp47), u.i];
    };
    usable.sort(function (a, b) {
      var x = key(a);
      var y = key(b);
      for (var k = 0; k < x.length; k++) if (x[k] !== y[k]) return x[k] - y[k];
      return 0;
    });
    return { track: usable[0].t, image: !!usable[0].t.isImageBased };
  }

  /** The soundtrack in `lang` to switch to, or null (there is none, or `current` is already in
   * it). Never an audio-description track; the original soundtrack before a dub. */
  function chooseAudioTrack(list, lang, current) {
    var want = base(lang);
    if (!want || (current && base(current.bcp47) === want && !described(current))) return null;
    var hits = (list || []).filter(function (t) { return t && base(t.bcp47) === want && !described(t) && t.trackType !== "ASSISTIVE"; });
    if (!hits.length) return null;
    hits.sort(function (a, b) { return (b.isNative ? 1 : 0) - (a.isNative ? 1 : 0) || variantRank(want, a.bcp47) - variantRank(want, b.bcp47); });
    return hits[0];
  }

  // ---------- the viewer's own choice of soundtrack and subtitles (Tamkeen's Audio and Subtitles menus) ----------

  /** A track's key in Netflix's list: its trackId, else its place in the list ("#3"). */
  function trackKey(t, i) {
    var id = t && (t.trackId || t.id);
    return String(id || "#" + i).slice(0, 200);
  }

  /** Netflix's soundtracks (`kind` "audio") or subtitles ("text") as Tamkeen's menus list them:
   * [{id, bcp47, lang, name, cc, image, described, native}], in Netflix's order. The subtitles leave
   * out Netflix's "Off" and the forced lines (Tamkeen's menu has an Off of its own). */
  function menuTracks(list, kind) {
    var out = [];
    var seen = {};
    (list || []).forEach(function (t, i) {
      if (!t || typeof t !== "object") return;
      if (kind === "text" && (isOff(t) || t.isForcedNarrative)) return;
      var id = trackKey(t, i);
      if (seen[id]) return;
      seen[id] = true;
      var bcp47 = String(t.bcp47 || t.language || "").slice(0, 20);
      out.push({ id: id, bcp47: bcp47, lang: base(bcp47), name: String(t.displayName || bcp47 || "?").replace(/\s+/g, " ").trim().slice(0, 80),
        cc: kind === "text" && isCaptions(t), image: kind === "text" && !!t.isImageBased, described: kind === "audio" && described(t),
        native: kind === "audio" && !!t.isNative });
    });
    return out;
  }

  /** The key of `current` (the track in use) in `list`; for subtitles "off" when they are turned off
   * (Netflix's Off, or only its forced lines); "" when it isn't known. */
  function currentKey(list, current, kind) {
    if (!current || typeof current !== "object") return "";
    if (kind === "text" && (isOff(current) || current.isForcedNarrative)) return "off";
    var hit = "";
    (list || []).some(function (t, i) {
      if (!t) return false;
      var same = t === current || (current.trackId && t.trackId === current.trackId) ||
        (!current.trackId && t.bcp47 === current.bcp47 && t.displayName === current.displayName && t.trackType === current.trackType);
      if (same) hit = trackKey(t, i);
      return same;
    });
    return hit;
  }

  /** The track in `list` whose key (trackKey) is `key`, or null. */
  function findTrack(list, key) {
    var hit = null;
    (list || []).some(function (t, i) { if (t && trackKey(t, i) === String(key)) hit = t; return !!hit; });
    return hit;
  }

  /** Netflix's own "Off" in its list of subtitles (the "none" track, else the one named Off), or null. */
  function offTrack(list) {
    var named = null;
    var none = null;
    (list || []).forEach(function (t) {
      if (!t) return;
      if (t.isNoneTrack && !none) none = t;
      else if (isOff(t) && !named) named = t;
    });
    return none || named;
  }

  /**
   * When to choose a title's soundtrack and subtitles for the language being learned. `c` is what the
   * page remembers ({session, lang, manualAudio, manualText}, changed in place: start with {}); `session`
   * the player's session (a new title or episode is a new session) and `lang` the language being
   * learned now. Returns {audio, text}: true = choose that one for `lang` now.
   *   - A new session chooses both, and forgets the viewer's own choices (those were for the title before).
   *   - The language being learned changing chooses again whatever the viewer hasn't chosen by hand.
   *   - Otherwise nothing: the choice is made once, and Netflix's tracks are never forced back.
   */
  function planChoice(c, session, lang) {
    var out = { audio: false, text: false };
    if (c.session !== session) { c.session = session; c.lang = ""; c.manualAudio = false; c.manualText = false; }
    if (!lang || c.lang === lang) return out;
    c.lang = lang;
    out.audio = !c.manualAudio;
    out.text = !c.manualText;
    return out;
  }

  /** The viewer chose a track by hand (`kind` "audio" or "text"): kept for the rest of this title.
   * Returns whether to choose the subtitles in the language being learned once more: after a new
   * soundtrack Netflix's list of subtitles follows it (and may drop them), unless the viewer chose the
   * subtitles by hand too. */
  function choseByHand(c, kind) {
    if (kind === "audio") { c.manualAudio = true; return !c.manualText; }
    c.manualText = true;
    return false;
  }

  /** What Netflix's own description of a title says: {id, title, show, season, episode,
   * episode_title, image, duration}. `video` is Netflix's metadata for it (a film, or a series with
   * its seasons); for a series opened by its own number, `id` becomes the episode Netflix plays next. */
  function titleInfo(video, id) {
    var out = { id: String(id || ""), title: "", show: "", season: 0, episode: 0, episode_title: "", image: "", duration: 0 };
    if (!video || typeof video !== "object") return out;
    var picture = function (list) {
      var hit = (Array.isArray(list) ? list : []).filter(function (p) { return p && /^https:\/\//.test(String(p.url || "")); })[0];
      return hit ? String(hit.url) : "";
    };
    out.image = picture(video.boxart) || picture(video.artwork) || picture(video.storyart);
    if (video.type === "show" || Array.isArray(video.seasons)) {
      out.show = String(video.title || "");
      var find = function (want) {
        var hit = null;
        (video.seasons || []).forEach(function (s) {
          ((s && s.episodes) || []).forEach(function (e) {
            if (!hit && e && String(e.id || e.episodeId || "") === String(want)) hit = { s: s, e: e };
          });
        });
        return hit;
      };
      var hit = find(id) || (video.currentEpisode ? find(video.currentEpisode) : null);
      if (hit) {
        out.id = String(hit.e.id || hit.e.episodeId);
        out.season = Number(hit.s.seq) || 0;
        out.episode = Number(hit.e.seq) || 0;
        out.episode_title = String(hit.e.title || "");
        out.duration = Number(hit.e.runtime) || 0;
        out.image = picture(hit.e.stills) || picture(hit.e.thumbs) || out.image;
      }
      out.title = out.episode_title || out.show;
    } else {
      out.title = String(video.title || "");
      out.duration = Number(video.runtime) || 0;
    }
    return out;
  }

  /** The title number in a watch address ("/watch/81234567?trackId=…"), else "". */
  function watchId(href, here) {
    var u;
    try { u = new URL(href, here || "https://www.netflix.com/"); } catch (e) { return ""; }
    var m = u.pathname.match(/^\/watch\/(\d{3,12})(\/|$)/);
    return m ? m[1] : "";
  }

  root.__tamkeenNetflixLib = { base: base, isOff: isOff, isCaptions: isCaptions, chooseTextTrack: chooseTextTrack,
    chooseAudioTrack: chooseAudioTrack, trackKey: trackKey, menuTracks: menuTracks, currentKey: currentKey, findTrack: findTrack,
    offTrack: offTrack, planChoice: planChoice, choseByHand: choseByHand, titleInfo: titleInfo, watchId: watchId };
})();
