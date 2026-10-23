# How to put Tamkeen for Netflix in the Chrome Web Store

For Chris. Short steps; under each, a plain-English note. Claude has prepared everything up to the
upload. You do the parts that need your Google account: signing in, paying, and pressing Submit.

You'll need, from this folder (`extension/store/`):

- `listing.md`: every text to copy and paste, field by field.
- `images/`: the pictures to upload.
- The zip to upload: `extension/store/upload/tamkeen-chrome-web-store.zip`.
  *Note: it's made by each release build. If it isn't there, ask Claude to "build the Chrome Web Store
  zip" (it runs `node webapp/build-web.mjs`).*

---

## Before you start

**0. Check that the privacy page is online.**
Open https://christiangilkey.github.io/tamkeen/extension/privacy.html in your browser.
*Note: the store asks for this link. It goes online once this work is pushed to GitHub. If the page
says "404", ask Claude to push first.*

**0b. Turn on 2-Step Verification on your Google account, if it isn't already.**
https://myaccount.google.com/signinoptions/two-step-verification
*Note: Google requires it for anyone publishing extensions.*

---

## Part 1: the developer account (once only)

**1. Open the developer dashboard.**
https://chrome.google.com/webstore/devconsole, signed in with the Google account you want to publish
under.
*Note: whatever account you use here owns the extension for good; it can't be moved later without
starting over.*

**2. Accept the developer agreement.**
*Note: Google's terms for publishing. Read and tick the box.*

**3. Pay the one-time registration fee.**
*Note: it was US$5 when this was written; the page shows the current amount. You pay once, ever, for
all your extensions. Google's payment page asks for the card; type it yourself.*

**4. Fill in your account details (Account tab).**
- Publisher name: e.g. `Tamkeen` or your own name. *Shown on the store under the extension.*
- Contact email: an address you check. *Google sends review results and warnings there. You'll get
  a confirmation email: click its link.*
- If asked whether you are a "trader": *this is an EU rule about selling to consumers. Tamkeen is
  free and you make no money from it, so "non-trader" usually fits; read Google's explanation on the
  page if unsure.*

---

## Part 2: the extension

**5. Click "New item" and upload the zip.**
Choose `extension/store/upload/tamkeen-chrome-web-store.zip`.
*Note: the store reads the name, short description, version and icons from inside the zip, so those
fields fill themselves.*

**6. Store listing tab: paste the texts.**
From `listing.md`, section "Store listing tab": Description, Category (Education), Language (English),
Homepage URL, Support URL. Mature content: No.
*Note: copy only the text inside each grey box.*

**7. Store listing tab: upload the images.**
From `images/`:
- Store icon: `store-icon-128.png`
- Screenshots: `screenshot-1.png` to `screenshot-5.png`, in that order
- Small promo tile: `promo-small-440x280.png`
- Leave the marquee tile and the video empty.
*Note: the screenshots are real pictures of the extension. The video in them is an original sample,
so no Netflix pictures or logo appear (that would risk a rejection).*

**8. Privacy practices tab: paste and tick.**
From `listing.md`, section "Privacy practices tab":
- the single purpose;
- one justification for each permission (storage, unlimitedStorage, webRequest, host permissions);
- Remote code: "No, I am not using remote code";
- tick the four data types listed (Authentication information, Web history, User activity, Website
  content) and nothing else;
- tick all three certifications;
- privacy policy URL: `https://christiangilkey.github.io/tamkeen/extension/privacy.html`.
*Note: these must match what the extension really does and what the privacy page says; they do.
Ticking honestly is safer than ticking nothing.*

**9. Distribution tab: choose who can see it.**
- Free of charge.
- Visibility: **Public** (anyone can find it by searching) or **Unlisted** (only people with the link).
- Regions: all.
*Note: you wanted it findable, so Public. Unlisted is a cautious first step if you'd rather try it
quietly; you can change this later in the same tab.*

**10. If there's a "Test instructions" box, paste the reviewer notes** from `listing.md`.
*Note: reviewers may not have Netflix; this tells them how to check it anyway.*

**11. Press "Submit for review".**
*Note: most reviews take a few days; a new developer with this kind of permission can take one to
three weeks. You get an email either way. After approval it goes live by itself, unless you choose
in the submit box to publish it yourself after approval.*

**12. If it's rejected:** forward the email to Claude.
*Note: the email names the rule. Usually it's a wording or a justification to fix; you then upload
a new zip and submit again.*

---

## Part 3: once it is live

**13. Copy the listing's address** from the store (it looks like
`https://chromewebstore.google.com/detail/tamkeen-for-netflix/abc…`) **and give it to Claude.**
*Note: Claude puts it in one place (`CHROME_WEB_STORE_URL` in `web/js/netflix.js`). From the next
release, the web app's Netflix section shows "Add to Chrome" (and "Add to Edge" in Edge), and the
install page puts the same button first, instead of the by-hand steps.*

---

## Every release after that (Claude does the build; you do the upload)

**14. Build the release as usual.**
*Note: the extension's version is the release's version (from the git tag, e.g. v0.36.0 → 0.36.0),
so it goes up by itself. The store refuses a zip whose version isn't higher than the last one.*

**15. In the dashboard, open Tamkeen for Netflix → Package → "Upload new package"** and choose the new
`extension/store/upload/tamkeen-chrome-web-store.zip`. Then **Submit for review**.
*Note: updates are reviewed like the first time (usually quicker). People who installed it get the
update automatically within a few hours of approval.*

**16. Only if the extension starts doing something new with people's data** (a new permission, a new
website, a new kind of data): update `listing.md`, the privacy page and the Privacy practices tab in
the same release.
*Note: Claude will tell you when a release needs this; most releases don't.*

---

## Other stores (optional, later)

- **Microsoft Edge Add-ons**: free account at https://partner.microsoft.com/dashboard/microsoftedge;
  the same zip and texts work. *Edge users can also install from the Chrome Web Store, so this is
  optional.*
- **Firefox**: needs its own review at https://addons.mozilla.org/developers/ and the Firefox zip
  (`docs/extension/tamkeen-netflix.zip`); not tested in Firefox yet.
