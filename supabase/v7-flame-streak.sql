-- Schema v7: the flashcard streak (the flame) in the friends-list bar. Run once in the Supabase SQL
-- editor (safe to re-run). It only adds two columns to game_profiles; the existing rule already
-- limits who can read a game profile to you, your friends and your guild-mates.
--
--   streak        days in a row the player finished their flashcards (worked out by the app from
--                 its answer log, web/js/review/streak.js)
--   streak_until  when that streak runs out if nothing more is done: the player's own midnight at
--                 the end of the day after the last day counted. Friends show the number until then.
--
-- Until this has been run, the app sends and reads everything else as before (social.js falls
-- back), and only the player sees their own flame.

alter table public.game_profiles add column if not exists streak integer not null default 0 check (streak between 0 and 100000);
alter table public.game_profiles add column if not exists streak_until timestamptz;

-- Tell the API about the new columns straight away.
notify pgrst, 'reload schema';
