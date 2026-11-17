-- Self-test of schema v12 (supabase/v12-dli-lessons.sql): who may add, read, answer and mark DLI lessons. Run in
-- the Supabase SQL editor after v12. It plays made-up people (two teachers with a class each, two students, a
-- stranger), checks what each may and may not do, then ends with an error on purpose: that rolls everything back,
-- so no test data is left behind. The error message is the report:
--   RESULTS ok=N bad=[...]
-- "bad" lists rules that didn't hold; " none" means every rule held.

do $$
declare
  ut uuid := gen_random_uuid();  -- a teacher (class A)
  uu uuid := gen_random_uuid();  -- another teacher (class B)
  ua uuid := gen_random_uuid();  -- a student in class A
  ub uuid := gen_random_uuid();  -- a student in class B only
  ux uuid := gen_random_uuid();  -- a stranger: signed in, nothing else
  c_teacher constant text := 'TCH' || repeat('C', 12);
  got jsonb; cls_a uuid; cls_b uuid; code_a text; code_b text; les uuid; v int; n int;
  ok int := 0;
  bad text := '';
begin
  -- ---------------------------------------------------------------- setup (as the admin)
  perform set_config('request.jwt.claims', '', true);
  insert into auth.users (id, aud, role, email)
  select u, 'authenticated', 'authenticated', u::text || '@test.invalid' from unnest(array[ut, uu, ua, ub, ux]) u;
  insert into public.profiles (id) select u from unnest(array[ut, uu, ua, ub, ux]) u on conflict do nothing;
  update private.dli_config set teacher_code = c_teacher where only_one;

  -- ---------------------------------------------------------------- 1. closed tables; nothing runs signed out
  if (select count(*) from pg_class c join pg_namespace s on s.oid = c.relnamespace
      where s.nspname = 'public' and c.relname in ('dli_lessons', 'dli_lesson_work') and c.relrowsecurity) = 2
     and not exists (select 1 from pg_policies q where q.schemaname = 'public' and q.tablename in ('dli_lessons', 'dli_lesson_work'))
  then ok := ok + 1; else bad := bad || ' tables-open'; end if;
  if not has_function_privilege('anon', 'public.dli_my_lessons()', 'execute')
     and not has_function_privilege('anon', 'public.dli_add_lesson(uuid, text, text, jsonb, jsonb, date)', 'execute')
  then ok := ok + 1; else bad := bad || ' signed-out-can-run'; end if;
  if (select not b.public from storage.buckets b where b.id = 'dli-lessons') then ok := ok + 1; else bad := bad || ' bucket-public'; end if;

  -- ---------------------------------------------------------------- 2. two teachers, a class each, a student in each
  perform set_config('request.jwt.claims', json_build_object('sub', ut, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.dli_use_code(c_teacher);
  got := public.dli_create_class('Arabic 101'); cls_a := (got->>'id')::uuid; code_a := got->>'code';
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', uu, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.dli_use_code(c_teacher);
  got := public.dli_create_class('Arabic 201'); cls_b := (got->>'id')::uuid; code_b := got->>'code';
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.dli_agree('ar', 2);
  perform public.dli_use_code(code_a);
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.dli_agree('ar', 2);
  perform public.dli_use_code(code_b);
  execute 'reset role';

  -- ---------------------------------------------------------------- 3. the teacher adds a lesson to class A
  perform set_config('request.jwt.claims', json_build_object('sub', ut, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  les := public.dli_add_lesson(cls_a, 'Unit 1 <b>', 'ar',
    '[{"id":"q1","kind":"choice","prompt":"Where?","options":[{"id":"a","text":"Cairo"},{"id":"b","text":"Rabat"}]}]'::jsonb,
    '{"q1":"a"}'::jsonb);
  if les is not null then ok := ok + 1; else bad := bad || ' add-refused'; end if;
  -- a class that isn't theirs
  begin
    perform public.dli_add_lesson(cls_b, 'Not mine', 'ar', '[]'::jsonb);
    bad := bad || ' added-to-another-class';
  exception when others then ok := ok + 1;
  end;
  execute 'reset role';

  -- not sent yet: the student doesn't see it
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  if jsonb_array_length(public.dli_my_lessons()) = 0 then ok := ok + 1; else bad := bad || ' draft-shown'; end if;
  execute 'reset role';

  -- sent, with a bad file name dropped
  perform set_config('request.jwt.claims', json_build_object('sub', ut, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v := public.dli_send_lesson(les, '["lesson-1.json.gz","track-1.mp3","../x","a/b"]'::jsonb);
  if v = 1 then ok := ok + 1; else bad := bad || ' send-version:' || coalesce(v::text, 'null'); end if;
  if (public.dli_lesson_report(les)->'lesson'->'files') = '["lesson-1.json.gz","track-1.mp3"]'::jsonb then ok := ok + 1;
  else bad := bad || ' files-not-cleaned'; end if;
  if (public.dli_lesson_report(les)->'lesson'->>'title') = 'Unit 1  b ' or (public.dli_lesson_report(les)->'lesson'->>'title') not like '%<%'
  then ok := ok + 1; else bad := bad || ' title-not-cleaned'; end if;
  execute 'reset role';

  -- ---------------------------------------------------------------- 4. the class's student sees it, without the key
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  got := public.dli_my_lessons();
  if jsonb_array_length(got) = 1 and got->0->>'id' = les::text then ok := ok + 1; else bad := bad || ' student-cant-see'; end if;
  if not (got->0 ? 'answer_key') and got::text not like '%"q1": "a"%' then ok := ok + 1; else bad := bad || ' key-shown-to-student'; end if;
  -- answers kept, then handed in; junk keys and oversized lists dropped
  got := public.dli_save_work(les, '{"q1":["a"],"q2":"Some words","bad key!":"x"}'::jsonb, false);
  if got->>'handed_at' is null and got->'answers' ? 'q2' and not (got->'answers' ? 'bad key!') then ok := ok + 1;
  else bad := bad || ' save-wrong:' || got::text; end if;
  got := public.dli_save_work(les, '{"q1":["b"],"q2":"Some words"}'::jsonb, true);
  if got->>'handed_at' is not null then ok := ok + 1; else bad := bad || ' hand-in-wrong'; end if;
  -- the teacher's reports are closed to students
  begin
    perform public.dli_lesson_report(les);
    bad := bad || ' student-read-report';
  exception when others then ok := ok + 1;
  end;
  begin
    perform public.dli_give_words(les, ua, '[{"word":"x"}]'::jsonb);
    bad := bad || ' student-gave-words';
  exception when others then ok := ok + 1;
  end;
  -- the files: may read, may not add or remove
  if private.dli_lesson_reader(cls_a::text, les::text) then ok := ok + 1; else bad := bad || ' student-cant-read-files'; end if;
  if not private.dli_lesson_writer(cls_a::text, les::text) then ok := ok + 1; else bad := bad || ' student-can-write-files'; end if;
  execute 'reset role';

  -- ---------------------------------------------------------------- 5. other people
  -- the student of another class
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  if jsonb_array_length(public.dli_my_lessons()) = 0 then ok := ok + 1; else bad := bad || ' other-class-sees'; end if;
  begin
    perform public.dli_save_work(les, '{"q1":["a"]}'::jsonb, true);
    bad := bad || ' other-class-handed-in';
  exception when others then ok := ok + 1;
  end;
  if not private.dli_lesson_reader(cls_a::text, les::text) then ok := ok + 1; else bad := bad || ' other-class-reads-files'; end if;
  execute 'reset role';
  -- the other class's teacher
  perform set_config('request.jwt.claims', json_build_object('sub', uu, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.dli_lesson_report(les);
    bad := bad || ' other-teacher-read-report';
  exception when others then ok := ok + 1;
  end;
  begin
    perform public.dli_remove_lesson(les);
    bad := bad || ' other-teacher-removed';
  exception when others then ok := ok + 1;
  end;
  if not private.dli_lesson_writer(cls_a::text, les::text) then ok := ok + 1; else bad := bad || ' other-teacher-writes-files'; end if;
  execute 'reset role';
  -- a stranger
  perform set_config('request.jwt.claims', json_build_object('sub', ux, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  if jsonb_array_length(public.dli_my_lessons()) = 0 then ok := ok + 1; else bad := bad || ' stranger-sees'; end if;
  begin
    perform 1 from public.dli_lessons;
    bad := bad || ' table-readable';
  exception when others then ok := ok + 1;
  end;
  if not private.dli_lesson_reader(cls_a::text, les::text) and not private.dli_lesson_reader('not-a-uuid', 'x')
  then ok := ok + 1; else bad := bad || ' stranger-reads-files'; end if;
  execute 'reset role';

  -- ---------------------------------------------------------------- 6. the teacher reads answers, gives words, corrects
  perform set_config('request.jwt.claims', json_build_object('sub', ut, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  got := public.dli_lesson_report(les);
  if got->'lesson'->'answer_key'->>'q1' = 'a' and got->'students'->0->'answers'->'q1'->>0 = 'b'
     and got->'students'->0->>'handed_at' is not null then ok := ok + 1; else bad := bad || ' report-wrong:' || got::text; end if;
  n := public.dli_give_words(les, ua, '[{"word":"كتاب","sentence":"هذا كتاب"},{"word":"  "},{"word":"<x>"},"junk"]'::jsonb);
  if n = 2 then ok := ok + 1; else bad := bad || ' words-not-cleaned:' || n; end if;
  begin
    perform public.dli_give_words(les, ub, '[{"word":"x"}]'::jsonb);
    bad := bad || ' words-to-other-class';
  exception when others then ok := ok + 1;
  end;
  v := public.dli_send_lesson(les, '["lesson-2.json.gz","track-1.mp3"]'::jsonb);
  if v = 2 then ok := ok + 1; else bad := bad || ' correction-version'; end if;
  if (public.dli_class_lessons(cls_a)->0->>'handed')::int = 1 then ok := ok + 1; else bad := bad || ' class-count'; end if;
  execute 'reset role';

  -- the student sees the words and the new version, and takes the words
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  got := public.dli_my_lessons()->0;
  if (got->>'version')::int = 2 and jsonb_array_length(got->'words') = 2 and got->>'words_taken_at' is null
  then ok := ok + 1; else bad := bad || ' student-words:' || got::text; end if;
  perform public.dli_took_words(les);
  if public.dli_my_lessons()->0->>'words_taken_at' is not null then ok := ok + 1; else bad := bad || ' took-words'; end if;
  -- leaving the class: the lesson is gone for them at once
  perform public.dli_leave_class(cls_a);
  if jsonb_array_length(public.dli_my_lessons()) = 0 and not private.dli_lesson_reader(cls_a::text, les::text)
  then ok := ok + 1; else bad := bad || ' left-still-sees'; end if;
  execute 'reset role';

  -- ---------------------------------------------------------------- 7. removing
  perform set_config('request.jwt.claims', json_build_object('sub', ut, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.dli_remove_lesson(les);
  if jsonb_array_length(public.dli_class_lessons(cls_a)) = 0 then ok := ok + 1; else bad := bad || ' not-removed'; end if;
  execute 'reset role';
  if not exists (select 1 from public.dli_lesson_work w where w.lesson_id = les) then ok := ok + 1; else bad := bad || ' work-left'; end if;

  raise exception 'RESULTS ok=% bad=[%]', ok, case when bad = '' then ' none' else bad end;
end $$;
