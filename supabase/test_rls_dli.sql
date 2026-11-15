-- Self-test of the DLI class rules (schema v10, supabase/v10-dli-classes.sql). Run in the Supabase SQL
-- editor after v10. It plays made-up people (the owner, two teachers, two students, a stranger), checks
-- what each may and may not do, then ends with an error on purpose: that rolls everything back, so no test
-- data is left behind and the real codes are untouched. The error message is the report:
--   RESULTS ok=N bad=[...]
-- "bad" lists rules that didn't hold; " none" means every rule held.

do $$
declare
  uo uuid := gen_random_uuid();  -- the owner
  ut uuid := gen_random_uuid();  -- a teacher
  u2 uuid := gen_random_uuid();  -- a second teacher
  ua uuid := gen_random_uuid();  -- a student in the teacher's class
  ub uuid := gen_random_uuid();  -- a student in no class
  ux uuid := gen_random_uuid();  -- a stranger: signed in, nothing else
  c_owner constant text := 'OWN' || repeat('A', 20);
  c_teacher constant text := 'TCH' || repeat('B', 12);
  monday date := date_trunc('week', now())::date;
  got jsonb; cls uuid; code text; staff text; n int; i int; t text;
  ok int := 0;
  bad text := '';
begin
  -- ---------------------------------------------------------------- setup (as the admin)
  perform set_config('request.jwt.claims', '', true);
  insert into auth.users (id, aud, role, email)
  select u, 'authenticated', 'authenticated', u::text || '@test.invalid' from unnest(array[uo, ut, u2, ua, ub, ux]) u;
  insert into public.profiles (id) select u from unnest(array[uo, ut, u2, ua, ub, ux]) u on conflict do nothing;
  delete from private.dli_owners where true;  -- (rolled back at the end, like everything here)
  update private.dli_config set owner_code_hash = encode(sha256(convert_to(c_owner, 'UTF8')), 'hex'),
    owner_code_until = now() + interval '1 day', teacher_code = c_teacher where only_one;

  -- ---------------------------------------------------------------- 1. nothing runs signed out; tables are closed
  select string_agg(p.proname, ',') into t from pg_proc p join pg_namespace s on s.oid = p.pronamespace
  where s.nspname = 'public' and p.proname like 'dli\_%' and has_function_privilege('anon', p.oid, 'execute');
  if t is null then ok := ok + 1; else bad := bad || ' signed-out-can-run:' || t; end if;
  select string_agg(c.relname, ',') into t from pg_class c join pg_namespace s on s.oid = c.relnamespace
  where s.nspname = 'public' and c.relname like 'dli\_%' and c.relkind = 'r'
    and (not c.relrowsecurity or exists (select 1 from pg_policies q where q.schemaname = 'public' and q.tablename = c.relname));
  if t is null then ok := ok + 1; else bad := bad || ' table-open:' || t; end if;

  -- ---------------------------------------------------------------- 2. the stranger gets nothing
  perform set_config('request.jwt.claims', json_build_object('sub', ux, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    select count(*) into n from public.dli_students;
    if n = 0 then ok := ok + 1; else bad := bad || ' stranger-read-students'; end if;
  exception when others then ok := ok + 1;
  end;
  begin
    insert into public.dli_students (user_id, last_name, language) values (ux, 'Hack', 'ar');
    bad := bad || ' wrote-the-table-directly';
  exception when others then ok := ok + 1;
  end;
  begin
    select count(*) into n from public.dli_weeks;
    if n = 0 then ok := ok + 1; else bad := bad || ' stranger-read-weeks'; end if;
  exception when others then ok := ok + 1;
  end;
  begin
    perform private.dli_code(6);
    bad := bad || ' ran-a-private-helper';
  exception when others then ok := ok + 1;
  end;
  got := public.dli_me();
  if got->'student' = 'null'::jsonb and got->'teacher' = 'null'::jsonb and (got->>'owner')::boolean = false
     and jsonb_array_length(got->'classes') = 0 then ok := ok + 1; else bad := bad || ' stranger-is-something:' || got::text; end if;
  if public.dli_use_code('not a code')->>'status' = 'no' then ok := ok + 1; else bad := bad || ' junk-code-accepted'; end if;
  begin
    got := public.dli_owner_report();
    bad := bad || ' stranger-read-the-owner-report';
  exception when others then ok := ok + 1;
  end;
  begin
    perform public.dli_create_class('Not a teacher');
    bad := bad || ' non-teacher-made-a-class';
  exception when others then ok := ok + 1;
  end;
  if public.dli_report_week(monday, 1, 1, 1, 1, 1, 1, 1) = false then ok := ok + 1; else bad := bad || ' non-student-reported-a-week'; end if;
  execute 'reset role';

  -- ---------------------------------------------------------------- 3. the owner code works once
  perform set_config('request.jwt.claims', json_build_object('sub', uo, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  if public.dli_use_code('own-aaaaa-aaaaa-aaaaa-aaaaa')->>'status' = 'owner' then ok := ok + 1; else bad := bad || ' owner-code-refused'; end if;
  if (public.dli_me()->>'owner')::boolean then ok := ok + 1; else bad := bad || ' owner-not-owner'; end if;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', ux, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  if public.dli_use_code(c_owner)->>'status' = 'no' then ok := ok + 1; else bad := bad || ' owner-code-worked-twice'; end if;
  execute 'reset role';

  -- ---------------------------------------------------------------- 4. a teacher and a class
  perform set_config('request.jwt.claims', json_build_object('sub', ut, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  if public.dli_use_code('tch bbbb bbbb bbbb')->>'status' = 'teacher' then ok := ok + 1; else bad := bad || ' teacher-code-refused'; end if;
  perform public.dli_set_teacher_name('  Ms.   Rivera ');
  got := public.dli_create_class('Arabic 101');
  cls := (got->>'id')::uuid; code := got->>'code'; staff := got->>'staff_code';
  if code ~ '^[A-HJ-NP-Z2-9]{6}$' and staff ~ '^CO[A-HJ-NP-Z2-9]{8}$' then ok := ok + 1; else bad := bad || ' odd-class-codes'; end if;
  begin
    perform public.dli_create_class('<b>bad</b>');
    bad := bad || ' markup-in-a-class-name';
  exception when others then ok := ok + 1;
  end;
  begin
    got := public.dli_owner_report();
    bad := bad || ' teacher-read-the-owner-report';
  exception when others then ok := ok + 1;
  end;
  begin
    perform public.dli_owner_new_teacher_code();
    bad := bad || ' teacher-changed-the-teacher-code';
  exception when others then ok := ok + 1;
  end;
  execute 'reset role';

  -- ---------------------------------------------------------------- 5. students
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  if public.dli_use_code(code)->>'status' = 'need_student' then ok := ok + 1; else bad := bad || ' joined-without-agreeing'; end if;
  begin
    perform public.dli_register('<script>', 'ar');
    bad := bad || ' markup-in-a-last-name';
  exception when others then ok := ok + 1;
  end;
  begin
    perform public.dli_register('Smith', 'de');
    bad := bad || ' a-language-dli-does-not-teach';
  exception when others then ok := ok + 1;
  end;
  got := public.dli_register('  Smith   Jones ', 'ar');
  if got->'student'->>'last_name' = 'Smith Jones' and got->'student'->>'language' = 'ar' then ok := ok + 1; else bad := bad || ' name-not-tidied:' || got::text; end if;
  if public.dli_use_code(lower(left(code, 3)) || '-' || right(code, 3))->>'status' = 'joined' then ok := ok + 1; else bad := bad || ' class-code-refused'; end if;
  if public.dli_use_code(staff)->>'status' = 'need_teacher' then ok := ok + 1; else bad := bad || ' student-became-a-teacher'; end if;
  if public.dli_report_week(monday, 9, 99999, 50, 80, 12, 300, 900) then ok := ok + 1; else bad := bad || ' week-refused'; end if;
  perform public.dli_report_week(monday + 70, 1, 1, 1, 1, 1, 1, 1);    -- the future: ignored
  perform public.dli_report_week(monday - 700, 1, 1, 1, 1, 1, 1, 1);   -- before agreeing: ignored
  begin
    perform public.dli_report_week(monday + 2, 1, 1, 1, 1, 1, 1, 1);
    bad := bad || ' a-week-that-is-not-a-monday';
  exception when others then ok := ok + 1;
  end;
  got := public.dli_me();
  if jsonb_array_length(got->'weeks') = 1 and (got->'weeks'->0->>'days')::int = 7 and (got->'weeks'->0->>'minutes')::int = 10080
     and (got->'weeks'->0->>'remembered')::int = 50 and (got->'weeks'->0->>'known')::int = 300 then ok := ok + 1;
  else bad := bad || ' numbers-not-pulled-into-range:' || (got->'weeks')::text; end if;
  if got->'classes'->0->>'role' = 'student' and got->'classes'->0->'teachers'->>0 = 'Ms. Rivera'
     and not (got->'classes'->0 ? 'code') then ok := ok + 1; else bad := bad || ' student-class-view-wrong:' || (got->'classes')::text; end if;
  begin
    got := public.dli_class_report(cls);
    bad := bad || ' student-read-the-class-report';
  exception when others then ok := ok + 1;
  end;
  begin
    perform public.dli_remove_student(cls, ua);
    bad := bad || ' student-removed-a-student';
  exception when others then ok := ok + 1;
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.dli_register('Baker', 'ko');
  perform public.dli_report_week(monday, 3, 40, 100, 90, 10, 200, 150);
  execute 'reset role';

  -- ---------------------------------------------------------------- 6. a teacher sees their own class only
  perform set_config('request.jwt.claims', json_build_object('sub', ut, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  got := public.dli_class_report(cls);
  if jsonb_array_length(got->'students') = 1 and got->'students'->0->>'last_name' = 'Smith Jones'
     and jsonb_array_length(got->'students'->0->'weeks') = 1 and got::text not like '%Baker%' then ok := ok + 1;
  else bad := bad || ' class-report-wrong:' || got::text; end if;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.dli_use_code(c_teacher);
  begin
    got := public.dli_class_report(cls);
    bad := bad || ' another-teacher-read-the-class';
  exception when others then ok := ok + 1;
  end;
  begin
    perform public.dli_delete_class(cls);
    bad := bad || ' another-teacher-deleted-the-class';
  exception when others then ok := ok + 1;
  end;
  if public.dli_use_code(staff)->>'status' = 'coteacher' then ok := ok + 1; else bad := bad || ' second-teacher-code-refused'; end if;
  got := public.dli_class_report(cls);
  if jsonb_array_length(got->'students') = 1 and jsonb_array_length(got->'class'->'teachers') = 2 then ok := ok + 1;
  else bad := bad || ' second-teacher-cannot-see-the-class'; end if;
  got := public.dli_new_codes(cls);
  if got->>'code' <> code and got->>'staff_code' <> staff then ok := ok + 1; else bad := bad || ' codes-not-replaced'; end if;
  execute 'reset role';

  -- ---------------------------------------------------------------- 7. the owner sees everyone
  perform set_config('request.jwt.claims', json_build_object('sub', uo, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  got := public.dli_owner_report();
  if jsonb_array_length(got->'students') = 2 and got::text like '%Baker%' and got::text like '%Smith Jones%'
     and got->>'teacher_code' = c_teacher and jsonb_array_length(got->'classes') = 1
     and jsonb_array_length(got->'teachers') = 3 then ok := ok + 1;
  else bad := bad || ' owner-report-wrong:' || got::text; end if;
  if got::text not like '%@test.invalid%' then ok := ok + 1; else bad := bad || ' owner-report-has-emails'; end if;
  t := public.dli_owner_new_teacher_code();
  if t ~ '^TCH[A-HJ-NP-Z2-9]{12}$' and t <> c_teacher then ok := ok + 1; else bad := bad || ' new-teacher-code-odd'; end if;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', ux, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  if public.dli_use_code(c_teacher)->>'status' = 'no' then ok := ok + 1; else bad := bad || ' old-teacher-code-still-works'; end if;
  execute 'reset role';

  -- ---------------------------------------------------------------- 8. leaving deletes
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.dli_unregister();
  execute 'reset role';
  select (select count(*) from public.dli_students s where s.user_id = ua) + (select count(*) from public.dli_weeks w where w.user_id = ua)
       + (select count(*) from public.dli_class_students s where s.user_id = ua) into n;
  if n = 0 then ok := ok + 1; else bad := bad || ' stopped-sharing-but-rows-left=' || n; end if;
  delete from public.profiles p where p.id = ub;   -- (what deleting an online account does)
  select (select count(*) from public.dli_students s where s.user_id = ub) + (select count(*) from public.dli_weeks w where w.user_id = ub) into n;
  if n = 0 then ok := ok + 1; else bad := bad || ' account-deleted-but-rows-left=' || n; end if;
  -- the first teacher leaves: the class stays with the second; the owner removes the second: it closes
  perform set_config('request.jwt.claims', json_build_object('sub', ut, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.dli_leave_class(cls);
  execute 'reset role';
  select count(*) into n from public.dli_classes c where c.id = cls;
  if n = 1 then ok := ok + 1; else bad := bad || ' class-closed-with-a-teacher-left'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', uo, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.dli_owner_remove_teacher(u2);
  execute 'reset role';
  select count(*) into n from public.dli_classes c where c.id = cls;
  if n = 0 then ok := ok + 1; else bad := bad || ' class-with-no-teacher-stayed'; end if;

  -- ---------------------------------------------------------------- 9. guessing codes is capped at 20 a day
  perform set_config('request.jwt.claims', json_build_object('sub', ux, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  for i in 1 .. 25 loop
    t := public.dli_use_code('GUESS' || i)->>'status';
  end loop;
  if t = 'wait' then ok := ok + 1; else bad := bad || ' no-cap-on-wrong-codes:' || t; end if;
  execute 'reset role';

  raise exception 'RESULTS ok=% bad=[%] (everything was rolled back)', ok, coalesce(nullif(bad, ''), ' none');
end $$;
