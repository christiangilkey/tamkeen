-- Schema v18: ranked battles (prototype "ranked"). A rating per player that starts at 0, a queue that pairs two
-- players online now with similar ratings, and results that the server checks and turns into points. Run once in
-- the Supabase SQL editor (safe to re-run), AFTER v8-safety.sql (it uses private.blocked_between: blocked
-- people are never paired). Self-test: supabase/test_rls_ranked.sql.
--
-- THE RATING, IN PLAIN WORDS (the app shows the same sums: web/js/game/ranked.js; the tests check they agree)
--   Everyone starts at 0 and never goes below 0. Each ranked battle moves it by K x (result - expected), where
--   "expected" is the chance the two ratings give you of winning (50% against an equal rating, about 24% against
--   someone 200 points higher). K is 40 for a player's first 10 ranked battles, then 24. A win always gives at
--   least 1 point, a loss always costs at least 1 (unless the rating is 0 already).
--
-- MATCHING
--   ranked_join() puts me in the queue; the app then calls ranked_poll() every few seconds, which keeps my place
--   (a place not polled for 12 seconds is not "online" any more) and pairs me with someone else in the queue whose
--   rating is within 100 points, 200 after 15 seconds of waiting, 400 after 30, anyone after 45. After 60 seconds
--   with nobody it answers "none" and takes me out. Never paired: someone either of us has blocked, or someone I
--   have had 3 ranked battles with in the last 24 hours. ranked_leave() takes me out.
--
-- RESULTS (one per battle, never trusted from one device)
--   Each of the two reports once, with ranked_report(match, said): 'won', 'lost', 'quit' (pressed Leave) or
--   'broken' (the connection dropped). The first report from each stands.
--     - one won and the other lost           -> the winner wins
--     - someone quit                         -> the one who quit loses (both quit: nothing changes)
--     - both say won, both say lost, broken  -> nothing changes ("void")
--     - only one report after 10 minutes     -> nothing changes, but the silent one is noted; from their third
--                                               silence in a day while the other claimed a win, it counts as a loss
--                                               (so closing the app to dodge a loss doesn't work for long)
--   Points only move for the first 3 ranked battles of the same two players in 24 hours.
--
-- WHAT IT ADDS (row-level security on, no reading or writing rule: everything goes through the functions)
--   public.ranked_ratings   rating, ranked battles, wins, per player
--   public.ranked_queue     who is looking for a match now
--   public.ranked_matches   each pairing: who, their ratings then, the arena seed, the two reports, the outcome
--   ranked_me()  ranked_join()  ranked_poll()  ranked_leave()  ranked_report(match, said)  ranked_top(most)

create schema if not exists private;
grant usage on schema private to authenticated, service_role;

do $$
begin
  if to_regprocedure('private.blocked_between(uuid, uuid)') is null then
    raise exception 'Run supabase/v8-safety.sql first: ranked matching needs its blocks.';
  end if;
end $$;


-- ======================================================================= 1. the tables
create table if not exists public.ranked_ratings (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  rating     integer not null default 0 check (rating >= 0 and rating <= 100000),
  games      integer not null default 0 check (games >= 0),
  wins       integer not null default 0 check (wins >= 0),
  updated_at timestamptz not null default now()
);
create index if not exists ranked_ratings_top on public.ranked_ratings (rating desc) where games > 0;

create table if not exists public.ranked_queue (
  user_id   uuid primary key references public.profiles(id) on delete cascade,
  rating    integer not null default 0,
  joined_at timestamptz not null default now(),
  seen_at   timestamptz not null default now(),
  match_id  uuid
);

create table if not exists public.ranked_matches (
  id         uuid primary key default gen_random_uuid(),
  a          uuid references public.profiles(id) on delete set null,
  b          uuid references public.profiles(id) on delete set null,
  a_rating   integer not null default 0,
  b_rating   integer not null default 0,
  a_games    integer not null default 0,
  b_games    integer not null default 0,
  seed       integer not null,
  created_at timestamptz not null default now(),
  a_said     text check (a_said in ('won', 'lost', 'quit', 'broken')),
  b_said     text check (b_said in ('won', 'lost', 'quit', 'broken')),
  a_said_at  timestamptz,
  b_said_at  timestamptz,
  outcome    text check (outcome in ('a', 'b', 'void')),
  silent     uuid,              -- the one who never reported, when the match ended without them
  a_change   integer not null default 0,
  b_change   integer not null default 0,
  settled_at timestamptz
);
create index if not exists ranked_matches_a on public.ranked_matches (a, created_at desc);
create index if not exists ranked_matches_b on public.ranked_matches (b, created_at desc);
create index if not exists ranked_matches_open on public.ranked_matches (created_at) where settled_at is null;

alter table public.ranked_ratings enable row level security;
alter table public.ranked_queue enable row level security;
alter table public.ranked_matches enable row level security;
revoke all on public.ranked_ratings, public.ranked_queue, public.ranked_matches from anon, authenticated;


-- ======================================================================= 2. the numbers (web/js/game/ranked.js)
create or replace function private.ranked_k(games integer) returns integer
language sql immutable set search_path = '' as $$
  select case when coalesce(games, 0) < 10 then 40 else 24 end;   -- K_NEW 40 for the first NEW_GAMES 10, then K 24
$$;

-- Points one battle moves `mine` (a win > 0, a loss < 0), never taking the rating below 0.
create or replace function private.ranked_change(mine integer, theirs integer, won boolean, games integer) returns integer
language plpgsql immutable set search_path = '' as $$
declare
  r integer := greatest(coalesce(mine, 0), 0);
  e double precision := 1.0 / (1.0 + power(10.0, (greatest(coalesce(theirs, 0), 0) - r) / 400.0));  -- SPREAD 400
  d integer := round(private.ranked_k(games) * ((case when won then 1 else 0 end) - e));
begin
  if won and d < 1 then d := 1; end if;
  if not won and d > -1 then d := -1; end if;
  return greatest(d, -r);
end $$;

-- The window, in points, after `waited` seconds in the queue (null = anyone).
create or replace function private.ranked_window(waited double precision) returns integer
language sql immutable set search_path = '' as $$
  select case when waited >= 45 then null when waited >= 30 then 400 when waited >= 15 then 200 else 100 end;
$$;

-- Ranked battles between these two that moved points in the last 24 hours (or are still being played).
create or replace function private.ranked_pair_count(x uuid, y uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::integer from public.ranked_matches m
  where ((m.a = x and m.b = y) or (m.a = y and m.b = x))
    and m.created_at > now() - interval '24 hours'
    and (m.settled_at is null or m.outcome in ('a', 'b'));
$$;

create or replace function private.ranked_rating(person uuid) returns public.ranked_ratings
language sql stable security definer set search_path = '' as $$
  select coalesce((select r from public.ranked_ratings r where r.user_id = person),
                  row(person, 0, 0, 0, now())::public.ranked_ratings);
$$;


-- ======================================================================= 3. settling a match
-- Works out a match's outcome once both have reported (or 10 minutes have passed) and moves the points. Safe to
-- call again: a settled match is left alone.
create or replace function private.ranked_settle(match uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  m public.ranked_matches;
  v_outcome text;
  v_silent uuid;
  v_ca integer := 0;
  v_cb integer := 0;
  v_counted integer;
  v_claim text;
begin
  select * into m from public.ranked_matches x where x.id = match for update;
  if not found or m.settled_at is not null then return; end if;

  if m.a_said is not null and m.b_said is not null then
    v_outcome := case
      when m.a_said = 'quit' and m.b_said = 'quit' then 'void'
      when m.a_said = 'quit' then 'b'
      when m.b_said = 'quit' then 'a'
      when m.a_said = 'won' and m.b_said = 'lost' then 'a'
      when m.a_said = 'lost' and m.b_said = 'won' then 'b'
      else 'void' end;
  elsif m.a_said = 'quit' then v_outcome := 'b';          -- a quit: that stands without waiting for b
  elsif m.b_said = 'quit' then v_outcome := 'a';
  elsif m.created_at < now() - interval '10 minutes' then
    -- Only one of them reported (or neither). Nothing changes, except for someone who keeps vanishing while the
    -- other says they won: from the third time in a day it counts as their loss.
    v_outcome := 'void';
    if m.a_said is null and m.b_said is not null then v_silent := m.a; v_claim := m.b_said;
    elsif m.b_said is null and m.a_said is not null then v_silent := m.b; v_claim := m.a_said; end if;
    if v_silent is not null and v_claim = 'won' and (
      select count(*) from public.ranked_matches x
      where x.silent = v_silent and x.id <> m.id and x.settled_at > now() - interval '24 hours') >= 2 then
      v_outcome := case when v_silent = m.a then 'b' else 'a' end;
    end if;
  else
    return;                                                 -- still waiting for the other report
  end if;

  if v_outcome in ('a', 'b') then
    -- (the 4th and later battles of this pair in a day move nothing)
    select count(*) into v_counted from public.ranked_matches x
    where ((x.a = m.a and x.b = m.b) or (x.a = m.b and x.b = m.a))
      and x.id <> m.id and x.outcome in ('a', 'b') and x.settled_at > now() - interval '24 hours';
    if v_counted < 3 then                                    -- PAIR_PER_DAY 3
      v_ca := private.ranked_change(m.a_rating, m.b_rating, v_outcome = 'a', m.a_games);
      v_cb := private.ranked_change(m.b_rating, m.a_rating, v_outcome = 'b', m.b_games);
    end if;
  end if;

  update public.ranked_matches x set outcome = v_outcome, silent = v_silent, a_change = v_ca, b_change = v_cb,
    settled_at = now() where x.id = m.id;

  -- Move the ratings from where they are now (another match may have settled in between), never below 0.
  if v_outcome in ('a', 'b') and m.a is not null then
    insert into public.ranked_ratings as r (user_id, rating, games, wins) values (m.a, greatest(v_ca, 0), 1, (v_outcome = 'a')::integer)
    on conflict (user_id) do update set rating = greatest(r.rating + v_ca, 0), games = r.games + 1,
      wins = r.wins + (v_outcome = 'a')::integer, updated_at = now() where r.user_id = m.a;
  end if;
  if v_outcome in ('a', 'b') and m.b is not null then
    insert into public.ranked_ratings as r (user_id, rating, games, wins) values (m.b, greatest(v_cb, 0), 1, (v_outcome = 'b')::integer)
    on conflict (user_id) do update set rating = greatest(r.rating + v_cb, 0), games = r.games + 1,
      wins = r.wins + (v_outcome = 'b')::integer, updated_at = now() where r.user_id = m.b;
  end if;
end $$;

-- Settle my matches whose time is up, and tidy the queue (called by the functions below).
create or replace function private.ranked_tidy(me uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  x uuid;
begin
  for x in select m.id from public.ranked_matches m
           where m.settled_at is null and (m.a = me or m.b = me) and m.created_at < now() - interval '10 minutes'
  loop
    perform private.ranked_settle(x);
  end loop;
  delete from public.ranked_queue q where q.seen_at < now() - interval '2 minutes';
  delete from public.ranked_matches m where m.created_at < now() - interval '60 days';
end $$;


-- ======================================================================= 4. what the app calls
-- My rating: {rating, games, wins, place} (place: where I stand on the leaderboard, null before my first battle).
create or replace function public.ranked_me() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  r public.ranked_ratings;
begin
  if me is null then raise exception 'Not signed in'; end if;
  perform private.ranked_tidy(me);
  r := private.ranked_rating(me);
  return jsonb_build_object('rating', r.rating, 'games', r.games, 'wins', r.wins,
    'place', case when r.games > 0 then (select count(*) + 1 from public.ranked_ratings o where o.games > 0 and o.rating > r.rating) end);
end $$;

-- Look for a match: into the queue (or back to the start of it), then the same answer as ranked_poll.
create or replace function public.ranked_join() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'Not signed in'; end if;
  perform private.ranked_tidy(me);
  perform private.note_use(me, 'ranked_join', 200);        -- (a guard against a runaway loop, not a real limit)
  insert into public.ranked_queue as q (user_id, rating) values (me, (private.ranked_rating(me)).rating)
  on conflict (user_id) do update set rating = excluded.rating, joined_at = now(), seen_at = now(), match_id = null
  where q.user_id = me;
  return public.ranked_poll();
end $$;

-- Still looking: {status: 'waiting', waited, window} | {status: 'matched', match, seed, host, me, rival} |
-- {status: 'none'} (60 seconds and nobody) | {status: 'out'} (not in the queue).
create or replace function public.ranked_poll() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  q public.ranked_queue;
  o public.ranked_queue;
  m public.ranked_matches;
  v_waited double precision;
  v_window integer;
  v_seed integer;
  v_rival uuid;
begin
  if me is null then raise exception 'Not signed in'; end if;
  select * into q from public.ranked_queue x where x.user_id = me for update;
  if not found then return jsonb_build_object('status', 'out'); end if;
  update public.ranked_queue x set seen_at = now() where x.user_id = me;

  if q.match_id is null then
    v_waited := extract(epoch from now() - q.joined_at);
    v_window := private.ranked_window(v_waited);
    -- Someone else online now, unpaired, near enough (by the wider of our two windows), not blocked, not had 3 times.
    select * into o from public.ranked_queue x
    where x.user_id <> me and x.match_id is null and x.seen_at > now() - interval '12 seconds'
      and (v_window is null or private.ranked_window(extract(epoch from now() - x.joined_at)) is null
           or abs(x.rating - q.rating) <= greatest(v_window, private.ranked_window(extract(epoch from now() - x.joined_at))))
      and not private.blocked_between(me, x.user_id)
      and private.ranked_pair_count(me, x.user_id) < 3
    order by abs(x.rating - q.rating), x.joined_at
    limit 1
    for update skip locked;
    if found then
      v_seed := floor(random() * 2147483646)::integer + 1;
      -- (the one who waited longer runs the battle: "a", the host)
      insert into public.ranked_matches (a, b, a_rating, b_rating, a_games, b_games, seed)
      values (o.user_id, me, o.rating, q.rating, (private.ranked_rating(o.user_id)).games, (private.ranked_rating(me)).games, v_seed)
      returning id into q.match_id;
      update public.ranked_queue x set match_id = q.match_id where x.user_id in (me, o.user_id);
    elsif v_waited >= 60 then                                -- GIVE_UP_S 60
      delete from public.ranked_queue x where x.user_id = me;
      return jsonb_build_object('status', 'none');
    else
      return jsonb_build_object('status', 'waiting', 'waited', floor(v_waited), 'window', v_window);
    end if;
  end if;

  select * into m from public.ranked_matches x where x.id = q.match_id;
  if not found or m.settled_at is not null then
    delete from public.ranked_queue x where x.user_id = me;
    return jsonb_build_object('status', 'out');
  end if;
  v_rival := case when m.a = me then m.b else m.a end;
  return jsonb_build_object('status', 'matched', 'match', m.id, 'seed', m.seed, 'host', m.a = me,
    'me', jsonb_build_object('rating', case when m.a = me then m.a_rating else m.b_rating end,
                             'games', case when m.a = me then m.a_games else m.b_games end),
    'rival', jsonb_build_object('id', v_rival,
                                'username', coalesce((select p.username::text from public.profiles p where p.id = v_rival), ''),
                                'rating', case when m.a = me then m.b_rating else m.a_rating end,
                                'games', case when m.a = me then m.b_games else m.a_games end));
end $$;

-- Stop looking. A match found but not yet started is called off (nothing changes for either).
create or replace function public.ranked_leave() returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  v_match uuid;
begin
  if me is null then raise exception 'Not signed in'; end if;
  delete from public.ranked_queue x where x.user_id = me returning x.match_id into v_match;
  if v_match is not null then
    update public.ranked_matches x set a_said = coalesce(x.a_said, case when x.a = me then 'broken' end),
      b_said = coalesce(x.b_said, case when x.b = me then 'broken' end),
      a_said_at = coalesce(x.a_said_at, case when x.a = me then now() end),
      b_said_at = coalesce(x.b_said_at, case when x.b = me then now() end)
    where x.id = v_match and x.settled_at is null and (x.a = me or x.b = me);
    perform private.ranked_settle(v_match);
  end if;
end $$;

-- How my match ended, from my side: 'won', 'lost', 'quit' or 'broken'. Answers the match as it stands:
-- {status: 'waiting'} (the other hasn't reported yet) or {status: 'settled', outcome: 'won'|'lost'|'void',
-- change, rating}.
create or replace function public.ranked_report(match uuid, said text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  m public.ranked_matches;
begin
  if me is null then raise exception 'Not signed in'; end if;
  if said is null or said not in ('won', 'lost', 'quit', 'broken') then raise exception 'ranked_bad'; end if;
  select * into m from public.ranked_matches x where x.id = match and (x.a = me or x.b = me);
  if not found then raise exception 'ranked_no_match'; end if;
  -- (the first report from each stands; a late one changes nothing)
  update public.ranked_matches x set a_said = said, a_said_at = now()
  where x.id = m.id and x.a = me and x.a_said is null and x.settled_at is null;
  update public.ranked_matches x set b_said = said, b_said_at = now()
  where x.id = m.id and x.b = me and x.b_said is null and x.settled_at is null;
  delete from public.ranked_queue x where x.user_id = me;
  perform private.ranked_settle(m.id);
  return public.ranked_result(m.id);
end $$;

-- A match of mine, as it stands (the app asks again while the other's report is on its way).
create or replace function public.ranked_result(match uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  m public.ranked_matches;
begin
  if me is null then raise exception 'Not signed in'; end if;
  perform private.ranked_settle(match);
  select * into m from public.ranked_matches x where x.id = match and (x.a = me or x.b = me);
  if not found then raise exception 'ranked_no_match'; end if;
  if m.settled_at is null then return jsonb_build_object('status', 'waiting'); end if;
  return jsonb_build_object('status', 'settled',
    'outcome', case when m.outcome = 'void' then 'void' when (m.outcome = 'a') = (m.a = me) then 'won' else 'lost' end,
    'change', case when m.a = me then m.a_change else m.b_change end,
    'rating', (private.ranked_rating(me)).rating);
end $$;

-- The leaderboard: the best ratings, by username only, [{username, rating, me}]. People either of us has blocked
-- are left out; my own row is marked.
create or replace function public.ranked_top(most integer default 20) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  v_most integer := least(greatest(coalesce(most, 20), 1), 50);
begin
  if me is null then raise exception 'Not signed in'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('username', x.username, 'rating', x.rating, 'me', x.user_id = me)
            order by x.rating desc, x.username), '[]'::jsonb)
          from (select r.user_id, r.rating, p.username::text as username
                from public.ranked_ratings r join public.profiles p on p.id = r.user_id
                where r.games > 0 and p.username is not null
                  and (r.user_id = me or not private.blocked_between(me, r.user_id))
                order by r.rating desc, p.username limit v_most) x);
end $$;


-- ======================================================================= 5. who may run what
revoke all on function private.ranked_k(integer), private.ranked_change(integer, integer, boolean, integer),
  private.ranked_window(double precision), private.ranked_pair_count(uuid, uuid), private.ranked_rating(uuid),
  private.ranked_settle(uuid), private.ranked_tidy(uuid) from public, anon, authenticated;
revoke all on function public.ranked_me(), public.ranked_join(), public.ranked_poll(), public.ranked_leave(),
  public.ranked_report(uuid, text), public.ranked_result(uuid), public.ranked_top(integer) from public, anon;
grant execute on function public.ranked_me(), public.ranked_join(), public.ranked_poll(), public.ranked_leave(),
  public.ranked_report(uuid, text), public.ranked_result(uuid), public.ranked_top(integer) to authenticated;

notify pgrst, 'reload schema';

select 'v18 ranked battles: in place' as result,
       (select count(*) from public.ranked_ratings) as ratings,
       (select count(*) from public.ranked_matches) as matches;
