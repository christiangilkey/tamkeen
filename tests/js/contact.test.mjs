// Settings → Contact on every device: email SGT Gilkey a problem or a question (web/js/components/contact.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

test("the email is filled in: the address, a subject, and which Tamkeen it comes from", async () => {
  const src = read("web/js/components/contact.js");
  assert.match(src, /export const CONTACT_EMAIL = "christiangilkey@gmail\.com";/);
  assert.match(src, /Write to SGT Gilkey, MLI UAD, who makes Tamkeen\./);
  // (mailto and mailBody are plain functions: run them without the page)
  const body = src.slice(src.indexOf("export function mailto("), src.indexOf("/** The Contact card."));
  const { mailto, mailBody } = await import(`data:text/javascript,${encodeURIComponent(
    `const CONTACT_EMAIL = "christiangilkey@gmail.com";\n${body}`)}`);
  const link = mailto("Tamkeen: a problem", mailBody("problem", { version: "0.59.0", device: "Android" }));
  assert.ok(link.startsWith("mailto:christiangilkey@gmail.com?subject=Tamkeen%3A%20a%20problem&body="));
  assert.match(decodeURIComponent(link.split("body=")[1]), /^Tamkeen 0\.59\.0 on Android\n\nWhat happened:/);
  assert.equal(mailBody("question", {}), "Tamkeen (version unknown) on (device unknown)\n\n");
});

test("Contact is a Settings section on the computer and on the phones and web app, and the phone build carries it", () => {
  assert.match(read("web/js/components/settingsui.js"), /\{ id: "contact", icon: "message", title: "Contact"/);
  assert.match(read("web/js/components/settingsui.js"), /\{ s: "contact", id: "contact", label: "Contact"/);
  assert.match(read("web/js/pages/settings.js"), /const BUILD = \{[^}]*\bcontact \};/);
  assert.match(read("web/js/pages/settings.js"), /contactCard\(\{ version: status\.version, device, outside: true \}\)/);
  assert.match(read("mobile/src/js/pages/settings.js"), /const BUILD = \{[^}]*\bcontact \};/);
  assert.match(read("mobile/scripts/build-www.mjs"), /"js\/components\/contact\.js"/);
  assert.match(read("web/js/padscreens.js"), /"data", "contact"\]/);
});
