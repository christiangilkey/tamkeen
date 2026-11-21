-- Schema v14: the creator's view. Tamkeen's creator sees how many people are online and how much of the online
-- service's allowance is used. Run once in the Supabase SQL editor (safe to re-run), after v10-dli-classes.sql.
--
-- WHO THE CREATOR IS: a row in private.creators (the API cannot reach that table). The first run copies whoever
-- is the DLI owner (private.dli_owners: the account that typed the one-time owner code), so nothing has to be
-- typed and no email address is written anywhere. To add or change one by hand, in the SQL editor:
--   insert into private.creators (user_id) select id from public.profiles where username = 'the-username';
--   delete from private.creators where user_id = (select id from public.profiles where username = 'the-username');
--
-- WHAT IT ADDS: one table (who the creator is) and two functions. No data about anyone is collected: every
-- figure is counted from what the database already holds.
--   am_creator()      true or false: am I a creator? (so the app knows whether to show the bar)
--   creator_stats()   for a creator only: people online now, accounts, people active in the last 30 days, the
--                     database's size, the files' size per bucket, and the biggest tables. Numbers only: no
--                     usernames, no email addresses, nothing about any one person.
-- Figures the database cannot know (data transfer, live connections and messages, function calls) are only on
-- Supabase's own Usage page; the app says so. Self-test: supabase/test_rls_creator.sql.

create schema if not exists private;
grant usage on schema private to authenticated, service_role;

create table if not exists private.creators (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  since   timestamptz not null default now()
);
alter table private.creators enable row level security;

-- The first creator: the DLI owner, when there is one and no creator yet.
do $$
begin
  if to_regclass('private.dli_owners') is not null and not exists (select 1 from private.creators) then
    execute 'insert into private.creators (user_id) select o.user_id from private.dli_owners o on conflict do nothing';
  end if;
end $$;

create or replace function private.is_creator(person uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.creators c where c.user_id = person);
$$;

create or replace function public.am_creator() returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  return private.is_creator(auth.uid());
end $$;

-- The figures. "online": people whose app said "I'm here" in the last 150 seconds (the same heartbeat Friends
-- uses, public.presence). "active_30d": people who signed in or were seen in the last 30 days, the nearest the
-- database can get to Supabase's monthly active users.
create or replace function public.creator_stats() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  v_online integer := 0;
  v_seen_day integer := 0;
  v_users integer := 0;
  v_active integer := 0;
  v_buckets jsonb := '[]'::jsonb;
  v_tables jsonb := '[]'::jsonb;
begin
  if me is null then raise exception 'Not signed in'; end if;
  if not private.is_creator(me) then raise exception 'not_creator'; end if;
  if to_regclass('public.presence') is not null then
    select count(*) filter (where p.last_seen > now() - interval '150 seconds'),
           count(*) filter (where p.last_seen > now() - interval '1 day')
      into v_online, v_seen_day from public.presence p;
  end if;
  select count(*) into v_users from auth.users u;
  select count(*) into v_active from auth.users u
  where greatest(coalesce(u.last_sign_in_at, 'epoch'::timestamptz),
                 coalesce((select p.last_seen from public.presence p where p.user_id = u.id), 'epoch'::timestamptz))
        > now() - interval '30 days';
  select coalesce(jsonb_agg(jsonb_build_object('bucket', b.bucket_id, 'bytes', b.bytes, 'files', b.files) order by b.bytes desc), '[]'::jsonb)
    into v_buckets
  from (select o.bucket_id, coalesce(sum(nullif(o.metadata->>'size', '')::bigint), 0) as bytes, count(*) as files
        from storage.objects o group by o.bucket_id) b;
  select coalesce(jsonb_agg(jsonb_build_object('name', x.relname, 'bytes', x.bytes, 'rows', x.n) order by x.bytes desc), '[]'::jsonb)
    into v_tables
  from (select c.relname, pg_total_relation_size(c.oid) as bytes, greatest(c.reltuples, 0)::bigint as n
        from pg_catalog.pg_class c join pg_catalog.pg_namespace s on s.oid = c.relnamespace
        where s.nspname = 'public' and c.relkind = 'r' order by pg_total_relation_size(c.oid) desc limit 8) x;
  return jsonb_build_object(
    'at', now(), 'online', v_online, 'seen_today', v_seen_day, 'users', v_users, 'active_30d', v_active,
    'db_bytes', pg_database_size(current_database()), 'buckets', v_buckets, 'tables', v_tables);
end $$;

-- Signed-in people only, never the signed-out public; creator_stats refuses everyone but a creator.
revoke all on function private.is_creator(uuid) from public, anon, authenticated;
revoke all on function public.am_creator(), public.creator_stats() from public, anon;
grant execute on function public.am_creator(), public.creator_stats() to authenticated;

-- Tell the API about the new functions straight away.
notify pgrst, 'reload schema';

select 'v14 creator: in place' as result,
       (select count(*) from private.creators) as creators,
       case when (select count(*) from private.creators) = 0
            then 'no creator yet: see the top of this file for the one line to run' else 'ok' end as note;
