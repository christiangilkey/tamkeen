// The "Game features" switch in Settings (desktop and phone). Off: no creature on Home, no XP or
// rewards, no chimes, no game badges next to friends' names. Goals and progress bars stay. The
// creature and its progress are kept, so switching back on carries on where it was.

import { h, saveSettings, state } from "../app.js";
import { feature } from "../prototype.js";

/** Whether the game is on (the setting `game_enabled`; on unless switched off). */
export function gameOn() {
  const s = state.status && state.status.settings;
  return !(s && s.game_enabled === false);
}

/** Whether the game's sound effects play (the setting `game_sound`; on unless switched off). */
export function soundOn() {
  const s = state.status && state.status.settings;
  return !(s && s.game_sound === false);
}

/** Fill `box` (a Settings card) with the switches: the game, and its sound effects (game/game.js sfx,
 * the review cards' chimes in pages/review.js), which only matter while the game is on. */
export function gameSwitch(box) {
  box.append(h(`<div class="stack">
    <h2>Game features</h2>
    <label class="check"><input type="checkbox" class="game-on" ${gameOn() ? "checked" : ""}>
      <span>The creature, XP and rewards, and the chimes when you study</span></label>
    <div class="small muted">Off: studying works the same, without any of the game. Your goals and progress bars stay,
      and so does your creature, for if you switch it back on.</div>
    <div class="stack" data-find="sound">
      <label class="check"><input type="checkbox" class="game-sound" ${soundOn() ? "checked" : ""}>
        <span>Sound effects</span></label>
      <div class="small muted">The chimes and jingles for answers, rewards and battles. Off: everything works the same, silently.</div>
    </div>
  </div>`));
  // Lost progress (a garden reset, gym leaders unbeaten again, before the sync combined copies): bring back an
  // older copy from Google Drive (game/oldgames-ui.js; a prototype until the owner releases it).
  if (feature("old_games")) {
    const older = h(`<div class="stack">
      <div><button type="button" class="og-open">Find an older game</button></div>
      <div class="small muted">Garden or gym leaders gone? Google Drive keeps older copies of your game for about 30 days: bring one back without losing anything you've earned since.</div>
    </div>`);
    older.querySelector(".og-open").onclick = () => import("../game/oldgames-ui.js").then((m) => m.openOldGames());
    box.firstElementChild.append(older);
  }
  // The ranked champion in the championship hall (game/champion-ui.js; a prototype until the owner releases it): whether
  // the hall may show my team if I'm the best ranked player (the setting `ranked_show_team`, on unless switched off).
  if (feature("ranked_champion")) {
    const s = state.status && state.status.settings;
    const champ = h(`<div class="stack">
      <label class="check"><input type="checkbox" class="rk-show-team" ${s && s.ranked_show_team === false ? "" : "checked"}>
        <span>Show my team if I'm the ranked champion</span></label>
      <div class="small muted">The best ranked player stands in the championship hall for everyone to see: their username, rating and the team they battle with. Off: only your username and rating.</div>
    </div>`);
    champ.querySelector(".rk-show-team").onchange = (e) => {
      saveSettings({ ranked_show_team: e.target.checked });
      import("../game/champion-ui.js").then((m) => m.sendShowTeam(e.target.checked)).catch(() => {});
    };
    box.firstElementChild.append(champ);
  }
  const sound = box.querySelector(".game-sound");
  sound.disabled = !gameOn();
  box.querySelector(".game-on").onchange = (e) => { sound.disabled = !e.target.checked; saveSettings({ game_enabled: e.target.checked }); };
  sound.onchange = (e) => saveSettings({ game_sound: e.target.checked });
}
