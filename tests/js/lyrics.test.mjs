// Song lyrics for the karaoke view (web/js/lyrics.js): LRC files, the line being sung, LRCLIB's
// records matched to the song playing, the words of languages written without spaces, and which
// language a song is in. (Every lyric here is written for these tests.)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  artistNames, detectLyricsLanguage, firstArtist, lineAt, lineBefore, lineWords, lrclibRequests, lyricLines, lyricsKey,
  lyricsScore, normName, parseLrc, pickLyrics, plainLines, retryDelay, timedLines,
} from "../../web/js/lyrics.js";
import en from "../../web/js/wordlists/en.js";
import es from "../../web/js/wordlists/es.js";
import fr from "../../web/js/wordlists/fr.js";
import it from "../../web/js/wordlists/it.js";
import pt from "../../web/js/wordlists/pt.js";
import ca from "../../web/js/wordlists/ca.js";
import de from "../../web/js/wordlists/de.js";
import tl from "../../web/js/wordlists/tl.js";
import ceb from "../../web/js/wordlists/ceb.js";

const LISTS = { en, es, fr, it, pt, ca, de, tl, ceb };

// ---------- LRC ----------

test("LRC: the usual stamps, in time order", () => {
  const { lines, synced } = parseLrc("[00:12.34] Primera línea\n[00:15.00]Segunda línea\n[01:02.5] tercera\n[1:05] cuarta\n[01:07.250] quinta\n[01:09:50] sexta");
  assert.equal(synced, true);
  assert.deepEqual(lines.map((l) => l.start), [12.34, 15, 62.5, 65, 67.25, 69.5]);
  assert.deepEqual(lines.map((l) => l.text), ["Primera línea", "Segunda línea", "tercera", "cuarta", "quinta", "sexta"]);
});

test("LRC: several stamps on one line (a chorus sung twice) become two lines in their places", () => {
  const { lines } = parseLrc("[00:10.00][00:40.00] el coro otra vez\n[00:20.00] un verso\n[00:50.00] otro verso");
  assert.deepEqual(lines, [
    { start: 10, text: "el coro otra vez" }, { start: 20, text: "un verso" },
    { start: 40, text: "el coro otra vez" }, { start: 50, text: "otro verso" },
  ]);
});

test("LRC: [offset] moves every line (+ earlier, - later); the other tags are left out", () => {
  const plus = parseLrc("[ar:Someone]\n[ti:A song]\n[length: 03:20]\n[offset:+250]\n[00:10.00] uno\n[00:00.10] cero");
  assert.equal(plus.offset, 0.25);
  assert.deepEqual(plus.lines, [{ start: 0, text: "cero" }, { start: 9.75, text: "uno" }]);
  const minus = parseLrc("[offset:-500]\n[00:10.00] uno");
  assert.deepEqual(minus.lines, [{ start: 10.5, text: "uno" }]);
});

test("LRC: pauses (stamps with no words) end the line before, never first, never twice; word stamps go", () => {
  const { lines } = parseLrc("﻿[00:01.00]\r\n[00:05.00] <00:05.00>hola <00:05.60>amigo\r\n[00:08.00]\r\n[00:09.00] \r\n[00:20.00] adiós\r\n[00:24.00]\r\n");
  assert.deepEqual(lines, [{ start: 5, text: "hola amigo" }, { start: 8, text: "" }, { start: 20, text: "adiós" }]);
});

test("LRC: a file with no times at all is not timed", () => {
  assert.equal(parseLrc("just words\nmore words").synced, false);
  assert.equal(parseLrc("").synced, false);
  assert.equal(parseLrc(null).lines.length, 0);
});

test("plain lyrics: lines, one blank between verses, stamps taken off", () => {
  assert.deepEqual(plainLines("\n\nuno\ndos\n\n\n[00:01.00] tres\n\n").map((l) => l.text), ["uno", "dos", "", "tres"]);
  assert.ok(plainLines("a\nb").every((l) => l.start === null));
});

// ---------- the view's lines ----------

test("view lines: a line ends when the next begins or once sung; pauses are left out; words spread over it", () => {
  const timed = parseLrc("[00:10.00] uno dos tres cuatro cinco seis\n[00:12.00] una línea bastante más larga que la anterior para cantar\n[00:30.00]\n[00:40.00] fin").lines;
  const lines = lyricLines(timed, { duration: 60 });
  assert.equal(lines.length, 3);
  assert.equal(lines[0].end, 12); // the next line starts before it could be sung
  assert.equal(lyricLines(parseLrc("[00:10.00] uno dos\n[00:20.00] tres").lines)[0].end, 11.5); // (sung sooner than that)
  assert.ok(lines[1].end > 12 && lines[1].end <= 20, `sung in a few seconds, not until the pause: ${lines[1].end}`);
  assert.ok(lines[2].end > 40 && lines[2].end <= 48);
  assert.deepEqual(lines[0].words.map((w) => w[2]), ["uno", "dos", "tres", "cuatro", "cinco", "seis"]);
  assert.equal(lines[0].words[0][0], 10);
  for (const l of lines) for (let k = 1; k < l.words.length; k++) assert.ok(l.words[k][0] >= l.words[k - 1][0]);
  assert.equal(timedLines(lines), true);
});

test("view lines: two lines at the same moment each get a moment; lines without times have none", () => {
  const same = lyricLines([{ start: 5, text: "a" }, { start: 5, text: "b" }]);
  assert.ok(same[0].end > same[0].start);
  const plain = lyricLines(plainLines("uno dos\n\ntres"));
  assert.deepEqual(plain.map((l) => [l.start, l.end, l.text]), [[-1, -1, "uno dos"], [-1, -1, "tres"]]);
  assert.equal(timedLines(plain), false);
});

test("the line being sung: none before the first, a moment early, held through a short pause, none in a long one", () => {
  const lines = [{ start: 10, end: 13 }, { start: 14, end: 17 }, { start: 40, end: 43 }];
  assert.equal(lineAt(lines, 5), -1);
  assert.equal(lineAt(lines, 9.9), 0); // (karaoke shows the line just before it starts)
  assert.equal(lineAt(lines, 13.5), 0);
  assert.equal(lineAt(lines, 14), 1);
  assert.equal(lineAt(lines, 20), 1); // a short pause after it
  assert.equal(lineAt(lines, 30), -1); // a long pause
  assert.equal(lineBefore(lines, 30), 1); // (where the view waits)
  assert.equal(lineAt(lines, 45), 2);
  assert.equal(lineAt(lines, 60), -1);
  assert.equal(lineAt([], 3), -1);
  assert.equal(lineAt([{ start: -1, end: -1 }], 3), -1); // lines without times
});

test("words of languages written without spaces are split by Tamkeen's word splitters", () => {
  const ja = lyricLines([{ start: 0, text: "今日はとてもいい天気ですね" }, { start: 6, text: "空を見上げて歩こう" }]);
  const W = lineWords(ja, "ja");
  assert.ok(W.text.length > 4, `split into words: ${W.text.join(" | ")}`);
  assert.equal(W.text.join(""), "今日はとてもいい天気ですね空を見上げて歩こう");
  assert.ok(W.seg.indexOf(1) > 0 && W.seg.every((s, k) => k === 0 || s >= W.seg[k - 1]));
  for (let k = 0; k < W.text.length; k++) assert.ok(W.start[k] <= W.end[k] && W.start[k] >= 0);
  const th = lineWords(lyricLines([{ start: 0, text: "ฉันรักเธอมากที่สุดในโลก" }]), "th");
  assert.ok(th.text.length > 3, `Thai split: ${th.text.join(" | ")}`);
  const zh = lineWords(lyricLines([{ start: 0, text: "我们一起去看海吧" }]), "zh");
  assert.ok(zh.text.length > 2, `Chinese split: ${zh.text.join(" | ")}`);
  const spaced = lineWords(lyricLines([{ start: 0, text: "hola mi amigo" }]), "es");
  assert.deepEqual(spaced.text, ["hola", "mi", "amigo"]);
});

// ---------- LRCLIB's records ----------

test("names made comparable: accents, versions, features", () => {
  assert.equal(normName("Corazón Espinado (feat. Maná)"), normName("Corazon Espinado"));
  assert.equal(normName("Yesterday - Remastered 2009"), "yesterday");
  assert.equal(normName("Song Title [Live at the Hall]"), "song title");
  assert.equal(normName("Rock & Roll"), "rock and roll");
  assert.equal(normName("Habibi (Ya Nour El Ain)"), "habibi ya nour el ain"); // (not a version: kept)
  assert.deepEqual(artistNames("Luis Fonsi, Daddy Yankee"), ["luis fonsi", "daddy yankee"]);
  assert.deepEqual(artistNames("Simon & Garfunkel"), ["simon", "garfunkel"]);
  assert.equal(firstArtist("Luis Fonsi, Daddy Yankee"), "Luis Fonsi");
  assert.equal(firstArtist("A feat. B"), "A");
});

const TRACK = { title: "Corazón Valiente (feat. Otra Voz)", artist: "Cantante Uno, Otra Voz", album: "Disco", duration: 214 };
const rec = (over) => ({ id: 1, trackName: "Corazon Valiente", artistName: "Cantante Uno", albumName: "X", duration: 214,
  instrumental: false, plainLyrics: "a\nb", syncedLyrics: "[00:01.00] a\n[00:02.00] b", ...over });

test("matching: the same song and length fits; timed lyrics win; the closest length wins", () => {
  assert.ok(lyricsScore(rec(), TRACK) > 2);
  assert.equal(pickLyrics([rec({ id: 1, syncedLyrics: null }), rec({ id: 2 })], TRACK).id, 2);
  assert.equal(pickLyrics([rec({ id: 1, duration: 219 }), rec({ id: 2, duration: 215 }), rec({ id: 3, duration: 222 })], TRACK).id, 2);
});

test("matching: another recording (length far off), another song, or nothing to show is refused", () => {
  assert.equal(lyricsScore(rec({ duration: 240 }), TRACK), -Infinity);
  assert.equal(lyricsScore(rec({ trackName: "Otra Canción" }), TRACK), -Infinity);
  assert.equal(lyricsScore(rec({ plainLyrics: null, syncedLyrics: null }), TRACK), -Infinity);
  assert.equal(pickLyrics([rec({ duration: 300 }), rec({ trackName: "Nada que ver" })], TRACK), null);
  assert.equal(pickLyrics([], TRACK), null);
});

test("matching: another artist counts against; LRCLIB's own match (/api/get) only needs the length", () => {
  assert.ok(lyricsScore(rec({ artistName: "Someone Else" }), TRACK) < lyricsScore(rec(), TRACK));
  const arabic = { title: "تملي معاك", artist: "عمرو دياب", duration: 260 };
  const latin = rec({ trackName: "Tamally Maak", artistName: "Amr Diab", duration: 260 });
  assert.equal(lyricsScore(latin, arabic), -Infinity);
  assert.ok(lyricsScore(latin, arabic, { trusted: true }) > 2);
  assert.equal(pickLyrics([{ rec: latin, trusted: true }], arabic).trackName, "Tamally Maak");
  assert.equal(lyricsScore(rec({ duration: 280 }), arabic, { trusted: true }), -Infinity);
});

test("what to ask LRCLIB: the exact signature, then searches by the short title and first artist", () => {
  const reqs = lrclibRequests(TRACK, "https://lyrics.test");
  assert.deepEqual(reqs.map((r) => r.kind), ["get", "search", "search"]);
  const get = new URL(reqs[0].url);
  assert.equal(get.pathname, "/api/get");
  assert.equal(get.searchParams.get("track_name"), TRACK.title);
  assert.equal(get.searchParams.get("artist_name"), "Cantante Uno, Otra Voz");
  assert.equal(get.searchParams.get("album_name"), "Disco");
  assert.equal(get.searchParams.get("duration"), "214");
  const search = new URL(reqs[1].url);
  assert.equal(search.searchParams.get("track_name"), "Corazón Valiente");
  assert.equal(search.searchParams.get("artist_name"), "Cantante Uno");
  assert.equal(new URL(reqs[2].url).searchParams.get("q"), "Corazón Valiente Cantante Uno");
  assert.deepEqual(lrclibRequests({ title: "Solo", duration: 0 }).map((r) => r.kind), ["search"]);
  assert.deepEqual(lrclibRequests({ title: "" }), []);
  assert.equal(lrclibRequests({ title: "Long", artist: "A", duration: 5000 })[0].kind, "search"); // (LRCLIB takes 1..3600 s)
});

test("waiting when LRCLIB is busy: its Retry-After, a little more at random, twice at most", () => {
  const d = retryDelay(429, "3", 0, () => 1);
  assert.equal(d, 3900);
  assert.equal(retryDelay(429, "3", 0, () => 0), 3000);
  assert.equal(retryDelay(503, null, 1, () => 0), 1000);
  assert.equal(retryDelay(429, "abc", 0, () => 0), 5000);
  assert.equal(retryDelay(404, "1", 0), -1);
  assert.equal(retryDelay(503, "1", 2), -1);
  assert.equal(retryDelay(429, "3600", 0), -1);
});

test("a song's key: by title, first artist and length", () => {
  assert.equal(lyricsKey({ title: "Hola (Live)", artist: "Ana, Bea", duration: 200.4 }), "hola|ana|200");
});

// ---------- the song's language ----------

const SAMPLES = {
  es: "Cuando la noche llega y no estás aquí, pienso en tus ojos y en lo que me diste. Mañana vuelvo a buscarte, mi amor, porque sin ti no tengo nada.",
  fr: "Quand la nuit tombe et que tu n'es pas là, je pense à tes yeux et à tout ce que tu m'as donné. Demain je reviens te chercher, mon amour.",
  it: "Quando arriva la notte e tu non ci sei, penso ai tuoi occhi e a quello che mi hai dato. Domani torno a cercarti, amore mio, perché senza di te non ho niente.",
  pt: "Quando a noite chega e você não está aqui, eu penso nos seus olhos e no que você me deu. Amanhã eu volto pra te buscar, meu amor, porque sem você não tenho nada.",
  ca: "Quan arriba la nit i tu no hi ets, penso en els teus ulls i en tot el que em vas donar. Demà torno a buscar-te, amor meu, perquè sense tu no tinc res.",
  de: "Wenn die Nacht kommt und du nicht hier bist, denke ich an deine Augen und an alles, was du mir gegeben hast. Morgen komme ich zurück, mein Schatz.",
  en: "When the night comes and you are not here, I think about your eyes and everything you gave to me. Tomorrow I will come back for you, my love.",
  tl: "Kapag dumating ang gabi at wala ka dito, iniisip ko ang iyong mga mata at lahat ng ibinigay mo sa akin. Bukas babalik ako para sa iyo, mahal ko.",
  ceb: "Kung moabot na ang gabii ug wala ka diri, gihunahuna nako ang imong mga mata ug tanan nga imong gihatag kanako. Ugma mobalik ko para nimo, akong gugma.",
  ja: "夜が来て君がいないとき、君の目を思い出す。明日また会いに行くよ、愛しい人。",
  zh: "当夜晚来临你不在这里，我想起你的眼睛和你给我的一切。明天我会回来找你，我的爱人。",
  ko: "밤이 오고 네가 여기 없을 때 나는 너의 눈을 생각해. 내일 다시 너를 찾으러 갈게, 내 사랑.",
  th: "เมื่อค่ำคืนมาถึงและเธอไม่อยู่ที่นี่ ฉันคิดถึงดวงตาของเธอ พรุ่งนี้ฉันจะกลับมาหาเธอ ที่รัก",
  hi: "जब रात आती है और तुम यहाँ नहीं होते, मैं तुम्हारी आँखों के बारे में सोचता हूँ। कल मैं तुम्हें ढूँढने वापस आऊँगा, मेरी जान।",
  ar: "عندما يأتي الليل وأنت لست هنا، أفكر في عينيك وفي كل ما أعطيتني. غداً سأعود لأبحث عنك يا حبيبي.",
  fa: "وقتی شب می‌رسد و تو اینجا نیستی، به چشم‌هایت فکر می‌کنم و به همه چیزی که به من دادی. فردا برمی‌گردم تا پیدایت کنم، عزیزم.",
  ru: "Когда приходит ночь и тебя здесь нет, я думаю о твоих глазах и обо всём, что ты мне дал. Завтра я вернусь за тобой, моя любовь.",
};

test("a song's language, by its writing and its words", () => {
  for (const [code, text] of Object.entries(SAMPLES)) {
    const got = detectLyricsLanguage(text, LISTS);
    assert.equal(got.lang, code, `${code}: ${JSON.stringify(got)}`);
  }
});

test("a song's language: K-pop with English lines is Korean; Ukrainian is not Russian; other languages are unknown", () => {
  const kpop = "Baby, baby, I want you tonight\n오늘 밤 너와 함께 춤을 추고 싶어\nBaby, baby, don't let me go\n너의 손을 잡고 놓지 않을래";
  assert.equal(detectLyricsLanguage(kpop, LISTS).lang, "ko");
  assert.equal(detectLyricsLanguage("Коли приходить ніч і тебе тут немає, я думаю про твої очі. Завтра я повернуся до тебе, моє кохання.", LISTS).lang, "uk");
  // Hindi written in Latin letters (as many lyric sites write it): not one Tamkeen can look up.
  assert.equal(detectLyricsLanguage("Jab raat aati hai aur tum yahan nahi hote, main tumhari aankhon ke baare mein sochta hoon. Kal main wapas aaunga, meri jaan.", LISTS).lang, "");
  assert.equal(detectLyricsLanguage("Kun yö tulee etkä ole täällä, ajattelen silmiäsi ja kaikkea mitä annoit minulle. Huomenna palaan luoksesi, rakkaani.", LISTS).lang, "");
  assert.equal(detectLyricsLanguage("", LISTS).lang, "");
  assert.equal(detectLyricsLanguage("♪ ♪ ♪ 123", LISTS).lang, "");
});

test("a song's language: Latin languages whose word lists aren't given are not guessed", () => {
  assert.equal(detectLyricsLanguage(SAMPLES.es, { en }).lang, "");
  assert.equal(detectLyricsLanguage(SAMPLES.es, {}).lang, "");
});
