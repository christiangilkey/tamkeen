-- Schema v9: fishing. A player's aquarium and their biggest catch of the week, for friends to see. Run once
-- in the Supabase SQL editor (safe to re-run). It works before or after v8-safety.sql.
--
-- It adds ONE column to game_profiles and a check on what goes in it. Nothing else changes: the rule that
-- already limits who can read a game profile (you, your friends and your guild-mates; never strangers, never
-- anyone who is blocked once v8 is applied) covers the new column too, because the rule is on the whole row.
--
--   aquarium   {"tank": [up to 6 fish], "week": week number, "best": this week's biggest catch or null,
--               "dex": how many Fishdex entries they have}
--              a fish is {"sp": its kind, "t": its tier 0..9, "cm": its length}. No words, no names,
--              nothing else. Written by the app (web/js/game/fishing.js publicAquarium) and checked again by
--              the friend's app on arrival (web/js/game/remote.js cleanAquarium).
--
-- Until this has been run, the app sends and reads everything else as before (web/js/social.js falls back):
-- fishing works in full on your own device, and only the "Biggest catch this week" board and friends'
-- aquariums stay empty.

-- (The "private" schema is where v8 keeps its helper checks: the API can't call what is in it, but signed-in users
-- must be allowed to use it, because a check on a row runs as the person saving the row.)
create schema if not exists private;
grant usage on schema private to authenticated, service_role;

-- A fish: a short lower-case name for its kind, a tier from 0 to 9, a length from 0 to 1000.
create or replace function private.valid_fish(f jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
begin
  if f is null or jsonb_typeof(f) <> 'object' then return false; end if;
  if jsonb_typeof(f->'sp') is distinct from 'string' or (f->>'sp') !~ '^[a-z_]{1,24}$' then return false; end if;
  if jsonb_typeof(f->'t') is distinct from 'number' or (f->>'t')::numeric < 0 or (f->>'t')::numeric > 9 then return false; end if;
  if jsonb_typeof(f->'cm') is distinct from 'number' or (f->>'cm')::numeric < 0 or (f->>'cm')::numeric > 1000 then return false; end if;
  return true;
end $$;

-- An aquarium: small, at most 6 fish in the tank, plausible numbers.
create or replace function private.valid_aquarium(a jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare
  e record;
begin
  if a is null or jsonb_typeof(a) = 'null' then return true; end if;
  if jsonb_typeof(a) <> 'object' or octet_length(a::text) > 1500 then return false; end if;
  if a ? 'tank' then
    if jsonb_typeof(a->'tank') <> 'array' or jsonb_array_length(a->'tank') > 6 then return false; end if;
    for e in select value from jsonb_array_elements(a->'tank') loop
      if not private.valid_fish(e.value) then return false; end if;
    end loop;
  end if;
  if a ? 'best' and jsonb_typeof(a->'best') <> 'null' and not private.valid_fish(a->'best') then return false; end if;
  if a ? 'week' and jsonb_typeof(a->'week') not in ('number', 'null') then return false; end if;
  if a ? 'dex' then
    if jsonb_typeof(a->'dex') <> 'number' or (a->>'dex')::numeric < 0 or (a->>'dex')::numeric > 1000 then return false; end if;
  end if;
  return true;
end $$;

revoke all on function private.valid_fish(jsonb), private.valid_aquarium(jsonb) from public, anon;
grant execute on function private.valid_fish(jsonb), private.valid_aquarium(jsonb) to authenticated, service_role;

alter table public.game_profiles add column if not exists aquarium jsonb;
alter table public.game_profiles drop constraint if exists game_aquarium_valid;
alter table public.game_profiles add constraint game_aquarium_valid check (private.valid_aquarium(aquarium));

-- Tell the API about the new column straight away.
notify pgrst, 'reload schema';

select 'v9 fishing: the aquarium column is in place' as result,
       (select count(*) from information_schema.columns
        where table_schema = 'public' and table_name = 'game_profiles' and column_name = 'aquarium') as aquarium_column;
