// Assemble mobile/www: shared screens from ../web, then phone-specific files from ./src on top.
//   node scripts/build-www.mjs
// Shared files are copied (not linked) so the Android build has a self-contained web bundle.

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const mobile = join(here, "..");
const web = join(mobile, "..", "web");
const out = join(mobile, "www");

// Files shared verbatim with the desktop app.
const SHARED = [
  "css/app.css",
  "css/media.css",
  "css/reels.css",
  "css/review.css",
  "fonts",
  "anki-card",
  "icons",
  "js/wordlookup.js",
  "js/correction.js",
  "js/fixword.js",
  "js/languages.js",
  "js/wordface.js",
  "js/lexicon",
  "js/icons.js",
  "js/scrollhint.js",
  "js/vowels.js",
  "js/wordclip.js",
  "js/vowelmarks.js",
  "js/game",
  "game-art",
  "js/components/langpicker.js",
  "js/definer.js",
  "js/defsource.js",
  "js/meanings.js",
  "js/components/wordbubble.js",
  "js/components/lookupmode.js",
  "js/components/account.js",
  "js/components/ankisync.js",
  "js/components/gameswitch.js",
  "js/components/tasktarget.js",
  "js/components/resetapp.js",
  "js/components/langswitch.js",
  "js/social.js",
  "js/syncpace.js",
  "js/syncnudge.js",
  "js/components/refreshbutton.js",
  "js/vendor/supabase.js",
  "js/pages/library.js",
  "js/pages/player.js",
  "js/pages/vocab.js",
  "js/pages/review.js",
  "js/review",
  "js/pages/search.js",
  "js/pages/friends.js",
  "js/pages/chat.js",
  "js/updatenotice.js",
  "js/pages/home.js",
  "js/progress.js",
  "js/pages/reader.js",
  "js/pages/book.js",
  "js/pages/books.js",
  "js/books.js",
  "js/bookpages.js",
  "js/blockmarks.js",
  "js/readerlayout.js",
  "js/textsize.js",
  "js/bookfiles.js",
  "js/vendor/pdfjs",
  "js/extract.js",
  "js/pageimport.js",
  "js/ytcaptions.js",
  "js/youtube.js",
  "js/applink.js",
  "js/ytmedia.js",
  "js/netflix.js",
  "js/nfmedia.js",
  "js/netflix-ttml.js",
  "js/netflix-common.js",
  "js/extbridge.js",
  "js/youtube-browser.js",
  "js/filmot.js",
  "js/cardtext.js",
  "js/filmot-browser.js",
  "js/youtube-home.js",
  "js/ytfollow.js",
  "js/igcollections.js",
  "js/aikeys.js",
  "js/learnlist.js",
  "js/pages/reels.js",
  "js/reel-embed.js",
  "js/reel-page.js",
  "js/browser-home.js",
  "js/browser-sites.js",
  "js/trending.js",
  "js/podcast-picks.js",
  "js/pages/discover.js",
  "js/pages/websites.js",
  "js/components/studycard.js",
  "js/components/sendmedia.js",
  "js/sharetext.js",
  "js/components/avatar.js",
  "js/components/modal.js",
  "js/components/troubleshoot.js",
  "js/components/tour.js",
  "js/chatnotify.js",
  "js/trouble.js",
  "js/components/addsheet.js",
  "js/components/keyhelp.js",
  "js/components/aisetup.js",
  "js/components/settingsui.js",
  "js/components/licenses.js",
  "js/tokenuse.js",
  "js/stt.js",
  "js/components/sttsetup.js",
  "js/components/ownmodel.js",
  "js/components/onboarding.js",
  "js/commonwords.js",
  "js/wordlists",
  "js/i18n.js",
  "i18n",
];

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const rel of SHARED) {
  const src = join(web, rel);
  if (!existsSync(src)) throw new Error(`Missing shared file: ${src}`);
  cpSync(src, join(out, rel), { recursive: true });
}
// The open-source licences the phone and web app are built on (Settings → Data & updates → About):
// licenses/index.json, the list the computer's About page reads too, and each one's text.
const licenses = join(mobile, "..", "licenses");
const licenseList = JSON.parse(readFileSync(join(licenses, "index.json"), "utf8"))
  .filter((l) => !l.on || l.on.includes("phone"));
mkdirSync(join(out, "licenses"), { recursive: true });
writeFileSync(join(out, "licenses", "index.json"), JSON.stringify(licenseList, null, 1));
for (const l of licenseList) cpSync(join(licenses, l.file), join(out, "licenses", l.file));
// Capacitor's core library (a single self-contained module) so plain <script type="module">
// code can reach native plugins without a bundler.
cpSync(join(mobile, "node_modules", "@capacitor", "core", "dist", "index.js"), join(out, "js", "vendor", "capacitor-core.js"));
// Phone-specific files (index.html, app shell, storage, sync, settings) override shared ones.
cpSync(join(mobile, "src"), out, { recursive: true });
// This build's version (set by the release workflow), so the app can tell when a newer one exists.
const version = process.env.APP_VERSION || "0.0.0-dev";
writeFileSync(join(out, "js", "version.js"), `export const APP_VERSION = ${JSON.stringify(version)};\n`);
console.log(`Built ${out} (version ${version})`);
