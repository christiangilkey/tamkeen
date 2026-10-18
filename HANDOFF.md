# Handoff: Arabic Podcast Studio

Paste this into a new Claude session (Claude Code, working directory
`C:\Users\chris\Documents\arabic-tts\podcast-studio`) to continue the project.

## How to work with me (the owner)
- I'm not a programmer. **For every line of code, command or technical term you show me, add a very brief
  plain-English explanation** of what it does and what its syntax means.
- I'm on **Windows 11** (RTX 5070 Ti, Ryzen 5 7500F, 32 GB RAM). Note: something in WSL/Docker often uses
  most of my GPU, which makes GPU benchmarks look slow.
- You may not type passwords, API keys or secrets into web forms for me. Put values on my clipboard
  (PowerShell `Set-Clipboard`) **right when I say I'm on the page**, and tell me not to copy anything else.
  Don't paste secrets into chat.
- Ask before outward-facing actions (publishing, creating cloud credentials, pushing tags).

## What the app is
Desktop + Android app for studying Arabic podcasts. Subscribe to RSS feeds; the desktop transcribes episodes
locally with Whisper (word timestamps); a player highlights each word, auto-scrolls RTL text, slow playback,
sentence loop; **tap a word = play just that word, pause, show an AI definition bubble** that uses the whole
sentence for context (user's own Claude/Gemini/OpenAI/Grok key); vocab list with Anki/CSV export; Arabic
search ignoring diacritics; **Google Drive sync** (private `drive.appdata` folder) between computers and phone.

- Repo: https://github.com/christiangilkey/arabic-podcast-studio (public, branch `main`)
- Releases: https://github.com/christiangilkey/arabic-podcast-studio/releases (latest: **v0.3.0**, desktop only)
- Home page / privacy policy (GitHub Pages from `/docs`): https://christiangilkey.github.io/arabic-podcast-studio/

## Code map
- `app/` Python backend (FastAPI): `feeds.py` RSS, `downloader.py`, `audio.py` (PyAV decode, Opus sync copy),
  `transcriber/` (faster-whisper CPU/CUDA, mlx-whisper on Apple Silicon), `jobs.py` queue, `db.py` SQLite
  (schema v2: global uids, `updated_at` triggers, tombstones, `sync_guard`), `sync/` (Drive sync: `engine.py`
  merge, `oauth.py` desktop loopback+PKCE, `drive.py`), `api/` routes (incl. `definer.py` relay), `desktop.py`
  pywebview window, `smoke.py` self-test.
- `web/` desktop UI (plain JS modules). Shared with Android: `pages/{library,player,vocab,search}.js`,
  `components/wordbubble.js`, `definer.js` (4 providers), `wordlookup.js`.
- `mobile/` Android app (Capacitor 8): `src/` phone-only files (shell `app.js`, `backend.js` answers the same
  `/api` calls from IndexedDB, `sync.js` JS port of the merge, `drive.js`, `store.js`, settings/welcome pages);
  `scripts/build-www.mjs` copies shared `web/` files + `src/` into `www/`; `android/` native project incl.
  `GoogleDriveAuthPlugin.java` (Google Authorization API, scopes drive.appdata/email/openid).
- `packaging/` PyInstaller spec, Inno Setup, dmg/AppImage scripts, icons, `android/make_keystore.py`.
- `.github/workflows/release.yml` (on `v*` tags: tests, Win/Mac/Linux installers + smoke tests, calls
  `android.yml`, publishes release), `android.yml` (signed APK; also runs on pushes to mobile/** or web/**).
- Tests: `.venv/Scripts/python -m pytest -q` (66 pass); JS: `node --test tests/js/*.test.mjs` (24 pass, incl.
  parity tests proving phone logic == Python). Node is at
  `C:\Users\chris\AppData\Local\Microsoft\WinGet\Packages\OpenJS.NodeJS.LTS_Microsoft.Winget.Source_8wekyb3d8bbwe\node-v24.19.0-win-x64`.

## Credentials & where they live (never commit them)
- Google Cloud project **Meridian** (`meridian-510303`), Google Auth Platform app "Arabic Podcast Studio",
  **In production**, scopes: drive.appdata, openid, userinfo.email. Desktop OAuth client ID:
  `419555269865-uk3qctlk125h8pts2s16omormv4b9fn9.apps.googleusercontent.com` (public).
- Desktop client file (git-ignored): `app/sync/google_client.json`.
- Android signing key folder (outside repo, must be backed up): `%APPDATA%\ArabicPodcastStudio-signing\`
  (`release.p12`, `password.txt`, `release.p12.base64.txt`, `fingerprints.txt`, `GOOGLE_CLIENT_SECRET.txt`).
  SHA-1: `AC:3A:1E:C9:D5:B9:5A:23:A2:33:84:BF:1E:B6:8B:97:FB:36:85:41`.
- GitHub Actions secrets (all set and verified): `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
  `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`.

## Current status
- Desktop v0.3.0 released and working (transcription, definer, Drive sync tested with a real account).
- Android: code done, previewed in the browser at phone size (library, player, bubble work), and the
  **signed APK builds successfully in CI** (`android.yml`). Not yet tested on a real phone.

## Done 2026-10-09 (released as v0.5.0)
- Android OAuth client created; **v0.4.0 released** (desktop + APK) and tested on a real phone: everything works.
- Library button is now **⟳ Refresh & sync** (desktop also pulls from Drive immediately, so phone requests show up).
- **My videos**: user uploads their own video files (desktop "🎬 Add video" streams to `/api/videos`; phone uploads
  straight to Drive). Stored in Drive as `v_<episode uid>.<ext>`; episode `audio_url = "drive:<name>"`,
  `audio_type = video/*`, `remote_audio = 1` once in Drive. See `app/videos.py`. Desktop transcribes (downloads
  from Drive if added on the phone). Deleting a video = episode tombstone (`episodes.deleted`) → every device
  drops it and the next desktop sync deletes the Drive files.
- **Video player**: tappable captions over the video (tap = play word, pause, definition bubble) + transcript panel
  (desktop: slides in from the side, video shrinks; phone: rises from the bottom). Keys T / C / F.
- **Phone video streaming**: Drive rejects `?access_token=` (403), so `DriveMediaWebViewClient.java` proxies
  `https://localhost/_drive/<fileId>` adding the Authorization header and passing Range through. JS hands it the token
  via `GoogleDriveAuth.setMediaToken`. **Only testable on a real phone.**
- **Vocab folders** (schema v3: `vocab_folders` table, `vocab.folders` JSON list; a word can be in several),
  sort (added/changed/A–Z), date filter (added or changed; presets or custom range), multi-select bulk add/remove,
  export = exactly the words shown (`?ids=`).
- Tests: 76 Python, 24 JS. Signed-out test copy of the app: launch config `video-test` (port 8792).

## Social features (in progress, started 2026-10-09)
Decisions: Supabase backend; sharing = send a copy to the friend's inbox; live shared folders for groups;
"cards" = vocab words; quiz = solo + live Kahoot-style (host's AI key writes the wrong answers) + saved questions.
- Supabase project **Arabic-Podcast-Studio** (ref `ktzgcohmgmbccvegwxqz`, us-west-2, free tier; pauses after a week
  idle). URL `https://ktzgcohmgmbccvegwxqz.supabase.co`, publishable key `sb_publishable_VttMCOKQYH9FL-kekzhqmg_w9qXTkxt`
  (public by design; data is protected by row-level security). The other project in that org is an old paused one.
- Schema: `supabase/schema.sql` (run once in the SQL editor, idempotent): profiles (username), friendships
  (+ `accept_friend` RPC), shares, shared_folders/members/words, game_invites, realtime publication.
- Google provider enabled in Supabase with Client IDs = web client
  `419555269865-0954ljffgrnbveq04lvh3ii6c032rhv3.apps.googleusercontent.com` (new, type Web, "Arabic Podcast Studio Web
  (Supabase sign-in)") + the desktop client. No client secret stored (only the ID-token flow is used).
- Sign-in plan: desktop sends its Google id_token (openid scope; refresh also returns one) to Supabase
  `signInWithIdToken`; Android needs Credential Manager `GetGoogleIdOption(serverClientId = web client)` for an ID token
  (the Authorization API used for Drive returns no ID token).
- Build stages: 1 accounts+usernames, 2 friends tab, 3 sharing inbox, 4 shared folders, 5 quiz (solo, live, saved).
- **Stages 1–2 done, tagged v0.6.0** (2026-10-09): `web/js/social.js` (Supabase client, lazy-loads
  `web/js/vendor/supabase.js` = supabase-js 2.117.1 UMD), Settings section `web/js/components/account.js`,
  Friends tab `web/js/pages/friends.js` (+ nav badge via `startBadge()`), desktop `/api/sync/id-token`,
  Android `GoogleDriveAuth.getIdToken` (Credential Manager). Privacy rules self-test: `supabase/test_rls.sql` (15/15).
  v0.6.0 tested by the owner ("Done").
- **Stage 3 done, pushed to main (commit a48b524), NOT yet tagged** (2026-10-09). The owner changed the design:
  sharing = a message of kind `share` in a friend-to-friend chat (the `shares` table is retired); chat has text +
  voice notes (MediaRecorder → private Storage bucket `voice`, path `<idA>_<idB>/<uuid>.webm`, signed URLs);
  "What I'm studying" card + personal note shown ONLY on the Friends tab, friends-only (`statuses` table): podcast
  episode from the library, or pasted YouTube/Spotify link via their oEmbed endpoints (owner chose paste-a-link over
  the Spotify Web API). Files: `web/js/pages/chat.js`, `web/js/components/studycard.js`, `friends.js`, `vocab.js`
  (send buttons), `social.js`; schema v2 section in `supabase/schema.sql` (applied); `test_rls.sql` 25/25.
  Tweaks (commit a6c4691, schema v3 applied, test_rls 29/29): messages are ephemeral like Snapchat (text deleted
  once seen + chat left, voice once played incl. the file, share cards once added/dismissed, all after 30 days;
  RPCs mark_seen / clear_seen / dismiss_message / purge_old_messages); study card = up to 3 items, adds Apple Music
  (iTunes lookup + oEmbed, embed.music.apple.com player) and IMDb (v3.sg.media-imdb.com suggestion JSON; the IMDb
  page itself is bot-blocked); editor has a "What can I paste?" guide; blank bars are not stored.
  Android got RECORD_AUDIO. Untested: mic recording on real devices, two real people. The browser pane loses its
  Supabase login after restarts (owner signs in with GitHub). Next: tag v0.7.0 when the owner says so, then
  stage 4 (shared folders UI) and stage 5 (quiz).

## Web pages (built 2026-10-09, after v0.7.0)
- "Add a webpage" box above "Add a podcast" (placeholder "Paste website URL") + big "Open Web Browser" button.
- A page = an episode of the built-in feed `local:pages` ("My webpages"): `audio_url` = the address,
  `audio_type = text/html`, status done, its text stored as the transcript (one segment per block, new
  `segments.kind` = h1/h2/h3/p/li/q, synced as optional `kinds` in `t_<uid>.json.gz`; word "times" = positions).
  See `app/pages.py`. `player.js` hands such episodes to `web/js/pages/reader.js` (clickable words, same bubble
  with `noAudio`, save to vocab).
- Text extraction is ONE plain-JS function, `web/js/extract.js`, used on fetched HTML (`pageimport.js` + DOMParser;
  desktop fetches via `/api/web/fetch`, phone via native `CapacitorHttp`) and injected into live pages by both
  in-app browsers.
- Desktop browser = a second pywebview window (`JsApi.open_browser`), toolbar injected on every load from
  `web/js/browser-toolbar.js` (bottom bar: back/forward/reload/address + "Import Page" bottom right); the page can
  only reach `BrowserApi.import_page`. Verified with a real window.
- Android browser = `InAppBrowser.java` (full-screen dialog, own WebView with no bridge, floating Import Page);
  result comes back as a `pageImport` plugin event. Phone-imported pages are uploaded by
  `uploadPendingTranscripts` in `mobile/src/js/sync.js`. Compiles in CI; never run on a real phone.

## Tamkeen rebrand + UX (2026-10-09; committed locally, NOT pushed/released when written)
- The app is now **Tamkeen** (تمكين). Visible name only: `APP_ID` "ArabicPodcastStudio" (data folder, exe name),
  Android package, Inno `AppId` and install dir are unchanged so updates install in place. Installer/APK files are
  now `Tamkeen-<ver>-...`; macOS bundle is `Tamkeen.app`. Logo: `packaging/brand/tamkeen-logo.webp`; all icons are
  generated by `packaging/make_icons.py` (also Android mipmaps + gradient adaptive background).
- Code/docs links already point at `github.com/christiangilkey/tamkeen` and `christiangilkey.github.io/tamkeen`.
  **The GitHub repo must be renamed to `tamkeen` BEFORE pushing/releasing** (owner chose this), then
  `git remote set-url origin https://github.com/christiangilkey/tamkeen`, and in Google Cloud (Meridian → Google
  Auth Platform → Branding) set the app name to Tamkeen and the home/privacy links to the new Pages address.
- Identity (web/css/app.css, end of file + tokens at the top): teal = actions (owned colour), gold = highlights and
  rewards, plum-to-teal gradient header + Home hero, `--alert` red only on waiting-count badges, rounder shapes,
  press feedback. Applied from the owner's UX research doc as PRINCIPLES ONLY (owner declined creatures/battles/shop).
- Home (`web/js/pages/home.js`, route `#/`; library moved to `#/library`): one main action, Continue. Owner's rules
  (in `web/js/progress.js`, per device, localStorage): podcast/video offered while MORE than 3 minutes remain; web
  page while LESS than 70% read. Else "You're all caught up" + three choices. Phone: labelled tabs Home, Library,
  Vocab, Friends, Settings; search moved to the header. `buzz()` hook = optional phone vibration.
- Shared words carry audio: sender (desktop) cuts a clip of each word's sentence (`audio.cut_clip`,
  `GET /api/vocab/{id}/share-clip`), uploads it to the `voice` bucket as `<conv>/clip-<uuid>.ogg`, and the share
  payload word gets `clip` + `times`. Recipient saves it (`PUT /api/vocab/{id}/clip` → `clips/<uid>.ogg`,
  `vocab.clip = 1`, times become clip-relative) and it syncs between their devices as `c_<uid>.ogg`. The phone can
  receive/play/forward clips but can't cut new ones (shares sent from the phone are text-only unless the word already
  has a clip). Clips are deleted from Supabase when the share is added, dismissed or unsent (not on 30-day purge).

## Guilds, profile photos, online status, swipe tabs, search fix (2026-10-09, after v0.8.0)
- v0.8.0 released from the renamed repo `christiangilkey/tamkeen` (remote updated; Pages at
  christiangilkey.github.io/tamkeen; Google Auth branding now says Tamkeen with the new links).
- Schema v4 (`supabase/v4-guilds.sql`, also at the end of `schema.sql`; applied; self-test
  `supabase/test_rls_guilds.sql` 23/23). Owner's choices: a person can be in ANY NUMBER of guilds, any member can
  invite their own friends, the founder renames/removes members; 50-member cap is mine. Guild-mates count as
  "connected" (`are_connected` = friends OR share a guild): they see each other's status card, presence and can
  message. RPCs: create_guild, accept_guild_invite, leave_guild(g), remove_guild_member(g, person).
- Profile photos: public bucket `avatars`, `<uid>/<ts>.webp` (cropped square 256px in the browser),
  `profiles.avatar_path`. Component `web/js/components/avatar.js`.
- Online/offline: `presence` table + `heartbeat(online)` (once a minute while visible, "gone" on hide) and
  `seen_ago(ids)`; online = seen within 150 s. Green/grey dot on avatars.
- Friends tab rewritten (`web/js/pages/friends.js`): me card (photo, tags, study card), "Waiting for you"
  (friend requests + guild invites), Guilds, friends (online first).
- Handy: the Supabase SQL editor page CAN fetch from raw.githubusercontent.com, so push a .sql file and load it
  with `fetch(...)` + `monaco.editor.getEditors()[0].setValue(sql)` instead of pasting (verify the SHA-256).
- Phone: swipe left/right between tab sections with a sliding highlight blob (`mobile/src/js/swipe.js`; the shell
  fires a `routed` event). Uses timers, not animation frames, so a hidden page can't get stuck mid-slide.
- Search fix: the search page has its own box (the phone header has none); desktop header no longer pushes the
  search bar off-screen; a hit inside a web page opens the reader at that paragraph (`?t=<word index>`).

- Update popup on app open (`web/js/updatenotice.js`): desktop asks `/api/updates/check` 2.5 s after start; the
  phone build stamps its version into `www/js/version.js` (build-www.mjs, from APP_VERSION) and asks the GitHub
  releases API itself. Links only to github.com. Running from source shows nothing (GITHUB_REPO is a placeholder
  that the release workflow fills in). The old repo name still redirects, so older installs see updates too.
- Separate web-page text size: `page_font_size` (default 17) with its own slider; transcripts keep `font_size` (26).

- **v0.9.0 released 2026-10-10** (guilds, photos, presence, swipe, search fix, page text size, update popup).
  Found that day: the owner's DESKTOP was still on v0.4.0 (they had only been updating the phone); told them to
  install v0.9.0 over it. From v0.9.0 the app announces new releases itself.

## Languages (built 2026-10-10; released as v0.10.0 the same day, not yet tested by the owner)
The app no longer assumes Arabic. It teaches Spanish, Arabic, French, Japanese, Chinese and Russian.
- **One table**: `web/js/languages.js` (direction, sample text, popup labels, word-spacing rules; shared with the
  phone) and `app/languages.py` (codes = Whisper codes, script detection). Add a language in both.
- **Setting `study_language`** ("" until chosen). First run shows a picker on the welcome screen (desktop and
  phone, `components/langpicker.js`); also in Settings. An install from before this is migrated to "ar"
  (`db._migrate` on desktop, `store.loadSettings` on phone). Settings are per device, not synced.
- **`episodes.language`** (synced in library.json): set when transcribing (the study language at that moment)
  and when importing a page (judged from the page's letters). Missing = Arabic. So a library can mix languages
  and old Arabic episodes stay right-to-left whatever is studied now.
- **Whisper** gets `language=` (same multilingual models, nothing new to download); Chinese gets a
  simplified-characters prompt.
- **AI popup** (`definer.js`): `TEACH` per language feeds the system prompt and field descriptions. Field names
  are unchanged (`vocalized` = reading: tashkeel / stress / kana / pinyin / IPA; `root` = Arabic root or kanji/hanzi
  breakdown; `msa_equivalent` = standard form). Cache keys for Arabic are unchanged.
- **Japanese/Chinese words**: stored as Whisper/whitespace pieces; `regroupWords()` turns them into words on
  the device with `Intl.Segmenter` when a transcript or page opens (times interpolated). No spaces are drawn
  between words (`gap()`).
- **Direction/fonts**: elements carry `lang` and `dir` (`langAttrs`); CSS picks `--ar-font` by `:lang()`.
  The CSS class is still called `.ar` (means "study text").
- Not done: accent-insensitive search for Spanish/French; UI itself is English only; sharing a word does not
  carry its language (shown by script detection). Never tested with real Japanese/Chinese audio, only unit
  tests and an imported Chinese page in the preview.
- Tests: 103 pytest (`tests/test_languages.py`), 38 JS (`tests/js/languages.test.mjs`).

## Creature game (started 2026-10-10, after v0.10.0; committed locally, NOT pushed/released when written)
The owner reversed the earlier "no creatures" decision: gamification is now the big project. Their design
docs are in `D:\Ammo (content)\Language App\` (design notes, procedural creature reference, evolution ideas,
incremental games, make-XP-fun). **Pixel art is drawn by another Claude session**; the brief is
`game/ASSET_LIST.md` (phases 1-3, exact names/sizes/sockets/key palette). Art lives in `web/game-art/`;
all 167 phase-1 files are placeholders from `tools/make_placeholder_art.py` (never run it with `--all`
once real art arrives). Real art replaces files one for one, same name and size.
- Code: `web/js/game/` (shared with the phone via build-www): `data.js` (all content as data + `artFiles()`,
  the single list of art), `genome.js` (seeded creature: seed + growth + traits -> look), `rules.js` (what
  studying earns; pure, tested), `render.js` (canvas compositor: parts on sockets, palette swap, patterns),
  `game.js` (saved state, `reward()`, effects and synthesised sounds), `habitat.js` (scene at the bottom of Home).
- Built so far (slice 1): egg -> hatchling -> juvenile -> adult with 3 branch forms chosen by study habits
  (echo/sage/keeper = listening/reading/collecting); variable XP on word lookups (70/20/8/2 odds, combo
  multipliers, particles, pop, sounds, screen shake on jackpot); XP for saving words; study minutes counted
  in the player and reader; daily goal (5/10/20 min) as the big payout; streak with freezes; levels; coins
  (nothing to spend them on yet).
- Rules chosen on purpose: a word pays once a day; rewards fade fast within a day; the daily goal pays the
  same whatever its size. Combo window is 30 s, not the 5 s in the owner's doc (5 s is too short to read a
  definition and would reward mashing); the owner was told and can change `COMBO_WINDOW_MS`.
- State is saved in the `game_state` setting and **syncs through library.json** (`game` field): the newer
  save wins, except an unplayed egg never replaces a game with XP (`engine.game_wins`, `sync.js gameWins`,
  `game.js adopt`). Devices hear about a newer save through the `tamkeen:game` window event.
- Slice 2 (same day): **shop + wardrobe** (`shop.js`; `ITEMS`/`DECOR` in data.js; `buy/equip/placeDecor/
  shopStock` in rules.js). Six items a day, seeded by day + creature, weighted by traits; some need tags
  (`night_owl`, `early_bird`, `streak_7`). Hats/glasses/neckwear/held items ride on sockets; decorations
  stand in the habitat. Coins: 10 per daily goal, 1 per saved word, 5 per level.
- Not built: shirts, more habitats, the incremental (idle) layer with prestige, battles (normalised levels,
  recall checks), friend leagues, raids, gifting. Next suggested: idle layer -> battles.
- Never tested on a real phone or between two real devices. Tests: `tests/js/game.test.mjs` (13). Totals
  104 pytest, 51 JS.

### Creature game, slice 3 (2026-10-10, late): battles as vocab review, roster, evolution choices
- **Read `game/CHECKLIST.md` first**: every requirement of the owner's five design docs with its status.
  The owner asked for nothing to be left out; keep that file current.
- **Owner's rules (override the docs):** battles are reviews of each player's own vocab; battles need
  >= 100 saved words (`BATTLE_UNLOCK_WORDS`).
- **Real art has arrived**: the art session wrote all three phases straight into `web/game-art/` (sizes
  verified), retuned the creature colours in `genome.describe` ("soft neon"), and left its generators in
  `tools/game_art/` and previews in `game/art-preview/`. Never run `make_placeholder_art.py --all`.
- New code: `battle.js` (engine: same level for all, 26 moves, 6-element cycle, combo within 5 s ->
  x1.2/1.5/2 "surge", weekly rules, rental pool, wild bonus), `battle-ui.js` (menu with the 100-word gate,
  arena, question panel, hint cards), `creatures.js` (roster, evolve choice, forms, move picking, badges).
  `rules.js` now also holds: roster (`state.roster`, `state.active`; `state.creature` is an accessor, not
  saved), `evolve/reshape/branchOptions/variantOptions/layEgg`, the review boxes (`state.review`,
  `pickQuestion`, `answerQuestion`: a word is "well known" at box 4), `finishBattle`, `checkBadges`.
- Evolution is now the owner's choice: a grown creature waits as a juvenile and sparkles; tap -> choose
  form. Special forms: Twin (company), Nocturne (night study), Champion (battle feat). All switchable.
- Tested in the desktop preview: gate at 8 words, a full wild battle with real answers, evolve to
  Sage + Nocturne, the XP chip with combo fuse. Not tested: phone, rental duel on screen, hint button.
- **Next, in the owner's order of interest**: friend battles (async defence teams; needs new Supabase
  tables, so ask before running SQL), then leagues/raids/gifting, then the idle layer, then shirts and
  chain physics. Tests: 104 pytest, 60 JS.

### Creature game, slice 4 (2026-10-10/11): friends online, 113 wearables
- **Supabase schema v5 is applied** (`supabase/v5-game.sql`: `game_profiles`, `battles`, `gifts`, RPCs
  `mark_battles_seen`, `claim_gift`). Self-test `supabase/test_rls_game.sql` passed 20/20. Run the same way as
  before; without a push, paste via `String.raw` in the SQL editor and verify the SHA-256.
- `web/js/game/friends-game.js`: the game's Friends page (gifts and battle results waiting, league table with
  Challenge buttons, guild raid). `social.js` has the calls (`publishGame`, `gameProfiles`, `reportBattle`,
  `battleInbox`, `sendGift`, `claimGift`). `battle.publicProfile` is everything shared: never words.
  A friend's team is checked before it fights (`battle.fits`, `checkedMoves`). Privacy policy updated.
- Items: `data.WEARABLES` -> 113 wearables in slots hat/face/neck/held/back/shirt (+24 decor). Shirts render
  (`render.shirtedTorso`), back items draw behind, held items use `data.HANDS`, items take `shift`/`offset`.
  All 113 now have hand-drawn Aseprite art (2026-10-11; sources in `game/art-src/item/`, who drew what in
  the side-session note `wearables-session-handover.md`). Checked in the desktop preview: 113 wardrobe
  cards load, and a creature wears one item per slot in the habitat. Not committed, not released.
- **Owner (2026-10-10): the creatures will be redesigned soon. Do not tune how items sit on the current
  bodies.** `tools/preview_items.py` is ready for the later fit pass.
- **The art session is still writing into `web/game-art/` in parallel** (it added files beyond the brief:
  eyes_big, shadows, evolve/surge effects, icons). Commit its files; never overwrite them.
- Asked by the owner, not built: an Anki companion add-on so Anki reviews feed the game (none exists).
- Untested: everything online between two real accounts (only the database rules were tested), the phone.
  Tests: 104 pytest, 65 JS.

### Anki companion (2026-10-11) — on git branch `anki-companion`, NOT on main (owner's choice)
- The owner asked whether an Anki add-on existed (it didn't) and wanted it built, on its own branch.
- `web/anki-addon/` (`__init__.py` = Anki hooks, `core.py` = pure logic, `manifest.json`). The app builds the
  installable file on request (`GET /api/anki/addon` -> `Tamkeen-Anki-Companion.ankiaddon`, with the app's
  data folder path inside). On start the app writes `companion.json` (port + token) in its data folder; the
  add-on reads it and posts daily totals to `POST /api/anki/report` (header `X-Tamkeen-Token`). Server keeps
  14 days in settings (`anki_days`); the UI credits them through `rules.earnAnki` (idempotent per day).
- Settings has an "Anki companion" card (download + status). Privacy policy has a section.
- Gotcha fixed: `game.js` loads while `app.js` is still starting, so `on(...)` must not be called at module
  load there (the event map isn't initialised yet); it registers on first `getGame()`.
- NEVER run inside real Anki yet. Tested by `scratchpad/fake_anki.py`-style flow: download the add-on from
  the running app, run its `core.py`, post, and watch the habitat credit it. Tests: 108 pytest, 70 JS on the branch.
- To ship: merge the branch into main, then release as usual.

### Export for Anki in the owner's card design (2026-10-11) — branch `anki-export`, NOT on main, NOT committed
- Lives in its own working copy, `C:\Users\chris\Documents\arabic-tts\tamkeen-anki-export` (a git worktree of
  this repo), so it stays clear of the other sessions working here. Nothing is committed yet: the owner has
  not been asked. To ship: commit there, merge `anki-export` into main, release as usual.
- **The card design** is the owner's own Anki layout, built the same day in `..\anki-card\` (front.html,
  back.html, style.css; `apply.py` puts it on their "Basic" note type through AnkiConnect, `--restore` undoes
  it). The app carries a copy in `web/anki-card/`; keep the two identical. Owner's rules: **the timer and the
  Image field must stay exactly as they were** (same markup, place, font), and the image field is the most
  important one: never write to it. The layout's script only reads the fields and draws a copy, because the
  owner edits fields during review (`{{edit:…}}` add-on) and a changed field would be saved back.
- Fields are Front, Back, image, TTS Input. A word becomes Front = its sentence translated (into the
  "explanations in" language, English by default) with the word's meaning in brackets
  (`The girl was [confused] by the question.`), Back =
  `<b>word</b><br>sentence with the [word]<br><i>(kind • Label: value)</i><br>Note: …`
  (`exporters.anki_fields`, mirrored by `ankiFields` in `mobile/src/js/shared-logic.js`, parity-tested).
- **Where the Front's sentence comes from** (added later the same day): the AI lookup is now asked to put
  ⟦ ⟧ around the part of `sentence_translation` that renders the tapped word (`definer.js`: prompt, schema
  text, and `normalize`, which keeps the popup's copy clean and puts the marked one in `translation_marked`).
  Saving from the popup stores it with the word: `vocabFromDefinition` → `POST /api/vocab` → new column
  `vocab.translation` (added by `db._migrate`; synced through Drive on both sides). `exporters.anki_front` /
  `ankiFront` turn the marks into brackets. **The Front falls back to the meaning** (as before) when a word has
  no translation with usable marks: words typed in, saved with right-click "Save to vocab", received from a
  friend, or saved before this existed. For an answer cached before the change (no marks), saving looks for
  the meaning in the translation and marks it when it appears exactly once as whole words (`markMeaning` in
  `languages.js`); otherwise the plain translation is stored and the Front is the meaning. Pressing ↻ in the
  popup asks the AI again and gets a marked answer.
  - A device still on an older version sends words without `translation`; both merges keep the one already
    known (same idea as `episodes.language`). Cards already in Anki keep their old front (re-import never
    changes a card).
  - `tests/fixtures/parity.json`: its `anki` and `csv` entries are the output of `exporters.vocab_to_anki` /
    `vocab_to_csv` for the word list in `tests/js/mobile-parity.test.mjs`; regenerate both when either changes.
  - Checked in the running desktop app with made-up cached answers (popup → Save → export → the layout
    highlights the bracket). **Not checked with a real AI provider** (no key was used), so how reliably each
    model adds the marks is unknown; when one doesn't, the card simply shows the meaning. The phone's sync
    code has no automated test; it was run by hand against stand-in storage.
- Desktop: the button downloads **`tamkeen-vocab.apkg`** (`app/anki_deck.py`, no new dependency): note type
  and deck "Tamkeen" with fixed ids, the font, and two MP3 clips per word (word, sentence) cut by
  `audio.cut_clip(kind="mp3")` and cached in `<data>/anki-clips/`. Only audio already on the computer is
  used. Phone: still a text file, same cards, no audio (clips are only cut on the computer).
- Re-importing never changes a card already in Anki: one guid per word (`tk-<uid>`), notes dated by
  `created_at`, text file says `#if matches:keep current`. Consequence: a word first sent from the phone
  will not gain audio from a later desktop export. Raise `anki_deck.LAYOUT_DATE` when the layout changes.
- Verified by importing a real export into a throwaway collection with the `anki` Python library 26.09.3
  (new/duplicate counts, image field kept, text file matched by guid). Not yet opened in the real desktop
  Anki or AnkiDroid. Tests on the branch: 116 pytest, 67 JS.
- **Changed after v0.11.0 at the owner's request (2026-10-11/12). Committed on branch `anki-export` in the
  worktree `../tamkeen-anki-export` (71b1830, merge of main at b9a4bc6, ed8a30f). **Merged into main on
  2026-10-12 at the owner's request ("commit, merge"): main was fast-forwarded to ed8a30f. NOT pushed, NOT
  released** (main is 3 commits ahead of origin). The main checkout had other chats' unsaved edits in five
  files the branch also changes (app/audio.py, mobile/scripts/build-www.mjs, mobile/src/js/app.js,
  tests/test_clips.py, web/css/app.css); each was three-way merged by hand around the fast-forward, so
  those edits are still there, unsaved, on top of the new main (tests after: 193 pytest, 218 JS). One
  leftover for whoever commits them: tests/test_clips.py now has `test_sync_copy_is_made_for_real` twice
  (the committed one from this branch and another chat's unsaved one); keep one. The worktree now holds
  the "Spaced Repetition System (fork)" chat's unsaved reviewer work on the same branch; it was left alone.
  "Export for Anki" is an **Anki deck file
  (`tamkeen-vocab.apkg`) with audio on the phone as well as the computer**. (A CSV version was built first
  and dropped the same day: the owner wants "a format that anki import accepts" that carries audio, and
  "audio to be importable via phone".) One button on both; the first press shows a popup (`ankiHelp` in
  `pages/vocab.js`, `.help-dialog` in app.css, remembered in localStorage `ankiHelpSeen`) with the steps the
  owner wrote: phone = needs AnkiDroid, pick the Anki bubble (or More), tap AnkiDroid, check the deck's
  formatting; computer = needs Anki, save the file, Import File, check the formatting.
  - **The phone builds the deck itself**, in new files so nothing shared is rewritten:
    `mobile/src/js/ogg-clip.js` (cuts a clip out of an Ogg Opus file by copying its packets, no decoding;
    sample-exact), `sqlite-file.js` (writes a small SQLite file from scratch: leaf/interior/overflow pages,
    no indexes), `anki-deck.js` (the deck: same ids, layout, notes and cards as `app/anki_deck.py`, plus a
    store-only zip), `anki-export.js` (gathers each word's audio). Wired in `mobile/src/js/app.js`
    (`exportDeck`, `writeBytes`, `download`) and `build-www.mjs` (copies `web/anki-card`).
  - **Where the phone's audio comes from:** the episode's synced copy `a_<uid>.ogg` (kept on the phone once
    played, else fetched from Drive at export), or the clip of a word a friend shared. Episodes with no such
    copy (streamed originals, the owner's videos/audio files, web pages) export without audio. Phone clips
    are `tk-<uid>-w.ogg` / `-s.ogg` (Opus); the computer's are `.mp3`.
  - AnkiDroid's manifest (main branch, read 2026-10-11) accepts a shared file (ACTION_SEND) of type
    apkg/octet-stream, so the share sheet reaches it; `vocab_to_anki` (the text export) is now unused by
    the buttons but kept.
  - Tests: `tests/js/anki-deck.test.mjs` (Node's built-in SQLite reads the phone's database back; `ankiDeck`
    in `tests/fixtures/parity.json` is what the Python builder writes for the parity word list, with no
    audio; `tests/fixtures/tone.ogg` is a 10 s tone made by `audio.encode_speech_copy`). Also verified by
    importing a phone-built deck of 403 words into a throwaway collection with the `anki` library 26.09.3
    and decoding its clips with PyAV. **Not checked on a real phone** (share sheet, AnkiDroid playing the
    .ogg clips, memory with very large decks). 131 pytest, 109 JS.
  - Gotchas: `platform` cannot be read when `vocab.js` loads (app.js is still starting), only inside
    functions. A `<dialog>`'s "close" event waits for the next repaint, so the popup answers from its
    buttons' clicks.
  - **Review progress travels in the deck (2026-10-12).** The owner asked for exports that "carry full
    scheduling" (due dates, intervals), keeping the formatting and audio. The game's record for a word,
    `state.review[uid] = [box, day next due, right, wrong]` (`web/js/game/rules.js`), becomes the card's
    schedule: box >= 1 -> a review card (type 2, queue 2), interval = `INTERVALS[box]` days, due = days from
    the export day (never negative: overdue means due today), ease 2500, reps = right + wrong, lapses =
    wrong; box 0 or no record -> a new card. `anki_deck.card_schedule` / `cardSchedule` (parity-tested through
    `ankiDeck.schedule` in parity.json); the desktop route reads `game_state` from settings, the phone
    `settings.game_state`. `col.crt` is the export time, and Anki shifts the due days into the importing
    collection (checked in a fresh one and one made 400 days "old"). Anki applies it only when **"Import any
    learning progress"** is ticked; unticked, every card arrives new (both checked with the `anki` library).
    **The review log stays empty**: the game records no single answers, and none are invented. The popup has
    a step for the tick box. `.colpkg` was not used: importing one replaces a person's whole Anki collection.
    174 pytest, 191 JS.
- **BUG STILL IN v0.11.0 - v0.14.0 AND ON MAIN (committed), fixed on this branch:** `audio.encode_speech_copy` (the audio copy the
  phone plays) raised NameError since commit e3c8b46: a text replace meant for `cut_clip` also hit it. The
  desktop logged a warning and skipped the copy, so episodes transcribed on v0.11.0 have no `a_<uid>.ogg`
  (the phone streams the original, and they get no audio in a phone export). Once fixed, the next sync makes
  and uploads the missing copies by itself (`engine` retries rows with `remote_audio = 0`), provided the
  downloaded audio is still on the computer. No test caught it because both tests that reach it swap the
  function out; `tests/test_clips.py::test_sync_copy_is_made_for_real` now runs it.
  (2026-10-12: the main checkout has the same fix as an uncommitted edit by another chat; merging this
  branch brings the fix and the test either way.)

### Add audio, and the app's own icons (2026-10-11, committed locally on main)
- **Add audio**: a button right of "Add video" in the Library. Audio files go through the same path as videos
  (`app/videos.py`: `AUDIO_TYPES`, feed `local:audio` "My audio", still named `v_<uid><ext>` in Drive; the
  upload endpoint `/api/videos` decides by file extension). `audio_type` (audio/* vs video/*) picks the player.
  Phone: `uploadVideo` in `mobile/src/js/app.js` handles both.
- **Icons**: `web/js/icons.js` (shared) holds the app's line icons as SVG; `icon(name, size)`. The phone's tab
  bar and search button use them through `data-icon` attributes filled in at boot; the Library uses them for
  built-in feeds and the add buttons. Styles for the tab bar are in `mobile.css`. The owner asked for
  non-emoji icons "at the bottom" (the phone tab bar); other emoji in the app are unchanged.
- Another session had uncommitted edits in `web/css/app.css`, `web/js/app.js` and `web/js/game/*` at the time,
  so this work deliberately touched none of those files.

### The garden (idle layer) and committing the other chats' work (2026-10-11)
- **Other chats' work committed at the owner's request**: the Aseprite art chat's work on `main` (art, sources
  in `game/art-src`, previews, `game/CREATURE_DESIGN.md`, and its game-code edits), and the Anki card chat's
  work on its own branch **`anki-export`** in the worktree `../tamkeen-anki-export` ("Export for Anki" now
  writes an .apkg in the new card layout, `web/anki-card/`, `app/anki_deck.py`). Not merged into main.
  The folder `../anki-card/` (the owner's personal card templates and scripts) is not in any git repository.
- **The garden** gives uses to art that had none. Rules in `web/js/game/idle.js` (pure, tested in
  `tests/js/idle.test.mjs`), screens in `garden.js` (Garden and Supplies pages of the game sheet), data in
  `data.js` (`STRUCTURES`, `PLOTS`, `FOODS`, `SUPPLIES`). State: `state.idle` (plots, glow, stardust, released,
  ledgers), `state.gems`, `state.items.<supply>`, `state.boostUntil`, `state.incubating`, `creature.bond/fed`.
  Small hooks in `rules.js` (XP boost, ticket, incubator) and `battle.js` (`usePotion`, wild battles only).
- Gems are paid by a ledger inside `idle.tick` (it compares badge, raid and league counts with what it has
  already paid), so nothing else needs to remember to pay them.
- Branches now: `main` (everything except the two Anki pieces), `anki-companion` (Anki review add-on),
  `anki-export` (Anki deck export). Tests on main: 106 pytest, 74 JS.

### Both Anki branches merged into main (2026-10-11, at the owner's request; local, not pushed when written)
- `anki-export` merged cleanly; `anki-companion` had one conflict (`web/js/game/game.js`: imports and one
  label line), resolved keeping both sides. Tests on main after both: 122 pytest, 81 JS.
- Checked in the preview: Home with habitat and garden, Settings "Anki companion" card, add-on download,
  and `GET /api/vocab/export/apkg` returning a real deck file.
- Still true: the add-on has never run inside real Anki; the deck has not been imported into real Anki by me.
- The branches and the worktree `../tamkeen-anki-export` still exist; they can be deleted once the owner is
  happy. The Anki card chat may still be using that worktree.

### Friends-list game bar (2026-10-11, in a forked chat; committed locally as afd3aa8 (only its own hunks), NOT pushed; schema v6 APPLIED)
- Next to each name on the Friends tab (friends, guild members, and my own card): language being learned,
  league icon, XP earned today, and a "showcase" creature (tap for a closer look). `web/js/game/friend-bar.js`.
- Shared through `game_profiles`: new columns `language, xp_day, xp_today, showcase` in
  `supabase/v6-game-card.sql` (**applied 2026-10-11**). Against an older database `social.publishGame`/
  `gameProfiles` fall back to the old columns and the bar shows only the league.
- The favourite is `state.showcase` (a seed; null = the creature in the habitat), set with "Show to friends"
  on the Creatures page. `battle.xpToday` decides when a friend's number still counts as today's (days start
  at each player's own midnight); `battle.showcaseGenome` rebuilds a friend's creature from checked fields.
- `publishNow()` now also runs when the Friends tab opens, so XP today is fresh there; elsewhere it updates
  when Home opens or a battle ends (5-minute throttle). Tests: 122 pytest, 85 JS (`friend-bar.test.mjs`).
- Seen only with made-up profiles in the preview; never between two real accounts.

### Habitat bar explains itself; a word on petting; levels cost 10x (2026-10-11, not committed)
- Owner's requests. Everything in the bar under the habitat is a button now (`data-info` in `habitat.js`):
  XP/level, streak, coins, freeze, glow, gems, hearts each open a small sheet from `web/js/game/info.js`
  (`openEarned`): how you get it, what it does, where it is spent, with a button to that page. The text
  reads its numbers from the rules where it can; **when a rule changes, check the wording in `info.js`**.
- The creature's own chip (`#g-stage`) opens `openEvolution`: stages with XP, the four habit bars for this
  creature, which adult and special forms are open and what opens the rest.
- Petting the creature (or egg) shows a random saved word and its meaning in a bubble over its head for
  3.6 s (`sayWord` in `habitat.js`, `.pet-word` in app.css; a DOM element over the canvas so Arabic stays
  sharp). No saved words: "no words saved yet :(". A creature ready to evolve opens the Creatures page instead.
  Every saved word gets a turn before any repeats, and never the same one twice in a row (`said` /
  `saidLast`); words without a meaning are included and show alone. The bubble and the creature's name tag
  are white on black with a white edge (owner's choice; the `ui/bubble.png` frame is no longer used there).
- `rules.LEVEL_COST = 10`: every player level costs ten times what it did (1,000 XP for the first). Only
  the "Lv" number: creature growth (`ADULT_XP`) is unchanged. Existing saves show a lower level; the coins
  already paid for old level-ups stay.
- Checked in the desktop preview at desktop and phone width. Tests: 86 JS.
- **Curiosity fills 20x more slowly** (owner, 2026-10-12): `rules.HABIT_XP` = 1,500 XP for listening,
  reading and collecting, 30,000 for curiosity. Saves from before are converted once in `normalize`
  (each creature's curiosity ÷ 20, marked by `state.curious20`); a device still on an older version keeps
  the mark but goes on adding curiosity at the old speed until it is updated. Not committed when written.

### Study cards open in the players (2026-10-13, forked chat; committed locally as f15bbf9, NOT pushed)
- On a "What I'm studying" card every item is tappable (whole card or its button), in `components/studycard.js`
  (`OPENERS`): YouTube -> `youtube.watchVideo`; podcast -> find the feed (ask before adding one the viewer doesn't
  follow), then the episode by guid / audio address / title -> `#/episode/id`; reel -> `#/reels/play?at=id` if in
  the library, else `POST /reels/saved/send` and go to `#/reels`; web page -> library copy or `pageimport.importUrl`.
  Spotify/Apple Music keep the in-card mini-player, IMDb opens its page (owner's choice). No player file was changed.
- New card kinds `reel` and `page` (`social.previewLink`, `reelCode`); any https link that isn't a known site is a page.
  New podcast cards also store `guid` and `audio_url`.
- If the in-app player refuses (no captions in the study language, reels not available on this device) the error
  toast offers the original link.
- Tested in the desktop preview with made-up cards: all kinds, both podcast paths, reel in/not in library, editor
  previews don't navigate. Not tested: the phone, two real accounts, a real reel fetched through Instagram.

### Send to a friend: the shared paper-airplane button (2026-10-13, forked chat; committed locally, NOT pushed)
- **One component for every player**: `web/js/components/sendmedia.js`.
  `import { sendButton, mediaFromEpisode } from "../components/sendmedia.js";` then
  `toolbar.append(sendButton(() => mediaFromEpisode(ep, { at: seconds })));` (a getter is read when pressed; a fixed
  item also works). Icon-only, 28px high; `{label: true}` adds the word "Send". `mediaFromEpisode` returns null for
  the user's own audio/video files (they can't be sent); the button then says so.
- It travels as a `share` message with `payload.media` (no database change): ordinary text messages vanish once
  read, share messages wait. `chat.js` shows title + kind + teal **Accept** / Dismiss; after Accept the item is added
  (`acceptMedia`) and an Open button opens it (`openMedia` -> `studycard.openItem`); the message is then dismissed.
- Words travel with a **YouTube video** (re-saved through `POST /youtube`) and a **reel** (new `POST /shared/reel`:
  `app/api/shared.py`, twin route in `mobile/src/js/backend.js`). Not with a podcast (adverts shift the timing per
  listener, so the friend's own copy is transcribed) or a web page (read again from the page). Over ~600 KB of words
  the item is sent without them.
- An app older than this shows such a message as an empty "0 words" share card.
- Tested: `tests/test_shared_media.py` (3), and in the desktop preview the button, items from each kind, the words
  for a YouTube video, and accepting a YouTube video and a reel from the message alone. **Not tested**: a real send
  between two accounts, the chat card on screen (the preview isn't signed in), the phone route.
- The player chats still have to place the button on their toolbars.

### Friends tab: find a friend, collapsible profile (2026-10-13, forked chat; committed locally, NOT pushed)
- `pages/friends.js`: a "Find a friend" search field inside the Your friends card filters the rows by username
  or guild tag (`friendQuery` survives the live redraws; focus is given back). My own profile card (`.me-card`)
  folds to one line with the arrow button; state in localStorage `friends:me-collapsed` (per device).
- Tested in the preview by loading the real friends.js with a stand-in for social.js (the preview copy is not
  signed in to Supabase): see how in this chat's transcript if needed again. Not tested on the phone.

### Friends tab redesign (2026-10-16, forked chat; committed locally as 922bb62, NOT pushed)
- `pages/friends.js` rewritten around a segmented control: Feed (my foldable profile card + friends'/guild-mates'
  study cards, newest first), Friends (requests, Add a friend, Find a friend, my friends, sent requests), Guilds
  (invitations, New guild, guild rows that open to show members). Segment remembered in localStorage
  `friends:segment`; counts on the segments (requests, invitations).
- One row layout `itemRow()` for people and guilds: lead (avatar / `.guild-emblem`), name + tags, status line from
  `social.seenAgo` (`seenText()`: Online / Last seen N min/h/days ago / Not seen yet), game bar (if `gameOn()`),
  `.row-act` line-icon buttons right-aligned. Confirmations use `confirmBox()` on `components/modal.js`.
- New icons in icons.js: message, check, close, userplus, userminus, edit, leave, add (named `add`, not `plus`:
  another chat was adding its own `plus` at the same time).
- Before/after pictures: `../friends-redesign-shots/` (outside the repo). Tested in the preview with a stand-in for
  social.js at 1100 px and 390 px; not with real accounts, not on a real phone.

## Next steps (in order)
0. v0.5.0 is released. Test on the phone: video upload from phone,
   streaming + seeking, captions tap, transcript panel, folder sync. Phone-recorded HEVC video may not play in the
   desktop window (WebView2 codec support) even though it transcribes fine.

### Older steps (done: Android client, v0.4.0 release, phone test)
1. **Create the Android OAuth client** in Google Cloud (Meridian → Google Auth Platform → Clients → Create
   client → type **Android**): package `io.github.christiangilkey.arabicpodcaststudio`, SHA-1 above. No secret.
   Ask me first; I may need to sign in to Google in the browser pane.
2. Bump nothing; tag **v0.4.0** (`git tag v0.4.0 && git push origin v0.4.0`) so the release includes the APK.
   Watch the run via the public API; GitHub hides full logs from the API, so Gradle errors are surfaced as
   annotations (`/check-runs/<job>/annotations`).
3. Help me install the APK on my Android phone and test: sign-in, library arrives, transcripts open offline,
   tap-to-define, vocab save syncs to desktop, "Transcribe" on phone gets picked up by the desktop, adding a
   podcast on the phone makes the desktop fetch its RSS.
4. Remind me to Sign out → Sign in again on the desktop once (my first sign-in was made in Testing mode).
5. Then: README (setup, model choice, measured speed per hour of audio, code-signing explanation), and polish.

## Gotchas learned
- Bash commands in this environment may need Windows paths via `cygpath`; Arabic output needs
  `PYTHONIOENCODING=utf-8`. Anki uses port 8765, so the dev server runs on **8790** (`.claude/launch.json` in
  the parent folder has `podcast-studio` and `mobile-preview` (8791) configs; dev data dir is in the session
  scratchpad).
- The browser pane loses GitHub/Google sign-ins after app restarts.
- Releases: re-run a failed release by deleting and re-pushing the tag (`git push origin :refs/tags/vX` then
  `git push origin vX`). Nothing publishes unless every job passes.
- faster-whisper's own `decode_audio` breaks with PyAV 19; the app uses its own decoder in `app/audio.py`.

### Media import: Trending podcasts and YouTube videos (2026-10-11; on main, NOT committed, NOT released)
Built from the owner's "Media Import section" notes. Nothing here touches the files another chat had open
(`web/css/app.css`, `web/js/game/*`, `friends.js`, `social.js`): the styles are in a new file, `web/css/media.css`
(linked from both `index.html` files).
- **Trending podcasts** (`#/discover`, button "Trending in <language>" under "Add a podcast"). **Source changed
  2026-10-12 from the Podcast Index to Apple's public podcast charts** (owner's choice: the Podcast Index refuses
  sign-ups from Gmail, and Apple's charts need no account or key). All Podcast Index code, keys, secrets and
  workflow steps are gone (`app/podcastindex.py`, `mobile/src/js/podcastindex.js`, `keys.js`).
  - `web/js/trending.js` (pure, tested, shared with the phone) does everything: for the study language it reads
    the top-200 chart of a few countries (`STOREFRONTS`: ar = sa, eg, ae, ma; es = es, mx, ar, co; fr = fr, be;
    ja = jp; zh = cn, tw; ru = ru), keeps the podcasts actually in that language (`inLanguage`: by script, or
    by common little words for Spanish/French), merges them (high in several countries wins), then asks Apple's
    "lookup" for the feed addresses. Each podcast is filed under ONE of Apple's 19 main categories.
  - Its requests go through the platform hook `appleJson(url)`: desktop `GET /api/discover/apple?url=`
    (`app/charts.py`, only allows itunes.apple.com, keeps answers an hour); phone native `CapacitorHttp`.
    The screen (`web/js/pages/discover.js`) also keeps the list for an hour; "+ Add" is the ordinary
    `POST /api/feeds`.
  - Checked with Apple's real charts for all six languages (160 to 300 podcasts each, about a second) and in
    the desktop preview for Arabic, including a real "+ Add". Not checked on a real phone.
  - Limits: charts are per country, so the list is "popular where the language is spoken", not a true
    per-language chart; shows without a public feed (Apple-only) are left out; Apple asks for no more than
    about 20 lookups a minute per device (Arabic uses 4 charts + 4 lookups).
- **YouTube videos** (first a paste-a-link box; since replaced by "Open YouTube", see the later section. A YouTube link pasted in the webpage box still works).
  Decision: the video is never downloaded. It plays in YouTube's official embedded player; only the captions
  are fetched, from the user's own device.
  - A video is an episode of the built-in feed `local:youtube` ("YouTube"): `audio_type = "video/youtube"`,
    `audio_url` = the watch address, `guid` = video id, status done, captions stored as the transcript and
    synced like any other (`model` = `youtube-captions` for hand-written, `youtube-auto` for YouTube's own).
    See `app/youtube.py`; phone twin is `saveYouTube` in `mobile/src/js/backend.js`.
  - `web/js/ytcaptions.js` (pure, tested) asks YouTube's `youtubei/v1/player` as its ANDROID app (then IOS)
    for the caption tracks and downloads the chosen one as `fmt=json3`. Track choice: hand-written in the study
    language, then automatic in it, then the spoken language if the app teaches it. **This is unofficial and
    YouTube changes it now and then; when adding videos breaks, fix this one file.** Its requests go through
    the platform hook `ytRequest` (desktop: `POST /api/youtube/request`, which only allows youtube.com;
    phone: native `CapacitorHttp`).
  - `web/js/ytmedia.js` wraps the IFrame player so `player.js` drives it like an `<audio>` element (position is
    estimated between YouTube's reports so the highlight is smooth). In `player.js`, `yt` mode puts the
    clickable captions BELOW the video and the word popup in the transcript panel, because YouTube forbids
    drawing over its player. Hand-written captions only time whole lines, so tapping a word there plays its
    line (`lineTimed`).
  - 2026-10-13: the popup now opens in the transcript the word was tapped in. On a computer (> 640 px) a
    caption tap docks it under the captions inside `.yt-col` (`bubble.show(..., {host, docked: true})`, new
    options in `components/wordbubble.js`; CSS `.player.yt .word-bubble.docked` in media.css), so the video
    gets shorter while it's open and the side panel is left alone. A side-transcript tap shows it in the
    panel as before. Phones are unchanged (sheet). All videos (YouTube and own) also have a slim handle on
    the panel's edge (`#panel-handle`, `chevron` icon, CSS in app.css; hidden ≤ 760 px) doing the same as the
    "≡ Transcript" button and T; folding the panel closes a popup that was in it. Checked in a real
    pywebview window at 1280 px and 390 px.
  - Checked in the desktop preview with real videos (hand-written Arabic, automatic Arabic 2 h long, no
    captions, a YouTube link in the webpage box) and at phone width. **Not checked: the real desktop window
    (WebView2) and a real phone** (embedding and the native caption request there).
  - Known gaps: a word saved from a YouTube video can't replay its sound from the Vocab page (its link opens
    the video at that moment); no shared caption cache between users (each user's captions sync through their
    own Drive); "lemmas" = the clickable words, with the dictionary form coming from the AI popup as before.
- Privacy policy has two new sections (Trending podcasts, YouTube videos). Test servers for this work: launch
  configs `tamkeen-media` (port 8797) and `tamkeen-trending` (port 8812). Tests: 133 pytest (`tests/test_media.py`), 102 JS
  (`tests/js/youtube.test.mjs`, `tests/js/trending.test.mjs`).

### First-run boxes, API-key help, cheaper default models, common words (2026-10-11; on main, NOT committed, NOT released)
Built in the chat "API key setup and onboarding flow". Checked in fresh desktop and phone previews
(launch configs `tamkeen-onboarding` 8798 and `tamkeen-onboarding-phone` 8799). **No real API key was
used**, so the new default models have never answered a real lookup: press "Test with an example".
- **Default models** (`web/js/definer.js` `PROVIDERS`): each provider's `defaultModel` is now its best-value
  one, from the providers' own price lists that day: `claude-haiku-5-5` ($0.10/$0.50 per million tokens),
  `gemini-3.1-flash-lite` ($0.25/$1.50), `gpt-6-luna` ($0.10/$0.50), `grok-4.3` ($1.25/$2.50). Not the
  absolute cheapest for two: `gemini-2.5-flash-lite` is older, `grok-build-0.1` is a coding model. `models`
  is now a list of `{id, name, note}`. A saved choice of `""` means "the recommended one", so an install
  that never chose a model moved from Opus 5.5 to Haiku 5.5; anyone who chose one keeps it.
- **Settings → Word definitions** is one shared card, `web/js/components/aisetup.js` (desktop and phone),
  and since later on 2026-10-11 (owner's request, NOT committed) it is the FIRST card on the page, compact
  (two columns on the computer), with a gold "Required" tag top right that becomes "✓ Set up" once the
  chosen provider has a key. The key row is gold-edged with a primary "Get your … API key" button while
  there is no key; "I'm stuck" sits beside it. The model list is the card's own menu (not a native
  select) so it can carry a banner, "1 million tokens ≈ 800 definitions", and each model's price as ONE
  figure in cents per million tokens. That figure is `centsPerMillion()` in `definer.js`: the provider's
  read and write prices (`in`/`out` on each model) blended in the mix a lookup uses (`LOOKUP_TOKENS`,
  850 in + 400 out: an estimate from the size of the request, never measured with a real key).
  The key is saved the moment it is pasted (it used to wait until the box was left, so a paste showed
  nothing: the owner reported "my key isn't working when pasted in"), tidied of spaces and quote marks
  (`cleanKey`), and filed under the provider its prefix names (`keyProvider`: a Gemini key pasted with
  Claude selected switches the provider). A line under the box says what happened. NOT committed.
  2026-10-12 (owner's requests, NOT committed): the get-key button is the brand's teal-blue in both
  states (`.btn.key-get`); a provider refusing the key now reads "…rejected the API key. It has most
  likely expired, so you probably need a new one." (`definer.js keyRefused`; the error carries
  `keyRejected`, and Settings then shows a "Key not working" tag and frames the key row again); and
  the card ends with **"Tokens used today on this computer/phone: N (n lookups, about x¢)"**, a running
  total kept in localStorage per device (`web/js/tokenuse.js`, fed by `definer.js onUsage` from each
  provider's own usage figures; cached answers cost nothing and aren't counted; resets at local
  midnight). Checked in the desktop preview with a made-up key (real 401 from Anthropic) and with
  stand-in answers for the counter. No real successful lookup was made, so real token figures are
  unseen: they will also show whether the "800 definitions per million" estimate holds.
- **"I'm stuck"** = `components/keyhelp.js`: step-by-step for each provider, opening on the selected one.
  The steps are written from general knowledge of those sites, not checked against them that day.
- **First run** = `components/onboarding.js`, three boxes over the welcome page (desktop and phone):
  language; "complete beginner" or "already started"; the API key and where to set it. Settings
  `onboarded`, `study_level`. Installs with `welcome_seen` already true never see them.
- **"Already started"** counts the language's 1000 most common words as *seen words* (the list built in
  the "Parser XP display and word tracking" chat: `web/js/lexicon/`, `/api/lexemes`). There is no second
  list. `web/js/commonwords.js` does it; lists are `web/js/wordlists/<code>.js`, made by
  `tools/make_wordlists.py` from wordfreq (CC BY-SA 4.0: `licenses/wordfreq.txt`, shown on About).
  Arabic needs the dictionaries, so it waits in the setting `common_words_pending` until they are
  downloaded (`seen.js onceReady` then calls `addCommonWords`); 1000 Arabic spellings are about 620 dictionary
  words. Settings has a button that does the same later ("I already know the basics…").
- The Arabic dictionaries offer (that chat's, in `seen.js`) waits while these boxes are up and shows
  after the `tamkeen:onboarded` window event. Checked in the desktop preview: nothing over boxes 1-2
  with Arabic picked, the offer once the third box is answered.
- Tests: 124 JS (`tests/js/wordlists.test.mjs` is new), 141 pytest.

### Seen words by dictionary form, and the XP popup's multiplier (2026-10-11; on main, NOT committed, NOT released)
Built in the chat "Parser XP display and word tracking". Checked in a desktop preview and a phone-size preview
(launch configs `tamkeen-seen-words` 8805, `tamkeen-seen-words-phone` 8806; the phone one read the dictionaries
from a temporary local copy because they are not published yet). **Never run on a real phone.**
- **Owner's rules:** a word never tapped is purple, a seen one is the ordinary text colour ("white"); a word
  becomes seen **only when it is tapped** (looked up) or saved, not by being played past. What is stored is the
  word's dictionary form + part of speech, never the spelling. Analysis runs on the computer **and** the phone.
  The dictionaries are downloaded only when Arabic is the language being learned, after a prompt that explains it.
- **XP popup fix:** the label showed the XP already multiplied and then "×2" beside it, and two more multipliers
  (the 2x boost and the day's fade) were applied without being shown. `rules.wordMultiplier()` is now the whole
  multiplier; `earn()` returns `base` and `mult`; the popup reads `+24 XP  12 ×2` and the chip uses the same number.
- **Analyzer** = `web/js/lexicon/arabic.js` (pure, shared): the CAMeL Tools table lookup rewritten in JavaScript
  (prefix + stem + suffix, three compatibility tables), then Tamkeen's own choice between readings: corpus
  frequency, how the word was spelled (كتابة is not كتابه), the word before (after a preposition: noun; after
  قد/لم/لن: verb; a sentence opens with its verb), a pronoun table, and dialect detection from giveaway words
  (`MARKERS`) that switches the Levantine / Egyptian / Gulf dictionary on. No Iraqi or Maghrebi dictionary exists;
  unknown words fall back to `fallbackStem`. It is NOT CAMeL's trained disambiguator: a later upgrade could
  build a small table from CAMeL's `disambig-mle-calima-msa-r13` (88 MB, not downloaded) for better choices.
- **Key** = `ar|<lemma, vowel marks off, alef/ة/ى unified>|<v|n|pn|fw|x>`. Broad classes because the four
  dictionaries tag differently; so two same-class words spelled alike without vowels share a key (عَلَم / عِلْم).
  Other languages have no analyzer: `<lang>|<lower-cased spelling>|x` (`words.js`).
- **Dictionaries** = `docs/lexicon/ar-{msa,egy,glf,lev}.json.gz` + `index.json` (3.3 MB together, made by
  `tools/build_lexicon.py` from the CAMeL databases, 126 MB). MSA and Egyptian are GPL v2, Gulf and Levantine
  CC BY 4.0: see `docs/lexicon/README.md`, `licenses/camel-tools.txt` (shown on About). The apps fetch them from
  `https://christiangilkey.github.io/tamkeen/lexicon/` (`app/lexicon.py`, `mobile/src/js/lexicon-store.js`), so
  **they only work in a released app once `docs/lexicon/` has been pushed** (GitHub Pages serves `/docs`).
  Running from source, the computer copies them from `docs/lexicon/` instead. Checksums are verified.
- **Storage:** table `known_lexemes` (key, lang, lemma, pos, root, deleted, times); phone `lib.lexemes`. API
  (both platforms): `GET/POST /lexemes`, `POST /lexemes/forget`, `GET /lexemes/lookups`, `/lexicon/status`,
  `/lexicon/download`, `/lexicon/remove`, `/lexicon/data/<name>`. Synced in library.json as `lexemes`
  (newest change per key wins; "new again" is a tombstone).
- **Screen** = `web/js/lexicon/seen.js`: `seenWords({tokens, lang, els})` used by `player.js` (transcript and
  video captions) and `reader.js`; class `new` on a word, colour `--new-word` at the end of `app.css`. The exact
  top-bar plum `#360032` is unreadable as text, so it is the same hue lightened (`#dc84d4` dark, `#8f1d84` light).
  Right-click / long-press has "Mark as seen" / "Mark as new". Settings has a dictionaries line. The first time
  a language's words can be worked out on a device, words looked up or saved earlier are counted as seen
  (`backfill`, setting `lexemes_backfilled`). The `tamkeen:lexemes` window event makes open screens reload.
- Tests: `tests/js/lexicon.test.mjs` (14, reads the real dictionaries), `tests/test_lexicon.py` (8).

### Web Browser start page (2026-10-11, "Media import" chat; on main, NOT committed, NOT released)
The owner asked that "Open Web Browser" open on a home page with popular news sources in the study language
and a Google search bar (it used to open google.com).
- `web/js/browser-home.js` (pure, tested in `tests/js/browser-home.test.mjs`): the table `NEWS` (16 sites per
  language: name as the site writes it, address, short note; a note starting "Easier" marks learner news and
  is listed first), `homeBody(lang)`, `HOME_CSS`, `homeHtml(lang)`. To change the sites, edit `NEWS` only.
  Every address was checked to answer on 2026-10-11 (some refuse automated checks with 403 but are live).
- Computer: `web/browser-home.html` (served by the app's own local server) renders it; `JsApi.open_browser`
  opens `pages.browser_home(server_url)` when nothing was typed in the webpage box. `browser-toolbar.js`
  shows an empty address box on that page. Typing an address or words first still goes straight there.
- Phone: `openBrowser` passes `home: homeHtml(lang)` to the plugin; `InAppBrowser.open` got a `home`
  parameter and shows it with `loadDataWithBaseURL` under the made-up address `https://start.tamkeen.invalid/`
  (blank in the address box) when no address is given. "Open YouTube" passes an address, so it is unaffected.
- Site icons come from Google's icon service (`google.com/s2/favicons`); the first letter shows until one loads.
  Privacy policy mentions this and the search box.
- Checked in a desktop preview at computer and phone widths (launch config `tamkeen-browser-home`, port 8811).
  **Not checked: the real desktop browser window, and the phone (Java not compiled here; CI builds it).**
  Tests: 145 pytest, 135 JS.

### YouTube player on the phone: slim banner, popup under the captions (2026-10-11, "Player look" chat; not committed)
Owner's request, for the phone app only (they said the desktop layout is fine as it is). Touches only
`web/js/pages/player.js` and the "YouTube player" section at the end of `web/css/media.css`.
- Up to 760 px wide, in `yt` mode: the player banner is one slim line (back, title, Transcript, CC, and a
  "⋯" menu holding text size, full screen and the TXT/SRT/VTT saves; the old buttons stay in the page,
  hidden, and the menu presses them). The video sits directly under the banner at full width, 16:9.
- In the phone app the app's own top bar is hidden while a YouTube video is open
  (`body.in-player:has(.player.yt) .topbar`), so the video starts higher. Not seen on a real phone.
- Up to 640 px wide the word popup is no longer a sheet rising from the bottom: it is docked directly
  under the captions, styled as part of the same black bar, and never covers the captions or the video
  (`fitBubble()` in player.js sets `--dock-top` / `--dock-max`; it grows down to the play controls and
  scrolls inside itself). With CC off it starts under the video instead.
- Checked in the desktop preview at 375 x 812 (panel open and closed, CC on and off) and at desktop width
  (unchanged: popup in the transcript panel). Test server: launch config `tamkeen-player` (port 8798).

### "Watch a YouTube video": Open YouTube button instead of the paste box (2026-10-11, "Media import" chat; NOT committed)
The owner asked for the paste-a-link box to go: the Library section is now **Watch a YouTube video** with one
button, **Open YouTube**. It opens the app's own web browser on youtube.com; tapping a video there opens it in
Tamkeen's player (the embedded player with clickable captions) instead of on YouTube's page.
- `web/js/youtube-browser.js` (new, plain script like `browser-toolbar.js`) is run inside every page of the
  app's browser but only acts on youtube.com. It catches a tap on any link to a video (`/watch?v=`, `/shorts/`)
  before YouTube sees it; a video page reached another way is caught by a 0.7 s check of the address.
- **Computer**: `JsApi.open_youtube` in `app/desktop.py` (one YouTube window, reused while open; both browser
  windows now come from `_browser_window`, so the ordinary Web Browser does the same on youtube.com). The tap
  calls `BrowserApi.watch_video(id)` → `youtube.ask_app_to_watch` publishes the live event `youtube_watch` and
  waits → the app's page (`web/js/app.js`) runs `watchVideo` from `web/js/youtube.js` (opens the video if it is
  already in the library, `GET /api/youtube/<id>`, else adds it) and answers `POST /api/youtube/watch-result`
  → the YouTube window shows "✓ Opened in Tamkeen" or the reason ("No captions available for this video.")
  and the app's window comes forward (`bring_forward`). `watch_video` refuses unless the window is on youtube.com.
  - The YouTube window (only that one: `_browser_window(..., close_after_watch=True)`) then closes itself,
    0.4 s after answering so the page still gets the reply. A video that couldn't open leaves it open, and
    the ordinary Web Browser never closes this way. Test: `test_youtube_window_closes_once_its_video_is_showing`.
  - Gotcha: never set `window.on_top` from a bridge thread on Windows; it hangs. `window.show()` activates.
- **Phone**: `openYouTube` in `mobile/src/js/app.js` opens the in-app browser at m.youtube.com and passes the
  same script. With no bridge in that browser, the script asks to go to `tamkeen-video://watch?v=<id>`;
  `InAppBrowser.java` catches that address (`shouldOverrideUrlLoading`) and the plugin sends a `youtubeVideo`
  event; JS adds the video, calls the new `closeBrowser` plugin method and shows the player. Without captions
  the browser stays open with a toast.
- A YouTube link pasted in the "Add a webpage" box still works (it is the only way when the app runs in an
  ordinary browser, where there is no second window to control).
- Checked with real windows by `scratchpad/window_test.py`-style automation: button → YouTube window, second
  press reuses it, tapping a search result opens the player in the main window with nothing playing on
  YouTube's side, a caption-less video is refused with the message, another website can't use the hand-over.
  **Not checked: the phone** (the Java changes have never been compiled; CI will build them on the next push).
- Tests: 144 pytest, 140 JS (`tests/js/youtube-browser.test.mjs` runs the script against a pretend page).

### Phone Library: whole page scrolls, a strip of kinds, a strip of podcasts (2026-10-11, "Media import" chat; NOT committed)
The owner reported the phone's Library as unusable: with all the add-boxes above it, the episode list was a
170-pixel sliver that scrolled on its own. Phone only (`platform === "android"`); the computer's Library is unchanged.
- `mobile/src/css/mobile.css`: `.library` is an ordinary block, and neither `.sidebar` nor `.lib-main` scrolls by
  itself, so `#view` scrolls the whole page. The filter/select toolbar sticks to the top of the page.
- `web/js/pages/library.js` (`renderStrips`, `KINDS`): the sideways strip always shows **Podcasts, YouTube,
  My webpages, My videos, My audio**, in that order, whether or not anything of that kind exists (an empty
  kind opens `#/library?show=<kind>` with a line saying how to add one). With Podcasts chosen, a second strip
  (`#podcast-list`) shows **All episodes** first, then the podcasts, most recently listened to first
  (`allProgress()` in `progress.js`, matched by the podcast's title; never-played ones follow in A–Z order).
  "All episodes" there means podcast episodes only: `GET /api/episodes?scope=podcasts` (both backends).
- Tapping a strip item redraws the page; `keepScroll` puts it back where it was scrolled to.
- Gotcha met again: `library.js` loads before the app shell has finished starting, so `platform` must be read
  inside `render`, not at the top of the file.
- Checked in the phone-sized preview of `mobile/www` (strips, empty kind, recent-first order, taps on
  episodes and add buttons) and the computer's Library at desktop size. Not on a real phone.
- Tests: 145 pytest, 141 JS.

### Instagram Reels: found and transcribed on the computer, watched on the phone (2026-10-12, "Media import" chat; NOT committed)
The owner's design, decided step by step in chat: the computer makes a batch of reels ("Get 10 reels"), only
each reel's address and words are kept, and the phone plays them one after another from Instagram's own embed
page with the words in a bar underneath. Nothing of a video is stored anywhere.
- **What experiments showed** (scripts in that chat's scratchpad, run against the real site):
  - Instagram's own subtitles almost never reach the website (2 of ~50 videos), so the words come from Whisper.
  - A signed-in page is told which posts a keyword search turns up (with likes) and each creator's reels with
    play counts. Signed out, Instagram refuses almost everything, and plain HTTP clients (httpx) get an error
    page even for embed pages: **only a real browser window works**.
  - The embed page (`/reel/<code>/embed/`) plays without sign-in, in a phone-style WebView too: its `<video>`
    can be started, read and noticed ending, and its address is a direct file the computer can fetch once.
- **Computer** (`available` only in the installed app, `APS_DESKTOP=1`):
  - `app/reels.py`: the part with no window (choices, ranking popular creators, picking candidates, the
    keep-or-skip verdict, storing). Tested in `tests/test_reels.py`.
  - `app/reels_worker.py`: a background thread driving an Instagram window made with pywebview (sign-in is the
    user's, kept in the app's browser storage; the window is hidden once signed in). It searches Instagram for
    comedy words in the study language (`reels.COMEDY_WORDS`), which also refreshes the remembered list of
    popular creators (kept per language in the `reels` setting, refreshed when older than 12 h); reads the
    reel lists of the creators to follow; then for each candidate opens the embed page, fetches the video to a
    temp file, asks Whisper which language it hears (`model.detect_language`), transcribes, and keeps it only
    if it is in the study language with enough speech. `web/js/instagram-worker.js` is the script that notes
    posts inside Instagram's pages.
  - "Popular", "Only my creators" or "A mix" is the `mode`; `mine`/`selected` are the user's creators.
    The owner asked for "a database of popular creators that changes with what is popular": this is it, but
    worked out on each user's own computer. A shared one (Supabase) is not built.
  - API `app/api/reels.py`: `GET /api/reels`, `PUT /api/reels/choices`, `POST /api/reels/batch`,
    `POST /api/reels/cancel`; progress as the live event `reels`.
  - A reel is an episode of the built-in feed `local:reels`: `audio_type = "video/instagram"`, `audio_url` the
    reel's address, `guid` its short code, `description` the creator. It syncs like a web page (words only).
  - The episode list (`GET /api/episodes`) now also returns `guid`, `audio_url` and a short `description`.
- **Screens** (`web/js/pages/reels.js`, styles `web/css/reels.css`, routes `#/reels` and `#/reels/play?at=<id>`):
  the batch card and the list; the player. On the computer the player shows the words and the popup only
  ("Reels play on your phone"). Library has a "Reels for my phone" button; the phone's strip has a sixth
  item, Reels. `player.js` sends an episode address of a reel to the reel player (one small edit).
- **Phone**: `reelSurface()` in `mobile/src/js/app.js` + `ReelSurface.java` put a second native WebView over the
  box the page leaves (`#reel-stage`) and load the embed page in it. `web/js/reel-embed.js` runs inside: makes
  the video fill the window, starts it, adds see-through Previous/Next at the top, and keeps `__tkReelState()`
  current. That page has no bridge to the app: Java asks it for its state every 120 ms and sends changes on as
  `reelState` events; the app talks back by running `__tkReelDo('play'|'pause'|'seek')` in it. The bar below is
  split: words left, word popup right (the ordinary popup, made static by CSS). End of a reel = next reel.
  In a browser preview `previewReelSurface` stands in (a 20-second clock) so the screen can be tried.
- **Also fixed on the way**: both shells' routers could show "Something went wrong" (and keep the wrong cleanup)
  when a page was left while still loading; a page that finishes late now tidies itself away (`routeTurn`).
- **Tested for real**: a batch against Instagram (kept 3 of 7 Arabic comedy reels in under 4 minutes; music-only
  reels were skipped); the Reels page and player in the real desktop window; the phone-size player with the
  stand-in window (layout, popup in the right half, Next, auto-advance, back). **Not tested: a real phone**
  (the Java has never been compiled; the embed page was only tried in a phone-style window on the computer),
  and the batch inside the installed app (it was driven from a test script with the same code).
- Known limits: songs can pass as speech; titles are the creator's caption (often emoji); about 4 in 10
  candidates are kept, so 10 reels take roughly 6 to 8 minutes; Instagram may challenge the sign-in; all of it
  is unofficial (Instagram's terms forbid automated collection) and will need fixing when their pages change.
- Tests: 157 pytest, 147 JS (`tests/js/reels.test.mjs` runs both in-page scripts against pretend pages).

#### Reels from the user's own Instagram saves (2026-10-12, same chat; NOT committed)
A fourth choice on the Reels page, "From my Instagram saves", with a dropdown: "Everything I've saved" or one
of the user's collections. "Find my collections" fills the dropdown.
- **Shared between phone and computer (2026-10-13, owner's choice: the list and the choice, not skipped/tried
  reels):** library-sync key `ig_collections` = `{at, items: [{id, name}], chosen, chosen_at}`. The newer list
  wins as a whole (so a fresh look drops deleted collections), the newer choice wins; a choice not in the list
  becomes `all`. Rules in `web/js/igcollections.js` (phone, also in the phone build list) with the Python twin
  `clean_synced_collections` / `merge_synced_collections` in `reels.py`; the same cases are tested in
  `tests/js/igcollections.test.mjs` and `tests/test_reels.py` (plus a two-device sync test). The computer keeps
  `collections_at` / `collection_at` in its `reels` setting and each collection's page address locally; one
  only the phone has found has `path` "" and `saved_path` goes to `/<me>/saved/c/<id>/`. The phone moved its
  list and choice from kv `reels_phone` into `settings.ig_collections` (moved over once on first load). After a
  merge an open Reels page redraws: live event `reels_collections` (computer `events.publish`, phone
  `tamkeen:ig-collections` → `emit`). Not tried yet with a real phone and computer over Drive.
- `reels.py`: mode `saved`; `collections` (id, name, the page's address; the address stays on this computer,
  the API hands the page names and ids only) and `collection` (an id, or `all`); `clean_collections`,
  `remember_collections`, `saved_path`. In this mode `pick_candidates` keeps Instagram's order (newest save
  first) with no ranking and no taking turns.
- `reels_worker.py`: `start_collections` / `_run_collections` (asks the site who is signed in through
  `/api/v1/accounts/edit/web_form_data/`, opens `/<me>/saved/`, reads the collection links from the page);
  in a batch, `_saved_posts` opens the chosen Saved page and reads the post links in order, and `_details`
  asks `/api/v1/media/<pk>/info/` for a post's maker when the page didn't say. Non-videos are skipped.
  The window code is now shared (`_signed_in_window`). API: `POST /api/reels/collections`, and `collection`
  in `PUT /api/reels/choices`.
- **Verified with a real account that has saves (same day):** "Find my collections" found the account's 11
  collections by name, and batches read the saved posts of two of them (each post with its maker known).
  From the collection named "Arabic" (2 posts): one kept (10 words, Arabic), one skipped because its embed
  page only shows a picture linking to Instagram. From a mixed collection (18 tried): one kept **as French**,
  8 skipped as not playable outside Instagram, 8 as English/Portuguese/German/other, 1 as music.
  So about 4 in 10 of that account's saves cannot be shown outside Instagram; that is Instagram's doing.
  Also learnt: `/api/v1/collections/list/` answers 404 on the website; `/api/v1/feed/saved/posts/` answers 200.
- **Two language rules changed after that run (owner's decisions and a real miss):**
  - A reel from the user's OWN SAVES is **never skipped for its language or for having little speech**
    (owner: "some reels mix the foreign language with English; only for reels I selected in my collections").
    It is skipped only if it is not a video, cannot be shown outside Instagram, or nothing at all is said.
    Such reels are written down by `reels_worker._transcribe_mixed`, which lets faster-whisper judge the
    language afresh for every stretch of speech (`multilingual=True`); other engines write everything down in
    one language. The episode's language is the studied one, or another taught language when Whisper is sure
    of it (`reels.language_to_use`); an all-English save is therefore filed under the studied language.
    Found/popular reels still have to be in the language being studied.
    Real run on the mixed collection: 8 kept of 30 tried; 16 could not be shown outside Instagram; 6 had no
    speech at all (checked: the speech filter finds none, and without it Whisper invents a few words).
  - A near tie no longer throws a reel out. The Arabic save above was first skipped as "English": Whisper
    said English 0.53, Arabic 0.41. Now a reel counts as another language only if Whisper is sure AND the
    studied language is not a close second (`reels.other_language`, `CLOSE_SECOND = 0.25`);
    `spoken_language` also returns the studied language's share.
- **Signing in through Facebook.** The owner pressed "Log in with Facebook" and was left on Facebook's own
  pages while the app waited. `_await_sign_in` now notices that (the in-page script's `facebookReady()`), goes
  back to Instagram's sign-in page, and if need be presses Instagram's own "Continue as ..." / "Log in with
  Facebook" button (`continueWithFacebook()`: only on the sign-in page, never on a sign-up page, because the
  app must not create an account). The `reels` setting remembers `facebook: true` for later runs. The in-page
  parts are unit-tested. In the real re-run, with the Facebook sign-in already in the window's storage,
  Instagram was signed in within 30 seconds WITHOUT the app pressing anything (the log shows no press), so the
  pressing itself has not been seen working for real; going back to Instagram may be all that is needed.
- Tests: 163 pytest, 150 JS.

### Released as v0.13.0 (2026-10-12)
Everything above that said "NOT committed" was committed as 0912719 (all chats' work, at the owner's request), pushed, tagged v0.13.0 and built by GitHub: tests, Windows/macOS/Linux installers and the Android APK all passed, so the new Android code (ReelSurface.java, the InAppBrowser and plugin changes) compiles. It has still never RUN on a real phone. HANDOFF.md and TAMKEEN_OVERVIEW.md stay out of the public repository.

### Open YouTube starts on what is popular in the study language (2026-10-12, "Youtube" chat; NOT committed)
The owner found "Open YouTube" opening an empty page: a signed-out YouTube front page only says "Try
searching to get started", and YouTube closed its Trending page in 2025 (`/feed/trending` now shows the same
empty page; checked).
- `web/js/youtube-home.js` (new, pure, tested in `tests/js/youtube-home.test.mjs`): `youtubeHome(lang, {mobile})`
  builds a YouTube search that behaves like a trending list: uploaded this week, most watched first, videos
  only (`sp=CAMSBAgDEAE=`), matching one very common word of the language, with `gl` (country) and `hl`
  (YouTube's language, so titles show in the original instead of translated to English) and `persist_*` so
  they survive a reload. The table `START` holds [word, country, language code, length filter] per language;
  Japanese uses the medium-length filter because its weekly top is otherwise full of 15-second adverts.
- Both shells' `openYouTube` use it. The computer passes the address to `JsApi.open_youtube(start)`, which only
  accepts youtube.com addresses (`youtube.start_address`); the phone opens it in the in-app browser.
- Side effect to know: `persist_hl` makes YouTube's own menus appear in the study language inside the app's
  browser from then on.
- Checked in the real desktop windows (Arabic: 22 videos, Arabic titles, tapping one opened the player) and by
  fetching each language's page. Not checked on the phone.
- Tests: 164 pytest, 155 JS.

### Word popup: pause / keep-playing switch, buttons row pinned (2026-10-12, "Player look" chat; not committed)
- **Switch** at the popup's top left (no words: a pause sign on a purple track, or a play sign on a teal
  track; the two ends of the logo's gradient). It decides what happens after a tapped word plays: pause
  (as before, the default) or keep playing from that word. One choice per device, in localStorage
  `wordPause`; read with `pauseAfterWord()` from `components/wordbubble.js`. Flipping it also acts at once
  (pauses, or resumes). A popup only shows the switch when its caller passes `onPauseMode`; today that is
  `player.js` only (`playClip` honours it). `reels.js` and the web-page reader don't pass it.
- On YouTube with "keep playing", the captions carry on while the popup stays open.
- **Layout** (end of `web/css/media.css`): every word popup is now a column: heading on top, the buttons
  row (Word, Sentence, Continue, Save) fixed at the bottom, and only the definition between them scrolls.
  On a phone, in any player, the popup stops just above the play controls (`--dock-bottom`, set by
  `fitBubble()` in player.js), so the buttons row rests right on top of them; on YouTube it fills the
  space from under the captions down to there.
- Checked in the preview at 375 x 812 (YouTube and a "My videos" file) and at 1100 x 700. Not on a real phone.

### Phone reads podcast feeds itself (2026-10-12; on main, NOT committed, NOT released)
- Owner's report: "episodes for new podcasts added not showing in the bottom section in library". Cause: on
  the phone, `POST /feeds` only made a placeholder ("Episodes appear after your computer syncs this feed");
  the computer was the only device that read RSS. The computer itself was fine (checked).
- Fix: `mobile/src/js/rss.js` (pure, tested) is the phone twin of `parse_feed` in `app/feeds.py`, built on
  its own small forgiving XML reader (a browser's XML parser refuses a whole feed over one stray "&").
  `readFeed` in `mobile/src/js/backend.js` runs it when a podcast is added, and again from "Refresh & sync"
  for any podcast that still has no episodes. If the feed can't be reached the placeholder stays and the
  computer fills it in as before.
- **Episode ids must match the computer's** (`episode_uid(feed uid, guid)`), or both devices would list the
  same episode twice. `tests/fixtures/rss_parity.json` = what the Python parser makes of three sample feeds;
  `tests/test_rss_parity.py` keeps it current (regenerate: `python -m tests.test_rss_parity`),
  `tests/js/rss.test.mjs` checks the phone's reader against it. Also compared by hand on 7 real feeds
  (5,790 episodes): id, title, audio address and type, date, duration and picture all identical; only
  descriptions differ slightly (the computer tidies HTML more), and the computer's version replaces the
  phone's at the next sync.
- Checked in the phone-layout preview in a browser (add by address and from Trending: episodes list at
  once). Not checked on a real phone: there the download goes through native `CapacitorHttp`, with
  redirects followed by hand.
- **The phone also looks for NEW episodes** (owner asked the same day): `checkFeeds` in `backend.js` reads
  every podcast's feed after the sync on app start and on returning to the app (each podcast at most once an
  hour; `feed_checks` in the phone's own storage holds the time and the server's ETag / Last-Modified so an
  unchanged feed isn't downloaded again), and "Refresh & sync" looks straight away (all podcasts, or just the
  open one). A toast says how many were found. `newEpisodeRecords` in `rss.js` (pure, tested) decides what is
  new; new episodes of an auto-transcribe podcast get `transcribe_requested_at`, because the computer would
  otherwise never queue them (it only queues episodes it finds first). Existing episodes and a known podcast's
  name/picture are left alone, so phone and computer don't keep overwriting each other. Checked in the
  phone-layout preview (removed episodes came back, queued when auto-transcribe was on, no duplicates);
  the "unchanged" shortcut only runs on a real phone and is untested.

### Saved collections: choose a collection, tick the reels, send only those (2026-10-12, "Media import" chat; NOT committed)
The owner tried v0.13.0: sign-in and getting reels work, but they wanted to choose the collection plainly and
to pick the reels themselves instead of "Get 10 reels". So "From my Instagram saves" is now two steps.
- **1. Choose a collection.** The collections are buttons ("Everything I've saved" first, then each
  collection, then a refresh). The first time the choice is opened with no collections known, the list is
  fetched without being asked. Pressing one lists that collection (`POST /api/reels/saved/list`,
  `reels_worker.start_listing` / `_run_listing`): the Saved page's post links in order, each with its maker
  (looked up through `/api/v1/media/<pk>/info/` where the page didn't say) and its small picture.
- **2. Tick the reels you want.** `GET /api/reels/saved` gives the list (kept in memory only,
  `reels_worker._listing`, tidied by `reels.tidy_listing`, at most `LIST_LIMIT` = 80). Each row shows the
  picture, maker, length and caption. A row can't be ticked if the reel is already in the library, is not a
  video, or was tried before and couldn't be used (the reason is shown; `reels.mark_outcome` keeps
  `{code: reason}` in the `reels` setting under `skipped`). "All" ticks every usable one.
- **Send N reels to my phone** (`POST /api/reels/saved/send {codes}`, `start_selected` / `_run_selected`)
  listens to exactly those, in the collection's order. There is no "Get 10 reels" in this choice any more.
  The other three choices are unchanged.
- Pictures: Instagram's picture servers refuse to show pictures inside other pages, so the app fetches them
  itself: `GET /api/reels/thumb?u=`, only for https addresses on cdninstagram.com / fbcdn.net.
- `reels_worker`: `_begin` starts any of the jobs, `_attempt` tries one reel (shared with the batch),
  `_links` now also returns each link's picture.
- **Run for real through the app's window** with the owner's Instagram account: 12 buttons (11 collections),
  the collection named "Arabic" listed its 2 posts, a bigger one its 32 (every maker known, pictures
  loading), ticking five and sending worked, the button text follows the ticks, failed reels come back
  greyed with their reason, and ticks are cleared afterwards. All five sent in that run failed for real
  reasons (3 can't be shown outside Instagram, 2 have no words): that collection had already given up its
  usable reels in earlier tests. Not checked: the installed app (this ran from source), and what a
  collection with more than 80 posts looks like.
- Idea not built: check, while listing, which reels can be shown outside Instagram (about half of this
  account's saves can't), so they are greyed before the user ticks them. It costs one page load per reel.
- Another chat ("Instagram Reels Player") owns the reel player: `renderPlayer` in `reels.js`, the player
  part of `reels.css`, `reel-embed.js`. Everything above the player banner in `reels.js` is this chat's.
- Tests: 21 in `tests/test_reels.py`.

### Open YouTube: a "Popular in" country choice (2026-10-12, "Youtube" chat; NOT committed)
The owner asked to keep the countries chosen per language but let the user pick another.
- Library: a "Popular in" dropdown under the Open YouTube button (hidden for Japanese, which has one country).
  The choice is kept per language in this device's `localStorage` (`ytCountry:<lang>`); `chosenCountry` /
  `chooseCountry` / `COUNTRIES` / `countryFor` in `web/js/youtube-home.js`. Both shells pass it to `youtubeHome`.
- Computer: `JsApi.open_youtube` remembers the address its window was sent to and reloads the window when a
  different one is asked for (a new country), instead of only bringing it forward.
- **What the country really changes (measured, see the comment in `youtube-home.js`)**: almost nothing by itself.
  A most-watched list follows the language: with "Egypt" or "Morocco" instead of "Saudi Arabia", 19 of 20
  videos were the same. So a country may carry a search word of its own (third item in its `COUNTRIES` entry):
  Egypt "عشان", Morocco "ديال", Lebanon and Jordan "هيك". Those four give that dialect's own list (checked in
  the real window). Every other country only tells YouTube where the viewer is (`gl`), which shapes its later
  searches and suggestions more than the first page.
- Tried and rejected: the country's NAME as the word (YouTube also matches it in other languages: "Québec",
  "新加坡", "Россия" bring English videos); YouTube's per-country Podcasts page (nearly the same per language);
  relevance order instead of most-watched (differs by country but ranks the search word itself, e.g. "El Niño").
  Dialect words that did NOT work: "برشا" (finds Barça), "شلون", "واش" and "شنو" (find Moroccan videos).
- Tests: 169 pytest, 173 JS.

### Reel player: controls row, and the popup's buttons pinned above it (2026-10-12, "Instagram Reels Player" chat; NOT committed)
The owner asked, for the reel player: keep the player controls visible, let the popup scroll, but keep its
buttons row (Word, Sentence, Continue, Save) fixed right above the controls. The reel player had no controls
of its own (only the see-through Previous/Next on the reel), so this adds them.
- **Controls row** (`#reel-controls`, last child of `.reelplay` in `renderPlayer`, `web/js/pages/reels.js`):
  back 5 s, play/pause, forward 5 s, time, a slider, length, speed. Always on screen, also with a popup open.
  They talk to the reel through the same surface as before (`surface.do("play" | "pause" | "seek")`) plus a new
  `surface.do("rate", x)`: `web/js/reel-embed.js` sets the video's speed and reports `rate` in its state.
  Every reel is a fresh page, so the chosen speed is passed on once per reel when it is ready (`speedSetOn`).
  The speed is the `speed` value in localStorage, shared with the podcast/video player. No Java change: the
  phone already runs whatever script it is handed (`reelRun`). Hidden on the computer (no reel window there).
- **Popup** (styles only, "the reel player" part of `web/css/reels.css`; `wordbubble.js` untouched): it fills
  its half of the bar; the heading stays at the top and only `.wb-body` scrolls. While a popup is open its
  `.wb-actions` row is a strip across the WHOLE bar at its bottom edge (absolutely placed inside `.reel-bar`,
  height `--reel-actions`, 44 px), directly above the controls, and both halves of the bar give up that
  height (`.reel-bar:has(.word-bubble:not([hidden]))`). The reel window above keeps its size either way.
- Checked with the phone build at 396 x 841 using the stand-in reel window: controls at the bottom edge and
  inside the screen; with a popup open the buttons strip sits exactly on top of them, full width, four
  buttons of 91 px; a long explanation scrolls while heading and strip stay put; play/pause, the slider,
  back 5 s and speed all work with the popup open. Also checked in the real computer window (no controls
  there; strip at the bottom of the bar). **Not checked on a real phone**, and speed has only been tried
  against the stand-in, not a real reel.
- Tests: `tests/js/reels.test.mjs` now covers `rate` (173 JS tests pass).

### Reels Instagram only plays signed in: kept too, played from their ordinary page (2026-10-12, "Media import" chat; NOT committed)
About half of the owner's saves have no video on Instagram's embed page (`/reel/<code>/embed/`), which is the
page the phone plays reels from. Measured on this account: every reel using a song from Instagram's music
library (`clips_metadata.audio_type == "licensed_music"`, 14 of 14) and a few with original sound (5 of 26).
The owner's decision: "I want those reels too". So there is now a second way to play a reel.
- **Computer** (`_try_reel` in `app/reels_worker.py`): when the embed page has no video AND the reel is one
  the user picked from their saves (`own_save`), the video's address is asked of Instagram's site as the
  signed-in page (`_video_address`: `/api/v1/media/<pk>/info/` -> `video_versions[0].url`). It is listened to
  as usual and kept with its address ending `#signin` (`reels.SIGNIN_MARK`, `reels.needs_signin`,
  `save_reel(signin=True)`). The outcome line says "(plays when signed in to Instagram on the phone)".
  Popular / my-creators reels are NOT kept this way (they are still skipped as `reels.NOT_OUTSIDE`).
  Reels skipped earlier for that reason are tickable again in the list (`listing()` no longer greys them).
- **Phone**: a reel marked `#signin` opens its ORDINARY page (`/reel/<code>/`) in the reel window instead of
  the embed page (`reelAddress` in `web/js/pages/reels.js`). A new in-page script, `web/js/reel-page.js`,
  does there what `reel-embed.js` does on the embed page (same `__tkReelState` / `__tkReelDo` contract, incl.
  `rate`): picks the video, un-mutes and starts it, stops Instagram restarting it at the end, presses
  "Not now" on Instagram's own dialogs, makes the video fill the window, adds the see-through Previous/Next,
  and makes a tap pause/play. Both scripts are handed to the window together (`reelScript` in
  `mobile/src/js/app.js`); each steps aside on the other's page. `ReelSurface.java` now lets the window show
  `/reel|reels|p/<code>/` with or without `/embed`, and Instagram's sign-in page (so the script can report it).
- **Not signed in on the phone**: `reel-page.js` reports `error: "signin"` (sign-in page, a sign-in form, or
  no video after 8 s with no `ds_user_id` cookie). The player then shows a notice in the bar's right half
  (`askSignIn`, `.reel-signin`): **Sign in** (opens `instagram.com/accounts/login/` in the app's own browser,
  which shares its cookies with the reel window, both being WebViews of the same app), **Try again**, **Skip**.
  It is asked per reel; after one sign-in they all play.
- **A reel not marked that turns out to have no video on its embed page** (Instagram changed its mind since
  the computer looked): the player tries its ordinary page once (`viaPage`) before skipping it.
- These are three small edits INSIDE `renderPlayer`, which the "Instagram Reels Player" chat owns (it was
  told): `surface.open/load` use `reelAddress(ep)`; `onState` gained the `signin` branch and the
  ordinary-page retry in the `novideo` branch; and `onState`'s "is this state about this reel?" guard also
  accepts Instagram's sign-in page (`signInPage`) for a reel played from its ordinary page, because a
  redirect to `/accounts/login/` no longer names the reel. Everything else is above the player banner.
- The preview stand-in (`previewReelSurface`) now "asks for a sign-in" the first time an ordinary page is
  opened and plays on the second try, so the notice can be tried in a browser.
- **Checked for real**: (1) computer, through the app's window with the owner's account: the 3 reels skipped
  earlier as "can't be shown outside Instagram" were tickable again; sent: 2 kept with their words and the
  mark, 1 has no speech (music only). (2) `reel-page.js` in a phone-style (Android WebView user agent)
  signed-in window on two such reels: plays with sound, position reported, pause holds, jump and 0.75x work,
  the end is counted and it stays stopped, play again, tap toggles, Next signals; signed out it reports
  `signin` for both. (3) Phone build at 396 x 841 with the stand-in: notice inside the right half, fits
  without scrolling, Try again plays, Skip moves on, the list line says "plays when signed in to Instagram".
- **NOT checked** (needs the owner's phone): the real Android reel window on an ordinary page; that the
  sign-in made in the app's browser carries to the reel window; the Java edit has not been compiled yet
  (CI compiles it on release). **Likely snag**: Facebook refuses to sign people in inside an app's built-in
  browser, so on the phone the owner may need an Instagram username + password (Instagram lets a
  Facebook-made account set a password in Accounts Centre). I deliberately did NOT disguise the browser to
  get round that.
- After a run ends, the tick list takes a few seconds to redraw (the status line changes first). Harmless.
- Tests: 23 in `tests/test_reels.py`, new `tests/js/reel-page.test.mjs` (8). Totals: 171 pytest, 181 JS.

### v0.14.0 released (2026-10-12, "Media import" chat, at the owner's request)
- Everything uncommitted from all the chats was committed as 8c2a21f (saved Instagram reels and their second
  way to play, the YouTube start page with "Popular in", podcasts added on the phone reading their own feed,
  token-use and key-error help, player layouts, game rule changes) and pushed to `main`.
- The first release build failed only at "macOS disk image" (`hdiutil`, a passing "Resource busy" failure on
  GitHub's Mac). `packaging/macos/make_dmg.sh` now tries up to six times (commit b9a4bc6); the tag was moved
  onto that commit and the second build published the release with all four files.
- The Android job compiled the new Java (`InAppBrowser`, `GoogleDriveAuthPlugin`, `ReelSurface`) without errors
  for the first time. It has still never run on a real phone.
- `HANDOFF.md` and `TAMKEEN_OVERVIEW.md` remain untracked on purpose (never in the public repository).
- Tests at release: 171 pytest, 181 JS.

### Reel player: purple new words, and the pause / keep-playing switch instead of speed (2026-10-12, "Instagram Reels Player" chat; NOT committed)
The owner noticed two things the other player has and the reel player lacked.
- **Seen-word colours.** `renderPlayer` (`web/js/pages/reels.js`) now makes a `seenWords` view
  (`web/js/lexicon/seen.js`) for each reel's words, closes it when the reel changes or the page is left, and
  calls `markSeen` after a lookup and after a save, exactly as `player.js` does. The colour rules in `app.css`
  only cover `.transcript`, `.reader-text` and `.captions`, so the reel player has its own in `reels.css`:
  `.reel-words .w.new` is `#eaa6e4` (the bar is always dark, so the caption shade). As everywhere, Arabic is
  only coloured once its dictionaries are downloaded, and English words inside an Arabic reel are not coloured.
- **Pause after a tapped word.** The speed chooser is gone (the `#rc-speed` select, `REEL_SPEEDS`, and the
  `rate` command and state value in `web/js/reel-embed.js`, with its test). In its place, last in
  `#reel-controls`, is the same switch the other player has in its popup: `pauseSwitch(onChange)`, a new export
  of `web/js/components/wordbubble.js` (same `wordPause` choice in localStorage, so it is one setting for the
  whole app). `playClip` leaves `clipEnd` empty when the choice is "keep playing". Flipping the switch acts at
  once (pause / play) only while a popup is open; with no popup it just changes the choice. The reel player does
  NOT pass `onPauseMode` to the popup, so the switch is not shown twice. Styled in `reels.css`
  (`.reel-controls button.wb-mode`); the knob styles come from `media.css`.
- Checked with the phone build at 396 x 841 and the stand-in reel window, Arabic dictionaries downloaded:
  396 of 396 words purple (`rgb(234, 166, 228)`); a tap turned that word and its other forms plain (373 left),
  and it was still plain after going to the next reel and back; no speed chooser; the switch sits at the right
  end of the controls, inside the screen; default = paused after the word; flipped = plays on (still playing
  3 s later); flipped back = pauses; with no popup open a flip changes nothing but the choice. 181 JS tests
  pass. **Not checked on a real phone.**

### Cloud transcription, and picking reels on the phone (2026-10-12, "Whisper transcription outsourcing options" chat; committed locally on main as cfc0057, NOT pushed, NOT released)
The owner's request: many users have no graphics card for the large model Arabic needs, so let them use a
cloud speech-to-text provider with their own key (same idea and same card layout as the AI definitions key).
With it on, the phone transcribes by itself at once instead of asking the computer, and can pick reels.
- **Providers**: Groq (`whisper-large-v3` recommended, 11.1¢ per hour of audio; `whisper-large-v3-turbo`, 4¢)
  and OpenAI (`whisper-1`, 36¢). Both speak the same request format. Only models that give a time for every
  word are listed (OpenAI's newer transcribe models don't). Prices and model names checked against Groq's docs
  and OpenAI's speech-to-text guide that day (OpenAI's price from third-party pages). To add a provider with the
  same format, add it to `STT_PROVIDERS` in `web/js/stt.js` and `PROVIDERS` in `app/transcriber/cloud.py`.
- **Settings**: `stt_mode` ("local" / "cloud"), `stt_provider`, `stt_model_<p>` ("" = recommended),
  `stt_key_<p>` (secret: never in a backup), `stt_usage` (computer only). Per device, not synced. The cloud is
  used only when mode is "cloud" AND there is a key. OpenAI borrows `llm_key_openai` when it has no key of its own.
- **The card** = `web/js/components/sttsetup.js` (shared; "Cloud transcription", under "Language I'm learning"
  in both Settings pages, and inside "My computer is too slow for this" on the first-run setup page). Built like
  `aisetup.js` and uses its styles: a choice of who writes transcripts, provider, the model menu with a gold
  banner ("$1 ≈ 9 hours of audio") and each model's price per hour, the key row (paste saves at once, a key is
  filed under its provider, "I'm stuck" reuses `keyhelp.js` with its own steps: `STT_KEY_GUIDES` in stt.js),
  "Test the key" (sends one second of silence), and "Audio sent today from this computer/phone".
- **Shared logic** = `web/js/stt.js` (pure, tested in `tests/js/stt.test.mjs`): settings, the request's form
  fields, reading the answer, the MP3 cutter, prices and the day's total.
  - Reading the answer: the providers return sentences (with punctuation) and, separately, timed words
    without punctuation. Each word goes to its sentence by time and takes the sentence's spelling when the two
    lists have the same count. Stretches the provider marks as non-speech, and a short list of lines Whisper is
    known to invent over silence (subtitle credits, "اشتركوا في القناة"...), are dropped. `app/transcriber/cloud.py`
    `parse` is the twin; keep the two in step.
- **Computer** = `app/transcriber/cloud.py`: `CloudTranscriber` has the same interface as the local engines, so
  `jobs.py` is unchanged; `transcriber.get()` returns it when the cloud is on (no local model needed, and
  `/api/status` `model_ready` is then true; `local_model_ready` says whether a model is installed). What is
  sent: the built-in speech detector finds the speech, it is packed into pieces of about 5 minutes cut only at
  pauses, each piece goes up as a 48 kbit/s MP3, and times are mapped back. Silence and music are never sent.
  A 429 is waited out (up to 20 minutes), dropped connections retried. `POST /api/stt/test`,
  `GET /api/stt/usage`, live event `stt`. Stored model label: `cloud:<model>:<provider>`.
  - Reels with the cloud (`reels_worker._keep_heard_in_cloud`): the provider is not told the language and says
    which it heard. Found/popular reels in another language are skipped; own saves are always kept (filed under
    another taught language if that is what was heard). No per-stretch language judging, so reels that mix two
    languages come out less well than with a local model. A refused key or used-up allowance stops the batch.
- **Phone transcribing** = `mobile/src/js/transcribe-service.js`. `POST /episodes/transcribe` in `backend.js`
  starts it at once when the cloud is on (else it still asks the computer). One episode at a time; statuses
  queued / downloading / transcribing / failed show in the Library through the same `episode` events.
  - The audio is fetched in 3 MB range requests through native HTTP (redirects followed by hand). An MP3 is
    cut between frames without decoding (`Mp3Splitter`: pieces of at most 8 minutes / 10 MB, exact start times).
    Another format is sent whole if under 24 MB; if bigger, Groq is given the file's address to fetch itself,
    and OpenAI gets a clear error.
  - The transcript is stored on the phone and uploaded as `t_<uid>.json.gz` through `pending_transcripts`
    (the same road as imported web pages), so the computer receives it.
  - Own video/audio files: sent from the phone if 24 MB or less, otherwise left to the computer as before.
  - Known gaps: no speech detection on the phone (silence is paid for, and a made-up closing line can slip in);
    a word at a cut every ~8 minutes can be garbled; a podcast that inserts different ads per download may
    highlight out of step because the phone keeps no copy of the audio it sent; the queue is in memory only
    (closing the app drops it).
- **Phone reels** = `mobile/src/js/reels-phone.js` + `mobile/src/js/instagram-phone.js` (runs inside Instagram).
  Only "From my Instagram saves" (pick a collection, tick, "Get N reels"); popular / my-creators stay
  computer-only (they need a window that browses search pages). No Java was changed: the existing reel window
  is opened as a 1-pixel strip on a reel's page (any page of instagram.com can ask the site as the signed-in
  user), jobs are started with `reelRun` and answered through `__tkReelState()` polling. It asks
  `/api/v1/accounts/edit/web_form_data/` (who is signed in), `/api/v1/feed/saved/posts/`,
  `/api/v1/feed/collection/<id>/posts/`, `/api/v1/collections/list/` and `/api/v1/media/<pk>/info/`, downloads
  the smallest version of the video and sends it to the provider. A reel with a song from Instagram's library
  is stored with `#signin`. Sign-in is the one made in the app's own browser ("Sign in to Instagram" button).
  `web/js/pages/reels.js` got small edits in `renderList` only (`info.modes`, `info.phone`, the sign-in button,
  `data:` pictures).
- **Settings says what happens to big non-MP3 episodes** (owner's request): on the phone only, a gold note
  under the key row for the chosen provider (`phoneLimit` in `STT_PROVIDERS`): Groq is handed the file's
  address, OpenAI shows an error. The computer has no such limit, so the note isn't shown there.
- Found on the way: `audio.encode_speech_copy` raised NameError on main until the `anki-export` branch was
  merged the same evening (commit 2ea8209), so episodes transcribed before that have no `a_<uid>.ogg` copy.
- The commit holds only this chat's files and, in `web/js/pages/reels.js`, only its `renderList` changes: the
  "Instagram Reels Player" chat's uncommitted player work in that file (and in `reels.css`, `wordbubble.js`,
  `reel-embed.js`, `tests/js/reels.test.mjs`) was left for that chat.
- **Checked**: a made-up 52 s Arabic "episode" (four spoken passages at known times) through the real app with
  a stand-in provider running the real large-v3 model: on the computer (4 pieces, only the 37 s of speech sent,
  words within 0.3 s of where they are) and in the phone build in a browser (range download, one piece, stored,
  queued for upload). The Settings card on both, the setup page, a wrong key, a wrong model name. The phone's
  reel picking with a pretend Instagram (sign-in prompt, collections, list, tick, one kept, one failed).
  Scripts: `cloud_e2e_server.py` and `cloud_e2e_drive.py` in that chat's scratchpad; launch configs
  `tamkeen-cloud` (8840, stand-in provider on 8841) and `tamkeen-cloud-phone` (8843).
- **NOT checked**: a real provider with a real key (none was used: the model names, prices and the exact
  shape of real answers are from the providers' documentation); anything on a real phone (native HTTP uploads
  and range downloads, memory with long episodes); and the phone's Instagram requests against the real site.
  Of those, only `/api/v1/media/<pk>/info/` and `web_form_data` are known to work on the website (the
  computer uses them); the saved-posts list answered 200 in an earlier chat but its shape is assumed, and the
  collections list answered 404 there without parameters, so collections may not appear on the phone
  ("Everything I've saved" does not depend on it). Whether the reel window loads `/reel/tamkeen/` (a made-up
  address, used when the library has no reel yet) is also unseen.
- Tests: 193 pytest (`tests/test_cloud.py` 19), 218 JS (`stt.test.mjs` 19, `instagram-phone.test.mjs` 8).

### Vocab reviewer: FSRS flashcards on the Vocab page (2026-10-12, "Spaced Repetition System (fork)" chat; in the worktree `../tamkeen-anki-export` on branch `anki-export`, NOT committed, NOT in main)
The owner's request: a reviewer inside the Vocab section, using FSRS, with only two answers ("Remembered" /
"Not remembered"); front = the English word with the English sentence under it; back = the word as the Vocab
page shows it; a box for self-typed notes (mnemonics) editable while reviewing once the back is showing, and
exported to Anki in the .apkg; "as fun to use as possible, visually interesting, interactive, and satisfying".
- **Where it is**: a gradient "Review" banner at the top of the Vocab page (due and new counts; with a folder
  open it reviews that folder). It opens a full-screen layer over the page, not a route, so no router was
  touched: `web/js/pages/review.js` (screen), `web/css/review.css` (linked from both index.html files),
  `web/js/review/fsrs.js` (memory model) and `web/js/review/deck.js` (what is asked, in which order). All
  shared with the phone (`build-www.mjs` copies them). `vocab.js` hands it `playSnippet` and `highlight`.
- **Memory model**: FSRS-6 with its published default parameters, 90% target recall, two ratings (Good = 3,
  Again = 1). A missed word comes back a few cards later in the same session until remembered once; a
  remembered word waits `round(stability)` days (2, 11, 46, 163... for a word never missed). Days are local
  calendar days (midnight), not Anki's 4 a.m. No fuzz, no learning steps, no parameter optimiser.
  `app/fsrs.py` is the same thing in Python (only the computer's Anki export needs it).
- **What is stored is the list of answers, never the state**: `[t ms, rating, local day number, ms looked at]`
  per word uid; rating 0 = taken back with Undo. A word's state is worked out by replaying them, so two
  devices' answers merge by simple union. Computer: table `reviews`, `GET/POST /api/reviews`
  (`app/api/reviews.py`). Phone: `lib.reviews`, same routes in `backend.js`. Sync: `reviews` in library.json
  (union; a 0 wins), in both merges and both `content` checks.
- **Own notes** = new vocab column `memo` (`db._SYNC_COLUMNS`, the `vocab_upd` trigger, `PATCH /vocab/{id}`,
  search, both sync merges keep the known one when an older device sends none: same pattern as
  `translation`). The Vocab list has a dashed "My notes" box per word; the card's back has the same.
- **Anki export**: a word with answers on record takes FSRS's schedule (type 2, due, interval, reps, lapses),
  its memory state in `cards.data` (`{"s","d","dr","decay"}`) and its real review log in `revlog`; a word
  without any keeps the battles' box schedule as before. The memo goes on the Back as a further
  `Note: ...` (no layout change; `LAYOUT_DATE` untouched). The deck's `conf` now says `"schedVer": 2`:
  without it Anki took the deck for a scheduler-1 deck and renumbered learning answers 3 -> 4. Phone:
  `buildDeck(..., reviewed)` takes a function (`ankiCard` from fsrs.js) so `anki-deck.js` still imports
  nothing shared. **Checked in the throwaway Anki engine** (anki 26.09.3, the Anki chat's `ankienv`): with
  "Import any learning progress" ticked, cards arrive with the right due day, interval, `memory_state` and
  all log rows; unticked, all new.
  - Still true (the Anki chat's rule): a card already in Anki is never changed by a re-import, so a memo
    typed after a word's first export does not reach the copy in Anki, nor does later progress.
- **Game** (agreed with the "Creature game" chat, who relayed the owner's decisions): event
  `{type: "review", cleared}` in `rules.earn`: a card pays a quarter of a word lookup's roll
  (`REVIEW_SHARE`), the same whether remembered or not, no combo, no surprise items, its own fade
  (`day.cards`, `stats.cards`; the battles' `day.reviews`/`stats.reviews`/`stats.right`/`week.*` are not
  touched). `day.cardsCleared` is set once a day when nothing is left due after at least
  `REVIEW_CLEAR_CARDS` (5) cards: **nothing pays for it yet**; the glow payout and the "both in one day"
  bonus the owner asked for are the game chat's to build on that flag. `game.reward` skips the fountain for
  `quiet: true` events (the reviewer draws its own). Time on cards counts as study time. `info.js` has the
  two explainer edits.
- **Gotcha met**: a hidden or minimised window stops animations, and `element.animate().finished` then never
  resolves, which left the reviewer stuck "busy". `play()` in review.js races every animation against a timer.
- **Checked** in a desktop preview and the phone build at 375 x 812 with made-up words (launch configs
  `tamkeen-review` 8850 and `tamkeen-review-phone` 8851; data in that chat's scratchpad): banner counts,
  flip, keys (Space, 1/2, arrows, Z, W/S/N), typing in the boxes without triggering keys, swipe (with
  synthetic pointer events), Undo, missed word returning, summary screen, "All caught up", settings popover,
  word audio on turning the card, the phone's back button closing it, and a real export imported into the
  Anki engine. **Not checked**: a real phone (touch swipe feel, vibration), the real desktop window, light
  theme by eye, two real devices syncing answers, and a real person's large vocab list.
- New-words-a-day (0/5/10/20/50, default 20) and "say the word when the card turns" are per device
  (localStorage `reviewNewPerDay`, `reviewAutoplay`). New words are asked newest saved first.
- Tests: `tests/test_fsrs.py` (13; `python -m tests.test_fsrs` rewrites `tests/fixtures/fsrs_parity.json`),
  `tests/js/review.test.mjs` (8), one more in `tests/js/anki-deck.test.mjs`. Totals on the branch: 187 pytest,
  200 JS. `parity.json` only gained `"schedVer": 2` in `ankiDeck.col.conf`.
- To ship: commit in the worktree, merge `anki-export` into main (main was fast-forwarded to ed8a30f, so the
  branch sits directly on it; the main checkout has other chats' unsaved edits in `app/db.py`,
  `mobile/src/js/{app,backend,store,sync}.js`, `build-www.mjs` and `docs/privacy.html`, all of which this
  work also touches in small hunks; `web/css/app.css` is NOT touched, the styles are in `review.css`).

#### Flashcards and battles: paid apart, with one bonus for doing both (2026-10-12, creature-game chat; same worktree, NOT committed)
- Owner's rule: "Keep battles and flashcards totally separate but give them separate benefits so users are
  encouraged to do both." Battles pay coins (as before). Flashcards pay **glow**: `idle.cardsGlow` gives an hour
  of the garden's output (never under `CARDS_GLOW_MIN` = 20) once a day when `day.cardsCleared` is set;
  `game.reward()` calls it and puts it on the result as `glow`, and the reviewer shouts it.
- The bonus: `rules.payBoth` pays `BOTH_XP` 30 and `BOTH_COINS` 3 once a day when the day has both a finished
  battle and cleared cards, whichever comes second (`day.both`). From the reviewer it is inside `out.xp` with
  `out.both`; from `finishBattle` it is `out.both` only, shown as its own line on the result screen.
- Explainer lines in `info.js` (Glow, Coins and XP pages) read those constants. Tests: `tests/js/cards-rewards.test.mjs`
  (4). Two lines of `web/js/pages/review.js` changed (the two shouts). Seen in the worktree's test copy:
  seven cards, then "Today's cards cleared! +20 glow". The both-bonus was only unit-tested (battles need 100 words).

### Two-way Anki sync, computer and phone (2026-10-12, "two-way Anki sync" chat; committed on main as be04d5f; released in v0.15.0)
- **Card fronts never show the word; cards move to their language's deck (2026-10-17, owner's answers relayed by
  the main chat; committed locally on main, NOT pushed)**.
  - **Fronts**: a word without a marked translation used to show its meaning as is (sometimes naming the word:
    "… (Egyptian dialect: 'تعلّي' = …)"), or the word itself when it had no meaning. Now `exporters.anki_front` /
    `shared-logic.js ankiFront` clean the meaning with the reviewer's rule (`hide_answer` / `hideAnswer`, the same
    letter ranges on both sides; a JS test checks both agree with `web/js/review/deck.js hideAnswer` on 16 samples),
    and with nothing left show the unmarked translation if it does not show the word, else the sentence with "…"
    for the word, else "…". Existing cards get the cleaned Front through the ordinary sync (the word's rendering
    changed, the card did not, so Tamkeen's side wins; only the Front field is rewritten, review history stays).
    Both sides compute the same front, so they do not fight. Guard: a Front from Anki that is only the word, or
    "…", is never taken as a meaning (`anki_sync._pull`). **Update every device before it syncs**: an older
    version still renders the old front and would take the cleaned one coming back from Anki as an edit to the
    meaning. Fixtures: `parity.json` (only v3's front changed, by a script, not a full rewrite) and
    `fsrs_parity.json` (`python -m tests.test_fsrs`).
  - **Move**: Vocab page ⋯ menu → "Move Anki cards to their language's deck" (`moveToLanguageDecks` in
    `components/ankisync.js`, a `modal.js` box: says how many and to which decks, then moves). Rule:
    `misplaced_cards` / `misplacedCards` (a linked card whose deck's language differs from its word's).
    Computer: `GET/POST /api/anki/move`; the request is kept in `anki_sync_state.move` and the add-on moves the
    cards at its next sync (`syncer.apply` "move": `col.set_deck`, keeps the history; cards on loan to a filtered
    deck stay), reports `moved` back, and Settings shows the result (`last_move`). Phone: the same routes in
    `backend.js` move at once through a new plugin method `AnkiDroidPlugin.moveNote` (updates each card's deck;
    **not compiled yet**, first compile is the next CI run). Running it again moves only what is still misplaced.
  - Tests: front rule (Python, phone, reviewer agree), the pull guard, `misplaced` parity, an end-to-end move in a
    real collection (history kept, safe twice), a phone move test. Also run by hand: the app on a port, the box from
    the ⋯ menu, the stand-in Anki moving the card at its next sync. 380 pytest (with the anki library), 410 JS.
- **A deck per language (2026-10-15, at the owner's choice, asked for by the main chat after 8996ff3; committed
  locally on main, NOT pushed)**: "A separate Anki deck per language (e.g. 'Tamkeen – Arabic'), instead of one deck
  for everything." Each language's words get their own deck, default name `Tamkeen – <English name>`, renamable per
  language in Settings (two languages may not share a deck, and one deck may not sit inside another's; the app
  refuses such names). Setting `anki_decks` (language -> name; computer `app/anki_bridge.py deck_names`, phone
  `anki-droid.js deckNames`), filled the first time it is asked: **the old single deck ("Tamkeen", or whatever
  `anki_deck` was renamed to) stays the deck of the language most saved words are in**, so an existing learner's
  cards neither move nor get made again. A card already in any of the decks stays where it is whatever the deck's
  language (an old Spanish card in the old "Tamkeen" deck keeps syncing there); only NEW cards go by the word's
  language. A hand-made card takes the language of the deck it was made in, and is linked only to a word of that
  language. The rules take every note with its deck's `language` (`anki_sync.plan`, `anki-sync.js`); new-card
  actions carry `language`. The sync reads words of every language straight from the database / `lib.vocab`,
  never from `/api/vocab` (which now shows one language). Words made from Anki cards are stored with the deck's
  language. "Export for Anki" puts each word in its language's deck inside the one file (Anki files cards by deck
  NAME on import, ids do not matter: checked with the anki library), so exports and the sync share decks.
  Add-on is version 3.0 (`syncer.request(col, decks, ...)`, `apply`/`carry_out` without a deck name; the config
  and every round carry `decks: [{language, name}]`; an older add-on is told the sync is off). **Learners must
  install the add-on again.** The Java plugin is unchanged (every call already names its deck).
  Tests: 4 new rule cases + deck-name parity, 4 new end-to-end tests (including an existing learner's "Tamkeen"
  deck with a Spanish card in it: nothing added, removed or moved), 3 phone tests, 1 phone export test. Also run
  by hand: the app on a port, the add-on v3 downloaded from it, a throwaway collection that already had a synced
  "Tamkeen" deck (kept for Arabic, nothing doubled; a Spanish word went to "Tamkeen – Spanish"), and the Settings
  panel's per-language names and its refusal of a shared name. 325 pytest (with the anki library), 376 JS.
  Not done (owner's call): moving cards that sit in the "wrong" language's deck (e.g. old Spanish cards in "Tamkeen")
  into their own deck. The sync never does it; Anki's Browse -> Change Deck does, without losing history.
- **Pushed and released as v0.15.0 at the owner's request (2026-10-12)**: main (0864dbe) pushed, tag `v0.15.0` on
  that commit, release workflow green (tests, Windows/macOS/Linux installers, APK). The Java plugin compiled for
  the first time in that CI run. The release holds only committed code: other chats' unsaved edits to the reels
  files and `wordbubble.js` are NOT in it. Still untested: the add-on in real Anki, and anything on a real phone.
- **Committed and merged at the owner's request ("commit, merge"), 2026-10-12**: the sync is be04d5f on main; the
  vocab reviewer branch `anki-export` (d4b8b24) was then merged into main as 0864dbe with no conflicts. Main is 8
  commits ahead of origin; nothing is pushed. Tests on main after the merge: 255 pytest with the `anki` library
  (18 of them are skipped without it), 297 JS. The Vocab page was opened in the preview after the merge: the
  Review banner, the "My notes" box and the "Anki: ..." line all show, no errors. Still unsaved in the main
  checkout and not part of either commit: other chats' edits to the reels files and `wordbubble.js`.
- **Owner's words**: sync "only edits, new cards, review progress, and deletions made into the Tamkeen Anki Deck
  not all the other decks ... this will only sync with a specifically set Tamkeen Deck". Off until switched on in
  Settings (computer: card "Anki (optional)"; phone: card "AnkiDroid (optional)"). Deck name is a setting,
  default "Tamkeen". "Export for Anki" is unchanged and still works beside it.
- **The rules are one pure file per side, kept identical**: `app/anki_sync.py` and `mobile/src/js/anki-sync.js`
  (`plan(words, notes, links, render, ...)` returns what each side should change; it touches neither Anki nor
  storage). The rules are written out at the top of the Python file. `tests/test_anki_sync.py` holds ~47 cases
  and writes them to `tests/fixtures/anki_sync_parity.json`; `tests/js/anki-sync.test.mjs` replays every case
  through the JS. After changing a rule on purpose: `TAMKEEN_WRITE_FIXTURES=1 .venv/Scripts/python -m pytest
  tests/test_anki_sync.py -q`.
  - **Identity**: a note is a word by its guid `tk-<uid>` (cards made by the add-on or an imported .apkg) or its
    tag `tamkeen-id::<uid>` (cards made through AnkiDroid, and hand-made cards once linked). A note with neither
    is hand-made: linked to the word with the same front or the same word (normalised), else it becomes a new
    word whose uid is worked out from the note's guid (`uid_from_guid`), so the phone and the computer make the
    same word. Two cards of one word (both devices made one before AnkiWeb joined them): the same one is kept
    on every device (most reviewed, then `tk-` guid, then oldest); an exact, never-studied copy is deleted,
    anything else is tagged `tamkeen-duplicate` and ignored.
  - **Edits**: front and back merged separately against what both sides held at the last sync (`anki_links`:
    tf, tb, af, ab). The side that changed wins; both changed = newer wins (note `mod` vs word `updated_at`).
    From Anki only meaning (or the translated sentence), notes and `memo` come back, never the word or its
    sentence. A link only moves on when a sync sees both sides agree, so a failed write is retried.
  - **Deletions**: only recorded ones travel. Tamkeen side = the tombstone. Anki side (computer) = the add-on's
    own list (`user_files/deleted.json`, filled from Anki's `notes_will_be_deleted` hook and from Anki's
    `graves` table before Anki's own sync clears it). A card that is merely absent is "missing": nothing
    happens until the owner picks "Make the cards again" or "Delete the words here too" in Settings.
    Deleting a word removes the Anki card only after the owner has agreed once (`anki_delete_ok`; asked by a
    dialog on the Vocab page, or in Settings for deletions that arrived from another device = "held").
    A card edited after its word was deleted brings the word back.
  - **Never written**: the image field, the TTS/audio field after creation, any schedule, an existing card
    layout (so the timer). The add-on and the phone plugin both hard-code Front and Back as the only writable
    fields and refuse any note they did not find in the deck themselves, whatever the app asks.
- **Computer**: `app/anki_bridge.py` (database side: applies Tamkeen's share, builds Anki's share, status for
  Settings), new routes in `app/api/anki.py` (`/api/anki/sync/config`, `POST /api/anki/sync`, `/media/<name>`
  need the add-on token; `/sync/status`, `/sync/options`, `/sync/resolve`, `/progress`, `/linked/<uid>` are the
  app's own). New table `anki_links` and settings `anki_sync`, `anki_deck`, `anki_delete_ok`, `anki_sync_state`
  in `app/db.py` (local to the device, not Drive-synced). Add-on: `web/anki-addon/syncer.py` (reads and writes
  the deck; no window code, so testable), `__init__.py` (hooks: profile opened, a 10-minute timer that waits
  while reviewing, leaving the reviewer, after Anki's sync, Tools -> "Sync Tamkeen now"), `core.py` helpers,
  manifest version 2.0. **People who installed the add-on before must download and install it again.**
  New cards come from `exporters.anki_fields`, `anki_deck._layout()` and the same MP3 clip cache as the export,
  100 per round. A different Anki collection (other profile) is never touched until "Sync with this collection
  instead" is pressed.
  - Gotcha: Anki will not let an add-on choose a note type's id (`add_dict` panics on a non-zero id), so a
    layout made by the sync has a different id from the one inside the .apkg (1791700000001). Someone who syncs
    first and imports an exported deck later gets a second layout from the import ("Tamkeen+"); cards are not
    doubled (same guids). Importing first, then syncing, reuses the imported layout.
- **Phone**: `AnkiDroidPlugin.java` (talks to AnkiDroid's content provider directly, no extra library; manifest
  has the permission `com.ichi2.anki.permission.READ_WRITE_DATABASE` and a `<queries>` entry), registered in
  `MainActivity`. `mobile/src/js/anki-droid.js` runs the rules with it (everything it needs comes in as `env`,
  so `tests/js/anki-droid.test.mjs` runs it against a stand-in AnkiDroid); `anki-phone.js` wires it to real
  storage (IndexedDB key `anki_droid`); routes in `backend.js`; syncs on start, on resume, every 10 minutes,
  after a Drive sync and after vocab changes. Screens: shared `web/js/components/ankisync.js` (Settings panel,
  the "Anki: due ... right ... wrong" line and the delete dialog on the Vocab page).
  - **What AnkiDroid's API can and cannot do** (read from its source on 2026-10-12, main and tags v2.20.1 to
    v2.25.1): guid cannot be set (hence the tag); notes CAN be deleted (`delete` on `notes/<id>`, in every
    version looked at), so deletion is real on the phone too; there is no record of deletions, so a card deleted
    in AnkiDroid is always "missing" and waits for the owner; card schedules (type, queue, due, interval, reps,
    lapses, last review time) can be read from **AnkiDroid 2.24.0 on** (the `cards` address), nothing before;
    single answers (the review log) cannot be read on any version, so on the phone "wrong" = lapses and
    "right" = reps - lapses, with no answer dots. Due dates use "last reviewed + interval", or a probe for
    today's day number (`prop:due=0` and so on) when a card has no last-review time. Media gets a name of
    AnkiDroid's choosing, so the layout made on the phone names the font as stored.
- **Tested**: `tests/test_anki_sync.py` (31), `tests/js/anki-sync.test.mjs` (52), `tests/js/anki-droid.test.mjs`
  (13), `tests/test_anki_addon_sync.py` (18: the app's real routes + the add-on's real `syncer.py` + a real
  collection made by Anki's Python library 26.9.3, with a second deck that every test checks is byte-for-byte
  unchanged; three of them load `__init__.py` with a stand-in for Anki's window). Those 18 need the `anki`
  library, which is not in `.venv`: `uv pip install --python .venv/Scripts/python.exe --target <folder> anki`,
  then run pytest with `TAMKEEN_ANKI_LIB=<folder>`; without it they are skipped. Totals before the reviewer was
  merged in: 242 pytest (224 + 1 skipped without the library), 283 JS. Also run by hand: the app on a real port, the add-on downloaded from
  it and unpacked, its code driving a throwaway collection over real HTTP (new cards, reviews, an Anki edit, a
  hand-made card, a held deletion agreed in Settings), and the Settings and Vocab screens in the preview on
  both builds (launch configs `tamkeen-anki-sync` 8860, `tamkeen-anki-sync-phone` 8861).
- **NOT tested**: the add-on inside the real Anki program (its window code has only met a stand-in); AnkiWeb
  carrying cards between a real computer and phone; anything on a real phone. **The Java plugin has never been
  compiled**: this computer has no Android tools, so the first build is the next CI run (`android.yml`), and
  the first run is the owner's phone. Unknown until then: Android's permission question (if Tamkeen was
  installed before AnkiDroid, Android may not offer it until Tamkeen is installed again), whether AnkiDroid
  plays the `.ogg` clips, whether making the layout on the phone makes AnkiDroid ask for a full sync, and speed
  with a large deck.
- The reviewer (now merged) adds `vocab.memo` and a second "Note:" line on the card back; the card reader
  expects both, so "My notes" edited in Anki come back. On the phone a word without a `memo` key is given an
  empty one before the rules run (`anki-droid.js`), so it can receive one. Files
  both touch in small hunks: `app/db.py`, `mobile/src/js/{app,backend,store}.js`, `build-www.mjs`,
  `web/js/pages/vocab.js`, `docs/privacy.html` (the Anki section now describes the sync).

### Collections as a drop-down list of ALL of them; the Instagram sign-in browser closes itself (2026-10-12, "Media import" chat; committed locally, NOT pushed, NOT released)
The owner, after trying the phone's reel picking (relayed by the main chat): "Instagram web browser isn't auto
closing once I sign it in like it should be", and "when you click find in my collections, there should be a drop
down of the names of all your collections for you to pick from for it to display, then show from it which you can
then tick one by one, not just search through all of your collections for you".
- **Why the phone showed no collections**: it asked `/api/v1/collections/list/`, which Instagram's WEBSITE
  answers with "not found" (404; checked on the real site in a phone-style window, with and without
  parameters; `i.instagram.com` refuses too). So only "Everything I've saved" was ever offered. The Saved page
  itself is no help on a phone: there it draws no collection links at all.
- **How collections are found now (phone AND computer)**: every saved post carries the numbers of the
  collections it is in (`saved_collection_ids` in `/api/v1/feed/saved/posts/`, sent as text), and
  `/api/v1/feed/collection/<number>/all/` gives a collection's name (`save_media_response.collection_name`).
  So the saves are walked newest first, a page (21 posts, ~0.8 MB) at a time, and each new number is asked
  for its name. Stops at the end of the saves, after 10 pages with nothing new (`WALK_QUIET`), or at 40 pages
  (`WALK_PAGES`, ~800 saves). "Stop" keeps what was found. A collection whose posts are all older than that
  is not found (nothing was found past page 29 on the owner's account).
  - Phone: jobs `savedIds` and `collectionName` in `mobile/src/js/instagram-phone.js` (the old `collections`
    job is gone), driven by `startCollections` in `mobile/src/js/reels-phone.js`. Collections known from
    before that the walk didn't reach are kept unless every save was read.
  - Computer: `_walk_saves` / `_WALK` in `app/reels_worker.py`, run after the Saved page's links are read
    (that page only draws the first few: 11 of the owner's 20), merged by `reels.merge_collections`. A
    collection found only this way gets the address `/<me>/saved/c/<number>/`: Instagram goes by the number
    and corrects the name in the address (checked: same 12 posts either way).
  - **Measured on the owner's account**: 20 collections, all named (the computer knew 11 before). Phone-style
    window: 39 pages, 100 seconds, about 30 MB. It is done once; the list is remembered ("↻ Look again"
    walks again).
- **The drop-down** (`drawSaved` in `web/js/pages/reels.js`, both shells): "1. Choose a collection" is now a
  `<select id="reel-coll">`: "Choose a collection…", every collection by name, then "Everything I've saved",
  with the button `#reel-find` beside it ("Find my collections" when none are known, else "↻ Look again").
  Choosing one lists its reels for ticking as before. The chips (`.reel-coll`) are gone.
- **The sign-in browser closes itself** (phone): `openInstagramSignIn()` (new export of both `app.js`
  shells) opens Instagram's sign-in page in the app's browser with `closeOnInstagramSignIn`. `InAppBrowser`
  then asks the page once a second whether it is signed in (on instagram.com, off the sign-in pages, with the
  `ds_user_id` mark: the same test as `reel-page.js`); after two yeses in a row it closes, shows "Signed in to
  Instagram", and the plugin fires `instagramSignedIn`, which the phone shell passes on as the app event
  `"instagram" {signed_in: true}`. The Reels page then asks again for whatever needed the sign-in (`lastAsk`:
  finding the collections, a collection's reels, the ticked reels), and the reel player's sign-in notice tries
  the reel again. Only the word "in" comes back from the page; nothing about the account.
  The computer was not changed: its own Instagram window already hides itself once signed in (`HIDE_WINDOW`).
- **Checked for real**: computer, through the app's window with the owner's account: 13 → 22 options in the
  list (20 collections), one found only the new way was chosen and its 3 reels listed with tick boxes. The
  phone's script against the real site in a phone-style window: 20 collections named, one listed (maker,
  picture and video for every post). Phone build at 360 x 721 with the pretend Instagram: asked to sign in,
  the stand-in sign-in carried on by itself, three collections in the list, one chosen, reels ticked.
- **NOT checked**: anything on a real phone. The Java (`InAppBrowser.open` has a new last argument,
  `GoogleDriveAuthPlugin.openBrowser` passes it) has NOT been compiled (no Android tools on this computer; the
  release build compiles it). Whether Instagram's sign-in page sets `ds_user_id` early enough inside an
  Android WebView is assumed from the computer's windows, where the same test is used.
- Tests: 238 pytest (`merge_collections`), 297 JS (`instagram-phone.test.mjs`: `savedIds`, `collectionName`).

### Follow a YouTube channel (2026-10-13, "Youtube" chat, asked for through the main chat; committed locally, NOT pushed)
The owner's request: a button at the bottom right of the YouTube player that saves the channel (outline until
followed, filled once followed, a brief "Following" bubble), and in the Library a second bar under YouTube with
"Recently watched" at the far left, then the followed channels, the one watched most recently first.
- **The list** is the setting `youtube_follows`: one record per channel {name, id, image, on, watched_at,
  updated_at}, kept after unfollowing (`on: 0`) so the unfollow reaches other devices. Rules in
  `web/js/ytfollow.js` (pure, tested in `tests/js/ytfollow.test.mjs`); the computer's copy of clean and merge is
  `clean_follows` / `merge_follows` in `app/youtube.py`. **The two must agree exactly** (same tidy-up, same
  order: plain character codes, which in Python means sorting by UTF-16 bytes), or two devices would keep
  rewriting each other's list; `tests/test_media.py` repeats the JS cases.
- **Videos are matched to channels by the channel's NAME**: a YouTube episode's `description` has always been
  its channel's name, so no new column was needed. `GET /api/episodes?channel=<name>` (both backends) lists one
  channel's videos. Two channels with the same name would be mixed up; a renamed channel splits in two.
- **Sync**: `channels` in library.json (engine.py `snapshot` / `_content` / `merge`, and the phone's sync.js);
  per channel the copy with the newer `updated_at` wins. Saving the setting asks for a sync after 30 s.
- **Player** (`player.js`, `#follow` in the play controls row, styles at the end of `media.css`): on follow the
  name is saved at once, then `fetchChannel` (ytcaptions.js) looks up the channel id and picture (the channel
  page's link-preview image) in the background. Opening a video of a followed channel moves that channel to
  the front (`noteWatched`). On phones the button is a round "+" / "✓" at the end of the controls row.
- **Library** (`library.js`): phone = the second strip (`#podcast-list`) under YouTube; computer = a row of
  chips above the list. "Recently watched" orders the YouTube list by when each video was last opened on this
  device (`allProgress()`), else by when it was added. A channel's page has "More from this channel" (opens
  the YouTube window on that channel: `openYouTube(address)` now takes an address) and "Unfollow".
- Checked in the desktop preview (button, bubble, id and picture arriving, chips, channel page) and the
  phone-sized preview (strip order, channel filter, round button fits). **Not checked: a real phone, and two
  real devices syncing** (only the two-device test with a pretend Drive).
- Tests: 242 pytest, 304 JS.

### Web-page reader: the title's words are tappable and coloured (2026-10-13, "Media import" chat; NOT committed)
Owner's report (via the main chat): an imported page's title could not be tapped and was not coloured
purple/plain like the rest. Cause: `web/js/pages/reader.js` drew the title as one plain `<h1>` from the episode's
title, outside the word list. Now the title is split into words that are put IN FRONT of the page's stored
words (segment `TITLE_SEG` = -1) before `regroupWords`, so popup, saving, "seen" colouring and the right-click
menu all treat them like any other word. Nothing stored changes. Two things shift by the number of title
words (`titleWords`): the word count in the banner (still the page's own count) and the search jump (`?t=`).
Headings inside the page body were already word by word. Checked in the desktop preview on a real Arabic page
(title words coloured, a tap opens the popup and clears the purple, body taps and a search jump still land
right). Only `reader.js` changed.

### Quick / detailed word lookup (2026-10-13, "Media import" chat; NOT committed)
Owner's request (via the main chat): a switch between "quick" (lightning icon: just the word's meaning) and
"detailed" (target-with-arrow icon: the popup as it was), on the YouTube player, the Instagram reel player,
the podcast player and the web-page reader.
- `web/js/components/lookupmode.js` (new): the choice (`lookupMode()`, localStorage `lookupMode`, default
  detailed, per device), `setLookupMode`, the window event `tamkeen:lookupmode`, and `lookupToggle()`, the
  two-button pill. Icons `bolt` and `target` are in `icons.js` in the usual line style.
- Where the switch is (the owner then confirmed: on each player's own bar, the web-page reader's top bar, the
  video player's bottom bar): `player.js` puts it in the play controls after the speed box (podcasts, own
  videos, YouTube); `reader.js` in the banner before A−; `reels.js` in the reel's controls row on the phone, in
  its compact form (`lookupToggle({compact: true})`: only the chosen mode's button shows and a tap changes to
  the other, because that row is full even at 360 px), and in the reel's top line on the computer, which has
  no controls row. Each screen's popup `fetch` now passes the popup's options on to `getDefinition`.
- The owner also confirmed: quick mode still uses the AI (definition only), and the choice is remembered.
- `wordbubble.js`: in quick mode the popup shows the word, its meaning, **More** (the full explanation for this
  one word; the mode stays quick) and Save. Flipping the switch while a popup is open redraws that word the
  new way. No audio buttons or ↻ in quick mode.
- My decisions (the owner did not say): quick mode still asks the AI, with a much shorter request
  (`define(..., {quick: true})`: `quickPrompt`, `QUICK_SCHEMA` = meaning only, the sentence without its
  neighbours; under a third of the full request's size), kept in the answer cache under its own key
  (`quickCacheKey`). A full answer already kept for that word and sentence is used instead of asking again.
  A word saved from a quick popup has its meaning but no notes or sentence translation.
- Styles: a section at the end of `web/css/media.css`. Phone build list has the new file.
- Checked in the desktop preview with a stand-in for the AI (a made-up key in the throwaway library and a
  faked provider answer): all four screens at desktop and phone width, switching with a popup open, More,
  cache reuse, no overlap with the Follow button. **Not checked with a real AI provider or on a real phone.**
- Tests: `tests/js/lookupmode.test.mjs` (6). Totals 310 JS.

#### Review card: the owner's first feedback after v0.15.0 (2026-10-13, "Spaced Repetition System (fork)" chat; in the MAIN checkout, NOT committed)
The owner's words: "the buttons aren't centered ... the main word should also be centered on the back card,
and the card should still be centered when flipped over ... the card should be totally solid color without
the colored bar on top and without the shadow thing below it also". Only `web/css/review.css` and
`web/js/pages/review.js` changed:
- The two answer buttons are the same width (`flex: 1 1 0`), so the pair sits in the middle; on a phone
  "Not remembered" used to be wider than "Remembered", which pushed the gap off-centre.
- The card is one fixed size on both sides (`.rv-scroll` height `min(500px, 100dvh - 230px)`), so it no
  longer changes height and jumps when it turns; a back with more on it than fits scrolls inside the card.
- Back: word, sentence and source line centred; the block sits in the middle of the card when there is room.
- Card: plain `var(--surface)`, no gradient edge, no drop shadow, and the stack of waiting cards under it
  (`.rv-ghost`) is gone from the page and the script.
- Checked in a preview of main at 390 x 844 and 1280 x 720 (launch config `tamkeen-review-main`, port 8852):
  card rectangle identical before and after the flip, buttons 173 px each around the centre line.
- The worktree `../tamkeen-anki-export` (branch `anki-export`) is now BEHIND main and does not have this.
- **Second round the same day (the owner, through the main chat): "the back card design I think is just
  ugly ... a lot more sleek and modern ... the answers much bigger and ensure they are centered ... space
  between where the answer and answer sentence is and the rest of the back card ... elongating the card".**
  Still only `web/css/review.css` and `web/js/pages/review.js`, still NOT committed. The back no longer
  reuses the Vocab page's `.vocab-item` markup (the owner's first wish, "as it appears now in the vocab
  section", is superseded by this). It is two parts: `.rv-answer` on top (the word at 54 to 76 px, its
  sentence, round "Word" / "Sentence" audio buttons), then a gap and a hairline, then `.rv-details`
  (labelled filled boxes: Meaning, Notes, My notes; the source line last). Notes boxes grow to fit their
  text (`fit`), re-measured on window resize. The card is taller (`min(680px, 100dvh - 176px)`), the same
  size on both sides; a back longer than that scrolls with no scrollbar and fades out at the bottom
  (`.rv-scroll.more`). A saved phrase (more than 14 characters) uses a smaller word size (`.rv-word.long`).
  The game's XP chip is hidden while the reviewer is open (`body.rv-open #game-chip`): it sat on the card's
  corner, and the reviewer shows its own "+N XP". Checked at 390 x 844 and 1280 x 800.
- **Third request the same day (the owner, through the main chat): "an option to delete the card during
  review, bottom right of back card, with a confirmation popup that is sleek and modern".** A small bin
  button at the bottom right of the back (`.rv-trash`, also the Del key) opens the reviewer's own box
  (`askDelete` in review.js, `.rv-ask` in review.css): blurred backdrop, the word, what will happen, "Keep it"
  (focused) and "Delete". Confirming does exactly what the Vocab page's Delete does (`DELETE /vocab/{id}`:
  the word goes from every device), then the card drops away and the session carries on (`removeWord`;
  `onDelete` tells vocab.js, one new line there). Like `confirmDelete` in components/ankisync.js it asks
  `/anki/sync/status` and `/anki/linked/<uid>` first, says plainly when the word's Anki card and that card's
  history would go too, and sets `delete_ok` on a first yes; "Delete" stays disabled until that answer is
  in. **My reading, not the owner's stated choice:** "delete the card" = delete the word, not "take it out
  of review only" (there is no such state). The Anki-linked wording was not seen on screen (the test copy
  has no Anki sync). Also: `.rv`, `.rv-bg` and `.rv-fx` are `overflow: clip` now, because a merely hidden
  box can still be scrolled by the browser (seen when a tool scrolled a button into view), which slid the
  whole table off-centre. Files: review.css, review.js, one line in vocab.js; NOT committed.
- **Fourth, a bug report (the owner, through the main chat): on the Vocab page's Review banner the "All
  caught up · N words back ..." line ran over the Open button.** The line (`.rb-sub`) is now cut where its
  room ends, and when it is longer than that room it slides to its end and back by itself: vocab.js
  `fitReview` measures it (also on resize, through a ResizeObserver that the page's cleanup disconnects)
  and sets `--rb-shift` / `--rb-time`; review.css `rb-scroll` does the sliding. With "reduce motion" on
  it ends in "…" instead. Checked at 390 px wide: the line ends 14 px before the button and slides.
  Files: review.css, vocab.js (the banner block only); NOT committed.

### Library: the Reels square lists the reels; "Watch these reels" for ticked ones (2026-10-13, "Media import" chat; committed locally, NOT pushed, NOT released)
The owner (relayed by the main chat): "when you click reels square from the left and right scrolling bar at the
bottom that it shouldnt just pull up the import reels page, it should show all the reels below. Once you select
multiple reels there should be a watch these reels teal button that appears".
- `web/js/pages/library.js`: the `reels` entry of `KINDS` is a real kind now (`feed: REELS_FEED`, no `href`), so
  the square behaves like YouTube / My webpages: it shows the reels in the ordinary list below (newest first,
  each with its maker and length in seconds, Watch and Delete). With no reels it says so and offers "Get reels".
  The head of the list has **Get more reels** (the import page, `#/reels`, which is unchanged) and
  **▶ Watch all**. For this list the status tabs and "Transcribe selected" are hidden (every reel is ready).
- Ticking reels shows `#watch-selected` (class `primary`, the teal one): "▶ Watch this reel" / "▶ Watch these N
  reels". It appears from ONE tick (the owner said "multiple"; one seemed odd to leave without a button; say if
  it should wait for two). It opens `#/reels/play?at=<first>&only=<ids>`.
- `renderPlayer` (`web/js/pages/reels.js`, three small edits; the Reels Player chat owns that function): with
  `only=` it plays just those reels, in that order, counts "1 / 2", keeps `only` in the address as it moves on,
  and its back arrow returns to the list in the Library. After the last it goes round to the first, as before.
- Works on the computer too (its Reels list in the Library), though reels only play on the phone.
- Checked: phone build at 360 x 721 with the stand-in reel window: empty state, the list, the button's colour
  (the accent teal) and that it stays on screen (the toolbar sticks to the top) while the last row is in view,
  two ticked out of order play in listed order, back arrow, Watch all, Get more reels. 242 pytest, 310 JS.
  **Not checked on a real phone.**
- Committed with only this chat's lines of `reels.js` (another chat has an unsaved lookup-mode edit in that file).

### WARNING: the test library `reels-data` is signed in to the owner's Google Drive (found 2026-10-13)
`.claude/launch.json` → `tamkeen-media` (port 8797), and this chat's test scripts, use the data folder
`…/0aacd342-…/scratchpad/reels-data`. Its settings hold a Google sign-in for the OWNER'S account (device
"Meridian-58ab47"), so every app started on it syncs with the owner's real library through Drive. The first
sync was 2026-10-12 16:44; before that the folder held only test content (podcasts added while testing
Trending, imported test pages, a test video, YouTube test videos, reels). All of that was merged into the
owner's library, and the owner's library into the test one: on 2026-10-13 the two were identical (same 12
feeds, 112 vocab words, same reels/pages/videos, including the same deletions). It is not known who connected
it (no script in the scratch folder does; a sign-in can only come from pressing "Connect Google Drive" in a
window served from that folder, or a direct write to its database).
- Nothing was disconnected or deleted: a dev server on that folder was running at the time, and the owner may
  be using it on purpose. **The owner has been asked.** Until they answer: do NOT run tests that add, change or
  delete things on `reels-data` (they land in the owner's real library); use a fresh data folder instead, and
  check any test folder with `SELECT value FROM settings WHERE key='google_refresh_token'` first.

### Addendum to the Drive warning: a COPY of a signed-in library is signed in too (2026-10-13, "Instagram Reels Player" chat)
The Google sign-in is a row in the library's `settings` table (`google_refresh_token`), and the device id is
another, so copying `library.db` copies both. This chat's computer test (`reel_desktop_colour_test.py`) copied
`reels-data/library.db` into its own scratch folder and started a real server on the copy three times on
2026-10-12 at 22:38 to 22:39. Each start synced with the owner's Drive (the log shows merges coming DOWN; no
uploads). The third run un-marked 8 seen words in the copy and re-marked one; the server was closed while the
sync that would have sent that was still listing files. Checked afterwards, read-only: all 7 words are still
marked seen in `reels-data` and in the owner's real library (`%APPDATA%/ArabicPodcastStudio`), both of which
synced later, so nothing from the test reached the real library. That run also made one word lookup with the
owner's AI key. The copy has been deleted, and both of this chat's computer test scripts now delete the
`google_refresh_token` and `google_email` rows from their copy before starting a server.
**Rule: after copying a library for a test, strip those two settings rows before starting anything on it.**
- **Fifth (the owner, through the main chat): "change the folder icon to something more sleek and clean
  that matches the rest of our icons".** `web/js/icons.js` has a new `folder` drawing (only that entry is
  mine; the `bolt` / `target` entries beside it are another chat's unsaved work). On the Vocab page it
  replaces every folder emoji: the folder chips, the tags on a word, the "Folders" and "Add to folder"
  buttons, and the folder menu. For the menu, `showMenu` in BOTH shells (`web/js/app.js`,
  `mobile/src/js/app.js`) gained one line: an entry may carry `icon` (SVG markup put in front of its
  words). The open folder's chip shows the icon softly filled (one rule in review.css). The folder emoji
  in chat.js (shared-folder cards) is untouched: it was not asked for and is another chat's page.
  Files: icons.js (one entry), vocab.js, both app.js (one line each), review.css; NOT committed.
- **All five of the items above are committed locally on main as 41f1f54 (2026-10-13), not pushed, not
  tagged**: the main chat does the merge and the release. Six files, only this chat's lines:
  `web/css/review.css`, `web/js/pages/review.js`, `web/js/pages/vocab.js`, `web/js/icons.js` (the `folder`
  entry), and one line in each `showMenu` (`web/js/app.js`, `mobile/src/js/app.js`). Tests at the commit:
  242 pytest (1 skipped), 310 JS. Pictures for the owner are in `../review-card-pictures/`. The owner has
  since confirmed the delete: "No I meant actually delete it" (the word itself, as built).
- **2026-10-13, later: disconnected, with the owner's "yes" (relayed by the main chat).** The two settings rows
  (`google_refresh_token`, `google_email`) in `reels-data/library.db` were blanked, on this computer only. The
  running `tamkeen-media` server then reported `signed_in: false`. Google was NOT asked to cancel the sign-in
  (the app's own "sign out" does that, and it could sign the real app out too, since both use the same Google
  app). The real library was checked afterwards: still signed in, same 12 feeds and 112 vocab words. Nothing in
  Drive or the real library was deleted; `reels-data` still holds a now-stale copy of the owner's library.
- The owner also answered the other open point: the "Watch these reels" button appears "after 1 tick" (as built).
- **Sixth (the owner, through the main chat, after v0.16.0): "next to the export to Anki button in vocab page
  there should be a little settings icon ... that brings users to the Anki settings in setting".** Committed
  locally on main as the commit after 41f1f54 ("Vocab page: a settings button beside Export for Anki ..."),
  not pushed, not tagged. `#anki-settings` in vocab.js (the `settings` icon from icons.js) sets the address
  to `#/settings?show=anki` (`ANKI_SETTINGS` in components/ankisync.js). Both routers already drop what
  follows the "?", so Settings opens as usual; `ankiSyncPanel`, which both Settings pages call, sees
  `show=anki` and scrolls its card to the top twice (50 ms and 600 ms, because the cards above grow as
  they load) and rings it. No change to either Settings page or router. Checked in a preview of main at
  desktop size and in a fresh phone build at 390 x 844 (built into this chat's scratchpad, not
  `mobile/www`): the button sits right after "Export for Anki", and Settings lands with "Anki (optional)" /
  "AnkiDroid (optional)" at the top. Not checked on a real phone. Tests: 242 pytest (1 skipped), 310 JS.

### Library: no explanation block under YouTube (2026-10-13, "Media import" chat; committed locally)
The owner asked (through the main chat, with a phone screenshot) for the block that explained YouTube (grey play
square, the title "YouTube", "YouTube videos you've watched here, the most recent first…") to go. Removed in
`renderHead` in `web/js/pages/library.js` for "Recently watched", on the phone and the computer (one code path).
Kept on purpose: the header of a single followed channel (it holds "More from this channel" and "Unfollow"),
the line shown when there are no YouTube videos at all, and every other kind's header.

### Phone: every reel sent to Groq failed as "Couldn't reach Groq" (2026-10-13, "Media import" chat; committed locally as 965b671, NOT pushed, NOT released)
The owner, on the phone (v0.16.0): "I keep getting this when trying to transcribe reels with groq, Can't be used:
Couldn't reach Groq. Check your internet connection".
- **Cause** (read from Capacitor 8.5.2's Android source; not reproduced, there is no phone or Android tools
  here): a reel's video is downloaded with `NativeHttp` (`fetchWholeB64`, `responseType: "arraybuffer"`), and
  Capacitor hands that back as base64 made with `android.util.Base64.DEFAULT`, which puts a line break every 76
  characters (`HttpRequestHandler.readStreamAsBase64`). The reel code passed that text straight on as the
  upload (`postAudio({b64})` → a `base64File` form part), and Capacitor's uploader decodes it with
  `java.util.Base64.getDecoder()` (`CapacitorHttpUrlConnection.writeFormDataRequestBody`), which refuses any
  character outside the base64 alphabet, line breaks included. So the request threw on the phone before
  anything was sent, four times over (it was retried), and `postAudio` called every thrown error "Couldn't
  reach …". Podcasts, own files and "Test the key" never hit it: their audio goes through `atob` (which
  ignores line breaks) and `FileReader` (which writes none).
- **Fix**: `tidyBase64` (new, `web/js/stt.js`) takes the line breaks out, in `fetchWholeB64` and again in
  `postAudio`. `sendFailure` (new, `stt.js`) words a request that got no answer: connection trouble (no host,
  timeout, refused, handshake…) keeps the old sentence plus the phone's own reason and is retried; anything
  else reads "The audio couldn't be sent to Groq: <reason>." and is NOT retried. A reel whose download fails
  now says why, and an empty download is reported as such.
- Tests: `tests/js/stt.test.mjs` (21): the line-broken text comes out clean and decodes to the same file; which
  errors count as the connection. 242 pytest, 312 JS.
- **Not tested on a phone.** If reels still fail after this, the message will now carry the real reason.
  Both files are the "Whisper transcription outsourcing options" chat's; it was told.

### Phone: YouTube links tapped inside the app stay in the app (2026-10-13, "Youtube" chat; committed locally, NOT pushed)
The owner (on their phone): tapping a thumbnail took them to the channel's page in the phone's own browser; it
should open in the app's browser. The thumbnail is the channel's picture at the top left of YouTube's embedded
player (the title and suggested videos behave the same).
- Why it left the app: those links ask for a new window; the app's WebView has none, so the link loads in the
  main view, and Capacitor (`Bridge.launchIntent`) hands every address that isn't the app's own to the phone's
  browser. Capacitor asks plugins first, so `GoogleDriveAuthPlugin.shouldOverrideLoad` now keeps `https` links
  to youtube.com / youtu.be (not `/embed/...`, which is the player itself) and sends a `youtubeLink` event.
- `openYouTubeLink` in `mobile/src/js/app.js` (listener set in `boot`): a video opens in Tamkeen's player
  (`watchVideo`); anything else, such as a channel's page, opens in the in-app browser (pausing what is playing
  underneath), where tapping a video opens it in the player. A video that can't be added (no captions) opens
  on YouTube's page in the in-app browser instead. `isYouTubeAddress` is in `ytcaptions.js` (tested).
- Side effect: a YouTube link on a friend's study card now opens in the app too, not in the YouTube app.
- **Not tested on a phone, and the Java was not compiled here** (no Android tools on this computer; CI builds
  it). Checked: the routing in the phone-sized preview (channel → browser, video → player or fallback, other
  sites ignored) and the unit tests. Tests: 242 pytest, 313 JS.

### Reel player: play group centred in the control bar (2026-10-13, "Instagram Reels Player" chat; commit 56c8700, not pushed)
The owner asked for play and its two 5-second buttons in the middle of every player's bar. In the reel player
(`#reel-controls`, `web/js/pages/reels.js` + the reel player part of `web/css/reels.css`) the bar is now two
lines: `.rc-seekrow` (time, slider, length) and `.rc-btnrow`, a grid `minmax(0,1fr) auto minmax(0,1fr)` whose
middle cell `.rc-mid` holds back 5 s / play / forward 5 s. The equal side columns keep the middle exactly
centred whatever the ends hold: `#rc-left` gets the quick/detailed lookup switch (still its compact form),
`#rc-right` the pause / keep-playing switch. Anything new for the bar goes into one of those two ends.
The bar is 71 px tall instead of 51, so the reel window is 20 px shorter.
- Checked in the phone build at 375 x 812 with the stand-in reel window: centre of the bar 187.5, centre of
  play 187.5; with a popup open its buttons strip ends exactly where the bar begins (741); play/pause, back 5 s
  and both switches work. 313 JS tests pass. The computer has no reel bar (nothing to centre there).
  **Not checked on a real phone.**
- Also on record: the reel player has NO Follow button (the only one is YouTube's in `player.js`). The owner
  asked for Follow to move to the top right of the title "in YouTube and Instagram"; they were asked, through
  the main chat, whether they want a new one for reels and what following a creator should do.

### Play button centred in the players (2026-10-13, "Player look" chat; committed on main, not pushed)
Owner's request through the main chat: in every media player the back 5 s / play / forward 5 s group sits in
the exact middle of the control bar; the speed chooser moves to the left and is smaller.
- Done for the podcast, video-file and YouTube players with CSS only (last section of `web/css/media.css`):
  `.player .btnrow` is `position: relative` and only the three play buttons take part in its row. `#speed`
  (left end), `.lookup-toggle` (right end) and `#loop-chip` (beside the speed chooser; on a phone just above
  the bar's left corner) are positioned absolutely. **Anything added to `.btnrow` later must be positioned
  the same way, or it pushes the play button off-centre.**
- The reel player's bar belongs to the Instagram Reels Player chat, which was asked to do the same there.
- Measured in the preview at 375 x 812 and 1000 x 640: the play button's centre equals the bar's centre in
  all three players. Before/after pictures: `..\player-centre-shots\` (outside the repository).

### Follow from a channel's page; the player's Follow button beside the title (2026-10-13, "Youtube" chat; committed locally, NOT pushed)
Two requests from the owner (on their phone, through the main chat).
- **Follow button on a channel's page in the app's browser.** `web/js/youtube-browser.js` now also watches for
  a channel's page (`/channel/UC…`, `/@name`, `/c/name`, `/user/name`) and shows a floating button there:
  "+ Follow <name>" (outline) / "✓ Following <name>" (filled). YouTube changes pages without reloading, so the
  script fetches the channel's own page and reads its link-preview tags (`og:title` = name, `og:image`, and
  `<meta itemprop="identifier|channelId">`) instead of trusting the tags already on the page.
  It writes to the same list as the player's button (`youtube_follows`).
  - Computer: `BrowserApi.following(name)` and `.follow_channel(name, id, image, on)` in `app/desktop.py`
    (refused unless the window is on youtube.com); `youtube.set_follow` / `is_followed` are the computer's copies
    of `setFollow` / `isFollowed` in `ytfollow.js`. Button sits bottom right, above the browser's bar.
  - Phone: no bridge in that browser, so the button asks to go to `tamkeen-video://follow?name=…&id=…&image=…&on=1|0`.
    `InAppBrowser.java` passes that address through the existing video listener; the plugin turns it into a
    `youtubeFollow` event; `mobile/src/js/app.js` saves it and shows a toast. The page is told the followed
    names up front (`window.__tamkeenFollowing`, put in front of the script by `youtubeBrowserScript`) and keeps
    its own presses in `sessionStorage`. Button sits bottom LEFT (bottom right belongs to Import Page).
- **Player:** the Follow button moved from the play controls to the top banner, directly right of the title
  (`.follow-wrap` after `.meta` in `.player-head`); its bubble now drops below it. On phones it is a 30px round
  "+" / "✓". The classes `.follow-wrap` / `.follow-btn` / `.follow-pop` are not tied to the YouTube player, so
  the reel player can reuse them (the Reel Player chat said it would, if the owner wants one there; the reel
  player has no Follow button today).
- Checked: the moved button in the desktop preview at computer and phone widths; in real desktop windows, a
  channel's page gets the button, the bridge follows/unfollows and the setting is saved, and a search page has
  none. The button's own press is covered by `tests/js/youtube-browser.test.mjs` (it lives in a closed shadow
  root that a test script can't reach). **Not checked: the phone** (Java not compiled here).
- **Test data warning met again:** the launch config `tamkeen-media` (port 8797) points at another chat's
  folder that was signed in to the owner's real Drive on 2026-10-12. My follow-channel test that evening
  (23:25) ran on it, so a test follow of "AJ+ كبريت" was uploaded to the real library. This chat now uses its
  own config `tamkeen-youtube` (port 8870) on a folder with no sign-in; `window_channel_test.py` refuses to
  run on a signed-in folder.
- Tests: 244 pytest, 317 JS.

### "Delete selected" in the Library (2026-10-13; on main, NOT committed, NOT released)
- Owner's request (relayed by the main chat, then confirmed by the owner here): tick episodes and a red
  "Delete selected (N)" button appears to the right of "Transcribe selected". **Owner's choice: Delete removes
  the whole episode** (audio, transcript and its place in the Library) on every device, and a podcast's feed
  must not bring it back. Saved vocab is kept. A confirm box says all of that and that it can't be undone.
- How: the episode row stays, marked `deleted = 1` (the same tombstone own videos already used). That mark
  syncs to the other devices, `remove_deleted_media` frees the transcript/audio copy in Drive, and both feed
  readers skip an episode they already hold, deleted or not (`_upsert_episodes` matches by guid; the phone's
  `newEpisodeRecords` gets every known id). Removing the podcast and adding it again does bring everything
  back, because removing a podcast forgets its episodes entirely.
- Code: `POST /api/episodes/delete {ids}` and `_remove_episode` in `app/api/episodes.py` (the old
  "Podcast episodes can't be deleted" refusal on `DELETE /api/episodes/{id}` is gone); the same two routes
  and `removeEpisode` in `mobile/src/js/backend.js`; the button in `web/js/pages/library.js` (shared).
  Tests: `tests/test_delete_episodes.py` (stays gone after a feed refresh, queued transcription dropped,
  reaches the second device, Drive file removed, vocab kept).
- Checked in the desktop preview with a real podcast (deleted 2 of 89, pressed Refresh, still 87) and in the
  phone-layout preview (deleted 1, forced a feed check, not re-added). Not checked on a real phone or between
  two real devices.

### Web-page reader: send to a friend (2026-10-13, "Media import" chat; committed locally)
The owner asked for a paper-airplane button on every player's toolbar. The Friends chat built the shared
piece (`web/js/components/sendmedia.js`, commit 8afe465); this chat only placed it in the reader:
`reader.js` adds `sendButton(() => mediaFromEpisode(ep))` to the top bar between A+ and Original, when the page
has a web address. The other players are placed by the YouTube chat (`player.js`) and the Reels Player chat.
Checked in the desktop preview at computer and phone width: the button shows, the item handed over is right
(kind page, address, title, site, picture, language, the sender's episode id), and without an online account it
says "Connect and choose a username first." **Not checked: the friend picker and a real send** (the test copy
is not connected to an online account). The owner's own audio and video files can't be sent (they live in the
hidden Drive folder); `mediaFromEpisode` returns null for them and the button says so.

### Send-to-a-friend button in the main player (2026-10-13, "Youtube" chat; committed locally, NOT pushed)
The Friends chat's shared paper-airplane button (`components/sendmedia.js`, commit 8afe465) is mounted in
`web/js/pages/player.js` for everything that file plays: `sendButton(() => mediaFromEpisode(ep, {at:
audio.currentTime}))`, first in the banner's row of buttons (`.player-head > .row`), so the order is title,
Follow (YouTube only), send, then the rest. Not in `.btnrow` (the play group must stay centred).
- Checked in the desktop preview: YouTube video and podcast episode produce the right item (kind, address,
  title, channel or podcast, the moment reached, episode id); one of the user's own video files gives "This
  can't be sent…". Pressing it while not connected says "Connect and choose a username first."
- **Not checked: an actual send** (the test folder has no account; sending is the Friends chat's code), and
  the phone. On a 375px phone the YouTube title is down to about 83px wide in the one-line banner.

### Reel player: send the reel to a friend (2026-10-13, "Instagram Reels Player" chat; commit ce1f833, not pushed)
The Friends chat's shared paper-airplane button (`sendButton` / `mediaFromEpisode` in
`web/js/components/sendmedia.js`) sits in the reel player's top line, right after the title
(`renderPlayer`, `web/js/pages/reels.js`; no CSS of its own). It is given a function, so the reel is read when
the button is pressed (Next / Previous change it); the item carries `episode_id`, so the reel's words travel
with it, and the language comes from `episodeLanguage`.
- **The reel window covers the page.** On the phone the reel plays in a native window lying on top of the
  app's page, and the friend list (`showMenu`, the shared `#ctxmenu`) opens right under the top line, exactly
  where that window is. So while `#ctxmenu` is open, `stageRect()` reports a place below the screen and the
  reel window is moved there (a `MutationObserver` on the menu's `hidden` attribute calls the same
  `surface.layout` as a resize does); it comes back when the menu closes. A reel that ends while the menu is
  open does not move on to the next one. Anything else the page opens over the reel area needs the same care.
- Checked in the phone build at 375 x 812 with the stand-in reel window: the button is after the title
  (left 258, 40 wide), the play group is still exactly centred; the item for an Arabic test reel is a valid
  reel link with its creator, language `ar` and 132 words to send along; with no account connected a press
  shows "Connect and choose a username first" and nothing breaks; a menu opened at the button lands at y = 38,
  the top of the reel area. 317 JS tests pass.
- **Not checked:** an actual send (the preview has no connected account, and none was connected for the
  test), and the reel window stepping aside on a real phone (the preview's stand-in is part of the page, so a
  menu is never hidden there).

### No "Saved to vocab" message (2026-10-13, "Media import" chat; committed locally)
The owner found the message that appears after saving a word intrusive (on the phone it sits on the buttons)
and wants the save shown only in the menu itself, in the reel player too. Removed the success `toast` from
`player.js` (popup save and menu save), `reader.js` (`saveWord`) and `reels.js`. Each screen keeps `savedHere`
(a set of word positions saved while it is open; per reel in the reel player): the popup's Save button shows
"✓ Saved" (`bubble.show(anchor, ctx, {saved})` in `wordbubble.js`), also when that word's popup is opened
again, and the right-click / long-press entry reads "✓ Saved to vocab" and does nothing more. Errors still
toast. The game's XP chip and sparkle on a save are unchanged. `savedHere` lasts only while the screen is open:
a word saved earlier shows "Save" again after leaving and coming back (saving it twice makes two entries, as
before). Checked in the desktop preview on a web page, a podcast and a reel. 317 JS tests pass.

### Vocab: a "Select all" button (2026-10-13, "Library Look" chat; NOT committed)
`web/js/pages/vocab.js`: a button at the right of the Sort row ticks every word listed (the open folder, "All
words" or "Not in a folder", as narrowed by the search box and the dates; `shown` holds that list). It reads
"Select all <n>", and "Deselect all" once they are all ticked. Hidden when nothing is listed. Checked in the
desktop preview in all three views (folder membership was faked in the page, so nothing was written).

### Reviewer background: the colours now flow (2026-10-13, the chat that released v0.15.0; on main, NOT committed, NOT released)
- Owner: the review screen gradient should be animated, moving around smoothly and slowly.
- `web/css/review.css` only: the two blurred lights of `.rv-bg` (`::before` purple, `::after` teal) used to nudge
  9vmax back and forth (`rv-drift`, removed). Each now circles a point of its own (`rv-orbit`: a full turn of
  `transform: rotate` about an off-centre `transform-origin`, 56 s one way and 73 s the other, linear so it never
  pauses) and swells to 1.2 with the separate `scale` property (`rv-swell`, 17 s and 23 s). At rest they sit where
  they always did, so the still picture is unchanged; the existing reduced-motion rule still stops both.
- Checked by putting the `.rv` backdrop into a statically served `web/index.html` at 375 x 812 and desktop size:
  both lights move, colours cross the whole table. NOT checked inside the real reviewer with a card on top, nor on
  a phone. No JS or test touched.
- **Seventh, a bug the owner reported with a phone screenshot (2026-10-13): a review card showed the Arabic
  word on its FRONT.** Cause: the front shows `vocab.meaning` as saved, and the AI had put the word itself
  into the meaning ("to raise your voice / to tease loudly (Egyptian dialect: '<the word>' = to make a
  fuss ...)"). Fixed in the commit "Review card: the front never shows the word being asked" (local on
  main, not pushed): `hideAnswer(text, word)` in `web/js/review/deck.js` cleans the meaning for the front
  (bracketed asides and quoted mentions of the word dropped; for a word in a non-Latin script, any of that
  script dropped; in the translated sentence it becomes "…"; a Latin-letter word is only removed inside
  brackets or quotes; the saved meaning is NOT changed), `prompt()` uses it, a meaning that is only the
  word is not askable, and `definer.js` tells the AI (full and quick lookup, schema text and instructions)
  to keep "meaning" in the learner's language and never repeat the word. Cache keys are unchanged, so
  answers cached before this still carry such meanings; the front hides them anyway.
  **Not fixed, same leak elsewhere:** the battles' "reverse" questions (`rules.pickQuestion` shows
  `meaning` and asks for the word) and the Anki export / two-way sync Front for a word without a marked
  translation (`exporters.anki_front` / `ankiFront`) still show the meaning as saved. `hideAnswer` is
  exported for them; the Anki side was left because changing a Front would make the sync see every such
  card as edited. Tests: 8 more assertions in `tests/js/review.test.mjs`; 252 pytest (1 skipped), 318 JS.

### Reviewer: "Say it" pronunciation practice, and a moving background (2026-10-13, the other "Spaced Repetition System" chat; on main, NOT committed)
- Owner's words: "a train pronunciation button (a person speaking icon) that records you're attempt to say the
  word, then it plays the word audio from the card followed by your attempt. This attempt recording is not saved
  and is transient"; and, of the table's background, "animated moving the gradient around smoothly and slowly".
- **Say it**: `web/js/review/pronounce.js` (new; nearly all of it). The button sits in the card back's
  `.rv-listen` row, only for a word that has audio and only where the device can record (`canRecord`). One press:
  microphone on -> listens until about 0.65 s after the learner stops (`listener`; a second press ends it at once;
  4 s of nothing gives up; the limit is 5 to 15 s by the word's length) -> microphone off -> the recording is
  decoded in memory, its silence cut off (`speechBounds`) and a quiet one turned up (`boost`) -> the word
  (`playSnippet`) -> the attempt. Nothing is stored or sent. It ends by itself when its button leaves the page
  (card answered or deleted, reviewer closed), so `review.js` has no cancel calls.
  - Hooks in `web/js/pages/review.js`: the import, `wordSeconds` / `wordOverAt` beside `sayWord` (the word still
    playing from the card's turn is waited out, not recorded), the button and its wiring in `back()`, key **P**.
    `playSnippet` resolves when the audio starts, so the attempt is timed off the clip's length.
  - Icon `speak` in `web/js/icons.js`; styles at the end of `web/css/review.css` (one fixed width through every
    state; `--level` swells the dot with the voice); a "Pronunciation practice" section in `docs/privacy.html`.
    The microphone permission was already in the Android manifest (voice notes in chats).
  - Tests: `tests/js/pronounce.test.mjs` (9). Checked in a static preview at phone size with a made-up word and a
    stand-in microphone (a tone): full run, early stop, silence, answering mid-listen (microphone released each
    time). **Not checked**: a real microphone, the real desktop window, a real phone (the permission question,
    whether Android's WebView decodes its own recording, loudness next to a real clip).
- **Background**: `.rv-bg::before/::after` in `review.css` now circle (`rv-orbit` 56 s and 73 s, opposite ways)
  and swell (`rv-swell`), replacing the barely visible `rv-drift`. Still off for "reduce motion".
- Unrelated and not mine: `tests/js/browser-home.test.mjs` fails on main's working copy while another chat's
  browser-home edits are unfinished.

### "Get random reels" with a counter (2026-10-13, "Media import" chat; committed locally, NOT pushed, NOT released)
The owner: "Add a get random Arabic reels button to the app, also give it a number counter for how many you want".
- **The page** (`drawGet` in `web/js/pages/reels.js`, both shells): a "How many?" row with a counter (− number +,
  1 to 30, typed or stepped, remembered on the device in `localStorage` `reels:count`) and the teal button
  `#reel-random`, "Get N random Arabic reels" (the language is the one being studied). The old "Get 10 reels"
  uses the same counter now ("Get N reels"). `POST /api/reels/random {count}`; `info.random` says whether the
  language has search words.
- **How reels are found**: Instagram's own search, asked directly as the signed-in page (no search page is
  opened): `/api/v1/fbsearch/web/top_serp/?query=<word>` and `/api/v1/tags/web_info/?tag_name=<word>`. Checked on
  the real site: about 45 videos a word, each with maker, length and video address. The words are everyday
  subjects per language (`RANDOM_WORDS` in `app/reels.py` and, the same lists, in `mobile/src/js/reels-phone.js`;
  a pytest keeps the two in step), shuffled each time; up to `RANDOM_SEARCHES` (8) a batch, and only part of each
  word's finds is taken so a batch mixes words. Left out: reels tried or kept before, photos, ones with a song
  from Instagram's music library, very short or over 4 minutes, more than 2 from one maker.
- **Computer**: `start_random` / `_run_random` / `_search` in `app/reels_worker.py`, `reels.pick_random`. Each
  candidate goes through the usual `_attempt` (not an own save, so it must be in the study language and have
  real speech).
- **Phone** (only with cloud transcription on, like picking from saves): job `search` in
  `mobile/src/js/instagram-phone.js`, `startRandom` / `pickRandom` in `reels-phone.js`, route in `backend.js`.
  A random reel is kept only if the provider heard the study language, at least 8 words and 0.35 words a
  second. Every reel listened to costs a provider call (a fraction of a cent), kept or not; ones already
  listened to are remembered (`tried`, on the phone only) so they aren't paid for twice.
- **Checked for real**: computer, through the app's window on a FRESH data folder (`random-data`, no Google
  sign-in in it): "Get 2 random Arabic reels" kept 2 of 2 in 69 seconds (233 and 160 words, both Arabic, two
  makers). The phone's `search` job against the real site in a phone-style window. Phone build at 360 x 721
  with the pretend Instagram: the counter (steps, typing, limits, remembered), the button text, the job's
  messages and log. **NOT checked**: a real phone, and a real reel going from the phone to a real provider.
- Tests: 256 pytest; JS: `instagram-phone.test.mjs` has the `search` job. One JS test was failing at the time,
  `browser-home.test.mjs` ("the phone's version is one self-contained page"): it belongs to another chat's
  unsaved edits to the browser start page, not to this work.

### Web Browser: save a site to the start page (2026-10-13, "Web Browser" chat; committed locally)
The owner asked for a way to save a webpage to the browser's start page.
- **What the user sees**: a star (☆) in the browser's bar, beside Import Page on the computer and beside ✕ on
  the phone. Pressing it puts the site being shown under **Your saved sites**, a section above the news on the
  start page; the star turns gold (★). Pressing it again, or the × on the site's tile, takes it off. A tile
  shows the page's name and, always, its real address underneath.
- **The list** is the setting `browser_sites`: one record per address (without any `#part`), `{url, title,
  on, updated_at}`, kept after removal so the removal reaches other devices. Rules in `web/js/browser-sites.js`
  (phone) and their twin at the end of `app/pages.py` (computer); both run the same test cases. A change is
  always stamped later than everything in the list, so a slow clock can't lose it and the order saved is kept.
- **Sync**: library.json has a new `sites` key, handled exactly like `channels` (engine.py `snapshot`,
  `_content`, `merge`; sync.js likewise). A library written by an older version simply has none.
- **Computer**: `BrowserApi.site_saved()` / `save_site(title)` in `app/desktop.py` (the address comes from the
  window, never from the page, so a website can only ever save itself; the app's own pages are refused);
  `web/js/browser-toolbar.js` has the star. The start page (`web/browser-home.html`) asks
  `GET /api/browser/sites` each time it is shown and takes a site off with `POST /api/browser/sites`.
- **Phone**: `openBrowser` hands the browser the list (`GoogleDriveAuth.browserSites`) and a start page built
  with it (`homeHtml(lang, sites)`). The star in `InAppBrowser.java` and the × on the start page both reach
  JavaScript as the made-up address `tamkeen-video://site?do=toggle|remove&u=...` (event `browserSite`), which
  changes the setting and sends the new list back; the browser calls the start page's `__tkSites(list)`
  whenever that page finishes loading, so a site saved a moment ago is there on coming back.
- `paintSaved` in `browser-home.js` must stay self-contained: the phone's page carries its source as text.
- Checked: both test files; the start page in the desktop preview at computer and phone width (add, list,
  remove, refresh); and the real desktop windows by script (star hollow, press, gold and "Saved to your start
  page", the tile on the start page, no star there, gold again on returning to the site, press, removed).
  **Not checked: the phone** (the Java has not been compiled here; CI builds it on the next push).
- Testing note: the launch config `tamkeen-media` now points at another chat's `reels-data` folder, which may
  be signed in to the owner's real Drive. This work used its own, `tamkeen-web-browser` (port 8812), after
  checking `/api/sync/status` said not signed in.

### "Find in a video": Filmot for words with nothing to listen to (2026-10-13, "Vocab Page" chat, the one that released v0.15.0; on main, NOT committed, NOT released)
The owner asked for Filmot (filmot.com, a search engine over YouTube captions) for words with no audio, including
words saved from a web page: open the video and save it with the whole sentence, as a word saved from a player.
- **Why it is a button that opens Filmot, not a silent lookup**: Filmot has no public API today. The RapidAPI
  listing an old community wrapper points to is gone; Filmot's terms (2026-07-28) mention a documented API with
  keys and say automated access must use it, but no documentation or sign-up page exists on the site; searches
  show a human check (hCaptcha) to people who are not patrons. The owner chose the button for now and is asking
  Filmot about API access through its contact form (their own message, sent by them).
- **What the user does**: Vocab page, a word with no "Word"/"Sentence" buttons shows **Find in a video**. It opens
  Filmot's results for the word in the app's own browser. Tapping a link to a YouTube video there opens that video
  in Tamkeen's player at that moment, and the word gets the video, its times and the spoken sentence.
- **Pieces**: `web/js/filmot.js` (address, `lacksAudio`, `findSpoken` = the player's own sentence rule over
  `regroupWords` + `sentenceBounds`, the word being looked for = `startHunt`/`currentHunt`, kept 30 minutes in
  memory, and `watchFound(video, at)` which adds the video, saves the source and opens the player);
  `web/js/filmot-browser.js` (plain script run in the app's browser, acts on filmot.com only: a tap on any link to
  a YouTube video is handed over with its `t`, sent as 0 when the link has none). `youtube-browser.js` now passes
  the `t` of a video page's address too, for a result that ends up on YouTube's own page.
  - A hand-over **with a moment** is how the app knows the video came from a search: only then is the waiting
    word looked for in the captions. Ordinary taps on YouTube carry none and behave as before.
  - Computer: `BrowserApi.watch_video(id, at)` accepts filmot.com as well as youtube.com; `ask_app_to_watch(...,
    at=)` puts `at` in the `youtube_watch` event; `app.js` calls `watchFound`. `youtube.js` gained `getVideo`.
  - Phone: the address is `tamkeen-video://watch?v=<id>&t=<seconds>`; `InAppBrowser.java` passes it on as
    `<id>@<seconds>` and `GoogleDriveAuthPlugin.java` splits it into `{id, at}` for the `youtubeVideo` event;
    `youtubeBrowserScript()` hands the browser both scripts in one. **The Java was not compiled here.**
  - Saving: `POST /api/vocab/<id>/source` (`app/api/vocab.py`, twin in `mobile/src/js/backend.js`) sets episode,
    times and sentence, **replaces the word's old sentence and clears its translation**, and stamps `updated_at`
    itself (the vocab trigger does not watch these columns). Sync already carries all of them.
- **Tested**: `tests/js/filmot.test.mjs` (10), `tests/test_filmot.py` (4); all 347 JS and 270 pytest pass. In a
  preview on a new empty data folder (launch config `tamkeen-filmot`, port 8880): the button shows on a typed-in
  word; with that word waiting, `watchFound("lo3KyF50IGE", 3)` fetched the real captions, saved video, times and
  sentence on the word, opened the player at the sentence, and the Vocab page then showed Word and Sentence.
- **NOT tested, and it matters**: Filmot's results page itself. The human check could not be passed here, so what
  its result links look like was never seen. The script assumes a result is (or contains) an ordinary link to
  youtube.com / youtu.be. If Filmot plays results inside its own page with no such link, nothing is handed over
  and the script needs the page's real structure. Also not tested: the real desktop browser window, the phone,
  Arabic coverage on Filmot. A word found this way plays in Tamkeen through YouTube's player; an Anki export
  still has no sound for it (nothing is downloaded from YouTube).

### iPhone version (started 2026-10-13, "iOS version for iPhone" chat; on branch `ios`, pushed, NOT on main, never run on an iPhone)
The owner asked for an iPhone app released **without the App Store**: by sideloading with **AltStore** (free Apple
ID; the app is re-signed on the owner's PC and must be refreshed every 7 days; 3 such apps per phone). TutuApp was
ruled out (it re-signs apps with abused enterprise certificates). TestFlight ($99/year) is the later step if friends
want it. The owner's iPhone runs the newest iOS.
- **Where:** its own working copy `C:\Users\chris\Documents\arabic-tts\tamkeen-ios` (a git worktree, branch `ios`),
  so the other chats' checkout is untouched. To ship: merge `ios` into main.
- **No Mac here.** This PC cannot compile iPhone code. `.github/workflows/ios.yml` builds an **unsigned**
  `Tamkeen-<version>-iPhone.ipa` on GitHub's Mac on every push to `ios` (artifact `installer-ios`; about a minute;
  Xcode 26.3). First build passed on the first push. Results are read without signing in through the public API:
  the run's annotations carry a notice with the file's size, or the compiler's errors packed into one annotation.
  The release workflow does NOT build it yet (add an `ios` job to `release.yml` once it has run on a phone, or a
  failed iPhone build would block a whole release).
- **`mobile/ios/`** = the Xcode project (Capacitor 8, Swift Package Manager, made by `npx cap add ios` on Windows).
  Edited by hand: `AppDelegate.swift` (holds `TamkeenViewController`, named in `Main.storyboard`: registers the
  Drive video streamer, edge-swipe goes back, no rubber-band), `Info.plist` (microphone/camera wording, background
  audio), launch screen colour. Icon and opening screen come from `packaging/make_icons.py`.
- **`mobile/native-ios/`** = Tamkeen's own Swift, as a local Capacitor plugin package (`tamkeen-native` in
  `mobile/package.json`), so `cap sync ios` adds and registers it by itself and no Xcode project file is edited.
  It is the twin of the Android Java, same plugin name (`GoogleDriveAuth`), same calls and events:
  - `GoogleAuth.swift`: sign-in through the system sign-in sheet (ASWebAuthenticationSession) + PKCE, refresh
    token in the keychain (falls back to the app's settings if the keychain refuses). Returns the access token
    and the ID token; `signOut` is iPhone-only.
  - `InAppBrowser.swift`, `ReelSurface.swift`: ports of the Java files. The reel window is a subview of the app's
    web view (one CSS pixel = one point).
  - `DriveMediaHandler.swift`: the player asks for `tkdrive://media/<file id>` (an iPhone web view can't intercept
    https://localhost/_drive/..., only made-up address kinds).
  - Only ONE `@objc(Name)` may appear per Swift file there, and only on the plugin class: the Capacitor CLI
    registers the first one it finds in each file as a plugin.
- **JavaScript:** `isIOS` in `mobile/src/js/native.js`. `platform` is still `"android"` on the iPhone (the shared
  screens use it to mean "the phone app"). Differences: ID token without a nonce (`googleIdToken`), the media
  address, no AnkiDroid card or sync (AnkiDroid is Android-only; "Export for Anki" shares the deck file, worded
  for AnkiMobile), native sign-out, viewport capped at 1x (an iPhone zooms into small text boxes otherwise).
- **Google sign-in set up (2026-10-14, with the owner signed in):**
  1. **"iOS" OAuth client** "Tamkeen iPhone" in Google Cloud (Meridian -> Google Auth Platform -> Clients), bundle
     ID `io.github.christiangilkey.arabicpodcaststudio`, client ID (public)
     `419555269865-6kjs7ri9thm4fvn5ctq42o06026ntepf.apps.googleusercontent.com`, in
     `mobile/capacitor.config.json` -> `plugins.GoogleDriveAuth.iosClientId` (commit e104b0d; build
     0.0.0-dev.4 has it).
  2. The same client ID added as the third entry of **Supabase** -> Authentication -> Sign In / Providers ->
     Google -> Client IDs (checked after reloading the page). Nothing else there was changed.
- **Known risks, untested (nothing has run on a phone):**
  - **YouTube's embedded player** may refuse to play ("error 153"): the app's page lives at
    `capacitor://localhost`, so no web address is sent to YouTube as the referrer. Planned fix if it happens:
    play it through a small https page (or a native window loaded with an https base address).
  - AltStore changes the app's ID when it signs; Google's sign-in is not expected to mind (the answer comes back
    to the client ID written backwards, not to the app's ID), but it is unproven.
  - The keyboard may cover the chat box (no keyboard plugin); a status bar that doesn't match when the app's
    theme is forced opposite to the phone's; AnkiMobile may not play the deck's .ogg clips; no vibration
    (iPhones have no `navigator.vibrate`).
  - A link the embedded YouTube player opens with `window.open` goes to Safari (only ordinary links are caught).

### Reviewer answer buttons in brand colours (2026-10-13; on main, NOT committed, NOT released)
- Owner: the not-remembered button should be the brand purple and the remembered button the brand teal, both
  bright and standing out.
- `web/css/review.css` only: `.rv-no` is solid #bd3fba with white text (was a see-through box with a red
  outline), `.rv-yes` solid #22c7d6 with dark text #022a2f (was a green gradient with a shadow). No shadows, per
  the owner taste for solid surfaces. To keep one meaning per colour, the drag glow (`.rv-glow`) and the stamps
  on the card (`.rv-stamp.yes` #12a5b5, `.no` #b23aae) moved from green/red to the same teal/purple. The burst
  dots in review.js still include green; not changed.
- Checked on a statically served `web/index.html` at 375 x 812 with the buttons over the moving background.
  NOT checked inside the real reviewer, nor the stamps on a light-theme card.

### Desktop Library laid out like the phone's; no flicker between lists (2026-10-13; on main, NOT committed)
The owner: switching lists in the Library "briefly shows a misaligned version of the page and snaps back", and
"the design philosophy of the library page on mobile should be reflected in desktop, this whole section is very messy".
- Flicker: `route()` in `web/js/app.js` emptied the page, then the Library filled itself in after two requests.
  Now, moving within the Library (`mod === library` and a `.library` already on screen), the new page is built in
  a detached holder and swapped in with one `replaceChildren`, the side list keeping its scroll. So
  `pages/library.js` looks things up in its own `.library` element (`root`), never in `view`. The phone has its
  own router, unchanged. Checked in a real window: 8 clicks, not one frame without the side list.
- Layout (computer only, `.library.desk`): the side list is the phone's two strips stacked: the six kinds in the
  phone's fixed order (`KINDS`), then under Podcasts "All episodes" + the podcasts (recently heard first, with
  "x/y transcribed"), under YouTube "Recently watched" + followed channels (replacing the desktop's chip bar),
  Refresh & sync at the foot. The add controls left the side list: a row `.lib-actions` under the heading shows
  only the current kind's (`.library[data-kind]`): podcast URL + Trending; Open YouTube + country; webpage URL +
  Open Web Browser; Add video file; Add audio file; Reels uses its heading's buttons. Kinds with nothing yet get
  the phone's empty page (`#/library?show=<kind>`). "All episodes" now means podcasts only, as on the phone.
- New icon `reel` (Reels no longer share YouTube's). Phone markup is unchanged apart from that icon.

### AI keys follow the user between phone and computer (2026-10-13; on main, NOT committed)
The owner: "If somebody saves their API key on their phone then it should also appear when you sign in on desktop, and vice versa".
- The six keys (`llm_key_claude/gemini/openai/grok`, `stt_key_groq/openai`) travel in the sync file as `keys`:
  `{name: {value, at}}`. For each key the copy changed last wins, so clearing a key clears it everywhere; at equal
  times (keys saved before this existed are all `at: 0`) the later-sorting value wins, so a key beats no key and
  both devices settle on the same one. When each key last changed is the setting `key_times`.
- `app/aikeys.py` and its phone twin `web/js/aikeys.js` (copied into the phone build) must agree exactly;
  `tests/test_aikeys.py` runs both on the same cases, and syncs a key A → B and its removal B → A.
- Stamped when saved: `patch_settings` in `app/api/system.py` (then `sync.request(5)`), `saveSettingsPatch` in
  `mobile/src/js/store.js` (`saveSettings` in the phone's app.js asks for a sync). Merged in `engine.merge` and the
  phone's `sync.js merge`; part of both `_content`/`content` so a key change alone uploads.
- The file is in the Drive app folder only Tamkeen can read. Backups still leave keys out. Settings ("where is my
  key kept?") and docs/privacy.html now say keys sync. Not tried on a real phone + computer pair.
- **Eighth (2026-10-14, the owner directly in this chat, with the phone app):** committed locally on main as
  f551509, not pushed. (1) "Say it" (the Pronunciation chat's `web/js/review/pronounce.js`) played the
  attempt over the word: it slept a guessed length from when playback was asked for. Now `playSnippet` in
  vocab.js returns `{ ended }` (settles when the shared player pauses at the stretch's end, or the file
  ends, or another clip takes over; 5 s backup timer), review.js `sayWord` passes it through, and
  `afterWord` in pronounce.js waits for it, then `GAP_MS` = 500 (the owner's figure), then plays the
  attempt. Measured in a preview with a stand-in microphone: 507 and 512 ms between the word stopping and
  the attempt starting. (2) A second press within 2.5 s after listening ended by itself is ignored (the
  owner presses to "finish" just after the auto-stop; it used to cancel the comparison). (3) `.rv-no`
  text is dark `#022a2f` like `.rv-yes`. (4) Background lights faster: rv-orbit 36 s / 47 s, rv-swell
  11 s / 15 s. Not checked on a real phone or with a real microphone.

### "Update now": the app updates itself (2026-10-14, the main/release chat; commit 00b5e6d, NOT pushed)
- Computer: `app/updates.py` picks this system's file from the latest release (`pick_asset`, only
  `https://github.com/<repo>/releases/download/` URLs), downloads it to tmp/update with progress as SSE
  "update" events, checks size + GitHub's `digest` (sha256), then `launch_helper` writes a script that waits
  for the app's PID to exit and installs: Windows `Setup.exe /SILENT ...` then reopens `sys.executable`
  (full System32 paths: Git's `find` broke the wait loop in testing); macOS ditto the dmg's Tamkeen.app over
  the running bundle (keeps the old one if that fails); Linux mv over `$APPIMAGE`. `_quit` then closes the
  windows and exits. Only packaged builds (`sys.frozen`) offer it; from source it's the GitHub link.
  Routes: POST /api/updates/install, GET /api/updates/status. Popup/Settings/About use `offerUpdate`.
- Android: `AppUpdaterPlugin.java` (registered in MainActivity, REQUEST_INSTALL_PACKAGES in the manifest)
  downloads the APK to cache/update, checks size + sha256, opens the installer via the existing FileProvider.
  First time: `openInstallSettings` (Install unknown apps). JS in mobile app.js `installApk`; `AppUpdater`
  is null on iOS.
- Tested: unit tests (tests/test_updates.py), the Windows helper end to end with stand-ins (waits, installs
  silently, reopens, deletes the setup), the popup with a fake download in the preview. NOT tested: a real
  packaged install on any OS, the Java (never compiled locally), a real APK install.
- The first version with this must still be installed by hand; from then on "Update now" works.

### Cards left today on the app icon (2026-10-14, the main/release chat; committed locally, NOT pushed)
- Count: `reviewsLeft(days)` in web/js/pages/review.js = overview(...).due + fresh for today and the next
  days (as if nothing is reviewed in between). review.js dispatches `tamkeen:reviewed` after each saved answer.
- Computer: `startAppBadge` in web/js/app.js (desktop window only) → POST /api/app-badge → app/appbadge.py:
  Windows ITaskbarList3.SetOverlayIcon on the window titled "Tamkeen", with a 32x32 purple badge drawn in
  pure Python (5x7 digit font, "99+" cap); macOS dockTile badge label via PyObjC. Linux/browser mode: nothing.
  Tested: a real taskbar overlay on a stand-in Tk window titled "Tamkeen" (picture taken). Mac untested.
- Android: AppBadgePlugin (setCounts {day, counts[7]}, allowNotification for POST_NOTIFICATIONS, asked once,
  localStorage badge_permission_asked) → ReviewBadge: silent IMPORTANCE_LOW channel "review_count" with
  setNumber (that is what puts the number on the icon on Android), ReviewWidget (2x1 home-screen widget,
  updates every 30 min), ReviewBadgeReceiver (inexact alarm after midnight). Never compiled locally.

### Daily goal bar under the Review banner (2026-10-14, "daily goal progress bar" chat; on main, NOT committed)
- Owner's words: "tracks the averages of how long it takes a user to review cards, calculates that against a new
  words goal that the user can set by clicking the progress bar, and a recommended review amount ... in a progress
  bar under the review banner in Vocab. One bar, using teal(new), and purple (review)".
- **On the "20 new / 200 reviews a day" question**: Anki's manual (docs.ankiweb.net/deck-options.html) says that
  steadily learning 20 new cards a day leads to roughly 200 reviews a day; 20/200 are also Anki's default caps. So
  it is a default and a rule of thumb (about 10 reviews a day per new word a day), not research. The bar's review
  target is what is actually due today; the 10x figure only appears in the popup's help line as what to expect.
- **Files**: `web/js/review/goal.js` (new, the maths, pure apart from three localStorage helpers at the end),
  `web/js/review/goalbar.js` (new, the bar and popup), `tests/js/goal.test.mjs` (new, 10 tests); `vocab.js`
  (import, `<div id="goal">` under the banner, `goal.update(all, log)` in `renderReview`, `goal.close()` in the
  page cleanup); `review.js` (`setNewPerDay` export used by the reviewer's own chips too, `noteAnswer` after each
  answer, `forgetAnswer` on Undo); styles at the end of `review.css`. The phone gets all of it through
  `build-www.mjs` (`js/review` is copied as a folder), so `build-www.mjs` is unchanged. No Python, no sync change.
- **Bar**: one pill, teal part = new words, purple part = reviews; each part as long as its share of today's cards
  (never under 15%), filled by done/target. Under it "New 7/20 · Reviews 14/30" (count widths reserved so the line
  does not shift) and "About 6 min left today", "(a first guess)" while guessing, "All done for today", or
  "Nothing due today". Counted over ALL words even when a folder is open (the goal is the day's). Hidden with the
  banner (search typed, no words) and when no word is askable.
  - new done = first answered today and remembered; new left = started today but not yet remembered + the unseen
    words today's allowance still lets in (`plan().fresh`). review done = older words remembered today; review left
    = older words due or missed today. Targets = done + left, so the bar is full exactly when nothing is left.
- **Popup** (tap/click the bar): chips 0/5/10/20/50 = the SAME setting `reviewNewPerDay` (kept the choices, no free
  number: `newPerDay()` only accepts NEW_CHOICES); "Only N new words are waiting" when fewer exist than the goal;
  one help line (reviews = what is due; about 10 a day per new word, Anki's manual: 20 ≈ 200); a line with the time
  per word and where it comes from. Closes on Esc or a tap outside. Solid surface, border, no shadow.
- **Timing**: the log already stores ms per answer (shown → answered, capped at 60 s). One sample = one word
  finished on one day: the sum of that day's looks at it (a new word missed twice took three looks), kind "new" on
  its first day and "review" later. A sample with an answer at the 60 s cap (or 0) is dropped as "away". Typical =
  mean of the last 100 without the fastest and slowest tenth, used from 10 samples on. Order of preference: this
  device's own samples (localStorage `reviewTimes`, the last 100 per kind, written by the reviewer when a word is
  finished for the day, removed again on Undo) → the synced answer log → a guess of 25 s per new word, 10 s per
  review. **Not synced on purpose**: phone (swipes) and computer (keys) differ in speed and the estimate is for the
  device in hand; the synced log already gives a new device a measured start, and no sync code had to change.
- **Checked** in previews with a fresh, never-signed-in data folder (launch configs `tamkeen-goal` 8890 and
  `tamkeen-goal-phone` 8891 in the parent `.claude/launch.json`; data and phone copy in that chat's scratchpad), made-up
  words and answers: desktop 1280 x 800 dark and light, phone build 390 x 844 (no sideways scroll, popup inside the
  screen); counts and estimate match the seeded history; goal chips 0/5/20/50 update the bar, the banner's "new"
  count and the saved setting; six real answers in the reviewer recorded the right kinds and times (a missed-then-
  remembered word added both looks); Undo removed its sample; closing the reviewer updated the bar. Tests: 362 JS,
  289 pytest (1 skipped). **Not checked**: the real desktop window, a real phone, a day rolling over at midnight
  with the page open (the bar only redraws when the Vocab page renders), a screen reader.

### The app in 9 languages, and English as a study language (2026-10-14, "Learn english support" chat; NOT committed)
Asked for: a first-run popup asking which language you speak (the question shown in every language), then
which language to learn (English included and first for non-English speakers), and the WHOLE interface
translated so English learners can use the app.
- **First run** (`web/js/components/onboarding.js`): step 1 "Which language do you speak?" asked in all 9
  languages at once (`SPEAK_QUESTION` in i18n.js) with native names (`speakPicker`), step 2 the language to
  learn (`languagePicker(…, { speaks })` hides the spoken one and puts English first), then level / API key.
  Settings has a "Language I speak" section too (both Settings pages). `chooseUiLanguage(code)` saves
  `ui_language`, sets `definer_language` (the language the AI explains words in) to that language's English
  name if it still held the old one, and switches the page: English → X happens live, X → Y reloads.
- **Interface languages**: en, es, ar (right-to-left: `html dir=rtl`), fr, ja, zh, ru, it, tl. Dictionaries
  are `web/i18n/<code>.json` (English text → translation). Copied into the phone build by
  `mobile/scripts/build-www.mjs` (SHARED has `js/i18n.js` and `i18n`).
- **How the translating works** (`web/js/i18n.js`): nothing in the pages calls a translate function for
  ordinary text. A MutationObserver translates every text node, `placeholder/title/aria-label/alt` and
  confirm/alert/prompt boxes as they appear, looking them up by their English. A paragraph with inline
  tags is one "sentence": `Press <0>+ Add</0> to …`. Keys with `{0}` are patterns ("{0} words due");
  a value that is itself a known word/sentence is translated too; `{0:lower}` / `{0:upper}` in a
  translation change its first letter. A short pattern never takes over a long sentence (its fixed text
  must be at least 1/6 of the loose values). Code that builds text out of pieces uses `t("…", values)`
  (habitat creature line, Discover country list); `t("{0} {1}")` lets a language reorder two words.
- **Never translated** (content, not interface): anything with a `lang` attribute, class `ar`,
  `translate="no"`, contenteditable, `dir="auto"`, and the classes title/name/d/cap/what/msg-text/
  continue-title/study-title/study-sub/guild-name and `#chat-name`. New content elements need one of these.
- **Adding or changing interface text**: write it in English as usual, then
  1. `node tools/i18n/extract.mjs` (finds every English UI string in web/js, mobile/src/js, app/*.py and the
     HTML; writes `tools/i18n/strings.json`, ids = first 8 hex of SHA-1 of the text),
  2. `node tools/i18n/build.mjs --todo es` lists what's missing; add lines `id<TAB>translation` to a new
     `tools/i18n/tr/<code>/NN.txt` for each of the 8 languages,
  3. `node tools/i18n/build.mjs` (checks tags and {n}s, writes web/i18n/*.json), `node --test tests/js/`
     (i18n.test fails while any string is untranslated).
  `tools/i18n/ignore.txt` = ids that are not interface (model names, web headers, the AI's instructions);
  `tools/i18n/extra.txt` = words the code glues into sentences that the extractor can't see.
- **Style**: es tú, fr vous, it tu, ru вы, Arabic MSA, app name in Arabic تمكين. Glossary — elements
  Ember/Tide/Grove/Stone/Spark/Dusk: es Brasa/Marea/Arboleda/Piedra/Chispa/Ocaso, ar جمرة/مدّ/بستان/حجر/شرارة/غسق,
  fr Braise/Marée/Bosquet/Pierre/Étincelle/Crépuscule, ja 熾火/潮/森/岩/火花/宵, zh 余烬/潮汐/林地/岩石/火花/黄昏,
  ru Угли/Прилив/Роща/Камень/Искра/Сумрак, it Brace/Marea/Bosco/Pietra/Scintilla/Crepuscolo,
  tl Baga/Alon/Kakahuyan/Bato/Kislap/Takipsilim. Branches Echo/Sage/Keeper likewise (see tr/*/13.txt).
- **English as a study language**: `en` in web/js/languages.js and app/languages.py, `TEACH.en` in
  definer.js, word list `web/js/wordlists/en.js` (made by `tools/make_wordlists.py en`), Apple charts
  us/gb/au/ca, YouTube start country US, news sites for learners (News in Levels, VOA Learning English…),
  reel search words.
- Checked live in Spanish (every page scanned for English), Arabic (RTL screenshots) and Japanese. The
  phone build was built but NOT tried on a phone. Known leftover: `<pre>` text (About's "Loading…") stays English.

#### "Say it" plays the whole sentence (2026-10-15, "Spaced Repetition System (fork)" chat; committed locally on main, not pushed)
The owner, on v0.21.0 Android: "I press the button, say something which records. The app SHOULD play the full
sentence audio, stop for about .5 seconds, then play my recording back to me." After listening, `practise` in
`web/js/review/pronounce.js` now plays a "model" (`sayModel`/`modelSeconds`, renamed from `sayWord`/`wordSeconds`;
`wordBusy` is now `audioBusy`): review.js passes the card's SENTENCE (`saySentence`, `sentenceSeconds`), or the
word when the card has no sentence audio; `afterWord` waits for its `{ ended }`, then `GAP_MS` 500, then the
attempt. review.js tracks any audio started from the card (`track`, `audioOverAt`) so listening never starts
over it, and shows "Say it" when the card has word OR sentence audio. Measured in a preview of main with a
stand-in microphone: sentence card, 4.25 s to 7.92 s played in full, then 515 ms, then the attempt; a
word-only card, the word, then 513 ms. **Not checked on a real phone**: the Android-only parts (WebView
microphone, decoding the recording, audio routing after the microphone closes) could not be tried here.
**Then (same day):** `getUserMedia` uses `echoCancellation: false` (on Android echo cancellation selects the
phone-call sound mode: quieter, sometimes the earpiece, Bluetooth at call quality; nothing plays while Say it
listens) and the model waits `SETTLE_MS` = 300 ms after the microphone closes. Both from the Pronunciation
chat's notes on the Android path; neither tried on a phone. If the owner still hears it muffled, next steps:
play the attempt through an `<audio>` element from a blob URL instead of the shared `ctx`.
**Gotcha met:** `node --check file.js` passed a file with a stray `}` that the browser refused (the whole app
went blank). Check browser modules by copying them to a `.mjs` file and running `node --check` on that.

### Cards the same size whatever they were saved from; the origin note on "Find in a video" (2026-10-15, "Vocab Page" chat; committed locally, NOT pushed)
Owner (through the main chat, with a phone screenshot of a web-page card whose "sentence" was a whole paragraph):
cards from text sources "should be exactly the same as the cards added from audio sources", and once "Find in a
video" gives a card a video, "attach a note with the original source and the sentence from the text it was
originally found in".
- **Why web-page cards were big**: nothing was wrong with the sentence rule; news Arabic writes whole paragraphs
  as ONE sentence joined by commas (the example is 300+ characters ending in its only full stop).
- **`web/js/cardtext.js`** (new, shared with the phone via `build-www.mjs`): `cardSentence(sentence, word)` shows
  at most `CARD_SENTENCE_MAX` = 110 characters: the clause the word is in (clauses end at ، , ; ؛ : . ! ? ؟ …
  followed by a space), then neighbouring clauses while they fit (the one after first); a single clause longer
  than that is cut by whole words; "…" marks a cut side. `cardTranslation` does the same around the ⟦ ⟧ part and
  drops a mark the cut leaves without its partner. `findWord` finds the word ignoring vowel marks and letter
  variants (أ/إ/آ, ى, ة). `fold` moved here from filmot.js (still exported from filmot.js).
- **Display only; the saved sentence is never changed**, so existing cards are fixed too and nothing is lost.
  Used by: the Vocab page's card (`vocab.js`, whose `highlight` now also uses `findWord`, so a vowelled word is lit
  inside an unvowelled page sentence), the reviewer's back (`review.js`) and front (`deck.js` `prompt`, the
  translation). **Not** applied to the Anki export (exporters.anki_fields + its JS twin, parity-tested): Anki
  cards from web pages still carry the whole sentence.
- **Origin note**: `startHunt` keeps `originNote(v)` = "First found in: <source title or 'typed in by hand'> —
  <the whole original sentence>"; `watchFound` sends it as `note` to `POST /api/vocab/<id>/source`, which adds it
  on a new line at the end of `memo` (My notes) unless already there (desktop `app/api/vocab.py`, phone
  `backend.js`). A word typed in with no sentence gets no note.
- Measured in a preview at 375 px wide (launch config `tamkeen-filmot`, port 8880, new data folder): the owner's
  example card went from 666 px to 413 px tall; a YouTube card beside it is 395 px (the rest is the second line of
  the sentence and the Find in a video button). Picture: `..\card-size-shots\text-card-before-after.png`.
  Reviewer back showed the cut sentence with the word lit. Tests: `tests/js/cardtext.test.mjs` (8), one more in
  `tests/test_filmot.py`; 384 JS and 304 pytest pass. Not checked on a phone.
- **Asked, not built (waiting for the owner's choice through the main chat)**: "Find in a video" searching by
  itself. Filmot cannot be searched automatically (no public API; its terms allow automated access only through
  that API; searches sit behind a human check). Options put to the owner: the learner's own library (automatic,
  allowed), YouTube's own search + reading the found videos' captions on the device, or Forvo (word-only
  recordings by native speakers, paid API key, no sentence).

### "Find in a video" takes the top result by itself (2026-10-16, "Vocab Page" chat; committed locally, NOT pushed)
The owner chose, after hearing that Filmot cannot be searched automatically: "Just have the user do the captia,
then pull the top YouTube video shown, from its transcript find the word, then seek to the beggining of the
sentence that word is in".
- **What the user sees**: Find in a video → a browser window titled "Find in a video" on Filmot's results for the
  word. If Filmot asks whether you are human, **the user answers it**; the script only says "Answer Filmot's check
  yourself. Tamkeen then takes the top video by itself." Once the results page is showing, the app tries the
  listed videos top first (at most 5) and keeps the first whose captions (in the language being studied) say the
  word: the card becomes exactly a card saved from that video's player, the origin note is added, the player opens
  at **the start of that sentence**, and the window closes. If none say it: "“…” isn't in the captions of the top N
  videos. Tap another result to try it." and the window stays; tapping a result by hand works as before.
- **How**: the button opens the browser with a flag (desktop `JsApi.open_browser(url, find=True)` → a
  `BrowserApi(find=True)` window whose scripts start with `window.__tamkeenFind = true;`; phone `openBrowser(url,
  {find: true})` prefixes the same to the script handed to InAppBrowser). `filmot-browser.js`, on a
  `/search/` page with the flag, waits for `document.readyState === "complete"` and for at least one video (up to
  6 s, giving up at 15 s), then hands over once: every YouTube link, embedded player and `i.ytimg.com/vi/<id>/`
  thumbnail (`src` or `data-src`), in page order, deduplicated, each with the first moment any of its links has.
  - Computer: `BrowserApi.find_results(list)` (refused unless the window was opened to find and is on filmot.com)
    → `youtube.ask_app_to_find` (cleans ids and moments, at most `FIND_TRIES` = 5, timeout 120 s; it and
    `ask_app_to_watch` now share `_ask_app`) → event `youtube_find` → `web/js/app.js` → `findFromResults` →
    answered through the same `/api/youtube/watch-result`. On success the window closes after 0.4 s.
  - Phone: `tamkeen-video://find?c=<id>.<seconds>,...`; InAppBrowser.java passes host "find" through whole,
    GoogleDriveAuthPlugin.java sends it as the `youtubeFind` event; `mobile/src/js/app.js` runs `findFromResults`
    and closes the browser, or shows the error as a browser toast. **Java not compiled here.**
  - `findFromResults` (filmot.js): a video already in the library is searched in its stored transcript; any other
    is read with `youtube.readVideo` (new; `importVideo` = `readVideo` + `saveVideo`) and searched in
    `linesTranscript(lines)` **before** it is kept, so videos without the word never enter the library. The kept
    video's times are taken again from its stored transcript. Filmot's moment for a video picks the nearest place.
- **Tested**: tests/js/filmot.test.mjs (5 new: hand-over order/dedup/moments, once per page, phone address, waits
  for the page, nothing without the flag or on the human-check page; lines → transcript), tests/test_filmot.py
  (2 new: cleaning in `ask_app_to_find`, the window gate and closing). 389 JS, 306 pytest pass. Live in the
  preview (`tamkeen-filmot`) with real captions: [made-up id, lo3KyF50IGE] skipped the first, read and kept the
  second, saved "لو سمحت!" with the word at 2.48 s and the sentence from 2.16 s, opened the player at 2.155, added
  the origin note; a made-up word left the card untouched with the message above.
- **NOT tested**: Filmot's real results page (still never seen: its human check), so whether its results are links,
  players or thumbnails in page order is assumed; the real desktop window; the phone.

### `tamkeen://watch` links: other apps open a YouTube video in Tamkeen (2026-10-16, a side chat of the Onyx Calendar chat; committed locally, NOT pushed, NOT released)
The owner, for Onyx Calendar (their calendar app, Electron desktop + Capacitor Android): "If I have Tamkeen
installed on the device I'd like a toggleable Tamkeen button to appear which will pop up the news with my Tamkeen
player." Onyx's News panel lists YouTube news videos; with its "Tamkeen" switch on, it sends the chosen video to
Tamkeen. **Onyx is built against this exact contract, so keep it.** Onyx shows "update Tamkeen" for versions
older than **the first release made after this commit (the next one after v0.21.0)**.
- **The link**: `tamkeen://watch?v=<11-character YouTube id>`, optional `&t=<seconds>` (start time, digits with
  an optional decimal part only) and `&from=<app>` (e.g. `onyx`, only logged). Anything else in it is ignored; no
  valid id = refused. Read by `parse` in `app/applink.py` (computer) and `parseTamkeenLink` in `web/js/applink.js`
  (phone); both run the same cases, `tests/fixtures/applink_cases.json`.
- **Computer**: Onyx starts `%LOCALAPPDATA%\Programs\ArabicPodcastStudio\ArabicPodcastStudio.exe <link>`. The
  installer now also registers the `tamkeen` protocol for the user (`HKCU\Software\Classes\tamkeen`, removed on
  uninstall), so a `tamkeen://` link opened anywhere does the same. `run.py` takes the link as its one positional
  argument (anything not starting `tamkeen:` is ignored and the app just starts).
  - Single instance: every run writes `instance.json` in the data folder (`{port, pid, token}`, a new secret each
    run; deleted on a clean exit). A second launch with a link reads it, lets that pid come to the front
    (`AllowSetForegroundWindow`), POSTs the link to `/api/app/open-link` with the secret in the
    `X-Tamkeen-Token` header (never in an address; web pages are refused anyway by `same_origin_only`), and exits
    (code 0) once the running app answered `{"app": "Tamkeen"}`. Nothing answering within 3 s (a file left by a
    run that crashed) = start normally. A launch WITHOUT a link still opens a second window as before.
  - The running app keeps the link (`applink.push`, newest 5), brings its window forward (`bring_forward`) and
    sends the page the event `app_link`; the page (`openLinks` in `web/js/app.js`) collects it from
    `POST /api/app/pending-links` and opens it with `watchVideo` (youtube.js; it now takes the start second).
    A run started BY a link keeps it until the page has loaded and asks. No captions (live news streams):
    the usual "No captions available for this video." as a red toast. First run not finished: "Choose the
    language you're learning first, then open the video again."
- **Phone (Android)**: Onyx sends ACTION_VIEW with data `tamkeen://watch?v=<id>` and
  `setPackage("io.github.christiangilkey.arabicpodcaststudio")`. MainActivity has a VIEW/DEFAULT/BROWSABLE
  intent-filter for scheme `tamkeen`, host `watch`; it was already `launchMode="singleTask"`, so a second link
  reaches the open app (`appUrlOpen`) instead of stacking another. `openTamkeenLink` in `mobile/src/js/app.js`:
  `appUrlOpen` while open, `App.getLaunchUrl()` on a cold start (once per launch link, remembered in
  sessionStorage so a page reload doesn't reopen it); closes the in-app browser if open, toasts "Getting
  captions…", `watchVideo`, errors as a red toast. `web/js/applink.js` added to `build-www.mjs`'s SHARED list.
- **Tested**: `tests/test_applink.py` (42: every fixture case, the secret only in the header, foreign pages
  refused, pending links taken once, hand-off to a real local server, stale/broken/wrong-secret files, `run.py`
  exits without a window when handed off); `tests/js/applink.test.mjs` (same cases). 348 pytest, 390 JS pass.
  **Live on this PC, the real desktop window run from source** (`.venv\Scripts\python run.py "tamkeen://watch?v=…"`,
  with `APS_DATA_DIR` set to a throwaway folder): cold start opened Al Jazeera clip `7Lnekifl6Iw` in the player
  (3.7 s); a second launch with `MuGmJGkojz4&t=30` exited in 0.4 s with code 0, the same window showed that video
  at 0:30; the live stream `bNyUyrR0PHo` gave the "No captions available" toast. The installer script compiles
  (Inno Setup 6, checked with a stand-in file list).
- **NOT tested**: the packaged exe (needs a release build), the protocol registration (not installed here), and
  anything on a phone (manifest and JS only; nothing native was changed).

### Vocab page redesign: the Review block first, cards that open on a tap, a ⋯ menu (2026-10-16, "Vocab Page" chat; committed locally, NOT pushed)
The owner (a UI plan pasted to the main chat, "Build it"): a prominent Review block at the top in a bold colour;
word cards that show little until tapped; secondary actions such as Export for Anki in a ⋯ menu.
- **Order now**: title + count + ⋯ (top right) → the Review block (`<section class="review-block">` holding the
  same `#review` banner and `#goal` bar as before) → search box (full width) → folders → sort/date filters and
  Select all → bulk bar → list. "Add a word manually" is no longer a box on the page: ⋯ → Add a word shows the
  form (`#add`, with Cancel; it hides again after adding). The tip paragraph now shows only in an empty list.
- **⋯ menu** (`showMenu`): Add a word, Export CSV, Export for Anki (same `ankiHelp` + .apkg as before), Anki
  settings (`ANKI_SETTINGS`). New line icons in icons.js: `more` (three dots) and `sound` (loudspeaker).
- **Banner look** (review.css, top block, agreed with the Spaced Repetition chat by message): solid teal #22c7d6
  with dark #022a2f text while there are cards to do, a plain `--surface` card when idle; bigger (22 px title,
  17 px counts, 52 px icon, dark pill "Start"); the gradient, shadow and sheen animation are gone.
- **Word cards** (`item()` in vocab.js, styles at the end of the Vocab part of app.css, `.vi-*`): closed = tick
  box, the word, its meaning (hidden when empty), the cardtext.js-trimmed sentence, compact "Word"/"Sentence" play
  pills, a chevron. A tap on the card's top part (not on its tick box, buttons or links; Enter/Space when focused)
  opens it in place: source line, Anki progress, folder tags, the translation (read only, marks removed),
  meaning/notes/my notes, Find in a video, Folders, Delete. One card open at a time (`openId`; it stays open when
  the list is redrawn). Editing the meaning updates the closed card's meaning too. Select all / bulk work as before.
- Measured at 375 px: closed cards 100-190 px tall (were about 400-670). Pictures (before/after, phone and desktop):
  `..\card-size-shots\vocab-phone-before-after.png`, `vocab-desktop-before-after.png`, `vocab-after-phone-open-card.png`.
  Checked in the preview (`tamkeen-filmot`): one-open-at-a-time, ticking keeps a card open, bulk bar, meaning
  mirrored, ⋯ menu entries, Add a word, Review opens and closes the reviewer; 390 JS and 348 pytest pass.
  **Not checked**: a real phone, light theme by eye.

### Library: one + button for adding, one sticky header row (2026-10-16, "Library Look" chat; committed locally, NOT pushed)
The owner's UI plan, relayed by the main chat: separate adding from the content, and one consistent filter row.
- Every way of adding something left the Library. The round **+ button** (`.add-fab`, bottom right; on the phone
  above the tab bar) opens `web/js/components/addsheet.js`, a sheet on `components/modal.js` that lists Podcast,
  YouTube, Web page, Video file, Audio file, Reels. Podcast, YouTube and Web page open a small step inside the
  sheet (feed address + Trending; Open YouTube + "Popular in"; page address + Open Web Browser); the files open
  the chooser straight away (the Library still owns the hidden file inputs and the upload bar); Reels goes to
  `#/reels`. The reels header lost "Get more reels" (kept "Watch all"); empty kinds now say "Press + and choose …".
- **One header row** (`.lib-bar`, sticky) at the top of the Library on every kind: on the phone the kinds as small
  pills in one sideways line, then the status pills and the title filter, then Select all / Transcribe / Delete
  (and the phone's refresh icon). The computer keeps its side list for the kinds (and its Refresh & sync at the
  bottom of it); its row is the status pills, the filter and the select row. The pills now show on every kind,
  reels and empty kinds too. Library messages pop up above the + button (`body:has(.add-fab) .toasts`).
- Styles: `web/css/media.css` (top section) and `mobile/src/css/mobile.css` (Library part). The old add-control
  rules in `app.css` (`.lib-actions`, `.add-page`, `.browser-btn`, `.add-feed`) are now unused but left in place
  (another chat was editing app.css). New icons `plus` and `refresh` in icons.js.
- Checked in the preview: phone build (`mobile/www`, test podcasts typed into its storage) and the desktop server on
  a signed-out copy of a test library (adding a web page through the sheet worked end to end). Pictures:
  `C:\Users\chris\.claude\uploads\library-redesign\`. Not checked on a real phone; the video/audio file choosers
  were not opened (they can't be driven from the preview).
- Tested on my own copy of a test library with the sign-in rows deleted (launch config `library-look`, port 8799).
  (I first reported `reels-data` as signed in again; that was wrong: its rows hold `""`, which means signed out.)
- **2026-10-16: "signed in again" checked, and it was not.** The report came via the main chat from the Library
  Look chat. Read through SQLite (journal included), `reels-data`'s two rows hold `""`, the JSON for an empty
  value, which is how the app stores "signed out" (`oauth.signed_in()` is `bool(get_setting(...))`). Its main
  file alone (as a copy without `-wal` would be) is signed out too. Its log and main file are untouched since
  2026-10-13 16:08, so no app has run on it since; the only server running at the time was another chat's,
  on `e2e-video`, signed out. All 26 test libraries under the chats' scratch folders read signed out; only the
  real library (`%APPDATA%/ArabicPodcastStudio`) is signed in. Most likely the row was seen to EXIST and read
  as "set". The shared memory note now says how to read it.

#### Review card: Mnemonic maker, Paste on My notes, white answer-button text (2026-10-17, "Spaced Repetition System (fork)" chat; committed locally on main as 6046c39, not pushed)
The owner's words: "On the bottom buttons, the text should be white ... a feature for the back of the cards called
(mneumonics maker) at the bottom below my notes box. Once clicked it will generate 5 sub boxes with words that
sound like the target word but in the users selected native language ... each ... will have a copy button in the
right of them ... Also include a paste button onto the my notes box".
- `web/js/review/mnemonic.js` (pure, tested in `tests/js/mnemonic.test.mjs`): the prompt (5 words or short
  phrases in the UI language that SOUND like the word; prefer ones that suggest a picture of the meaning; never
  translate or repeat it), `cleanItems`, `soundAlikes(v, {ask, study, speaks, avoid})`. `definer.askJson(cfg,
  {system, user, schema}, transport)` is a general "small JSON answer" call (same provider/key/model, same
  errors, usage counted); `askAi` in both define-service.js files sends it (relay on the computer, native HTTP on
  the phone). "Make 5 more" passes the earlier ones as `avoid`. Results are kept per word while the reviewer is
  open (`mnemonics` Map in review.js), never stored. The suggestions carry `translate="no"`. No key gives
  "The Mnemonic maker uses your AI key. Add one in Settings → Word definitions."
- Its own model and thinking (owner, after v0.24.0: "set an option for how hard the model should think on it in
  the settings. Or give an option to set a different model for just the thinking of mneumonics"): a "Mnemonic
  maker" row at the foot of the Word definitions card (aisetup.js, so computer and phone) with Model ("" = the
  provider's `defaultModel`, its fastest = the default; "same" = the lookups' model; or any listed model), Thinking
  (Off = default / Low / Medium / High; hidden for Haiku 4.x and Gemini 2.x) and "Try it" (times a real
  request). Settings `mnemonic_model_<provider>`, `mnemonic_effort` (db.py, store.js); `definer.mnemonicConfig`,
  `thinkingFor`; review.js asks through `askMnemonic`. `buildRequest(..., effort)` (default "low", so lookups are
  unchanged) maps Off to: Claude `thinking: disabled` + effort low (Sonnet 5.5 `between_tools`, no fallbacks;
  Opus 5.5/Fable can't turn it off, so effort low), Gemini `thinkingLevel: minimal`, OpenAI `reasoning_effort:
  none`, Grok low (Grok has only low/high). A 400 still falls back to the plain request. Not yet tried against a
  real provider (no key on the dev machine): the owner's "Try it" shows the real time.
- Labels renamed (owner: "The 'notes' on back of card should be 'Grammar Notes' and the 'my notes' should be
  'Personal Notes'"): "Grammar notes" (`notes` field) and "Personal notes" (`memo`) on the review card and the
  Vocab page (shown in capitals by CSS on the card). Field names in the data and in Anki are unchanged (the Anki
  card shows no labels). Translations in `tools/i18n/tr/<code>/17.txt`.
- Paste: `readClipboard()` in both app shells. On Android the page can't read the clipboard, so a new plugin
  `ClipboardPlugin.java` ("TamkeenClipboard", registered in MainActivity, read only, on the UI thread) answers;
  `TamkeenClipboard` in native.js. It appends to My notes and saves like typing. **The Java has not been compiled
  here** (CI compiles it).
- `.rv-yes` is now `#0b8693` (the deeper brand teal) with white text; `.rv-no` purple with white text.
- Checked in a preview of main at 390 x 844 with a stand-in AI answer (no real key): no-key message, five boxes,
  Copy then "Copied", Paste appending and saving, "Make 5 more" asking for different ones. Not checked: a real AI
  provider, a real phone (clipboard plugin, copy in the WebView), and the new English strings are not yet in the
  web/i18n dictionaries (run tools/i18n when the interface languages are next updated).
- Gotcha met: another chat began editing definer.js in the seconds between my `git status` and my commit, and
  `git add` of the whole file swept its unfinished lines in. Undone at once (soft reset, nothing pushed) and
  recommitted with only my block staged. Re-read each file's diff right before committing it.

### "Find in a video" asks for captions in the language being learned (2026-10-17, "Vocab Page" chat; committed locally, NOT pushed)
Owner: "after the user does the captia, then automatically select the language to the language the user is learning
in the settings on the webpage, then pull the word from the top videos of that query".
- **Address first** (one page load): `filmotAddress(word, lang)` adds `&lang=<code>` with YouTube's caption code
  (`filmotLang`: tl → fil, he → iw, the rest unchanged). The word's own `language`, else the study language.
- **The page's list as a fallback**: `languageChoices(lang, name)` = {lang, values (codes), names (English names,
  plus Filipino for Tagalog)} travels to the browser script as `window.__tamkeenFind` (desktop: `open_browser(url,
  find)` → `_find_language` keeps only short plain words before writing it into the page; phone: prefixed to the
  script). On a find-mode `/search/` page, `filmot-browser.js` looks for a `<select>` whose options are English
  language names (it has "English" and "German"/"Spanish"/"French"), which keeps it off Filmot's interface-language
  list (native names). If another language is chosen there, it chooses the learned one (input + change events),
  once per page address (sessionStorage), sends the list's own form after 2 s if the page has not changed, and
  waits 5 s before taking whatever results are showing. Videos are still checked for captions in the learned
  language and for the word before one is used (findFromResults), so a page that ignores both still cannot give a
  wrong-language card.
- **Unverified, and why**: Filmot's caption-search results page sits behind its human check (seen again
  2026-10-17), so neither its address parameter for the language nor its language list could be seen. `lang=` is a
  guess (Filmot's own keyword search uses the same codes in its address, `/cloudbyword/<code>/<word>`, and its
  language list there has values like `ar`, `iw`); an unknown parameter is ignored by a site, so the guess costs
  nothing if wrong.
- Tests: 4 new in tests/js/filmot.test.mjs (address, choices, choosing in the page's list and not in the site's,
  already chosen / no list / no language, form sent; Tagalog as "fil"), 1 in tests/test_filmot.py (`_find_language`).
  398 JS, 349 pytest pass. In the preview the button handed the window bridge
  `…/search/<word>/1?gridView=1&lang=ar` and {lang: "ar", values: ["ar"], names: ["Arabic"]}.

#### Misheard words put right from the word popup (2026-10-17, "Media import" chat; committed locally on main, not pushed)
The owner's request (via the main chat): when a tapped word is a speech-recognition mishearing or a misspelling,
the AI should say so, the popup should show and define the right word, and the transcript should be fixed.
- **The AI answer** (`web/js/definer.js`): both lookups (detailed and quick) have a `correction` field: "" or the
  word actually said, filled only when the model is confident (`CORRECTION_RULES` in both prompts: never rare words,
  names, dialect, slang or spelling variants). `cleanCorrection` drops one that only repeats the word or differs
  in case/punctuation, or is longer than 4 words. `ctx.noCorrect` (after an Undo) tells the model the word is right.
- **The cache** (`definer.lookup`, used by both `define-service.js` files, which now only supply load/save):
  after an Undo the answer is kept under a separate "keep" key (`keepKey`); a keep key for the word and sentence
  (here or synced from another device, since answer entries are never replaced across devices) means no answer
  that corrects it is used and new ones are asked with `noCorrect`. `rememberAnswer` / `storeDefinition` put the
  answer under the corrected sentence too, with `corrected_from`, so tapping the word again shows the correction
  (with Undo) without a new question.
- **The transcript**: `web/js/correction.js` (pure, tested; `planCorrection` keeps each word's punctuation, word
  for word or one word to a short phrase; `replaceInText` changes only the changed words in the line) and
  `web/js/fixword.js` (`wordFixer`: calls the API, updates the words on screen, redraws). Computer:
  `POST /api/episodes/{id}/correct` {first, last, expect, words} → `app/corrections.py` (words, line text and
  norm, `segments_fts`, and a new `transcribed_at` so sync sends it; 409 when the words no longer read `expect`).
  Phone: the same route in `mobile/src/js/backend.js` (transcript, `transcript_rev`, `pending_transcripts`).
  Undo is the same call the other way round.
- **The popup** (`wordbubble.js`): actions `onCorrect(def)` / `onUndoCorrect(fix)`; shows the right word as the
  headword and a line "Transcript said X · Undo" (or "(not changed in the transcript)" where it can't be
  changed). Save saves the right word (`vocabFromDefinition` uses `def.correction`).
- **Screens**: `player.js`, `reader.js` (title words are not stored, so they are never changed; offset =
  `titleWords`), `reels.js` (new `contextAt`). Not changed where words are regrouped for display (Japanese,
  Chinese): the popup still shows the right word.
- Checked in the desktop preview with a stand-in AI answer: podcast, web page and reel (correct, the stored
  transcript and line change, Save keeps the right word, tap again comes from the cache, Undo restores and the
  word is asked again as written and then left alone); the phone's route in the phone preview on a temporary
  page. **Not checked: a real AI provider (how often each model flags words, and whether it over-corrects
  dialect), a real phone, and two real devices syncing a correction** (the sync path is covered by
  `tests/test_corrections.py`). Tests: `tests/js/correction.test.mjs`, `tests/test_corrections.py`.

### Phone: Transcript button is icon-only (2026-10-17, "Player look" chat; committed on main, not pushed)
- At 640 px and less the player top row's Transcript button shows only the new `transcript` line icon (icons.js);
  its word is in `<span class="lbl">`, hidden by the last section of `web/css/media.css`; aria-label "Transcript".
  YouTube title on a 375 px phone: 83 px -> 132 px. Desktop unchanged.

### "Find in a video" in the word popup of web pages (2026-10-17, "Vocab Page" chat; committed locally, NOT pushed)
Owner: "The whole forvo find in video option we have on vocab cards should be a button right on the initial word
pop up as well" (screenshot: the popup on an imported web page).
- `wordbubble.js`: optional action `onFindVideo(def)`; when a page passes it, a "Find in a video" button (line
  icon `video`) sits beside Save (not in the quick-lookup popup). Handled like Save: disabled while working, then
  the popup shows "✓ Saved".
- `reader.js` (web pages, `noAudio`) passes it: `findWordInVideo` uses the card already saved from this page
  (this visit's `savedRows`, else `/vocab?q=` matched with cardtext `fold` on the word or its vowelled form,
  preferring this page's card), else saves the word exactly as Save does (`saveWord`, which now returns the row:
  the corrected word, the meaning shown, this page and sentence), then `findInVideo`. So the origin note is
  "First found in: <page title> — <sentence>" and the search is in the card's language.
- **Players and reels do not get it on purpose**: a word saved there already has its own audio, and Find in a video
  would replace that source and sentence. Passing `onFindVideo` from player.js / reels.js is all it takes if the
  owner wants it there too.
- Checked in a test copy (preview slots were full: `run.py --server --port 8881` on the `tamkeen-filmot` data
  folder, the built-in browser pointed at it): on an imported page the popup shows Save + Find in a video; one tap
  saved the word with the page's sentence and title (language ar), turned Save into "✓ Saved", handed the window
  `…/search/استهداف/1?gridView=1&lang=ar` with the Arabic choices and set the origin note; a second tap, and a tap
  after reloading the page, reused the same card (one copy). Picture: `..\card-size-shots\popup-find-in-video.jpg`.
  412 JS, 357 pytest pass. Not checked on a phone.

### Rows that scroll sideways show that they do (2026-10-17, "Library Look" chat; committed locally, NOT pushed)
Owner's request (relayed by the main chat): make it obvious that the sideways rows scroll; fix the phone Library's
status pills running into "Filter by title".
- `web/js/scrollhint.js`, started once by both app shells (`initScrollHints()`), finds the rows by selector
  (`.hscroll`, `.lib-bar .tabs`, `.lib-bar .kind-row`, `.library .feed-list.sub-list`, `.disc-cats`, `.topbar .nav`)
  and acts only while a row really scrolls sideways and has more than fits:
  1. peek: changes the gaps (−4…+14 px) and, if needed, the items' side padding (±4 px) so the item at the right
     edge is cut to 25–65%; if nothing in that range works, the row is left as it was;
  2. fade: classes `hs-more` / `hs-back` put a mask on the edge with more beyond it (CSS at the top of
     `web/css/media.css`); it disappears at the end of the scroll;
  3. nudge: the first time a row appears after the app starts, it slides 34 px left and back (not with
     "reduce motion", not if the finger is already on it).
  The pinned chevron (the owner's option 4) was not built.
- Phone Library: "Filter by title" now has its own line under the status pills (`mobile/src/css/mobile.css`).
- Order of the kinds (owner, same day): Podcasts, YouTube, My webpages, Reels, My videos, My audio, in `KINDS`
  (library.js: phone row and desktop side list) and the + sheet's `WAYS` (addsheet.js).
- Icons (owner, same day): the + sheet's and the kinds row's icons are plain line icons in the text colour (white
  in dark mode), no coloured tiles; the chosen kind on the phone is a dark teal pill with a teal edge
  (`.lib-bar .kind-row .feed-item.active`), and the computer's chosen kind keeps a white icon too.
- Rows that wrap instead of scrolling (Vocab folder chips, reels/YouTube chips, the creature card's buttons, the
  computer's status pills) get nothing; there is nothing hidden to hint at.
- Checked in the preview: phone build at 375 px (peek 28–30% on both Library rows, fade, nudge called on both rows)
  and desktop (Trending topics fade; wrapped status pills untouched). The nudge's movement itself needs a visible
  window; in the hidden preview only its calls could be checked. Pictures: `C:\Users\chris\.claude\uploads\library-redesign\scroll-hint-frame1-rest.png` and `scroll-hint-frame2-nudged.png`. Not on a real phone.

## No Import Page outside reading (commit 6fe635a)
Browser windows know why they were opened. Desktop: `_browser_window(..., reading=False)` puts
`window.__tamkeenNoImport = true` before the toolbar script, which then leaves out Import Page and
the star. Used by open_youtube, open_browser(find) and open_browser(url, False, False) (the
Instagram sign-in from web/js/app.js `openBrowser(url, { signIn: true })`). Phone: openBrowser
sends `forReading` (false for openYouTube, the YouTube-link fallback, Instagram sign-in and Find in
a video); GoogleDriveAuthPlugin passes it to InAppBrowser.open, which hides importButton and the star.

### Reel player: "The link to this photo or video may be broken" (2026-10-17, "Instagram Reels Player" chat; commit in this note's log line, not pushed)
Owner's report (v0.24.0): a reel showed Instagram's broken-link page and 0:00. Cause, checked signed out in a
browser on the same creator's reel `Def3XHdlelv`: the reel EXISTS but is **age-restricted**; Instagram's embed
page answers such posts (also private, removed, or embedding turned off) with that broken-link page, and the
reel's ordinary page says "Age-restricted content ... Log in to continue". So it plays only signed in, and the
owner's reel window had been signed out by Instagram. Fix: `reel-embed.js` spots that page at once (selectors
`.EmbedBrokenMedia, .ebmMessage, a[href*='utm_campaign=invalid']`; a normal reel's embed page has none of them)
and hides it; `reels.js` then goes to the ordinary page as before (signed out: the sign-in notice, which now
mentions age-restricted reels and expired sign-ins; Skip only when there is another reel). A reel with no video
even on its ordinary page is skipped only while some other reel hasn't failed (`failsInRow`), so a one-reel
queue or a queue of failures no longer goes round forever. Not checked on a real phone.

### "Troubleshoot" when a key fails (2026-10-17, "API key setup and onboarding flow" chat; owner's request via the main chat)
Owner: "If an API key fails add a troubleshoot button feature that lists common reasons an API fails such as
VPN, expired key, ect...". A **Troubleshoot** button now sits beside the error in: Settings → Word definitions
"Test with an example", the Mnemonic maker's "Try it", Settings → Cloud transcription "Test the key", a failed
word lookup in the popup (between Try again and Settings), the review card's Mnemonic maker, and a failed cloud
transcription in the Library (only when the error names Groq or OpenAI, so local Whisper/download failures don't
get it). It opens a small in-app box (`components/modal.js`): the problem in one line, the app's message, "Most
likely" causes each with one thing to do, "Other common causes" folded away, and two links: the provider's key
page and its status page. The key is never shown (anything key-shaped in a message is blanked).
- **Sorting** (`web/js/trouble.js`, pure, `tests/js/trouble.test.mjs`): `problemKind(status, body)` gives
  key (401/403, Gemini's 400 "API key…"), credit (402, quota/billing text), rate (429), network (status 0 = no
  answer), region (unsupported country: checked FIRST, because OpenAI answers it with 403), model (404), server
  (5xx) or other. Text-only errors (the computer's cloud transcription, kept on the episode) go through
  `kindFromMessage`. `troubleshooting(kind, { stt })` returns the box's heading and causes.
- **Errors now carry `kind`, `provider`, `status`**: `DefinerError` (definer.js `httpFailure`) and `SttError`
  (stt.js `sttFailure`/`sendFailure`). New messages: "{name} isn't available in your country or region.",
  "Couldn't reach {name}. Check your internet connection." (status 0, which the desktop relay returns; a phone
  transport that throws is now caught by definer.js `send` and reported the same way instead of a raw error),
  and "{name} says the account has no credit…" for 402. `keyRejected` is now `kind === "key"`, so a region
  refusal is no longer called an expired key.
- **Status pages**: status.claude.com, aistudio.google.com/status, status.openai.com, status.x.ai, groqstatus.com
  (`STATUS_PAGES`; all answered except status.x.ai, which refuses scripted requests).
- **Translations**: `tools/i18n/tr/<code>/18-troubleshoot.txt` in all 8 languages. Cause titles are
  `{ title, fix }` objects and the headings a Map of pairs, because `extract.mjs` skips a string right after
  "[" or "key:". When I ran `extract.mjs`, 192 NEW strings from other chats' work were also untranslated; I left
  them out of `strings.json` (kept HEAD's list plus my 57) rather than translate other chats' text. Running
  `extract.mjs` again will bring them back and `tests/js/i18n.test.mjs` will fail until they are translated.
- Checked in the desktop preview (fresh test data, not signed in): real refusals from Anthropic and Groq with
  made-up keys in Settings (both tests), the Mnemonic maker test, the popup's button, and boxes for a dropped
  connection, an unsupported country and no credit; the box in Spanish at phone width (375 px). Not checked: a
  real phone, a real VPN or region block, the Library row with a real failed cloud transcription.

### Phone reels: "stuck at reel 2" (2026-10-17, "Media import" chat; committed locally, NOT pushed, NOT released)
The owner, phone v0.24.0, Spanish, cloud transcription: "Listening to reel 2 of 70…" never moved. (The "of 70"
line is the TICKED-reels job, `startSelected`: 70 reels were ticked; "Get random reels" words it differently.)
- **Cause**: nothing in trying one reel (`tryReel` in `mobile/src/js/reels-phone.js`) had an overall limit. The
  send (`postAudio`) allows 4 tries with a 5-minute read limit each, and a 429 ("slow down", e.g. Groq's free
  hourly allowance used up by podcasts) was waited out SILENTLY for up to 20 minutes (`LONGEST_WAIT`), because
  the reels job passed no `say`. Stop was only checked between reels. Not reproduced on the owner's phone; the
  three paths were reproduced in the phone build.
- **Fix**: `bounded(work, seconds)` gives up on a promise after a time limit or at once on Stop;
  `tryWithin` tries one reel within `REEL_SECONDS` (180) and turns a failure that is only this reel's into a
  reason; the download has `DOWNLOAD_SECONDS` (75). `postAudio` honours `job.longestWait` (new; reels pass
  `PROVIDER_WAIT` = 90 s) and the reels job now passes `say`, so a wait is shown. A longer wait, a refused key or
  Stop end the batch with "N added, M skipped". Progress: "Reel 2 of the 70 you ticked: listening… (1 added, 0
  skipped so far)"; random: "Getting 10 Spanish reels: 1 added, 0 skipped so far; listening to the next one…".
- **Checked** in the phone build with the pretend Instagram, time sped up 50x, fetch replaced (nothing sent to a
  real provider): downloads hanging → each skipped "the video took too long to download", batch ends "0 added,
  12 skipped"; Stop while one hangs → "Stopped. 0 added, 0 skipped." within a second; Groq asking to wait 5
  minutes → the batch ends with Groq's own reason plus the tally after one call; Groq never answering → that
  reel skipped "took over 3 minutes", the next tried. 357 pytest; JS all pass except `i18n.test.mjs`, which
  fails on five strings from other chats' unsaved work, not these. **Not checked on a real phone.**
- `transcribe-service.js` is the cloud chat's file: one line (`job.longestWait`), default unchanged.

### Goal bar: a better "time left today" estimate (2026-10-17, "daily goal progress bar" chat; committed locally on main, NOT pushed)
- Owner: "Make time estimated better" (relayed by the main chat). Read as the goal bar's "about N min left today",
  the only forward-looking time estimate (the reviewer's end screen "N cards in about M minutes" is time spent).
- **What was wrong**: it averaged whole word-days and then trimmed the slowest tenth, which are exactly the words
  that were missed and came back; words not finished that day were dropped; the moment between cards was not
  counted; a word already missed today cost a whole new word. Result: about 20% too low.
- **Now** (`web/js/review/goal.js`, rewritten; `goalbar.js` uses `model` / `estimate` / `timeText` / `wordCost`):
  looks, not words. Each look is "new" (a word's first look on its first day), "review" (an older word's first look
  of the day) or "again" (a later look the same day after a miss). Per kind: the share remembered (all answers on
  record, nudged by a guess worth 5 answers) and the time of a remembered and of a missed look (this device's
  looks first, then all on record, then a guess; mean of the last 300 without the fastest and slowest 5%; looks
  at the 60 s cap left out as "away"). A fresh word costs p * remembered + (1 - p) * (missed + the return looks,
  1/q of them on average); a word missed today costs only the return looks; each look + 0.6 s between cards.
  Until a word has come back often enough, return looks are timed like reviews.
- **Shown**: "about 9 min" (rounded to the minute under 15, to 5 under an hour, then to 10); a range ("8–12 min")
  while the times rest on fewer than 30 looks (±20%) or on a guess (±35%, plus "(a first guess)").
- **This device's record** `reviewTimes` is now `{ts: [...]}`, the times of the answers given here (last 900);
  the older `{new, review}` record is still read. Undo removes the time. review.js unchanged.
- **Measured** (script and the old version in the shared notes folder `goal-backtest/`, run with
  `node backtest.mjs [reviews.json]`): simulated learners on the app's own scheduler, 5 x 90 days, each day
  estimated from the days before for the words actually studied that day: before 24% off on average (21% too
  low), after 16% off (1% too low); with speed that does not depend on remembering: before 20%, after 15%. The
  rest is day-to-day speed, which nothing predicts. **NOT measured on the owner's real log**: copying the live
  library to extract it was refused by the permission check; with the owner's OK, run the script on an export
  of the `reviews` table.
- Translations: the popup's sentence changed; strings.json and `tr/*/10.txt` swap ids 16db8f9d / 0a730827 for
  4ee48926 in all 8 languages; dictionaries rebuilt (`build.mjs --check` clean). Tests: `tests/js/goal.test.mjs`
  (11). Checked in the `tamkeen-goal` preview (fresh folder, not signed in) at desktop size and 390 px.
