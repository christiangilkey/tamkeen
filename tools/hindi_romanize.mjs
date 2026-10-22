// The app's own Hindi readings (web/js/lexicon/hindi.js romanize) for a list of words, for
// tools/build_hindi.py: a JSON list of words on standard input, the JSON list of their readings out.
//   node tools/hindi_romanize.mjs < words.json
import { romanize } from "../web/js/lexicon/hindi.js";

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { input += chunk; });
process.stdin.on("end", () => {
  const words = JSON.parse(input || "[]");
  process.stdout.write(JSON.stringify(words.map((w) => romanize(w))));
});
