// Putting a lesson right by hand (lesson bundles): the questions Tamkeen found (their wording, kind, choices and the
// right answers) and the passage's own text ("scripts in files"). Both open in a box; nothing is kept until Save.

import { h, toast } from "../app.js";
import { t } from "../i18n.js";
import { icon } from "../icons.js";
import { cleanAnswer, cleanQuestions } from "../lessons.js";
import { confirmBox, openModal } from "./modal.js";

const KIND_NAMES = [["choice", "One answer"], ["multi", "Several answers"], ["tf", "True or false"], ["text", "Written answer"]];
const clone = (x) => JSON.parse(JSON.stringify(x));
const nextId = (list, prefix) => { let n = list.length + 1; while (list.some((x) => x.id === `${prefix}${n}`)) n++; return `${prefix}${n}`; };

/** The question editor. `onSave(questions, key)` gets the result. */
export function openQuestionEditor(rec, blocks, { onSave }) {
  let qs = clone(rec.questions);
  let key = clone(rec.key || {});
  let changed = false;
  const box = openModal({ title: t("Edit questions"), wide: true, cls: "lsn-edit-back",
    beforeClose: () => (changed ? confirmBox(t("Leave without saving?"), t("Your changes to the questions are lost."), { ok: t("Leave"), danger: true }) : true) });
  const list = h(`<div class="lsn-edit"></div>`);
  const acts = h(`<div class="set-actions lsn-edit-acts"><button type="button" data-a="add">${icon("plus", 16)} <span>Add a question</span></button>
    <span class="lsn-bar-gap"></span><button type="button" class="primary" data-a="save">Save</button></div>`);
  box.body.append(h(`<p class="small muted">Tick the right answers to make an answer key: it lets learners check themselves, and shows you who got what right. Students never see it.</p>`), list, acts);
  const touch = () => { changed = true; };

  const where = (q) => {
    const sel = h(`<select class="lsn-at" aria-label="Where it goes"></select>`);
    const opts = [[0, t("Before the passage")]];
    blocks.forEach((b, i) => { if (!/^h/.test(String(b.kind))) opts.push([i + 1, t("After: {0}", String(b.text).slice(0, 50))]); });
    if (!opts.some(([v]) => v === q.at)) opts.push([q.at, t("After paragraph {0}", q.at)]);
    for (const [v, label] of opts) {
      const o = document.createElement("option");
      o.value = String(v);
      o.textContent = label;
      if (v === q.at) o.selected = true;
      sel.append(o);
    }
    sel.onchange = () => { q.at = Number(sel.value); touch(); };
    return sel;
  };

  function paint() {
    list.innerHTML = "";
    if (!qs.length) list.append(h(`<p class="muted">No questions yet.</p>`));
    qs.forEach((q, n) => {
      const card = h(`<div class="lsn-eq"><div class="lsn-eq-head"><strong class="lsn-qn"></strong><select class="lsn-kind" aria-label="Kind of question"></select>
        <span class="lsn-bar-gap"></span><button type="button" class="ghost icon small" data-a="up" title="Move up" aria-label="Move up">↑</button>
        <button type="button" class="ghost icon small" data-a="down" title="Move down" aria-label="Move down">↓</button>
        <button type="button" class="ghost icon small danger" data-a="del" title="Delete the question" aria-label="Delete the question">${icon("trash", 16)}</button></div>
        <textarea class="lsn-eq-prompt" rows="2" aria-label="The question"></textarea><div class="lsn-eq-opts"></div><div class="lsn-eq-where"></div></div>`);
      card.querySelector(".lsn-qn").textContent = `${n + 1}.`;
      const kind = card.querySelector(".lsn-kind");
      for (const [v, label] of KIND_NAMES) {
        const o = document.createElement("option");
        o.value = v;
        o.textContent = t(label);
        if (v === q.kind) o.selected = true;
        kind.append(o);
      }
      kind.onchange = () => {
        q.kind = kind.value;
        if (q.kind === "tf" && q.options.length !== 2) q.options = [{ id: "a", label: "", text: t("True") }, { id: "b", label: "", text: t("False") }];
        if ((q.kind === "choice" || q.kind === "multi") && q.options.length < 2) q.options = [{ id: "a", label: "a", text: "" }, { id: "b", label: "b", text: "" }];
        if (q.kind === "text") q.options = [];
        const a = cleanAnswer(q, key[q.id]);
        if (q.kind === "text") { if (typeof key[q.id] !== "string") delete key[q.id]; } else if (a === undefined || (Array.isArray(a) && !a.length)) delete key[q.id]; else key[q.id] = a;
        touch();
        paint();
      };
      const prompt = card.querySelector(".lsn-eq-prompt");
      prompt.value = q.prompt;
      prompt.dir = "auto";
      prompt.oninput = () => { q.prompt = prompt.value; touch(); };
      const opts = card.querySelector(".lsn-eq-opts");
      if (q.kind === "text") {
        const row = h(`<div class="lsn-eq-text"><label><span class="small">Room to write</span> <select aria-label="Room to write"></select></label>
          <label class="lsn-eq-key"><span class="small">Answer (optional)</span> <input type="text" dir="auto"></label></div>`);
        const room = row.querySelector("select");
        for (const [v, label] of [[1, t("A word or a line")], [4, t("A few sentences")], [8, t("A paragraph or more")]]) {
          const o = document.createElement("option");
          o.value = String(v);
          o.textContent = label;
          if ((q.lines >= 8 ? 8 : q.lines >= 2 ? 4 : 1) === v) o.selected = true;
          room.append(o);
        }
        room.onchange = () => { q.lines = Number(room.value); touch(); };
        const ans = row.querySelector("input");
        ans.value = typeof key[q.id] === "string" ? key[q.id] : "";
        ans.oninput = () => { if (ans.value.trim()) key[q.id] = ans.value; else delete key[q.id]; touch(); };
        opts.append(row);
      } else {
        q.options.forEach((o, k) => {
          const many = q.kind === "multi";
          const on = [].concat(key[q.id] ?? []).includes(o.id);
          const row = h(`<div class="lsn-eq-opt"><input type="${many ? "checkbox" : "radio"}" name="key-${q.id}" title="The right answer" aria-label="The right answer"${on ? " checked" : ""}>
            <input type="text" class="lsn-eq-otext" dir="auto" aria-label="A choice"><button type="button" class="ghost icon small" title="Delete the choice" aria-label="Delete the choice">${icon("close", 14)}</button></div>`);
          const [tick, text] = row.querySelectorAll("input");
          text.value = o.text;
          text.oninput = () => { o.text = text.value; touch(); };
          tick.onchange = () => {
            const picked = q.options.filter((_, i) => opts.querySelectorAll(".lsn-eq-opt input:first-child")[i].checked).map((x) => x.id);
            if (!picked.length) delete key[q.id]; else key[q.id] = many ? picked : picked[0];
            touch();
          };
          row.querySelector("button").onclick = () => {
            if (q.options.length <= 2) { toast(t("A question with choices needs two at least.")); return; }
            q.options.splice(k, 1);
            const a = cleanAnswer(q, key[q.id]);
            if (a === undefined || (Array.isArray(a) && !a.length)) delete key[q.id]; else key[q.id] = a;
            touch();
            paint();
          };
          opts.append(row);
        });
        if (q.kind !== "tf" && q.options.length < 12) {
          const more = h(`<button type="button" class="ghost small">${icon("plus", 14)} <span>Add a choice</span></button>`);
          more.onclick = () => { q.options.push({ id: nextId(q.options, "o"), label: "", text: "" }); touch(); paint(); };
          opts.append(more);
        }
      }
      card.querySelector(".lsn-eq-where").append(where(q));
      card.querySelector(".lsn-eq-head").onclick = (e) => {
        const a = e.target.closest("button") && e.target.closest("button").dataset.a;
        if (!a) return;
        if (a === "del") { qs.splice(n, 1); delete key[q.id]; }
        else if (a === "up" && n > 0) { [qs[n - 1], qs[n]] = [qs[n], qs[n - 1]]; [qs[n - 1].at, qs[n].at] = [Math.min(qs[n - 1].at, qs[n].at), Math.max(qs[n - 1].at, qs[n].at)]; }
        else if (a === "down" && n < qs.length - 1) { [qs[n + 1], qs[n]] = [qs[n], qs[n + 1]]; [qs[n].at, qs[n + 1].at] = [Math.min(qs[n].at, qs[n + 1].at), Math.max(qs[n].at, qs[n + 1].at)]; }
        else return;
        touch();
        paint();
      };
      list.append(card);
    });
  }

  acts.onclick = (e) => {
    const a = e.target.closest("button") && e.target.closest("button").dataset.a;
    if (a === "add") {
      qs.push({ id: nextId(qs, "q"), kind: "text", prompt: "", options: [], lines: 1, at: blocks.length });
      touch();
      paint();
      const last = list.querySelector(".lsn-eq:last-child textarea");
      if (last) last.focus();
    } else if (a === "save") {
      const clean = cleanQuestions(qs.filter((q) => q.prompt.trim() || q.options.some((o) => o.text.trim()))
        .map((q) => ({ ...q, options: q.options.filter((o) => o.text.trim()) })));
      const k = {};
      for (const q of clean) if (key[q.id] !== undefined) { const v = q.kind === "text" ? key[q.id] : cleanAnswer(q, key[q.id]); if (v !== undefined && !(Array.isArray(v) && !v.length)) k[q.id] = v; }
      changed = false;
      box.close();
      onSave(clean, k);
    }
  };
  paint();
  return box;
}

/** The passage's text, a paragraph at a time (a heading stays a heading). `onSave(blocks)`. */
export function openPassageEditor(rec, blocks, { onSave }) {
  let changed = false;
  const items = clone(blocks);
  const box = openModal({ title: t("Correct the passage's text"), wide: true, cls: "lsn-edit-back",
    beforeClose: () => (changed ? confirmBox(t("Leave without saving?"), t("Your changes to the text are lost."), { ok: t("Leave"), danger: true }) : true) });
  const list = h(`<div class="lsn-edit lsn-ptext"></div>`);
  box.body.append(h(`<p class="small muted">Fix anything the file reader got wrong. An empty paragraph is taken out.</p>`), list);
  items.forEach((b) => {
    const kind = String(b.kind || "p").split("|")[0];
    const ta = h(`<textarea class="lsn-pt${/^h/.test(kind) ? " lsn-pt-h" : ""}" dir="auto" aria-label="A paragraph"></textarea>`);
    ta.value = b.text;
    ta.rows = Math.min(12, Math.max(2, Math.ceil(b.text.length / 70)));
    if (rec.lang) ta.lang = rec.lang;
    ta.oninput = () => { b.text = ta.value; b.kind = kind; changed = true; };
    list.append(ta);
  });
  const acts = h(`<div class="set-actions lsn-edit-acts"><span class="lsn-bar-gap"></span><button type="button" class="primary">Save</button></div>`);
  acts.querySelector("button").onclick = () => {
    const next = items.map((b) => ({ kind: String(b.kind || "p"), text: String(b.text || "").replace(/\s+/g, " ").trim() })).filter((b) => b.text);
    changed = false;
    box.close();
    onSave(next);
  };
  box.body.append(acts);
  return box;
}
