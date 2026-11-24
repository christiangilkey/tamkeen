-- Self-test of the Class tab (schema v15, supabase/v15-dli-class-tab.sql). Run in the Supabase SQL editor after
-- v15. It plays made-up people, checks what each may and may not do, then ends with an error on purpose: that
-- rolls everything back, so no test data is left behind. The error message is the report:
--   RESULTS ok=N bad=[...]      (" none" means every rule held)

do $$
declare
  ut uuid := gen_random_uuid();  -- the class's teacher
  uo uuid := gen_random_uuid();  -- a teacher of another class
  ua uuid := gen_random_uuid();  -- a DLI student, invited, accepts, agrees to be seen by classmates
  ub uuid := gen_random_uuid();  -- a DLI student, in the class by its code, has NOT agreed to be seen
  uc uuid := gen_random_uuid();  -- a DLI student, invited, says no
  ux uuid := gen_random_uuid();  -- signed in, not a DLI student
  na text; nc text; nx text;
  got jsonb; cls uuid; other uuid; post uuid; n int; i int; t text;
  wk date := date_trunc('week', now())::date;
  ok int := 0;
  bad text := '';
begin
  -- ---------------------------------------------------------------- setup (as the admin)
  perform set_config('request.jwt.claims', '', true);
  insert into auth.users (id, aud, role, email)
  select u, 'authenticated', 'authenticated', u::text || '@test.invalid' from unnest(array[ut, uo, ua, ub, uc, ux]) u;
  insert into public.profiles (id) select u from unnest(array[ut, uo, ua, ub, uc, ux]) u on conflict do nothing;
  update public.profiles set username = 't' || left(replace(id::text, '-', ''), 12) where id = any (array[ut, uo, ua, ub, uc, ux]);
  select username::text into na from public.profiles where id = ua;
  select username::text into nc from public.profiles where id = uc;
  select username::text into nx from public.profiles where id = ux;
  insert into public.dli_teachers (user_id) values (ut), (uo);
  insert into public.dli_classes (name, code, staff_code) values ('Class tab test', 'ZZZ235', 'COZZZZ2355') returning id into cls;
  insert into public.dli_classes (name, code, staff_code) values ('Another class', 'YYY235', 'COYYYY2355') returning id into other;
  insert into public.dli_class_teachers (class_id, user_id) values (cls, ut), (other, uo);
  insert into public.dli_students (user_id, language, agreed_version) values (ua, 'ar', 2), (ub, 'ar', 2), (uc, 'ar', 2);
  insert into public.dli_class_students (class_id, user_id) values (cls, ub);

  -- ---------------------------------------------------------------- 1. nothing runs signed out; the tables are closed
  select string_agg(p.proname, ',') into t from pg_proc p join pg_namespace s on s.oid = p.pronamespace
  where s.nspname = 'public' and p.proname in ('dli_invite_student', 'dli_class_invited', 'dli_cancel_invite', 'dli_my_invites',
      'dli_answer_invite', 'dli_classmates', 'dli_post', 'dli_class_posts', 'dli_delete_post')
    and has_function_privilege('anon', p.oid, 'execute');
  if t is null then ok := ok + 1; else bad := bad || ' signed-out-can-run:' || t; end if;
  select count(*) into n from pg_policies p where p.schemaname = 'public' and p.tablename in ('dli_class_invites', 'dli_class_posts');
  if n = 0 then ok := ok + 1; else bad := bad || ' the-tables-have-rules=' || n; end if;
  select count(*) into n from pg_class c join pg_namespace s on s.oid = c.relnamespace
  where s.nspname = 'public' and c.relname in ('dli_class_invites', 'dli_class_posts') and c.relrowsecurity;
  if n = 2 then ok := ok + 1; else bad := bad || ' row-security-off'; end if;

  -- ---------------------------------------------------------------- 2. people who don't teach the class can't invite
  perform set_config('request.jwt.claims', json_build_object('sub', uo, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    got := public.dli_invite_student(cls, na);
    bad := bad || ' another-teacher-invited';
  exception when others then ok := ok + 1;
  end;
  begin
    got := public.dli_class_invited(cls);
    bad := bad || ' another-teacher-read-the-invitations';
  exception when others then ok := ok + 1;
  end;
  begin
    got := public.dli_classmates(cls);
    bad := bad || ' another-teacher-read-the-people';
  exception when others then ok := ok + 1;
  end;
  begin
    got := public.dli_class_posts(cls);
    bad := bad || ' another-teacher-read-the-posts';
  exception when others then ok := ok + 1;
  end;
  begin
    got := public.dli_post(cls, '{"title":"x","kind":"page"}'::jsonb);
    bad := bad || ' another-teacher-posted';
  exception when others then ok := ok + 1;
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    got := public.dli_invite_student(cls, na);
    bad := bad || ' student-invited-someone';
  exception when others then ok := ok + 1;
  end;
  begin
    got := public.dli_post(cls, '{"title":"x","kind":"page"}'::jsonb);
    bad := bad || ' student-posted';
  exception when others then ok := ok + 1;
  end;
  execute 'reset role';

  -- ---------------------------------------------------------------- 3. the teacher invites by username
  perform set_config('request.jwt.claims', json_build_object('sub', ut, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  if public.dli_invite_student(cls, nx)->>'status' = 'no' then ok := ok + 1; else bad := bad || ' invited-someone-who-is-not-a-dli-student'; end if;
  if public.dli_invite_student(cls, 'nobody_by_this_name')->>'status' = 'no' then ok := ok + 1; else bad := bad || ' invited-nobody'; end if;
  if public.dli_invite_student(cls, '<b>')->>'status' = 'no' then ok := ok + 1; else bad := bad || ' odd-name-accepted'; end if;
  got := public.dli_invite_student(cls, '  @' || upper(na) || ' ');
  if got->>'status' = 'invited' and got->>'username' = na then ok := ok + 1; else bad := bad || ' invite-refused:' || got::text; end if;
  if public.dli_invite_student(cls, na)->>'status' = 'already' then ok := ok + 1; else bad := bad || ' invited-twice'; end if;
  if public.dli_invite_student(cls, nc)->>'status' = 'invited' then ok := ok + 1; else bad := bad || ' second-invite-refused'; end if;
  got := public.dli_class_invited(cls);
  if jsonb_array_length(got) = 2 and got::text not like '%@test.invalid%' then ok := ok + 1; else bad := bad || ' invited-list-wrong:' || got::text; end if;
  begin
    perform public.dli_invite_student(other, na);
    bad := bad || ' invited-to-a-class-i-do-not-teach';
  exception when others then ok := ok + 1;
  end;
  -- an invitation shows the teacher nothing about the student yet
  got := public.dli_class_report(cls);
  if jsonb_array_length(got->'students') = 1 then ok := ok + 1; else bad := bad || ' invited-student-already-in-the-report'; end if;
  execute 'reset role';

  -- ---------------------------------------------------------------- 4. the students answer
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  got := public.dli_my_invites();
  if jsonb_array_length(got) = 1 and (got->0->>'class')::uuid = cls and got->0->>'name' = 'Class tab test'
     and jsonb_array_length(got->0->'teachers') = 1 then ok := ok + 1; else bad := bad || ' my-invites-wrong:' || got::text; end if;
  begin
    got := public.dli_class_posts(cls);
    bad := bad || ' invited-but-not-joined-read-the-posts';
  exception when others then ok := ok + 1;
  end;
  if public.dli_answer_invite(other, true)->>'status' = 'gone' then ok := ok + 1; else bad := bad || ' joined-without-an-invitation'; end if;
  got := public.dli_answer_invite(cls, true);
  if got->>'status' = 'joined' and got->>'name' = 'Class tab test' then ok := ok + 1; else bad := bad || ' accept-failed:' || got::text; end if;
  if jsonb_array_length(public.dli_my_invites()) = 0 then ok := ok + 1; else bad := bad || ' invitation-stayed-after-accepting'; end if;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', uc, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  if public.dli_answer_invite(cls, false)->>'status' = 'declined' then ok := ok + 1; else bad := bad || ' decline-failed'; end if;
  execute 'reset role';
  select count(*) into n from public.dli_class_students s where s.class_id = cls;
  if n = 2 then ok := ok + 1; else bad := bad || ' students-after-answers=' || n; end if;
  select count(*) into n from public.dli_class_invites i where i.class_id = cls;
  if n = 0 then ok := ok + 1; else bad := bad || ' invitations-left=' || n; end if;

  -- ---------------------------------------------------------------- 5. a teacher takes an invitation back
  perform set_config('request.jwt.claims', json_build_object('sub', ut, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.dli_invite_student(cls, nc);
  perform public.dli_cancel_invite(cls, uc);
  if jsonb_array_length(public.dli_class_invited(cls)) = 0 then ok := ok + 1; else bad := bad || ' cancel-did-not-work'; end if;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', uo, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.dli_cancel_invite(cls, uc);
    bad := bad || ' another-teacher-cancelled';
  exception when others then ok := ok + 1;
  end;
  execute 'reset role';

  -- ---------------------------------------------------------------- 6. classmates: only those who agreed, and a word, never numbers
  insert into public.dli_weeks (user_id, week, days, minutes, reviews, remembered, new_words, words, known)
  values (ua, wk, 5, 77, 123, 99, 7, 456, 321);
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    got := public.dli_classmates(cls);
    bad := bad || ' looked-at-classmates-before-agreeing';
  exception when others then
    if sqlerrm like '%dli_agree_first%' then ok := ok + 1; else bad := bad || ' wrong-refusal:' || sqlerrm; end if;
  end;
  perform public.dli_agree('ar', 3);
  got := public.dli_classmates(cls);
  if jsonb_array_length(got->'students') = 1 and got->'students'->0->>'username' = na and (got->'students'->0->>'me')::boolean
     and got->'students'->0->>'level' in ('active', 'some', 'little')
     and jsonb_array_length(got->'teachers') = 1 then ok := ok + 1; else bad := bad || ' classmates-wrong:' || got::text; end if;
  if got::text not like '%@test.invalid%'
     and (select array_agg(k order by k) from jsonb_object_keys(got->'students'->0) k) = array['level', 'me', 'username']
  then ok := ok + 1; else bad := bad || ' classmates-leak:' || got::text; end if;
  begin
    got := public.dli_classmates(other);
    bad := bad || ' read-another-class-people';
  exception when others then ok := ok + 1;
  end;
  execute 'reset role';
  -- the teacher may always look, and sees only those who agreed
  perform set_config('request.jwt.claims', json_build_object('sub', ut, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  got := public.dli_classmates(cls);
  if jsonb_array_length(got->'students') = 1 then ok := ok + 1; else bad := bad || ' teacher-sees-people-who-did-not-agree'; end if;

  -- ---------------------------------------------------------------- 7. sending to the class
  got := public.dli_post(cls, '{"title":"A podcast","kind":"podcast","url":"https://example.org/a.mp3"}'::jsonb);
  post := (got->>'id')::uuid;
  if post is not null and jsonb_array_length(got->'old') = 0 then ok := ok + 1; else bad := bad || ' post-failed:' || got::text; end if;
  got := public.dli_post(cls, '{"title":"With words","kind":"text"}'::jsonb, cls::text || '/' || gen_random_uuid()::text || '.gz');
  if got->>'id' is not null then ok := ok + 1; else bad := bad || ' post-with-a-file-failed'; end if;
  begin
    perform public.dli_post(cls, '{"title":"x","kind":"text"}'::jsonb, other::text || '/' || gen_random_uuid()::text || '.gz');
    bad := bad || ' posted-a-file-of-another-class';
  exception when others then ok := ok + 1;
  end;
  begin
    perform public.dli_post(cls, '{"title":"x"}'::jsonb, '../' || cls::text || '/x.gz');
    bad := bad || ' odd-file-path-accepted';
  exception when others then ok := ok + 1;
  end;
  begin
    perform public.dli_post(cls, '[1,2]'::jsonb);
    bad := bad || ' a-list-was-posted';
  exception when others then ok := ok + 1;
  end;
  begin
    perform public.dli_post(cls, jsonb_build_object('title', repeat('x', 5000)));
    bad := bad || ' a-huge-post-was-accepted';
  exception when others then ok := ok + 1;
  end;
  begin
    perform public.dli_post(other, '{"title":"x","kind":"page"}'::jsonb);
    bad := bad || ' posted-to-a-class-i-do-not-teach';
  exception when others then ok := ok + 1;
  end;
  execute 'reset role';

  -- students of the class read the posts (agreeing to classmates isn't needed for that); they can't remove one
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  got := public.dli_class_posts(cls);
  if jsonb_array_length(got) = 2 and got::text not like '%@test.invalid%' and not (got->0->>'mine')::boolean
  then ok := ok + 1; else bad := bad || ' student-cannot-read-the-posts:' || got::text; end if;
  begin
    perform public.dli_delete_post(post);
    bad := bad || ' student-removed-a-post';
  exception when others then ok := ok + 1;
  end;
  begin
    got := public.dli_classmates(cls);
    bad := bad || ' student-who-did-not-agree-saw-classmates';
  exception when others then ok := ok + 1;
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', uo, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.dli_delete_post(post);
    bad := bad || ' another-teacher-removed-a-post';
  exception when others then ok := ok + 1;
  end;
  execute 'reset role';

  -- the file rules: who is in the class, who teaches it
  if private.dli_member(ua, cls) and private.dli_member(ut, cls) and not private.dli_member(uo, cls) and not private.dli_member(uc, cls)
     and not private.dli_member(ux, cls) then ok := ok + 1; else bad := bad || ' membership-wrong'; end if;
  if private.dli_class_of(cls::text) = cls and private.dli_class_of('../x') is null and private.dli_class_of('') is null
  then ok := ok + 1; else bad := bad || ' folder-name-check-wrong'; end if;
  select count(*) into n from pg_policies p where p.schemaname = 'storage' and p.tablename = 'objects' and p.policyname like 'dli-class:%';
  if n = 3 then ok := ok + 1; else bad := bad || ' file-rules=' || n; end if;
  select count(*) into n from storage.buckets b where b.id = 'dli-class' and not b.public;
  if n = 1 then ok := ok + 1; else bad := bad || ' file-folder-missing-or-public'; end if;

  -- ---------------------------------------------------------------- 8. removing, old posts, the daily cap
  perform set_config('request.jwt.claims', json_build_object('sub', ut, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.dli_delete_post(post);
  if jsonb_array_length(public.dli_class_posts(cls)) = 1 then ok := ok + 1; else bad := bad || ' remove-did-not-work'; end if;
  execute 'reset role';
  -- an old post with a file goes at the next post, and its file's path comes back for the app to delete
  update public.dli_class_posts set created_at = now() - interval '61 days' where class_id = cls;
  perform set_config('request.jwt.claims', json_build_object('sub', ut, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  got := public.dli_post(cls, '{"title":"New","kind":"page","url":"https://example.org"}'::jsonb);
  if jsonb_array_length(got->'old') = 1 and jsonb_array_length(public.dli_class_posts(cls)) = 1 then ok := ok + 1;
  else bad := bad || ' old-posts-not-cleared:' || got::text; end if;
  t := '';
  begin
    for i in 1 .. 40 loop
      perform public.dli_post(cls, '{"title":"Again","kind":"page"}'::jsonb);
    end loop;
  exception when others then t := sqlerrm;
  end;
  if t like '%dli_post_limit%' then ok := ok + 1; else bad := bad || ' no-daily-cap-on-posts:' || t; end if;
  -- guessing usernames is capped too
  for i in 1 .. 25 loop
    t := public.dli_invite_student(cls, 'guess_' || i)->>'status';
  end loop;
  if t = 'wait' then ok := ok + 1; else bad := bad || ' no-cap-on-wrong-names:' || t; end if;
  execute 'reset role';

  -- ---------------------------------------------------------------- 9. leaving the class ends it
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.dli_leave_class(cls);
  begin
    got := public.dli_class_posts(cls);
    bad := bad || ' read-the-posts-after-leaving';
  exception when others then ok := ok + 1;
  end;
  execute 'reset role';

  raise exception 'RESULTS ok=% bad=[%] (everything was rolled back)', ok, coalesce(nullif(bad, ''), ' none');
end $$;
