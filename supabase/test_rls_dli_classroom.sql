-- Self-test of the Classroom (schema v17, supabase/v17-dli-classroom.sql). Run in the Supabase SQL editor after
-- v17. It plays made-up people, checks what each may and may not do, then ends with an error on purpose: that
-- rolls everything back, so no test data is left behind. The error message is the report:
--   RESULTS ok=N bad=[...]      (" none" means every rule held)

do $$
declare
  ut uuid := gen_random_uuid();  -- the class's teacher
  uo uuid := gen_random_uuid();  -- a teacher of another class
  ua uuid := gen_random_uuid();  -- a student of the class
  ux uuid := gen_random_uuid();  -- a DLI student, not in the class
  got jsonb; cls uuid; other uuid; f1 uuid; f2 uuid; fo uuid; p1 uuid; p2 uuid; n int; i int; t text; path1 text; path2 text;
  ok int := 0;
  bad text := '';
begin
  -- ---------------------------------------------------------------- setup (as the admin)
  perform set_config('request.jwt.claims', '', true);
  insert into auth.users (id, aud, role, email)
  select u, 'authenticated', 'authenticated', u::text || '@test.invalid' from unnest(array[ut, uo, ua, ux]) u;
  insert into public.profiles (id) select u from unnest(array[ut, uo, ua, ux]) u on conflict do nothing;
  update public.profiles set username = 't' || left(replace(id::text, '-', ''), 12) where id = any (array[ut, uo, ua, ux]);
  insert into public.dli_teachers (user_id) values (ut), (uo);
  insert into public.dli_classes (name, code, staff_code) values ('Classroom test', 'ZZZ237', 'COZZZZ2377') returning id into cls;
  insert into public.dli_classes (name, code, staff_code) values ('Another class', 'YYY237', 'COYYYY2377') returning id into other;
  insert into public.dli_class_teachers (class_id, user_id) values (cls, ut), (other, uo);
  insert into public.dli_students (user_id, language, agreed_version) values (ua, 'ar', 2), (ux, 'ar', 2);
  insert into public.dli_class_students (class_id, user_id) values (cls, ua);
  path1 := cls::text || '/' || gen_random_uuid()::text || '.gz';
  path2 := cls::text || '/' || gen_random_uuid()::text || '.gz';

  -- ---------------------------------------------------------------- 1. nothing runs signed out; the new table is closed
  select string_agg(p.proname, ',') into t from pg_proc p join pg_namespace s on s.oid = p.pronamespace
  where s.nspname = 'public' and p.proname in ('dli_classroom', 'dli_class_posts', 'dli_folder_save', 'dli_folder_remove', 'dli_room_add',
      'dli_post', 'dli_room_update', 'dli_room_move')
    and has_function_privilege('anon', p.oid, 'execute');
  if t is null then ok := ok + 1; else bad := bad || ' signed-out-can-run:' || t; end if;
  select count(*) into n from pg_policies p where p.schemaname = 'public' and p.tablename in ('dli_class_folders', 'dli_class_posts');
  if n = 0 then ok := ok + 1; else bad := bad || ' the-tables-have-rules=' || n; end if;
  if not has_table_privilege('authenticated', 'public.dli_class_folders', 'select') then ok := ok + 1; else bad := bad || ' folders-can-be-read'; end if;

  -- ---------------------------------------------------------------- 2. the teacher makes folders and adds things
  perform set_config('request.jwt.claims', json_build_object('sub', ut, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  f1 := public.dli_folder_save(cls, '  Week 1:   news ');
  f2 := public.dli_folder_save(cls, 'Week 2');
  if f1 is not null and f2 is not null and f1 <> f2 then ok := ok + 1; else bad := bad || ' folders-not-made'; end if;
  if public.dli_folder_save(cls, 'Week 1: the news', f1) = f1 then ok := ok + 1; else bad := bad || ' rename-failed'; end if;
  begin
    perform public.dli_folder_save(cls, '   ');
    bad := bad || ' a-folder-with-no-name';
  exception when others then ok := ok + 1;
  end;
  got := public.dli_room_add(cls, '{"title":"Morning news","kind":"page","url":"https://example.org/1"}'::jsonb, path1,
    '[{"w":"school","important":true,"meaning":"where you study","note":"feminine"}]'::jsonb, f1);
  p1 := (got->>'id')::uuid;
  if p1 is not null then ok := ok + 1; else bad := bad || ' add-failed:' || got::text; end if;
  got := public.dli_post(cls, '{"title":"A podcast","kind":"podcast"}'::jsonb);  -- (the v15 call still works)
  p2 := (got->>'id')::uuid;
  if p2 is not null and got->'old' = '[]'::jsonb then ok := ok + 1; else bad := bad || ' old-call-failed:' || got::text; end if;
  begin
    perform public.dli_room_add(cls, '{"title":"x","kind":"page"}'::jsonb, other::text || '/' || gen_random_uuid()::text || '.gz');
    bad := bad || ' added-a-file-of-another-class';
  exception when others then ok := ok + 1;
  end;
  begin
    perform public.dli_room_add(cls, '{"title":"x","kind":"page"}'::jsonb, null, '{"not":"a list"}'::jsonb);
    bad := bad || ' notes-that-are-not-a-list';
  exception when others then ok := ok + 1;
  end;
  begin
    perform public.dli_room_add(cls, '{"title":"x","kind":"page"}'::jsonb, null, to_jsonb(array[repeat('x', 130000)]));
    bad := bad || ' huge-notes-accepted';
  exception when others then ok := ok + 1;
  end;
  begin
    perform public.dli_room_add(other, '{"title":"x","kind":"page"}'::jsonb);
    bad := bad || ' added-to-a-class-i-do-not-teach';
  exception when others then ok := ok + 1;
  end;
  -- (a folder of another class is not a folder of this one: the item lands outside any folder)
  execute 'reset role';
  insert into public.dli_class_folders (class_id, name) values (other, 'Theirs') returning id into fo;
  perform set_config('request.jwt.claims', json_build_object('sub', ut, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  got := public.dli_room_add(cls, '{"title":"Stray","kind":"page"}'::jsonb, null, '[]'::jsonb, fo);
  got := public.dli_classroom(cls);
  if jsonb_array_length(got->'folders') = 2 and got->'folders'->0->>'name' = 'Week 1: the news' and jsonb_array_length(got->'items') = 3
     and (select count(*) from jsonb_array_elements(got->'items') x where x->>'folder' = f1::text) = 1
     and (select count(*) from jsonb_array_elements(got->'items') x where x->>'folder' = fo::text) = 0
     and got::text not like '%@test.invalid%' then ok := ok + 1;
  else bad := bad || ' classroom-wrong:' || left(got::text, 300); end if;

  -- ---------------------------------------------------------------- 3. changing in place, moving
  t := public.dli_room_update(p1, null, path2, '[{"w":"school","important":true,"meaning":"a place to learn"}]'::jsonb);
  if t = path1 then ok := ok + 1; else bad := bad || ' update-did-not-hand-back-the-old-file:' || coalesce(t, 'null'); end if;
  t := public.dli_room_update(p1, '{"title":"Morning news, corrected","kind":"page"}'::jsonb);
  if t is null then ok := ok + 1; else bad := bad || ' file-dropped-without-asking'; end if;
  got := public.dli_classroom(cls);
  if (select x->'item'->>'title' = 'Morning news, corrected' and x->>'path' = path2 and x->'notes'->0->>'meaning' = 'a place to learn'
             and (x->>'updated_at')::timestamptz >= (x->>'created_at')::timestamptz
      from jsonb_array_elements(got->'items') x where x->>'id' = p1::text) then ok := ok + 1;
  else bad := bad || ' update-wrong'; end if;
  begin
    perform public.dli_room_update(p1, null, other::text || '/' || gen_random_uuid()::text || '.gz');
    bad := bad || ' pointed-at-a-file-of-another-class';
  exception when others then ok := ok + 1;
  end;
  perform public.dli_room_move(p2, f2);
  begin
    perform public.dli_room_move(p2, fo);
    bad := bad || ' moved-into-a-folder-of-another-class';
  exception when others then ok := ok + 1;
  end;
  perform public.dli_folder_remove(f2);
  got := public.dli_classroom(cls);
  if jsonb_array_length(got->'folders') = 1 and jsonb_array_length(got->'items') = 3
     and (select x->>'folder' is null from jsonb_array_elements(got->'items') x where x->>'id' = p2::text) then ok := ok + 1;
  else bad := bad || ' removing-a-folder-lost-something'; end if;
  execute 'reset role';

  -- ---------------------------------------------------------------- 4. a student reads, and changes nothing
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  got := public.dli_classroom(cls);
  if jsonb_array_length(got->'items') = 3 and jsonb_array_length(got->'folders') = 1 then ok := ok + 1; else bad := bad || ' student-cannot-read-the-classroom'; end if;
  if jsonb_array_length(public.dli_class_posts(cls)) = 3 then ok := ok + 1; else bad := bad || ' old-list-wrong'; end if;
  begin perform public.dli_folder_save(cls, 'Mine'); bad := bad || ' student-made-a-folder'; exception when others then ok := ok + 1; end;
  begin perform public.dli_folder_remove(f1); bad := bad || ' student-removed-a-folder'; exception when others then ok := ok + 1; end;
  begin perform public.dli_room_add(cls, '{"title":"x","kind":"page"}'::jsonb); bad := bad || ' student-added'; exception when others then ok := ok + 1; end;
  begin perform public.dli_room_update(p1, '{"title":"hacked","kind":"page"}'::jsonb); bad := bad || ' student-changed-an-item'; exception when others then ok := ok + 1; end;
  begin perform public.dli_room_move(p1, null); bad := bad || ' student-moved-an-item'; exception when others then ok := ok + 1; end;
  execute 'reset role';

  -- ---------------------------------------------------------------- 5. people outside the class get nothing
  perform set_config('request.jwt.claims', json_build_object('sub', ux, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin got := public.dli_classroom(cls); bad := bad || ' outsider-read-the-classroom'; exception when others then ok := ok + 1; end;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', uo, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin got := public.dli_classroom(cls); bad := bad || ' another-teacher-read-the-classroom'; exception when others then ok := ok + 1; end;
  begin perform public.dli_room_update(p1, '{"title":"hacked","kind":"page"}'::jsonb); bad := bad || ' another-teacher-changed-an-item'; exception when others then ok := ok + 1; end;
  begin perform public.dli_folder_save(cls, 'Hacked', f1); bad := bad || ' another-teacher-renamed-a-folder'; exception when others then ok := ok + 1; end;
  begin perform public.dli_folder_remove(f1); bad := bad || ' another-teacher-removed-a-folder'; exception when others then ok := ok + 1; end;
  begin perform public.dli_room_move(p1, fo); bad := bad || ' another-teacher-moved-an-item'; exception when others then ok := ok + 1; end;
  execute 'reset role';

  -- ---------------------------------------------------------------- 6. nothing expires; the limits hold
  update public.dli_class_posts set created_at = now() - interval '200 days' where id = p1;
  perform set_config('request.jwt.claims', json_build_object('sub', ut, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.dli_room_add(cls, '{"title":"Later","kind":"page"}'::jsonb);
  got := public.dli_classroom(cls);
  if (select count(*) from jsonb_array_elements(got->'items') x where x->>'id' = p1::text) = 1 then ok := ok + 1; else bad := bad || ' an-old-item-was-dropped'; end if;
  t := '';
  begin
    for i in 1 .. 120 loop
      perform public.dli_room_add(cls, '{"title":"Again","kind":"page"}'::jsonb);
    end loop;
  exception when others then t := sqlerrm;
  end;
  if t like '%dli_post_limit%' then ok := ok + 1; else bad := bad || ' no-daily-cap:' || t; end if;
  t := '';
  begin
    for i in 1 .. 45 loop
      perform public.dli_folder_save(cls, 'Folder ' || i);
    end loop;
  exception when others then t := sqlerrm;
  end;
  if t like '%dli_room_full%' then ok := ok + 1; else bad := bad || ' no-cap-on-folders:' || t; end if;
  execute 'reset role';

  raise exception 'RESULTS ok=% bad=[%] (everything was rolled back)', ok, coalesce(nullif(bad, ''), ' none');
end $$;
