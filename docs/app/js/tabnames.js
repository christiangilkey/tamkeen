// The tabs' names with the prototype "games_content" (the owner, 2026-11-27: "maybe we should rename the home page to
// games" and "Library can be renamed to content"): Home is "Games" (with the game's line icon) and Library is "Content",
// wherever the tabs are shown (the computer's top bar, the phones' and web app's tab bar). Only the names change: the
// addresses (#/, #/library) and every key stay, so links and saved choices still work. Shared by every version.

import { feature } from "./prototype.js";
import { t } from "./i18n.js";
import { icon } from "./icons.js";

/** The name a tab has now: "home" → Games, "library" → Content with the prototype, else `name` as it is. */
export function tabName(key, name) {
  if (!feature("games_content")) return name;
  return key === "home" ? t("Games") : key === "library" ? t("Content") : name;
}

/** Rename the tabs in `root` (their links carry data-nav="home" / "library"). Safe to call again. */
export function applyTabNames(root = document) {
  if (!feature("games_content")) return;
  for (const key of ["home", "library"]) {
    const a = root.querySelector(`[data-nav="${key}"]`);
    if (!a || a.dataset.renamed) continue;
    a.dataset.renamed = "1";
    const name = tabName(key, "");
    const text = [...a.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim()).pop();
    if (text) text.textContent = name; else a.append(name);
    // The phones' tab bar shows an icon above the name: Games gets the game's line icon instead of a house.
    const ico = key === "home" ? a.querySelector(".ico") : null;
    if (ico) { ico.dataset.icon = "game"; ico.innerHTML = icon("game", Number(ico.dataset.size) || 24); }
  }
}
