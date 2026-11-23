// The phones and the web app: the older versions Google Drive keeps of the synced library (library.json.gz), for
// "Find an older game" (web/js/game/oldgames-ui.js). The same answers as the desktop's GET /api/sync/game-versions
// (app/sync/__init__.py). Only the game is taken from an old version: its words and library are never read into
// the app. `drive` and `gunzip` are passed in, so the tests can fake them.

const LIBRARY = "library.json.gz";
let fileId = "";

/** {signed_in, versions: [{id, at (seconds), size}]}, as Drive lists them. */
export async function listVersions(drive, signedIn) {
  if (!signedIn) return { signed_in: false, versions: [] };
  const file = (await drive.list()).find((f) => f.name === LIBRARY);
  fileId = file ? file.id : "";
  if (!file) return { signed_in: true, versions: [] };
  const revs = await drive.revisions(file.id);
  return {
    signed_in: true,
    versions: revs.map((r) => ({ id: String(r.id), at: Date.parse(r.modifiedTime) / 1000 || 0, size: Number(r.size) || 0 })),
  };
}

/** {id, game}: the game kept in version `rev` (null when that version has none). */
export async function loadVersion(drive, gunzip, rev) {
  if (!/^[\w.~-]{1,200}$/.test(rev)) throw new Error("That isn't a version of your game.");
  if (!fileId) await listVersions(drive, true);
  if (!fileId) throw new Error("Your game isn't in Google Drive yet.");
  const data = await gunzip(await drive.downloadRevision(fileId, rev));
  const game = data && typeof data === "object" && data.game && typeof data.game === "object" ? data.game : null;
  return { id: rev, game };
}
