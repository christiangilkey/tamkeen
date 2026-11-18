-- Self-test of a class's teachers (schema v13, supabase/v13-dli-class-teachers.sql). Run in the Supabase SQL
-- editor after v13. It plays made-up people, checks what each may and may not do, then ends with an error on
-- purpose: that rolls everything back, so no test data is left behind. The error message is the report:
--   RESULTS ok=N bad=[...]      (" none" means every rule held)

do $$
declare
  ut uuid := gen_random_uuid();  -- the class's first teacher
  u2 uuid := gen_random_uuid();  -- a DLI teacher, added by username
  u3 uuid := gen_random_uuid();  -- a DLI teacher, added later
  ux uuid := gen_random_uuid();  -- signed in, not a teacher
  ua uuid := gen_random_uuid();  -- a student of the class
  n2 text; n3 text; nx text;
  got jsonb; cls uuid; other uuid; n int; i int; t text;
  ok int := 0;
  bad text := '';
begin
  -- ---------------------------------------------------------------- setup (as the admin)
  perform set_config('request.jwt.claims', '', true);
  insert into auth.users (id, aud, role, email)
  select u, 'authenticated', 'authenticated', u::text || '@test.invalid' from unnest(array[ut, u2, u3, ux, ua]) u;
  insert into public.profiles (id) select u from unnest(array[ut, u2, u3, ux, ua]) u on conflict do nothing;
  update public.profiles set username = 't' || left(replace(id::text, '-', ''), 12) where id = any (array[ut, u2, u3, ux, ua]);
  select username::text into n2 from public.profiles where id = u2;
  select username::text into n3 from public.profiles where id = u3;
  select username::text into nx from public.profiles where id = ux;
  insert into public.dli_teachers (user_id) values (ut), (u2), (u3);
  insert into public.dli_classes (name, code, staff_code) values ('Teachers test', 'ZZZ234', 'COZZZZ2345') returning id into cls;
  insert into public.dli_classes (name, code, staff_code) values ('Another class', 'YYY234', 'COYYYY2345') returning id into other;
  insert into public.dli_class_teachers (class_id, user_id, added_at) values (cls, ut, now() - interval '3 days'), (other, u3, now() - interval '3 days');
  insert into public.dli_students (user_id, language) values (ua, 'ar');
  insert into public.dli_class_students (class_id, user_id) values (cls, ua);

  -- ---------------------------------------------------------------- 1. nothing runs signed out
  select string_agg(p.proname, ',') into t from pg_proc p join pg_namespace s on s.oid = p.pronamespace
  where s.nspname = 'public' and p.proname in ('dli_class_teachers', 'dli_add_teacher', 'dli_drop_teacher')
    and has_function_privilege('anon', p.oid, 'execute');
  if t is null then ok := ok + 1; else bad := bad || ' signed-out-can-run:' || t; end if;

  -- ---------------------------------------------------------------- 2. someone who doesn't teach the class
  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    got := public.dli_class_teachers(cls);
    bad := bad || ' outsider-listed-the-teachers';
  exception when others then ok := ok + 1;
  end;
  begin
    got := public.dli_add_teacher(cls, n2);
    bad := bad || ' outsider-added-themselves';
  exception when others then ok := ok + 1;
  end;
  begin
    got := public.dli_class_report(cls);
    bad := bad || ' outsider-read-the-class';
  exception when others then ok := ok + 1;
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    got := public.dli_add_teacher(cls, n2);
    bad := bad || ' student-added-a-teacher';
  exception when others then ok := ok + 1;
  end;
  execute 'reset role';

  -- ---------------------------------------------------------------- 3. the class's teacher adds by username
  perform set_config('request.jwt.claims', json_build_object('sub', ut, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  if public.dli_add_teacher(cls, nx)->>'status' = 'no' then ok := ok + 1; else bad := bad || ' added-someone-who-is-not-a-teacher'; end if;
  if public.dli_add_teacher(cls, 'nobody_by_this_name')->>'status' = 'no' then ok := ok + 1; else bad := bad || ' added-nobody'; end if;
  if public.dli_add_teacher(cls, '<b>')->>'status' = 'no' then ok := ok + 1; else bad := bad || ' odd-name-accepted'; end if;
  got := public.dli_add_teacher(cls, '  @' || upper(n2) || ' ');
  if got->>'status' = 'added' and got->>'username' = n2 then ok := ok + 1; else bad := bad || ' add-refused:' || got::text; end if;
  if public.dli_add_teacher(cls, n2)->>'status' = 'already' then ok := ok + 1; else bad := bad || ' added-twice'; end if;
  got := public.dli_class_teachers(cls);
  if jsonb_array_length(got) = 2 and (got->0->>'me')::boolean and not (got->0->>'can_drop')::boolean
     and got->1->>'username' = n2 and (got->1->>'can_drop')::boolean and got::text not like '%@test.invalid%' then ok := ok + 1;
  else bad := bad || ' teachers-list-wrong:' || got::text; end if;
  begin
    perform public.dli_add_teacher(other, n2);
    bad := bad || ' added-to-a-class-i-do-not-teach';
  exception when others then ok := ok + 1;
  end;
  execute 'reset role';
  -- (everything here happens in one instant; in real use the second teacher joined earlier than the third)
  update public.dli_class_teachers set added_at = now() - interval '1 day' where class_id = cls and user_id = u2;

  -- ---------------------------------------------------------------- 4. the added teacher sees the class and its student
  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  got := public.dli_class_report(cls);
  if jsonb_array_length(got->'students') = 1 then ok := ok + 1; else bad := bad || ' added-teacher-cannot-see-the-class'; end if;
  begin
    got := public.dli_class_report(other);
    bad := bad || ' added-teacher-read-another-class';
  exception when others then ok := ok + 1;
  end;
  got := public.dli_add_teacher(cls, n3);
  if got->>'status' = 'added' then ok := ok + 1; else bad := bad || ' second-add-refused'; end if;
  begin
    perform public.dli_drop_teacher(cls, ut);
    bad := bad || ' later-teacher-dropped-the-first';
  exception when others then ok := ok + 1;
  end;
  begin
    perform public.dli_drop_teacher(cls, u2);
    bad := bad || ' dropped-myself';
  exception when others then ok := ok + 1;
  end;
  perform public.dli_drop_teacher(cls, u3);
  execute 'reset role';
  select count(*) into n from public.dli_class_teachers c where c.class_id = cls;
  if n = 2 then ok := ok + 1; else bad := bad || ' drop-did-not-work=' || n; end if;
  select count(*) into n from public.dli_class_teachers c where c.class_id = other and c.user_id = u3;
  if n = 1 then ok := ok + 1; else bad := bad || ' drop-reached-another-class'; end if;

  -- ---------------------------------------------------------------- 5. the student sees both teachers; a dropped teacher sees nothing
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  got := public.dli_me();
  if jsonb_array_length(got->'classes'->0->'teachers') = 2 then ok := ok + 1; else bad := bad || ' student-cannot-see-the-teachers'; end if;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', ut, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.dli_drop_teacher(cls, u2);
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    got := public.dli_class_report(cls);
    bad := bad || ' dropped-teacher-still-reads-the-class';
  exception when others then ok := ok + 1;
  end;
  execute 'reset role';

  -- ---------------------------------------------------------------- 6. a full class, and guessing names is capped
  insert into public.dli_class_teachers (class_id, user_id)
  select cls, u from unnest(array[u2, u3]) u on conflict do nothing;
  for i in 1 .. 7 loop
    t := 'x' || left(replace(gen_random_uuid()::text, '-', ''), 12);
    insert into auth.users (id, aud, role, email) values (gen_random_uuid(), 'authenticated', 'authenticated', t || '@test.invalid') returning id into other;
    insert into public.profiles (id) values (other) on conflict do nothing;
    insert into public.dli_teachers (user_id) values (other);
    insert into public.dli_class_teachers (class_id, user_id) values (cls, other);
  end loop;
  update public.profiles set username = 'full' || left(replace(ux::text, '-', ''), 10) where id = ux;
  insert into public.dli_teachers (user_id) values (ux);
  perform set_config('request.jwt.claims', json_build_object('sub', ut, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  if public.dli_add_teacher(cls, 'full' || left(replace(ux::text, '-', ''), 10))->>'status' = 'full' then ok := ok + 1; else bad := bad || ' eleventh-teacher-added'; end if;
  for i in 1 .. 25 loop
    t := public.dli_add_teacher(cls, 'guess_' || i)->>'status';
  end loop;
  if t = 'wait' then ok := ok + 1; else bad := bad || ' no-cap-on-wrong-names:' || t; end if;
  execute 'reset role';

  raise exception 'RESULTS ok=% bad=[%] (everything was rolled back)', ok, coalesce(nullif(bad, ''), ' none');
end $$;
