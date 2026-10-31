// Everything the creature game is made of, as data: body plans, parts, colours, sockets, and the
// list of art files. The renderer and the rules read this; new content is added here, not in code.
//
// Art lives in web/game-art/. Every file listed by artFiles() must exist. The creature parts are
// drawn by hand in Aseprite (sources in game/art-src/, rules in game/CREATURE_DESIGN.md); art is
// replaced file for file, same name and size. See game/ASSET_LIST.md for the artist's brief.

// ---------- colours ----------
// Parts are drawn in these exact "key" colours; the app swaps them for each creature's own.
export const KEY = {
  primary: ["#8fd3ff", "#4aa3e8", "#2f6fb8", "#1f4780"], // highlight, base, shade, and the body's outline
  secondary: ["#fff1c9", "#f5cf7a", "#d49a3f"],          // belly and markings
  accent: ["#ff7a9c", "#d6456e"],                        // tips, gems, type feature
  pattern: "#ff00ff",                                    // pattern tiles only
  outline: "#1b1420",                                    // never swapped: pupils, eyelids, mouths, noses
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
// limbs grow, so a hatchling is mostly head. Creatures stay young and cute: there is no adult size.
export const SIZES = {
  s: { torso: [20, 16], neck: [12, 3], tail: [2, 10], back: [8, 2], arm: [13, 9], legF: [13, 15], legB: [6, 15], leg: [6, 5], armSize: [5, 6], wing: [10, 8] },
  m: { torso: [28, 24], neck: [18, 4], tail: [2, 15], back: [11, 3], arm: [19, 13], legF: [19, 23], legB: [8, 23], leg: [6, 8], armSize: [6, 9], wing: [14, 12] },
};
export const HEAD = { size: [32, 28], neck: [13, 26], eye: [19, 14], mouth: [22, 21], earB: [8, 6], earF: [19, 5], horn: [14, 3], hat: [14, 4], face: [19, 14] };
export const PART = {
  eyes: { size: [16, 8], anchor: [8, 4] },
  eyesBig: { size: [20, 10], anchor: [10, 5] }, // hatchlings only: eyes shrink relative to the face as it grows
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

// Stages by growth (0..1). The egg hatches into the smallest body. Creatures never grow past
// juvenile (the owner's choice: they stay cute). At GROWN a creature is fully grown, which pays
// once (rules.FULLY_GROWN_COINS and a new egg) and lets it be released in the garden.
export const STAGES = [
  { id: "egg", from: 0 },
  { id: "hatchling", from: 0.04, size: "s" },
  { id: "juvenile", from: 0.3, size: "m" },
];
export const GROWN = 0.7;

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
  blob: { s: [18, 12], m: [26, 18] },
  quad: { s: [18, 11], m: [26, 16] },
  floater: { s: [17, 11], m: [24, 16] },
  biped: { s: [15, 13], m: [21, 20] },
};
// Each entry: [id, name, price, extra]. `extra` may hold:
//   requires   tags the owner must have earned for it to appear in the shop
//   weight_by  traits or tags that make it appear more often
//   shift      [dx, dy] to move it from its socket on every body size (e.g. headphones sit lower than a hat)
//   offset     {s: [dx, dy], m: [dx, dy]} to nudge it on one body size
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
  flawless: "Flawless: won a battle without one wrong answer",
  comeback: "Comeback: won a battle from the brink",
};

// ---------- special forms ----------
// A juvenile can take a variant, a special colouring earned in ways other than plain growth:
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
// moves, more looks.
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
// Battles happen on a small grid (battle.js): each side stands in its own 3x3 half, moves up to
// two squares a turn, and a timeline decides who acts next (faster creatures act more often).
// Every move has a style, which says what it is for, and an aim, which says where it lands:
//   line    the attacker's row, all the way across     (dodge: change row)
//   column  one column of the other half, every row; from your back column it reaches their back column
//   burst   the front two columns, the attacker's row and the rows either side (dodge: the back column)
//   homing  always finds its target, but hits softer
//   self    the user itself (guards, power-ups, heals)
// `wait` makes the user's next turn come sooner (<1) or later; `cast` is a charge's wind-up, in
// turns; `delay` pushes the target's next turn back, in turns; `price` means it is bought in the
// shop with coins, once, for all of the owner's creatures.
export const MOVE_STYLES = {
  strike: { name: "Strike", text: "Plain damage." },
  quick: { name: "Quick", text: "Weaker, but your next turn comes sooner." },
  guard: { name: "Guard", text: "Blocks part of the next hit." },
  power: { name: "Power-up", text: "Makes your next attacks stronger, or your turns faster." },
  heal: { name: "Heal", text: "Health back (twice a battle)." },
  delay: { name: "Delay", text: "Pushes the other creature's next turn back." },
  interrupt: { name: "Interrupt", text: "Cancels a move that is winding up." },
  charge: { name: "Charge", text: "Huge damage after a wind-up. It aims where you stand when you start, and a hit can cancel it." },
  terrain: { name: "Terrain", text: "Changes the squares of the battlefield." },
};
export const AIMS = {
  line: { name: "Straight line", text: "Your row, all the way across" },
  column: { name: "Column", text: "One column of their side: from your back column, their back column" },
  burst: { name: "Burst", text: "The front two columns of their side, in your row and the rows next to it" },
  homing: { name: "Homing", text: "Always hits" },
  self: { name: "Itself", text: "It works on the creature using it" },
};
/** Where a move lands, for showing: its aim, or for a move that changes the squares, the squares it changes. */
export const aimOf = (m) => (m.kind === "terrain" ? { self: "self", foe: "homing", row: "line" }[m.where] : m.aim);
// Squares with something on them. Each battle lays a few on one side and the same, mirrored, on the other.
export const TERRAIN = {
  grass: { name: "Tall grass", text: "Defence +25% while standing here." },
  high: { name: "High ground", text: "Attacks made from here hit 20% harder." },
  puddle: { name: "Puddle", text: "Slows you down: your turns come later." },
  coals: { name: "Hot coals", text: "Burns a little each turn, but Ember creatures love it: their attacks are stronger here." },
  spring: { name: "Spring", text: "Heals a little each turn." },
};
const KIND = { strike: "attack", quick: "attack", delay: "attack", interrupt: "attack", charge: "attack", guard: "guard", power: "boost", heal: "heal", terrain: "terrain" };
const move = (id, name, style, power, extra = {}) => ({ id, name, style, kind: KIND[style], power, aim: KIND[style] === "attack" ? "line" : "self", ...extra });
// Moves without art of their own show their style's icon (`icon`).
const ICON = { attack: "move_attack", guard: "move_guard", boost: "move_boost", heal: "move_heal", terrain: "move_boost" };
const shop = (id, name, style, power, price, extra = {}) => { const m = move(id, name, style, power, { price, ...extra }); return { icon: ICON[m.kind], ...m }; };
export const MOVES = [
  move("tackle", "Tackle", "strike", 40, { from: "all" }),
  move("guard", "Guard", "guard", 50, { from: "all" }),
  // Two per element: the second is learned as a juvenile, and hits a wider area a little softer.
  move("cinder", "Cinder", "strike", 45, { element: "ember" }), move("wildfire", "Wildfire", "strike", 55, { element: "ember", stage: "juvenile", aim: "burst" }),
  move("vine", "Vine Whip", "strike", 45, { element: "grove" }), move("overgrowth", "Overgrowth", "strike", 55, { element: "grove", stage: "juvenile", aim: "burst" }),
  move("pebble", "Pebble Toss", "strike", 45, { element: "stone" }), move("rockslide", "Rockslide", "strike", 55, { element: "stone", stage: "juvenile", aim: "column" }),
  move("zap", "Zap", "strike", 45, { element: "spark" }), move("thunderclap", "Thunderclap", "strike", 55, { element: "spark", stage: "juvenile", aim: "column" }),
  move("splash", "Splash", "strike", 45, { element: "tide" }), move("riptide", "Riptide", "strike", 55, { element: "tide", stage: "juvenile", aim: "burst" }),
  move("shade", "Shade", "strike", 45, { element: "dusk" }), move("nightfall", "Nightfall", "strike", 55, { element: "dusk", stage: "juvenile", aim: "column" }),
  // One per body plan, learned as a juvenile.
  move("bounce_back", "Bounce Back", "heal", 30, { species: "blob", stage: "juvenile" }),
  move("focus", "Focus", "power", 30, { species: "biped", stage: "juvenile" }),
  move("charge", "Charge", "charge", 80, { species: "quad", stage: "juvenile", cast: 0.6 }),
  move("tailwind", "Tailwind", "power", 30, { species: "floater", stage: "juvenile", buff: "spd" }),
  // Earned by how you study or fight; any hatched creature can use them.
  move("night_strike", "Night Strike", "strike", 62, { element: "dusk", tag: "night_owl", aim: "column" }),
  move("dawn_ray", "Dawn Ray", "strike", 62, { element: "spark", tag: "early_bird" }),
  move("steady_heart", "Steady Heart", "heal", 34, { tag: "streak_7" }),
  move("second_wind", "Second Wind", "heal", 40, { tag: "comeback" }),
  move("perfect_form", "Perfect Form", "power", 45, { tag: "flawless" }),
  // Bought in the shop with coins (`price`), once for all of the owner's creatures. The first three
  // came with the old adult forms; a creature that had one gave its move to its owner for free.
  { ...move("resonance", "Resonance", "strike", 60, { price: 90, own: true, aim: "burst" }) },
  { ...move("insight", "Insight", "power", 40, { price: 60 }) },
  { ...move("hoard", "Hoard", "heal", 36, { price: 60 }) },
  shop("quick_jab", "Quick Jab", "quick", 28, 40, { wait: 0.5 }),
  shop("pounce", "Pounce", "quick", 34, 55, { wait: 0.6, aim: "column" }),
  shop("seeker", "Seeker", "strike", 32, 60, { aim: "homing" }),
  shop("iron_shell", "Iron Shell", "guard", 75, 60),
  shop("war_cry", "War Cry", "power", 45, 70),
  shop("haste", "Haste", "power", 35, 70, { buff: "spd" }),
  shop("mend", "Mend", "heal", 40, 55),
  shop("trip", "Trip", "delay", 20, 75, { delay: 0.5 }),
  shop("startle", "Startle", "interrupt", 18, 85, { aim: "homing", delay: 0.25 }),
  shop("thunderhead", "Thunderhead", "charge", 100, 110, { cast: 0.8 }),
  shop("meteor", "Meteor", "charge", 115, 130, { cast: 1.2, aim: "burst" }),
  shop("bloom", "Bloom", "terrain", 0, 65, { terrain: "spring", where: "self" }),
  shop("scorch", "Scorch", "terrain", 0, 75, { terrain: "coals", where: "foe" }),
  shop("mudslide", "Mudslide", "terrain", 0, 80, { terrain: "puddle", where: "row" }),
];
export const moveById = (id) => MOVES.find((m) => m.id === id) || MOVES[0];
/** The art file of a move's icon (moves bought in the shop may use their style's icon). */
export const moveIcon = (m) => (m.icon ? `icon/${m.icon}` : `icon/move/${m.id}`);
export const SHOP_MOVES = MOVES.filter((m) => m.price);

// A different rule each week keeps any one team from being "the answer".
export const WEEKLY_RULES = [
  { id: "open", name: "Open week", text: "Any creatures, any moves." },
  { id: "basic", name: "Basic moves only", text: "Moves bought in the shop sit this week out.", icon: "starters" },
  { id: "no_heal", name: "No healing", text: "Healing moves are not allowed." },
  { id: "warm", name: "Ember, Spark and Stone", text: "Only Ember, Spark and Stone creatures.", types: ["ember", "spark", "stone"] },
  { id: "cool", name: "Tide, Grove and Dusk", text: "Only Tide, Grove and Dusk creatures.", types: ["tide", "grove", "dusk"] },
  { id: "solo", name: "One on one", text: "Teams of one." , team: 1 },
];
export const BATTLE_UNLOCK_WORDS = 100; // saved vocab words needed before battles open

// ---------- the garden ----------
// Buildings that make glow (rules in idle.js). `rate` is glow an hour at tier 1, `cost` the glow to
// build it; `trait` is the study habit it does best for; `need` is what must be done before it
// can be built. Art: structure/<id>_<tier 1-3>.png, and structure/plot.png for an empty plot.
export const STRUCTURES = [
  { id: "word_sprout", name: "Word Sprout", rate: 12, cost: 40, trait: "curious", text: "A plant that grows glowing letters. Does best for the curious: looking words up." },
  { id: "echo_shell", name: "Echo Shell", rate: 20, cost: 150, trait: "listener", text: "A shell that hums with what it has heard. Does best for listeners.",
    need: { stat: "goals", n: 2, text: "Reach your daily goal twice" } },
  { id: "page_lantern", name: "Page Lantern", rate: 20, cost: 150, trait: "reader", text: "A lantern folded from pages. Does best for readers.",
    need: { stat: "lookups", n: 30, text: "Look up 30 words" } },
  { id: "ink_well", name: "Ink Well", rate: 34, cost: 500, trait: "collector", text: "A small well of ink. Does best for collectors of words.",
    need: { stat: "words", n: 50, text: "Save 50 words" } },
  { id: "memory_stone", name: "Memory Stone", rate: 55, cost: 1600, trait: "collector", text: "A carved stone that keeps what you know. Does best for collectors.",
    need: { mature: 5, text: "Know 5 words well (through battles)" } },
  { id: "star_loom", name: "Star Loom", rate: 90, cost: 5000, trait: null, text: "A loom that weaves starlight. Steady for everyone.",
    need: { stardust: 1, text: "Release a grown creature once" } },
];
export const TIER_RATE = [0, 1, 2.5, 6];   // how much more a building makes at each tier
export const TIER_COST = [0, 1, 5, 22];    // how much more each tier costs (tier 1 is building it)
// Six plots across the habitat. `x` is where each stands in the scene; `need` opens it (or a key does).
export const PLOTS = [
  { x: 28, need: { hatched: true, text: "Hatch your first creature" } },
  { x: 292, need: { stat: "goals", n: 3, text: "Reach your daily goal 3 times" } },
  { x: 80, need: { stat: "words", n: 30, text: "Save 30 words" } },
  { x: 240, need: { streak: 5, text: "Keep a 5-day streak" } },
  { x: 132, need: { mature: 10, text: "Know 10 words well (through battles)" } },
  { x: 188, need: { stardust: 1, text: "Release a grown creature once" } },
];
// Food is bought with glow and raises a creature's hearts; each element has a favourite.
export const FOODS = [
  { id: "food_berry", name: "Berry", glow: 30, loves: "ember" }, { id: "food_fish", name: "Fish", glow: 30, loves: "tide" },
  { id: "food_leaf", name: "Leaf", glow: 30, loves: "grove" }, { id: "food_spark", name: "Spark candy", glow: 30, loves: "spark" },
  { id: "food_crystal", name: "Rock sugar", glow: 30, loves: "stone" }, { id: "food_cake", name: "Moon cake", glow: 30, loves: "dusk" },
];
// Supplies are bought with glow or with gems (gems come only from badges, raids, league rises and full bloom).
export const SUPPLIES = [
  { id: "potion", name: "Potion", glow: 150, text: "In a wild battle, restores half of a creature's health once." },
  { id: "xp_boost", name: "XP boost", gems: 2, text: "Doubles XP from looking up, saving and reviewing words for 20 minutes." },
  { id: "ticket", name: "Battle ticket", gems: 2, text: "One more battle today pays in full, after the first three." },
  { id: "incubator", name: "Incubator", gems: 4, text: "Warms an egg so it grows alongside the creature in your habitat." },
  { id: "key", name: "Plot key", gems: 5, text: "Opens the next building plot without waiting for its milestone." },
  { id: "egg", name: "Mystery egg", gems: 6, icon: "egg_mystery", text: "A new egg for your roster. Its element leans toward how you study." },
];

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
  { id: "grown", name: "Fully grown", text: "Raise a creature until it is fully grown", art: "adult_sage" },
  { id: "friend_battle", name: "Friendly rival", text: "Finish a battle with a friend" },
  { id: "raid_win", name: "Raid", text: "Help defeat a weekly boss" },
];

// ---------- habitat ----------
export const HABITAT = { size: [320, 144], ground: 124, themes: ["meadow", "oasis", "forest", "shore"], layers: ["sky", "far", "mid", "ground"] };
// What each habitat is called where the owner picks one.
export const SCENES = { meadow: "City park", oasis: "Oasis", forest: "Night woods", shore: "Shore" };
// The little speech bubbles a creature shows above its head (fx/emote_<id>.png, 12x12).
export const EMOTES = ["love", "hungry", "sleepy", "music", "question", "exclaim", "sweat", "idea"];

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
  for (const b of BADGES) add(`badge/${b.art || b.id}.png`, [24, 24], "badge", { id: b.id });
  for (const b of BOSSES) {
    add(`boss/${b.id}_idle.png`, [192, 96], "boss");
    add(`boss/${b.id}_hurt.png`, [96, 96], "boss");
    add(`boss/${b.id}_down.png`, [96, 96], "boss");
  }
  for (const l of LEAGUES) add(`icon/league_${l.toLowerCase()}.png`, [24, 24], "icon", { id: "league" });
  // Art added after the first brief (game/ASSET_LIST.md section 7). Its `kind` is "extra": real art only,
  // the placeholder generator leaves it alone.
  const extra = (file, size) => add(file, size, "extra");
  for (const s of EYES) for (const x of EXPRESSIONS) extra(`creature/eyes_big/${s}_${x}.png`, PART.eyesBig.size);
  for (const m of MOVES) if (!m.icon) extra(`icon/move/${m.id}.png`, [16, 16]);
  for (const id of ["night_owl", "early_bird", "streak_7", "flawless", "comeback"]) extra(`icon/tag_${id}.png`, [16, 16]);
  for (const id of Object.keys(VARIANTS)) extra(`icon/form_${id}.png`, [16, 16]);
  for (const id of TRAITS) extra(`icon/trait_${id}.png`, [16, 16]);
  for (const r of WEEKLY_RULES) extra(`icon/rule_${r.icon || r.id}.png`, [16, 16]);
  for (const id of ["shop", "wardrobe", "roster", "badges", "habitat"]) extra(`icon/nav_${id}.png`, [16, 16]);
  for (const id of ["close", "star", "badge", "trophy", "battle", "edit", "evolve", "combo", "surge", "rating", "egg",
    "glow", "release", "trade", "rival", "defence", "raid", "clock"]) extra(`icon/${id}.png`, [16, 16]);
  extra("ui/pip_on.png", [8, 8]);
  extra("ui/pip_off.png", [8, 8]);
  extra("ui/slot_empty.png", [24, 24]);
  extra("structure/plot.png", [32, 32]);
  for (const s of STRUCTURES) for (const tier of [1, 2, 3]) extra(`structure/${s.id}_${tier}.png`, tier === 3 ? [48, 48] : [32, 32]);
  for (const f of FOODS) extra(`icon/${f.id}.png`, [16, 16]);
  for (const id of ["potion", "key", "ticket", "incubator", "xp_boost", "gem", "stardust", "heart_full", "heart_empty"]) extra(`icon/${id}.png`, [16, 16]);
  for (const [id, s] of [["evolve", 64], ["ready", 32]]) extra(`fx/${id}.png`, [s * FX_FRAMES[id], s]);
  for (const id of ["faint", "glance"]) extra(`battle/${id}.png`, [32 * BATTLE_FRAMES[id], 32]);
  for (const [id, n, s] of [["surge", 6, 48], ["combo_fire", 4, 16]]) extra(`fx/${id}.png`, [s * n, s]);
  extra("fx/question.png", [8, 8]);
  extra("fx/spark.png", [8, 8]);
  for (const size of Object.keys(SHADOW)) extra(`fx/shadow_${size}.png`, SHADOW[size]);
  extra("habitat/rain.png", [32, 32]);
  for (const id of EMOTES) extra(`fx/emote_${id}.png`, [12, 12]);
  for (const id of ["gift", "check", "lock", "egg_mystery", "arrow"]) extra(`icon/${id}.png`, [16, 16]);
  for (const id of ["panel", "panel_dark", "bubble", "button", "button_pressed", "button_disabled", "rarity_common", "rarity_lucky", "rarity_jackpot"]) extra(`ui/${id}.png`, [24, 24]);
  extra("ui/bar_frame.png", [48, 8]);
  extra("ui/bar_fill.png", [4, 4]);
  extra("ui/digits.png", [160, 10]);
  return out;
}

// Frames in each effect strip. FX_FRAMES are the files in fx/ that the habitat plays; BATTLE_FRAMES are in battle/.
export const FX_FRAMES = { sparkle: 4, dust: 4, burst_lucky: 6, burst_jackpot: 8, hatch: 8, levelup: 8, evolve: 8, ready: 4 };
export const BATTLE_FRAMES = { hit: 5, shot: 3, shield: 6, heal: 6, boost: 6, faint: 5, glance: 4 };
// The shadow under a creature, by body size: fx/shadow_<size>.png.
export const SHADOW = { s: [16, 4], m: [24, 5] };
