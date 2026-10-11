# Creature game: design checklist

Every requirement in the owner's five design documents, and where it stands. Re-read against the
documents on 2026-10-10. Update this file whenever a line changes; it is how nothing gets left out.

Owner's own rules, which override the documents where they differ:
- **Battles are reviews of each player's own vocab list.** Every move is powered by a question.
- **Battles need at least 100 saved words** (`BATTLE_UNLOCK_WORDS` in `web/js/game/data.js`).

Status: ✅ built · 🟡 partly · ⬜ not built

## 1. "Make XP fun"

| Requirement | Status | Where / note |
|---|---|---|
| Variable payouts: common 70% (5-15), lucky 20% (30-50), jackpot 8% (100-200), surprise 2% (item, no XP) | ✅ | `rules.rollReward`, tested for the odds |
| Surprise drops a usable item: streak freeze or hint card | ✅ | Freeze covers a missed day; a hint card removes two wrong answers in a battle question |
| Lucky has a minor cue; jackpot has screen shake or particle explosion | ✅ | `game.fountain`, `.fx-shake` |
| Word pops: shrinks on press, springs on release | ✅ | `.w:active` and `.fx-pop` |
| Particle fountain of stars, gems, plus signs floating up | ✅ | |
| XP counter rolls up with high ticking sound | ✅ | Habitat bar on Home; a chip in the corner while studying (`game.showChip`) |
| Sounds by tier: pop/clink, 3-note chime, arcade fanfare | ✅ | Synthesised in `game.sfx`, no audio files |
| Combo chain within 5 seconds, multipliers 1.2 / 1.5 / 2 | ✅ in battles · 🟡 lookups | Battles: answering right within 5 s (`battle.FAST_MS`). Word lookups use 30 s (`COMBO_WINDOW_MS`) because 5 s is too short to read a definition and would reward tapping without reading |
| UI lights up or catches fire during a combo | ✅ | The chip burns and shows the fuse; in battle a flame badge (`icon/combo.png`), then "SURGE" (`icon/surge.png`) with sparks |

## 2. "Evolution ideas"

| Requirement | Status | Where / note |
|---|---|---|
| Evolution is interactive, not a silent level-up or a menu chore | ✅ | A grown creature shimmers (`fx/ready.png`) and waits; tapping it opens the choice (`rules.evolve`). Pressing Evolve plays `fx/evolve.png`: light gathers on the old form and the new one appears in the burst |
| Party-dependent triggers (symbiosis) | ✅ | "Twin" form needs a hatched companion of another element and takes its colours |
| Environmental / physical action triggers | 🟡 | "Nocturne" form needs study after 10 pm. Nothing yet tied to the habitat itself or to phone motion |
| Battle milestones instead of grinding | ✅ | "Champion" form and two moves open by winning from the brink or with no wrong answers |
| Branching paths | ✅ | Three adult forms by habit (listening, reading, collecting), each open only with real use |
| Reversible paths; keep the middle stage's charm | ✅ | Evolving waits for the owner; any earlier look can be kept; unlocked forms switch freely (`rules.reshape`) |
| Traits carry over visibly (colours, pattern, anatomy) | ✅ | The body is rolled from the seed once; forms restyle the same animal (tested) |
| Earned real-time transformation in combat (Mega-style) | ✅ | "Surge": three fast right answers double the next move, with a visible charge |

## 3. "Procedural creature system"

| Requirement | Status | Where / note |
|---|---|---|
| Creature = seed + what changed (growth, traits, equipped, tags) | ✅ | `genome.newGenome`; tags are kept per player |
| Dedicated seeded generator per creature; same seed, same creature | ✅ | `genome.rng`, tested |
| Share or debug by seed | 🟡 | The seed is shown on each creature's card; no "enter a seed" screen |
| Modular parts on one rig with named sockets | ✅ | `data.SIZES`, `data.HEAD`, `render.composeCreature` |
| Glasses and hats snap to face and head sockets | ✅ | |
| Shirts on the torso (masked shared layer) | ✅ | `render.shirtedTorso`: the pattern is cut to the torso's shape |
| Chains and necklaces as an anchored physics chain | ⬜ | Neckwear is a static sprite (the document lists this last, as polish) |
| Held items in hand sockets | ✅ | One hand |
| Growth changes proportions: head slower than body, limbs lengthen | ✅ | One head size for life; three torso and limb sizes |
| Eyes shrink relative to the face | ✅ | A hatchling wears a larger pair (`creature/eyes_big/`, 20x10) on the same socket; juveniles and adults the 16x8 pair (`render.composeCreature`) |
| Items stay placed as the creature grows; optional per-stage offset | ✅ | Sockets, plus `offset: {s, m, l}` on any item |
| Actions push traits; milestones grant tags | ✅ | Traits: listener, reader, collector, curious. Tags: night_owl, early_bird, streak_7, flawless, comeback |
| Every cosmetic defined in data with `requires` and `weight_by` | ✅ | `data.ITEMS`, `data.DECOR` |
| Shop, rewards and offspring filtered by `requires`, weighted by traits and tags | ✅ shop, offspring · 🟡 rewards | `rules.shopStock`; new eggs lean toward the owner's habits (`rules.layEgg`). Surprise drops are not weighted |
| Traits nudge the procedural body | ✅ | Horns and back features that come with age |
| All content in data files; small generator | ✅ | `data.js` |

## 4. "Creature game design notes"

| Requirement | Status | Where / note |
|---|---|---|
| Studying earns breadth and identity, not battle power | ✅ | |
| Power: small growth, only against wild creatures and raids | ✅ wild · ⬜ raids, story | `rules.wildBonus` (up to +15%) |
| Battles between people at one level for everyone | ✅ | `battle.fighter`; friend battles in `battle-ui.startFriendBattle` |
| Breadth: new creatures, unlockable moves, evolution forms | ✅ | Roster of up to 12, 26 moves, 3 forms and 3 special forms |
| Identity: cosmetics, shop currency, habitat decorations | ✅ | |
| Biggest payout for the day's goal, the same whatever its size | ✅ | Daily goal of 5, 10 or 20 minutes |
| Steep diminishing returns | ✅ | Lookups, saves, reviews and battles all fade within a day |
| Bonuses for what is hard to fake: words maturing, retention over weeks, streaks | ✅ | A word becomes "well known" after weeks of right answers (+15 XP); 80% accuracy over a week of 30+ answers (+60 XP) |
| Streak freezes or rest days | ✅ | |
| Each player's own deck powers their battles; each tested at their own level | ✅ | Due words first (`rules.pickQuestion`) |
| Works across subjects | ✅ | Questions come from the player's own words in any language |
| Low stakes | ✅ | A wrong answer still lands a glancing hit (drawn as a pale slash, `battle/glance.png`) and shows the right answer |
| Skill rating separate from study level | ✅ rating · ⬜ matching | `state.rating`, changed by rental and friend battles only, shown beside each friend. You pick who to challenge; nothing matches you automatically |
| Draft or rental mode from a shared pool | ✅ | "Rental duel": the same six creatures for everyone each week |
| Rotating weekly rules | ✅ | `data.WEEKLY_RULES`; applied to both teams in friend battles |
| Asynchronous battles against a friend's defence team | ✅ | The friend's published team fights with its chosen moves and answers as accurately as its owner usually does (`game_profiles.form`) |
| Friend leagues ranked by % of personal daily goal | ✅ | `friends-game.js`; `rules.leaguePercent` |
| Shared weekly boss raids fed by everyone's reviews | ✅ | Per guild: right answers this week against 150 per member (`rules.raidDamage`, `claimRaid`) |
| Gifting and trading items or eggs | ✅ gifts · ⬜ trades | Items and unhatched eggs can be given (`gifts` table). No two-way trade screen |
| Rivalries: named rival, head-to-head record, rematch | 🟡 | Record shown beside each friend, and a Rematch button on results. No single "named rival" |
| Badges: permanent and completable | ✅ | 16 badges (`data.BADGES`) |
| Bar next to each name in the friends list: language, league icon, XP today, favourite creature | ✅ | `friend-bar.js`; pick the favourite with "Show to friends" on the Creatures page (`rules.setShowcase`). Database columns added by `supabase/v6-game-card.sql` (applied 2026-10-11). Not yet seen between two real accounts |
| Weekly leagues with promotion and demotion | ✅ | Bronze to Diamond: 5+ goal days in a week moves up, 0-1 moves down (`rules.rollLeague`) |
| Original creatures, nothing like Pokémon | ✅ | |

## 5. "Incremental games"

Built on 2026-10-11 as "the garden" (`web/js/game/idle.js` rules, `garden.js` screens).

| Requirement | Status | Where / note |
|---|---|---|
| Production against rising costs | ✅ | Six buildings on six plots make glow; each tier costs more than it adds, and a second of a kind costs 60% more (`idle.costOf`) |
| Prestige that feels like a reward | ✅ | Releasing a grown creature restarts the garden and gives stardust, +50% glow each, for good (`idle.release`) |
| It unfolds: the game keeps changing | ✅ | Plots and buildings open one at a time with study milestones (`data.PLOTS`, `STRUCTURES[].need`); the Star Loom and last plot only after a first release |
| Real decisions | ✅ | Each building does best for one study habit; six plots; grow what you have or build another |
| Active and idle both worthwhile; no 5-minute timers | ✅ | Up to eight hours of glow waits; reaching the day's goal speeds everything by half and sends two hours' worth at once |
| Automation is earned | ✅ | Glow collects itself after ten daily goals, never for payment (`idle.automated`) |
| A theme and an ending | 🟡 | The ending exists: "full bloom" when every plot holds a fully grown building. No story around it |
| Avoid: meaningless numbers, bloat, walls, bad UI | ✅ | Numbers stay in the hundreds and thousands; one prestige layer; a key can open a plot instead of waiting |
| No ads, no purchases | ✅ | Gems come only from badges, raid wins, rising a league and full bloom |

## Not from the documents, asked for by the owner

| Request | Status | Note |
|---|---|---|
| Uses for the delivered art: buildings and plot, food, potion, key, ticket, incubator, XP boost, gem, stardust, hearts, glow, release, egg | ✅ | Buildings and plots: the garden. Food raises a creature's hearts (favourite by element, three a day). Potion: half health once in a wild battle. Key: opens a plot early. Ticket: one more battle pays in full. Incubator: a spare egg grows at half speed. XP boost: double XP for 20 minutes. Gems and glow buy supplies; stardust is the release reward; the mystery egg is bought with gems |
| Over a hundred items to dress creatures | ✅ | 113 wearables in six slots plus 24 decorations (`data.WEARABLES`). All 113 wearables are hand-drawn in Aseprite (sources in `game/art-src/item/`), seen in the wardrobe and on a creature in the desktop preview on 2026-10-11 |
| Items sit well on creatures | ⏸ | Paused by the owner: the creatures are being redesigned. `tools/preview_items.py` draws every item on every body for when it resumes |
| Anki companion add-on (see when people review their cards) | 🟡 | On the `anki-companion` branch, not on main. Add-on in `web/anki-addon/`, receiver in `app/companion.py`, rewards in `rules.earnAnki`: clearing what is due = the day's goal; matured cards +15 XP (ten a day); volume barely pays. Tested with the add-on's own code against the running app, never inside real Anki. Desktop Anki only (no AnkiDroid, no iPhone). Not yet: a retention-over-weeks bonus from Anki, friends seeing each other's Anki activity |

## Art in use, and art still waiting

Wired in on 2026-10-11 (`game/ASSET_LIST.md` section 7 says file by file where each is used). Checked in the
desktop preview the same day: the habitat, the shop, the Creatures page and the reward fountain live; the
battle frames, digits, surge and combo flame on a mock-up of the battle screen, since a real battle needs
100 saved words.

- **In use:** every icon the interface used to write as an emoji or symbol; the four habitats (chosen with
  the chip under the scene, saved as `scene`); emotes above the creature; rain on some days; pixel bars,
  the name bubble, rarity frames in the shop, panels and buttons in battle, pixel damage numbers; the surge
  charge and the animated combo flame; pixel particles in the reward fountain; icons for tabs, forms,
  traits, stats, tags, the weekly rule, the raid and rivals.
- **Still waiting (the features do not exist):** the 18 structures and the empty plot, the food icons, and
  the potion, key, ticket, incubator, XP boost, gem, stardust, heart, glow and release icons. They belong
  to feeding, consumable items and the idle layer.
- **Still script-made, to be redrawn in Aseprite:** 20 icons (league, nav, release, rule, trait), the 26
  move icons, the 16 badges, the 15 interface pieces, and the decor, egg, effect, battle, boss, habitat and
  structure folders. Redrawing a file under the same name needs no change to the code.
