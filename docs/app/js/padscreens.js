// What a controller's buttons do on the screens that don't claim them themselves (gamepad.js asks
// here when no page area is open): Home, the Library and its kinds, a course lesson, Vocab, Friends
// and chat, Settings. Each screen's actions press the screen's own buttons, so they do exactly what
// a tap would. The players, reels, review cards and books claim their own (controllerArea).
// The buttons themselves are in padmap.js ACTIONS (home, library, lesson, vocab, friends, settings).

// Settings' sections in their order (components/settingsui.js SECTIONS; tests/js/padscreens.test.mjs
// checks the two agree). Not imported from there, so this file needs nothing of the pages'.
export const SECTION_IDS = ["languages", "words", "listening", "voices", "look", "controller", "account", "apps", "data"];

/** The page's path, without "#/" and the query: "", "library", "chat/abc"… */
const path = () => location.hash.replace(/^#\/?/, "").split("?")[0];
const query = () => new URLSearchParams(location.hash.split("?")[1] || "");

/**
 * The layer for the screen on show, or null. `pad` is gamepad.js's set of tools (highlight,
 * switchTab, visible…), passed in so the two files don't import each other.
 */
export function screenLayer(pad) {
  const p = path();
  const shown = (sel) => {
    for (const el of document.querySelectorAll(sel)) if (pad.visible(el, true) && !el.disabled) return el;
    return null;
  };
  const press = (sel) => ({ can: () => !!shown(sel), run: () => shown(sel).click() });
  /** Put the cursor in a text box (a phone's keyboard comes up), with the highlight on it. */
  const typeIn = (sel) => ({
    can: () => !!shown(sel),
    run: () => { const el = shown(sel); pad.highlight(el, { focus: false }); el.focus(); },
  });
  const tabs = (sel, step) => ({ can: () => !!shown(sel), run: () => pad.switchTab(step, shown(sel)) });

  if (p === "" || p === "home") {
    return { area: "home", handlers: {
      continue: press("a.continue-btn"),
      review: { run: () => startReview() },
    } };
  }

  if (/^(library|feed\/\d+|discover|sites|reels|books)$/.test(p)) {
    // A grammar lesson (or the mixed review) or a basics unit open on the Courses kind: the lesson's buttons.
    if (shown(".gl-lesson") || shown(".course .cu-head")) {
      const hearable = () => {
        const el = pad.highlightedEl();
        if (el && el.matches("[data-say], .gx, .cw-play, .gb-playall")) return el;
        const row = el && el.closest("li.cw");
        if (row) return row.querySelector('.cw-play[data-part="word"]') || row.querySelector(".cw-play");
        return shown(".gb-playall");
      };
      const backToAll = () => { const b = shown(".gl-lesson .gl-back, .course .cu-back"); if (!b) return false; b.click(); return true; };
      return { area: "lesson", handlers: {
        prevLesson: press(".gl-nav .gl-prev"),
        nextLesson: press(".gl-nav .gl-next"),
        hear: { can: () => !!hearable(), run: () => hearable().click() },
        allLessons: { can: () => !!shown(".gl-lesson .gl-back, .course .cu-back"), run: backToAll },
        back: backToAll,
      } };
    }
    return { area: "library", handlers: {
      prevKind: tabs("#feed-list", -1),
      nextKind: tabs("#feed-list", 1),
      add: press("#add-fab, .sites-add, #upload"),
      search: typeIn("#title-filter, .sites-search input, .web-yt-search input"),
    } };
  }

  if (p === "vocab") {
    return { area: "vocab", handlers: {
      review: press("#review"),
      search: typeIn("#q"),
      prevFolder: tabs("#folders", -1),
      nextFolder: tabs("#folders", 1),
    } };
  }

  if (p === "friends" || p.startsWith("chat/")) {
    return { area: "friends", handlers: {
      record: press("#mic"),
      write: typeIn("#msg"),
    } };
  }

  if (p === "settings") {
    const at = query().get("s") || "";
    const step = (d) => ({
      can: () => SECTION_IDS.includes(at),
      run: () => {
        const i = SECTION_IDS.indexOf(at);
        location.hash = `#/settings?s=${SECTION_IDS[(i + d + SECTION_IDS.length) % SECTION_IDS.length]}`;
      },
    });
    return { area: "settings", handlers: {
      prevSection: step(-1),
      nextSection: step(1),
      search: {
        run: () => {
          if (shown("#set-find")) { typeIn("#set-find").run(); return; }
          location.hash = "#/settings";
          whenShown("#set-find", (el) => { pad.highlight(el, { focus: false }); el.focus(); });
        },
      },
      // a section's page: back goes to the list of sections (also when it was opened straight from elsewhere)
      back: () => { const b = shown("a.set-back"); if (!b) return false; b.click(); return true; },
    } };
  }
  return null;
}

/** Call `fn` with the first element matching `sel` once it is on screen (a page still drawing), for a few seconds. */
function whenShown(sel, fn, ms = 4000) {
  const until = Date.now() + ms;
  const look = () => {
    const el = document.querySelector(sel);
    if (el && el.getClientRects().length && !el.disabled) { fn(el); return; }
    if (Date.now() < until) setTimeout(look, 120);
  };
  look();
}

/** Home's "Start reviewing your cards": the Vocab page's Review button, pressed once it is there. */
function startReview() {
  if (path() !== "vocab") location.hash = "#/vocab";
  whenShown("#review", (el) => el.click());
}

export const _internal = { path };
