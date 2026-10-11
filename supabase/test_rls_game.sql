-- Self-test of the creature-game rules (schema v5). Run in the Supabase SQL editor. Plays three
-- made-up users, then ends with an error on purpose so everything is rolled back. The error
-- message is the report ("RESULTS ok=N bad=[...]").

do $$
declare
  a uuid := gen_random_uuid();  -- a player
  b uuid := gen_random_uuid();  -- a's friend
  d uuid := gen_random_uuid();  -- a stranger
  gift uuid;
  got jsonb;
  n int;
  ok int := 0;
  bad text := '';
begin
  insert into auth.users (id, aud, role, email)
  values (a, 'authenticated', 'authenticated', 'pa@test.invalid'), (b, 'authenticated', 'authenticated', 'pb@test.invalid'),
         (d, 'authenticated', 'authenticated', 'pd@test.invalid');
  insert into public.friendships (requester, addressee, status) values (a, b, 'accepted');

  -- ---- a publishes a team, reports a battle with their friend, and sends a gift
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into public.game_profiles (user_id, team, form, rating) values (a, '[{"seed": 1}]', 0.8, 1010);
  update public.game_profiles set goal_days = 3 where user_id = a;
  begin
    insert into public.game_profiles (user_id) values (b);
    bad := bad || ' wrote-someone-elses-profile';
  exception when others then ok := ok + 1;
  end;
  begin
    update public.game_profiles set team = '[1,2,3,4]' where user_id = a;
    bad := bad || ' oversized-team-accepted';
  exception when others then ok := ok + 1;
  end;
  insert into public.battles (challenger, defender, won) values (a, b, true);
  begin
    insert into public.battles (challenger, defender, won) values (a, d, true);
    bad := bad || ' battled-a-stranger';
  exception when others then ok := ok + 1;
  end;
  begin
    insert into public.battles (challenger, defender, won) values (b, a, true);
    bad := bad || ' forged-a-challenger';
  exception when others then ok := ok + 1;
  end;
  begin
    insert into public.battles (challenger, defender, won, seen) values (a, b, true, true);
    bad := bad || ' reported-a-battle-as-already-seen';
  exception when others then ok := ok + 1;
  end;
  insert into public.gifts (sender, recipient, kind, payload) values (a, b, 'item', '{"id": "hat/cap"}') returning id into gift;
  begin
    insert into public.gifts (sender, recipient, kind, payload) values (a, d, 'item', '{"id": "hat/cap"}');
    bad := bad || ' gave-to-a-stranger';
  exception when others then ok := ok + 1;
  end;
  begin
    insert into public.gifts (sender, recipient, kind, payload) values (a, b, 'coins', '{"n": 999}');
    bad := bad || ' unknown-gift-kind-accepted';
  exception when others then ok := ok + 1;
  end;
  begin
    got := public.claim_gift(gift);
    bad := bad || ' sender-claimed-own-gift';
  exception when others then ok := ok + 1;
  end;
  execute 'reset role';

  -- ---- the stranger sees none of it and can't take the gift
  perform set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.game_profiles;
  if n = 0 then ok := ok + 1; else bad := bad || ' stranger-saw-profiles=' || n; end if;
  select count(*) into n from public.battles;
  if n = 0 then ok := ok + 1; else bad := bad || ' stranger-saw-battles=' || n; end if;
  select count(*) into n from public.gifts;
  if n = 0 then ok := ok + 1; else bad := bad || ' stranger-saw-gifts=' || n; end if;
  begin
    got := public.claim_gift(gift);
    bad := bad || ' stranger-claimed-gift';
  exception when others then ok := ok + 1;
  end;
  update public.game_profiles set rating = 5000 where user_id = a;
  perform public.mark_battles_seen();
  execute 'reset role';
  select rating into n from public.game_profiles where user_id = a;
  if n = 1010 then ok := ok + 1; else bad := bad || ' stranger-changed-rating'; end if;
  select count(*) into n from public.battles where seen;
  if n = 0 then ok := ok + 1; else bad := bad || ' stranger-marked-battles-seen'; end if;

  -- ---- the friend sees the team and the result, marks it read, and claims the gift exactly once
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.game_profiles where user_id = a and goal_days = 3;
  if n = 1 then ok := ok + 1; else bad := bad || ' friend-cannot-see-profile'; end if;
  select count(*) into n from public.battles where defender = b and not seen;
  if n = 1 then ok := ok + 1; else bad := bad || ' defender-cannot-see-battle'; end if;
  update public.battles set won = false where defender = b;
  perform public.mark_battles_seen();
  got := public.claim_gift(gift);
  if got->>'kind' = 'item' and got->'payload'->>'id' = 'hat/cap' then ok := ok + 1; else bad := bad || ' gift-contents-wrong'; end if;
  begin
    got := public.claim_gift(gift);
    bad := bad || ' gift-claimed-twice';
  exception when others then ok := ok + 1;
  end;
  delete from public.gifts where id = gift;
  delete from public.battles where defender = b;
  execute 'reset role';
  select count(*) into n from public.battles where defender = b and seen and won;
  if n = 1 then ok := ok + 1; else bad := bad || ' defender-altered-or-deleted-result'; end if;
  select count(*) into n from public.gifts where id = gift and claimed_at is not null;
  if n = 1 then ok := ok + 1; else bad := bad || ' gift-deleted-or-unclaimed'; end if;

  raise exception 'RESULTS ok=% bad=[%] (everything was rolled back)', ok, coalesce(nullif(bad, ''), ' none');
end $$;
