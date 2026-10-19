// Picking reels on the phone itself, from the user's own Instagram saves.
//
// On the computer this is app/reels_worker.py: it drives an Instagram window and listens to each
// reel with the model on the computer. The phone has no such model, so this only works while a
// cloud provider writes the transcripts (Settings → Cloud transcription); then the phone can do
// the whole job: list a saved collection, let the user tick reels, send each ticked reel's video
// to the provider, and keep its address and words exactly as the computer would.
//
// Instagram is reached through the reel window (ReelSurface.java), opened as a one-pixel strip on
// any reel's page: a page of instagram.com can ask the site things as the signed-in user, which
// is all that is needed (instagram-phone.js runs inside it). The sign-in is the one made in the
// app's own browser; that browser and the reel window share their cookies.
//
// Only "From my Instagram saves" is offered on the phone. "Popular" and "my creators" need the
// window to browse search pages and profiles, which the computer's window can and this one can't.

import { GoogleDriveAuth, isNative, isWeb } from "./native.js";
import { LANGUAGES, isLanguage } from "./languages.js";
import { episodeUid, feedUid } from "./shared-logic.js";
import { heardAs, parseTranscription, sttConfig, sttModelLabel, MAX_UPLOAD_BYTES } from "./stt.js";
import { kv, lib, now, saveSettingsPatch, settings } from "./store.js";
import { requestSync } from "./sync.js";
import { ALL_SAVED, chooseCollection, cleanCollections, foundCollections } from "./igcollections.js";
import { Cancelled, cloudOn, fetchWholeB64, postAudio, storeTranscript } from "./transcribe-service.js";

const SITE = "https://www.instagram.com";
export const REELS_FEED_URL = "local:reels";
const REEL_TYPE = "video/instagram";
const LIST_LIMIT = 80;
const MAX_SECONDS = 240;
const NOT_OUTSIDE = "can't be shown outside Instagram";
const SAVED = "reels_phone"; // kept on this phone only: {skipped, tried}
const TRIED_KEPT = 2000;     // random reels already listened to, so they aren't paid for twice
const PER_CREATOR = 2;       // at most this many random reels of one creator in a batch
const RANDOM_SEARCHES = 8;   // at most this many words are searched for in one batch
const TRIES_PER_REEL = 6;    // give up after listening to this many times the number asked for
const MIN_WORDS = 8;         // a random reel with fewer words than this is music or noise
const MIN_WORDS_PER_SECOND = 0.35;
// "Random reels": everyday words searched for, a few picked at random each time. (The computer has
// the same lists in app/reels.py, RANDOM_WORDS; keep the two in step.)
export const RANDOM_WORDS = {
  ar: ["يوميات", "طبخ", "قصة", "نصيحة", "ضحك", "كوميديا", "سؤال", "تحدي", "مقابلة", "سفر", "أكل", "حكاية", "تجربة", "معلومة",
       "شرح", "مطبخ", "رياضة", "أخبار", "بودكاست", "فلوق", "مقالب", "تعليم", "عائلة", "قهوة"],
  es: ["vlog", "receta", "historia", "consejo", "humor", "comedia", "pregunta", "reto", "entrevista", "viaje", "comida", "anécdota",
       "experiencia", "curiosidades", "explicación", "cocina", "deporte", "noticias", "podcast", "rutina", "familia", "café"],
  fr: ["vlog", "recette", "histoire", "conseil", "humour", "sketch", "question", "défi", "interview", "voyage", "cuisine", "anecdote",
       "expérience", "astuce", "explication", "sport", "actualité", "podcast", "routine", "famille", "café", "quotidien"],
  ja: ["日常", "料理", "お話", "アドバイス", "お笑い", "コント", "質問", "チャレンジ", "インタビュー", "旅行", "グルメ", "体験",
       "豆知識", "解説", "スポーツ", "ニュース", "ポッドキャスト", "ルーティン", "家族", "あるある"],
  zh: ["日常", "做饭", "故事", "建议", "搞笑", "段子", "问答", "挑战", "采访", "旅行", "美食", "经历", "冷知识", "讲解", "运动", "新闻",
       "播客", "生活", "家庭", "脱口秀"],
  ru: ["влог", "рецепт", "история", "совет", "юмор", "приколы", "вопрос", "челлендж", "интервью", "путешествие", "еда", "опыт",
       "факты", "объяснение", "спорт", "новости", "подкаст", "рутина", "семья", "кофе"],
  it: ["vlog", "ricetta", "storia", "consiglio", "comicità", "sketch", "domanda", "sfida", "intervista", "viaggio", "cibo", "aneddoto",
       "esperienza", "curiosità", "spiegazione", "cucina", "sport", "notizie", "podcast", "routine", "famiglia", "caffè"],
  tl: ["vlog", "luto", "kwento", "payo", "katatawanan", "biruan", "tanong", "hamon", "panayam", "biyahe", "pagkain", "karanasan",
       "kaalaman", "paliwanag", "ulam", "palaro", "balita", "podcast", "araw-araw", "pamilya", "kape", "hugot"],
  pt: ["vlog", "receita", "história", "dica", "humor", "comédia", "pergunta", "desafio", "entrevista", "viagem", "comida", "resenha",
       "experiência", "curiosidades", "explicação", "culinária", "futebol", "notícias", "podcast", "rotina", "família", "café"],
  ca: ["vlog", "recepta", "història", "consell", "humor", "comèdia", "pregunta", "repte", "entrevista", "viatge", "menjar", "anècdota",
       "experiència", "curiositats", "explicació", "cuina", "esport", "notícies", "pòdcast", "rutina", "família", "cafè"],
  ceb: ["vlog", "luto", "istorya", "tambag", "katawa", "binuang", "pangutana", "hagit", "interbyu", "biyahe", "pagkaon", "sugilanon",
        "kasinatian", "kahibalo", "pagpasabot", "sud-an", "dula", "balita", "podcast", "adlaw-adlaw", "pamilya", "kape", "bisaya"],
  th: ["vlog", "สูตรอาหาร", "เรื่องเล่า", "คำแนะนำ", "ตลก", "ขำขัน", "คำถาม", "ชาเลนจ์", "สัมภาษณ์", "เที่ยว", "อาหาร", "ประสบการณ์",
       "เกร็ดความรู้", "อธิบาย", "ทำอาหาร", "กีฬา", "ข่าว", "พอดแคสต์", "กิจวัตร", "ครอบครัว", "กาแฟ", "รีวิว"],
  en: ["vlog", "recipe", "storytime", "advice", "comedy", "sketch", "question", "challenge", "interview", "travel", "food", "story",
       "experience", "funfacts", "explained", "cooking", "sports", "news", "podcast", "routine", "family", "coffee"],
};

const CODE = /^[A-Za-z0-9_-]{5,40}$/;
const USERNAME = /^[A-Za-z0-9._]{1,30}$/;

class NeedsSignIn extends Error {}
class Stopped extends Error {}
class TookTooLong extends Error {}

// How long one reel may take altogether (asking Instagram, downloading, the provider writing it
// down), and the download alone. A reel that takes longer is skipped and the next one tried.
const REEL_SECONDS = 180;
const DOWNLOAD_SECONDS = 75;
const PROVIDER_WAIT = 90; // a "slow down" from the provider longer than this ends the batch instead

/** `work` (a promise), given up on after `seconds`, or as soon as Stop is pressed. What it was
 * doing carries on in the background but is no longer waited for. */
function bounded(work, seconds) {
  return new Promise((resolve, reject) => {
    let over = false;
    const finish = (fn, value) => {
      if (over) return;
      over = true;
      clearTimeout(timer);
      clearInterval(stop);
      fn(value);
    };
    const timer = setTimeout(() => finish(reject, new TookTooLong()), seconds * 1000);
    const stop = setInterval(() => { if (cancelled) finish(reject, new Stopped("Stopped.")); }, 300);
    Promise.resolve(work).then((v) => finish(resolve, v), (e) => finish(reject, e));
  });
}

/** One reel tried, within its time limit; its outcome as [kept, why]. A failure only this reel
 * has comes back as a reason; one the next reel would have too (Stop, a refused key, the
 * provider's limit) is thrown, to end the batch. */
async function tryWithin(ig, cfg, cand, options) {
  try { return await bounded(tryReel(ig, cfg, cand, options), REEL_SECONDS); }
  catch (e) {
    if (e instanceof Stopped) throw e;
    if (e instanceof Cancelled) throw new Stopped("Stopped.");
    if (e.keyRejected || e.status === 429) throw new Stopped(e.message);
    if (e instanceof TookTooLong) return [false, `took over ${REEL_SECONDS / 60} minutes`];
    return [false, e.message || String(e)];
  }
}

const tally = (kept, skipped) => `${kept} added, ${skipped} skipped`;

// ---------------------------------------------------------------------------- what is remembered

let saved = null;
async function load() {
  if (!saved) {
    const raw = (await kv.get(SAVED)) || {};
    saved = { skipped: raw.skipped && typeof raw.skipped === "object" ? raw.skipped : {},
              tried: Array.isArray(raw.tried) ? raw.tried.map(String) : [] };
    // Collections used to be kept here, on this phone only; now they are shared (below).
    if (!settings.ig_collections && Array.isArray(raw.collections) && raw.collections.length) {
      storeCollections(cleanCollections({ at: 1, items: raw.collections, chosen: raw.collection, chosen_at: 1 }));
    }
  }
  return saved;
}
const keep = () => kv.set(SAVED, saved).catch(console.error);

// The collections found and the one chosen are kept in the settings (settings.ig_collections),
// which the library sync shares with the computer; web/js/igcollections.js explains the record.
const collectionsNow = () => cleanCollections(settings.ig_collections);
function storeCollections(record) {
  saveSettingsPatch({ ig_collections: record }).catch(console.error);
  requestSync();
}

let listed = { collection: "", posts: [], at: 0 }; // the collection last looked at (in memory only)
const status = { state: "idle", message: "", kept: 0, target: 0, checked: 0, log: [], running: false, needs_signin: false };
const hearers = new Set();
let cancelled = false;

/** Hear how a job is getting on: fn(status), the same shape the computer's /api/reels gives. */
export function onReels(fn) { hearers.add(fn); return () => hearers.delete(fn); }
export const reelsStatus = () => ({ ...status, log: [...status.log] });
function say(state, message, more = {}) {
  if (state !== null) status.state = state;
  if (message !== null) status.message = message;
  Object.assign(status, more);
  for (const fn of hearers) { try { fn(reelsStatus()); } catch (e) { console.error(e); } }
}
function note(creator, title, outcome, kept) {
  status.log = [...status.log, { creator, title: title.slice(0, 80), outcome, kept }].slice(-40);
}

// --------------------------------------------------------------------------------- the window

let pageScript = null;

/** A page of instagram.com to ask things from: {ask(what, arg), close()}. */
async function instagram() {
  if (isWeb) return webInstagram();
  if (!isNative) return previewInstagram();
  if (pageScript === null) pageScript = await (await fetch(new URL("./instagram-phone.js", import.meta.url))).text();
  let latest = null;
  const waiting = new Set();
  const handle = await GoogleDriveAuth.addListener("reelState", ({ state }) => {
    let s;
    try { s = JSON.parse(JSON.parse(state)); } catch { return; } // the page hasn't started yet
    if (!s || s.ig !== 1) return;
    latest = s;
    for (const w of [...waiting]) if (w.test(s)) { waiting.delete(w); w.resolve(s); }
  });
  const until = (test, seconds, why) => new Promise((resolve, reject) => {
    if (latest && test(latest)) { resolve(latest); return; }
    const w = { test, resolve };
    waiting.add(w);
    setTimeout(() => { if (waiting.delete(w)) reject(new Error(why)); }, seconds * 1000);
  });
  const close = () => { handle.remove(); GoogleDriveAuth.reelClose().catch(() => {}); };
  // Any page of the site will do. A reel already in the library is one the window is known to
  // show; without one, an address in the same shape (the site answers it with its "not found" page).
  const known = lib.episodes.find((e) => !e.deleted && e.audio_type === REEL_TYPE && CODE.test(e.guid || ""));
  try {
    await GoogleDriveAuth.reelOpen({ url: `${SITE}/reel/${known ? known.guid : "tamkeen"}/`, script: pageScript, top: 0, height: 0 });
    await until((s) => /(^|\.)instagram\.com$/.test(s.host || ""), 40, "Instagram didn't open. Check your connection and try again.");
  } catch (e) {
    close();
    throw e;
  }
  let n = 0;
  const run = (job, what, arg) => GoogleDriveAuth.reelRun({
    script: `window.__tkIg && window.__tkIg(${job}, ${JSON.stringify(what)}, ${JSON.stringify(arg || {})})` });
  return {
    async ask(what, arg, seconds = 45) {
      const job = ++n;
      await run(job, what, arg);
      const s = await until((x) => x.job === job && x.done, seconds, "Instagram didn't answer in time.");
      run(++n, "clear").catch(() => {});
      if (s.error) throw new Error(s.error);
      return s.result;
    },
    close,
  };
}

/** Development preview in a browser: a pretend Instagram with a few saved posts, so the screen can be tried. */
/** The web app: no Instagram window, only reels' public embed pages (see web-reels.js). Enough
 *  to add a reel from its link; the rest of Instagram (saves, collections, search) needs the app. */
function webInstagram() {
  return {
    async ask(what, arg) {
      if (what === "whoami") return { username: "web" };
      if (what === "info") {
        const { reelInfo } = await import("./web-reels.js");
        const post = await reelInfo(arg && arg.code);
        if (!post) throw new Error("Instagram doesn't show this reel publicly.");
        return { post };
      }
      throw new Error("That needs the Tamkeen app (it reads Instagram while you're signed in there).");
    },
    close() {},
  };
}

function previewInstagram() {
  const posts = ["Maqlab01", "Daheka02", "Souq0003", "Qahwa004", "Photo005"].map((code, i) => ({
    code, user: ["comedy.ar", "daheka", "souq.life", "qahwa.talk", "pictures"][i], caption: ["مقلب في السوق 😂 #ضحك", "يوم في حياتي", "أسعار اليوم", "", "صورة"][i],
    video: i !== 4, seconds: [34, 58, 21, 75, 0][i], thumb: "", src: new URL(`../dev-reel-${i + 1}.mp4`, import.meta.url).href, music: i === 3 }));
  let signedIn = !!sessionStorage.getItem("tk-preview-ig");
  return {
    async ask(what, arg) {
      await new Promise((r) => setTimeout(r, 400));
      if (what === "whoami") { const was = signedIn; signedIn = true; sessionStorage.setItem("tk-preview-ig", "1"); return { username: was ? "preview" : "" }; }
      if (what === "savedIds") return arg.max ? { ids: ["17900000000000002", "17900000000000003"], posts: 21, next: "" }
        : { ids: ["17900000000000001", "17900000000000002"], posts: 21, next: "page2" };
      if (what === "collectionName") return { name: { "17900000000000001": "Arabic", "17900000000000002": "Funny", "17900000000000003": "Cooking 🍲" }[arg.id] || "" };
      if (what === "list") return { posts: arg.collection === "all" ? posts : posts.slice(0, 3) };
      if (what === "info") return { post: posts.find((p) => p.code === arg.code) || null };
      if (what === "search") return { posts: posts.concat(["Rand0006", "Rand0007", "Rand0008"].map((code, i) => ({
        code: `${code}${arg.word.length}`, user: ["yawmiyat", "matbakh.ar", "comedy.ar"][i], caption: `${arg.word} ${i + 1}`, video: true, seconds: 25 + i,
        thumb: "", src: new URL(`../dev-reel-${i + 1}.mp4`, import.meta.url).href, music: false }))) };
      return null;
    },
    close() {},
  };
}

async function signedInInstagram() {
  const ig = await instagram();
  try {
    const me = await ig.ask("whoami");
    if (!me || !me.username) throw new NeedsSignIn();
    return ig;
  } catch (e) {
    ig.close();
    throw e;
  }
}

// ----------------------------------------------------------------------------------- the jobs

async function job(target, work) {
  if (status.running) throw new Error("Busy with Instagram already. Try again when that has finished.");
  if (!cloudOn()) throw new Error("Turn on cloud transcription in Settings first: it is what lets this phone listen to reels.");
  cancelled = false;
  say("starting", "Opening Instagram…", { kept: 0, target, checked: 0, log: [], running: true, needs_signin: false });
  (async () => {
    let ig = null;
    try {
      ig = await signedInInstagram();
      await work(ig);
    } catch (e) {
      if (e instanceof NeedsSignIn) {
        say("signin", "Sign in to Instagram first: press “Sign in to Instagram” and sign in there. That window closes by itself and Tamkeen carries on.",
            { needs_signin: true });
      } else if (e instanceof Stopped || e instanceof Cancelled) say("stopped", e.message || "Stopped.");
      else { console.warn("Reels on the phone failed", e); say("error", e.message || String(e)); }
    } finally {
      if (ig) ig.close();
      status.running = false;
      say(null, null);
    }
  })();
  return reelsStatus();
}

/** A picture's address made showable: Instagram's picture servers won't show pictures inside
 * other pages, so the phone fetches each small picture itself. */
async function showable(posts) {
  if (!isNative) return;
  const todo = posts.filter((p) => /^https:\/\/[^/]*\.(cdninstagram\.com|fbcdn\.net)\//.test(p.thumb || ""));
  const worker = async () => {
    for (let p = todo.shift(); p; p = todo.shift()) {
      try { p.thumb = `data:image/jpeg;base64,${await fetchWholeB64(p.thumb)}`; } catch { p.thumb = ""; }
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  for (const p of posts) if (!String(p.thumb || "").startsWith("data:")) p.thumb = "";
}

function tidy(posts) {
  const out = [];
  for (const p of posts || []) {
    const code = String((p && p.code) || "");
    if (!CODE.test(code) || out.some((q) => q.code === code)) continue;
    const user = String(p.user || "").toLowerCase();
    out.push({ code, user: USERNAME.test(user) ? user : "", caption: String(p.caption || "").replace(/\s+/g, " ").trim().slice(0, 160),
               video: p.video !== false, seconds: Math.round(Number(p.seconds) || 0), thumb: String(p.thumb || ""),
               src: String(p.src || ""), music: !!p.music });
    if (out.length >= LIST_LIMIT) break;
  }
  return out;
}

// Instagram's website has no list of the user's collections, so they are worked out from the
// saves: every saved post says which collections it is in, and a collection gives its name when
// asked (see instagram-phone.js). The saves are walked newest first, a page (about 20 posts) at a
// time, until they run out, or nothing new has turned up for a while, or the limit is reached.
const WALK_PAGES = 40;  // about 800 of the newest saves
const WALK_QUIET = 10;  // pages in a row without a new collection before giving up looking

export function startCollections() {
  return job(0, async (ig) => {
    await load();
    const before = collectionsNow().items;
    const found = [];       // [{id, name}], most recently saved-to first
    const looked = new Set();
    const remember = (complete) => {
      // Collections known from before that this walk didn't reach are kept, unless it read every save.
      storeCollections(foundCollections(settings.ig_collections,
        complete ? [...found] : [...found, ...before.filter((c) => !looked.has(c.id))], Math.floor(now())));
    };
    const count = () => `${found.length} collection${found.length === 1 ? "" : "s"}`;
    let next = "";
    let quiet = 0;
    let complete = false;
    try {
      for (let page = 0; page < WALK_PAGES; page++) {
        if (cancelled) throw new Stopped(`Stopped. Found ${count()} so far.`);
        say("finding", found.length ? `Looking through your Instagram saves… ${count()} so far. (Stop keeps the ones found.)` : "Looking through your Instagram saves for your collections…");
        const r = (await ig.ask("savedIds", { max: next }, 60)) || {};
        const fresh = (r.ids || []).map(String).filter((id) => /^\d{5,25}$/.test(id) && !looked.has(id));
        for (const id of fresh) {
          looked.add(id);
          let name = "";
          try { name = String(((await ig.ask("collectionName", { id }, 60)) || {}).name || "").replace(/\s+/g, " ").trim().slice(0, 80); }
          catch (e) { console.warn("Instagram wouldn't name a collection", e); }
          if (name) { found.push({ id, name }); remember(false); }
        }
        quiet = fresh.length ? 0 : quiet + 1;
        next = String(r.next || "");
        if (!next) { complete = true; break; }
        if (quiet >= WALK_QUIET) break;
      }
    } finally {
      remember(complete); // also when stopped or cut off: what was found is kept
    }
    const known = collectionsNow().items;
    say("done", known.length ? `Found ${known.length} saved collection${known.length === 1 ? "" : "s"}. Choose one from the list.`
      : "No collections found in your Instagram saves. You can still choose “Everything I've saved”.");
  });
}

/** The collection chosen on the Reels page (shared with the computer when it changes). */
function choose(collection) {
  const before = collectionsNow();
  const after = chooseCollection(before, collection, Math.floor(now()));
  if (after.chosen !== before.chosen) storeCollections(after);
}

export async function startListing(collection) {
  await load();
  if (collection !== ALL_SAVED && !collectionsNow().items.some((c) => c.id === collection)) throw new Error("That collection isn't in the list. Press “Find my collections” again.");
  choose(collection);
  return job(0, async (ig) => {
    say("finding", "Reading that collection on Instagram…");
    const posts = tidy(((await ig.ask("list", { collection, limit: LIST_LIMIT }, 90)) || {}).posts);
    say("finding", "Getting the pictures…");
    await showable(posts);
    listed = { collection, posts, at: now() };
    say("done", posts.length ? `${posts.length} saved post${posts.length === 1 ? "" : "s"} found. Tick the ones you want.` : "Nothing is saved there yet.");
  });
}

/** The first line of what the reel's maker wrote, else "@creator" (as reels.title_for on the computer). */
export function titleFor(caption, creator) {
  let first = String(caption || "").trim().split("\n")[0].replace(/\s+/g, " ").trim();
  first = first.replace(/(\s*#\S+)+\s*$/, "").trim(); // trailing hashtags are noise
  return first.length > 118 ? `${first.slice(0, 117)}…` : first || `@${creator}`;
}

/** Store a reel that was heard: its address and its words (the twin of reels.save_reel on the computer). */
export async function saveReel({ code, creator, caption, segments, language, model, seconds, signin }) {
  const t = now();
  const fuid = await feedUid(REELS_FEED_URL);
  let feed = lib.feeds.find((f) => f.uid === fuid);
  if (!feed) {
    feed = { uid: fuid, url: REELS_FEED_URL, title: "Reels", description: "Instagram reels to study. They play from Instagram; only their words are kept.",
             image: null, link: null, auto_transcribe: 0, deleted: 0, created_at: t, updated_at: t };
    lib.feeds.push(feed);
  } else if (feed.deleted) {
    Object.assign(feed, { deleted: 0, updated_at: t });
  }
  const uid = await episodeUid(fuid, code);
  const fields = { title: titleFor(caption, creator), description: creator, image: null,
                   audio_url: `${SITE}/reel/${code}/${signin ? "#signin" : ""}`, audio_type: REEL_TYPE,
                   duration: seconds || (segments.length ? segments.at(-1).end : null), deleted: 0 };
  let ep = lib.episodes.find((e) => e.uid === uid);
  if (ep) Object.assign(ep, fields);
  else {
    ep = { uid, feed_uid: fuid, guid: code, published: t, transcribe_requested_at: null, remote_audio: 0, created_at: t, ...fields };
    lib.episodes.push(ep);
  }
  return storeTranscript(uid, segments, model, { language });
}

/** `random`: a reel the app found by itself (not one the user picked). Then it has to be in the
 * language being studied and have real speech in it, as on the computer. */
async function tryReel(ig, cfg, known, { random = false } = {}) {
  const code = known.code;
  let p = known;
  try { p = { ...known, ...tidy([((await ig.ask("info", { code })) || {}).post])[0] }; } // asked afresh: a video's address only works for a while
  catch (e) { if (!known.src) return [false, "couldn't be read"]; }
  if (!p.user) return [false, "couldn't be read"];
  if (p.video === false) return [false, "not a video"];
  if (p.seconds > MAX_SECONDS) return [false, "too long"];
  if (!p.src) return [false, NOT_OUTSIDE];
  let b64;
  try { b64 = await bounded(fetchWholeB64(p.src), DOWNLOAD_SECONDS); }
  catch (e) {
    if (e instanceof Stopped) throw e;
    return [false, e instanceof TookTooLong ? "the video took too long to download"
      : `the video couldn't be downloaded${e && e.message ? ` (${String(e.message).slice(0, 120)})` : ""}`];
  }
  if (!b64) return [false, "the video came back empty from Instagram"];
  if (b64.length * 0.75 > MAX_UPLOAD_BYTES) return [false, "too large to send from the phone"];
  // The provider isn't told the language: it writes down what it hears and says which language that was.
  // A "slow down" from the provider is shown, and only a short one is waited out (see PROVIDER_WAIT).
  const heard = parseTranscription(await postAudio(cfg, { b64, name: "reel.mp4", type: "video/mp4" },
    { get cancelled() { return cancelled; }, say: (message) => say(null, message), longestWait: PROVIDER_WAIT }));
  const words = heard.segments.reduce((n, s) => n + (s.words.length || s.text.split(/\s+/).filter(Boolean).length), 0);
  if (!words) return [false, "nothing is said in it"];
  const study = settings.study_language || "ar";
  heard.language = heardAs(heard.language, study); // Bisaya is heard as Tagalog (stt.js)
  if (random) {
    const seconds = p.seconds || heard.duration || 0;
    if (heard.language && heard.language !== study) return [false, `in ${(LANGUAGES[heard.language] || {}).name || heard.language}, not ${LANGUAGES[study].name}`];
    if (words < MIN_WORDS || (seconds && words / seconds < MIN_WORDS_PER_SECOND)) return [false, "hardly any speech in it"];
  }
  // Your own pick is kept whatever its language; one in another language the app teaches is filed under that.
  const language = isLanguage(heard.language) ? heard.language : study;
  const count = await saveReel({ code, creator: p.user, caption: p.caption, segments: heard.segments, language,
                                 model: sttModelLabel(cfg), seconds: p.seconds || heard.duration, signin: p.music });
  return [true, `${count} words${language === study ? "" : `, in ${LANGUAGES[language].name}`}${p.music ? " (plays when signed in to Instagram)" : ""}`];
}

export function startSelected(codes) {
  const list = [...new Set((codes || []).map(String))].filter((c) => CODE.test(c)).slice(0, LIST_LIMIT);
  if (!list.length) throw new Error("Tick the reels you want first.");
  return job(list.length, async (ig) => {
    const cfg = sttConfig(settings);
    const s = await load();
    let kept = 0;
    let i = 0;
    try {
      for (; i < list.length; i++) {
        if (cancelled) throw new Stopped("Stopped.");
        say("checking", `Reel ${i + 1} of the ${list.length} you ticked: listening… (${tally(kept, i - kept)} so far)`, { kept, checked: i + 1 });
        const known = listed.posts.find((p) => p.code === list[i]) || { code: list[i] };
        const [ok, outcome] = await tryWithin(ig, cfg, known);
        note(known.user || "?", titleFor(known.caption || "", known.user || "?"), outcome, ok);
        delete s.skipped[list[i]];
        if (!ok) s.skipped[list[i]] = String(outcome).slice(0, 120);
        keep();
        if (ok) { kept++; say(null, null, { kept }); }
      }
    } catch (e) {
      if (e instanceof Stopped) throw new Stopped(`${e.message} ${tally(kept, i - kept)}.`);
      throw e;
    }
    const left = list.length - kept;
    say("done", `${tally(kept, left)}.${left ? " The list below says why each was skipped." : ""}`, { kept, checked: list.length });
  });
}

/** The reels worth trying out of what a search found, in a random order: videos of reel length,
 * not tried or kept before, none with a song from Instagram's music library (those only play to
 * someone signed in). The twin of reels.pick_random on the computer. */
export function pickRandom(posts, skip, rand = Math.random) {
  const out = [];
  for (const p of posts || []) {
    if (!p || !CODE.test(p.code || "") || skip.has(p.code) || out.some((q) => q.code === p.code)) continue;
    if (!p.user || p.video === false || p.music || !p.src) continue;
    if (p.seconds > MAX_SECONDS || (p.seconds > 0 && p.seconds < 5)) continue;
    out.push(p);
  }
  return shuffled(out, rand);
}

/** A copy of a list in a random order. */
function shuffled(list, rand = Math.random) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** "Get random reels": `count` reels in the language being studied, found by searching Instagram
 * for a few everyday words picked at random. Each one tried is sent to the provider once. */
export function startRandom(count) {
  const want = Math.max(1, Math.min(30, Math.round(Number(count) || 10)));
  const study = settings.study_language || "ar";
  const name = (LANGUAGES[study] || {}).name || study;
  if (!RANDOM_WORDS[study]) throw new Error("Random reels aren't set up for this language yet.");
  return job(want, async (ig) => {
    const cfg = sttConfig(settings);
    const s = await load();
    const fuid = await feedUid(REELS_FEED_URL);
    const skip = new Set([...s.tried, ...lib.episodes.filter((e) => e.feed_uid === fuid && !e.deleted).map((e) => e.guid)]);
    const words = shuffled(RANDOM_WORDS[study]);
    const perCreator = new Map();
    let pool = [];
    // Only some of what each word finds is taken, so a batch mixes several words' reels.
    const perWord = Math.max(6, Math.ceil((want * TRIES_PER_REEL) / RANDOM_SEARCHES));
    let searches = 0;
    let kept = 0;
    let checked = 0;
    while (kept < want && checked < want * TRIES_PER_REEL) {
      if (cancelled) throw new Stopped(`Stopped. ${tally(kept, checked - kept)}.`);
      if (!pool.length) {
        if (searches >= Math.min(words.length, RANDOM_SEARCHES)) break;
        say("finding", `Looking for ${name} reels (${searches + 1})…`, { kept, checked });
        let found = [];
        try { found = tidy(((await ig.ask("search", { word: words[searches] }, 90)) || {}).posts); }
        catch (e) { console.warn("Instagram's search didn't answer", e); }
        searches++;
        pool = pickRandom(found, skip).slice(0, perWord);
        for (const p of pool) skip.add(p.code);
        continue;
      }
      const cand = pool.shift();
      if ((perCreator.get(cand.user) || 0) >= PER_CREATOR) continue;
      checked++;
      say("checking", `Getting ${want} ${name} reels: ${tally(kept, checked - 1 - kept)} so far; listening to the next one…`, { kept, checked });
      let ok = false;
      let outcome;
      try { [ok, outcome] = await tryWithin(ig, cfg, cand, { random: true }); }
      catch (e) {
        if (e instanceof Stopped) throw new Stopped(`${e.message} ${tally(kept, checked - 1 - kept)}.`);
        throw e;
      }
      note(cand.user || "?", titleFor(cand.caption || "", cand.user || "?"), outcome, ok);
      s.tried = [...s.tried, cand.code].slice(-TRIED_KEPT);
      keep();
      if (ok) {
        kept++;
        perCreator.set(cand.user, (perCreator.get(cand.user) || 0) + 1);
        say(null, null, { kept });
      }
    }
    say("done", kept ? `${tally(kept, checked - kept)}: ${kept} random ${name} reel${kept === 1 ? "" : "s"} ready to watch.`
      : `${tally(0, checked)}: no ${name} reels could be kept this time. Try again: the search words change each time.`, { kept, checked });
  });
}

export function cancelReels() { cancelled = true; }

// -------------------------------------------------------------- what the Reels page asks for

/** GET /reels on the phone. */
export async function reelsView() {
  await load();
  const known = collectionsNow();
  const lang = settings.study_language || "ar";
  return {
    phone: true, web: isWeb, available: cloudOn(), model_ready: true, mode: "saved", modes: isWeb ? [] : ["saved"], mine: [], selected: [], popular: [],
    collections: known.items, collection: known.chosen, language: lang, language_name: (LANGUAGES[lang] || {}).name || lang,
    random: !!RANDOM_WORDS[lang],
    status: reelsStatus(),
  };
}

/** GET /reels/saved: the collection last looked at, each post marked if it is already here or couldn't be used. */
export async function reelsListing() {
  const s = await load();
  const fuid = await feedUid(REELS_FEED_URL);
  const have = new Set(lib.episodes.filter((e) => e.feed_uid === fuid && !e.deleted).map((e) => e.guid));
  return { collection: listed.collection, at: listed.at,
           posts: listed.posts.map(({ src, music, ...p }) => ({ ...p, have: have.has(p.code),
             skipped: have.has(p.code) || s.skipped[p.code] === NOT_OUTSIDE ? "" : s.skipped[p.code] || "" })) };
}

export async function setReelChoices(body) {
  await load();
  if (body && body.collection !== undefined && body.collection !== null) {
    if (body.collection !== ALL_SAVED && !collectionsNow().items.some((c) => c.id === body.collection)) throw new Error("That collection isn't in the list.");
    choose(body.collection);
  }
  return reelsView();
}
