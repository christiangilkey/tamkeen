// Run with: node --test tests/js/
// The guild tavern (a prototype): who is inside, where they may stand, and that its art is all there.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { FIRE, FLAMES, PROPS, ROOM, SPOTS, TAVERN_MAX, castOf, nextSpot, pickGuild } from "../../web/js/game/tavernrules.js";
import { PROTOTYPES, feature } from "../../web/js/prototype.js";

const g = (seed) => ({ seed });
const sizeOf = (file) => { // a PNG's width and height, from its header
  const b = readFileSync(new URL(`../../web/game-art/tavern/${file}`, import.meta.url));
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
};

test("the tavern is a prototype: off unless released or prototype mode is on", () => {
  assert.equal(PROTOTYPES.guild_tavern.released, false);
  assert.equal(feature("guild_tavern"), false); // (no prototype mode outside a browser)
});

test("inside: me first, then whoever is online, then the most recently seen; members without a creature stay out", () => {
  const members = [
    { id: "a", username: "Zed" }, { id: "b", username: "Amy" }, { id: "me", username: "Me" },
    { id: "c", username: "Bo" }, { id: "d", username: "Cy" },
  ];
  const genomes = new Map([["a", g(1)], ["b", g(2)], ["me", g(3)], ["c", g(4)]]); // d has none
  const seen = new Map([["a", 30], ["b", 4000], ["c", 600]]);
  const cast = castOf(members, { meId: "me", genomes, seen });
  assert.deepEqual(cast.inside.map((m) => m.id), ["me", "a", "c", "b"]);
  assert.deepEqual(cast.inside.map((m) => m.online), [true, true, false, false]);
  assert.equal(cast.none, 1);
  assert.equal(cast.out, 0);
  assert.ok(cast.inside[0].me && !cast.inside[1].me);
});

test("a big guild: at most TAVERN_MAX inside, the rest counted as out", () => {
  const members = Array.from({ length: 12 }, (_, i) => ({ id: `m${i}`, username: `M${i}` }));
  const genomes = new Map(members.map((m, i) => [m.id, g(i)]));
  const cast = castOf(members, { meId: "m5", genomes });
  assert.equal(cast.inside.length, TAVERN_MAX);
  assert.equal(cast.out, 12 - TAVERN_MAX);
  assert.equal(cast.inside[0].id, "m5");
});

test("creatures go to free spots inside the room", () => {
  const taken = new Set([0, 1, 2]);
  const seq = [0, 0.5, 0.99];
  for (const u of seq) {
    const i = nextSpot(() => u, taken, 3);
    assert.ok(i !== null && !taken.has(i) && i !== 3);
  }
  assert.equal(nextSpot(() => 0.3, new Set(SPOTS.map((_, i) => i))), null);
  for (const s of SPOTS) assert.ok(s.x > 20 && s.x < ROOM.w - 20 && s.y >= 132 && s.y < ROOM.h, `${s.x},${s.y} is on the floor`);
});

test("the guild shown: the one remembered, else the first", () => {
  const guilds = [{ id: "x" }, { id: "y" }];
  assert.equal(pickGuild(guilds, "y").id, "y");
  assert.equal(pickGuild(guilds, "gone").id, "x");
  assert.equal(pickGuild([], "y"), null);
});

test("every piece of tavern art exists at the size the code expects", () => {
  assert.deepEqual(sizeOf("room.png"), [ROOM.w, ROOM.h]);
  assert.deepEqual(sizeOf("fire.png"), [FIRE.w * FIRE.frames, FIRE.h]);
  assert.deepEqual(sizeOf("flame.png"), [20, 7]);
  assert.deepEqual(sizeOf("table_round.png"), [44, 30]);
  assert.deepEqual(sizeOf("table_long.png"), [84, 30]);
  assert.deepEqual(sizeOf("stool.png"), [14, 14]);
  for (const p of PROPS) assert.ok(p.base > p.y && p.base <= ROOM.h, p.id);
  for (const f of FLAMES) assert.ok(f.x >= 0 && f.x + 5 <= ROOM.w && f.y >= 0);
});
