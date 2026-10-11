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
  hat: { name: "Hats", size: [20, 14], anchor: [10, 13] },    // bottom-centre sits on the head's hat socket
  face: { name: "Face", size: [16, 8], anchor: [8, 4] },      // centred over the eyes
  neck: { name: "Neckwear", size: [16, 10], anchor: [8, 1] }, // hangs from the neck socket
  held: { name: "Held", size: [12, 12], anchor: [6, 11] },    // bottom-centre is the hand, in front of the body
  back: { name: "Back", size: [20, 20], anchor: [14, 19] },   // behind the body, resting on the back socket
  shirt: { name: "Shirts", size: [16, 16] },                  // a tiling pattern, cut to the torso's shape
};
// Where each body plan holds things: in front of the chest (or at the end of the arm), by body size.
export const HANDS = {
  blob: { s: [18, 12], m: [26, 18], l: [37, 27] },
  quad: { s: [18, 11], m: [26, 16], l: [38, 24] },
  floater: { s: [17, 11], m: [24, 16], l: [35, 24] },
  biped: { s: [15, 13], m: [21, 20], l: [30, 29] },
};
// Each entry: [id, name, price, extra]. `extra` may hold:
//   requires   tags the owner must have earned for it to appear in the shop
//   weight_by  traits or tags that make it appear more often
//   shift      [dx, dy] to move it from its socket on every body size (e.g. headphones sit lower than a hat)
//   offset     {s: [dx, dy], m: ..., l: ...} to nudge it on one body size
const WEARABLES = {
  hat: [
    ["cap", "Cap", 15], ["beanie", "Beanie", 15], ["straw", "Straw hat", 20], ["flower", "Flower crown", 25, { weight_by: { collector: 1.5 } }],
    ["bow", "Bow", 20], ["headphones", "Headphones", 30, { weight_by: { listener: 3 }, shift: [0, 7] }],
    ["wizard", "Wizard hat", 45, { requires: ["night_owl"] }], ["crown", "Crown", 80, { requires: ["streak_7"] }],
    ["top_hat", "Top hat", 35], ["party_hat", "Party hat", 15], ["beret", "Beret", 20, { weight_by: { reader: 1.5 } }], ["chef_hat", "Chef's hat", 25],
    ["cowboy", "Cowboy hat", 30], ["helmet", "Explorer helmet", 30, { weight_by: { curious: 2 } }], ["pirate", "Pirate hat", 40],
    ["graduation", "Graduation cap", 50, { weight_by: { reader: 2, collector: 2 } }], ["visor", "Sun visor", 15], ["propeller", "Propeller cap", 25, { weight_by: { curious: 2 } }],
    ["halo", "Halo", 60, { requires: ["flawless"] }], ["leaf_crown", "Leaf crown", 25], ["antlers", "Antlers", 35], ["tiara", "Tiara", 55],
    ["bucket_hat", "Bucket hat", 20], ["earmuffs", "Earmuffs", 20, { shift: [0, 7], weight_by: { listener: 1.5 } }], ["mushroom_cap", "Mushroom cap", 30],
    ["viking", "Viking helmet", 45, { requires: ["comeback"] }], ["astronaut", "Space helmet", 70, { weight_by: { curious: 2 }, shift: [0, 9] }],
    ["bunny_ears", "Bunny ears", 25], ["cat_ears", "Cat ears", 25], ["jester", "Jester hat", 35], ["night_cap", "Night cap", 20, { weight_by: { night_owl: 3 } }],
  ],
  face: [
    ["round_glasses", "Round glasses", 20, { weight_by: { reader: 3 } }], ["shades", "Shades", 25], ["monocle", "Monocle", 35, { weight_by: { reader: 1.5 } }],
    ["star_glasses", "Star glasses", 40, { weight_by: { curious: 2 } }], ["mask", "Mask", 30, { requires: ["night_owl"] }],
    ["heart_glasses", "Heart glasses", 30], ["goggles", "Goggles", 30, { weight_by: { curious: 2 } }], ["eye_patch", "Eye patch", 25],
    ["glasses_3d", "3D glasses", 25], ["reading_glasses", "Reading glasses", 20, { weight_by: { reader: 3 } }], ["snorkel", "Snorkel mask", 35],
    ["clown_nose", "Clown nose", 15], ["mustache", "Mustache", 20, { shift: [2, 5] }], ["blush", "Rosy cheeks", 10], ["sleep_mask", "Sleep mask", 20, { weight_by: { night_owl: 3 } }],
    ["pixel_shades", "Pixel shades", 45, { requires: ["flawless"] }], ["whiskers", "Whiskers", 15, { shift: [2, 4] }], ["bandage", "Bandage", 15, { requires: ["comeback"] }],
  ],
  neck: [
    ["scarf", "Scarf", 15], ["bowtie", "Bow tie", 20], ["bell", "Bell", 20], ["gold_chain", "Gold chain", 50, { weight_by: { collector: 2 } }],
    ["spiked_collar", "Spiked collar", 35, { requires: ["night_owl"] }], ["medal", "Medal", 60, { requires: ["streak_7"] }],
    ["necktie", "Necktie", 20], ["pearls", "Pearl necklace", 45], ["locket", "Locket", 35, { weight_by: { collector: 2 } }], ["lei", "Flower lei", 25],
    ["bandana", "Bandana", 15], ["ruff", "Ruff collar", 40, { weight_by: { reader: 2 } }], ["whistle", "Whistle", 20, { weight_by: { listener: 2 } }],
    ["key_necklace", "Key necklace", 30, { weight_by: { collector: 2 } }], ["shell_necklace", "Shell necklace", 25], ["feather_boa", "Feather boa", 40],
    ["ribbon", "Ribbon", 15], ["dog_tag", "Name tag", 20], ["amulet", "Amulet", 55, { requires: ["comeback"] }], ["compass", "Compass", 35, { weight_by: { curious: 2 } }],
  ],
  held: [
    ["book", "Book", 20, { weight_by: { reader: 3 } }], ["lantern", "Lantern", 25], ["flag", "Flag", 15], ["balloon", "Balloon", 15],
    ["microphone", "Microphone", 30, { weight_by: { listener: 3 } }], ["quill", "Quill", 30, { weight_by: { collector: 2 } }],
    ["umbrella", "Umbrella", 25], ["wooden_sword", "Wooden sword", 30, { requires: ["comeback"] }], ["wand", "Wand", 40, { requires: ["night_owl"] }],
    ["bouquet", "Bouquet", 20], ["ice_cream", "Ice cream", 15], ["coffee", "Coffee cup", 15, { weight_by: { early_bird: 3 } }], ["tea", "Tea cup", 15, { weight_by: { reader: 1.5 } }],
    ["pencil", "Pencil", 15, { weight_by: { collector: 2 } }], ["paintbrush", "Paintbrush", 20], ["fishing_rod", "Fishing rod", 30],
    ["magnifier", "Magnifying glass", 30, { weight_by: { curious: 3 } }], ["torch", "Torch", 25], ["kite", "Kite", 25], ["shield", "Shield", 40, { requires: ["flawless"] }],
    ["teddy", "Teddy", 30], ["trophy", "Trophy", 90, { requires: ["streak_7"] }],
  ],
  back: [
    ["cape_red", "Red cape", 40], ["cape_star", "Star cape", 60, { requires: ["night_owl"] }], ["backpack", "Backpack", 30, { weight_by: { curious: 2 } }],
    ["school_bag", "Satchel", 30, { weight_by: { reader: 2 } }], ["angel_wings", "Feather wings", 70, { requires: ["flawless"] }], ["bat_wings", "Bat wings", 55, { weight_by: { night_owl: 3 } }],
    ["butterfly_wings", "Butterfly wings", 55], ["jetpack", "Jetpack", 80, { weight_by: { curious: 2 } }], ["turtle_shell", "Turtle shell", 45],
    ["quiver", "Quiver", 35], ["balloons", "Bunch of balloons", 30], ["leaf_cloak", "Leaf cloak", 40],
  ],
  shirt: [
    ["striped", "Striped shirt", 20], ["plain", "Plain shirt", 15], ["dotted", "Dotted shirt", 20], ["checked", "Checked shirt", 25], ["star", "Star shirt", 30],
    ["hearts", "Hearts shirt", 25], ["zigzag", "Zigzag sweater", 25], ["floral", "Floral shirt", 30], ["galaxy", "Galaxy shirt", 45, { weight_by: { night_owl: 2, curious: 2 } }],
    ["argyle", "Argyle sweater", 35, { weight_by: { reader: 2 } }],
  ],
};
export const ITEMS = Object.entries(WEARABLES).flatMap(([slot, list]) =>
  list.map(([id, name, price, extra = {}]) => ({ id: `${slot}/${id}`, slot, name, price, ...extra })));
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

// ---------- special forms ----------
// On top of its adult form a creature can take a variant, earned in ways other than plain growth:
// by the company it keeps, by where and when its owner studies, or by a feat in battle. A variant
// changes colours and features of the same animal; it never adds power.
export const VARIANTS = {
  twin: { name: "Twin", how: "Raise it alongside a hatched creature of another element", blurb: "takes on its companion's colours" },
  nocturne: { name: "Nocturne", how: "Study after 10 at night", needs: "night_owl", blurb: "a night form with a moonlit glow" },
  champion: { name: "Champion", how: "Win a battle from the brink, or without a single wrong answer", needs: ["comeback", "flawless"], blurb: "crested and gold-marked" },
};

// ---------- battles ----------
// Battles are won by reviewing your own vocab, not by the size of your numbers: every creature
// fights at the same level whatever its age. What studying adds is choice: more creatures, more
// moves, more forms.
export const CYCLE = ["ember", "grove", "stone", "spark", "tide", "dusk"]; // each is strong against the next
export function matchup(attack, defend) {
  if (!attack || attack === defend) return 1;
  const i = CYCLE.indexOf(attack);
  const j = CYCLE.indexOf(defend);
  if (i < 0 || j < 0) return 1;
  return (i + 1) % CYCLE.length === j ? 1.25 : (j + 1) % CYCLE.length === i ? 0.8 : 1;
}
// Every body plan has the same total; they differ in where it sits.
export const BASE_STATS = {
  blob: { hp: 120, atk: 20, def: 21, spd: 16 },
  biped: { hp: 100, atk: 23, def: 18, spd: 20 },
  quad: { hp: 105, atk: 20, def: 23, spd: 17 },
  floater: { hp: 90, atk: 21, def: 18, spd: 24 },
};
const move = (id, name, kind, power, extra = {}) => ({ id, name, kind, power, ...extra });
export const MOVES = [
  move("tackle", "Tackle", "attack", 40, { from: "all" }),
  move("guard", "Guard", "guard", 50, { from: "all" }),
  // Two per element: the second is learned as a juvenile.
  move("cinder", "Cinder", "attack", 45, { element: "ember" }), move("wildfire", "Wildfire", "attack", 60, { element: "ember", stage: "juvenile" }),
  move("vine", "Vine Whip", "attack", 45, { element: "grove" }), move("overgrowth", "Overgrowth", "attack", 60, { element: "grove", stage: "juvenile" }),
  move("pebble", "Pebble Toss", "attack", 45, { element: "stone" }), move("rockslide", "Rockslide", "attack", 60, { element: "stone", stage: "juvenile" }),
  move("zap", "Zap", "attack", 45, { element: "spark" }), move("thunderclap", "Thunderclap", "attack", 60, { element: "spark", stage: "juvenile" }),
  move("splash", "Splash", "attack", 45, { element: "tide" }), move("riptide", "Riptide", "attack", 60, { element: "tide", stage: "juvenile" }),
  move("shade", "Shade", "attack", 45, { element: "dusk" }), move("nightfall", "Nightfall", "attack", 60, { element: "dusk", stage: "juvenile" }),
  // One per body plan, learned as a juvenile.
  move("bounce_back", "Bounce Back", "heal", 30, { species: "blob", stage: "juvenile" }),
  move("focus", "Focus", "boost", 30, { species: "biped", stage: "juvenile" }),
  move("charge", "Charge", "attack", 55, { species: "quad", stage: "juvenile" }),
  move("tailwind", "Tailwind", "boost", 30, { species: "floater", stage: "juvenile" }),
  // One per adult form.
  move("resonance", "Resonance", "attack", 68, { branch: "echo", own: true }),
  move("insight", "Insight", "boost", 40, { branch: "sage" }),
  move("hoard", "Hoard", "heal", 36, { branch: "keeper" }),
  // Earned by how you study or fight; any hatched creature can use them.
  move("night_strike", "Night Strike", "attack", 62, { element: "dusk", tag: "night_owl" }),
  move("dawn_ray", "Dawn Ray", "attack", 62, { element: "spark", tag: "early_bird" }),
  move("steady_heart", "Steady Heart", "heal", 34, { tag: "streak_7" }),
  move("second_wind", "Second Wind", "heal", 40, { tag: "comeback" }),
  move("perfect_form", "Perfect Form", "boost", 45, { tag: "flawless" }),
];
export const moveById = (id) => MOVES.find((m) => m.id === id) || MOVES[0];

// A different rule each week keeps any one team from being "the answer".
export const WEEKLY_RULES = [
  { id: "open", name: "Open week", text: "Any creatures, any moves." },
  { id: "starters", name: "Starters only", text: "Only hatchlings and juveniles may fight (adults sit this week out)." },
  { id: "no_heal", name: "No healing", text: "Healing moves are not allowed." },
  { id: "warm", name: "Ember, Spark and Stone", text: "Only Ember, Spark and Stone creatures.", types: ["ember", "spark", "stone"] },
  { id: "cool", name: "Tide, Grove and Dusk", text: "Only Tide, Grove and Dusk creatures.", types: ["tide", "grove", "dusk"] },
  { id: "solo", name: "One on one", text: "Teams of one." , team: 1 },
];
export const BATTLE_UNLOCK_WORDS = 100; // saved vocab words needed before battles open

// Weekly raid bosses: the things that get in a learner's way. A guild wears one down together.
export const BOSSES = [
  { id: "mumbler", name: "The Mumbler", text: "A fog of garbled speech." },
  { id: "blank_page", name: "The Blank Page", text: "It stares back at you." },
  { id: "static", name: "Static", text: "Noise where the words should be." },
  { id: "forgetting", name: "The Forgetting", text: "It fades whatever you don't revisit." },
];
export const RAID_HP_PER_MEMBER = 150; // right answers needed per guild member in a week
export const LEAGUES = ["Bronze", "Silver", "Gold", "Diamond"];

// Badges are permanent and completable: a record of what you have done, never taken away.
export const BADGES = [
  { id: "first_word", name: "First word", text: "Look up a word" },
  { id: "first_hatch", name: "First hatch", text: "Hatch an egg" },
  { id: "goal_10", name: "Ten goals", text: "Reach your daily goal 10 times" },
  { id: "streak_7", name: "One week", text: "A 7-day streak" },
  { id: "streak_30", name: "One month", text: "A 30-day streak" },
  { id: "streak_100", name: "Hundred days", text: "A 100-day streak" },
  { id: "words_100", name: "100 words", text: "Save 100 words" },
  { id: "words_1000", name: "1000 words", text: "Save 1000 words" },
  { id: "listener", name: "Listener", text: "Fill the listening habit" },
  { id: "reader", name: "Reader", text: "Fill the reading habit" },
  { id: "collector", name: "Collector", text: "Fill the collecting habit" },
  { id: "adult_echo", name: "Echo", text: "Raise an Echo adult" },
  { id: "adult_sage", name: "Sage", text: "Raise a Sage adult" },
  { id: "adult_keeper", name: "Keeper", text: "Raise a Keeper adult" },
  { id: "friend_battle", name: "Friendly rival", text: "Finish a battle with a friend" },
  { id: "raid_win", name: "Raid", text: "Help defeat a weekly boss" },
];

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
  for (const t of TYPE_IDS) {
    add(`battle/hit_${t}.png`, [160, 32], "sheet", { id: "hit", frames: 5 });
    add(`battle/shot_${t}.png`, [48, 16], "sheet", { id: "shot", frames: 3 });
  }
  for (const id of ["shield", "heal", "boost"]) add(`battle/${id}.png`, [288, 48], "sheet", { id, frames: 6 });
  add("battle/pad_player.png", [64, 16], "pad");
  add("battle/pad_rival.png", [64, 16], "pad");
  for (const id of ["move_attack", "move_guard", "move_boost", "move_heal", "stat_hp", "stat_atk", "stat_def", "stat_spd"]) add(`icon/${id}.png`, [16, 16], "icon", { id });
  for (const b of BADGES) add(`badge/${b.id}.png`, [24, 24], "badge", { id: b.id });
  for (const b of BOSSES) {
    add(`boss/${b.id}_idle.png`, [192, 96], "boss");
    add(`boss/${b.id}_hurt.png`, [96, 96], "boss");
    add(`boss/${b.id}_down.png`, [96, 96], "boss");
  }
  for (const l of LEAGUES) add(`icon/league_${l.toLowerCase()}.png`, [24, 24], "icon", { id: "league" });
  return out;
}

export const FX_FRAMES = { sparkle: 4, dust: 4, burst_lucky: 6, burst_jackpot: 8, hatch: 8, levelup: 8 };
