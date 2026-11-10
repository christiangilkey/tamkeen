// Runs inside YouTube's embedded player (the frame on Tamkeen's player page, web/js/ytmedia.js) and switches
// the video's sound to the language being learned when YouTube has it as another audio track (a dubbed
// version, "multi-language audio"), e.g. the Arabic track of an English video. The owner's wish: "have
// Tamkeen automatically select the target language from the YouTube language track dropdown".
//
// YouTube's IFrame API can't choose the audio track, and the frame is YouTube's own page, so Tamkeen's page
// can't reach into it. The apps can: this file is added to every frame of the app's own window by
// app/desktop.py (computer), MainActivity.java (Android) and YouTubeAudioPlugin.swift (iPhone). The web app
// can't, so it keeps the hint "choose it under ⚙ → Audio track" (player.js).
//
// It does nothing outside YouTube's embed page, or without `tamkeen_audio=<language>` in the frame's address
// (ytmedia.js asks for it as a player setting, so other sites' YouTube frames are left alone). It switches
// once per video, so choosing another track in YouTube's ⚙ menu afterwards sticks, and tells the page how it
// went: {tamkeenYtAudio: {video, outcome: "switched" | "already" | "none" | "failed", name}}.
(function () {
  "use strict";
  if (window.__tamkeenYtAudio) return;
  window.__tamkeenYtAudio = true;
  var host = "", path = "", query = "";
  try { host = location.hostname; path = location.pathname; query = location.search; } catch (e) { return; }
  if (!/(^|\.)youtube(-nocookie)?\.com$/.test(host) || path.indexOf("/embed/") !== 0) return;
  var wanted = String(new URLSearchParams(query).get("tamkeen_audio") || "").toLowerCase();
  if (!/^[a-z]{2,3}$/.test(wanted)) return;

  // A language code as Tamkeen writes it ("zh-Hans.3" -> "zh"; YouTube says "fil" for Tagalog, "iw" for Hebrew).
  function base(code) {
    var b = String(code || "").toLowerCase().split(/[-_.]/)[0];
    if (b === "fil") return "tl";
    if (b === "iw") return "he";
    return b === "cmn" || b === "yue" ? "zh" : b;
  }
  // What a track is ({id: "ar.3", name: "Arabic", isDefault, isAutoDubbed}) sits in a small object inside it
  // whose property name changes with every release of YouTube's player, so it is found by its shape.
  function about(track) {
    if (!track || typeof track !== "object") return null;
    for (var k in track) {
      var v = track[k];
      if (v && typeof v === "object" && typeof v.id === "string" && typeof v.name === "string" && "isDefault" in v) return v;
    }
    return null;
  }
  function tell(video, outcome, name) {
    try { window.parent.postMessage({ tamkeenYtAudio: { video: video, outcome: outcome, name: name || "" } }, "*"); } catch (e) { /* no page */ }
  }

  var doneFor = "";  // the video already handled
  var current = "";  // the video being looked at, and for it:
  var waited = 0;    //   checks made while it plays with no audio tracks listed yet
  var asked = false; //   a switch was asked for (it is reported once the player says it is on that track)
  var failed = 0;    //   switches asked for that didn't happen
  function check() {
    var p = document.getElementById("movie_player");
    if (!p || typeof p.getAvailableAudioTracks !== "function" || typeof p.setAudioTrack !== "function") return;
    var state = -1, video = "";
    try { state = p.getPlayerState(); video = (p.getVideoData() || {}).video_id || ""; } catch (e) { return; }
    if (!video || video === doneFor) return;
    if (video !== current) { current = video; waited = 0; asked = false; failed = 0; }
    if (state !== 1 && state !== 3) return; // switching before the video runs fails inside YouTube's player
    var tracks = [];
    try { tracks = p.getAvailableAudioTracks() || []; } catch (e) { tracks = []; }
    if (!tracks.length) {
      // A video with one soundtrack lists none. (Give YouTube a few seconds to list them.)
      if (++waited >= 8) { doneFor = video; tell(video, "none"); }
      return;
    }
    var now = null;
    try { now = about(p.getAudioTrack()); } catch (e) { now = null; }
    if (now && base(now.id) === wanted) { doneFor = video; tell(video, asked ? "switched" : "already", now.name); return; }
    var hits = [];
    for (var i = 0; i < tracks.length; i++) {
      var a = about(tracks[i]);
      if (a && base(a.id) === wanted) hits.push({ track: tracks[i], info: a });
    }
    if (!hits.length) { doneFor = video; tell(video, "none"); return; }
    // A dub made by people before one YouTube made by machine.
    hits.sort(function (x, y) { return (x.info.isAutoDubbed ? 1 : 0) - (y.info.isAutoDubbed ? 1 : 0); });
    if (asked) failed++; // asked last time and still not on it
    if (failed >= 4) { doneFor = video; tell(video, "failed"); return; }
    try { p.setAudioTrack(hits[0].track); asked = true; } catch (e) { failed++; }
  }
  setInterval(check, 500);
})();
