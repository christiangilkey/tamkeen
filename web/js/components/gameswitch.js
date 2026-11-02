// The "Game features" switch in Settings (desktop and phone). Off: no creature on Home, no XP or
// rewards, no chimes, no game badges next to friends' names. Goals and progress bars stay. The
// creature and its progress are kept, so switching back on carries on where it was.

import { h, saveSettings, state } from "../app.js";

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
  const sound = box.querySelector(".game-sound");
  sound.disabled = !gameOn();
  box.querySelector(".game-on").onchange = (e) => { sound.disabled = !e.target.checked; saveSettings({ game_enabled: e.target.checked }); };
  sound.onchange = (e) => saveSettings({ game_sound: e.target.checked });
}
