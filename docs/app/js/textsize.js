// The text size of imported pages and books (the setting `page_font_size`, changed with A− / A+ in
// the readers and the slider in Settings). It is a scale on the standard sizes in app.css (19 px on
// a phone, 21 px on a computer for Latin letters, a little larger for Arabic, Persian, Thai, Hindi),
// stored as a number where 17 means "the standard size" (17 was the old default, in pixels).
// Shared by the desktop app, the phones and the web app; no screen code beyond setting a variable.

export const PAGE_SIZE_DEFAULT = 17;
export const PAGE_SIZE_MIN = 13;
export const PAGE_SIZE_MAX = 24;
// Up to 40 could be chosen before (in pixels): anything past this is from then, and far too big.
const ABSURD = 26;

/** A stored value that should go back to the standard size (once: the new limits can't reach it). */
export const isAbsurdPageSize = (v) => Number.isFinite(Number(v)) && Number(v) > ABSURD;

/** The size to use for a stored value: within the limits, the standard one when unset or absurd. */
export function pageSize(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0 || n > ABSURD) return PAGE_SIZE_DEFAULT;
  return Math.max(PAGE_SIZE_MIN, Math.min(PAGE_SIZE_MAX, Math.round(n)));
}

/** How much larger or smaller than the standard size: 1 for the standard. */
export const pageScale = (v) => pageSize(v) / PAGE_SIZE_DEFAULT;

/** As a percentage, for Settings ("100%"). */
export const pageSizeLabel = (v) => `${Math.round(pageScale(v) * 100)}%`;

/** Put the size on the page (the readers' text is sized from --page-scale). */
export function applyPageSize(v, root = document.documentElement) {
  root.style.setProperty("--page-scale", pageScale(v).toFixed(4));
}
