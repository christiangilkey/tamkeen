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

  /**
   * The subtitle track to show for `lang` (the language being learned), from Netflix's list:
   * {track, image} or null. Never "Off" (the "none" track, or one named so) or the forced ones (a
   * few lines for signs); a text track before one drawn as pictures (`image`: Netflix only has pictures, which
   * Tamkeen can't read); the variant of the soundtrack being heard ("ar-LB" with Lebanese speech);
   * ordinary subtitles (PRIMARY) before those for the hard of hearing (ASSISTIVE); the app's own
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
      return [u.t.isImageBased ? 1 : 0, String(u.t.bcp47 || "").toLowerCase() === heard ? 0 : 1, u.t.trackType === "PRIMARY" ? 0 : 1,
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

  root.__tamkeenNetflixLib = { base: base, isOff: isOff, chooseTextTrack: chooseTextTrack, chooseAudioTrack: chooseAudioTrack,
    titleInfo: titleInfo, watchId: watchId };
})();
