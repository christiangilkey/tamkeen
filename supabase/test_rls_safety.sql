-- Self-test of the safety and privacy rules (schema v8, supabase/v8-safety.sql). Run in the
-- Supabase SQL editor after v8. It plays made-up users, checks what each may and may not do,
-- then ends with an error on purpose: that rolls everything back, so no test data is left
-- behind and nothing real is deleted (the nightly clean-up it calls is undone too, and the file
-- deletions it might ask for are never sent). The error message is the report:
--   RESULTS ok=N bad=[...] notes=[...]
-- "bad" lists rules that didn't hold. "notes" lists things to look at that aren't broken rules
-- (for example pg_cron not turned on yet, or no Storage key for deleting old files at night).

do $$
declare
  ua uuid := gen_random_uuid();  -- alice
  ub uuid := gen_random_uuid();  -- bob: alice's friend
  uc uuid := gen_random_uuid();  -- carol: in alice's guild, not her friend
  ud uuid := gen_random_uuid();  -- dave: a stranger, later alice's friend
  ue uuid := gen_random_uuid();  -- eve: deletes her own account
  uf uuid := gen_random_uuid();  -- frank: eve's friend and guild-mate
  uh uuid := gen_random_uuid();  -- hank: deleted in the dashboard
  uk uuid := gen_random_uuid();  -- kim: deleted by the admin function
  extra uuid[];                  -- 21 more people, for the friend-request limit
  na text; nb text; nd text;
  ab text; ac text; ad text; ef text;
  g uuid; g_e uuid; g_alone uuid; g_h uuid; folder_e uuid; folder_f uuid; word_e uuid;
  mid uuid; mid2 uuid; rid uuid; old_battle uuid; new_battle uuid; old_gift uuid;
  res jsonb; t text; n int; i int; at_ timestamptz;
  ok int := 0;
  bad text := '';
  notes text := '';
begin
  -- ---------------------------------------------------------------- setup (as the admin: no limits apply)
  perform set_config('request.jwt.claims', '', true);
  select array_agg(gen_random_uuid()) into extra from generate_series(1, 21);
  insert into auth.users (id, aud, role, email)
  select u, 'authenticated', 'authenticated', u::text || '@test.invalid'
  from unnest(array[ua, ub, uc, ud, ue, uf, uh, uk] || extra) u;
  update public.profiles set username = 't' || left(replace(id::text, '-', ''), 12)
  where id = any (array[ua, ub, uc, ud, ue, uf, uh, uk] || extra);
  select username::text into na from public.profiles where id = ua;
  select username::text into nb from public.profiles where id = ub;
  select username::text into nd from public.profiles where id = ud;
  ab := least(ua::text, ub::text) || '_' || greatest(ua::text, ub::text);
  ac := least(ua::text, uc::text) || '_' || greatest(ua::text, uc::text);
  ad := least(ua::text, ud::text) || '_' || greatest(ua::text, ud::text);
  ef := least(ue::text, uf::text) || '_' || greatest(ue::text, uf::text);
  insert into public.friendships (requester, addressee, status) values (ua, ub, 'accepted'), (ue, uf, 'accepted');
  insert into public.guilds (name, tag, owner) values ('Safety test ' || left(ua::text, 8), 'STA', ua) returning id into g;
  insert into public.guild_members (guild_id, user_id) values (g, ua), (g, uc);
  insert into public.statuses (user_id, message) values (ua, 'alice studies'), (uc, 'carol studies');
  insert into public.presence (user_id) values (ua), (uc);
  insert into public.game_profiles (user_id, team) values (ua, '[{"seed": 1, "type": "ember"}]');

  -- ---------------------------------------------------------------- 1. the old helpers are gone; nothing runs signed out
  if to_regprocedure('public.are_friends(uuid,uuid)') is null and to_regprocedure('public.are_connected(uuid,uuid)') is null
     and to_regprocedure('public.same_guild(uuid,uuid)') is null and to_regprocedure('public.in_guild(uuid,uuid)') is null
     and to_regprocedure('public.is_member(uuid)') is null and to_regprocedure('public.in_conversation(text)') is null then
    ok := ok + 1; else bad := bad || ' old-public-helpers-still-there';
  end if;
  select string_agg(p.proname, ',') into t from pg_proc p join pg_namespace s on s.oid = p.pronamespace
  where s.nspname = 'public' and p.prosecdef and p.prorettype <> 'trigger'::regtype
    and has_function_privilege('anon', p.oid, 'execute');
  if t is null then ok := ok + 1; else bad := bad || ' signed-out-callers-can-run:' || t; end if;
  select string_agg(p.proname, ',') into t from pg_proc p join pg_namespace s on s.oid = p.pronamespace
  where s.nspname = 'private' and has_function_privilege('anon', p.oid, 'execute');
  if t is null and not has_schema_privilege('anon', 'private', 'usage') then ok := ok + 1;
  else bad := bad || ' signed-out-callers-reach-private:' || coalesce(t, 'the schema'); end if;
  if not has_function_privilege('authenticated', 'private.delete_user(uuid)', 'execute')
     and not has_function_privilege('authenticated', 'private.nightly_cleanup()', 'execute')
     and not has_function_privilege('authenticated', 'private.note_use(uuid,text,integer,integer,bigint)', 'execute') then
    ok := ok + 1; else bad := bad || ' users-can-run-admin-functions';
  end if;

  -- ---------------------------------------------------------------- 2. the helpers answer only about the person asking
  perform set_config('request.jwt.claims', json_build_object('sub', ud, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  if not private.are_friends(ua, ub) and not private.same_guild(ua, uc) and not private.are_connected(ua, ub)
     and not private.in_guild(g, ua) then ok := ok + 1; else bad := bad || ' helper-answered-about-other-people'; end if;

  -- ---------------------------------------------------------------- 3. profiles: a stranger finds people only by exact username
  select count(*) into n from public.profiles;
  if n = 1 then ok := ok + 1; else bad := bad || ' stranger-lists-profiles=' || n; end if;
  select count(*) into n from public.find_user(upper(na));
  if n = 1 then ok := ok + 1; else bad := bad || ' exact-username-not-found'; end if;
  select count(*) into n from public.find_user('@' || na);
  if n = 1 then ok := ok + 1; else bad := bad || ' username-with-at-not-found'; end if;
  select count(*) into n from public.find_user(left(na, 6));
  if n = 0 then ok := ok + 1; else bad := bad || ' part-of-a-username-found-someone'; end if;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.profiles where id = ua;
  if n = 1 then ok := ok + 1; else bad := bad || ' friend-cant-see-profile'; end if;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', uc, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.profiles where id = ua;
  if n = 1 then ok := ok + 1; else bad := bad || ' guild-mate-cant-see-profile'; end if;
  execute 'reset role';

  -- ---------------------------------------------------------------- 4. friend requests by username; pending requests see each other
  perform set_config('request.jwt.claims', json_build_object('sub', ud, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  t := public.send_friend_request(upper(na))->>'status';
  if t = 'sent' then ok := ok + 1; else bad := bad || ' request-not-sent:' || t; end if;
  t := public.send_friend_request(na)->>'status';
  if t = 'already_sent' then ok := ok + 1; else bad := bad || ' second-request:' || t; end if;
  t := public.send_friend_request('nobody_' || left(na, 8))->>'status';
  if t = 'not_found' then ok := ok + 1; else bad := bad || ' unknown-name:' || t; end if;
  t := public.send_friend_request(nd)->>'status';
  if t = 'self' then ok := ok + 1; else bad := bad || ' request-to-self:' || t; end if;
  select count(*) into n from public.profiles where id = ua;
  if n = 1 then ok := ok + 1; else bad := bad || ' requester-cant-see-addressee'; end if;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.profiles where id = ud;
  if n = 1 then ok := ok + 1; else bad := bad || ' addressee-cant-see-requester'; end if;
  t := public.send_friend_request(nd)->>'status';  -- dave asked first, so this makes them friends
  if t = 'accepted' then ok := ok + 1; else bad := bad || ' answering-request:' || t; end if;

  -- ---------------------------------------------------------------- 5. only friends can message you
  begin
    insert into public.messages (sender, recipient, body) values (ua, uc, 'hi carol');
    bad := bad || ' guild-mate-who-isnt-a-friend-was-messaged';
  exception when others then ok := ok + 1;
  end;
  begin
    insert into storage.objects (bucket_id, name) values ('voice', ac || '/x.webm');
    bad := bad || ' voice-note-to-a-non-friend';
  exception when others then ok := ok + 1;
  end;
  select count(*) into n from public.statuses where user_id = uc;
  if n = 1 then ok := ok + 1; else bad := bad || ' guild-mates-lost-each-others-cards'; end if;
  insert into public.messages (sender, recipient, body) values (ua, ub, 'hello bob');
  insert into storage.objects (bucket_id, name) values ('voice', ab || '/note.webm');
  ok := ok + 1;  -- (a friend still can, text and voice)

  -- ---------------------------------------------------------------- 6. blocking
  perform public.block_user(ub);
  select count(*) into n from public.friendships where ub in (requester, addressee);
  if n = 0 then ok := ok + 1; else bad := bad || ' block-kept-the-friendship'; end if;
  select count(*) into n from public.my_blocks() where user_id = ub and username = nb;
  if n = 1 then ok := ok + 1; else bad := bad || ' block-list-wrong'; end if;
  select count(*) into n from public.profiles where id = ub;
  if n = 1 then ok := ok + 1; else bad := bad || ' cant-see-who-i-blocked'; end if;
  begin
    insert into public.messages (sender, recipient, body) values (ua, ub, 'still there?');
    bad := bad || ' messaged-someone-i-blocked';
  exception when others then ok := ok + 1;
  end;
  t := public.send_friend_request(nb)->>'status';
  if t = 'blocked' then ok := ok + 1; else bad := bad || ' request-to-blocked:' || t; end if;
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    insert into public.messages (sender, recipient, body) values (ub, ua, 'let me in');
    bad := bad || ' blocked-person-sent-a-message';
  exception when others then ok := ok + 1;
  end;
  t := public.send_friend_request(na)->>'status';
  if t = 'not_found' then ok := ok + 1; else bad := bad || ' blocked-person-request:' || t; end if;
  begin
    insert into public.friendships (requester, addressee) values (ub, ua);
    bad := bad || ' blocked-person-sent-a-request-directly';
  exception when others then ok := ok + 1;
  end;
  select (select count(*) from public.statuses where user_id = ua) + (select count(*) from public.seen_ago(array[ua]))
       + (select count(*) from public.game_profiles where user_id = ua) + (select count(*) from public.profiles where id = ua)
       + (select count(*) from public.find_user(na)) into n;
  if n = 0 then ok := ok + 1; else bad := bad || ' blocked-person-still-sees=' || n; end if;
  begin
    insert into public.battles (challenger, defender, won) values (ub, ua, true);
    bad := bad || ' blocked-person-challenged';
  exception when others then ok := ok + 1;
  end;
  begin
    insert into public.gifts (sender, recipient, kind, payload) values (ub, ua, 'item', '{"id": "hat/cap"}');
    bad := bad || ' blocked-person-sent-a-gift';
  exception when others then ok := ok + 1;
  end;
  begin
    insert into storage.objects (bucket_id, name) values ('voice', ab || '/sneaky.webm');
    bad := bad || ' blocked-person-uploaded-a-voice-note';
  exception when others then ok := ok + 1;
  end;
  execute 'reset role';

  -- a block between guild-mates hides the card and online status (the name stays in the guild's list)
  perform set_config('request.jwt.claims', json_build_object('sub', uc, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.block_user(ua);
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select (select count(*) from public.statuses where user_id = uc) + (select count(*) from public.seen_ago(array[uc])) into n;
  if n = 0 then ok := ok + 1; else bad := bad || ' blocked-guild-mate-still-sees-card=' || n; end if;
  -- unblocking lets them ask again (the friendship doesn't come back by itself)
  perform public.unblock_user(ub);
  select count(*) into n from public.my_blocks();
  if n = 0 then ok := ok + 1; else bad := bad || ' unblock-failed'; end if;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', uc, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.unblock_user(ua);
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  t := public.send_friend_request(na)->>'status';
  if t = 'sent' then ok := ok + 1; else bad := bad || ' request-after-unblock:' || t; end if;
  execute 'reset role';

  -- ---------------------------------------------------------------- 7. reports keep a copy; only the admin reads them
  perform set_config('request.jwt.claims', json_build_object('sub', ud, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into public.messages (sender, recipient, body) values (ud, ua, 'something rude') returning id into mid2;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  rid := public.report_user(ud, 'harassment', 'test report', mid2);
  begin
    select count(*) into n from public.reports;
    bad := bad || ' reporter-can-read-reports';
  exception when others then ok := ok + 1;
  end;
  begin
    perform public.report_user(ud, 'not a reason');
    bad := bad || ' unknown-report-reason-accepted';
  exception when others then ok := ok + 1;
  end;
  begin
    perform public.report_user(ua, 'spam');
    bad := bad || ' reported-myself';
  exception when others then ok := ok + 1;
  end;
  execute 'reset role';
  select count(*) into n from public.reports
  where id = rid and reporter = ua and reported = ud and snapshot->'message'->>'body' = 'something rude'
    and snapshot->'profile'->>'username' = nd;
  if n = 1 then ok := ok + 1; else bad := bad || ' report-copy-wrong'; end if;
  -- a message that isn't one they sent you isn't copied
  perform set_config('request.jwt.claims', json_build_object('sub', ud, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  rid := public.report_user(ua, 'spam', '', mid2);
  execute 'reset role';
  select count(*) into n from public.reports where id = rid and snapshot ? 'message_missing' and not snapshot ? 'message';
  if n = 1 then ok := ok + 1; else bad := bad || ' copied-a-message-not-sent-to-the-reporter'; end if;

  -- ---------------------------------------------------------------- 8. limits, and the server's clock
  -- 20 friend requests a day; cancelling one doesn't give it back
  perform set_config('request.jwt.claims', json_build_object('sub', extra[1], 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  for i in 2..21 loop
    insert into public.friendships (requester, addressee) values (extra[1], extra[i]);
  end loop;
  begin
    insert into public.friendships (requester, addressee) values (extra[1], ua);
    bad := bad || ' twenty-first-request-sent';
  exception when others then
    get stacked diagnostics t = message_text;
    if t = 'daily_limit' then ok := ok + 1; else bad := bad || ' request-limit-wrong-error:' || t; end if;
  end;
  delete from public.friendships where requester = extra[1] and addressee = extra[2];
  begin
    insert into public.friendships (requester, addressee) values (extra[1], extra[2]);
    bad := bad || ' cancel-and-resend-dodged-the-limit';
  exception when others then ok := ok + 1;
  end;
  execute 'reset role';
  -- 500 messages a day
  perform set_config('request.jwt.claims', '', true);
  insert into private.rate_log (user_id, kind) select ud, 'message' from generate_series(1, 500);
  perform set_config('request.jwt.claims', json_build_object('sub', ud, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    insert into public.messages (sender, recipient, body) values (ud, ua, 'number 501');
    bad := bad || ' message-501-sent';
  exception when others then
    get stacked diagnostics t = message_text;
    if t = 'daily_limit' then ok := ok + 1; else bad := bad || ' message-limit-wrong-error:' || t; end if;
  end;
  execute 'reset role';
  delete from private.rate_log where user_id = ud and kind = 'message';
  -- smaller messages; a voice note's file must be in the two people's own folder; the time is the server's
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    insert into public.messages (sender, recipient, kind, payload)
    values (ua, ud, 'share', jsonb_build_object('words', '[]'::jsonb, 'pad', repeat('x', 600000)));
    bad := bad || ' oversized-message-sent';
  exception when others then ok := ok + 1;
  end;
  begin
    insert into public.messages (sender, recipient, kind, payload) values (ua, ud, 'voice', jsonb_build_object('path', ab || '/note.webm', 'seconds', 3));
    bad := bad || ' voice-note-pointing-at-another-chat';
  exception when others then ok := ok + 1;
  end;
  insert into public.messages (sender, recipient, kind, payload) values (ua, ud, 'voice', jsonb_build_object('path', ad || '/n.webm', 'seconds', 3));
  insert into public.messages (sender, recipient, body, created_at) values (ua, ud, 'from the past?', '2000-01-01') returning created_at into at_;
  if at_ > now() - interval '1 minute' then ok := ok + 1; else bad := bad || ' app-chose-the-message-time'; end if;
  -- an old date doesn't dodge the 10 gifts a day
  for i in 1..10 loop
    insert into public.gifts (sender, recipient, kind, payload, created_at) values (ua, ud, 'item', '{"id": "hat/cap"}', '2000-01-01');
  end loop;
  begin
    insert into public.gifts (sender, recipient, kind, payload, created_at) values (ua, ud, 'item', '{"id": "hat/cap"}', '2000-01-01');
    bad := bad || ' backdated-gifts-dodged-the-limit';
  exception when others then ok := ok + 1;
  end;
  -- a profile photo must be in my own folder; at most 10 photo files
  begin
    update public.profiles set avatar_path = ub::text || '/x.webp' where id = ua;
    bad := bad || ' used-someone-elses-photo';
  exception when others then ok := ok + 1;
  end;
  update public.profiles set avatar_path = ua::text || '/1.webp' where id = ua;
  get diagnostics n = row_count;
  if n = 1 then ok := ok + 1; else bad := bad || ' own-photo-refused'; end if;
  for i in 1..10 loop
    insert into storage.objects (bucket_id, name) values ('avatars', ua::text || '/' || i || '.webp');
  end loop;
  begin
    insert into storage.objects (bucket_id, name) values ('avatars', ua::text || '/11.webp');
    bad := bad || ' eleventh-photo-file-allowed';
  exception when others then ok := ok + 1;
  end;
  execute 'reset role';
  -- at most 5 guilds founded each
  perform set_config('request.jwt.claims', json_build_object('sub', extra[3], 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  for i in 1..5 loop
    perform public.create_guild('SG' || i || ' ' || left(extra[3]::text, 8), 'SG' || i);
  end loop;
  begin
    perform public.create_guild('SG6 ' || left(extra[3]::text, 8), 'SG6');
    bad := bad || ' sixth-guild-founded';
  exception when others then
    get stacked diagnostics t = message_text;
    if t = 'guild_limit' then ok := ok + 1; else bad := bad || ' guild-limit-wrong-error:' || t; end if;
  end;
  execute 'reset role';

  -- ---------------------------------------------------------------- 9. the game's shared rows
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    update public.game_profiles set team = '[{"seed": 1, "type": "<img src=x onerror=alert(1)>"}]' where user_id = ua;
    bad := bad || ' unknown-creature-type-accepted';
  exception when others then ok := ok + 1;
  end;
  begin
    update public.game_profiles set team = '[{"seed": 1, "type": "tide", "name": "a name much too long for it"}]' where user_id = ua;
    bad := bad || ' long-creature-name-accepted';
  exception when others then ok := ok + 1;
  end;
  begin
    update public.game_profiles set team = '[{"seed": "1", "type": "tide"}]' where user_id = ua;
    bad := bad || ' seed-that-isnt-a-number-accepted';
  exception when others then ok := ok + 1;
  end;
  begin
    update public.game_profiles set team = '[{"seed": 1, "type": "tide", "loadout": ["<b>x</b>"]}]' where user_id = ua;
    bad := bad || ' strange-move-accepted';
  exception when others then ok := ok + 1;
  end;
  begin
    update public.game_profiles set showcase = '{"seed": 1, "type": "plasma"}' where user_id = ua;
    bad := bad || ' unknown-showcase-type-accepted';
  exception when others then ok := ok + 1;
  end;
  begin
    update public.game_profiles set reviews = 50000 where user_id = ua;
    bad := bad || ' implausible-reviews-accepted';
  exception when others then ok := ok + 1;
  end;
  begin
    update public.game_profiles set streak = 6000 where user_id = ua;
    bad := bad || ' implausible-streak-accepted';
  exception when others then ok := ok + 1;
  end;
  update public.game_profiles
  set team = '[{"seed": 7, "type": "dusk", "growth": 0.5, "variant": null, "partnerHue": 120, "name": "Nox", "equipped": {"hat": "hat/cap"}, "loadout": ["tackle", "shade"], "known": 120, "cards": 30}]',
      showcase = '{"seed": 7, "type": "dusk", "growth": 0.5, "variant": "nocturne", "partnerHue": 120, "show": null, "name": "Nox"}',
      reviews = 340, streak = 12, xp_today = 900, language = 'ar', xp_day = '2026-11-06'
  where user_id = ua;
  get diagnostics n = row_count;
  if n = 1 then ok := ok + 1; else bad := bad || ' a-real-team-was-refused'; end if;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', ud, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    insert into public.gifts (sender, recipient, kind, payload) values (ud, ua, 'egg', '{"seed": 3, "type": "plasma"}');
    bad := bad || ' egg-of-unknown-type-sent';
  exception when others then ok := ok + 1;
  end;
  begin
    insert into public.gifts (sender, recipient, kind, payload) values (ud, ua, 'item', '{"id": "<script>"}');
    bad := bad || ' strange-item-sent';
  exception when others then ok := ok + 1;
  end;
  insert into public.gifts (sender, recipient, kind, payload) values (ud, ua, 'egg', '{"seed": 3, "type": "spark"}');
  ok := ok + 1;

  -- ---------------------------------------------------------------- 10. clean-up hands back only the chat's own files
  insert into public.messages (sender, recipient, kind, payload) values (ud, ua, 'share', jsonb_build_object('folder', null,
    'words', jsonb_build_array(jsonb_build_object('text', 'x', 'clip', ab || '/clip-1.ogg'),
                               jsonb_build_object('text', 'y', 'clip', ad || '/clip-2.ogg')))) returning id into mid;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select string_agg(x, ',') into t from public.dismiss_message(mid) as x;
  if t = ad || '/clip-2.ogg' then ok := ok + 1; else bad := bad || ' dismiss-handed-back:' || coalesce(t, 'nothing'); end if;
  execute 'reset role';

  -- ---------------------------------------------------------------- 11. the nightly clean-up
  perform set_config('request.jwt.claims', '', true);
  insert into public.messages (sender, recipient, body) values (ua, ud, 'very old') returning id into mid;
  update public.messages set created_at = now() - interval '31 days' where id = mid;
  insert into public.battles (challenger, defender, won) values (ua, ud, true) returning id into old_battle;
  insert into public.battles (challenger, defender, won) values (ud, ua, false) returning id into new_battle;
  update public.battles set created_at = now() - interval '61 days' where id = old_battle;
  update public.battles set created_at = now() - interval '59 days' where id = new_battle;
  insert into public.gifts (sender, recipient, kind, payload) values (ud, ua, 'item', '{"id": "hat/cap"}') returning id into old_gift;
  update public.gifts set claimed_at = now() - interval '31 days' where id = old_gift;
  insert into private.rate_log (user_id, kind, at) values (ua, 'old', now() - interval '3 days');
  res := private.nightly_cleanup();
  select (select count(*) from public.messages where id = mid) + (select count(*) from public.battles where id = old_battle)
       + (select count(*) from public.gifts where id = old_gift) + (select count(*) from private.rate_log where user_id = ua and kind = 'old') into n;
  if n = 0 then ok := ok + 1; else bad := bad || ' nightly-left-old-rows=' || n; end if;
  select count(*) into n from public.battles where id = new_battle;
  if n = 1 then ok := ok + 1; else bad := bad || ' nightly-removed-a-recent-battle'; end if;
  if to_regclass('cron.job') is null then
    notes := notes || ' pg_cron-is-off:the-nightly-job-isnt-scheduled';
  else
    execute 'select count(*) from cron.job where jobname = $1 and active' into n using 'tamkeen-nightly-cleanup';
    if n = 1 then ok := ok + 1; else bad := bad || ' nightly-job-not-scheduled'; end if;
  end if;
  if not exists (select 1 from pg_extension where extname = 'pg_net') or to_regclass('vault.decrypted_secrets') is null then
    notes := notes || ' no-pg_net-or-vault:old-files-are-removed-by-the-apps';
  else
    execute 'select count(*) from vault.decrypted_secrets where name in ($1, $2)' into n using 'project_url', 'secret_key';
    if n < 2 then notes := notes || ' no-Storage-key-in-Vault:old-files-are-removed-by-the-apps'; end if;
  end if;

  -- ---------------------------------------------------------------- 12. deleting an account
  insert into public.guilds (name, tag, owner) values ('Eve test ' || left(ue::text, 8), 'EVE', ue) returning id into g_e;
  insert into public.guild_members (guild_id, user_id) values (g_e, ue), (g_e, uf);
  insert into public.guilds (name, tag, owner) values ('Eve alone ' || left(ue::text, 8), 'EVA', ue) returning id into g_alone;
  insert into public.guild_members (guild_id, user_id) values (g_alone, ue);
  insert into public.shared_folders (name, owner) values ('Eve words', ue) returning id into folder_e;
  insert into public.shared_folder_members (folder_id, user_id) values (folder_e, ue), (folder_e, uf);
  insert into public.shared_folders (name, owner) values ('Frank words', uf) returning id into folder_f;
  insert into public.shared_folder_members (folder_id, user_id) values (folder_f, uf), (folder_f, ue);
  insert into public.shared_words (folder_id, text, added_by) values (folder_f, 'kitab', ue) returning id into word_e;
  insert into public.statuses (user_id, message) values (ue, 'eve studies');
  insert into public.presence (user_id) values (ue);
  insert into public.game_profiles (user_id, team) values (ue, '[{"seed": 2, "type": "grove"}]');
  insert into public.messages (sender, recipient, body) values (ue, uf, 'bye');
  insert into public.battles (challenger, defender, won) values (ue, uf, true);
  insert into public.gifts (sender, recipient, kind, payload) values (uf, ue, 'item', '{"id": "hat/cap"}');
  insert into public.blocks (blocker, blocked) values (ue, ud);
  insert into public.reports (reporter, reported, reason) values (ue, ud, 'spam') returning id into rid;
  perform set_config('request.jwt.claims', json_build_object('sub', ue, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into storage.objects (bucket_id, name) values ('avatars', ue::text || '/1.webp');
  insert into storage.objects (bucket_id, name) values ('voice', ef || '/1.webm');
  select count(*) into n from public.my_files();
  if n = 2 then ok := ok + 1; else bad := bad || ' my-files-found=' || n || '(the-postgres-role-must-see-storage.objects)'; end if;
  res := public.delete_my_account();
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  if (res->>'sign_in_removed')::boolean then ok := ok + 1;
  else bad := bad || ' sign-in-not-removed:' || coalesce((select what from private.admin_todo order by id desc limit 1), '?'); end if;
  if (res->>'guilds_passed_on')::int = 1 and (res->>'guilds_closed')::int = 1 and (res->>'folders_passed_on')::int = 1 then
    ok := ok + 1; else bad := bad || ' delete-summary-wrong:' || res::text;
  end if;
  select count(*) into n from public.guilds where id = g_e and owner = uf;
  if n = 1 then ok := ok + 1; else bad := bad || ' guild-not-passed-on'; end if;
  select count(*) into n from public.guilds where id = g_alone;
  if n = 0 then ok := ok + 1; else bad := bad || ' empty-guild-left-behind'; end if;
  select count(*) into n from public.shared_folders where id = folder_e and owner = uf;
  if n = 1 then ok := ok + 1; else bad := bad || ' shared-folder-not-passed-on'; end if;
  select count(*) into n from public.shared_words where id = word_e and added_by is null;
  if n = 1 then ok := ok + 1; else bad := bad || ' word-in-friends-folder-lost-or-still-named'; end if;
  select (select count(*) from public.profiles where id = ue) + (select count(*) from auth.users where id = ue)
       + (select count(*) from public.friendships where ue in (requester, addressee))
       + (select count(*) from public.messages where ue in (sender, recipient))
       + (select count(*) from public.statuses where user_id = ue) + (select count(*) from public.presence where user_id = ue)
       + (select count(*) from public.game_profiles where user_id = ue)
       + (select count(*) from public.battles where ue in (challenger, defender))
       + (select count(*) from public.gifts where ue in (sender, recipient))
       + (select count(*) from public.blocks where ue in (blocker, blocked))
       + (select count(*) from public.guild_members where user_id = ue)
       + (select count(*) from public.shared_folder_members where user_id = ue)
       + (select count(*) from private.rate_log where user_id = ue) into n;
  if n = 0 then ok := ok + 1; else bad := bad || ' account-left-rows=' || n; end if;
  select count(*) into n from public.reports where id = rid and reporter is null;
  if n = 1 then ok := ok + 1; else bad := bad || ' report-lost-or-still-named'; end if;
  select count(*) into n from private.files_to_remove where name in (ue::text || '/1.webp', ef || '/1.webm');
  if n = 2 then ok := ok + 1; else bad := bad || ' files-not-noted-for-removal=' || n; end if;
  -- nobody else can delete an account
  perform set_config('request.jwt.claims', json_build_object('sub', ud, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    res := private.delete_user(uf);
    bad := bad || ' a-user-deleted-someone-else';
  exception when others then ok := ok + 1;
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  -- the admin can, by id
  res := private.delete_user(uk);
  select count(*) into n from auth.users where id = uk;
  if (res->>'found')::boolean and n = 0 then ok := ok + 1; else bad := bad || ' admin-delete-failed:' || res::text; end if;
  -- deleting someone in the dashboard (Authentication -> Users) also passes their guild on
  insert into public.guilds (name, tag, owner) values ('Hank test ' || left(uh::text, 8), 'HNK', uh) returning id into g_h;
  insert into public.guild_members (guild_id, user_id) values (g_h, uh), (g_h, uc);
  begin
    delete from auth.users where id = uh;
    select count(*) into n from public.guilds where id = g_h and owner = uc;
    if n = 1 then ok := ok + 1; else bad := bad || ' dashboard-delete-closed-the-guild'; end if;
  exception when others then
    notes := notes || ' couldnt-delete-a-sign-in-account-from-SQL:' || replace(sqlerrm, ' ', '_');
  end;

  -- ---------------------------------------------------------------- 13. signed out: nothing
  execute 'set local role anon';
  begin
    select count(*) into n from public.blocks;
    bad := bad || ' signed-out-reads-blocks';
  exception when others then ok := ok + 1;
  end;
  begin
    select count(*) into n from public.reports;
    bad := bad || ' signed-out-reads-reports';
  exception when others then ok := ok + 1;
  end;
  begin
    perform public.find_user(na);
    bad := bad || ' signed-out-finds-users';
  exception when others then ok := ok + 1;
  end;
  begin
    select count(*) into n from public.profiles;
    if n = 0 then ok := ok + 1; else bad := bad || ' signed-out-lists-profiles=' || n; end if;
  exception when others then ok := ok + 1;
  end;
  execute 'reset role';

  raise exception 'RESULTS ok=% bad=[%] notes=[%] (everything was rolled back)',
    ok, coalesce(nullif(bad, ''), ' none'), coalesce(nullif(notes, ''), ' none');
end $$;
