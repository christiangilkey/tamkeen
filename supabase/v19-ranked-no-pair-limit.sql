-- Schema v19: ranked battles with no daily limit for the same two players (prototype "ranked"). The owner, about
-- "the same two players can move each other's ratings in 3 ranked battles a day": "I dont like this, make it
-- infinite". Run once in the Supabase SQL editor, AFTER v18-ranked.sql (safe to re-run).
--
-- WHAT IT CHANGES (nothing is deleted: no table, row or column; only two functions are replaced)
--   private.ranked_settle(uuid)  every finished ranked battle now moves points (before: only the first 3 of the
--                                same two players in 24 hours)
--   public.ranked_poll()         the queue now pairs the same two players as often as they like (before: never a
--                                4th time in 24 hours)
-- Everything else stays as v18 made it: blocked people are never paired, someone's 3rd vanishing in a day still
-- counts as their loss. Same names, same inputs and outputs, same rights (given again below).
-- private.ranked_pair_count(uuid, uuid), which v18 made, is simply no longer used (left in place, harmless).
-- A database made from scratch with today's v18-ranked.sql already has all this; running v19 on it changes nothing.
-- Self-test afterwards: supabase/test_rls_ranked.sql (ends with RESULTS ok=… bad=[ none]).

do $$
begin
  if to_regprocedure('private.ranked_settle(uuid)') is null or to_regprocedure('public.ranked_poll()') is null then
    raise exception 'Run supabase/v18-ranked.sql first: this replaces two of its functions.';
  end if;
end $$;

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
    v_ca := private.ranked_change(m.a_rating, m.b_rating, v_outcome = 'a', m.a_games);
    v_cb := private.ranked_change(m.b_rating, m.a_rating, v_outcome = 'b', m.b_games);
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
    -- Someone else online now, unpaired, near enough (by the wider of our two windows), not blocked.
    select * into o from public.ranked_queue x
    where x.user_id <> me and x.match_id is null and x.seen_at > now() - interval '12 seconds'
      and (v_window is null or private.ranked_window(extract(epoch from now() - x.joined_at)) is null
           or abs(x.rating - q.rating) <= greatest(v_window, private.ranked_window(extract(epoch from now() - x.joined_at))))
      and not private.blocked_between(me, x.user_id)
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

revoke all on function private.ranked_settle(uuid) from public, anon, authenticated;
revoke all on function public.ranked_poll() from public, anon;
grant execute on function public.ranked_poll() to authenticated;

notify pgrst, 'reload schema';

select 'v19 ranked: no daily limit for the same two players' as result,
       (select count(*) from public.ranked_ratings) as ratings,
       (select count(*) from public.ranked_matches) as matches;
