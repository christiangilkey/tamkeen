-- Self-test of schema v11 (supabase/v11-dli-activity.sql): no names kept, usernames shown, and the time numbers. Run in the Supabase SQL
-- editor after v11. It plays made-up people (a teacher, two students, a stranger), checks what each may and
-- may not do, then ends with an error on purpose: that rolls everything back, so no test data is left behind.
-- The error message is the report:
--   RESULTS ok=N bad=[...]
-- "bad" lists rules that didn't hold; " none" means every rule held.

do $$
declare
  ut uuid := gen_random_uuid();  -- a teacher
  ua uuid := gen_random_uuid();  -- a student in the teacher's class
  ub uuid := gen_random_uuid();  -- a student in no class
  ux uuid := gen_random_uuid();  -- a stranger: signed in, nothing else
  c_teacher constant text := 'TCH' || repeat('B', 12);
  monday date := date_trunc('week', now())::date;
  d1 constant text := '0123456789abcdef';
  d2 constant text := 'fedcba9876543210';
  got jsonb; wk jsonb; cls uuid; code text; n int; i int;
  ok int := 0;
  bad text := '';
begin
  -- ---------------------------------------------------------------- setup (as the admin)
  perform set_config('request.jwt.claims', '', true);
  insert into auth.users (id, aud, role, email)
  select u, 'authenticated', 'authenticated', u::text || '@test.invalid' from unnest(array[ut, ua, ub, ux]) u;
  insert into public.profiles (id) select u from unnest(array[ut, ua, ub, ux]) u on conflict do nothing;
  update public.profiles p set username = 'tst_teacher_' || left(replace(p.id::text, '-', ''), 6) where p.id = ut;
  update public.profiles p set username = 'tst_stu_' || left(replace(p.id::text, '-', ''), 6) where p.id = ua;
  update private.dli_config set teacher_code = c_teacher where only_one;

  -- ---------------------------------------------------------------- 1. the table is closed; nothing runs signed out
  if exists (select 1 from pg_class c join pg_namespace s on s.oid = c.relnamespace
             where s.nspname = 'public' and c.relname = 'dli_week_time' and c.relrowsecurity)
     and not exists (select 1 from pg_policies q where q.schemaname = 'public' and q.tablename = 'dli_week_time')
  then ok := ok + 1; else bad := bad || ' table-open'; end if;
  if not has_function_privilege('anon', 'public.dli_report_time(date, text, integer, integer, integer, integer)', 'execute')
  then ok := ok + 1; else bad := bad || ' signed-out-can-report'; end if;
  -- no column can hold a name any more
  if not exists (select 1 from information_schema.columns where table_schema = 'public'
                 and ((table_name = 'dli_students' and column_name = 'last_name') or (table_name = 'dli_teachers' and column_name = 'name')))
  then ok := ok + 1; else bad := bad || ' name-columns-still-there'; end if;

  -- ---------------------------------------------------------------- 2. a teacher's class, two students
  perform set_config('request.jwt.claims', json_build_object('sub', ut, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.dli_use_code(c_teacher);
  got := public.dli_create_class('Arabic 101');
  cls := (got->>'id')::uuid; code := got->>'code';
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  got := public.dli_agree('ar', 2);
  if got->'student'->>'username' like 'tst_stu_%' then ok := ok + 1; else bad := bad || ' student-not-by-username:' || got::text; end if;
  -- an older app sending a last name: accepted, and the name goes nowhere
  got := public.dli_register('Smith', 'ar', 2);
  if got::text not like '%Smith%' then ok := ok + 1; else bad := bad || ' last-name-kept'; end if;
  perform public.dli_use_code(code);
  if (public.dli_me()->'classes'->0->'teachers'->>0) like 'tst_teacher_%' then ok := ok + 1; else bad := bad || ' teacher-not-by-username'; end if;
  -- two devices' shares of this week: minutes add up, days are put together (Mon+Tue and Tue+Wed = 3 days)
  if public.dli_report_week(monday, 1, 10, 20, 15, 5, 40, 20) then ok := ok + 1; else bad := bad || ' week-refused'; end if;
  if public.dli_report_time(monday, d1, 30, 10, 5, 3) then ok := ok + 1; else bad := bad || ' time-refused'; end if;
  perform public.dli_report_time(monday, d2, 20, 0, 0, 6);
  perform public.dli_report_time(monday, d1, 35, 10, 5, 3);  -- (the same device again: replaced, not added)
  wk := public.dli_me()->'weeks'->0;
  if (wk->>'listening')::int = 55 and (wk->>'watching')::int = 10 and (wk->>'reading')::int = 5 and (wk->>'active_days')::int = 3
     and (wk->>'minutes')::int = 10 then ok := ok + 1; else bad := bad || ' sums-wrong:' || coalesce(wk::text, 'none'); end if;
  -- a bad device id or a day that isn't a Monday is refused
  begin
    perform public.dli_report_time(monday, 'not-a-device', 1, 1, 1, 1);
    bad := bad || ' bad-device-accepted';
  exception when others then ok := ok + 1;
  end;
  begin
    perform public.dli_report_time(monday + 2, d1, 1, 1, 1, 1);
    bad := bad || ' tuesday-accepted';
  exception when others then ok := ok + 1;
  end;
  -- more minutes than a week has, or days beyond seven, are cut to size
  perform public.dli_report_time(monday, d2, 999999, 0, 0, 999);
  wk := public.dli_me()->'weeks'->0;
  if (wk->>'listening')::int = 10080 and (wk->>'active_days')::int = 7 then ok := ok + 1; else bad := bad || ' not-capped:' || coalesce(wk::text, 'none'); end if;
  perform public.dli_report_time(monday, d2, 20, 0, 0, 6);
  -- a seventh device is ignored
  for i in 1 .. 6 loop
    perform public.dli_report_time(monday, lpad(to_hex(i), 16, 'a'), 1, 0, 0, 0);
  end loop;
  execute 'reset role';
  select count(*) into n from public.dli_week_time x where x.user_id = ua and x.week = monday;
  if n = 6 then ok := ok + 1; else bad := bad || ' devices-not-capped:' || n; end if;
  delete from public.dli_week_time x where x.user_id = ua and x.device not in (d1, d2);

  -- ---------------------------------------------------------------- 3. a student with only listening still shows
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  got := public.dli_agree('ar', 2);
  if got->'student'->>'username' ~ '^user-[0-9a-f]{6}$' then ok := ok + 1; else bad := bad || ' no-username-stand-in:' || got::text; end if;
  perform public.dli_report_time(monday, d1, 25, 0, 0, 1);
  wk := public.dli_me()->'weeks'->0;
  if (wk->>'listening')::int = 25 and (wk->>'active_days')::int = 1 and (wk->>'reviews')::int = 0 then ok := ok + 1;
  else bad := bad || ' time-only-week-missing:' || coalesce(wk::text, 'none'); end if;
  execute 'reset role';

  -- ---------------------------------------------------------------- 4. the teacher sees the time of their own students only
  perform set_config('request.jwt.claims', json_build_object('sub', ut, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.dli_set_teacher_name('Ms. Rivera');  -- (an older app: nothing is stored)
  got := public.dli_class_report(cls, 4);
  if jsonb_array_length(got->'students') = 1 and (got->'students'->0->'weeks'->0->>'listening')::int = 55
     and got->'students'->0->>'username' like 'tst_stu_%' and got::text not like '%Rivera%'
  then ok := ok + 1; else bad := bad || ' teacher-report-wrong:' || got::text; end if;
  begin
    select count(*) into n from public.dli_week_time;
    if n = 0 then ok := ok + 1; else bad := bad || ' teacher-read-the-table'; end if;
  exception when others then ok := ok + 1;
  end;
  execute 'reset role';

  -- ---------------------------------------------------------------- 5. the stranger gets nothing, and can't send
  perform set_config('request.jwt.claims', json_build_object('sub', ux, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    select count(*) into n from public.dli_week_time;
    if n = 0 then ok := ok + 1; else bad := bad || ' stranger-read-the-table'; end if;
  exception when others then ok := ok + 1;
  end;
  begin
    insert into public.dli_week_time (user_id, week, device) values (ux, monday, d1);
    bad := bad || ' wrote-the-table-directly';
  exception when others then ok := ok + 1;
  end;
  if public.dli_report_time(monday, d1, 5, 5, 5, 1) = false then ok := ok + 1; else bad := bad || ' non-student-sent-time'; end if;
  begin
    perform private.dli_weeks_of(ua, monday, 4);
    bad := bad || ' ran-the-private-helper';
  exception when others then ok := ok + 1;
  end;
  execute 'reset role';

  -- ---------------------------------------------------------------- 6. agreeing to a newer wording keeps the day they joined
  update public.dli_students s set joined_at = now() - interval '30 days' where s.user_id = ub;
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.dli_agree('ar', 3);
  execute 'reset role';
  select count(*) into n from public.dli_students s where s.user_id = ub and s.joined_at < now() - interval '29 days'
    and s.agreed_at > now() - interval '1 minute';
  if n = 1 then ok := ok + 1; else bad := bad || ' joined-day-moved'; end if;

  -- ---------------------------------------------------------------- 7. stopping sharing deletes the time too
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.dli_unregister();
  execute 'reset role';
  select count(*) into n from public.dli_week_time x where x.user_id = ua;
  if n = 0 then ok := ok + 1; else bad := bad || ' time-left-after-stopping'; end if;

  raise exception 'RESULTS ok=% bad=[%] (everything was rolled back)', ok, coalesce(nullif(bad, ''), ' none');
end $$;
