-- Self-test of the creator's view (schema v14, supabase/v14-creator.sql). Run in the Supabase SQL editor after
-- v14. It plays a made-up creator and a made-up ordinary user, then ends with an error on purpose: that rolls
-- everything back, so no test data is left behind and the real creator is untouched. The error message is the
-- report:   RESULTS ok=N bad=[...]      (" none" means every rule held)

do $$
declare
  uc uuid := gen_random_uuid();  -- a creator
  ux uuid := gen_random_uuid();  -- an ordinary signed-in user
  got jsonb; n int; t text; before int;
  ok int := 0;
  bad text := '';
begin
  perform set_config('request.jwt.claims', '', true);
  insert into auth.users (id, aud, role, email)
  select u, 'authenticated', 'authenticated', u::text || '@test.invalid' from unnest(array[uc, ux]) u;
  insert into public.profiles (id) select u from unnest(array[uc, ux]) u on conflict do nothing;
  select count(*) into before from public.presence p where p.last_seen > now() - interval '150 seconds';
  insert into public.presence (user_id, last_seen) values (ux, now())
  on conflict (user_id) do update set last_seen = excluded.last_seen;
  insert into private.creators (user_id) values (uc);

  -- 1. nothing runs signed out; the table of creators has no way in
  select string_agg(p.proname, ',') into t from pg_proc p join pg_namespace s on s.oid = p.pronamespace
  where s.nspname = 'public' and p.proname in ('am_creator', 'creator_stats') and has_function_privilege('anon', p.oid, 'execute');
  if t is null then ok := ok + 1; else bad := bad || ' signed-out-can-run:' || t; end if;
  select count(*) into n from pg_policies q where q.schemaname = 'private' and q.tablename = 'creators';
  if n = 0 and (select c.relrowsecurity from pg_class c join pg_namespace s on s.oid = c.relnamespace
                where s.nspname = 'private' and c.relname = 'creators') then ok := ok + 1; else bad := bad || ' creators-table-open'; end if;

  -- 2. an ordinary user is told no, and can't make themselves a creator
  perform set_config('request.jwt.claims', json_build_object('sub', ux, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  if public.am_creator() = false then ok := ok + 1; else bad := bad || ' ordinary-user-is-a-creator'; end if;
  begin
    got := public.creator_stats();
    bad := bad || ' ordinary-user-read-the-figures';
  exception when others then ok := ok + 1;
  end;
  begin
    insert into private.creators (user_id) values (ux);
    bad := bad || ' made-themselves-a-creator';
  exception when others then ok := ok + 1;
  end;
  begin
    select count(*) into n from private.creators;
    if n = 0 then ok := ok + 1; else bad := bad || ' read-the-creators-table'; end if;
  exception when others then ok := ok + 1;
  end;
  begin
    perform private.is_creator(uc);
    bad := bad || ' ran-a-private-helper';
  exception when others then ok := ok + 1;
  end;
  execute 'reset role';

  -- 3. the creator gets numbers, and only numbers
  perform set_config('request.jwt.claims', json_build_object('sub', uc, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  if public.am_creator() then ok := ok + 1; else bad := bad || ' creator-not-a-creator'; end if;
  got := public.creator_stats();
  execute 'reset role';
  if (got->>'online')::int = before + 1 then ok := ok + 1; else bad := bad || ' online-count-wrong:' || (got->>'online'); end if;
  if (got->>'users')::int >= 2 and (got->>'active_30d')::int >= 1 and (got->>'db_bytes')::bigint > 1000000
     and jsonb_typeof(got->'buckets') = 'array' and jsonb_array_length(got->'tables') between 1 and 8 then ok := ok + 1;
  else bad := bad || ' figures-missing:' || got::text; end if;
  if got::text not like '%@%' and got::text not like '%' || ux::text || '%' then ok := ok + 1; else bad := bad || ' figures-name-someone'; end if;

  -- 4. deleting the creator's account takes the role with it
  delete from public.profiles p where p.id = uc;
  select count(*) into n from private.creators c where c.user_id = uc;
  if n = 0 then ok := ok + 1; else bad := bad || ' creator-row-left-behind'; end if;

  raise exception 'RESULTS ok=% bad=[%] (everything was rolled back)', ok, coalesce(nullif(bad, ''), ' none');
end $$;
