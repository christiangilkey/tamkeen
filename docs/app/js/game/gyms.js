// Gym leaders: ten rivals to beat in order, each harder than the last. Pure (no screen code).
//
// A leader is harder through how it plays, not only through bigger numbers. Each one has
//   brain    how the computer plays its creatures (livebattle.js brainOf): how quickly it reacts, how
//            often it dodges, aims ahead of a running target, picks its best move, weighs the element
//            chart, stands on helpful ground, interrupts a wind-up
//   form     how often its moves come off (as a rival's owner answers their own words)
//   quiz     the seconds the player has for each question in this gym (5 everywhere else)
//   scale    its creatures' health, attack and defence (1 = a fully grown creature of the player's)
//   team     one to three creatures, each a beast (beasts.js) with the moves it fights with
//   theme    the arena it is fought in (battlemap.js THEMES; null = any)
//   reward   coins and creature XP paid the first time it is beaten (later wins pay as any battle)
// Beating leader N opens leader N+1. Progress is `state.gyms` (rules.js), saved and synced with the game.
// The trials that show each is harder: tests/js/gyms.test.mjs and tools/game_sim/gym-trials.mjs.

import { BEASTS, TYPES } from "./data.js";
import { beastOf, newGenome } from "./genome.js";

/** A genome of this beast (the seed picks the beast, so search for one that gives it), grown this far, with these moves. */
export function leaderGenome(beast, growth, moves, salt = 0) {
  const kind = BEASTS.find((b) => b.id === beast);
  if (!kind) throw new Error(`no beast ${beast}`);
  for (let seed = 1000 + salt * 97; ; seed++) {
    const g = newGenome(seed, kind.type);
    if (beastOf(g).id !== beast) continue;
    g.growth = growth;
    g.loadout = moves.slice(0, 4);
    return g;
  }
}

const mon = (beast, growth, moves) => ({ beast, growth, moves });

export const LEADERS = [
  { id: "pip", name: "Pip", title: "Meadow Keeper", element: "grove", theme: "meadow",
    blurb: "A gentle first gym. Pip's one creature is slow to react and almost never dodges.",
    form: 0.45, quiz: 6, scale: 0.8,
    brain: { react: 0.6, dodge: 0.05, eager: 0.45, pick: 0.3, types: 0, ground: 0, lead: 0, interrupt: 0.1, heal: 0.2, extras: 0.04, fast: 0.15 },
    team: [mon("fawn", 0.3, ["tackle", "vine"])],
    reward: { coins: 15, xp: 50 } },
  { id: "marin", name: "Marin", title: "Tide Caller", element: "tide", theme: "shore",
    blurb: "Two creatures now. Marin guards now and then, but still aims where you were, not where you are going.",
    form: 0.5, quiz: 6, scale: 0.95,
    brain: { react: 0.52, dodge: 0.12, eager: 0.55, pick: 0.4, types: 0, ground: 0.2, lead: 0, interrupt: 0.2, heal: 0.3, extras: 0.06, fast: 0.2 },
    team: [mon("seal", 0.45, ["splash", "tackle", "guard"]), mon("axolotl", 0.45, ["splash", "tackle"])],
    reward: { coins: 20, xp: 75 } },
  { id: "tor", name: "Tor", title: "Stone Mason", element: "stone", theme: "ruins",
    blurb: "Tor's tough creatures like the cobbles of the ruins, and heal when they are hurt.",
    form: 0.55, quiz: 5.5, scale: 1,
    brain: { react: 0.45, dodge: 0.2, eager: 0.62, pick: 0.5, types: 0.3, ground: 0.5, lead: 0, interrupt: 0.3, heal: 0.45, extras: 0.08, fast: 0.25 },
    team: [mon("pebble", 0.75, ["pebble", "rockslide", "guard", "bounce_back"]), mon("rock_golem", 0.75, ["pebble", "rockslide", "focus"])],
    reward: { coins: 25, xp: 100 } },
  { id: "volta", name: "Volta", title: "Crystal Spark", element: "spark", theme: "cave",
    blurb: "Fast creatures in a crystal cave. Volta starts to aim a little ahead of you: keep changing direction.",
    form: 0.6, quiz: 5, scale: 0.88,
    brain: { react: 0.38, dodge: 0.32, eager: 0.7, pick: 0.6, types: 0.5, ground: 0.8, lead: 0.3, interrupt: 0.45, heal: 0.5, extras: 0.1, fast: 0.3 },
    team: [mon("firefly", 0.8, ["zap", "thunderclap", "quick_jab", "guard"]), mon("cat_ferret", 0.8, ["zap", "thunderclap", "charge", "haste"]),
      mon("griffin", 0.8, ["zap", "thunderclap", "charge", "guard"])],
    reward: { coins: 30, xp: 125 } },
  { id: "sola", name: "Sola", title: "Ember Warden", element: "ember", theme: "volcanic",
    blurb: "Three creatures and a volcano. Sola lays hot coals and fights from them, where Ember hits harder.",
    form: 0.66, quiz: 5, scale: 0.93,
    brain: { react: 0.32, dodge: 0.42, eager: 0.76, pick: 0.68, types: 0.65, ground: 1, lead: 0.45, interrupt: 0.55, heal: 0.6, extras: 0.13, fast: 0.35 },
    team: [mon("chick", 0.85, ["cinder", "wildfire", "focus", "scorch"]), mon("dragon_whelp", 0.85, ["cinder", "wildfire", "charge", "guard"]),
      mon("fluffball", 0.85, ["cinder", "quick_jab", "wildfire", "mend"])],
    reward: { coins: 40, xp: 150 } },
  { id: "umbra", name: "Umbra", title: "Night Walker", element: "dusk", theme: "night",
    blurb: "Umbra hides in the shadows, slows you down and cancels your big moves while they wind up.",
    form: 0.72, quiz: 5, scale: 0.88,
    brain: { react: 0.27, dodge: 0.52, eager: 0.82, pick: 0.75, types: 0.8, ground: 1.15, lead: 0.6, interrupt: 0.75, heal: 0.65, extras: 0.14, fast: 0.42 },
    team: [mon("winged_fox", 0.9, ["shade", "nightfall", "tailwind", "trip"]), mon("cat", 0.9, ["shade", "night_strike", "pounce", "startle"]),
      mon("moon_wolf", 0.9, ["nightfall", "shade", "charge", "iron_shell"])],
    reward: { coins: 50, xp: 200 } },
  { id: "rowan", name: "Rowan", title: "Old Grove", element: "grove", theme: "forest",
    blurb: "An old hand in a deep forest, with a stone creature to cover Grove's weak spots. Rowan picks the right move for each of yours.",
    form: 0.77, quiz: 4.5, scale: 0.92,
    brain: { react: 0.23, dodge: 0.6, eager: 0.86, pick: 0.82, types: 1, ground: 1.3, lead: 0.7, interrupt: 0.82, heal: 0.75, extras: 0.15, fast: 0.48 },
    team: [mon("forest_deer", 0.95, ["vine", "overgrowth", "charge", "bloom"]), mon("bunny", 0.95, ["vine", "overgrowth", "focus", "seeker"]),
      mon("treasure_golem", 0.95, ["rockslide", "pebble", "iron_shell", "bounce_back"])],
    reward: { coins: 60, xp: 250 } },
  { id: "hale", name: "Hale", title: "Frost Pair", element: "tide", theme: "snow",
    blurb: "Tide and Stone on the ice, where you slide and they don't care. Hale dodges most of what you throw.",
    form: 0.82, quiz: 4.5, scale: 0.97,
    brain: { react: 0.19, dodge: 0.7, eager: 0.9, pick: 0.88, types: 1, ground: 1.45, lead: 0.8, interrupt: 0.9, heal: 0.8, extras: 0.16, fast: 0.55 },
    team: [mon("jellyfish", 1, ["riptide", "splash", "tailwind", "mend"]), mon("rock_golem", 1, ["rockslide", "pebble", "meteor", "iron_shell"]),
      mon("seal", 1, ["riptide", "splash", "mudslide", "bounce_back"])],
    reward: { coins: 75, xp: 300 } },
  { id: "mirage", name: "Mirage", title: "Desert Storm", element: "spark", theme: "desert",
    blurb: "Spark and Ember with beams and meteors. Mirage reads where you are running and lands it there.",
    form: 0.87, quiz: 4, scale: 0.92,
    brain: { react: 0.15, dodge: 0.8, eager: 0.94, pick: 0.92, types: 1, ground: 1.55, lead: 0.9, interrupt: 0.95, heal: 0.85, extras: 0.17, fast: 0.62 },
    team: [mon("griffin", 1, ["thunderclap", "dawn_ray", "charge", "haste"]), mon("dragon_whelp", 1, ["wildfire", "cinder", "meteor", "startle"]),
      mon("cat_ferret", 1, ["thunderhead", "zap", "pounce", "war_cry"])],
    reward: { coins: 90, xp: 400 } },
  { id: "zenith", name: "Zenith", title: "Champion", element: null, theme: null,
    blurb: "The champion: three elements that cover each other, on any arena. Quick, sharp, and 3.5 seconds a question.",
    form: 0.93, quiz: 3.5, scale: 0.83,
    brain: { react: 0.11, dodge: 0.9, eager: 0.97, pick: 0.96, types: 1, ground: 1.7, lead: 1, interrupt: 1, heal: 0.9, extras: 0.18, fast: 0.7 },
    team: [mon("moon_wolf", 1, ["nightfall", "night_strike", "charge", "startle"]), mon("griffin", 1, ["thunderhead", "thunderclap", "charge", "iron_shell"]),
      mon("axolotl", 1, ["riptide", "splash", "charge", "mend"])],
    reward: { coins: 150, xp: 500 } },
];

export const GYM_COUNT = LEADERS.length;
export const leaderById = (id) => LEADERS.find((l) => l.id === id) || null;

/** The leader's team as genomes (for battle.js fighters(); the same every time). */
export const leaderTeam = (leader) => leader.team.map((m, i) => leaderGenome(m.beast, m.growth, m.moves, i));

/** How far the owner has got: {beaten, wins: {id: n}} (rules.normalize makes sure it is there). */
export const gymProgress = (state) => {
  const g = (state && state.gyms) || {};
  const beaten = Math.max(0, Math.min(GYM_COUNT, Math.floor(Number(g.beaten) || 0)));
  return { beaten, wins: g.wins && typeof g.wins === "object" ? g.wins : {} };
};

/** "beaten", "open" (the next to beat) or "locked". */
export function gymStatus(state, index) {
  const { beaten } = gymProgress(state);
  return index < beaten ? "beaten" : index === beaten ? "open" : "locked";
}

/** Everything newLiveBattle needs from a leader, besides the two teams and the arena. */
export const gymSetup = (leader) => ({ mode: "gym", foeForm: leader.form, brain: leader.brain, quizSeconds: leader.quiz,
  rival: { id: null, name: leader.name, gym: leader.id } });

/** The leader's element (its first creature's when it has none of its own: the champion). */
export const leaderElement = (leader) => (leader.element && TYPES[leader.element] ? leader.element : null);
