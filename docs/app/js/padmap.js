// Game controllers (USB and Bluetooth): what each button does, in plain data. No page, no DOM.
// web/js/gamepad.js reads the controller and runs the actions; components/controllerpanel.js is
// Settings → Controller; tests/js/padmap.test.mjs checks this file.
//
// An "input" is one thing on the controller, written as a short id:
//   "b<N>"            button N of the browser's Gamepad API (the "standard" layout below),
//   "a<N>+" / "a<N>-" axis N pushed past half way one way or the other (a stick, or a trigger
//                     some controllers report as an axis).
// The setting "controller_map" keeps only what the learner changed: { at, map: { <area>: { <action>: input | "" } } }
// ("" = cleared on purpose). Anything not in it is the default, so actions added later get theirs.

/**
 * The screens a controller works on, each with its own buttons. A screen's buttons win over
 * "Everywhere" ("general"), which is what is left for the buttons a screen doesn't use. Some layers
 * sit over a screen while they are open: a text box being typed in, a box (a dialog) over anything,
 * and the word popup over a player or a book. Settings → Controller lists them in this order.
 *
 * The defaults follow the Xbox dashboard, the same on every screen: the left stick or the D-pad move
 * the highlight, A selects, B goes back, X and Y are the screen's extra actions, LB / RB the tab
 * before / after (or the screen's own: the kind, the lesson, the page, the reel…), LT / RT a page up
 * / down (in a player: back / forward 5 seconds), the right stick scrolls, View opens the screen's
 * options and Menu more options for the highlighted thing.
 */
export const AREAS = [
  { id: "video", title: "Watching videos", about: "Podcasts, YouTube, Netflix and your own videos." },
  { id: "reels", title: "Reels", about: "Watching Instagram reels." },
  { id: "popup", title: "The word popup", about: "While a word's popup is open, on any screen." },
  { id: "review", title: "Studying cards", about: "The review cards." },
  { id: "reader", title: "Books and pages", about: "Reading a book or a saved web page." },
  { id: "home", title: "Home", about: "The first screen." },
  { id: "library", title: "Library", about: "Courses, podcasts, YouTube, reels, books and web pages." },
  { id: "lesson", title: "Course lessons", about: "A basics unit or a grammar lesson, with its exercises." },
  { id: "vocab", title: "Vocab", about: "Your saved words." },
  { id: "friends", title: "Friends and chat", about: "Friends, guilds and messages." },
  { id: "battle", title: "Creature battles", about: "A live battle in the creature game: the left stick walks, the buttons use moves and answer." },
  { id: "settings", title: "Settings", about: "Every section of Settings." },
  { id: "dialog", title: "Popups and boxes", about: "A box open over the page: the highlight stays inside it." },
  { id: "typing", title: "Typing in a text box", about: "While a text box has the cursor. The controller doesn't type: use the keyboard." },
  { id: "general", title: "Everywhere", about: "Moving around the app: on every screen, for the buttons it doesn't use itself." },
];

/**
 * The actions, area by area, with their default input on a standard controller ("" = none: it can
 * be given one in Settings).
 * `short`: its name in the on-screen button guide and on the drawing in Settings. `pair`: the name
 * of a before / after pair on LB and RB, shown once for both ("Kind"). `repeat`: held down, it
 * happens again and again. `scroll`: held, it scrolls smoothly (a stick scrolls faster the further it
 * is pushed). `hold`: it happens when the button is let go, so what is done while it is held (the
 * D-pad taking in more words) can change it.
 */
export const ACTIONS = {
  video: [
    { id: "lookUp", label: "Open the highlighted word (hold, and move to add more words)", short: "Look up", def: "b2", hold: true },
    { id: "playPause", label: "Play / pause", short: "Play / pause", def: "b0" },
    { id: "replayLine", label: "Hear this line again", short: "Hear the line", def: "b3" },
    { id: "wordLeft", label: "Highlight the word to the left", short: "Word", def: "b14", repeat: true },
    { id: "wordRight", label: "Highlight the word to the right", short: "Word", def: "b15", repeat: true },
    { id: "lineUp", label: "Highlight the line above", short: "Line", def: "b12", repeat: true },
    { id: "lineDown", label: "Highlight the line below", short: "Line", def: "b13", repeat: true },
    { id: "prevLine", label: "Play the previous line", short: "Previous line", pair: "Line", def: "b4", repeat: true },
    { id: "nextLine", label: "Play the next line", short: "Next line", pair: "Line", def: "b5", repeat: true },
    { id: "back5", label: "Back 5 seconds", short: "−5 s", pair: "5 seconds", def: "b6", repeat: true },
    { id: "fwd5", label: "Forward 5 seconds", short: "+5 s", pair: "5 seconds", def: "b7", repeat: true },
    { id: "options", label: "Options: slow down, loop, captions, the transcript, text size", short: "Options", def: "b8" },
    { id: "wordMenu", label: "More options for the highlighted word (save, copy, play from here, loop)", short: "More", def: "b9" },
    { id: "slower", label: "Slow down (on / off)", short: "Slower", def: "" },
    { id: "loopLine", label: "Loop this line (on / off)", short: "Loop", def: "" },
    { id: "saveWord", label: "Save the word in the popup", short: "Save", def: "" },
    { id: "captions", label: "Captions on the video (on / off)", short: "Captions", def: "" },
    { id: "transcript", label: "Transcript panel (open / close)", short: "Transcript", def: "" },
  ],
  reels: [
    { id: "lookUp", label: "Open the highlighted word (hold, and move to add more words)", short: "Look up", def: "b2", hold: true },
    { id: "playPause", label: "Play / pause", short: "Play / pause", def: "b0" },
    { id: "replayLine", label: "Hear this line again", short: "Hear the line", def: "b3" },
    { id: "wordLeft", label: "Highlight the word to the left", short: "Word", def: "b14", repeat: true },
    { id: "wordRight", label: "Highlight the word to the right", short: "Word", def: "b15", repeat: true },
    { id: "lineUp", label: "Highlight the line above", short: "Line", def: "b12", repeat: true },
    { id: "lineDown", label: "Highlight the line below", short: "Line", def: "b13", repeat: true },
    { id: "prevVideo", label: "Previous reel", short: "Previous reel", pair: "Reel", def: "b4" },
    { id: "nextVideo", label: "Next reel", short: "Next reel", pair: "Reel", def: "b5" },
    { id: "back5", label: "Back 5 seconds", short: "−5 s", pair: "5 seconds", def: "b6", repeat: true },
    { id: "fwd5", label: "Forward 5 seconds", short: "+5 s", pair: "5 seconds", def: "b7", repeat: true },
    { id: "options", label: "Options: the reel's own buttons", short: "Options", def: "b8" },
    { id: "prevLine", label: "Play the previous line", short: "Previous line", def: "", repeat: true },
    { id: "nextLine", label: "Play the next line", short: "Next line", def: "", repeat: true },
    { id: "saveWord", label: "Save the word in the popup", short: "Save", def: "" },
  ],
  popup: [
    { id: "press", label: "Press the highlighted button (Save when none is)", short: "Save", def: "b0" },
    { id: "close", label: "Close the popup", short: "Close", def: "b1" },
    { id: "playWord", label: "Hear the word", short: "Word", def: "b2" },
    { id: "playSentence", label: "Hear the sentence", short: "Sentence", def: "b3" },
    { id: "up", label: "Highlight the button above", short: "Move", def: "b12", repeat: true },
    { id: "down", label: "Highlight the button below", short: "Move", def: "b13", repeat: true },
    { id: "left", label: "Highlight the button to the left", short: "Move", def: "b14", repeat: true },
    { id: "right", label: "Highlight the button to the right", short: "Move", def: "b15", repeat: true },
    { id: "wordLeft", label: "Look up the word to the left", short: "Word to the left", pair: "Word", def: "b4", repeat: true },
    { id: "wordRight", label: "Look up the word to the right", short: "Word to the right", pair: "Word", def: "b5", repeat: true },
    { id: "scrollUp", label: "Scroll the explanation up", short: "Scroll up", pair: "Scroll", def: "b6", repeat: true },
    { id: "scrollDown", label: "Scroll the explanation down", short: "Scroll down", pair: "Scroll", def: "b7", repeat: true },
    { id: "source", label: "Choose what explains words", short: "Source", def: "b8" },
    { id: "save", label: "Save the word", short: "Save", def: "" },
  ],
  review: [
    { id: "turn", label: "Turn the card; on its back, press the highlighted button or box", short: "Turn", def: "b0" },
    { id: "again", label: "Not remembered", short: "Not remembered", def: "b4" },
    { id: "good", label: "Remembered", short: "Remembered", def: "b5" },
    { id: "up", label: "Highlight the box or button above", short: "Move", def: "b12", repeat: true },
    { id: "down", label: "Highlight the box or button below", short: "Move", def: "b13", repeat: true },
    { id: "playWord", label: "Play the word", short: "Word", def: "b2" },
    { id: "playSentence", label: "Play the sentence", short: "Sentence", def: "b3" },
    { id: "options", label: "Reviewer settings", short: "Settings", def: "b8" },
    { id: "cardMenu", label: "More options: undo, say it, delete the word, finish", short: "More", def: "b9" },
    { id: "mnemonic", label: "Make a mnemonic for the word (the Mnemonic maker)", short: "Mnemonic", def: "b10" },
    { id: "sayIt", label: "Say it (practise saying it)", short: "Say it", def: "" },
    { id: "undo", label: "Undo the last answer", short: "Undo", def: "" },
    { id: "finish", label: "Finish the session", short: "Finish", def: "" },
  ],
  reader: [
    { id: "lookUp", label: "Open the highlighted word (hold, and move to add more words)", short: "Look up", def: "b0", hold: true },
    { id: "wordLeft", label: "Highlight the word to the left", short: "Word", def: "b14", repeat: true },
    { id: "wordRight", label: "Highlight the word to the right", short: "Word", def: "b15", repeat: true },
    { id: "lineUp", label: "Highlight the line above", short: "Line", def: "b12", repeat: true },
    { id: "lineDown", label: "Highlight the line below", short: "Line", def: "b13", repeat: true },
    { id: "prevPage", label: "Previous page", short: "Previous page", pair: "Page", def: "b4" },
    { id: "nextPage", label: "Next page", short: "Next page", pair: "Page", def: "b5" },
    { id: "options", label: "Options: text size", short: "Options", def: "b8" },
    { id: "wordMenu", label: "More options for the highlighted word (save, copy)", short: "More", def: "b9" },
    { id: "saveWord", label: "Save the word in the popup", short: "Save", def: "" },
  ],
  home: [
    { id: "continue", label: "Continue where you left off", short: "Continue", def: "b2" },
    { id: "review", label: "Start reviewing your cards", short: "Review", def: "b3" },
  ],
  library: [
    { id: "prevKind", label: "The kind before (Courses, Podcasts, YouTube…)", short: "Previous kind", pair: "Kind", def: "b4" },
    { id: "nextKind", label: "The next kind", short: "Next kind", pair: "Kind", def: "b5" },
    { id: "add", label: "Add something", short: "Add", def: "b2" },
    { id: "search", label: "Search this list", short: "Search", def: "b3" },
  ],
  lesson: [
    { id: "prevLesson", label: "Previous lesson", short: "Previous lesson", pair: "Lesson", def: "b4" },
    { id: "nextLesson", label: "Next lesson", short: "Next lesson", pair: "Lesson", def: "b5" },
    { id: "hear", label: "Hear the highlighted example (or the whole lesson)", short: "Hear", def: "b2" },
    { id: "allLessons", label: "Back to all the lessons", short: "All lessons", def: "b3" },
  ],
  vocab: [
    { id: "review", label: "Start the review", short: "Review", def: "b2" },
    { id: "search", label: "Search your words", short: "Search", def: "b3" },
    { id: "prevFolder", label: "The folder before", short: "Previous folder", pair: "Folder", def: "b4" },
    { id: "nextFolder", label: "The next folder", short: "Next folder", pair: "Folder", def: "b5" },
    { id: "options", label: "Options: add words, export, Anki", short: "Options", def: "b8" },
  ],
  friends: [
    { id: "record", label: "Record a voice message (in a chat)", short: "Record", def: "b2" },
    { id: "write", label: "Write a message (in a chat)", short: "Write", def: "b3" },
  ],
  // A live battle (game/livebattle-ui.js): the left stick walks in any direction (it is read as it is
  // pushed, not as presses; the D-pad walks too). The four face buttons are the four moves, laid out on
  // the screen where the buttons are; while a question is open they answer it.
  battle: [
    { id: "move1", label: "Use your first move (in a question: the answer by it)", short: "Move 1", def: "b0" },
    { id: "move2", label: "Use your second move (in a question: the answer by it)", short: "Move 2", def: "b1" },
    { id: "move3", label: "Use your third move (in a question: the answer by it)", short: "Move 3", def: "b2" },
    { id: "move4", label: "Use your fourth move (in a question: the answer by it)", short: "Move 4", def: "b3" },
    { id: "hint", label: "Use a hint card (in a question)", short: "Hint", def: "b4" },
    { id: "potion", label: "Drink a potion (battles with wild creatures)", short: "Potion", def: "b5" },
    { id: "help", label: "How to play (the battle waits)", short: "How to play", def: "b8" },
    { id: "pause", label: "Pause: carry on, or leave the battle", short: "Pause", def: "b9" },
    { id: "walkUp", label: "Walk up (the left stick walks too, any way)", short: "Walk", def: "b12" },
    { id: "walkDown", label: "Walk down", short: "Walk", def: "b13" },
    { id: "walkLeft", label: "Walk left", short: "Walk", def: "b14" },
    { id: "walkRight", label: "Walk right", short: "Walk", def: "b15" },
  ],
  settings: [
    { id: "prevSection", label: "The section before", short: "Previous section", pair: "Section", def: "b4" },
    { id: "nextSection", label: "The next section", short: "Next section", pair: "Section", def: "b5" },
    { id: "search", label: "Search the settings", short: "Search", def: "b3" },
  ],
  dialog: [
    { id: "confirm", label: "Press the box's main button", short: "OK", def: "b2" },
  ],
  typing: [
    { id: "leave", label: "Leave the text box", short: "Done", def: "b1" },
    { id: "enter", label: "Press Enter (search, send)", short: "Enter", def: "b9" },
  ],
  general: [
    { id: "back", label: "Back / close", short: "Back", def: "b1" },
    { id: "select", label: "Select the highlighted thing", short: "Select", def: "b0" },
    { id: "up", label: "Move the highlight up", short: "Move", def: "b12", repeat: true },
    { id: "down", label: "Move the highlight down", short: "Move", def: "b13", repeat: true },
    { id: "left", label: "Move the highlight left", short: "Move", def: "b14", repeat: true },
    { id: "right", label: "Move the highlight right", short: "Move", def: "b15", repeat: true },
    { id: "prevTab", label: "The tab before", short: "Previous tab", pair: "Tab", def: "b4" },
    { id: "nextTab", label: "The next tab", short: "Next tab", pair: "Tab", def: "b5" },
    { id: "pageUp", label: "Jump a page up", short: "Page up", pair: "Page", def: "b6", repeat: true },
    { id: "pageDown", label: "Jump a page down", short: "Page down", pair: "Page", def: "b7", repeat: true },
    { id: "scrollUp", label: "Scroll up", short: "Scroll", def: "a3-", scroll: true },
    { id: "scrollDown", label: "Scroll down", short: "Scroll", def: "a3+", scroll: true },
    { id: "options", label: "Options for this screen (or how to use it)", short: "Options", def: "b8" },
    { id: "more", label: "More options for the highlighted thing", short: "More", def: "b9" },
    { id: "menu", label: "Go to the main tabs", short: "Tabs", def: "" },
    { id: "guide", label: "How to use this screen (its guide)", short: "Guide", def: "" },
  ],
};

/** Where a screen gives the left stick nothing of its own, it does what the D-pad does (as on Xbox). */
export const STICK_AS_DPAD = { "a0-": "b14", "a0+": "b15", "a1-": "b12", "a1+": "b13" };

export const AREA_IDS = AREAS.map((a) => a.id);
export const actionOf = (area, id) => (ACTIONS[area] || []).find((a) => a.id === id) || null;

/** A stick (or an axis) counts as pressed past this, and is let go again under RELEASE. */
export const PRESS = 0.5;
export const RELEASE = 0.35;
/** Below this a stick counts as resting: no stick rests exactly at 0. */
export const DEAD_ZONE = 0.25;
/** A trigger (an analogue button) counts as pressed past this. */
export const TRIGGER = 0.5;
/** Held down: the first repeat after HOLD_MS, then one every REPEAT_MS. */
export const HOLD_MS = 400;
export const REPEAT_MS = 110;

const INPUT_RE = /^(?:b(\d{1,2})|a(\d{1,2})([+-]))$/;
export const isInput = (s) => typeof s === "string" && INPUT_RE.test(s);

// ------------------------------------------------------------------- the mapping

/** What an area's or an action's name may look like (a newer version's ones included). */
const AREA_RE = /^[a-z][A-Za-z0-9]{0,31}$/;

/**
 * The learner's changes, cleaned: anything that isn't an input left out. An area or an action this
 * version doesn't know is kept (a newer version on another device may have it); it does nothing
 * here. app/controller.py `clean` is the twin.
 */
export function cleanMap(raw) {
  const out = {};
  const map = raw && typeof raw === "object" ? (raw.map && typeof raw.map === "object" && !Array.isArray(raw.map) ? raw.map : {}) : {};
  for (const area of Object.keys(map)) {
    if (!AREA_RE.test(area)) continue;
    const mine = map[area];
    if (!mine || typeof mine !== "object" || Array.isArray(mine)) continue;
    for (const [id, v] of Object.entries(mine)) {
      if (/^[A-Za-z0-9]{1,32}$/.test(id) && (v === "" || isInput(v))) (out[area] = out[area] || {})[id] = v;
    }
  }
  return out;
}

/** The setting as stored and synced: the changes, and when they were made (the newest wins between devices). */
export function cleanSetting(raw) {
  const at = raw && Number.isFinite(raw.at) ? Math.max(0, Math.floor(raw.at)) : 0;
  return { at, map: cleanMap(raw) };
}

/** Does another device's mapping replace this one's? The one changed last wins. */
export const settingWins = (theirs, mine) => cleanSetting(theirs).at > cleanSetting(mine).at;

/**
 * Every action of every area with the input it has now: { area: { action: input | "" } }. A button
 * the learner gave an action wins over a default that came later: when a newer version gives that
 * button to another action of the same area by default, that action is left without one, so a
 * button still does one thing in an area and the learner's choice keeps working.
 */
export function fullMap(setting) {
  const changes = cleanMap(setting);
  const out = {};
  for (const area of AREA_IDS) {
    out[area] = {};
    const mine = changes[area] || {};
    const chosen = new Set(ACTIONS[area].map((a) => mine[a.id]).filter(Boolean));
    for (const a of ACTIONS[area]) {
      if (mine[a.id] !== undefined) out[area][a.id] = mine[a.id];
      else out[area][a.id] = chosen.has(a.def) ? "" : a.def;
    }
  }
  return out;
}

/** An action's name in the on-screen button guide. */
export const shortOf = (area, id) => { const a = actionOf(area, id); return a ? a.short || a.label : ""; };

/** Only what differs from the defaults, so the stored setting stays small (and actions only a newer version knows, kept). */
function changesOf(full, setting) {
  const out = {};
  for (const [area, mine] of Object.entries(cleanMap(setting))) {
    for (const [id, v] of Object.entries(mine)) if (!actionOf(area, id)) (out[area] = out[area] || {})[id] = v;
  }
  for (const area of AREA_IDS) {
    for (const a of ACTIONS[area]) {
      const v = full[area][a.id];
      if (v !== a.def) (out[area] = out[area] || {})[a.id] = v;
    }
  }
  return out;
}

/**
 * Give `action` of `area` the input `input` ("" clears it). Within one area an input does one
 * thing, so an action that had it loses it (it is cleared, and named in `took`). Returns the new
 * setting and `took` (the action that lost the input, or null).
 */
export function assign(setting, area, action, input, now = Date.now()) {
  if (!actionOf(area, action)) throw new Error(`Unknown action ${area}/${action}`);
  if (input !== "" && !isInput(input)) throw new Error(`Unknown input ${input}`);
  const full = fullMap(setting);
  let took = null;
  if (input) {
    for (const [other, has] of Object.entries(full[area])) {
      if (other !== action && has === input) { full[area][other] = ""; took = other; }
    }
  }
  full[area][action] = input;
  return { setting: { at: now, map: changesOf(full, setting) }, took };
}

/** Put one action back to its default (and take that input from another action of the area that had it). */
export function resetAction(setting, area, action, now = Date.now()) {
  return assign(setting, area, action, actionOf(area, action).def, now);
}

/** Every action of one area back to its defaults (or every area, without `area`). */
export function resetArea(setting, area, now = Date.now()) {
  const map = { ...cleanMap(setting) };
  if (area) delete map[area];
  return { at: now, map: area ? map : {} };
}

/** Which action of `area` an input does, or "" (no action there). */
export function actionFor(full, area, input) {
  const m = full[area] || {};
  for (const [id, has] of Object.entries(m)) if (has && has === input) return id;
  return "";
}

const MOVES = ["up", "down", "left", "right"];

/**
 * What `input` does on screen `area`, as the drawing in Settings shows it: { area, action } (the
 * screen's own action, else Everywhere's), or null. While typing only leaving the box (and the D-pad,
 * which leaves it and moves on) works. The left stick does what the D-pad does when nothing has it.
 */
export function whatDoes(full, area, input) {
  for (const a of area === "general" ? ["general"] : [area, "general"]) {
    const id = actionFor(full, a, input);
    if (!id) continue;
    if (area === "typing" && a === "general" && !MOVES.includes(id)) continue;
    return { area: a, action: id };
  }
  return STICK_AS_DPAD[input] ? whatDoes(full, area, STICK_AS_DPAD[input]) : null;
}

/** The name a before / after pair (LB and RB) goes by together, when both are one pair: "Kind". */
export function pairName(a, b) {
  const x = a && actionOf(a.area, a.action);
  const y = b && actionOf(b.area, b.action);
  return x && y && x.pair && x.pair === y.pair ? x.pair : "";
}

// ------------------------------------------------------------------- reading the controller

/** A stick's value with its resting wobble taken away, scaled back to 0..1 past the dead zone. */
export function deadZone(v, dead = DEAD_ZONE) {
  const x = Number(v) || 0;
  const m = Math.abs(x);
  if (m < dead) return 0;
  return Math.sign(x) * Math.min(1, (m - dead) / (1 - dead));
}

/**
 * Which inputs are down right now, from one controller's snapshot ({buttons: [{pressed, value}], axes: []}).
 * `before` (the set from the last look) gives the axes their hysteresis: pressed past PRESS, let go under RELEASE.
 * Returns a Set of input ids, and `strength` for each axis input (0..1, past the dead zone).
 */
export function readInputs(pad, before = new Set()) {
  const down = new Set();
  const strength = {};
  const buttons = (pad && pad.buttons) || [];
  for (let i = 0; i < buttons.length; i++) {
    const b = buttons[i];
    const value = typeof b === "number" ? b : (b && Number(b.value)) || 0;
    const pressed = typeof b === "number" ? b >= TRIGGER : !!(b && b.pressed);
    // A trigger reports "pressed" at the lightest touch on some controllers: half way is a press.
    if (pressed && (value === 0 || value >= TRIGGER || value === 1)) down.add(`b${i}`);
    else if (!pressed && value >= TRIGGER) down.add(`b${i}`);
  }
  const axes = (pad && pad.axes) || [];
  for (let i = 0; i < axes.length; i++) {
    const v = Number(axes[i]) || 0;
    for (const [dir, sign] of [["+", 1], ["-", -1]]) {
      const id = `a${i}${dir}`;
      const along = v * sign;
      const held = before.has(id) ? along >= RELEASE : along >= PRESS;
      if (held) down.add(id);
      const s = deadZone(along > 0 ? along : 0);
      if (s > 0) strength[id] = s;
    }
  }
  return { down, strength };
}

/**
 * Turn "what is down now" into presses, with holds repeating. `state` is kept between looks:
 * { down: Set, since: {input: ms}, last: {input: ms} }. `repeats(input)` says whether that input's
 * action repeats when held. Returns the inputs to act on this time (new presses and repeats).
 */
export function pressesFrom(state, down, now, repeats = () => false) {
  const fire = [];
  for (const id of down) {
    if (!state.down.has(id)) {
      state.since[id] = now;
      state.last[id] = now;
      fire.push(id);
    } else if (repeats(id) && now - state.since[id] >= HOLD_MS && now - state.last[id] >= REPEAT_MS) {
      state.last[id] = now;
      fire.push(id);
    }
  }
  for (const id of state.down) if (!down.has(id)) { delete state.since[id]; delete state.last[id]; }
  state.down = new Set(down);
  return fire;
}

export const newPressState = () => ({ down: new Set(), since: {}, last: {}, stuck: new Set() });

/**
 * A controller just seen: whatever is already down then (a stick or a trigger resting away from the
 * middle, a button that reads as pressed all the time) is taken as at rest, and does nothing until
 * it has been let go once. Without this, an axis resting at −1 on the "right stick up" scrolled the
 * page up for ever.
 */
export function settle(state, down) {
  state.down = new Set(down);
  state.stuck = new Set(down);
}

/** What is held now, less what has been down since the controller appeared and not let go since. */
export function heldNow(state, down) {
  const stuck = state.stuck || new Set();
  for (const id of [...stuck]) if (!down.has(id)) stuck.delete(id);
  return new Set([...down].filter((id) => !stuck.has(id)));
}

// ------------------------------------------------------------------- names on the buttons

/**
 * Could it be a game controller? Some devices tell the browser they are one without being one (the
 * owner's speakers' volume knob, "Pebble V3": 7 buttons, no sticks). One the browser knows the layout
 * of ("standard": Xbox, PlayStation, Switch Pro… on the computer, the phones and the web) is; one it
 * doesn't must look like one: six buttons or more, and at least a stick resting near the middle.
 * Such a one still counts only once it has really been used (`newTrust`, `trustNow`).
 */
export function isController(pad) {
  if (!pad) return false;
  if (pad.mapping === "standard") return true;
  const axes = Array.from(pad.axes || [], Number);
  return (pad.buttons || []).length >= 6 && axes.length >= 2 && axes.filter((v) => Math.abs(v) < 0.3).length >= 2;
}

const buttonsDown = (pad) => new Set([...readInputs(pad).down].filter((id) => id.startsWith("b")));

/** How far a controller is trusted: one in the standard layout at once; another once it is really used. */
export function newTrust(pad) {
  return { real: !!pad && pad.mapping === "standard", start: buttonsDown(pad) };
}

/**
 * Does the controller count now? A pad of unknown layout counts once one of its buttons has been
 * pressed that wasn't down when it appeared (a button stuck down from the start never makes it count;
 * let go and pressed again, it does).
 */
export function trustNow(trust, pad) {
  if (trust.real) return true;
  const now = buttonsDown(pad);
  for (const id of now) if (!trust.start.has(id)) { trust.real = true; return true; }
  for (const id of [...trust.start]) if (!now.has(id)) trust.start.delete(id);
  return false;
}

// An Xbox controller over Bluetooth whose layout the browser doesn't know ("Unknown Gamepad
// (Vendor: 045e …)", 15 buttons): which raw button is which standard one, where the triggers, the
// sticks and the D-pad (one "hat" axis) are. Seen on the owner's Xbox Series controller (045e:0b13).
const XBOX_BT = { buttons: { 0: 0, 1: 1, 3: 2, 4: 3, 6: 4, 7: 5, 10: 8, 11: 9, 13: 10, 14: 11, 12: 16 }, lt: 3, rt: 4, sticks: [0, 1, 2, 5], hat: 9 };

/**
 * A controller's snapshot in the standard layout: as it is when the browser knows it, put in the
 * standard places for an Xbox controller over Bluetooth that it doesn't (else as it is). Its triggers
 * rest at −1 there (as if "pushed"): they become buttons 6 and 7 (0 at rest, 1 pressed all the way);
 * its D-pad, an axis giving one of eight directions (anything else: none), becomes buttons 12–15.
 */
export function standardize(pad) {
  if (!pad || pad.mapping === "standard") return pad;
  const raw = pad.buttons || [];
  const axes = pad.axes || [];
  if (!/045e/i.test(String(pad.id || "")) || raw.length < 15 || axes.length < 10) return pad;
  const off = () => ({ pressed: false, value: 0 });
  const buttons = Array.from({ length: 17 }, off);
  for (const [from, to] of Object.entries(XBOX_BT.buttons)) {
    const b = raw[from];
    if (!b) continue;
    const pressed = typeof b === "number" ? b >= TRIGGER : !!b.pressed;
    buttons[to] = { pressed, value: pressed ? 1 : 0 };
  }
  const trigger = (v) => {
    const t = Math.max(0, Math.min(1, ((Number(v) || 0) + 1) / 2));
    return t < 0.55 ? off() : { pressed: t >= TRIGGER, value: t };  // (one never touched yet reads 0: half way)
  };
  buttons[6] = trigger(axes[XBOX_BT.lt]);
  buttons[7] = trigger(axes[XBOX_BT.rt]);
  const hat = Number(axes[XBOX_BT.hat]);
  if (Number.isFinite(hat) && Math.abs(hat) <= 1.05) {
    const dir = ((Math.round((hat + 1) * 3.5) % 8) + 8) % 8;  // 0 up, 1 up-right, 2 right … 7 up-left
    const on = { pressed: true, value: 1 };
    if (dir === 7 || dir <= 1) buttons[12] = on;
    if (dir >= 3 && dir <= 5) buttons[13] = on;
    if (dir >= 5 && dir <= 7) buttons[14] = on;
    if (dir >= 1 && dir <= 3) buttons[15] = on;
  }
  return { id: pad.id, index: pad.index, connected: pad.connected !== false, mapping: "standard", remapped: true,
    buttons, axes: XBOX_BT.sticks.map((i) => Number(axes[i]) || 0) };
}

/** Which family a controller is, from the name the browser gives it. */
export function padKind(id = "") {
  const s = String(id).toLowerCase();
  if (/xbox|xinput|microsoft|vendor: 045e|045e-/.test(s)) return "xbox";
  if (/playstation|dualshock|dualsense|sony|vendor: 054c|054c-|wireless controller/.test(s)) return "playstation";
  if (/nintendo|switch|pro controller|joy-con|vendor: 057e|057e-/.test(s)) return "switch";
  return "generic";
}

export const KIND_NAMES = { xbox: "Xbox", playstation: "PlayStation", switch: "Nintendo Switch", generic: "Controller" };

// The standard layout's buttons 0..16, by family. The face buttons are where they sit, so a Switch
// controller's bottom button (B on its label) is button 0 like an Xbox A.
const FACE = {
  xbox: ["A", "B", "X", "Y"],
  playstation: ["✕", "○", "□", "△"],
  switch: ["B", "A", "Y", "X"],
  generic: ["Bottom button", "Right button", "Left button", "Top button"],
};
const SHOULDERS = {
  xbox: ["LB", "RB", "LT", "RT", "View", "Menu", "Left stick press", "Right stick press"],
  playstation: ["L1", "R1", "L2", "R2", "Create", "Options", "L3", "R3"],
  switch: ["L", "R", "ZL", "ZR", "−", "+", "Left stick press", "Right stick press"],
  generic: ["Left bumper", "Right bumper", "Left trigger", "Right trigger", "Select", "Start", "Left stick press", "Right stick press"],
};
const DPAD = ["D-pad up", "D-pad down", "D-pad left", "D-pad right"];
const HOME = { xbox: "Xbox button", playstation: "PS button", switch: "Home", generic: "Home" };
const STICKS = { 0: ["Left stick right", "Left stick left"], 1: ["Left stick down", "Left stick up"],
                 2: ["Right stick right", "Right stick left"], 3: ["Right stick down", "Right stick up"] };

/**
 * An input's name as printed on this kind of controller ("A", "✕", "LB"…), or a plain one.
 * `standard` false (a controller the browser doesn't know the layout of): "Button 5", "Axis 2 +".
 */
export function inputName(input, kind = "generic", standard = true) {
  if (!input) return "";
  const m = INPUT_RE.exec(input);
  if (!m) return input;
  const k = FACE[kind] ? kind : "generic";
  if (m[1] !== undefined) {
    const i = Number(m[1]);
    if (!standard) return `Button ${i + 1}`;
    if (i < 4) return FACE[k][i];
    if (i < 12) return SHOULDERS[k][i - 4];
    if (i < 16) return DPAD[i - 12];
    if (i === 16) return HOME[k];
    return `Button ${i + 1}`;
  }
  const axis = Number(m[2]);
  const plus = m[3] === "+";
  if (standard && STICKS[axis]) return STICKS[axis][plus ? 0 : 1];
  return `Axis ${axis + 1} ${plus ? "+" : "−"}`;
}

/**
 * The first input that went down, for "press a button to assign": a button not already down in
 * `start` (the controller as it was when the learner was asked), or a stick well pushed away from
 * where it rested then (some controllers report a trigger as an axis resting at −1).
 */
export function firstPressed(pad, start = null) {
  const before = start ? readInputs(start).down : new Set();
  const { down } = readInputs(pad);
  for (const id of down) {
    if (id.startsWith("b") && !before.has(id)) return id;
  }
  const axes = (pad && pad.axes) || [];
  const rest = (start && start.axes) || [];
  let best = "";
  let most = 0.7;  // a deliberate push, not a drifting stick
  for (let i = 0; i < axes.length; i++) {
    const v = Number(axes[i]) || 0;
    const moved = v - (Number(rest[i]) || 0);
    if (Math.abs(moved) > most && Math.abs(v) >= PRESS) { most = Math.abs(moved); best = `a${i}${v > 0 ? "+" : "-"}`; }
  }
  return best;
}

// ------------------------------------------------------------------- moving the highlight

/**
 * The button the highlight moves to from `from` (a rectangle) in a direction, among `list`
 * ([{ rect, … }]). Up and down go to the nearest row that way, then the button closest across it
 * (a button straight below counts as no distance across); left and right stay on the same line as
 * much as they can. null when there is nothing that way.
 */
export function nearest(from, list, dir) {
  const vertical = dir === "up" || dir === "down";
  const c = (r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
  const o = c(from);
  let best = null;
  let score = Infinity;
  for (const item of list) {
    const r = item.rect;
    const p = c(r);
    const centre = dir === "up" ? o.y - p.y : dir === "down" ? p.y - o.y : dir === "left" ? o.x - p.x : p.x - o.x;
    if (centre <= 0) continue;
    const edge = dir === "up" ? from.top - r.bottom : dir === "down" ? r.top - from.bottom
      : dir === "left" ? from.left - r.right : r.left - from.right;
    // Overlapping the highlighted one by more than half of it the other way: not "that way" at all.
    if (edge < 0 && centre < (vertical ? from.height : from.width) / 2) continue;
    const overlap = vertical ? Math.min(r.right, from.right) - Math.max(r.left, from.left)
      : Math.min(r.bottom, from.bottom) - Math.max(r.top, from.top);
    const across = overlap > 0 ? 0 : Math.abs(vertical ? p.x - o.x : p.y - o.y);
    const s = Math.max(0, edge) + across * (vertical ? 0.3 : 2);
    if (s < score) { score = s; best = item; }
  }
  return best;
}
