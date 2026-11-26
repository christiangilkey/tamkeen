-- Self-test of ranked battles (schema v18, supabase/v18-ranked.sql). Run in the Supabase SQL editor after v18.
-- It plays made-up people, checks what each may and may not do, then ends with an error on purpose: that rolls
-- everything back, so no test data is left behind. The error message is the report:
--   RESULTS ok=N bad=[...]      (" none" means every rule held)
-- (Everything here happens in one moment of the database's clock, so waiting is played by moving the queue's
-- and the matches' times back, as the admin.)

do $$
declare
  ua uuid := gen_random_uuid();  -- two players who meet
  ub uuid := gen_random_uuid();
  uc uuid := gen_random_uuid();  -- an outsider; later blocks ud
  ud uuid := gen_random_uuid();
  ue uuid := gen_random_uuid();  -- rated 500
  uf uuid := gen_random_uuid();  -- rated 0
  got jsonb; nc text; m1 text; m2 text; n int; t text; ok_b boolean;
  ok int := 0;
  bad text := '';
begin
  -- ---------------------------------------------------------------- setup (as the admin)
  perform set_config('request.jwt.claims', '', true);
  insert into auth.users (id, aud, role, email)
  select u, 'authenticated', 'authenticated', u::text || '@test.invalid' from unnest(array[ua, ub, uc, ud, ue, uf]) u;
  insert into public.profiles (id) select u from unnest(array[ua, ub, uc, ud, ue, uf]) u on conflict do nothing;
  update public.profiles set username = 't' || left(replace(id::text, '-', ''), 12) where id = any (array[ua, ub, uc, ud, ue, uf]);
  select username::text into nc from public.profiles where id = uc;

  -- ---------------------------------------------------------------- 1. closed tables; nothing runs signed out
  select string_agg(p.proname, ',') into t from pg_proc p join pg_namespace s on s.oid = p.pronamespace
  where s.nspname = 'public' and p.proname like 'ranked\_%' and has_function_privilege('anon', p.oid, 'execute');
  if t is null then ok := ok + 1; else bad := bad || ' signed-out-can-run:' || t; end if;
  select count(*) into n from pg_policies p where p.schemaname = 'public' and p.tablename like 'ranked\_%';
  if n = 0 then ok := ok + 1; else bad := bad || ' tables-have-rules=' || n; end if;
  select bool_and(c.relrowsecurity) into ok_b from pg_class c join pg_namespace s on s.oid = c.relnamespace
  where s.nspname = 'public' and c.relname in ('ranked_ratings', 'ranked_queue', 'ranked_matches');
  if ok_b then ok := ok + 1; else bad := bad || ' row-security-off'; end if;
  if not has_table_privilege('authenticated', 'public.ranked_ratings', 'update') and not has_table_privilege('authenticated', 'public.ranked_ratings', 'select')
     and not has_table_privilege('authenticated', 'public.ranked_matches', 'select') then ok := ok + 1; else bad := bad || ' tables-reachable'; end if;
  if private.ranked_change(0, 0, true, 0) = 20 and private.ranked_change(300, 500, true, 20) = 18
     and private.ranked_change(500, 300, false, 20) = -18 and private.ranked_change(0, 0, false, 0) = 0
     and private.ranked_change(2000, 0, true, 30) = 1 then ok := ok + 1; else bad := bad || ' the-sums-differ-from-ranked.js'; end if;

  -- ---------------------------------------------------------------- 2. two players at 0 are paired
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  got := public.ranked_join();
  if got->>'status' = 'waiting' and (got->>'window')::int = 100 then ok := ok + 1; else bad := bad || ' first-join:' || got::text; end if;
  if (public.ranked_me()->>'rating')::int = 0 then ok := ok + 1; else bad := bad || ' does-not-start-at-0'; end if;
  begin
    update public.ranked_ratings set rating = 9999 where user_id = ua;
    bad := bad || ' wrote-my-own-rating';
  exception when others then ok := ok + 1;
  end;
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  got := public.ranked_join();
  if got->>'status' = 'matched' and got->'rival'->>'id' = ua::text then ok := ok + 1; else bad := bad || ' not-paired:' || got::text; end if;
  m1 := got->>'match';
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  got := public.ranked_poll();
  if got->>'match' = m1 and (got->>'host')::boolean then ok := ok + 1; else bad := bad || ' other-side-not-told:' || got::text; end if;

  -- ---------------------------------------------------------------- 3. one result, from both reports
  got := public.ranked_report(m1::uuid, 'won');
  if got->>'status' = 'waiting' then ok := ok + 1; else bad := bad || ' settled-on-one-report:' || got::text; end if;
  got := public.ranked_report(m1::uuid, 'lost');                 -- (a second report from the same side changes nothing)
  perform set_config('request.jwt.claims', json_build_object('sub', uc, 'role', 'authenticated')::text, true);
  begin
    got := public.ranked_report(m1::uuid, 'won');
    bad := bad || ' outsider-reported';
  exception when others then ok := ok + 1;
  end;
  begin
    got := public.ranked_result(m1::uuid);
    bad := bad || ' outsider-read-a-match';
  exception when others then ok := ok + 1;
  end;
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  got := public.ranked_report(m1::uuid, 'lost');
  if got->>'outcome' = 'lost' and (got->>'change')::int = 0 and (got->>'rating')::int = 0 then ok := ok + 1; else bad := bad || ' loser-at-0:' || got::text; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  got := public.ranked_result(m1::uuid);
  if got->>'outcome' = 'won' and (got->>'change')::int = 20 and (got->>'rating')::int = 20 then ok := ok + 1; else bad := bad || ' winner:' || got::text; end if;

  -- ---------------------------------------------------------------- 4. both say "won": nothing changes
  got := public.ranked_join();
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  got := public.ranked_join();
  m2 := got->>'match';
  if m2 is not null and m2 <> m1 then ok := ok + 1; else bad := bad || ' second-match:' || got::text; end if;
  got := public.ranked_report(m2::uuid, 'won');
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  got := public.ranked_report(m2::uuid, 'won');
  if got->>'outcome' = 'void' and (got->>'rating')::int = 20 then ok := ok + 1; else bad := bad || ' both-won-moved-points:' || got::text; end if;

  -- ---------------------------------------------------------------- 5. leaving counts as a loss, at once
  got := public.ranked_join();
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  got := public.ranked_join();
  m2 := got->>'match';
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  got := public.ranked_report(m2::uuid, 'quit');
  if got->>'outcome' = 'lost' and (got->>'change')::int < 0 then ok := ok + 1; else bad := bad || ' quit-not-a-loss:' || got::text; end if;

  -- ---------------------------------------------------------------- 6. no daily limit for the same two players
  got := public.ranked_join();
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  got := public.ranked_join();
  m2 := got->>'match';
  got := public.ranked_report(m2::uuid, 'won');
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  got := public.ranked_report(m2::uuid, 'lost');                -- (their third that moved points today)
  got := public.ranked_join();
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  got := public.ranked_join();
  if got->>'status' = 'matched' then ok := ok + 1; else bad := bad || ' fourth-pairing-refused:' || got::text; end if;
  m2 := got->>'match';
  got := public.ranked_report(m2::uuid, 'won');
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  got := public.ranked_report(m2::uuid, 'lost');
  if got->>'outcome' = 'lost' and (got->>'change')::int < 0 then ok := ok + 1; else bad := bad || ' fourth-battle-moved-nothing:' || got::text; end if;

  -- ---------------------------------------------------------------- 7. blocked people are never paired
  execute 'reset role';
  insert into public.blocks (blocker, blocked) values (uc, ud);
  perform set_config('request.jwt.claims', json_build_object('sub', uc, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  got := public.ranked_join();
  perform set_config('request.jwt.claims', json_build_object('sub', ud, 'role', 'authenticated')::text, true);
  got := public.ranked_join();
  if got->>'status' = 'waiting' then ok := ok + 1; else bad := bad || ' blocked-paired:' || got::text; end if;
  perform public.ranked_leave();
  perform set_config('request.jwt.claims', json_build_object('sub', uc, 'role', 'authenticated')::text, true);
  perform public.ranked_leave();

  -- ---------------------------------------------------------------- 8. the window widens with waiting
  execute 'reset role';
  insert into public.ranked_ratings (user_id, rating, games, wins) values (ue, 500, 30, 20);
  perform set_config('request.jwt.claims', json_build_object('sub', ue, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  got := public.ranked_join();
  perform set_config('request.jwt.claims', json_build_object('sub', uf, 'role', 'authenticated')::text, true);
  got := public.ranked_join();
  if got->>'status' = 'waiting' then ok := ok + 1; else bad := bad || ' 500-points-apart-paired-at-once'; end if;
  execute 'reset role';
  update public.ranked_queue set joined_at = now() - interval '50 seconds' where user_id = ue;
  execute 'set local role authenticated';
  got := public.ranked_poll();
  if got->>'status' = 'matched' and got->'rival'->>'id' = ue::text then ok := ok + 1; else bad := bad || ' window-never-widened:' || got::text; end if;
  m2 := got->>'match';

  -- ---------------------------------------------------------------- 9. a vanished player: nothing changes, then losses
  got := public.ranked_report(m2::uuid, 'won');                 -- (uf says won; ue never reports)
  execute 'reset role';
  update public.ranked_matches set created_at = now() - interval '11 minutes' where id = m2::uuid;
  execute 'set local role authenticated';
  got := public.ranked_result(m2::uuid);
  if got->>'outcome' = 'void' then ok := ok + 1; else bad := bad || ' one-sided-report-counted:' || got::text; end if;
  execute 'reset role';
  update public.ranked_matches set silent = ue, settled_at = now() - interval '1 hour' where id = m2::uuid;
  insert into public.ranked_matches (a, b, a_rating, b_rating, seed, outcome, silent, settled_at, created_at)
  values (ue, uf, 500, 0, 1, 'void', ue, now() - interval '2 hours', now() - interval '2 hours');
  insert into public.ranked_matches (a, b, a_rating, b_rating, a_games, b_games, seed, b_said, created_at)
  values (ue, uf, 500, 0, 30, 1, 2, 'won', now() - interval '11 minutes') returning id::text into m2;
  execute 'set local role authenticated';
  got := public.ranked_result(m2::uuid);
  if got->>'outcome' = 'won' and (got->>'change')::int > 0 then ok := ok + 1; else bad := bad || ' third-vanishing-not-a-loss:' || got::text; end if;

  -- ---------------------------------------------------------------- 10. the leaderboard: usernames only, no blocked
  perform set_config('request.jwt.claims', json_build_object('sub', ud, 'role', 'authenticated')::text, true);
  got := public.ranked_top(50);
  if not exists (select 1 from jsonb_array_elements(got) x where x ? 'id' or x ? 'user_id' or x ? 'email') then ok := ok + 1; else bad := bad || ' top-shows-more-than-names'; end if;
  execute 'reset role';
  insert into public.ranked_ratings (user_id, rating, games, wins) values (uc, 99999, 5, 5)
  on conflict (user_id) do update set rating = 99999, games = 5 where public.ranked_ratings.user_id = uc;
  execute 'set local role authenticated';
  got := public.ranked_top(50);
  if not exists (select 1 from jsonb_array_elements(got) x where x->>'username' = nc)
  then ok := ok + 1; else bad := bad || ' blocker-on-the-blocked-ones-leaderboard'; end if;
  execute 'reset role';

  raise exception 'RESULTS ok=% bad=[%]', ok, case when bad = '' then ' none' else bad end;
end $$;
