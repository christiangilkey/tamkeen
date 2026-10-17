// The creature's whole habitat on a page of its own (#/habitat): the scene, level and XP, daily
// goal, every currency and the game's buttons. Home shows a compact card of it, which opens this.

import { h } from "../app.js";
import { gameOn } from "../components/gameswitch.js";
import { habitat } from "../game/habitat.js";

export function render(view) {
  if (!gameOn()) { location.hash = "#/"; return undefined; } // the game is switched off in Settings
  const page = h(`<div class="page habitat-page"><a class="back-link" href="#/">← Home</a></div>`);
  const hab = habitat();
  page.append(hab.el);
  view.append(page);
  return () => hab.dispose();
}
