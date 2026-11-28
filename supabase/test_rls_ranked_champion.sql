-- Self-test of the ranked champion (schema v22, supabase/v22-ranked-champion.sql). Run in the Supabase SQL editor after
-- v22. It plays made-up people, checks what each may and may not see and do, then ends with an error on purpose: that
-- rolls everything back, so no test data is left behind. The error message is the report:
--   RESULTS ok=N bad=[...]      (" none" means every rule held)
-- (The made-up players are given ratings of 99,999 and 99,998, above any real player's, so they are the champions here.)

do $$
declare
  ua uuid := gen_random_uuid();  -- the champion
  ub uuid := gen_random_uuid();  -- second best
  uc uuid := gen_random_uuid();  -- someone looking
  na text; nb text;
  got jsonb; t text; n int; ok_b boolean;
  three jsonb := '[{"seed": 1, "name": "A"}, {"seed": 2, "name": "B"}, {"seed": 3, "name": "C"}]';
  ok int := 0;
  bad text := '';
begin
  -- ---------------------------------------------------------------- setup (as the admin)
  perform set_config('request.jwt.claims', '', true);
  insert into auth.users (id, aud, role, email)
  select u, 'authenticated', 'authenticated', u::text || '@test.invalid' from unnest(array[ua, ub, uc]) u;
  insert into public.profiles (id) select u from unnest(array[ua, ub, uc]) u on conflict do nothing;
  update public.profiles set username = 't' || left(replace(id::text, '-', ''), 12) where id = any (array[ua, ub, uc]);
  select username::text into na from public.profiles where id = ua;
  select username::text into nb from public.profiles where id = ub;
  insert into public.ranked_ratings (user_id, rating, games, wins) values (ua, 99999, 40, 31), (ub, 99998, 12, 9)
  on conflict (user_id) do update set rating = excluded.rating, games = excluded.games, wins = excluded.wins
  where public.ranked_ratings.user_id in (ua, ub);

  -- ---------------------------------------------------------------- 1. a closed table; nothing runs signed out
  select string_agg(p.proname, ',') into t from pg_proc p join pg_namespace s on s.oid = p.pronamespace
  where s.nspname = 'public' and p.proname in ('ranked_showcase_set', 'ranked_champion') and has_function_privilege('anon', p.oid, 'execute');
  if t is null then ok := ok + 1; else bad := bad || ' signed-out-can-run:' || t; end if;
  select count(*) into n from pg_policies p where p.schemaname = 'public' and p.tablename = 'ranked_showcase';
  if n = 0 then ok := ok + 1; else bad := bad || ' table-has-rules=' || n; end if;
  select c.relrowsecurity into ok_b from pg_class c join pg_namespace s on s.oid = c.relnamespace
  where s.nspname = 'public' and c.relname = 'ranked_showcase';
  if ok_b then ok := ok + 1; else bad := bad || ' row-security-off'; end if;
  if not has_table_privilege('authenticated', 'public.ranked_showcase', 'select') and not has_table_privilege('authenticated', 'public.ranked_showcase', 'update')
     and not has_table_privilege('authenticated', 'public.ranked_showcase', 'insert') then ok := ok + 1; else bad := bad || ' table-reachable'; end if;

  -- ---------------------------------------------------------------- 2. the champion keeps a team; everyone sees it
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  got := public.ranked_showcase_set(three, true);
  if (got->>'ok')::boolean then ok := ok + 1; else bad := bad || ' could-not-keep-a-team:' || got::text; end if;
  got := public.ranked_champion();
  if got->>'username' = na and (got->>'me')::boolean then ok := ok + 1; else bad := bad || ' champion-does-not-see-self:' || coalesce(got::text, 'null'); end if;
  perform set_config('request.jwt.claims', json_build_object('sub', uc, 'role', 'authenticated')::text, true);
  got := public.ranked_champion();
  if got->>'username' = na and (got->>'rating')::int = 99999 and (got->>'games')::int = 40 and (got->>'wins')::int = 31
     and jsonb_array_length(got->'team') = 3 and not (got->>'hidden')::boolean and not (got->>'me')::boolean
  then ok := ok + 1; else bad := bad || ' looker-sees-wrong:' || coalesce(got::text, 'null'); end if;
  if not (got ? 'id' or got ? 'user_id' or got ? 'email') then ok := ok + 1; else bad := bad || ' shows-more-than-a-username'; end if;
  begin
    perform 1 from public.ranked_showcase where user_id = ua;
    bad := bad || ' read-the-table';
  exception when others then ok := ok + 1;
  end;
  begin
    update public.ranked_showcase set team = '[]'::jsonb where user_id = ua;
    bad := bad || ' changed-someone-elses-team';
  exception when others then ok := ok + 1;
  end;
  -- (what someone else sends only ever changes their own row)
  got := public.ranked_showcase_set('[{"seed": 9}]'::jsonb, true);
  got := public.ranked_champion();
  if jsonb_array_length(got->'team') = 3 then ok := ok + 1; else bad := bad || ' looker-changed-the-champions-team'; end if;

  -- ---------------------------------------------------------------- 3. opting out: name and rating only; the team kept
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  got := public.ranked_showcase_set(null, false);
  perform set_config('request.jwt.claims', json_build_object('sub', uc, 'role', 'authenticated')::text, true);
  got := public.ranked_champion();
  if got->>'username' = na and jsonb_array_length(got->'team') = 0 and (got->>'hidden')::boolean then ok := ok + 1; else bad := bad || ' opt-out-still-shows:' || got::text; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  got := public.ranked_showcase_set(null, true);
  perform set_config('request.jwt.claims', json_build_object('sub', uc, 'role', 'authenticated')::text, true);
  got := public.ranked_champion();
  if jsonb_array_length(got->'team') = 3 and not (got->>'hidden')::boolean then ok := ok + 1; else bad := bad || ' team-lost-on-opt-out:' || got::text; end if;

  -- ---------------------------------------------------------------- 4. only a short list of creatures is kept
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  begin
    got := public.ranked_showcase_set(three || '[{"seed": 4}]'::jsonb, true);
    bad := bad || ' kept-four';
  exception when others then ok := ok + 1;
  end;
  begin
    got := public.ranked_showcase_set('["a", "b"]'::jsonb, true);
    bad := bad || ' kept-not-creatures';
  exception when others then ok := ok + 1;
  end;
  begin
    got := public.ranked_showcase_set(jsonb_build_array(jsonb_build_object('x', repeat('z', 13000))), true);
    bad := bad || ' kept-a-huge-team';
  exception when others then ok := ok + 1;
  end;
  begin
    got := public.ranked_showcase_set('{"seed": 1}'::jsonb, true);
    bad := bad || ' kept-not-a-list';
  exception when others then ok := ok + 1;
  end;

  -- ---------------------------------------------------------------- 5. blocked either way: the next best instead
  execute 'reset role';
  insert into public.blocks (blocker, blocked) values (ua, uc);
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', uc, 'role', 'authenticated')::text, true);
  got := public.ranked_champion();
  if got->>'username' = nb then ok := ok + 1; else bad := bad || ' blocked-champion-shown:' || coalesce(got::text, 'null'); end if;
  if jsonb_array_length(got->'team') = 0 and not (got->>'hidden')::boolean then ok := ok + 1; else bad := bad || ' second-has-a-team-it-never-sent'; end if;
  execute 'reset role';
  delete from public.blocks where blocker = ua and blocked = uc;
  insert into public.blocks (blocker, blocked) values (uc, ua);
  execute 'set local role authenticated';
  got := public.ranked_champion();
  if got->>'username' = nb then ok := ok + 1; else bad := bad || ' champion-i-blocked-shown:' || coalesce(got::text, 'null'); end if;
  execute 'reset role';

  -- ---------------------------------------------------------------- 6. signed out: nothing
  perform set_config('request.jwt.claims', '', true);
  begin
    got := public.ranked_champion();
    bad := bad || ' answered-signed-out';
  exception when others then ok := ok + 1;
  end;

  raise exception 'RESULTS ok=% bad=[%]', ok, case when bad = '' then ' none' else bad end;
end $$;
