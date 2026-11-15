// A "Custom" choice at the end of a row of number chips (new words a day: 0 5 10 20 50; a card's time on its
// front or back): a tap turns it into a small number box, Enter (or leaving the box) uses the number typed,
// Esc puts the chip back. While the setting holds a number that isn't one of the chips, the chip shows that
// number and is the one lit. The owner asked for it ("Allow user to input custom number as well").
// Shared by the Vocab page's goal popup (review/goalbar.js) and the reviewer's settings (pages/review.js).

/** Whole number `n` kept between `min` and `max`, or null when it isn't a number at all. */
export function clampWhole(n, min, max) {
  const x = Math.round(Number(n));
  return Number.isFinite(x) && String(n).trim() !== "" ? Math.min(max, Math.max(min, x)) : null;
}

/**
 * Add the chip to `row` (a chips container). `choices`: the numbers already there; `get()` the setting now;
 * `set(n)` keeps a new one; `unit` goes after a number shown ("s"). Returns {paint()}, to light the right
 * chip again after the setting changed.
 */
export function customChip(row, { choices, min, max, unit = "", get, set }) {
  const chip = document.createElement("button");
  chip.type = "button";
  chip.className = "cust-chip";
  chip.title = `Type a number from ${min} to ${max}`;
  row.append(chip);
  const shown = (n) => (unit ? `${n} ${unit}` : String(n));
  function paint() {
    const v = get();
    const own = typeof v === "number" && !choices.includes(v);
    chip.textContent = own ? shown(v) : "Custom";
    chip.classList.toggle("on", own);
    chip.setAttribute("aria-pressed", String(own));
  }
  chip.onclick = (e) => {
    e.stopPropagation();
    const box = document.createElement("input");
    box.type = "number";
    box.className = "cust-input";
    box.min = String(min);
    box.max = String(max);
    box.step = "1";
    box.inputMode = "numeric";
    box.setAttribute("aria-label", `A number from ${min} to ${max}`);
    const v = get();
    box.value = typeof v === "number" ? String(v) : "";
    let done = false;
    const finish = (use) => {
      if (done) return;
      done = true;
      const n = use ? clampWhole(box.value, min, max) : null;
      box.replaceWith(chip);
      if (n !== null) set(n);
      paint();
    };
    box.addEventListener("keydown", (k) => {
      k.stopPropagation();  // (the reviewer's keys don't answer cards while a number is typed)
      if (k.key === "Enter") { k.preventDefault(); finish(true); }
      else if (k.key === "Escape") { k.preventDefault(); finish(false); }
    });
    box.addEventListener("blur", () => finish(true));
    box.addEventListener("click", (c) => c.stopPropagation());
    chip.replaceWith(box);
    box.focus();
    box.select();
  };
  paint();
  return { paint };
}
