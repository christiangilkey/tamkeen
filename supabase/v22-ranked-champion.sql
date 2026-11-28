-- Schema v22: the ranked champion in the championship hall (prototype "ranked_champion"; the owner, 2026-11-27: "the
-- highest ranked battle player should be in the battle room ... it should show you their current score. As well, like
-- as who it is and the creature. Maybe their whole party."). Run once in the Supabase SQL editor (safe to re-run),
-- AFTER v18-ranked.sql (and so after v8-safety.sql). Self-test: supabase/test_rls_ranked_champion.sql.
--
-- IN PLAIN WORDS
--   Every signed-in player sees the best ranked player in the championship hall: their username, rating, tier and
--   record (wins and losses), and their ranked team standing on a dais. Until this file is run the app shows only the
--   name and rating (from the leaderboard, ranked_top).
--   - The team is the one the player last took into a ranked battle: the app sends it (as it is sent to the other
--     player in the battle) when a ranked battle starts. Nothing else of their game is kept or shown.
--   - It is opt-out: a Settings switch "Show my team if I'm the ranked champion", on unless switched off. Off, the
--     hall shows only their name and rating, with a shadow in place of the creatures.
--   - People blocked either way are left out: the champion I see is the best player I haven't blocked and who hasn't
--     blocked me (the leaderboard already works this way).
--   - Under-16s: the app's age check (web/js/agegate.js) keeps them from signing in at all, so they have no rating
--     and never appear; nothing about age is kept here.
--   - The team is checked here only for its shape and size (a list of at most 3 creatures, at most 12,000 characters).
--     Every app checks each creature again on arrival, as it checks a friend's team (web/js/game/remote.js cleanTeam).
--
-- WHAT IT ADDS (row-level security on, no reading or writing rule: everything goes through the two functions)
--   public.ranked_showcase   per player: their last ranked team, and whether it may be shown
--   ranked_showcase_set(team, show)   keep my team (null: leave it as it is) and my choice (60 a day)
--   ranked_champion()                 the champion I may see: {username, rating, games, wins, me, team, hidden}, or null
-- Nothing is deleted or changed in the earlier tables.

do $$
begin
  if to_regprocedure('private.blocked_between(uuid, uuid)') is null or to_regclass('public.ranked_ratings') is null then
    raise exception 'Run supabase/v8-safety.sql and supabase/v18-ranked.sql first.';
  end if;
end $$;


-- ======================================================================= 1. the table
create table if not exists public.ranked_showcase (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  team       jsonb not null default '[]'::jsonb
             check (jsonb_typeof(team) = 'array' and jsonb_array_length(team) <= 3 and length(team::text) <= 12000),
  show_team  boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.ranked_showcase enable row level security;
revoke all on table public.ranked_showcase from anon, authenticated;


-- ======================================================================= 2. keeping my team and my choice
create or replace function public.ranked_showcase_set(team jsonb default null, show boolean default true)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  v_team jsonb := team;
begin
  if me is null then raise exception 'Not signed in'; end if;
  if v_team is not null and (jsonb_typeof(v_team) <> 'array' or jsonb_array_length(v_team) > 3 or length(v_team::text) > 12000
     or exists (select 1 from jsonb_array_elements(v_team) x where jsonb_typeof(x) <> 'object')) then
    raise exception 'ranked_bad_team';
  end if;
  perform private.note_use(me, 'ranked_showcase', 60);      -- (a guard against a runaway loop, not a real limit)
  insert into public.ranked_showcase as s (user_id, team, show_team, updated_at)
  values (me, coalesce(v_team, '[]'::jsonb), coalesce(show, true), now())
  on conflict (user_id) do update
    set team = coalesce(v_team, s.team), show_team = coalesce(show, true), updated_at = now()
    where s.user_id = me;
  return jsonb_build_object('ok', true);
end $$;


-- ======================================================================= 3. the champion
create or replace function public.ranked_champion() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  c record;
begin
  if me is null then raise exception 'Not signed in'; end if;
  select r.user_id, r.rating, r.games, r.wins, p.username::text as username,
         coalesce(s.show_team, true) as shown, coalesce(s.team, '[]'::jsonb) as team
    into c
    from public.ranked_ratings r
    join public.profiles p on p.id = r.user_id
    left join public.ranked_showcase s on s.user_id = r.user_id
   where r.games > 0 and p.username is not null
     and (r.user_id = me or not private.blocked_between(me, r.user_id))
   order by r.rating desc, r.wins desc, p.username
   limit 1;
  if not found then return null; end if;
  return jsonb_build_object(
    'username', c.username, 'rating', c.rating, 'games', c.games, 'wins', c.wins, 'me', c.user_id = me,
    'team', case when c.shown then c.team else '[]'::jsonb end,
    'hidden', not c.shown);
end $$;


-- ======================================================================= 4. who may run what
revoke all on function public.ranked_showcase_set(jsonb, boolean), public.ranked_champion() from public, anon;
grant execute on function public.ranked_showcase_set(jsonb, boolean), public.ranked_champion() to authenticated;

notify pgrst, 'reload schema';

select 'v22 ranked champion: ready' as status;
