// "Back to the start of the sentence" (the player's and the Netflix extension's ⏮ button).
//
// Goes to the start of the line being heard. Pressed again within a moment of that start, it goes
// to the line before, like a music player's "previous" button, so repeated presses walk back.

/** Seconds after a line's start within which the button goes to the line before instead. */
export const AGAIN_WITHIN = 1;

/**
 * @param {ArrayLike<number>} starts the lines' start times, in seconds, in order
 * @param {number} t the time now, in seconds
 * @returns {number} the time to go to
 */
export function sentenceStart(starts, t) {
  let lo = 0, hi = starts.length - 1, hit = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (starts[mid] <= t + 0.05) { hit = mid; lo = mid + 1; } else hi = mid - 1;
  }
  if (hit < 0) return 0;
  if (t - starts[hit] < AGAIN_WITHIN && hit > 0) return starts[hit - 1];
  return starts[hit];
}
