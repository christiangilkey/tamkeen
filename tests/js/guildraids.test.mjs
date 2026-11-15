// Friends → Guilds shows each guild's raid under the list, the same block as on Home (web/js/pages/friends.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("the Guilds tab draws the guild raids with Home's raid block, only with the game on and a guild", () => {
  const friends = readFileSync(new URL("../../web/js/pages/friends.js", import.meta.url), "utf8");
  assert.match(friends, /import \{[^}]*\bhomeRaids\b[^}]*\} from "\.\.\/game\/friends-game\.js"/);
  assert.match(friends, /if \(gameOn\(\) && gs\.guilds\.length\) \{[\s\S]{0,200}homeRaids\(raids\)/);
  const game = readFileSync(new URL("../../web/js/game/friends-game.js", import.meta.url), "utf8");
  assert.match(game, /export async function homeRaids\(host\)/);
});
