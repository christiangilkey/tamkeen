-- Schema v8: safety and privacy for the online features (Friends, chat, guilds, game sharing).
-- Run once in the Supabase SQL editor, after schema.sql and v4-v6 (it also does what the two
-- v7 files do, so those needn't be run first). Safe to re-run. It runs as one piece: if any
-- statement fails, nothing at all is changed. The last statement shows a one-row summary.
--
-- What it does, in short (each numbered part below has its own plain comment):
--   - A "private" schema the API can't reach, for the rules' helper functions and the limits'
--     bookkeeping. The old helpers in "public" (are_friends, are_connected, in_guild, ...) could be
--     called by anyone with the app's public key to ask "are these two friends?"; they are removed.
--   - Blocking: a blocked person can't message you, send you friend requests, see your card,
--     online status or game team, challenge you, or send you gifts. Enforced here, not in the app.
--   - Reporting: a report keeps a copy of the reported message (messages disappear), readable
--     only by the admin in the dashboard.
--   - Profiles: strangers can no longer list everyone's profiles; you find someone by typing their
--     exact username (find_user). Friends, guild-mates and pending requests still see each other.
--   - Only friends can message you (guild-mates who aren't friends no longer can).
--   - Limits: 20 friend requests a day, 500 messages (20 MB) a day, smaller messages, limits on
--     uploads, at most 5 guilds founded each; and the server, not the app, sets every "created at".
--   - The game's shared rows are checked: creature types from the game's fixed list, sane sizes.
--   - Delete my account (delete_my_account), and an admin-only delete of any account by its id.
--   - A nightly clean-up job (pg_cron): messages after 30 days, battle results after 60, opened
--     gifts after 30, and the files nobody needs any more.
--
-- Apps older than this one keep working against it, except for two things: they can't find new
-- friends by username (they look in the profiles table, which strangers can no longer read), and
-- they can't message guild-mates who aren't friends. So run this only once the app version that
-- calls find_user (web/js/social.js) is what people have installed.
--
-- After running it, don't run schema.sql, v4-guilds.sql or v5-game.sql again on their own: they
-- would put back the old, open rules. (If you ever do, run this file again straight after.)
-- Self-test: supabase/test_rls_safety.sql (and the three older test_rls*.sql, updated for v8).


-- ======================================================================= 0. the v6 and v7 changes
-- (v6-game-card.sql, already applied; repeated so part 12's checks always have their columns)
alter table public.game_profiles add column if not exists language text check (language is null or length(language) <= 8);
alter table public.game_profiles add column if not exists xp_day text not null default '' check (length(xp_day) <= 10);
alter table public.game_profiles add column if not exists xp_today integer not null default 0 check (xp_today between 0 and 10000000);
alter table public.game_profiles add column if not exists showcase jsonb check (showcase is null or octet_length(showcase::text) < 1000);
-- (v7-flame-streak.sql) the flashcard streak shown in friends' lists;
alter table public.game_profiles add column if not exists streak integer not null default 0 check (streak between 0 and 100000);
alter table public.game_profiles add column if not exists streak_until timestamptz;
-- (v7-shared-text.sql) the voice storage also takes the gzipped transcripts sent with shared items.
update storage.buckets
set allowed_mime_types = array['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'application/gzip']
where id = 'voice';


-- ======================================================================= 1. the private schema
-- Supabase's API only offers the "public" schema to the internet, so functions here can't be
-- called through it. Signed-in users still need to be allowed to *use* them, because the
-- row-level security rules run as the signed-in user and call them.
create schema if not exists private;
grant usage on schema private to authenticated, service_role;

-- Bookkeeping for the daily limits: one row per friend request, message, ... sent in the last two
-- days (the nightly job deletes older ones). Counting these, not the rows themselves, means that
-- cancelling a request and sending it again still counts.
create table if not exists private.rate_log (
  user_id  uuid not null references public.profiles(id) on delete cascade,
  kind     text not null,
  bytes    integer not null default 0,
  at       timestamptz not null default now()
);
create index if not exists rate_log_user on private.rate_log (user_id, kind, at);

-- Files in storage that should go but that SQL itself mustn't delete (Supabase says to delete
-- files through its Storage API, or the file stays behind). The nightly job asks the Storage API
-- to delete them when it has a key for it (see part 14); otherwise the apps or the admin do.
create table if not exists private.files_to_remove (
  bucket     text not null,
  name       text not null,
  why        text not null default '',
  queued_at  timestamptz not null default now(),
  tried_at   timestamptz,
  primary key (bucket, name)
);

-- Things the admin has to finish by hand (for example a sign-in account the database couldn't remove).
create table if not exists private.admin_todo (
  id    bigint generated always as identity primary key,
  what  text not null,
  at    timestamptz not null default now()
);

alter table private.rate_log enable row level security;
alter table private.files_to_remove enable row level security;
alter table private.admin_todo enable row level security;
revoke all on all tables in schema private from public, anon, authenticated;


-- ======================================================================= 2. blocks and reports
-- blocks: who blocked whom. Only the person who blocked can see the row.
create table if not exists public.blocks (
  blocker     uuid not null references public.profiles(id) on delete cascade,
  blocked     uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (blocker, blocked),
  check (blocker <> blocked)
);
create index if not exists blocks_blocked on public.blocks (blocked);
alter table public.blocks enable row level security;
revoke all on public.blocks from anon, authenticated;
grant select on public.blocks to authenticated;  -- changes only through block_user / unblock_user
drop policy if exists "see who I blocked" on public.blocks;
create policy "see who I blocked" on public.blocks
  for select to authenticated using (blocker = (select auth.uid()));

-- reports: a person or a message reported to the admin. Nobody can read these through the app;
-- the admin reads them in the dashboard (Table Editor -> reports). `snapshot` is a copy of the
-- reported message and the person's profile at the time, because messages disappear.
create table if not exists public.reports (
  id          uuid primary key default gen_random_uuid(),
  reporter    uuid references public.profiles(id) on delete set null,
  reported    uuid references public.profiles(id) on delete set null,
  reason      text not null check (reason in ('spam', 'harassment', 'hate', 'sexual', 'underage', 'danger', 'other')),
  details     text not null default '' check (char_length(details) <= 1000),
  message_id  uuid,
  snapshot    jsonb check (snapshot is null or octet_length(snapshot::text) < 300000),
  created_at  timestamptz not null default now(),
  handled_at  timestamptz,                                    -- the admin fills these two in
  outcome     text not null default '' check (char_length(outcome) <= 2000)
);
create index if not exists reports_open on public.reports (created_at) where handled_at is null;
alter table public.reports enable row level security;
revoke all on public.reports from anon, authenticated;       -- no rules at all: only the admin


-- ======================================================================= 3. helper functions
-- All in "private", and each answers only about the person asking (auth.uid()), so even a call
-- from inside the database can't be used to learn about two other people.

-- True when a and b are friends (an accepted request).
create or replace function private.are_friends(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) in (a, b) and exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester = a and f.addressee = b) or (f.requester = b and f.addressee = a)));
$$;

-- True when either of the two has blocked the other. (Used only inside the functions below.)
create or replace function private.blocked_between(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.blocks k
                 where (k.blocker = a and k.blocked = b) or (k.blocker = b and k.blocked = a));
$$;

-- True when two different people share at least one guild.
create or replace function private.same_guild(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) in (a, b) and a <> b and exists (
    select 1 from public.guild_members x join public.guild_members y on y.guild_id = x.guild_id
    where x.user_id = a and y.user_id = b);
$$;

-- True when `person` is in guild g; answered only about yourself or a guild you are in.
create or replace function private.in_guild(g uuid, person uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.guild_members m where m.guild_id = g and m.user_id = person)
     and (person = (select auth.uid())
          or exists (select 1 from public.guild_members m where m.guild_id = g and m.user_id = (select auth.uid())));
$$;

-- True when I am a member of shared folder f.
create or replace function private.is_member(f uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.shared_folder_members m where m.folder_id = f and m.user_id = (select auth.uid()));
$$;

-- Friends or guild-mates, and neither has blocked the other: who sees whose card, online
-- status and game team, and who may battle or send gifts.
create or replace function private.are_connected(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) in (a, b) and a <> b
     and (private.are_friends(a, b) or private.same_guild(a, b))
     and not private.blocked_between(a, b);
$$;

-- May I message `other`? Only a friend, and only without a block either way.
create or replace function private.can_message(other uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null
     and private.are_friends((select auth.uid()), other)
     and not private.blocked_between((select auth.uid()), other);
$$;

-- May I send `other` a friend request? Not myself, and no block either way.
create or replace function private.can_request(other uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and other is not null and other <> (select auth.uid())
     and not private.blocked_between((select auth.uid()), other);
$$;

-- Is a voice-storage folder ("<id A>_<id B>") one of my conversations?
create or replace function private.in_conversation(folder text) returns boolean
language sql stable set search_path = '' as $$
  select (select auth.uid())::text in (split_part(folder, '_', 1), split_part(folder, '_', 2));
$$;

-- `path` if it lies in the conversation folder of a and b, else null. The clean-up functions
-- hand back only such paths, so a message can't point someone's app at their other chats' files.
create or replace function private.pair_path(path text, a uuid, b uuid) returns text
language sql immutable set search_path = '' as $$
  select case when path is not null and path !~ '\.\.'
               and split_part(path, '/', 1) in (a::text || '_' || b::text, b::text || '_' || a::text)
              then path end;
$$;

-- May I add a file to this voice folder? It must be my conversation with a friend I haven't
-- blocked (and who hasn't blocked me), and the folder must have had fewer than 400 files and
-- 100 MB added in the last day.
create or replace function private.can_add_voice(folder text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  other uuid;
  n integer;
  used bigint;
begin
  if me is null or folder is null
     or folder !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  if split_part(folder, '_', 1) = me::text then other := split_part(folder, '_', 2)::uuid;
  elsif split_part(folder, '_', 2) = me::text then other := split_part(folder, '_', 1)::uuid;
  else return false;
  end if;
  if not private.can_message(other) then return false; end if;
  select count(*), coalesce(sum(case when o.metadata->>'size' ~ '^[0-9]{1,12}$' then (o.metadata->>'size')::bigint else 0 end), 0)
    into n, used
  from storage.objects o
  where o.bucket_id = 'voice' and o.name like folder || '/%' and o.created_at > now() - interval '1 day';
  return n < 400 and used < 104857600;
end $$;

-- May I add another profile photo? At most 10 files in my own photo folder (the app deletes
-- the old ones each time).
create or replace function private.avatar_slots_ok() returns boolean
language sql stable security definer set search_path = '' as $$
  select (select count(*) from storage.objects o
          where o.bucket_id = 'avatars' and split_part(o.name, '/', 1) = (select auth.uid())::text) < 10;
$$;

-- May I see `other`'s profile (username and photo)? Yes for myself, guild-mates and people I
-- blocked (so I can unblock them); and, unless they blocked me, for anyone I have a friend
-- request, friendship, guild invitation, quiz invitation, battle, gift, message or shared
-- folder with. Strangers find each other only through find_user.
create or replace function private.knows(other uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare me uuid := auth.uid();
begin
  if me is null or other is null then return false; end if;
  if other = me or private.same_guild(me, other) then return true; end if;
  if exists (select 1 from public.blocks k where k.blocker = me and k.blocked = other) then return true; end if;
  if exists (select 1 from public.blocks k where k.blocker = other and k.blocked = me) then return false; end if;
  return exists (select 1 from public.friendships f where (f.requester = me and f.addressee = other) or (f.requester = other and f.addressee = me))
      or exists (select 1 from public.guild_invites i where (i.inviter = me and i.invitee = other) or (i.inviter = other and i.invitee = me))
      or exists (select 1 from public.game_invites i where (i.host = me and i.invitee = other) or (i.host = other and i.invitee = me))
      or exists (select 1 from public.battles t where (t.challenger = me and t.defender = other) or (t.challenger = other and t.defender = me))
      or exists (select 1 from public.gifts t where (t.sender = me and t.recipient = other) or (t.sender = other and t.recipient = me))
      or exists (select 1 from public.messages m where (m.sender = me and m.recipient = other) or (m.sender = other and m.recipient = me))
      or exists (select 1 from public.shared_folder_members x join public.shared_folder_members y on y.folder_id = x.folder_id
                 where x.user_id = me and y.user_id = other);
end $$;

-- The daily limits. note_use counts what this person did in the last 24 hours and refuses with
-- the error "daily_limit" (details: what, hint: how many) once `most` is reached, or once
-- `most_bytes` would be passed; otherwise it notes this one.
create or replace function private.note_use(actor uuid, what text, most integer, size integer default 0, most_bytes bigint default 0)
returns void language plpgsql security definer set search_path = '' as $$
declare
  n integer;
  used bigint;
begin
  select count(*), coalesce(sum(r.bytes), 0) into n, used
  from private.rate_log r where r.user_id = actor and r.kind = what and r.at > now() - interval '1 day';
  if n >= most or (most_bytes > 0 and used + size > most_bytes) then
    raise exception using errcode = 'P0001', message = 'daily_limit', detail = what, hint = most::text;
  end if;
  insert into private.rate_log (user_id, kind, bytes) values (actor, what, size);
end $$;

-- The same as a trigger: daily_limit('<what>', '<most>' [, '<most bytes>']). Only people using
-- the app are limited; the admin and the database's own jobs (no signed-in user) are not.
create or replace function private.daily_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  most_bytes bigint := coalesce(nullif(tg_argv[2], '')::bigint, 0);
begin
  if actor is null then return new; end if;
  perform private.note_use(actor, tg_argv[0], tg_argv[1]::integer,
                           case when most_bytes > 0 then octet_length(to_jsonb(new)::text) else 0 end, most_bytes);
  return new;
end $$;

-- The server's clock decides when something was made, never the app (so a daily limit can't be
-- dodged by sending an old date).
create or replace function private.server_time() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.created_at := now();
  return new;
end $$;
create or replace function private.server_updated_time() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- Who may run what. Functions the rules and checks call: signed-in users (never anon). The
-- bookkeeping ones: nobody but the database itself.
revoke all on all functions in schema private from public, anon;
grant execute on function private.are_friends(uuid, uuid), private.same_guild(uuid, uuid), private.in_guild(uuid, uuid),
  private.is_member(uuid), private.are_connected(uuid, uuid), private.can_message(uuid), private.can_request(uuid),
  private.in_conversation(text), private.can_add_voice(text), private.avatar_slots_ok(), private.knows(uuid)
  to authenticated, service_role;
revoke all on function private.blocked_between(uuid, uuid), private.note_use(uuid, text, integer, integer, bigint),
  private.pair_path(text, uuid, uuid) from authenticated;


-- ======================================================================= 4. profiles
-- Strangers can no longer list the profiles table: only yourself and the people private.knows()
-- allows. Anyone else is found by typing their exact username (find_user).
drop policy if exists "profiles readable by signed-in users" on public.profiles;
drop policy if exists "see yourself and people you know" on public.profiles;
create policy "see yourself and people you know" on public.profiles
  for select to authenticated using (id = (select auth.uid()) or private.knows(id));

-- Find one person by their exact username (capitals don't matter; a leading @ is ignored).
-- Returns only their id, username and photo, never the email or dates. Someone who blocked you
-- can't be found.
create or replace function public.find_user(name text) returns table (id uuid, username text, avatar_path text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.username::text, p.avatar_path
  from public.profiles p
  where (select auth.uid()) is not null and p.username is not null
    and lower(p.username::text) = lower(ltrim(btrim(coalesce(name, '')), '@'))
    and not exists (select 1 from public.blocks k where k.blocker = p.id and k.blocked = (select auth.uid()))
  limit 1;
$$;
revoke all on function public.find_user(text) from public, anon;
grant execute on function public.find_user(text) to authenticated;

-- A profile photo must be in its owner's own folder (no pointing at someone else's photo).
-- ("not valid": rows already there aren't checked now, every change from now on is.)
alter table public.profiles drop constraint if exists avatar_in_own_folder;
alter table public.profiles add constraint avatar_in_own_folder
  check (avatar_path is null or avatar_path like id::text || '/%') not valid;


-- ======================================================================= 5. friends and blocks
drop policy if exists "send friend request" on public.friendships;
create policy "send friend request" on public.friendships
  for insert to authenticated
  with check (requester = (select auth.uid()) and status = 'pending' and private.can_request(addressee));

drop trigger if exists friendships_limit on public.friendships;
create trigger friendships_limit before insert on public.friendships
  for each row execute function private.daily_limit('friend_request', '20');

-- Accepting goes through a function so the only possible change is pending -> accepted (and
-- never between two people where one has blocked the other).
create or replace function public.accept_friend(request_id uuid) returns void
language sql security definer set search_path = '' as $$
  update public.friendships f set status = 'accepted'
  where f.id = request_id and f.addressee = (select auth.uid()) and f.status = 'pending'
    and not private.blocked_between(f.requester, f.addressee);
$$;
revoke all on function public.accept_friend(uuid) from public, anon;
grant execute on function public.accept_friend(uuid) to authenticated;

-- Send a friend request by exact username, in one step. Answers {status, username}, where
-- status says what happened:
--   sent | accepted (they had asked you, so now you're friends) | already_friends | already_sent
--   | not_found | self | blocked (you blocked them) | no_username (choose your own first)
-- and username is theirs as they wrote it. Over the daily limit it fails with "daily_limit".
create or replace function public.send_friend_request(name text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := auth.uid();
  v_them uuid;
  v_name text;
  v_prior record;
begin
  if v_me is null then raise exception 'Not signed in'; end if;
  if not exists (select 1 from public.profiles p where p.id = v_me and p.username is not null) then
    return jsonb_build_object('status', 'no_username');
  end if;
  select f.id, f.username into v_them, v_name from public.find_user(name) f;
  if v_them is null then return jsonb_build_object('status', 'not_found'); end if;
  if v_them = v_me then return jsonb_build_object('status', 'self', 'username', v_name); end if;
  if exists (select 1 from public.blocks k where k.blocker = v_me and k.blocked = v_them) then
    return jsonb_build_object('status', 'blocked', 'username', v_name);
  end if;
  select f.id, f.requester, f.status into v_prior from public.friendships f
  where (f.requester = v_me and f.addressee = v_them) or (f.requester = v_them and f.addressee = v_me)
  limit 1;
  if found then
    if v_prior.status = 'accepted' then return jsonb_build_object('status', 'already_friends', 'username', v_name); end if;
    if v_prior.requester = v_me then return jsonb_build_object('status', 'already_sent', 'username', v_name); end if;
    update public.friendships f set status = 'accepted' where f.id = v_prior.id;
    return jsonb_build_object('status', 'accepted', 'username', v_name);
  end if;
  insert into public.friendships (requester, addressee) values (v_me, v_them);
  return jsonb_build_object('status', 'sent', 'username', v_name);
end $$;
revoke all on function public.send_friend_request(text) from public, anon;
grant execute on function public.send_friend_request(text) to authenticated;

-- Block someone. You stop being friends, any requests and invitations between you go, and gifts
-- they sent you that you haven't opened are removed. Their messages stay until they disappear
-- as usual (so a report can still copy them).
create or replace function public.block_user(person uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'Not signed in'; end if;
  if person is null or person = v_me or not exists (select 1 from public.profiles p where p.id = person) then return; end if;
  insert into public.blocks (blocker, blocked) values (v_me, person) on conflict do nothing;
  delete from public.friendships f where (f.requester = v_me and f.addressee = person) or (f.requester = person and f.addressee = v_me);
  delete from public.guild_invites i where (i.inviter = v_me and i.invitee = person) or (i.inviter = person and i.invitee = v_me);
  delete from public.game_invites i where (i.host = v_me and i.invitee = person) or (i.host = person and i.invitee = v_me);
  delete from public.gifts t where t.sender = person and t.recipient = v_me and t.claimed_at is null;
end $$;

create or replace function public.unblock_user(person uuid) returns void
language sql security definer set search_path = '' as $$
  delete from public.blocks k where k.blocker = (select auth.uid()) and k.blocked = person;
$$;

-- The people I blocked, newest first, for the list in Settings.
create or replace function public.my_blocks() returns table (user_id uuid, username text, avatar_path text, blocked_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select k.blocked, p.username::text, p.avatar_path, k.created_at
  from public.blocks k join public.profiles p on p.id = k.blocked
  where k.blocker = (select auth.uid())
  order by k.created_at desc;
$$;

drop trigger if exists blocks_limit on public.blocks;
create trigger blocks_limit before insert on public.blocks
  for each row execute function private.daily_limit('block', '200');

revoke all on function public.block_user(uuid), public.unblock_user(uuid), public.my_blocks() from public, anon;
grant execute on function public.block_user(uuid), public.unblock_user(uuid), public.my_blocks() to authenticated;

-- Report a person, or a message they sent you. The server copies the message itself (and the
-- person's username, photo address and card), so the copy is what was really sent. 20 a day.
--   why: spam | harassment | hate | sexual | underage | danger | other
create or replace function public.report_user(person uuid, why text, note text default '', about_message uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := auth.uid();
  v_msg record;
  v_snap jsonb := '{}'::jsonb;
  v_id uuid;
begin
  if v_me is null then raise exception 'Not signed in'; end if;
  if person is null or person = v_me or not exists (select 1 from public.profiles p where p.id = person) then
    raise exception using errcode = 'P0001', message = 'bad_report';
  end if;
  perform private.note_use(v_me, 'report', 20);
  if about_message is not null then
    select m.kind, m.body, m.payload, m.created_at into v_msg
    from public.messages m where m.id = about_message and m.sender = person and m.recipient = v_me;
    if found then
      v_snap := jsonb_build_object('message', jsonb_build_object(
        'kind', v_msg.kind, 'body', v_msg.body, 'sent_at', v_msg.created_at,
        'payload', case when v_msg.payload is null or octet_length(v_msg.payload::text) < 200000 then v_msg.payload
                        else jsonb_build_object('too_large_to_copy', true, 'title', v_msg.payload->'media'->>'title') end));
    else
      v_snap := jsonb_build_object('message_missing', true);
    end if;
  end if;
  v_snap := v_snap || jsonb_build_object(
    'profile', (select jsonb_build_object('username', p.username::text, 'avatar_path', p.avatar_path) from public.profiles p where p.id = person),
    'card', (select jsonb_build_object('studying', s.studying, 'message', s.message) from public.statuses s
             where s.user_id = person and private.are_connected(v_me, person)));
  insert into public.reports (reporter, reported, reason, details, message_id, snapshot)
  values (v_me, person, coalesce(why, 'other'), left(coalesce(note, ''), 1000), about_message, v_snap)
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.report_user(uuid, text, text, uuid) from public, anon;
grant execute on function public.report_user(uuid, text, text, uuid) to authenticated;


-- ======================================================================= 6. messages: friends only
drop policy if exists "message a friend" on public.messages;
create policy "message a friend" on public.messages
  for insert to authenticated
  with check (sender = (select auth.uid()) and read_at is null and private.can_message(recipient));

drop trigger if exists messages_limit on public.messages;
create trigger messages_limit before insert on public.messages
  for each row execute function private.daily_limit('message', '500', '20971520');

-- A message's extra data is at most 512 KB (it was 1 MB; transcripts now travel as files), and
-- a voice note's file must be in the two people's own folder.
alter table public.messages drop constraint if exists messages_payload_size;
alter table public.messages add constraint messages_payload_size
  check (payload is null or octet_length(payload::text) < 524288) not valid;
alter table public.messages drop constraint if exists messages_voice_path;
alter table public.messages add constraint messages_voice_path
  check (kind <> 'voice' or coalesce(private.pair_path(payload->>'path', sender, recipient) is not null, false)) not valid;
grant execute on function private.pair_path(text, uuid, uuid) to authenticated;  -- (the check above runs as the sender)

-- Delete what I have already seen from this friend (not shared words: those wait for a decision).
-- Returns the voice files to delete, only from our own folder.
create or replace function public.clear_seen(friend uuid) returns setof text
language sql security definer set search_path = '' as $$
  with gone as (
    delete from public.messages m
    where m.recipient = (select auth.uid()) and m.sender = friend and m.read_at is not null and m.kind <> 'share'
    returning m.sender, m.recipient, m.kind, m.payload
  )
  select p from (select private.pair_path(payload->>'path', sender, recipient) as p from gone where kind = 'voice') x
  where p is not null;
$$;

-- Remove one message sent to me (after adding shared words, or dismissing them); returns its
-- files to delete (a voice note's, a shared item's transcript, shared words' clips), only from
-- our own folder.
create or replace function public.dismiss_message(message_id uuid) returns setof text
language sql security definer set search_path = '' as $$
  with gone as (
    delete from public.messages m where m.id = message_id and m.recipient = (select auth.uid())
    returning m.sender, m.recipient, m.kind, m.payload
  ), paths as (
    select private.pair_path(payload->>'path', sender, recipient) as p from gone where kind = 'voice'
    union all
    select private.pair_path(payload->'media'->>'transcript_path', sender, recipient) from gone where kind = 'share'
    union all
    select private.pair_path(w->>'clip', sender, recipient) from gone,
      jsonb_array_elements(case when jsonb_typeof(payload->'words') = 'array' then payload->'words' else '[]'::jsonb end) w
    where kind = 'share'
  )
  select distinct p from paths where p is not null;
$$;

-- Clear my conversations of anything older than 30 days, opened or not (the nightly job does
-- this for everyone too). Returns the files to delete: those of the messages cleared, and any
-- file in my conversations' folders older than 30 days (the nightly job's messages leave
-- theirs behind when it has no Storage key; see part 14).
create or replace function public.purge_old_messages() returns setof text
language sql security definer set search_path = '' as $$
  with gone as (
    delete from public.messages m
    where (select auth.uid()) in (m.sender, m.recipient) and m.created_at < now() - interval '30 days'
    returning m.sender, m.recipient, m.kind, m.payload
  ), paths as (
    select private.pair_path(payload->>'path', sender, recipient) as p from gone where kind = 'voice'
    union all
    select private.pair_path(payload->'media'->>'transcript_path', sender, recipient) from gone where kind = 'share'
    union all
    select private.pair_path(w->>'clip', sender, recipient) from gone,
      jsonb_array_elements(case when jsonb_typeof(payload->'words') = 'array' then payload->'words' else '[]'::jsonb end) w
    where kind = 'share'
    union all
    select o.name from storage.objects o
    where o.bucket_id = 'voice' and o.created_at < now() - interval '30 days'
      and private.in_conversation(split_part(o.name, '/', 1))
  )
  select distinct p from paths where p is not null;
$$;

revoke all on function public.clear_seen(uuid), public.dismiss_message(uuid), public.purge_old_messages() from public, anon;
grant execute on function public.clear_seen(uuid), public.dismiss_message(uuid), public.purge_old_messages() to authenticated;


-- ======================================================================= 7. file storage
-- Voice notes, word clips and shared transcripts: only the two people of a conversation see or
-- delete them; adding one needs a friendship (no block) and the folder's daily allowance.
drop policy if exists "voice: read own conversations" on storage.objects;
create policy "voice: read own conversations" on storage.objects
  for select to authenticated
  using (bucket_id = 'voice' and private.in_conversation((storage.foldername(name))[1]));
drop policy if exists "voice: add to own conversations" on storage.objects;
create policy "voice: add to own conversations" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'voice' and private.can_add_voice((storage.foldername(name))[1]));
drop policy if exists "voice: remove from own conversations" on storage.objects;
create policy "voice: remove from own conversations" on storage.objects
  for delete to authenticated
  using (bucket_id = 'voice' and private.in_conversation((storage.foldername(name))[1]));

-- Profile photos: your own folder only, at most 10 files there.
drop policy if exists "avatars: add own" on storage.objects;
create policy "avatars: add own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text
              and private.avatar_slots_ok());


-- ======================================================================= 8. cards, online status, game
-- Friends and guild-mates still see each other's card, online status and game team; a block
-- (either way) hides them.
drop policy if exists "friends see status" on public.statuses;
create policy "friends see status" on public.statuses
  for select to authenticated
  using (user_id = (select auth.uid()) or private.are_connected((select auth.uid()), user_id));

drop policy if exists "connected people see presence" on public.presence;
create policy "connected people see presence" on public.presence
  for select to authenticated
  using (user_id = (select auth.uid()) or private.are_connected((select auth.uid()), user_id));

create or replace function public.seen_ago(people uuid[]) returns table (user_id uuid, seconds double precision)
language sql stable security definer set search_path = '' as $$
  select p.user_id, extract(epoch from (now() - p.last_seen))::double precision
  from public.presence p
  where p.user_id = any(people)
    and (p.user_id = (select auth.uid()) or private.are_connected((select auth.uid()), p.user_id));
$$;
revoke all on function public.seen_ago(uuid[]) from public, anon;
grant execute on function public.seen_ago(uuid[]) to authenticated;

drop policy if exists "connected players see game profile" on public.game_profiles;
create policy "connected players see game profile" on public.game_profiles
  for select to authenticated
  using (user_id = (select auth.uid()) or private.are_connected((select auth.uid()), user_id));

drop policy if exists "report a battle with a connection" on public.battles;
create policy "report a battle with a connection" on public.battles
  for insert to authenticated with check (
    challenger = (select auth.uid()) and seen = false and private.are_connected(challenger, defender)
    and (select count(*) from public.battles b where b.challenger = (select auth.uid()) and b.created_at > now() - interval '1 day') < 60);

drop policy if exists "give to a connection" on public.gifts;
create policy "give to a connection" on public.gifts
  for insert to authenticated with check (
    sender = (select auth.uid()) and claimed_at is null and private.are_connected(sender, recipient)
    and (select count(*) from public.gifts g where g.sender = (select auth.uid()) and g.created_at > now() - interval '1 day') < 10);


-- ======================================================================= 9. guilds
drop policy if exists "see memberships of people you know" on public.guild_members;
create policy "see memberships of people you know" on public.guild_members
  for select to authenticated
  using (user_id = (select auth.uid()) or private.in_guild(guild_id, (select auth.uid()))
         or private.are_friends((select auth.uid()), user_id));

drop policy if exists "invite a friend to my guild" on public.guild_invites;
create policy "invite a friend to my guild" on public.guild_invites
  for insert to authenticated
  with check (inviter = (select auth.uid()) and private.in_guild(guild_id, (select auth.uid()))
              and private.are_friends(inviter, invitee) and not private.in_guild(guild_id, invitee));

drop trigger if exists guild_invites_limit on public.guild_invites;
create trigger guild_invites_limit before insert on public.guild_invites
  for each row execute function private.daily_limit('guild_invite', '100');

-- Found a guild (at most 5 each). Raises "guild_limit" past that.
create or replace function public.create_guild(guild_name text, guild_tag text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare new_id uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if (select count(*) from public.guilds g where g.owner = auth.uid()) >= 5 then
    raise exception using errcode = 'P0001', message = 'guild_limit';
  end if;
  insert into public.guilds (name, tag, owner) values (btrim(guild_name), btrim(guild_tag), auth.uid()) returning id into new_id;
  insert into public.guild_members (user_id, guild_id) values (auth.uid(), new_id);
  return new_id;
end $$;

-- Join with an invitation (50 members at most; the guild is locked while counting, so two
-- people joining at once can't pass 50).
create or replace function public.accept_guild_invite(invite_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare g uuid;
begin
  select i.guild_id into g from public.guild_invites i where i.id = invite_id and i.invitee = auth.uid();
  if g is null then raise exception 'That invitation is no longer available'; end if;
  perform 1 from public.guilds x where x.id = g for update;
  if (select count(*) from public.guild_members m where m.guild_id = g) >= 50 then raise exception 'That guild is full'; end if;
  insert into public.guild_members (user_id, guild_id) values (auth.uid(), g) on conflict do nothing;
  delete from public.guild_invites i where i.guild_id = g and i.invitee = auth.uid();
  return g;
end $$;

-- Leave a guild. If the founder leaves, the longest-standing member takes over; the last person
-- leaving closes the guild.
create or replace function public.leave_guild(g uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare heir uuid;
begin
  perform 1 from public.guilds x where x.id = g for update;
  if not exists (select 1 from public.guild_members m where m.guild_id = g and m.user_id = auth.uid()) then return; end if;
  delete from public.guild_members m where m.guild_id = g and m.user_id = auth.uid();
  if (select x.owner from public.guilds x where x.id = g) = auth.uid() then
    select m.user_id into heir from public.guild_members m where m.guild_id = g order by m.joined_at, m.user_id limit 1;
    if heir is null then delete from public.guilds x where x.id = g;
    else update public.guilds x set owner = heir where x.id = g;
    end if;
  end if;
end $$;

revoke all on function public.create_guild(text, text), public.accept_guild_invite(uuid), public.leave_guild(uuid) from public, anon;
grant execute on function public.create_guild(text, text), public.accept_guild_invite(uuid), public.leave_guild(uuid) to authenticated;


-- ======================================================================= 10. shared folders, quiz invites
drop policy if exists "members see folder" on public.shared_folders;
create policy "members see folder" on public.shared_folders
  for select to authenticated using (private.is_member(id) or owner = (select auth.uid()));
drop policy if exists "members rename folder" on public.shared_folders;
create policy "members rename folder" on public.shared_folders
  for update to authenticated using (private.is_member(id)) with check (private.is_member(id));
drop policy if exists "members see members" on public.shared_folder_members;
create policy "members see members" on public.shared_folder_members
  for select to authenticated using (private.is_member(folder_id));
drop policy if exists "add members" on public.shared_folder_members;
create policy "add members" on public.shared_folder_members
  for insert to authenticated with check (
    (user_id = (select auth.uid()) and exists (select 1 from public.shared_folders f where f.id = folder_id and f.owner = (select auth.uid())))
    or (private.is_member(folder_id) and private.are_friends((select auth.uid()), user_id)));
drop policy if exists "members read words" on public.shared_words;
create policy "members read words" on public.shared_words
  for select to authenticated using (private.is_member(folder_id));
drop policy if exists "members add words" on public.shared_words;
create policy "members add words" on public.shared_words
  for insert to authenticated with check (private.is_member(folder_id) and added_by = (select auth.uid()));
drop policy if exists "members edit words" on public.shared_words;
create policy "members edit words" on public.shared_words
  for update to authenticated using (private.is_member(folder_id)) with check (private.is_member(folder_id));

drop trigger if exists shared_folders_limit on public.shared_folders;
create trigger shared_folders_limit before insert on public.shared_folders
  for each row execute function private.daily_limit('folder', '20');
drop trigger if exists shared_words_limit on public.shared_words;
create trigger shared_words_limit before insert on public.shared_words
  for each row execute function private.daily_limit('shared_word', '2000');

drop policy if exists "invite a friend" on public.game_invites;
create policy "invite a friend" on public.game_invites
  for insert to authenticated with check (host = (select auth.uid()) and private.are_friends(host, invitee));
drop trigger if exists game_invites_limit on public.game_invites;
create trigger game_invites_limit before insert on public.game_invites
  for each row execute function private.daily_limit('game_invite', '100');
alter table public.game_invites drop constraint if exists game_invite_title_length;
alter table public.game_invites add constraint game_invite_title_length check (char_length(title) <= 120) not valid;


-- ======================================================================= 11. the server sets the time
do $$
declare t text;
begin
  foreach t in array array['messages', 'gifts', 'battles', 'friendships', 'guild_invites', 'game_invites',
                           'shared_folders', 'shared_words', 'blocks', 'reports'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_server_time', t);
    execute format('create trigger %I before insert on public.%I for each row execute function private.server_time()',
                   t || '_server_time', t);
  end loop;
  foreach t in array array['statuses', 'game_profiles'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_server_time', t);
    execute format('create trigger %I before insert on public.%I for each row execute function private.server_updated_time()',
                   t || '_server_time', t);
  end loop;
end $$;


-- ======================================================================= 12. the game's shared rows (M11)
-- What a friend's app receives is checked here too (the app checks it as well): every creature
-- of the "team" and the shown-off creature must have a type from the game's fixed list
-- (web/js/game/data.js TYPES; tests/js/online-safety.test.mjs fails if the two lists differ),
-- and names, items and moves must look like the game's own.
create or replace function private.game_types() returns text[]
language sql immutable set search_path = '' as $$
  select array['ember', 'tide', 'grove', 'spark', 'stone', 'dusk'];
$$;

create or replace function private.valid_creature(c jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare
  e record;
begin
  if c is null or jsonb_typeof(c) <> 'object' or octet_length(c::text) > 2500 then return false; end if;
  if jsonb_typeof(c->'seed') is distinct from 'number' then return false; end if;
  if not coalesce((c->>'type') = any (private.game_types()), false) then return false; end if;
  if c ? 'growth' then
    if jsonb_typeof(c->'growth') <> 'number' then return false; end if;
    if (c->>'growth')::numeric < 0 or (c->>'growth')::numeric > 10 then return false; end if;
  end if;
  if c ? 'variant' and jsonb_typeof(c->'variant') <> 'null' then
    if not coalesce((c->>'variant') = any (array['twin', 'nocturne', 'champion']), false) then return false; end if;
  end if;
  if c ? 'partnerHue' and jsonb_typeof(c->'partnerHue') not in ('number', 'null') then return false; end if;
  if c ? 'name' then
    if jsonb_typeof(c->'name') <> 'string' then return false; end if;
    if char_length(c->>'name') > 20 then return false; end if;
  end if;
  if c ? 'show' and jsonb_typeof(c->'show') <> 'null' then
    if jsonb_typeof(c->'show') <> 'string' then return false; end if;
    if (c->>'show') !~ '^[a-z_]{1,20}$' then return false; end if;
  end if;
  if c ? 'equipped' then
    if jsonb_typeof(c->'equipped') <> 'object' then return false; end if;
    for e in select key, value from jsonb_each(c->'equipped') loop
      if e.key !~ '^[a-z_]{1,20}$' or jsonb_typeof(e.value) <> 'string' then return false; end if;
      if (e.value #>> '{}') !~ '^[a-z0-9_/-]{1,60}$' then return false; end if;
    end loop;
  end if;
  if c ? 'loadout' then
    if jsonb_typeof(c->'loadout') <> 'array' then return false; end if;
    if jsonb_array_length(c->'loadout') > 8 then return false; end if;
    for e in select value from jsonb_array_elements(c->'loadout') loop
      if jsonb_typeof(e.value) <> 'string' then return false; end if;
      if (e.value #>> '{}') !~ '^[a-z_]{1,24}$' then return false; end if;
    end loop;
  end if;
  if c ? 'known' and jsonb_typeof(c->'known') <> 'number' then return false; end if;
  if c ? 'cards' and jsonb_typeof(c->'cards') <> 'number' then return false; end if;
  return true;
end $$;

create or replace function private.valid_team(t jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare e record;
begin
  if t is null or jsonb_typeof(t) <> 'array' or jsonb_array_length(t) > 3 then return false; end if;
  for e in select value from jsonb_array_elements(t) loop
    if not private.valid_creature(e.value) then return false; end if;
  end loop;
  return true;
end $$;

-- A gift is a game item by its id ("hat/cap"), or an egg: a seed and a type from the list.
create or replace function private.valid_gift(kind text, payload jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
begin
  if payload is null or jsonb_typeof(payload) <> 'object' then return false; end if;
  if kind = 'item' then
    return jsonb_typeof(payload->'id') = 'string' and (payload->>'id') ~ '^[a-z0-9_/-]{1,60}$';
  end if;
  if kind = 'egg' then
    return jsonb_typeof(payload->'seed') = 'number' and coalesce((payload->>'type') = any (private.game_types()), false);
  end if;
  return false;
end $$;

revoke all on function private.game_types(), private.valid_creature(jsonb), private.valid_team(jsonb),
  private.valid_gift(text, jsonb) from public, anon;
grant execute on function private.game_types(), private.valid_creature(jsonb), private.valid_team(jsonb),
  private.valid_gift(text, jsonb) to authenticated, service_role;

alter table public.game_profiles drop constraint if exists game_team_valid;
alter table public.game_profiles add constraint game_team_valid check (private.valid_team(team)) not valid;
alter table public.game_profiles drop constraint if exists game_showcase_valid;
alter table public.game_profiles add constraint game_showcase_valid
  check (showcase is null or jsonb_typeof(showcase) = 'null' or private.valid_creature(showcase)) not valid;
-- Plausible numbers: a week's right answers, the streak in days, today's XP, the week's number,
-- the language code and the day.
alter table public.game_profiles drop constraint if exists game_numbers_sane;
alter table public.game_profiles add constraint game_numbers_sane check (
  reviews <= 20000 and streak <= 5000 and xp_today <= 200000 and week between 0 and 100000
  and (language is null or language ~ '^[a-z]{2,3}(-[a-z0-9]{2,5})?$')
  and (xp_day = '' or xp_day ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')) not valid;
alter table public.gifts drop constraint if exists gift_contents_valid;
alter table public.gifts add constraint gift_contents_valid check (private.valid_gift(kind, payload)) not valid;
alter table public.battles drop constraint if exists battle_detail_valid;
alter table public.battles add constraint battle_detail_valid check (
  detail is null or (jsonb_typeof(detail) = 'object'
                     and (not (detail ? 'rating') or jsonb_typeof(detail->'rating') = 'number'))) not valid;


-- ======================================================================= 13. deleting an account
-- Whatever deletes a profile (the app's "Delete my online account", the admin's delete_user, or
-- deleting the user in the dashboard), guilds and shared folders it founded pass to their
-- longest-standing member first, instead of disappearing for everyone; with nobody left they
-- close. Words it added to other people's shared folders stay, without its name (added_by is
-- set to null by the database). Its files are noted for removal.
create or replace function private.user_files(target uuid) returns table (bucket text, name text)
language sql stable security definer set search_path = '' as $$
  select o.bucket_id, o.name from storage.objects o
  where (o.bucket_id = 'avatars' and split_part(o.name, '/', 1) = target::text)
     or (o.bucket_id = 'voice' and target::text in (split_part(split_part(o.name, '/', 1), '_', 1),
                                                    split_part(split_part(o.name, '/', 1), '_', 2)));
$$;

create or replace function private.before_profile_delete() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  heir uuid;
begin
  for r in select g.id from public.guilds g where g.owner = old.id for update loop
    select m.user_id into heir from public.guild_members m
    where m.guild_id = r.id and m.user_id <> old.id order by m.joined_at, m.user_id limit 1;
    if heir is null then delete from public.guilds g where g.id = r.id;
    else update public.guilds g set owner = heir where g.id = r.id;
    end if;
  end loop;
  for r in select f.id from public.shared_folders f where f.owner = old.id for update loop
    select m.user_id into heir from public.shared_folder_members m
    where m.folder_id = r.id and m.user_id <> old.id order by m.added_at, m.user_id limit 1;
    if heir is null then delete from public.shared_folders f where f.id = r.id;
    else update public.shared_folders f set owner = heir where f.id = r.id;
    end if;
  end loop;
  insert into private.files_to_remove (bucket, name, why)
  select u.bucket, u.name, 'account deleted' from private.user_files(old.id) u
  on conflict do nothing;
  return old;
end $$;
drop trigger if exists profiles_hand_over on public.profiles;
create trigger profiles_hand_over before delete on public.profiles
  for each row execute function private.before_profile_delete();

-- Delete an account and everything stored with it: the profile, username and photo record,
-- friendships and requests, messages, voice notes and sent items, status card, online status,
-- game profile, battles, gifts, blocks, guild memberships and invitations (all through the
-- database's "on delete cascade" links), then the sign-in account itself. Reports keep their
-- copy for the admin, without the name. Returns a summary.
-- ADMIN: select private.delete_user('<user id>');  (SQL editor, or the service role only)
create or replace function private.delete_user(target uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_guilds_on integer;
  v_guilds_closed integer;
  v_folders_on integer;
  v_folders_closed integer;
  v_files integer;
  v_gone boolean := false;
begin
  if target is null then raise exception 'No account given'; end if;
  if not exists (select 1 from public.profiles p where p.id = target)
     and not exists (select 1 from auth.users u where u.id = target) then
    return jsonb_build_object('found', false);
  end if;
  select count(*) filter (where exists (select 1 from public.guild_members m where m.guild_id = g.id and m.user_id <> target)),
         count(*) filter (where not exists (select 1 from public.guild_members m where m.guild_id = g.id and m.user_id <> target))
    into v_guilds_on, v_guilds_closed from public.guilds g where g.owner = target;
  select count(*) filter (where exists (select 1 from public.shared_folder_members m where m.folder_id = f.id and m.user_id <> target)),
         count(*) filter (where not exists (select 1 from public.shared_folder_members m where m.folder_id = f.id and m.user_id <> target))
    into v_folders_on, v_folders_closed from public.shared_folders f where f.owner = target;
  select count(*) into v_files from private.user_files(target);
  delete from public.profiles p where p.id = target;      -- the trigger above hands things over first
  begin
    delete from auth.users u where u.id = target;
    v_gone := true;
  exception when others then
    insert into private.admin_todo (what)
    values ('Delete the sign-in account ' || target || ' in Authentication -> Users (the database could not: ' || sqlerrm || ')');
  end;
  return jsonb_build_object('found', true, 'guilds_passed_on', v_guilds_on, 'guilds_closed', v_guilds_closed,
                            'folders_passed_on', v_folders_on, 'folders_closed', v_folders_closed,
                            'files_left', v_files, 'sign_in_removed', v_gone);
end $$;
revoke all on function private.delete_user(uuid) from public, anon, authenticated;
grant execute on function private.delete_user(uuid) to service_role;

-- The files the app should delete (through the Storage API) before deleting my account: my
-- photos, and everything in my conversations' folders.
create or replace function public.my_files() returns table (bucket text, name text)
language sql stable security definer set search_path = '' as $$
  select u.bucket, u.name from private.user_files((select auth.uid())) u where (select auth.uid()) is not null;
$$;

-- Delete my own account (Settings -> Account & sync -> Friends & sharing -> Delete my online account).
create or replace function public.delete_my_account() returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  return private.delete_user(auth.uid());
end $$;

revoke all on function private.user_files(uuid), private.before_profile_delete() from public, anon, authenticated;
revoke all on function public.my_files(), public.delete_my_account() from public, anon;
grant execute on function public.my_files(), public.delete_my_account() to authenticated;


-- ======================================================================= 14. the nightly clean-up
-- Every night: messages older than 30 days (opened or not), battle results older than 60 days,
-- gifts opened more than 30 days ago, quiz invitations older than a week, the limits' old
-- bookkeeping, and reports handled more than 90 days ago (or older than a year). Then the files
-- nobody needs any more are listed: voice notes, clips and transcripts older than 30 days, files
-- of deleted accounts, and old profile photos no longer in use.
-- Deleting those files needs Supabase's Storage API. If the pg_net extension is on and the Vault
-- holds two secrets, "project_url" and "secret_key" (see HANDOFF.md), the job asks the Storage
-- API to delete up to 500 a night. Without them the apps delete them: purge_old_messages hands
-- each app the old files of its own conversations whenever it opens a chat.
create or replace function private.nightly_cleanup() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_messages integer;
  v_battles integer;
  v_gifts integer;
  v_queued integer;
  v_sent integer := 0;
  v_url text;
  v_key text;
  r record;
begin
  delete from public.messages m where m.created_at < now() - interval '30 days';
  get diagnostics v_messages = row_count;
  delete from public.battles b where b.created_at < now() - interval '60 days';
  get diagnostics v_battles = row_count;
  delete from public.gifts g where g.claimed_at < now() - interval '30 days';
  get diagnostics v_gifts = row_count;
  delete from public.game_invites i where i.created_at < now() - interval '7 days';
  delete from private.rate_log l where l.at < now() - interval '2 days';
  delete from public.reports x where x.handled_at < now() - interval '90 days' or x.created_at < now() - interval '365 days';

  insert into private.files_to_remove (bucket, name, why)
  select o.bucket_id, o.name, 'older than 30 days' from storage.objects o
  where o.bucket_id = 'voice' and o.created_at < now() - interval '30 days'
  on conflict do nothing;
  insert into private.files_to_remove (bucket, name, why)
  select o.bucket_id, o.name, 'account deleted' from storage.objects o
  where o.bucket_id = 'voice' and o.created_at < now() - interval '1 day'
    and (not exists (select 1 from public.profiles p where p.id::text = split_part(split_part(o.name, '/', 1), '_', 1))
         or not exists (select 1 from public.profiles p where p.id::text = split_part(split_part(o.name, '/', 1), '_', 2)))
  on conflict do nothing;
  insert into private.files_to_remove (bucket, name, why)
  select o.bucket_id, o.name, 'old profile photo' from storage.objects o
  where o.bucket_id = 'avatars' and o.created_at < now() - interval '1 day'
    and not exists (select 1 from public.profiles p where p.id::text = split_part(o.name, '/', 1) and p.avatar_path = o.name)
  on conflict do nothing;
  -- (already gone: nothing more to do)
  delete from private.files_to_remove f
  where not exists (select 1 from storage.objects o where o.bucket_id = f.bucket and o.name = f.name);
  select count(*) into v_queued from private.files_to_remove;

  if exists (select 1 from pg_catalog.pg_extension where extname = 'pg_net')
     and to_regclass('vault.decrypted_secrets') is not null then
    execute 'select decrypted_secret from vault.decrypted_secrets where name = $1' into v_url using 'project_url';
    execute 'select decrypted_secret from vault.decrypted_secrets where name = $1' into v_key using 'secret_key';
    if v_url is not null and v_key is not null then
      for r in select f.bucket, f.name from private.files_to_remove f
               where (f.tried_at is null or f.tried_at < now() - interval '20 hours') and f.name ~ '^[A-Za-z0-9_./-]+$'
               order by f.queued_at limit 500 loop
        execute 'select net.http_delete(url := $1, headers := $2)'
          using rtrim(v_url, '/') || '/storage/v1/object/' || r.bucket || '/' || r.name,
                case when v_key like 'sb_secret_%' then jsonb_build_object('apikey', v_key)
                     else jsonb_build_object('apikey', v_key, 'Authorization', 'Bearer ' || v_key) end;
        update private.files_to_remove f set tried_at = now() where f.bucket = r.bucket and f.name = r.name;
        v_sent := v_sent + 1;
      end loop;
    end if;
  end if;

  if to_regclass('cron.job_run_details') is not null then
    execute 'delete from cron.job_run_details where end_time < now() - interval ''14 days''';
  end if;
  return jsonb_build_object('messages', v_messages, 'battles', v_battles, 'gifts', v_gifts,
                            'files_waiting', v_queued, 'file_deletes_sent', v_sent);
end $$;
revoke all on function private.nightly_cleanup() from public, anon, authenticated;

-- Turn on pg_cron (Supabase's scheduler) if it isn't, and run the clean-up at 03:17 (UTC) every
-- night. If it can't be turned on from here, do it in Dashboard -> Database -> Extensions
-- ("pg_cron"), then run this file again; the summary below says whether the job is set.
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron')
     and exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    begin
      create extension pg_cron with schema pg_catalog;
    exception when others then
      raise warning 'pg_cron could not be turned on here (%). Turn it on in Dashboard -> Database -> Extensions, then run this file again.', sqlerrm;
    end;
  end if;
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    execute $q$select cron.schedule('tamkeen-nightly-cleanup', '17 3 * * *', 'select private.nightly_cleanup()')$q$;
    perform set_config('tamkeen.v8_nightly_job', 'scheduled', false);
  end if;
end $$;


-- ======================================================================= 15. done
-- The old helpers in "public" go last: every rule above now uses the private ones. (If this
-- step fails with "other objects depend on it", a rule made outside these files still uses one:
-- nothing has been changed; send the error to the developer.)
drop function if exists public.are_connected(uuid, uuid);
drop function if exists public.same_guild(uuid, uuid);
drop function if exists public.in_guild(uuid, uuid);
drop function if exists public.are_friends(uuid, uuid);
drop function if exists public.is_member(uuid);
drop function if exists public.in_conversation(text);

-- A last sweep: nothing in "private" may be run by the public or by anon (signed-out) callers.
revoke all on all functions in schema private from public, anon;
grant execute on function private.pair_path(text, uuid, uuid) to service_role;

-- Tell the API about the new functions and tables straight away.
notify pgrst, 'reload schema';

-- The summary (the SQL editor shows it as one row). nightly_job: "scheduled", or empty when
-- pg_cron is off (turn it on in Dashboard -> Database -> Extensions and run this file again).
select
  'v8 applied' as status,
  coalesce(nullif(current_setting('tamkeen.v8_nightly_job', true), ''), 'NOT scheduled: turn on pg_cron') as nightly_job,
  exists (select 1 from pg_extension where extname = 'pg_net') as pg_net_on,
  (select count(*) from pg_policies where policyname = 'see yourself and people you know') = 1 as profiles_closed,
  to_regprocedure('public.are_friends(uuid,uuid)') is null as old_helpers_gone;
