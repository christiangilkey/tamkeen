-- Schema v6: the small bar next to a name in the friends list. Run once in the Supabase SQL
-- editor (safe to re-run). It only adds four columns to game_profiles; the existing rule
-- already limits who can read a game profile to you, your friends and your guild-mates.
--
--   language   the language being learned ("ar", "es", ...)
--   xp_day     the player's own calendar day (YYYY-MM-DD) that xp_today belongs to
--   xp_today   XP earned that day
--   showcase   the creature they chose to show off: its seed and look, nothing else

alter table public.game_profiles add column if not exists language text check (language is null or length(language) <= 8);
alter table public.game_profiles add column if not exists xp_day text not null default '' check (length(xp_day) <= 10);
alter table public.game_profiles add column if not exists xp_today integer not null default 0 check (xp_today between 0 and 10000000);
alter table public.game_profiles add column if not exists showcase jsonb check (showcase is null or octet_length(showcase::text) < 1000);

-- Tell the API about the new columns straight away.
notify pgrst, 'reload schema';
