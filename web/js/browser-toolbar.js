// Injected by the desktop app into every page shown in its "Web Browser" window (see
// app/desktop.py): a slim bar along the bottom with back / forward / reload, the address, and
// above it at the bottom right, a small round teal button that imports the page into Tamkeen.
//
// It runs inside other people's websites, so it is deliberately defensive: plain script (not
// a module), no innerHTML (some sites forbid it), styles applied through the style object
// (allowed even under strict site security policies), and everything inside a closed shadow
// root so the site's own styles and scripts can't interfere with it.
(function () {
  if (window.top !== window || window.__apsBrowserBar) return;
  window.__apsBrowserBar = true;

  var H = 46;
  var host = document.createElement("div");
  host.style.cssText = "all:initial;position:fixed;left:0;right:0;bottom:0;height:" + H + "px;z-index:2147483647;";
  var root = host.attachShadow({ mode: "closed" });

  function el(tag, css, text) {
    var n = document.createElement(tag);
    n.style.cssText = css;
    if (text) n.textContent = text;
    return n;
  }
  var FONT = "font:14px/1.2 system-ui,-apple-system,'Segoe UI',sans-serif;";
  var BTN = FONT + "box-sizing:border-box;height:32px;min-width:34px;padding:0 10px;border:1px solid #3a3a38;border-radius:8px;" +
    "background:#262624;color:#f2f1ec;cursor:pointer;";
  var bar = el("div", FONT + "box-sizing:border-box;display:flex;align-items:center;gap:6px;height:" + H + "px;padding:0 8px;" +
    "background:#1c1c1a;border-top:1px solid #3a3a38;color:#f2f1ec;direction:ltr;");
  var back = el("button", BTN, "‹");
  var fwd = el("button", BTN, "›");
  var reload = el("button", BTN, "⟳");
  var input = el("input", FONT + "box-sizing:border-box;flex:1;min-width:80px;height:32px;padding:0 10px;border:1px solid #3a3a38;" +
    "border-radius:8px;background:#141413;color:#f2f1ec;outline:none;");
  var status = el("span", FONT + "max-width:38%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#b8b6ad;");
  // Import to Tamkeen: a round teal button (the brand teal, no shadow) floating just above the bar at
  // the bottom right, with the app's line "import" icon (icons.js), drawn here without innerHTML.
  var TEAL = "#0b8693";
  var imp = el("button", "all:initial;box-sizing:border-box;position:fixed;right:16px;bottom:" + (H + 14) + "px;width:52px;height:52px;" +
    "border-radius:50%;border:none;background:" + TEAL + ";color:#fff;cursor:pointer;display:flex;align-items:center;" +
    "justify-content:center;");
  var SVG = "http://www.w3.org/2000/svg";
  /** The button's picture: "import" (arrow into a tray), "busy" (a turning arc) or "done" (a tick). */
  function drawIcon(kind) {
    while (imp.firstChild) imp.removeChild(imp.firstChild);
    var svg = document.createElementNS(SVG, "svg");
    [["viewBox", "0 0 24 24"], ["width", "26"], ["height", "26"], ["fill", "none"], ["stroke", "currentColor"],
      ["stroke-width", "2"], ["stroke-linecap", "round"], ["stroke-linejoin", "round"], ["aria-hidden", "true"]]
      .forEach(function (a) { svg.setAttribute(a[0], a[1]); });
    var lines = kind === "busy" ? ["M12 4a8 8 0 0 1 8 8"] : kind === "done" ? ["M5 12.5l4.5 4.5L19 7.5"]
      : ["M12 3.5v11", "M7.5 10 12 14.5 16.5 10", "M4.5 14.5V18a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-3.5"];
    lines.forEach(function (d) {
      var path = document.createElementNS(SVG, "path");
      path.setAttribute("d", d);
      svg.appendChild(path);
    });
    imp.appendChild(svg);
    // Turning while it works (an animation from script is allowed even where sites forbid styles).
    if (kind === "busy" && svg.animate) svg.animate([{ transform: "rotate(0deg)" }, { transform: "rotate(360deg)" }], { duration: 800, iterations: Infinity });
  }
  drawIcon("import");
  imp.onmouseenter = function () { imp.style.background = "#0a7580"; };
  imp.onmouseleave = function () { imp.style.background = TEAL; };
  // The star keeps the site being shown on the browser's start page (a hollow star until it is).
  var star = el("button", BTN + "font-size:18px;line-height:1;padding:0 9px;", "☆");
  back.title = "Back";
  fwd.title = "Forward";
  reload.title = "Reload";
  imp.title = "Import to Tamkeen: read this page with every word clickable";
  imp.setAttribute("aria-label", "Import to Tamkeen");
  input.type = "text";
  input.spellcheck = false;
  input.placeholder = "Search or type a web address";
  // The app's own start page (web/browser-home.html) shows an empty box, ready to type in.
  function shownAddress() {
    var home = /^(127\.0\.0\.1|localhost)$/.test(location.hostname) && location.pathname === "/browser-home.html";
    return home ? "" : location.href;
  }
  input.value = shownAddress();

  back.onclick = function () { history.back(); };
  fwd.onclick = function () { history.forward(); };
  reload.onclick = function () { location.reload(); };
  input.onfocus = function () { input.select(); };
  input.onkeydown = function (e) {
    e.stopPropagation();
    if (e.key !== "Enter") return;
    var text = input.value.trim();
    if (!text) return;
    var looksLikeAddress = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) || (/^[^\s]+\.[^\s]{2,}$/.test(text) && text.indexOf(" ") < 0);
    location.href = looksLikeAddress ? (/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : "https://" + text)
      : "https://www.google.com/search?q=" + encodeURIComponent(text);
  };
  ["keyup", "keypress"].forEach(function (t) { input.addEventListener(t, function (e) { e.stopPropagation(); }); });

  var busy = false;
  function say(text, good) {
    status.textContent = text;
    status.style.color = good === false ? "#fca5a5" : good ? "#5eead4" : "#b8b6ad";
  }

  var starred = false;
  function paintStar() {
    star.textContent = starred ? "★" : "☆";
    star.style.color = starred ? "#f1cf7b" : "#f2f1ec";
    star.title = starred ? "On your start page. Press to take it off." : "Keep this site on the browser's start page";
    star.style.display = shownAddress() ? "" : "none"; // nothing to save on the start page itself
  }
  /** Ask the app whether the site being shown is on the start page (it may still be loading). */
  function askStar(tries) {
    var api = window.pywebview && window.pywebview.api;
    if (!api || !api.site_saved) {
      if (tries > 0) setTimeout(function () { askStar(tries - 1); }, 500);
      return;
    }
    api.site_saved().then(function (r) { starred = !!(r && r.saved); paintStar(); }).catch(function () {});
  }
  star.onclick = function () {
    var api = window.pywebview && window.pywebview.api;
    if (!api || !api.save_site) { say("Still loading… try again in a moment.", false); return; }
    api.save_site(document.title || "").then(function (r) {
      if (r && r.ok) {
        starred = !!r.saved;
        paintStar();
        say(starred ? "★ Saved to your start page." : "Taken off your start page.", true);
      } else {
        say((r && r.error) || "Couldn't save this site.", false);
      }
    }).catch(function (e) {
      say("Couldn't save this site. " + (e && e.message ? e.message : ""), false);
    });
  };
  paintStar();
  askStar(12);
  imp.onclick = function () {
    if (busy) return;
    var api = window.pywebview && window.pywebview.api;
    if (!api || !api.import_page) { say("Still loading… try again in a moment.", false); return; }
    busy = true;
    drawIcon("busy");
    say("Importing…");
    var done = false;
    api.import_page().then(function (r) {
      done = !!(r && r.ok);
      if (done) say("✓ Imported “" + r.title + "” (" + r.words + " words). It's in My webpages.", true);
      else say((r && r.error) || "Couldn't import this page.", false);
    }).catch(function (e) {
      say("Couldn't import this page. " + (e && e.message ? e.message : ""), false);
    }).then(function () {
      busy = false;
      drawIcon(done ? "done" : "import");
      if (done) setTimeout(function () { if (!busy) drawIcon("import"); }, 2500);
    });
  };

  bar.appendChild(back);
  bar.appendChild(fwd);
  bar.appendChild(reload);
  bar.appendChild(input);
  bar.appendChild(status);
  // A window opened for something other than reading pages (signing in, YouTube, finding a word
  // in a video; app/desktop.py says which) has nothing to import or keep on the start page.
  if (!window.__tamkeenNoImport) {
    bar.appendChild(star);
    root.appendChild(imp);
  }
  root.appendChild(bar);

  function attach() {
    (document.body || document.documentElement).appendChild(host);
    // Leave room so the bar never covers the end of the page.
    if (document.body) document.body.style.paddingBottom = "calc(" + H + "px + " + (getComputedStyle(document.body).paddingBottom || "0px") + ")";
  }
  if (document.body) attach();
  else document.addEventListener("DOMContentLoaded", attach);
  // Keep the address current on sites that change pages without reloading.
  var starFor = location.href;
  setInterval(function () {
    if (starFor !== location.href) { starFor = location.href; askStar(0); } // a new page without a reload
    if (root.activeElement !== input && input.value !== shownAddress()) input.value = shownAddress();
    if (!host.isConnected && document.body) document.body.appendChild(host);
  }, 700);
})();
