// Run by the computer app inside its own Instagram window while it looks for reels (see
// app/reels_worker.py). It only listens: it notes the posts Instagram's site describes to the
// page as it loads search results and creators' reel lists (who made each, how many plays and
// likes, how long), so the app can pick popular ones. It changes nothing on the page or account.
//
// Plain script (not a module), like the other scripts that run inside other people's websites.
(function () {
  if (window.__tkReels) return;
  var posts = {};

  function num(o, names) {
    for (var i = 0; i < names.length; i++) if (typeof o[names[i]] === "number") return o[names[i]];
    return 0;
  }
  function captionOf(o) {
    if (o.caption && typeof o.caption.text === "string") return o.caption.text;
    try { return o.edge_media_to_caption.edges[0].node.text || ""; } catch (e) { return ""; }
  }
  // Instagram describes a post in a few different shapes; all have a short code and its maker.
  function walk(o, depth) {
    if (!o || typeof o !== "object" || depth > 16) return;
    if (Array.isArray(o)) { for (var i = 0; i < o.length; i++) walk(o[i], depth + 1); return; }
    var code = typeof o.code === "string" ? o.code : (typeof o.shortcode === "string" ? o.shortcode : null);
    var owner = o.user || o.owner;
    if (code && owner && typeof owner === "object" && typeof owner.username === "string") {
      var prev = posts[code] || {};
      posts[code] = {
        code: code,
        user: owner.username,
        verified: !!owner.is_verified || !!prev.verified,
        plays: num(o, ["play_count", "ig_play_count", "view_count", "video_view_count"]) || prev.plays || 0,
        likes: num(o, ["like_count"]) || (o.edge_liked_by && o.edge_liked_by.count) || prev.likes || 0,
        video: o.media_type === 2 || o.product_type === "clips" || o.is_video === true || !!prev.video,
        taken: o.taken_at || o.taken_at_timestamp || prev.taken || 0,
        seconds: Math.round(o.video_duration || 0) || prev.seconds || 0,
        caption: (captionOf(o) || prev.caption || "").slice(0, 300)
      };
    }
    for (var k in o) { if (o[k] && typeof o[k] === "object") walk(o[k], depth + 1); }
  }
  function scan(text) {
    if (typeof text !== "string" || text.length < 80) return;
    try { walk(JSON.parse(text.replace(/^for \(;;\);/, "")), 0); } catch (e) { /* not data */ }
  }

  var realFetch = window.fetch;
  window.fetch = function () {
    var p = realFetch.apply(this, arguments);
    try {
      p.then(function (r) {
        try {
          if (/json|text|javascript/.test(r.headers.get("content-type") || "")) r.clone().text().then(scan).catch(function () {});
        } catch (e) { /* unreadable answer */ }
      }).catch(function () {});
    } catch (e) { /* leave the page's own request alone */ }
    return p;
  };
  var realSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function () {
    var x = this;
    x.addEventListener("load", function () {
      try {
        if (!x.responseType || x.responseType === "text") scan(x.responseText);
        else if (x.responseType === "json") scan(JSON.stringify(x.response));
      } catch (e) { /* unreadable answer */ }
    });
    return realSend.apply(this, arguments);
  };
  // Posts already written into the page itself.
  try {
    [].forEach.call(document.querySelectorAll('script[type="application/json"]'), function (s) { scan(s.textContent); });
  } catch (e) { /* nothing there */ }

  window.__tkReels = {
    /** Everything noted on this page so far, as JSON text. */
    posts: function () { return JSON.stringify(Object.keys(posts).map(function (c) { return posts[c]; })); },
    /** "yes" when the window is signed in to Instagram. Only whether, never who. */
    signedIn: function () {
      if (!/(^|\.)instagram\.com$/.test(location.hostname)) return ""; // e.g. on Facebook's sign-in page
      var cookie = /(^|; )ds_user_id=\d/.test(document.cookie);
      var form = !!document.querySelector('input[name="username"], input[name="password"]');
      var nav = !!document.querySelector('a[href*="/direct/"], a[href="/reels/"], a[href="/explore/"]');
      return cookie || (nav && !form) ? "yes" : "";
    },
    /** On Facebook: "yes" once the person has signed in THERE and Facebook is just showing its own
     * pages (not in the middle of asking for a password, a code, or permission). The app then
     * goes back to Instagram, which offers to continue with that Facebook sign-in. */
    facebookReady: function () {
      if (!/(^|\.)facebook\.com$/.test(location.hostname)) return "";
      if (!/(^|; )c_user=\d/.test(document.cookie)) return "";
      if (/^\/(login|dialog|checkpoint|two_step|two_factor|oidc|v\d|privacy|recover|confirm)/.test(location.pathname)) return "";
      if (document.querySelector('input[type="password"]')) return "";
      return "yes";
    },
    /** On Instagram's sign-in page only: press its own "Continue as …" / "Log in with Facebook"
     * button. Returns what was pressed, or "". Never used on a sign-UP page: the app must not
     * create an account for anyone. */
    continueWithFacebook: function () {
      if (!/(^|\.)instagram\.com$/.test(location.hostname)) return "";
      if (!(location.pathname === "/" || /^\/accounts\/login/.test(location.pathname))) return "";
      var CONTINUE_AS = /^(continue as|continuar como|continuer en tant que|weiter als|continua come|продолжить как|المتابعة باسم|متابعة باسم|以.*身份继续|.*としてログイン|.*として続行)/i;
      var buttons = document.querySelectorAll('button, [role="button"]');
      var facebook = null;
      for (var i = 0; i < buttons.length; i++) {
        var text = (buttons[i].innerText || "").replace(/\s+/g, " ").trim();
        if (!text || text.length > 80) continue;
        if (CONTINUE_AS.test(text)) { buttons[i].click(); return "continue-as"; }
        if (!facebook && /facebook|فيسبوك|فيس بوك/i.test(text)) facebook = buttons[i];
      }
      if (facebook) { facebook.click(); return "facebook"; }
      return "";
    }
  };
})();
