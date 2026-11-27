// What else the Star Shrine's card says (prototype "farm", farm-ui.js openShrine): lines other parts of the game add about
// what stardust does for them. The talents work (talents.js) adds its own here: stardust raises the lowest talent new
// eggs can roll, and a release passes the best talent down. No imports: anything may add to it without a cycle.

/** Plain English lines (each translated where it is shown). */
export const SHRINE_LINES = [];

/** Add lines to the shrine's card (each once). */
export function addShrineLines(lines) {
  for (const line of lines || []) if (typeof line === "string" && line && !SHRINE_LINES.includes(line)) SHRINE_LINES.push(line);
}
