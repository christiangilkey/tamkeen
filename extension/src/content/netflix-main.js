// Tamkeen for Netflix, inside Netflix's own page (its "main world", where Netflix's player can be
// reached), after content/config.js, js/netflix-common.js and js/netflix-player.js. netflix-player.js
// does the work (the same script the computer's Netflix window runs): it hides Netflix's subtitles
// and, while a title plays, everything but the picture; chooses the soundtrack and subtitles in the
// language being learned; and answers state() / cmd(). This passes those to the extension's own part
// of the page (content/netflix.js) as page events, a few times a second:
//   "tamkeen:nf-state"   -> the player's state (JSON)
//   "tamkeen:nf-cmd"     <- play, pause, seek, rate, continue; audio, text: a soundtrack or subtitles
//                           chosen in the bar's menus, by Netflix's key for it (JSON {name, value})
//   "tamkeen:nf-config"  <- the language being learned (JSON {lang})
// They carry nothing private: where the player is and what it should do.
(function () {
  if (window.top !== window || window.__tamkeenExtMain) return;
  window.__tamkeenExtMain = true;
  var cfg = window.__tamkeenNetflixCfg = window.__tamkeenNetflixCfg || {};

  function read(e) {
    try { return typeof e.detail === "string" ? JSON.parse(e.detail) : null; } catch (x) { return null; }
  }
  function send() {
    var p = window.__tamkeenNetflixPlayer;
    if (!p || !/^\/watch\//.test(location.pathname)) return;
    var s;
    try { s = p.state(); } catch (x) { return; }
    document.dispatchEvent(new CustomEvent("tamkeen:nf-state", { detail: JSON.stringify(s) }));
  }
  document.addEventListener("tamkeen:nf-config", function (e) {
    var c = read(e);
    if (c && typeof c.lang === "string" && /^[a-z]{0,3}$/.test(c.lang)) cfg.lang = c.lang;
  });
  document.addEventListener("tamkeen:nf-cmd", function (e) {
    var c = read(e);
    var p = window.__tamkeenNetflixPlayer;
    if (!c || !p || ["play", "pause", "seek", "rate", "continue", "audio", "text"].indexOf(c.name) < 0) return;
    if (c.name === "audio" || c.name === "text") { // a track's key (plain text, as Netflix names it)
      p.cmd(c.name, String(c.value == null ? "" : c.value).slice(0, 200));
    } else {
      var v = Number(c.value);
      p.cmd(c.name, isFinite(v) ? v : 0);
    }
    send();
  });
  setInterval(send, 250);
})();
