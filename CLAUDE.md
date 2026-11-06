# Tamkeen: rules for every chat

Read `HANDOFF.md` first. Several chats edit this checkout at once: check `git status` before editing shared files.

**When you finish a piece of work, message "Temkeen Main Chat"** (SendMessage; ListAgents shows it). Give
what it does in one or two plain sentences, the commit hashes (or the files changed if not committed),
whether pytest and the JS tests pass, and what's unfinished. That chat commits and releases; without the
message new work gets lost between versions. Never tag or release yourself.

## Access control matrix (who may do what)

Keep this true when you add a feature: enforce it where marked (database rules, the desktop server), never only
in the page. The online part is `supabase/v8-safety.sql` (written 2026-11-06; **not yet applied to the live
database**, which still has the v7 rules until the owner applies it). Full rules: HANDOFF "Online safety" and
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
