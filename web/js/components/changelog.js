// Settings → Changelog: every version's changes (CHANGELOG.md at the project root, copied to
// web/changelog.md so every version of the app carries it; tests/js/changelog.test.mjs keeps the
// two the same). English only, as the owner asked, so the page is marked translate="no".

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/** The little Markdown the changelog uses: # / ## headings, "- " lines, **bold**, *italic*, ---. */
export function changelogHtml(md) {
  const inline = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\*(.+?)\*/g, "<em>$1</em>");
  const out = [];
  let list = false;
  const closeList = () => { if (list) { out.push("</ul>"); list = false; } };
  for (const raw of String(md || "").split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (/^- /.test(line)) {
      if (!list) { out.push("<ul>"); list = true; }
      out.push(`<li>${inline(line.slice(2))}</li>`);
      continue;
    }
    closeList();
    if (!line.trim()) continue;
    if (/^---+$/.test(line)) out.push("<hr>");
    else if (/^## /.test(line)) out.push(`<h3>${inline(line.slice(3))}</h3>`);
    else if (/^# /.test(line)) continue; // the file's own title: the box has one
    else out.push(`<p>${inline(line)}</p>`);
  }
  closeList();
  return out.join("");
}

/** Open the changelog in a box over the page. */
export async function openChangelog() {
  const { openModal } = await import("./modal.js"); // (loaded here: the drawing above is tested on its own)
  const box = openModal({ title: "Changelog", wide: true });
  box.body.classList.add("changelog");
  box.body.setAttribute("translate", "no");
  box.body.textContent = "…";
  try {
    const r = await fetch("changelog.md", { cache: "no-cache" });
    if (!r.ok) throw new Error(String(r.status));
    box.body.innerHTML = changelogHtml(await r.text());
  } catch {
    box.body.textContent = "Couldn't open the changelog.";
  }
}
