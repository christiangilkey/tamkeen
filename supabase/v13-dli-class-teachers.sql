-- Schema v13: a class's teachers, seen and managed by its teachers. Run once in the Supabase SQL editor (safe to
-- re-run), AFTER v10-dli-classes.sql and v11-dli-activity.sql. It works with or without v12-dli-lessons.sql.
--
-- WHAT WAS THERE ALREADY (v10): a class can have up to 10 teachers (a second teacher types the class's "code for
-- another teacher"), and a student can be in up to 10 classes. Every teacher of a class sees that class's
-- students: their weeks from the week each joined, and (v12) the class's lessons and answers.
--
-- WHAT THIS ADDS: three functions, no new table and no new data.
--   dli_class_teachers(class)        the class's teachers, by username, for a teacher of that class
--   dli_add_teacher(class, username) a teacher of the class adds another DLI teacher by Tamkeen username
--   dli_drop_teacher(class, person)  a teacher of the class takes out a teacher who joined it AFTER them
--                                    (so a teacher added later can never push out the one who added them)
--
-- WHO MAY SEE WHAT stays as it was: a student is seen by the teachers of the classes that student joined, from
-- the week they joined, and by nobody else. Adding a teacher to a class is the only way to give a student one
-- more teacher, and the student sees every teacher's username under the class in their own app. Only someone who
-- is already a DLI teacher (has typed the owner's teacher code) can be added.
-- Usernames only: no real name is kept or shown. Self-test: supabase/test_rls_dli_teachers.sql.


-- The teachers of one of my classes, longest-standing first. `me`: that row is mine. `can_drop`: I may take
-- that teacher out (they joined the class after I did).
create or replace function public.dli_class_teachers(class uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  v_mine timestamptz;
begin
  if me is null then raise exception 'Not signed in'; end if;
  select t.added_at into v_mine from public.dli_class_teachers t where t.class_id = class and t.user_id = me;
  if v_mine is null then raise exception 'dli_not_your_class'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', t.user_id, 'username', private.dli_handle(t.user_id),
            'added_at', t.added_at, 'me', t.user_id = me, 'can_drop', t.user_id <> me and t.added_at > v_mine)
            order by t.added_at, t.user_id), '[]'::jsonb)
          from public.dli_class_teachers t where t.class_id = class);
end $$;

-- Add a DLI teacher to one of my classes, by their Tamkeen username (capitals don't matter; a leading @ is
-- ignored). Answers {status}:
--   "added"    they now teach the class too                      (+ username)
--   "already"  they were one of its teachers already             (+ username)
--   "full"     the class has 10 teachers
--   "wait"     20 names that didn't work today: try again tomorrow
--   "no"       nobody with that username is a DLI teacher (one answer for "no such user" and "not a teacher",
--              so the box can't be used to find out who has an account)
create or replace function public.dli_add_teacher(class uuid, username text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  v_name text := lower(btrim(regexp_replace(coalesce(username, ''), '^\s*@', '')));
  v_who uuid;
begin
  if me is null then raise exception 'Not signed in'; end if;
  if not private.dli_teaches(me, class) then raise exception 'dli_not_your_class'; end if;
  if (select count(*) from private.dli_tries t where t.user_id = me and t.at > now() - interval '1 day') >= 20 then
    return jsonb_build_object('status', 'wait');
  end if;
  if v_name ~ '^[a-z0-9_.]{3,20}$' then
    select p.id into v_who from public.profiles p join public.dli_teachers t on t.user_id = p.id
    where lower(p.username::text) = v_name;
  end if;
  if v_who is null then
    insert into private.dli_tries (user_id) values (me);
    return jsonb_build_object('status', 'no');
  end if;
  if private.dli_teaches(v_who, class) then
    return jsonb_build_object('status', 'already', 'username', private.dli_handle(v_who));
  end if;
  if (select count(*) from public.dli_class_teachers t where t.class_id = class) >= 10 then
    return jsonb_build_object('status', 'full');
  end if;
  insert into public.dli_class_teachers (class_id, user_id) values (class, v_who) on conflict do nothing;
  return jsonb_build_object('status', 'added', 'username', private.dli_handle(v_who));
end $$;

-- Take a teacher out of one of my classes: only one who joined it after I did. (To go myself: dli_leave_class.)
create or replace function public.dli_drop_teacher(class uuid, person uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  v_mine timestamptz;
  v_theirs timestamptz;
begin
  if me is null then raise exception 'Not signed in'; end if;
  select t.added_at into v_mine from public.dli_class_teachers t where t.class_id = class and t.user_id = me;
  if v_mine is null then raise exception 'dli_not_your_class'; end if;
  select t.added_at into v_theirs from public.dli_class_teachers t where t.class_id = class and t.user_id = person;
  if v_theirs is null then return; end if;
  if person = me or v_theirs <= v_mine then raise exception 'dli_cannot_drop'; end if;
  delete from public.dli_class_teachers t where t.class_id = class and t.user_id = person;
end $$;

-- Signed-in people only, never the signed-out public; each function checks the rest itself.
revoke all on function public.dli_class_teachers(uuid), public.dli_add_teacher(uuid, text), public.dli_drop_teacher(uuid, uuid)
  from public, anon;
grant execute on function public.dli_class_teachers(uuid), public.dli_add_teacher(uuid, text), public.dli_drop_teacher(uuid, uuid)
  to authenticated;

-- Tell the API about the new functions straight away.
notify pgrst, 'reload schema';

select 'v13 DLI class teachers: in place' as result,
       (select count(*) from public.dli_classes) as classes,
       (select count(*) from public.dli_class_teachers) as class_teachers;
