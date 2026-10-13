// Run by the phone app inside a page of instagram.com, in the hidden reel window, while the user
// picks reels from their own Instagram saves (see reels-phone.js). It asks Instagram's site, as
// the signed-in page, what the user has saved and where a reel's video is. It only reads: nothing
// on the page or the account is changed.
//
// That window has no bridge to the app. The app starts a job by running __tkIg(...) in it and
// hears the result the way it hears where a reel is: by asking __tkReelState() a few times a second.
//
// Plain script (not a module), like the other scripts that run inside other people's websites.
(function () {
  if (window.top !== window || window.__tkIg) return;
  var APP_ID = "936619743392459"; // the id Instagram's own website sends with its requests
  var job = 0;
  var done = true;
  var result = null;
  var error = "";

  function get(path) {
    return fetch(path, { credentials: "include", headers: { "X-IG-App-ID": APP_ID, "X-Requested-With": "XMLHttpRequest" } })
      .then(function (r) {
        if (!r.ok) throw new Error("http " + r.status);
        return r.json();
      });
  }

  function area(x) { return (x.width || 0) * (x.height || 0); }

  // One saved post, as the app's picking list wants it.
  function post(m) {
    if (!m || typeof m.code !== "string") return null;
    var videos = (m.video_versions || []).slice().sort(function (a, b) { return area(a) - area(b); });
    var pictures = ((m.image_versions2 || {}).candidates || []).slice().sort(function (a, b) { return area(a) - area(b); });
    var thumb = "";
    for (var i = 0; i < pictures.length; i++) { thumb = pictures[i].url || thumb; if ((pictures[i].width || 0) >= 150) break; }
    var clip = m.clips_metadata || {};
    var owner = m.user || m.owner || {};
    return {
      code: m.code,
      user: typeof owner.username === "string" ? owner.username : "",
      caption: ((m.caption && m.caption.text) || "").slice(0, 300),
      video: m.media_type === 2,
      seconds: Math.round(m.video_duration || 0),
      thumb: thumb,
      src: videos.length ? videos[0].url || "" : "", // the smallest version of the video
      // A song from Instagram's music library: such a reel plays only on its ordinary page, signed in.
      music: clip.audio_type === "licensed_music" || !!clip.music_info
    };
  }

  // Instagram's number for a post, from the short code in its address.
  function pk(code) {
    var A = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    var n = 0n;
    for (var i = 0; i < code.length; i++) n = n * 64n + BigInt(A.indexOf(code[i]));
    return n.toString();
  }

  function pages(base, limit, each) {
    var seen = 0;
    function next(max, turn) {
      return get(base + (max ? (base.indexOf("?") < 0 ? "?" : "&") + "max_id=" + encodeURIComponent(max) : "")).then(function (d) {
        var items = (d && d.items) || [];
        for (var i = 0; i < items.length; i++) { if (each(items[i])) seen++; }
        if (d && d.more_available && d.next_max_id && seen < limit && turn < 8) return next(d.next_max_id, turn + 1);
        return null;
      });
    }
    return next("", 0);
  }

  var JOBS = {
    // Who is signed in ("" = nobody).
    whoami: function () {
      return get("/api/v1/accounts/edit/web_form_data/").then(function (d) {
        return { username: (d && d.form_data && d.form_data.username) || "" };
      }).catch(function () { return { username: "" }; });
    },
    // The user's saved collections: [{id, name}].
    collections: function () {
      var out = [];
      var types = encodeURIComponent('["ALL_MEDIA_AUTO_COLLECTION","MEDIA","AUDIO_AUTO_COLLECTION"]');
      return pages("/api/v1/collections/list/?collection_types=" + types + "&include_public_only=0&get_cover_media_lists=false", 60, function (c) {
        if (!c || !c.collection_id || c.collection_type !== "MEDIA") return false;
        out.push({ id: String(c.collection_id), name: String(c.collection_name || "").slice(0, 80) });
        return true;
      }).then(function () { return { collections: out }; });
    },
    // The posts in one collection ("all" = everything saved), newest save first.
    list: function (arg) {
      var out = [];
      var limit = Math.max(1, Math.min(Number(arg && arg.limit) || 80, 200));
      var base = !arg || arg.collection === "all" ? "/api/v1/feed/saved/posts/"
        : "/api/v1/feed/collection/" + encodeURIComponent(String(arg.collection)) + "/posts/";
      return pages(base, limit, function (item) {
        var p = post(item && (item.media || item));
        if (!p || out.length >= limit) return false;
        out.push(p);
        return true;
      }).then(function () { return { posts: out }; });
    },
    // One post, asked afresh (the address of a video only works for a while).
    info: function (arg) {
      return get("/api/v1/media/" + pk(String(arg.code)) + "/info/").then(function (d) {
        return { post: post(d && d.items && d.items[0]) };
      });
    },
    // The app has the last answer: let go of it (answers can be long, and are asked for over and over).
    clear: function () { return Promise.resolve(null); }
  };

  /** Start job number `n` (the app counts them); the answer appears in __tkReelState(). */
  window.__tkIg = function (n, what, arg) {
    job = n;
    done = false;
    result = null;
    error = "";
    var run;
    try { run = JOBS[what] ? JOBS[what](arg || {}) : Promise.reject(new Error("unknown job")); }
    catch (e) { run = Promise.reject(e); }
    run.then(function (r) { if (job === n) { result = r; done = true; } },
             function (e) { if (job === n) { error = String((e && e.message) || e || "failed"); done = true; } });
  };

  window.__tkReelState = function () {
    return JSON.stringify({ ig: 1, host: location.hostname, page: location.pathname, job: job, done: done, result: result, error: error });
  };
})();
