-- Schema v5: the creature game between friends. Run once in the Supabase SQL editor (safe to re-run).
--
--   game_profiles   one row per player: the team friends may challenge, how accurately they answer
--                   their own words, their skill rating, and this week's progress (for the friend
--                   league and the guild raid). Visible to you, your friends and your guild-mates.
--   battles         the result of a friend battle. The challenger plays it; the defender sees it later.
--   gifts           an item or an egg sent to a friend, claimed once.
--
-- No vocab, transcripts or study material is stored here: only the numbers and creatures above.

-- ---------------------------------------------------------------- game profiles
create table if not exists public.game_profiles (
  user_id     uuid primary key references public.profiles(id) on delete cascade,
  team        jsonb not null default '[]'::jsonb
              check (jsonb_typeof(team) = 'array' and jsonb_array_length(team) <= 3 and octet_length(team::text) < 6000),
  form        real not null default 0.7 check (form between 0 and 1),         -- share of own-vocab questions answered right
  rating      integer not null default 1000 check (rating between 0 and 5000), -- battle skill
  league      smallint not null default 0 check (league between 0 and 3),      -- bronze, silver, gold, diamond
  week        integer not null default 0,                                      -- the week the next two numbers belong to
  goal_days   smallint not null default 0 check (goal_days between 0 and 7),   -- days this week the daily goal was reached
  reviews     integer not null default 0 check (reviews between 0 and 100000), -- right answers this week (raid damage)
  updated_at  timestamptz not null default now()
);
alter table public.game_profiles enable row level security;
drop policy if exists "connected players see game profile" on public.game_profiles;
create policy "connected players see game profile" on public.game_profiles
  for select to authenticated using (user_id = auth.uid() or public.are_connected(auth.uid(), user_id));
drop policy if exists "set own game profile" on public.game_profiles;
create policy "set own game profile" on public.game_profiles
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "change own game profile" on public.game_profiles;
create policy "change own game profile" on public.game_profiles
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop trigger if exists game_profiles_touch on public.game_profiles;
create trigger game_profiles_touch before update on public.game_profiles
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------- friend battles
create table if not exists public.battles (
  id          uuid primary key default gen_random_uuid(),
  challenger  uuid not null references public.profiles(id) on delete cascade,
  defender    uuid not null references public.profiles(id) on delete cascade,
  won         boolean not null,   -- did the challenger win
  detail      jsonb check (detail is null or octet_length(detail::text) < 2000),
  seen        boolean not null default false,
  created_at  timestamptz not null default now(),
  check (challenger <> defender)
);
create index if not exists battles_defender_idx on public.battles (defender, seen, created_at desc);
create index if not exists battles_challenger_idx on public.battles (challenger, created_at desc);
alter table public.battles enable row level security;
drop policy if exists "see own battles" on public.battles;
create policy "see own battles" on public.battles
  for select to authenticated using (challenger = auth.uid() or defender = auth.uid());
-- Only against someone you are connected to, and not endlessly.
drop policy if exists "report a battle with a connection" on public.battles;
create policy "report a battle with a connection" on public.battles
  for insert to authenticated with check (
    challenger = auth.uid() and seen = false and public.are_connected(challenger, defender)
    and (select count(*) from public.battles b where b.challenger = auth.uid() and b.created_at > now() - interval '1 day') < 60);

-- The defender marks results as read; old results are tidied away at the same time.
create or replace function public.mark_battles_seen() returns void
language sql security definer set search_path = public as $$
  update public.battles set seen = true where defender = auth.uid() and not seen;
  delete from public.battles where (challenger = auth.uid() or defender = auth.uid()) and created_at < now() - interval '60 days';
$$;
revoke all on function public.mark_battles_seen() from public, anon;
grant execute on function public.mark_battles_seen() to authenticated;

-- ---------------------------------------------------------------- gifts
create table if not exists public.gifts (
  id          uuid primary key default gen_random_uuid(),
  sender      uuid not null references public.profiles(id) on delete cascade,
  recipient   uuid not null references public.profiles(id) on delete cascade,
  kind        text not null check (kind in ('item', 'egg')),
  payload     jsonb not null check (octet_length(payload::text) < 3000),
  claimed_at  timestamptz,
  created_at  timestamptz not null default now(),
  check (sender <> recipient)
);
create index if not exists gifts_recipient_idx on public.gifts (recipient, claimed_at, created_at desc);
alter table public.gifts enable row level security;
drop policy if exists "see own gifts" on public.gifts;
create policy "see own gifts" on public.gifts
  for select to authenticated using (sender = auth.uid() or recipient = auth.uid());
drop policy if exists "give to a connection" on public.gifts;
create policy "give to a connection" on public.gifts
  for insert to authenticated with check (
    sender = auth.uid() and claimed_at is null and public.are_connected(sender, recipient)
    and (select count(*) from public.gifts g where g.sender = auth.uid() and g.created_at > now() - interval '1 day') < 10);

-- Claim a gift: only its recipient, only once. Returns what was in it.
create or replace function public.claim_gift(g uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  contents jsonb;
begin
  update public.gifts set claimed_at = now()
  where id = g and recipient = auth.uid() and claimed_at is null
  returning jsonb_build_object('kind', kind, 'payload', payload) into contents;
  if contents is null then raise exception 'That gift is not yours to claim, or was already claimed.'; end if;
  delete from public.gifts where recipient = auth.uid() and claimed_at < now() - interval '30 days';
  return contents;
end;
$$;
revoke all on function public.claim_gift(uuid) from public, anon;
grant execute on function public.claim_gift(uuid) to authenticated;
