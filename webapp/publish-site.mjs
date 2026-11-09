// Puts the web app on its own address, https://learntamkeen.com: a copy of the built web app (docs/app, made by
// build-web.mjs) at the top of the GitHub repo christiangilkey/learntamkeen, whose GitHub Pages site has that
// domain. The privacy, terms and cookie pages go beside it. The old address (christiangilkey.github.io/tamkeen/app/)
// stays as it is: installed apps fetch dictionaries, books and courses from there.
//
// Run at every release, after build-web.mjs:   node webapp/publish-site.mjs <the learntamkeen repo's folder>
// It copies, commits and pushes (nothing to push when nothing changed).

import { execFileSync } from "node:child_process";
import { cpSync, existsSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const site = process.argv[2];
if (!site || !existsSync(join(site, ".git"))) throw new Error("Give the folder of the learntamkeen repo (a git checkout).");
const app = join(root, "docs", "app");
if (!existsSync(join(app, "index.html"))) throw new Error("No web app build in docs/app: run webapp/build-web.mjs first.");

// Everything but git's own folder goes, so files the app no longer has don't linger.
for (const name of readdirSync(site)) if (name !== ".git") rmSync(join(site, name), { recursive: true, force: true });
cpSync(app, site, { recursive: true });
for (const name of ["privacy.html", "terms.html", "cookies.html", "style.css", "icon.png"]) {
  if (existsSync(join(root, "docs", name)) && !existsSync(join(site, name))) cpSync(join(root, "docs", name), join(site, name));
}
writeFileSync(join(site, "CNAME"), "learntamkeen.com\n");  // GitHub Pages' custom domain
writeFileSync(join(site, ".nojekyll"), "");                 // served as they are, folders starting with _ too

const git = (...args) => execFileSync("git", ["-C", site, ...args], { encoding: "utf8" }).trim();
git("add", "-A");
if (!git("status", "--porcelain")) { console.log("learntamkeen.com already has this build."); process.exit(0); }
const version = (/APP_VERSION = "([^"]+)"/.exec(execFileSync(process.execPath, ["-e",
  `process.stdout.write(require("fs").readFileSync(${JSON.stringify(join(app, "js", "version.js"))}, "utf8"))`], { encoding: "utf8" })) || [])[1] || "?";
git("commit", "-q", "-m", `Web app ${version}`);
git("push", "-q", "origin", "HEAD");
console.log(`learntamkeen.com: web app ${version} pushed.`);
