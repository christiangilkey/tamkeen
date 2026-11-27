-- Schema v20: the farm's weekly harvest board, for friends to see (prototype "farm"). Run once in the Supabase SQL
-- editor (safe to re-run). It works before or after v8-safety.sql, and needs nothing else.
--
-- It adds ONE column to game_profiles and a check on what goes in it. Nothing else changes: the rule that already
-- limits who can read a game profile (you, your friends and your guild-mates; never strangers, never anyone who is
-- blocked once v8 is applied) covers the new column too, because the rule is on the whole row.
--
--   farm   {"week": week number, "n": this week's harvests, "best": {"c": crop, "t": tier 0..9} or null,
--           "size": [field width, field height], "dex": how many crops of the Cropdex they've grown}
--          No words, no names, nothing else. Written by the app (web/js/game/farm.js publicFarm) and checked again by
--          the friend's app on arrival (web/js/game/remote.js cleanFarm).
--
-- Until this has been run, the app sends and reads everything else as before (web/js/social.js falls back): the farm
-- works in full on your own device, and only friends are missing from the harvest board.

create schema if not exists private;
grant usage on schema private to authenticated, service_role;

create or replace function private.valid_farm(f jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
begin
  if f is null or jsonb_typeof(f) = 'null' then return true; end if;
  if jsonb_typeof(f) <> 'object' or octet_length(f::text) > 600 then return false; end if;
  if f ? 'week' and jsonb_typeof(f->'week') not in ('number', 'null') then return false; end if;
  if f ? 'n' and (jsonb_typeof(f->'n') <> 'number' or (f->>'n')::numeric < 0 or (f->>'n')::numeric > 100000) then return false; end if;
  if f ? 'dex' and (jsonb_typeof(f->'dex') <> 'number' or (f->>'dex')::numeric < 0 or (f->>'dex')::numeric > 100) then return false; end if;
  if f ? 'best' and jsonb_typeof(f->'best') <> 'null' then
    if jsonb_typeof(f->'best') <> 'object' then return false; end if;
    if jsonb_typeof(f->'best'->'c') is distinct from 'string' or (f->'best'->>'c') !~ '^[a-z_]{1,24}$' then return false; end if;
    if jsonb_typeof(f->'best'->'t') is distinct from 'number' or (f->'best'->>'t')::numeric < 0 or (f->'best'->>'t')::numeric > 9 then return false; end if;
  end if;
  if f ? 'size' and (jsonb_typeof(f->'size') <> 'array' or jsonb_array_length(f->'size') <> 2) then return false; end if;
  return true;
end $$;

revoke all on function private.valid_farm(jsonb) from public, anon;
grant execute on function private.valid_farm(jsonb) to authenticated, service_role;

alter table public.game_profiles add column if not exists farm jsonb;
alter table public.game_profiles drop constraint if exists game_farm_valid;
alter table public.game_profiles add constraint game_farm_valid check (private.valid_farm(farm));

-- Tell the API about the new column straight away.
notify pgrst, 'reload schema';

select 'v20 farm: the farm column is in place' as result,
       (select count(*) from information_schema.columns
        where table_schema = 'public' and table_name = 'game_profiles' and column_name = 'farm') as farm_column;
