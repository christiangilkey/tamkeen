-- Schema v12: DLI lessons. A teacher hands a lesson (a passage, its questions and its audio tracks) to a class;
-- each student answers it in Tamkeen and hands it in; the teacher reads the answers and can give a student study
-- words from the passage. Run once in the Supabase SQL editor AFTER v10-dli-classes.sql and v11-dli-activity.sql
-- (safe to re-run).
--
-- WHAT IS STORED, AND NOTHING ELSE
--   a lesson     its title, language, the questions (their wording and choices), the teacher's answer key, the
--                names of its files in the private "dli-lessons" storage (the packed passage and the audio tracks),
--                a version number (raised when the teacher sends a corrected copy) and an optional due day
--   a student's  their answers to that lesson's questions, when they handed it in, and the study words a teacher
--   work         gave them from the passage (word + its sentence), with when they were given and taken
--   No names: people show by username (v11's private.dli_handle). No grade or score is kept.
--
-- WHO MAY SEE WHAT (enforced here, not in the app)
--   a teacher    the lessons of their OWN classes, every student's answers to them, the answer key; may add,
--                correct and remove those lessons and give study words to those classes' students
--   a student    the lessons of the classes they are in (never the answer key), their OWN answers and study words
--   anyone else  nothing: the tables have row-level security on and no reading or writing rule at all;
--                everything goes through the dli_* functions below, each of which checks who is asking.
--   files        storage bucket "dli-lessons" (private), at <class id>/<lesson id>/<file>: read by the class's
--                teachers and students, added and removed by its teachers only (the rules at section 5).
--
-- Leaving: a student who leaves the class, stops sharing or deletes their account loses access at once; their work
-- rows go with their student record ("on delete cascade"). A class that closes takes its lessons and work with it
-- (the files are removed by the app; any left behind are listed by private.dli_lesson_orphans for the owner).
-- Self-test: supabase/test_rls_dli_lessons.sql.

create schema if not exists private;
grant usage on schema private to authenticated, service_role;


-- ======================================================================= 1. tables
create table if not exists public.dli_lessons (
  id         uuid primary key default gen_random_uuid(),
  class_id   uuid not null references public.dli_classes(id) on delete cascade,
  teacher    uuid references public.dli_teachers(user_id) on delete set null,  -- who added it
  title      text not null check (length(title) between 1 and 120 and title !~ '[[:cntrl:]<>]'),
  language   text not null default '' check (language ~ '^[a-z]{0,3}(-[a-z0-9]{1,8})?$'),
  questions  jsonb not null default '[]'::jsonb check (jsonb_typeof(questions) = 'array' and pg_column_size(questions) <= 200000),
  answer_key jsonb not null default '{}'::jsonb check (jsonb_typeof(answer_key) = 'object' and pg_column_size(answer_key) <= 50000),
  files      jsonb not null default '[]'::jsonb check (jsonb_typeof(files) = 'array' and jsonb_array_length(files) <= 61),
  version    integer not null default 0 check (version between 0 and 10000),   -- 0 = still being uploaded
  due        date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists dli_lessons_class on public.dli_lessons (class_id, created_at);

create table if not exists public.dli_lesson_work (
  lesson_id      uuid not null references public.dli_lessons(id) on delete cascade,
  user_id        uuid not null references public.dli_students(user_id) on delete cascade,
  answers        jsonb not null default '{}'::jsonb check (jsonb_typeof(answers) = 'object' and pg_column_size(answers) <= 100000),
  handed_at      timestamptz,
  words          jsonb not null default '[]'::jsonb check (jsonb_typeof(words) = 'array' and jsonb_array_length(words) <= 200
                                                           and pg_column_size(words) <= 100000),
  words_at       timestamptz,
  words_taken_at timestamptz,
  updated_at     timestamptz not null default now(),
  primary key (lesson_id, user_id)
);
create index if not exists dli_lesson_work_user on public.dli_lesson_work (user_id);

alter table public.dli_lessons enable row level security;
alter table public.dli_lesson_work enable row level security;
revoke all on public.dli_lessons, public.dli_lesson_work from anon, authenticated;


-- ======================================================================= 2. helpers (private)
-- Is `person` in `class` as a student?
create or replace function private.dli_in_class(person uuid, class uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.dli_class_students s where s.user_id = person and s.class_id = class);
$$;

-- A folder name as a uuid, or null (a storage path is text: a bad one must never stop a rule with an error).
create or replace function private.dli_uuid(t text) returns uuid
language sql immutable set search_path = '' as $$
  select case when t ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then t::uuid end;
$$;

-- May the signed-in person read the files at <class>/<lesson>/…? Its teachers, and its students once it is sent.
create or replace function private.dli_lesson_reader(class text, lesson text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.dli_lessons l
                 where l.id = private.dli_uuid(lesson) and l.class_id = private.dli_uuid(class)
                   and (private.dli_teaches(auth.uid(), l.class_id)
                        or (l.version > 0 and private.dli_in_class(auth.uid(), l.class_id))));
$$;

-- May the signed-in person add or remove files there? Only a teacher of that class.
create or replace function private.dli_lesson_writer(class text, lesson text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.dli_lessons l
                 where l.id = private.dli_uuid(lesson) and l.class_id = private.dli_uuid(class)
                   and private.dli_teaches(auth.uid(), l.class_id));
$$;

-- A list of file names as kept: at most 61, each a plain name (letters, digits, - _ .), no folders.
create or replace function private.dli_clean_files(files jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare
  v_out jsonb := '[]'::jsonb;
  v_item jsonb;
begin
  if files is null or jsonb_typeof(files) <> 'array' then return v_out; end if;
  for v_item in select value from jsonb_array_elements(files) loop
    if jsonb_typeof(v_item) = 'string' and (v_item #>> '{}') ~ '^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,79}$'
       and (v_item #>> '{}') !~ '\.\.' and not v_out @> jsonb_build_array(v_item) then
      v_out := v_out || jsonb_build_array(v_item);
    end if;
    exit when jsonb_array_length(v_out) >= 61;
  end loop;
  return v_out;
end $$;

-- Study words as kept: at most 200 of {word ≤ 80 characters, sentence ≤ 400}, nothing else.
create or replace function private.dli_clean_words(words jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare
  v_out jsonb := '[]'::jsonb;
  v_item jsonb;
  v_word text;
begin
  if words is null or jsonb_typeof(words) <> 'array' then return v_out; end if;
  for v_item in select value from jsonb_array_elements(words) loop
    if jsonb_typeof(v_item) = 'object' then
      v_word := left(regexp_replace(coalesce(v_item->>'word', ''), '[[:cntrl:]<>]', '', 'g'), 80);
      if length(btrim(v_word)) > 0 then
        v_out := v_out || jsonb_build_array(jsonb_build_object('word', btrim(v_word),
          'sentence', left(regexp_replace(coalesce(v_item->>'sentence', ''), '[[:cntrl:]<>]', '', 'g'), 400)));
      end if;
    end if;
    exit when jsonb_array_length(v_out) >= 200;
  end loop;
  return v_out;
end $$;

-- A lesson as a class's student sees it (no answer key), with that student's own work.
create or replace function private.dli_lesson_for_student(l public.dli_lessons, person uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', l.id, 'class', l.class_id, 'class_name', c.name, 'title', l.title, 'language', l.language,
           'questions', l.questions, 'files', l.files, 'version', l.version, 'due', l.due, 'sent_at', l.created_at,
           'updated_at', l.updated_at, 'teachers', private.dli_teacher_names(l.class_id),
           'answers', coalesce(w.answers, '{}'::jsonb), 'handed_at', w.handed_at,
           'words', coalesce(w.words, '[]'::jsonb), 'words_at', w.words_at, 'words_taken_at', w.words_taken_at)
  from public.dli_classes c
  left join public.dli_lesson_work w on w.lesson_id = l.id and w.user_id = person
  where c.id = l.class_id;
$$;

-- Files of lessons whose class has gone (the owner can remove them in the dashboard's storage page).
create or replace function private.dli_lesson_orphans() returns setof text
language sql stable security definer set search_path = '' as $$
  select o.name from storage.objects o
  where o.bucket_id = 'dli-lessons'
    and not exists (select 1 from public.dli_lessons l
                    where l.id = private.dli_uuid(split_part(o.name, '/', 2)) and l.class_id = private.dli_uuid(split_part(o.name, '/', 1)));
$$;

revoke all on function private.dli_in_class(uuid, uuid), private.dli_uuid(text), private.dli_clean_files(jsonb),
  private.dli_clean_words(jsonb), private.dli_lesson_for_student(public.dli_lessons, uuid), private.dli_lesson_orphans()
  from public, anon, authenticated;
-- (The two storage rules call these as the signed-in person: they only say yes or no about that person's own access.)
revoke all on function private.dli_lesson_reader(text, text), private.dli_lesson_writer(text, text) from public, anon;
grant execute on function private.dli_lesson_reader(text, text), private.dli_lesson_writer(text, text) to authenticated;


-- ======================================================================= 3. teachers
-- Start a lesson for one of my classes. It stays hidden from the students (version 0) until dli_send_lesson.
-- `questions`: [{id, kind, prompt, options: [{id, text}], at, lines}]; `answer_key`: {question id: answer}.
create or replace function public.dli_add_lesson(class uuid, title text, language text, questions jsonb,
                                                 answer_key jsonb default '{}'::jsonb, due date default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  v_class uuid := class;
  v_title text := left(btrim(regexp_replace(coalesce(title, ''), '[[:cntrl:]<>]', ' ', 'g')), 120);
  v_lang text := lower(left(coalesce(language, ''), 12));
  v_id uuid;
begin
  if me is null then raise exception 'Not signed in'; end if;
  if not private.dli_teaches(me, v_class) then raise exception 'dli_not_your_class'; end if;
  if v_title = '' then raise exception 'dli_lesson_needs_title'; end if;
  if v_lang !~ '^[a-z]{0,3}(-[a-z0-9]{1,8})?$' then v_lang := ''; end if;
  if (select count(*) from public.dli_lessons l where l.class_id = v_class) >= 300 then raise exception 'dli_too_many_lessons'; end if;
  insert into public.dli_lessons (class_id, teacher, title, language, questions, answer_key, due)
  values (v_class, me, v_title, v_lang,
          case when jsonb_typeof(questions) = 'array' then questions else '[]'::jsonb end,
          case when jsonb_typeof(answer_key) = 'object' then answer_key else '{}'::jsonb end, due)
  returning id into v_id;
  return v_id;
end $$;

-- The files are uploaded: show the lesson to the class (first time), or send the corrected copy (each time after:
-- the version goes up and the students' apps take the new transcripts and passage). Returns the new version.
create or replace function public.dli_send_lesson(lesson uuid, files jsonb, questions jsonb default null,
                                                  answer_key jsonb default null, title text default null) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  v_lesson uuid := lesson;
  v_class uuid;
  v_title text := left(btrim(regexp_replace(coalesce(title, ''), '[[:cntrl:]<>]', ' ', 'g')), 120);
  v_version integer;
begin
  if me is null then raise exception 'Not signed in'; end if;
  select l.class_id into v_class from public.dli_lessons l where l.id = v_lesson;
  if v_class is null or not private.dli_teaches(me, v_class) then raise exception 'dli_not_your_class'; end if;
  update public.dli_lessons l set files = private.dli_clean_files(files),
         questions = case when jsonb_typeof(dli_send_lesson.questions) = 'array' then dli_send_lesson.questions else l.questions end,
         answer_key = case when jsonb_typeof(dli_send_lesson.answer_key) = 'object' then dli_send_lesson.answer_key else l.answer_key end,
         title = case when v_title <> '' then v_title else l.title end,
         version = l.version + 1, updated_at = now()
  where l.id = v_lesson returning l.version into v_version;
  return v_version;
end $$;

-- Change the due day (null = none).
create or replace function public.dli_set_lesson_due(lesson uuid, due date) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_lesson uuid := lesson;
  v_due date := due;
  v_class uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select l.class_id into v_class from public.dli_lessons l where l.id = v_lesson;
  if v_class is null or not private.dli_teaches(auth.uid(), v_class) then raise exception 'dli_not_your_class'; end if;
  update public.dli_lessons l set due = v_due, updated_at = now() where l.id = v_lesson;
end $$;

-- Remove a lesson and every student's work on it. The app deletes the lesson's files FIRST (the storage rule lets a
-- teacher do that only while the lesson exists); this returns any path still there (normally none).
create or replace function public.dli_remove_lesson(lesson uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_lesson uuid := lesson;
  v_class uuid;
  v_paths jsonb;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select l.class_id into v_class from public.dli_lessons l where l.id = v_lesson;
  if v_class is null or not private.dli_teaches(auth.uid(), v_class) then raise exception 'dli_not_your_class'; end if;
  select coalesce(jsonb_agg(o.name), '[]'::jsonb) into v_paths from storage.objects o
  where o.bucket_id = 'dli-lessons' and o.name like v_class::text || '/' || v_lesson::text || '/%';
  delete from public.dli_lessons l where l.id = v_lesson;
  return v_paths;
end $$;

-- A class's lessons, newest first, with how many students handed each in.
create or replace function public.dli_class_lessons(class uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_class uuid := class;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if not private.dli_teaches(auth.uid(), v_class) then raise exception 'dli_not_your_class'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'title', l.title, 'language', l.language,
      'version', l.version, 'due', l.due, 'sent_at', l.created_at, 'updated_at', l.updated_at, 'files', l.files,
      'questions', jsonb_array_length(l.questions),
      'handed', (select count(*) from public.dli_lesson_work w join public.dli_class_students s
                   on s.user_id = w.user_id and s.class_id = l.class_id where w.lesson_id = l.id and w.handed_at is not null),
      'students', (select count(*) from public.dli_class_students s where s.class_id = l.class_id))
    order by l.created_at desc, l.id) from public.dli_lessons l where l.class_id = v_class), '[]'::jsonb);
end $$;

-- One lesson as its teachers see it: the questions, the key, and every student of the class with their work.
create or replace function public.dli_lesson_report(lesson uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_lesson uuid := lesson;
  l public.dli_lessons;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select * into l from public.dli_lessons x where x.id = v_lesson;
  if l.id is null or not private.dli_teaches(auth.uid(), l.class_id) then raise exception 'dli_not_your_class'; end if;
  return jsonb_build_object(
    'lesson', jsonb_build_object('id', l.id, 'class', l.class_id, 'title', l.title, 'language', l.language,
                                 'questions', l.questions, 'answer_key', l.answer_key, 'files', l.files,
                                 'version', l.version, 'due', l.due, 'sent_at', l.created_at),
    'students', coalesce((select jsonb_agg(jsonb_build_object('id', s.user_id, 'username', private.dli_handle(s.user_id),
        'answers', coalesce(w.answers, '{}'::jsonb), 'handed_at', w.handed_at, 'updated_at', w.updated_at,
        'words', coalesce(w.words, '[]'::jsonb), 'words_at', w.words_at, 'words_taken_at', w.words_taken_at)
      order by lower(private.dli_handle(s.user_id)), s.user_id)
      from public.dli_class_students s
      left join public.dli_lesson_work w on w.lesson_id = l.id and w.user_id = s.user_id
      where s.class_id = l.class_id), '[]'::jsonb));
end $$;

-- Give one student of the class study words from the lesson (replaces the ones given before).
create or replace function public.dli_give_words(lesson uuid, student uuid, words jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_lesson uuid := lesson;
  v_student uuid := student;
  v_class uuid;
  v_words jsonb := private.dli_clean_words(words);
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select l.class_id into v_class from public.dli_lessons l where l.id = v_lesson;
  if v_class is null or not private.dli_teaches(auth.uid(), v_class) then raise exception 'dli_not_your_class'; end if;
  if not private.dli_in_class(v_student, v_class) then raise exception 'dli_not_in_class'; end if;
  insert into public.dli_lesson_work as w (lesson_id, user_id, words, words_at, words_taken_at)
  values (v_lesson, v_student, v_words, now(), null)
  on conflict (lesson_id, user_id) do update set words = excluded.words, words_at = now(), words_taken_at = null,
    updated_at = now();
  return jsonb_array_length(v_words);
end $$;


-- ======================================================================= 4. students
-- The lessons sent to the classes I'm in, newest first, each with my own answers and study words.
create or replace function public.dli_my_lessons() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'Not signed in'; end if;
  return coalesce((select jsonb_agg(private.dli_lesson_for_student(l, me) order by l.created_at desc, l.id)
    from public.dli_lessons l
    where l.version > 0 and private.dli_in_class(me, l.class_id)), '[]'::jsonb);
end $$;

-- Keep my answers (and, with hand_in, hand the lesson in: the teacher sees when). At most 300 answers, each ≤ 4000
-- characters (a list of choices or a typed text).
create or replace function public.dli_save_work(lesson uuid, answers jsonb, hand_in boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  v_lesson uuid := lesson;
  v_class uuid;
  v_in jsonb := case when jsonb_typeof(answers) = 'object' then answers else '{}'::jsonb end;
  v_out jsonb := '{}'::jsonb;
  v_key text;
  v_value jsonb;
  v_hand boolean := coalesce(hand_in, false);
begin
  if me is null then raise exception 'Not signed in'; end if;
  select l.class_id into v_class from public.dli_lessons l where l.id = v_lesson and l.version > 0;
  if v_class is null or not private.dli_in_class(me, v_class) then raise exception 'dli_not_your_lesson'; end if;
  for v_key, v_value in select key, value from jsonb_each(v_in) loop
    exit when (select count(*) from jsonb_object_keys(v_out)) >= 300;
    continue when v_key !~ '^[A-Za-z0-9_-]{1,24}$';
    if jsonb_typeof(v_value) = 'string' then
      v_out := v_out || jsonb_build_object(v_key, left(v_value #>> '{}', 4000));
    elsif jsonb_typeof(v_value) = 'array' and jsonb_array_length(v_value) <= 26 then
      v_out := v_out || jsonb_build_object(v_key, (select coalesce(jsonb_agg(left(x #>> '{}', 24)), '[]'::jsonb)
                                                   from jsonb_array_elements(v_value) x where jsonb_typeof(x) = 'string'));
    end if;
  end loop;
  insert into public.dli_lesson_work as w (lesson_id, user_id, answers, handed_at)
  values (v_lesson, me, v_out, case when v_hand then now() end)
  on conflict (lesson_id, user_id) do update set answers = excluded.answers,
    handed_at = case when v_hand then now() else w.handed_at end, updated_at = now();
  return (select private.dli_lesson_for_student(l, me) from public.dli_lessons l where l.id = v_lesson);
end $$;

-- My app has put the study words in my Vocab.
create or replace function public.dli_took_words(lesson uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_lesson uuid := lesson;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  update public.dli_lesson_work w set words_taken_at = now(), updated_at = now()
  where w.lesson_id = v_lesson and w.user_id = auth.uid();
end $$;


-- ======================================================================= 5. the files
-- Private storage: <class id>/<lesson id>/<file>. Each file at most 25 MB; the packed passage (gzip) and audio only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('dli-lessons', 'dli-lessons', false, 26214400,
        array['application/gzip', 'audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/ogg', 'audio/wav', 'audio/x-wav',
              'audio/webm', 'audio/flac', 'audio/x-m4a', 'audio/opus'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "dli-lessons: class reads" on storage.objects;
create policy "dli-lessons: class reads" on storage.objects
  for select to authenticated
  using (bucket_id = 'dli-lessons' and private.dli_lesson_reader((storage.foldername(name))[1], (storage.foldername(name))[2]));
drop policy if exists "dli-lessons: teachers add" on storage.objects;
create policy "dli-lessons: teachers add" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'dli-lessons' and array_length(storage.foldername(name), 1) = 2
              and private.dli_lesson_writer((storage.foldername(name))[1], (storage.foldername(name))[2]));
drop policy if exists "dli-lessons: teachers remove" on storage.objects;
create policy "dli-lessons: teachers remove" on storage.objects
  for delete to authenticated
  using (bucket_id = 'dli-lessons' and private.dli_lesson_writer((storage.foldername(name))[1], (storage.foldername(name))[2]));


-- ======================================================================= 6. who may run what
-- Signed-in people only, never the signed-out public; each function checks the rest itself.
revoke all on function public.dli_add_lesson(uuid, text, text, jsonb, jsonb, date), public.dli_send_lesson(uuid, jsonb, jsonb, jsonb, text),
  public.dli_set_lesson_due(uuid, date), public.dli_remove_lesson(uuid), public.dli_class_lessons(uuid), public.dli_lesson_report(uuid),
  public.dli_give_words(uuid, uuid, jsonb), public.dli_my_lessons(), public.dli_save_work(uuid, jsonb, boolean),
  public.dli_took_words(uuid)
  from public, anon;
grant execute on function public.dli_add_lesson(uuid, text, text, jsonb, jsonb, date), public.dli_send_lesson(uuid, jsonb, jsonb, jsonb, text),
  public.dli_set_lesson_due(uuid, date), public.dli_remove_lesson(uuid), public.dli_class_lessons(uuid), public.dli_lesson_report(uuid),
  public.dli_give_words(uuid, uuid, jsonb), public.dli_my_lessons(), public.dli_save_work(uuid, jsonb, boolean),
  public.dli_took_words(uuid)
  to authenticated;

notify pgrst, 'reload schema';

select 'v12 DLI lessons: in place' as result,
       (select count(*) from public.dli_lessons) as lessons,
       (select count(*) from public.dli_lesson_work) as work_rows,
       (select count(*) from private.dli_lesson_orphans()) as files_without_a_lesson;
