# Tamkeen: rules for every chat

Read `HANDOFF.md` first. Several chats edit this checkout at once: check `git status` before editing shared files.

**When you finish a piece of work, message "Temkeen Main Chat"** (SendMessage; ListAgents shows it). Give
what it does in one or two plain sentences, the commit hashes (or the files changed if not committed),
whether pytest and the JS tests pass, and what's unfinished. That chat commits and releases; without the
message new work gets lost between versions. Never tag or release yourself.

**Every new feature starts as a prototype** (the owner, 2026-11-18). Add a row to `PROTOTYPES` in
`web/js/prototype.js` with `released: false`, and have the feature's code check `feature("<id>")` before it shows
itself or changes how something old behaves. Only the owner's devices see it: five quick taps on the version in
Settings (the About heading in the web app) switch prototype mode on. Ordinary users get the app as before. When the
owner says to release ("merge it to live"), set `released: true`, and only then add its CHANGELOG line and its
`whatis-special.md` bullet. Bug fixes don't need this.

**Before any visual change, read `DESIGN.md`** (the owner's design rules, 2026-11-27: colours, type, spacing,
squircle corners, no box inside a box, one main thing per screen) and run its checklist before you say you're done.

**When a feature is released or a clever workaround lands, add it to `web/whatis-special.md`** ("What makes Tamkeen
special" in Settings; the owner wants it kept up to date). One bullet in the right section, in the page's style:
a bold title, the problem in *italics*, then how Tamkeen solves it in plain words, with real numbers where there
are any. Bug fixes and small tweaks don't go there (they go in CHANGELOG.md). The main chat checks it at every release.

## Access control matrix (who may do what)

Keep this true when you add a feature: enforce it where marked (database rules, the desktop server), never only
in the page. The online part is `supabase/v8-safety.sql` (written 2026-11-06; applied to the live database
on 2026-11-27, with every later file up to v22). Full rules: HANDOFF "Online safety" and
"Local server".

**People.** *Me* = the signed-in user acting on their own data. *Friend* = an accepted friendship. *Guild-mate* =
in a guild with me, not a friend. *Known* = friend, guild-mate, or anyone I share a pending request, invite,
battle, gift, message or shared folder with. *Stranger* = any other signed-in user. *Blocked* = either of us
blocked the other (it ends the friendship and beats every other row). *Under 16 / not asked* = the age check in
`web/js/agegate.js` hasn't passed: no online access at all (no sign-in, signed out on the device). *Admin* = the
service role or the Supabase SQL editor.

| Online data (Supabase) | Me | Friend | Guild-mate | Stranger | Blocked | Admin |
|---|---|---|---|---|---|---|
| Profile: username, photo | edit, delete | see | see | find by exact username only (`find_user`) | no | all |
| Email address | see (from Google) | no | no | no | no | all |
| Friend request | send (20/day), cancel | accept, remove | send | send | no | all |
| Messages and voice notes | send, unsend, read own | send, read own chat | no | no | no | all (not end-to-end encrypted) |
| "What I'm studying", online status, game team | edit | see | see | no | no | all |
| Battles, gifts | send (limits) | send | send | no | no | all |
| Guild | create (5), leave, invite friends | can invite me to theirs | see members | see name and tag | no | all |
| Shared folders and words | edit if member | added by a member | no | no | no | all |
| Reports | file (20/day) | no | no | no | no | read, act |
| Blocks | add, remove, list mine | no | no | no | no | all |
| Delete account (`delete_my_account`) | yes, everything | no | no | no | no | anyone (`private.delete_user`) |
| Helper checks (`private.*`) | through rules only | no | no | no | no | all |

| DLI classes (`supabase/v10-dli-classes.sql`) | DLI student (me) | Teacher of a class I'm in | Another teacher | Owner | Anyone else signed in | Signed out |
|---|---|---|---|---|---|---|
| My username (shown in place of a name: no real name is asked for or kept since v11), DLI language, day I agreed and first joined | see, delete (stop sharing) | see | no | see, delete | no | no |
| My weekly numbers (days, flashcard minutes, listening/watching/reading minutes per device (v11), reviews, remembered, new words, words, known; the activity level made from them) | see, send | see, from the week I joined their class | no | see | no | no |
| My words, meanings, library, recordings | never sent | no | no | no | no | no |
| A class: name, teachers' usernames | see if I'm in it; leave | rename, new codes, delete, remove a student | no | see name and counts | no | no |
| A class's teachers (`supabase/v13-dli-class-teachers.sql`, prototype `class_teachers`) | see their usernames under the class | list; add another DLI teacher by username; take out one who joined after them | no | as before | no | no |
| An invitation to a class (`supabase/v15-dli-class-tab.sql`, prototype `class_tab`) | see mine; accept or decline | send by username (wrong names capped at 20 a day), see who hasn't answered, take back; sees nothing of the student until they accept | no | no | no | no |
| Classmates: username and activity level (one word, never the numbers) | see, and be seen, only after agreeing to it in the Class tab (wording 3) | see those who agreed | no | no | no | no |
| Something sent to a class: title, kind, link, its words as a file (bucket `dli-class`); with v17 kept until removed (300 a class) | see, add to my library | send (100 a day; 30 before v17), remove | no | no | no | no |
| The Classroom (`supabase/v17-dli-classroom.sql`, prototype `classroom`): a class's folders; on each item the teacher's notes on its words (important, the teacher's meaning, a note, the sentence) | see; the notes show in my word popup; adding the important words to my cards happens on my device only | make, rename and remove folders; move, change in place (transcript, notes), remove items | no | no | no | no |
| A class's codes | no | see | no | no | no | no |
| Teacher code | no | no | no | see, replace | no | no |
| Becoming a teacher / the owner | no | by the teacher code | by the teacher code | by the one-time owner code (shown when the SQL file is first run) | wrong codes capped at 20 a day | no |
| A teacher's note on a student | no | on that teacher's device only, never sent | no | no | no | no |
| A lesson sent to a class (`supabase/v12-dli-lessons.sql`): title, questions, passage, audio files, corrected transcripts | see, once sent | add, correct, take back | no | no | no | no |
| A lesson's answer key | never | see, change | no | no | no | no |
| My answers to a lesson (sent only when I press Hand in) and the study words a teacher gave me | see, hand in again | see; give study words | no | no | no | no |

The DLI tables have row-level security on and **no** reading or writing rule: everything goes through the `dli_*`
functions, each of which checks who is asking (`tests/js/dliweeks.test.mjs` fails if a rule or an unlisted call
appears). A student must agree on a screen that lists what is shared (`web/js/components/dlishare.js` SHARE_TEXT;
raise `WORDING` in `dliclass.js` if what is shared changes). Applied to the live database on 2026-11-27.

| The creator's view (`supabase/v14-creator.sql`, prototype `creator_bar`) | Creator (a row in `private.creators`) | Anyone else signed in | Signed out |
|---|---|---|---|
| Am I a creator? (`am_creator`) | yes | told no | no |
| People online now, accounts, active users, database and file sizes, biggest tables (`creator_stats`: counts and sizes only, nothing about any one person) | see | no | no |
| Who the creators are | SQL editor only | no | no |
| A gift to a user's game (`supabase/v16-owner-gifts.sql`, prototype `owner_gifts`): coins, gems, XP, glow (added or taken away), items, moves, unlocks, creatures | give to anyone by username, see the record of all gifts, take back one not yet collected | see and collect only their own (never who gave it); the app adds it to their game once | no |
| Anyone's game itself (kept on their devices and in their own Google Drive) | cannot see or change it | their own only | no |

| Ranked battles (`supabase/v18-ranked.sql` + `v19-ranked-no-pair-limit.sql`, prototype `ranked`; the champion: `v22-ranked-champion.sql`) | Me | The player I'm matched with | Anyone else signed in | Blocked (either way) | Under 16 / signed out | Admin |
|---|---|---|---|---|---|---|
| My rating, ranked battles, wins, place (`ranked_me`) | see | my rating and games, during the match | the rating, on the leaderboard if in the top 50; also battles and wins if I'm the champion | not on their leaderboard | no | all |
| The queue (`ranked_join`, `ranked_poll`, `ranked_leave`) | join, stay (polled), leave | is paired with me only when within the window and not blocked (as often as we like) | never sees who is waiting | never paired | no | all |
| A match: our usernames, ratings, arena seed | see (only my own matches) | see | no | never made | no | all |
| A match's result (`ranked_report`, `ranked_result`) | report once (won, lost, quit, broken); the server decides from both reports | reports once too | no | no | no | all |
| The live battle itself (Realtime broadcast channel `ranked-<match id>`, `web/js/game/rankedlive.js`): my team (as sent to friends), my card count, my moves, whether each answer was right and fast (never the words) | send, and see the other's | sends theirs, sees mine; whatever arrives is checked before use (team as a friend's, moves it has, numbers in range) | only with the match id, which is never shown to them | never matched | no | not stored anywhere |
| Leaderboard (`ranked_top`): usernames and ratings of the top 20-50, nothing else | see | see | see | left out | no | all |
| The champion in the championship hall (`ranked_champion`, `supabase/v22-ranked-champion.sql`, prototype `ranked_champion`): the best player's username, rating, wins and battles, and the team they last took into a ranked battle (kept by `ranked_showcase_set` when a ranked battle starts; checked again on arrival as a friend's team) | if I'm the best, all of it shows to everyone signed in; the Settings switch "Show my team if I'm the ranked champion" (on unless switched off) hides my team, leaving my username and rating | as anyone | sees the best player neither of them has blocked: username, rating, record, team (unless hidden) | left out (each sees the next best instead) | no | all |
| Ratings themselves | changed only by the server's settling of a match | no | no | no | no | all |

Message size, uploads and daily counts are capped in SQL. `created_at` is set by the server. Friends' game
data is validated again on arrival (`web/js/game/remote.js`) and drawn without raw HTML.

| Desktop app's local server (`app/guard.py`) | Tamkeen's own page | Other websites | Other programs on the computer | Anki add-on |
|---|---|---|---|---|
| Any request (Host must be the app's own, Origin exact) | yes | refused | only with a right Host | yes |
| Read settings without keys (GET) | yes | no | yes | as other programs |
| Read AI, Azure and transcription keys | yes, with the session token | no | no | no |
| Google refresh token, Anki token | never sent to any page | no | no | no |
| Change anything (non-GET `/api/*`) | yes, with the session token | no | no | only its own routes, with its own token |
| Sign-in, device id, Anki settings | not from the page | no | no | no |

| Your own data | Where it lives | Who can read it |
|---|---|---|
| Library, transcripts, words, settings, keys | the device | you (and Tamkeen's page) |
| The same, synced | your own Google Drive (hidden app folder) | you; never Tamkeen's developer |
| Web app storage | the browser, at `christiangilkey.github.io` | that address, which other sites of Chris's share (a known risk; moving is "later") |
| Web app fetches | Cloudflare go-between server | sees addresses and internet address; stores nothing |
