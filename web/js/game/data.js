// Everything the creature game is made of, as data: body plans, parts, colours, sockets, and the
// list of art files. The renderer and the rules read this; new content is added here, not in code.
//
// Art lives in web/game-art/. Every file listed by artFiles() must exist; the files there now
// are placeholders (made by tools/make_placeholder_art.py) and are replaced, same name and
// size, by real pixel art. See game/ASSET_LIST.md for the artist's brief.

// ---------- colours ----------
// Parts are drawn in these exact "key" colours; the app swaps them for each creature's own.
export const KEY = {
  primary: ["#8fd3ff", "#4aa3e8", "#2f6fb8", "#1f4780"], // highlight, base, shade, deep shade
  secondary: ["#fff1c9", "#f5cf7a", "#d49a3f"],          // belly and markings
  accent: ["#ff7a9c", "#d6456e"],                        // tips, gems, type feature
  pattern: "#ff00ff",                                    // pattern tiles only
  outline: "#1b1420",                                    // never swapped
};

// Element types. Each gives a family of body colours; the seed picks within the family.
export const TYPES = {
  ember: { name: "Ember", hues: [8, 28], accent: 48 },
  tide: { name: "Tide", hues: [195, 225], accent: 170 },
  grove: { name: "Grove", hues: [95, 145], accent: 55 },
  spark: { name: "Spark", hues: [45, 58], accent: 275 },
  stone: { name: "Stone", hues: [20, 40], accent: 190, dull: true },
  dusk: { name: "Dusk", hues: [255, 300], accent: 330 },
};
export const TYPE_IDS = Object.keys(TYPES);

// ---------- bodies ----------
// Growth changes proportions, not just size: the head is one size for life while the torso and
// limbs grow, so a hatchling is mostly head and an adult mostly body.
export const SIZES = {
  s: { torso: [20, 16], neck: [12, 3], tail: [2, 10], back: [8, 2], arm: [13, 9], legF: [13, 15], legB: [6, 15], leg: [6, 5], armSize: [5, 6], wing: [10, 8] },
  m: { torso: [28, 24], neck: [18, 4], tail: [2, 15], back: [11, 3], arm: [19, 13], legF: [19, 23], legB: [8, 23], leg: [6, 8], armSize: [6, 9], wing: [14, 12] },
  l: { torso: [40, 36], neck: [27, 6], tail: [3, 23], back: [16, 4], arm: [28, 19], legF: [28, 35], legB: [11, 35], leg: [8, 12], armSize: [8, 12], wing: [20, 16] },
};
export const HEAD = { size: [32, 28], neck: [13, 26], eye: [19, 14], mouth: [22, 21], earB: [8, 6], earF: [19, 5], horn: [14, 3], hat: [14, 4], face: [19, 14] };
export const PART = {
  eyes: { size: [16, 8], anchor: [8, 4] },
  mouth: { size: [8, 6], anchor: [4, 3] },
  ear: { size: [12, 14], anchor: [6, 13] },
  horn: { size: [12, 12], anchor: [6, 11] },
  tail: { size: [16, 16], anchor: [15, 8] },
  back: { size: [16, 16], anchor: [8, 15] },
  pattern: { size: [16, 16] },
};

// Body plans. `legs`/`arms`/`wings` say which limb art the plan uses; `hover` floats off the ground.
export const SPECIES = {
  blob: { name: "Blob", legs: false, arms: false, wings: false },
  biped: { name: "Biped", legs: true, arms: true, wings: false },
  quad: { name: "Quad", legs: true, arms: false, wings: false },
  floater: { name: "Floater", legs: false, arms: false, wings: true, hover: 5 },
};
export const SPECIES_IDS = Object.keys(SPECIES);

// Adult forms. Which one a creature grows into depends on how its owner studies (see TRAITS).
export const BRANCHES = {
  echo: { name: "Echo", trait: "listener", blurb: "shaped by listening" },
  sage: { name: "Sage", trait: "reader", blurb: "shaped by reading" },
  keeper: { name: "Keeper", trait: "collector", blurb: "shaped by collecting words" },
};
export const BRANCH_IDS = Object.keys(BRANCHES);

// What the owner's study habits feed. Values run 0..1 and only ever describe, never add power.
export const TRAITS = ["listener", "reader", "collector", "curious"];

// Part libraries. `weight_by` biases the seeded pick by the creature's traits or tags.
export const EARS = [
  { id: "round" }, { id: "point", weight_by: { curious: 1.5 } }, { id: "long", weight_by: { listener: 2 } },
  { id: "floppy" }, { id: "fin" }, { id: "leaf" }, { id: "tuft", weight_by: { reader: 1.5 } }, { id: "none" },
];
export const TAILS = [
  { id: "nub" }, { id: "curl" }, { id: "fluff" }, { id: "spike" }, { id: "fish" }, { id: "leaf" },
  { id: "bolt", weight_by: { curious: 1.5 } }, { id: "none" },
];
export const HORNS = [{ id: "none", weight: 3 }, { id: "nub" }, { id: "pair" }, { id: "antenna", weight_by: { listener: 2 } }, { id: "crest" }, { id: "gem", weight_by: { collector: 2 } }];
export const BACKS = [{ id: "none", weight: 4 }, { id: "spikes" }, { id: "shell" }, { id: "fin" }, { id: "sprout" }, { id: "flame" }];
export const EYES = ["dot", "round", "oval", "sleepy", "star", "wide"];
export const EXPRESSIONS = ["open", "blink", "happy", "sad", "sleepy"];
export const MOUTHS = ["neutral", "smile", "open", "eat", "sad", "sleep"];
export const PATTERNS = [{ id: "none", weight: 3 }, { id: "spots" }, { id: "stripes" }, { id: "patch" }, { id: "speckle" }, { id: "rings" }];

// Stages by growth (0..1). The egg hatches into the smallest body.
export const STAGES = [
  { id: "egg", from: 0 },
  { id: "hatchling", from: 0.04, size: "s" },
  { id: "juvenile", from: 0.3, size: "m" },
  { id: "adult", from: 0.7, size: "l" },
];

// ---------- things to own ----------
// Cosmetics only: nothing here makes a creature stronger. `requires` lists tags the owner must
// have earned for the item to turn up in the shop; `weight_by` makes it turn up more often for
// creatures with those traits or owners with those tags.
export const SLOTS = {
  hat: { name: "Hats", size: [20, 14], anchor: [10, 13] },    // on the head's hat socket
  face: { name: "Glasses", size: [16, 8], anchor: [8, 4] },   // over the eyes
  neck: { name: "Neckwear", size: [16, 10], anchor: [8, 1] }, // hangs from the neck socket
  held: { name: "Held", size: [12, 12], anchor: [6, 11] },    // in the hand
};
const item = (slot, id, name, price, extra = {}) => ({ id: `${slot}/${id}`, slot, name, price, ...extra });
export const ITEMS = [
  item("hat", "cap", "Cap", 15), item("hat", "beanie", "Beanie", 15), item("hat", "straw", "Straw hat", 20),
  item("hat", "flower", "Flower crown", 25, { weight_by: { collector: 1.5 } }),
  item("hat", "bow", "Bow", 20), item("hat", "headphones", "Headphones", 30, { weight_by: { listener: 3 } }),
  item("hat", "wizard", "Wizard hat", 45, { requires: ["night_owl"] }),
  item("hat", "crown", "Crown", 80, { requires: ["streak_7"] }),
  item("face", "round_glasses", "Round glasses", 20, { weight_by: { reader: 3 } }),
  item("face", "shades", "Shades", 25), item("face", "monocle", "Monocle", 35, { weight_by: { reader: 1.5 } }),
  item("face", "star_glasses", "Star glasses", 40, { weight_by: { curious: 2 } }), item("face", "mask", "Mask", 30, { requires: ["night_owl"] }),
  item("neck", "scarf", "Scarf", 15), item("neck", "bowtie", "Bow tie", 20), item("neck", "bell", "Bell", 20),
  item("neck", "gold_chain", "Gold chain", 50, { weight_by: { collector: 2 } }),
  item("neck", "spiked_collar", "Spiked collar", 35, { requires: ["night_owl"] }),
  item("neck", "medal", "Medal", 60, { requires: ["streak_7"] }),
  item("held", "book", "Book", 20, { weight_by: { reader: 3 } }), item("held", "lantern", "Lantern", 25),
  item("held", "flag", "Flag", 15), item("held", "balloon", "Balloon", 15),
  item("held", "microphone", "Microphone", 30, { weight_by: { listener: 3 } }),
  item("held", "quill", "Quill", 30, { weight_by: { collector: 2 } }),
];
// Decorations stand in the habitat. `size` is the sprite's square size in pixels.
const decor = (id, name, price, size, extra = {}) => ({ id: `decor/${id}`, slot: "decor", name, price, size, ...extra });
export const DECOR = [
  decor("flower_red", "Red flowers", 8, 16), decor("flower_blue", "Blue flowers", 8, 16), decor("mushroom", "Mushroom", 10, 16),
  decor("rock_small", "Small rock", 6, 16), decor("grass_tuft", "Tall grass", 5, 16), decor("lantern_small", "Little lantern", 18, 16),
  decor("shell", "Shell", 12, 16), decor("signpost", "Signpost", 14, 16),
  decor("bush", "Bush", 20, 32), decor("rock_big", "Boulder", 18, 32), decor("nest", "Nest", 30, 32), decor("bed", "Bed", 40, 32),
  decor("food_bowl", "Food bowl", 15, 32), decor("toy_ball", "Toy ball", 15, 32),
  decor("bookshelf", "Bookshelf", 45, 32, { weight_by: { reader: 3 } }), decor("radio", "Radio", 45, 32, { weight_by: { listener: 3 } }),
  decor("pond", "Pond", 50, 32), decor("campfire", "Campfire", 35, 32), decor("tent", "Tent", 55, 32), decor("lamp_post", "Lamp post", 30, 32),
  decor("tree_fruit", "Fruit tree", 70, 48), decor("fountain", "Fountain", 90, 48), decor("arch", "Arch", 80, 48),
  decor("statue", "Statue", 120, 48, { requires: ["streak_7"] }),
];
export const CATALOG = [...ITEMS, ...DECOR];
export const itemById = (id) => CATALOG.find((x) => x.id === id) || null;

// Tags are earned by how and when the owner studies, and unlock things in the shop.
export const TAGS = {
  night_owl: "Night owl: studied after 10 at night",
  early_bird: "Early bird: studied before 7 in the morning",
  streak_7: "Seven days in a row",
};

// ---------- habitat ----------
export const HABITAT = { size: [320, 144], ground: 124, themes: ["meadow"], layers: ["sky", "far", "mid", "ground"] };

// ---------- art files ----------
const SHEET = (frames, w, h) => ({ w: w * frames, h, frames });

/** Every art file the game loads: {file, w, h, kind, frames?, hint?}. `kind` and `hint` are only
 * for the placeholder generator. */
export function artFiles() {
  const out = [];
  const add = (file, [w, h], kind, hint = {}) => out.push({ file, w, h, kind, ...hint });
  for (const sp of SPECIES_IDS) {
    for (const size of Object.keys(SIZES)) add(`creature/torso/${sp}_${size}.png`, SIZES[size].torso, "torso", { species: sp });
    add(`creature/head/${sp}.png`, HEAD.size, "head", { species: sp });
    for (const b of BRANCH_IDS) {
      add(`creature/torso/${sp}_l_${b}.png`, SIZES.l.torso, "torso", { species: sp, branch: b });
      add(`creature/head/${sp}_${b}.png`, HEAD.size, "head", { species: sp, branch: b });
    }
    for (const size of Object.keys(SIZES)) {
      if (SPECIES[sp].legs) for (const f of "ab") add(`creature/leg/${sp}_${size}_${f}.png`, SIZES[size].leg, "leg", { frame: f });
      if (SPECIES[sp].arms) add(`creature/arm/${sp}_${size}.png`, SIZES[size].armSize, "arm");
      if (SPECIES[sp].wings) for (const f of "ab") add(`creature/wing/${sp}_${size}_${f}.png`, SIZES[size].wing, "wing", { frame: f });
    }
  }
  for (const e of EARS) if (e.id !== "none") add(`creature/ear/${e.id}.png`, PART.ear.size, "ear", { id: e.id });
  for (const t of TAILS) if (t.id !== "none") add(`creature/tail/${t.id}.png`, PART.tail.size, "tail", { id: t.id });
  for (const x of HORNS) if (x.id !== "none") add(`creature/horn/${x.id}.png`, PART.horn.size, "horn", { id: x.id });
  for (const x of BACKS) if (x.id !== "none") add(`creature/back/${x.id}.png`, PART.back.size, "back", { id: x.id });
  for (const s of EYES) for (const x of EXPRESSIONS) add(`creature/eyes/${s}_${x}.png`, PART.eyes.size, "eyes", { id: s, expr: x });
  for (const m of MOUTHS) add(`creature/mouth/${m}.png`, PART.mouth.size, "mouth", { id: m });
  for (const p of PATTERNS) if (p.id !== "none") add(`creature/pattern/${p.id}.png`, PART.pattern.size, "pattern", { id: p.id });
  for (const t of TYPE_IDS) {
    add(`egg/${t}.png`, [32, 32], "egg", { type: t });
    add(`icon/type_${t}.png`, [16, 16], "icon", { type: t });
  }
  for (const n of [1, 2, 3]) add(`egg/crack_${n}.png`, [32, 32], "crack", { n });
  for (const theme of HABITAT.themes) {
    for (const layer of HABITAT.layers) add(`habitat/${theme}/${layer}.png`, HABITAT.size, "layer", { theme, layer });
  }
  add("habitat/sun.png", [24, 24], "sun");
  add("habitat/moon.png", [24, 24], "moon");
  add("habitat/cloud_1.png", [48, 16], "cloud");
  add("habitat/cloud_2.png", [32, 12], "cloud");
  for (const id of ["star", "plus", "gem", "heart", "zzz", "note"]) add(`fx/${id}.png`, [8, 8], "particle", { id });
  for (const [id, frames, s] of [["sparkle", 4, 16], ["dust", 4, 16], ["burst_lucky", 6, 48], ["burst_jackpot", 8, 64], ["hatch", 8, 64], ["levelup", 8, 64]]) {
    const sheet = SHEET(frames, s, s);
    add(`fx/${id}.png`, [sheet.w, sheet.h], "sheet", { id, frames });
  }
  for (const id of ["xp", "coin", "streak", "freeze", "hint", "goal"]) add(`icon/${id}.png`, [16, 16], "icon", { id });
  for (const it of ITEMS) add(`item/${it.id}.png`, SLOTS[it.slot].size, "item", { id: it.id, slot: it.slot });
  for (const it of DECOR) add(`${it.id}.png`, [it.size, it.size], "decor", { id: it.id });
  return out;
}

export const FX_FRAMES = { sparkle: 4, dust: 4, burst_lucky: 6, burst_jackpot: 8, hatch: 8, levelup: 8 };
