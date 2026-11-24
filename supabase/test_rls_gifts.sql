-- Self-test of the creator's gifts (schema v16, supabase/v16-owner-gifts.sql). Run in the Supabase SQL editor
-- after v16. It plays made-up people, checks what each may and may not do, then ends with an error on purpose:
-- that rolls everything back, so no test data is left behind. The error message is the report:
--   RESULTS ok=N bad=[...]      (" none" means every rule held)

do $$
declare
  uc uuid := gen_random_uuid();  -- a creator
  ua uuid := gen_random_uuid();  -- someone who is given things (no friend of the creator)
  ub uuid := gen_random_uuid();  -- someone else
  na text; nb text;
  got jsonb; g1 uuid; g2 uuid; n int; t text; ok_b boolean;
  ok int := 0;
  bad text := '';
begin
  -- ---------------------------------------------------------------- setup (as the admin)
  perform set_config('request.jwt.claims', '', true);
  insert into auth.users (id, aud, role, email)
  select u, 'authenticated', 'authenticated', u::text || '@test.invalid' from unnest(array[uc, ua, ub]) u;
  insert into public.profiles (id) select u from unnest(array[uc, ua, ub]) u on conflict do nothing;
  update public.profiles set username = 't' || left(replace(id::text, '-', ''), 12) where id = any (array[uc, ua, ub]);
  select username::text into na from public.profiles where id = ua;
  select username::text into nb from public.profiles where id = ub;
  insert into private.creators (user_id) values (uc);

  -- ---------------------------------------------------------------- 1. nothing runs signed out; the table is closed
  select string_agg(p.proname, ',') into t from pg_proc p join pg_namespace s on s.oid = p.pronamespace
  where s.nspname = 'public' and p.proname in ('creator_give', 'creator_gifts', 'creator_take_back', 'my_gifts', 'gifts_got')
    and has_function_privilege('anon', p.oid, 'execute');
  if t is null then ok := ok + 1; else bad := bad || ' signed-out-can-run:' || t; end if;
  select count(*) into n from pg_policies p where p.schemaname = 'public' and p.tablename = 'game_gifts';
  if n = 0 then ok := ok + 1; else bad := bad || ' the-table-has-rules=' || n; end if;
  select c.relrowsecurity into ok_b from pg_class c join pg_namespace s on s.oid = c.relnamespace where s.nspname = 'public' and c.relname = 'game_gifts';
  if ok_b then ok := ok + 1; else bad := bad || ' row-security-off'; end if;
  if not has_table_privilege('authenticated', 'public.game_gifts', 'select') and not has_table_privilege('anon', 'public.game_gifts', 'select')
  then ok := ok + 1; else bad := bad || ' the-table-can-be-read'; end if;

  -- ---------------------------------------------------------------- 2. someone who is not a creator can give nothing
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    got := public.creator_give(na, '{"coins": 1000000}'::jsonb, '');
    bad := bad || ' gave-myself-coins';
  exception when others then ok := ok + 1;
  end;
  begin
    got := public.creator_gifts(10);
    bad := bad || ' read-the-record';
  exception when others then ok := ok + 1;
  end;
  begin
    perform public.creator_take_back(gen_random_uuid());
    bad := bad || ' took-something-back';
  exception when others then ok := ok + 1;
  end;
  if public.my_gifts() = '[]'::jsonb then ok := ok + 1; else bad := bad || ' gifts-out-of-nowhere'; end if;
  execute 'reset role';

  -- ---------------------------------------------------------------- 3. the creator gives, by username, to a non-friend
  perform set_config('request.jwt.claims', json_build_object('sub', uc, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  got := public.creator_give('  @' || upper(na) || ' ', '{"coins": 50, "items": ["hat/cap"]}'::jsonb, 'Thanks for testing!');
  g1 := (got->>'id')::uuid;
  if got->>'status' = 'given' and got->>'username' = na and g1 is not null then ok := ok + 1; else bad := bad || ' give-refused:' || got::text; end if;
  got := public.creator_give(na, '{"gems": -5}'::jsonb);
  g2 := (got->>'id')::uuid;
  if got->>'status' = 'given' then ok := ok + 1; else bad := bad || ' second-give-refused'; end if;
  if public.creator_give('nobody_by_this_name', '{"coins": 1}'::jsonb)->>'status' = 'no' then ok := ok + 1; else bad := bad || ' gave-to-nobody'; end if;
  if public.creator_give('<b>', '{"coins": 1}'::jsonb)->>'status' = 'no' then ok := ok + 1; else bad := bad || ' odd-name-accepted'; end if;
  begin
    perform public.creator_give(na, '{}'::jsonb);
    bad := bad || ' an-empty-gift-was-given';
  exception when others then ok := ok + 1;
  end;
  begin
    perform public.creator_give(na, '[1, 2]'::jsonb);
    bad := bad || ' a-list-was-given';
  exception when others then ok := ok + 1;
  end;
  begin
    perform public.creator_give(na, jsonb_build_object('note', repeat('x', 5000)));
    bad := bad || ' a-huge-gift-was-given';
  exception when others then ok := ok + 1;
  end;
  got := public.creator_gifts(10);
  if jsonb_array_length(got) = 2 and got->0->>'username' = na and got->0->>'got_at' is null and got::text not like '%@test.invalid%'
  then ok := ok + 1; else bad := bad || ' record-wrong:' || got::text; end if;
  execute 'reset role';

  -- ---------------------------------------------------------------- 4. only the person it is for sees and collects it
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  if public.my_gifts() = '[]'::jsonb then ok := ok + 1; else bad := bad || ' someone-else-sees-the-gift'; end if;
  if public.gifts_got(array[g1, g2]) = 0 then ok := ok + 1; else bad := bad || ' someone-else-marked-it-collected'; end if;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  got := public.my_gifts();
  if jsonb_array_length(got) = 2 and (got->0->>'id')::uuid = g1 and got->0->'what'->>'coins' = '50' and got->0->>'note' = 'Thanks for testing!'
     and got::text not like '%given_by%' and got::text not like '%' || uc::text || '%' then ok := ok + 1;
  else bad := bad || ' my-gifts-wrong:' || got::text; end if;
  if public.gifts_got(array[g1]) = 1 then ok := ok + 1; else bad := bad || ' collect-failed'; end if;
  if public.gifts_got(array[g1]) = 0 then ok := ok + 1; else bad := bad || ' collected-twice'; end if;
  if public.gifts_got(null) = 0 and public.gifts_got(array[]::uuid[]) = 0 then ok := ok + 1; else bad := bad || ' empty-list-marked-something'; end if;
  if jsonb_array_length(public.my_gifts()) = 1 then ok := ok + 1; else bad := bad || ' collected-gift-still-waiting'; end if;
  execute 'reset role';

  -- ---------------------------------------------------------------- 5. taking back: only what nobody collected yet
  perform set_config('request.jwt.claims', json_build_object('sub', uc, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  if not public.creator_take_back(g1) then ok := ok + 1; else bad := bad || ' took-back-a-collected-gift'; end if;
  if public.creator_take_back(g2) then ok := ok + 1; else bad := bad || ' take-back-failed'; end if;
  got := public.creator_gifts(10);
  if jsonb_array_length(got) = 1 and got->0->>'got_at' is not null then ok := ok + 1; else bad := bad || ' record-after-take-back:' || got::text; end if;
  execute 'reset role';
  select count(*) into n from public.game_gifts g where g.user_id = ua;
  if n = 1 then ok := ok + 1; else bad := bad || ' rows-left=' || n; end if;

  -- ---------------------------------------------------------------- 6. a collected gift goes after a year; an account deleted takes its gifts
  update public.game_gifts set got_at = now() - interval '13 months' where id = g1;
  perform set_config('request.jwt.claims', json_build_object('sub', uc, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.creator_give(nb, '{"xp": 10}'::jsonb);
  execute 'reset role';
  select count(*) into n from public.game_gifts g where g.id = g1;
  if n = 0 then ok := ok + 1; else bad := bad || ' old-gift-kept'; end if;
  delete from auth.users where id = ub;
  select count(*) into n from public.game_gifts g where g.user_id = ub;
  if n = 0 then ok := ok + 1; else bad := bad || ' gifts-outlive-the-account'; end if;

  raise exception 'RESULTS ok=% bad=[%] (everything was rolled back)', ok, coalesce(nullif(bad, ''), ' none');
end $$;
