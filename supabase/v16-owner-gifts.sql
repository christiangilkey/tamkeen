-- Schema v16: gifts from Tamkeen's creator. The creator gives a chosen user things in the creature game: coins,
-- gems, XP and glow (or takes some away), items, battle moves, tags that unlock things, and creatures. Run once in
-- the Supabase SQL editor (safe to re-run), AFTER v14-creator.sql (it uses private.creators, who the creator is).
--
-- HOW IT WORKS
--   The game itself is not here: each person's game is saved in their own Google Drive, and the creator cannot
--   see or change it. So a gift is a note left here for one person: "add this to your game". That person's app
--   collects the notes waiting for it, adds each to the game exactly once (the game remembers which gifts it has
--   had, so another device or an older copy can neither undo one nor add it twice), tells the person what
--   arrived, and marks the note as collected.
--
-- WHAT IT ADDS
--   public.game_gifts      one row per gift: who it is for, who gave it, what (a small list), an optional
--                          sentence, when, and when it was collected. No reading or writing rules: the API gets
--                          nothing; everything goes through the functions below.
--   creator_give(username, what, note)   creator only: leave a gift for the user with that username (they need
--                                        not be a friend). Answers {status: "given", id, username} or {status: "no"}.
--   creator_gifts(most)                  creator only: what was given, newest first (the record of every gift).
--   creator_take_back(gift)              creator only: remove a gift nobody has collected yet.
--   my_gifts()                           anyone signed in: the gifts waiting for me.
--   gifts_got(ids)                       anyone signed in: mark my own gifts as collected.
-- What a gift may hold is checked twice: its size and shape here, and every id against the game's own lists in the
-- app, when it is written and again when it arrives (web/js/game/gifts.js).
-- Collected gifts are kept for a year as the creator's record, then deleted. Self-test: supabase/test_rls_gifts.sql.

create schema if not exists private;
grant usage on schema private to authenticated, service_role;

do $$
begin
  if to_regclass('private.creators') is null then
    raise exception 'Run supabase/v14-creator.sql first: it says who the creator is.';
  end if;
end $$;


-- ======================================================================= 1. the table
create table if not exists public.game_gifts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  given_by   uuid references public.profiles(id) on delete set null,
  what       jsonb not null check (jsonb_typeof(what) = 'object' and octet_length(what::text) <= 4000),
  note       text not null default '' check (length(note) <= 200),
  created_at timestamptz not null default now(),
  got_at     timestamptz
);
create index if not exists game_gifts_user on public.game_gifts (user_id) where got_at is null;
create index if not exists game_gifts_made on public.game_gifts (created_at desc);

-- No reading or writing rules at all: with row-level security on and no rule, the API gets nothing.
alter table public.game_gifts enable row level security;
revoke all on public.game_gifts from anon, authenticated;


-- ======================================================================= 2. the creator's side
-- Leave a gift for the user with this username (capitals don't matter; a leading @ is ignored).
create or replace function public.creator_give(username text, what jsonb, note text default '') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  v_name text := lower(btrim(regexp_replace(coalesce(username, ''), '^\s*@', '')));
  v_what jsonb := what;
  v_note text := left(btrim(coalesce(note, '')), 200);
  v_who uuid;
  v_shown text;
  v_id uuid;
begin
  if me is null then raise exception 'Not signed in'; end if;
  if not private.is_creator(me) then raise exception 'not_creator'; end if;
  if v_what is null or jsonb_typeof(v_what) <> 'object' or v_what = '{}'::jsonb or octet_length(v_what::text) > 4000 then
    raise exception 'gift_bad';
  end if;
  if v_name ~ '^[a-z0-9_.]{3,20}$' then
    select p.id, p.username::text into v_who, v_shown from public.profiles p where lower(p.username::text) = v_name;
  end if;
  if v_who is null then return jsonb_build_object('status', 'no'); end if;
  -- (housekeeping: a collected gift is kept for a year as the record, then goes)
  delete from public.game_gifts g where g.got_at is not null and g.got_at < now() - interval '1 year';
  insert into public.game_gifts (user_id, given_by, what, note) values (v_who, me, v_what, v_note) returning id into v_id;
  return jsonb_build_object('status', 'given', 'id', v_id, 'username', v_shown);
end $$;

-- The record: what was given, newest first: [{id, username, what, note, created_at, got_at}].
create or replace function public.creator_gifts(most integer default 100) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_most integer := least(greatest(coalesce(most, 100), 1), 500);
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if not private.is_creator(auth.uid()) then raise exception 'not_creator'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'username', x.username, 'what', x.what, 'note', x.note,
            'created_at', x.created_at, 'got_at', x.got_at) order by x.created_at desc), '[]'::jsonb)
          from (select g.id, coalesce(p.username::text, '') as username, g.what, g.note, g.created_at, g.got_at
                from public.game_gifts g left join public.profiles p on p.id = g.user_id
                order by g.created_at desc limit v_most) x);
end $$;

-- Take back a gift nobody has collected yet. True when it was removed; false when it was collected already
-- (it is in that person's game by then, and cannot be reached from here) or never existed.
create or replace function public.creator_take_back(gift uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_n integer;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if not private.is_creator(auth.uid()) then raise exception 'not_creator'; end if;
  delete from public.game_gifts g where g.id = gift and g.got_at is null;
  get diagnostics v_n = row_count;
  return v_n > 0;
end $$;


-- ======================================================================= 3. the receiving side
-- The gifts waiting for me, oldest first: [{id, what, note, created_at}]. Never who gave it.
create or replace function public.my_gifts() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'Not signed in'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'what', x.what, 'note', x.note, 'created_at', x.created_at)
            order by x.created_at), '[]'::jsonb)
          from (select g.id, g.what, g.note, g.created_at from public.game_gifts g
                where g.user_id = me and g.got_at is null order by g.created_at limit 50) x);
end $$;

-- My app has added these gifts to my game: mark them collected. Answers how many were marked.
create or replace function public.gifts_got(ids uuid[]) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  v_n integer;
begin
  if me is null then raise exception 'Not signed in'; end if;
  if ids is null or coalesce(array_length(ids, 1), 0) = 0 then return 0; end if;
  update public.game_gifts g set got_at = now() where g.user_id = me and g.got_at is null and g.id = any (ids);
  get diagnostics v_n = row_count;
  return v_n;
end $$;


-- ======================================================================= 4. who may run what
-- Signed-in people only, never the signed-out public; the creator's three refuse everyone but a creator.
revoke all on function public.creator_give(text, jsonb, text), public.creator_gifts(integer), public.creator_take_back(uuid),
  public.my_gifts(), public.gifts_got(uuid[]) from public, anon;
grant execute on function public.creator_give(text, jsonb, text), public.creator_gifts(integer), public.creator_take_back(uuid),
  public.my_gifts(), public.gifts_got(uuid[]) to authenticated;

-- Tell the API about the new functions straight away.
notify pgrst, 'reload schema';

select 'v16 creator gifts: in place' as result,
       (select count(*) from public.game_gifts) as gifts,
       (select count(*) from private.creators) as creators;
