-- Schema v10: DLI classes. Students share their last name and weekly study numbers; teachers see their own
-- classes; the app's owner sees every DLI student. Run once in the Supabase SQL editor (safe to re-run).
-- It works before or after v8-safety.sql and v9-fishing.sql.
--
-- WHAT IS STORED, AND NOTHING ELSE
--   a student   their last name (no first name, rank or unit), which of the seven DLI languages they study,
--               when they agreed to share, and one row of numbers per week: days studied, minutes, reviews,
--               how many were remembered, new words started, words saved, words known. Never the words.
--   a teacher   the name they want their students to see ("Ms. Rivera")
--   a class     its name and two codes: one students join with, one a second teacher joins with
--
-- WHO MAY SEE WHAT (enforced here, not in the app)
--   a student   their own record, their classes and those classes' teachers' names
--   a teacher   the students of their OWN classes: last name, language, and the weekly numbers from the week
--               each student joined. Nothing of students in other classes.
--   the owner   every DLI student's last name, language, classes and weekly numbers; the teachers; the
--               teacher code
--   anyone else nothing: the tables below have no reading rules at all, so the API returns nothing from
--               them. Everything goes through the functions further down, each of which checks who is asking.
--
-- HOW SOMEONE BECOMES ...
--   a student   in the app: ticks "I'm a DLI student", signs in, types a last name and agrees (dli_register)
--   a teacher   types the teacher code the owner gave them (dli_use_code). The owner reads that code on the
--               Owner page and can replace it at any time.
--   the owner   THE FIRST TIME this file is run it shows a one-time owner code at the bottom (the result
--               row). Type it in Tamkeen: Settings -> DLI students -> tick "I'm a DLI teacher" -> Teacher code. It works once, for
--               seven days. Run the file again for a new one while there is no owner yet.
--
-- Leaving: a student who stops sharing, or deletes their online account, has their last name, class
-- memberships and every weekly row deleted at once ("on delete cascade"). Weekly rows older than about two
-- years are deleted as new ones arrive.
-- Self-test: supabase/test_rls_dli.sql.

create schema if not exists private;
grant usage on schema private to authenticated, service_role;


-- ======================================================================= 1. tables
-- The codes. One row. In "private": the API cannot reach it.
create table if not exists private.dli_config (
  only_one         boolean primary key default true check (only_one),
  owner_code_hash  text,          -- a fingerprint of the one-time owner code (never the code itself)
  owner_code_until timestamptz,
  teacher_code     text,          -- the code the owner hands to teachers
  teacher_code_at  timestamptz
);
insert into private.dli_config default values on conflict do nothing;

-- The app's owner (normally one account).
create table if not exists private.dli_owners (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  since   timestamptz not null default now()
);

-- Wrong codes typed, to stop guessing: 20 a day each.
create table if not exists private.dli_tries (
  user_id uuid not null,
  at      timestamptz not null default now()
);
create index if not exists dli_tries_user on private.dli_tries (user_id, at);

alter table private.dli_config enable row level security;
alter table private.dli_owners enable row level security;
alter table private.dli_tries enable row level security;

create table if not exists public.dli_students (
  user_id        uuid primary key references public.profiles(id) on delete cascade,
  last_name      text not null check (length(last_name) between 1 and 40 and last_name !~ '[[:cntrl:]<>]'),
  language       text not null check (language in ('ar', 'zh', 'fa', 'fr', 'ko', 'ru', 'es')),
  agreed_at      timestamptz not null default now(),   -- when they agreed to share
  agreed_version integer not null default 1,           -- which wording they agreed to
  updated_at     timestamptz not null default now()
);

create table if not exists public.dli_teachers (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  name    text not null default '' check (length(name) <= 40 and name !~ '[[:cntrl:]<>]'),
  since   timestamptz not null default now()
);

create table if not exists public.dli_classes (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(name) between 1 and 60 and name !~ '[[:cntrl:]<>]'),
  code       text not null unique check (code ~ '^[A-HJ-NP-Z2-9]{6}$'),          -- students join with it
  staff_code text not null unique check (staff_code ~ '^CO[A-HJ-NP-Z2-9]{8}$'),  -- another teacher joins with it
  created_at timestamptz not null default now()
);

-- (A teacher who stops being one, or a student who stops sharing, leaves every class with it.)
create table if not exists public.dli_class_teachers (
  class_id uuid not null references public.dli_classes(id) on delete cascade,
  user_id  uuid not null references public.dli_teachers(user_id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (class_id, user_id)
);
create index if not exists dli_class_teachers_user on public.dli_class_teachers (user_id);

create table if not exists public.dli_class_students (
  class_id  uuid not null references public.dli_classes(id) on delete cascade,
  user_id   uuid not null references public.dli_students(user_id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (class_id, user_id)
);
create index if not exists dli_class_students_user on public.dli_class_students (user_id);

-- One row per student per week (`week` is that week's Monday on the student's own calendar).
create table if not exists public.dli_weeks (
  user_id    uuid not null references public.dli_students(user_id) on delete cascade,
  week       date not null,
  days       smallint not null default 0 check (days between 0 and 7),
  minutes    integer not null default 0 check (minutes between 0 and 10080),
  reviews    integer not null default 0 check (reviews between 0 and 100000),
  remembered integer not null default 0 check (remembered between 0 and 100000),
  new_words  integer not null default 0 check (new_words between 0 and 100000),
  words      integer not null default 0 check (words between 0 and 1000000),
  known      integer not null default 0 check (known between 0 and 1000000),
  updated_at timestamptz not null default now(),
  primary key (user_id, week)
);

-- No reading or writing rules at all: with row-level security on and no rule, the API gets nothing.
alter table public.dli_students enable row level security;
alter table public.dli_teachers enable row level security;
alter table public.dli_classes enable row level security;
alter table public.dli_class_teachers enable row level security;
alter table public.dli_class_students enable row level security;
alter table public.dli_weeks enable row level security;
revoke all on public.dli_students, public.dli_teachers, public.dli_classes, public.dli_class_teachers,
              public.dli_class_students, public.dli_weeks from anon, authenticated;


-- ======================================================================= 2. helpers (private)
-- A random code of n letters and digits (no 0, O, 1 or I, which look alike).
create or replace function private.dli_code(n integer) returns text
language plpgsql volatile set search_path = '' as $$
declare
  abc constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  b bytea := sha256(uuid_send(gen_random_uuid()) || uuid_send(gen_random_uuid()));
  made text := '';
begin
  for i in 0 .. least(greatest(n, 1), 32) - 1 loop
    made := made || substr(abc, (get_byte(b, i) % 32) + 1, 1);
  end loop;
  return made;
end $$;

-- What is typed, tidied: capitals, letters and digits only.
create or replace function private.dli_tidy(code text) returns text
language sql immutable set search_path = '' as $$
  select upper(regexp_replace(coalesce(code, ''), '[^A-Za-z0-9]', '', 'g'));
$$;

-- A name as it is kept: single spaces, no spaces at the ends.
create or replace function private.dli_name(name text) returns text
language sql immutable set search_path = '' as $$
  select btrim(regexp_replace(coalesce(name, ''), '\s+', ' ', 'g'));
$$;

create or replace function private.dli_is_owner(person uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.dli_owners o where o.user_id = person);
$$;

create or replace function private.dli_teaches(person uuid, class uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.dli_class_teachers t where t.user_id = person and t.class_id = class);
$$;

-- The names of a class's teachers, longest-standing first.
create or replace function private.dli_teacher_names(class uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(coalesce(nullif(t.name, ''), 'Teacher') order by ct.added_at, ct.user_id), '[]'::jsonb)
  from public.dli_class_teachers ct join public.dli_teachers t on t.user_id = ct.user_id
  where ct.class_id = class;
$$;

-- A student's weekly rows from `since` on, newest first, at most `most`.
create or replace function private.dli_weeks_of(person uuid, since date, most integer) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('week', w.week, 'days', w.days, 'minutes', w.minutes, 'reviews', w.reviews,
           'remembered', w.remembered, 'new_words', w.new_words, 'words', w.words, 'known', w.known,
           'updated_at', w.updated_at) order by w.week desc), '[]'::jsonb)
  from (select * from public.dli_weeks x where x.user_id = person and x.week >= since
        order by x.week desc limit least(greatest(most, 1), 110)) w;
$$;

-- A class with no teacher left closes (its students simply stop being in it).
create or replace function private.dli_close_empty_class() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.dli_classes c
  where c.id = old.class_id and not exists (select 1 from public.dli_class_teachers t where t.class_id = c.id);
  return old;
end $$;
drop trigger if exists dli_class_teachers_gone on public.dli_class_teachers;
create trigger dli_class_teachers_gone after delete on public.dli_class_teachers
  for each row execute function private.dli_close_empty_class();

revoke all on function private.dli_code(integer), private.dli_tidy(text), private.dli_name(text), private.dli_is_owner(uuid),
  private.dli_teaches(uuid, uuid), private.dli_teacher_names(uuid), private.dli_weeks_of(uuid, date, integer),
  private.dli_close_empty_class() from public, anon, authenticated;


-- ======================================================================= 3. me
-- Everything the app needs to draw my side: am I a student, a teacher, the owner; my classes; my own weeks.
create or replace function public.dli_me() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  v_student jsonb;
  v_teacher jsonb;
  v_classes jsonb;
begin
  if me is null then raise exception 'Not signed in'; end if;
  select jsonb_build_object('last_name', s.last_name, 'language', s.language, 'agreed_at', s.agreed_at,
                            'agreed_version', s.agreed_version)
    into v_student from public.dli_students s where s.user_id = me;
  select jsonb_build_object('name', t.name, 'since', t.since) into v_teacher from public.dli_teachers t where t.user_id = me;
  select coalesce(jsonb_agg(x.item order by x.added), '[]'::jsonb) into v_classes from (
    select cs.joined_at as added, jsonb_build_object('id', c.id, 'name', c.name, 'role', 'student', 'joined_at', cs.joined_at,
             'teachers', private.dli_teacher_names(c.id)) as item
    from public.dli_class_students cs join public.dli_classes c on c.id = cs.class_id where cs.user_id = me
    union all
    select ct.added_at, jsonb_build_object('id', c.id, 'name', c.name, 'role', 'teacher', 'code', c.code, 'staff_code', c.staff_code,
             'students', (select count(*) from public.dli_class_students s where s.class_id = c.id),
             'teachers', private.dli_teacher_names(c.id))
    from public.dli_class_teachers ct join public.dli_classes c on c.id = ct.class_id where ct.user_id = me
  ) x;
  return jsonb_build_object('student', v_student, 'teacher', v_teacher, 'owner', private.dli_is_owner(me), 'classes', v_classes,
    'weeks', case when v_student is null then '[]'::jsonb else private.dli_weeks_of(me, date '2000-01-01', 12) end);
end $$;


-- ======================================================================= 4. students
-- Agree to share: my last name and my DLI language. Calling it again changes the name or the language (the
-- day of agreeing stays, unless the wording agreed to is a newer one: `wording` is its number).
-- (The values are copied into v_... first: a parameter named like a column must never meet that column.)
create or replace function public.dli_register(last_name text, language text, wording integer default 1) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  v_name text := private.dli_name(last_name);
  v_lang text := language;
  v_wording integer := least(greatest(coalesce(wording, 1), 1), 1000);
begin
  if me is null then raise exception 'Not signed in'; end if;
  if length(v_name) < 1 or length(v_name) > 40 or v_name ~ '[[:cntrl:]<>]' then raise exception 'dli_bad_name'; end if;
  if v_lang is null or v_lang not in ('ar', 'zh', 'fa', 'fr', 'ko', 'ru', 'es') then raise exception 'dli_bad_language'; end if;
  insert into public.profiles (id) values (me) on conflict do nothing;
  update public.dli_students s set last_name = v_name, language = v_lang, updated_at = now(),
    agreed_at = case when v_wording > s.agreed_version then now() else s.agreed_at end,
    agreed_version = greatest(s.agreed_version, v_wording)
  where s.user_id = me;
  if not found then
    insert into public.dli_students (user_id, last_name, language, agreed_version) values (me, v_name, v_lang, v_wording);
  end if;
  return public.dli_me();
end $$;

-- Stop sharing: my last name, my class memberships and every weekly row are deleted now.
create or replace function public.dli_unregister() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  delete from public.dli_students s where s.user_id = auth.uid();
end $$;

-- This week's numbers (or last week's, finished late). `week` is the Monday of the week on my own calendar.
-- Only weeks since I agreed, never the future; numbers out of range are pulled into range. False when I
-- am not a DLI student here (the app then stops sending).
create or replace function public.dli_report_week(week date, days integer, minutes integer, reviews integer, remembered integer,
                                                  new_words integer, words integer, known integer) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  v_agreed timestamptz;
  -- (copied into v_... first: a parameter named like a column must never meet that column)
  v_week date := week;
  v_days integer := least(greatest(coalesce(days, 0), 0), 7);
  v_minutes integer := least(greatest(coalesce(minutes, 0), 0), 10080);
  v_reviews integer := least(greatest(coalesce(reviews, 0), 0), 100000);
  v_remembered integer := least(greatest(coalesce(remembered, 0), 0), 100000);
  v_new integer := least(greatest(coalesce(new_words, 0), 0), 100000);
  v_words integer := least(greatest(coalesce(words, 0), 0), 1000000);
  v_known integer := least(greatest(coalesce(known, 0), 0), 1000000);
begin
  if me is null then raise exception 'Not signed in'; end if;
  select s.agreed_at into v_agreed from public.dli_students s where s.user_id = me;
  if v_agreed is null then return false; end if;
  if v_week is null or extract(isodow from v_week) <> 1 then raise exception 'dli_bad_week'; end if;
  -- (a little either side, for time zones: my Monday can start before or after the server's)
  if v_week > current_date + 1 or v_week < (date_trunc('week', v_agreed)::date - 7) then return true; end if;
  v_remembered := least(v_remembered, v_reviews);
  v_known := least(v_known, v_words);
  update public.dli_weeks w set days = v_days, minutes = v_minutes, reviews = v_reviews, remembered = v_remembered,
    new_words = v_new, words = v_words, known = v_known, updated_at = now()
  where w.user_id = me and w.week = v_week;
  if not found then
    begin
      insert into public.dli_weeks (user_id, week, days, minutes, reviews, remembered, new_words, words, known)
      values (me, v_week, v_days, v_minutes, v_reviews, v_remembered, v_new, v_words, v_known);
    exception when unique_violation then null;  -- (another of my devices sent the same week at the same moment)
    end;
  end if;
  delete from public.dli_weeks w where w.user_id = me and w.week < current_date - 760;
  return true;
end $$;


-- ======================================================================= 5. codes
-- One box in the app takes every kind of code. Answers {status}:
--   "owner"        the one-time owner code: I am now the owner (and a teacher)
--   "teacher"      the teacher code: I am now a teacher
--   "coteacher"    a class's second code, typed by a teacher: I now teach that class too  (+ class, name)
--   "joined"       a class code, typed by a student: I am in that class                    (+ class, name)
--   "need_student" a class code, but I haven't agreed to share yet
--   "need_teacher" a class's second code, but I am not a teacher
--   "full"         that class (60 students, 10 teachers) or my own list (10 classes as a student) is full
--   "wait"         20 wrong codes today: try again tomorrow
--   "no"           not a code
create or replace function public.dli_use_code(code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  c text := private.dli_tidy(code);
  cfg private.dli_config%rowtype;
  cls public.dli_classes%rowtype;
begin
  if me is null then raise exception 'Not signed in'; end if;
  if (select count(*) from private.dli_tries t where t.user_id = me and t.at > now() - interval '1 day') >= 20 then
    return jsonb_build_object('status', 'wait');
  end if;
  select * into cfg from private.dli_config limit 1;

  if length(c) = 23 and left(c, 3) = 'OWN' and cfg.owner_code_hash is not null and cfg.owner_code_until > now()
     and encode(sha256(convert_to(c, 'UTF8')), 'hex') = cfg.owner_code_hash then
    insert into public.profiles (id) values (me) on conflict do nothing;
    insert into private.dli_owners (user_id) values (me) on conflict do nothing;
    insert into public.dli_teachers (user_id) values (me) on conflict do nothing;
    update private.dli_config set owner_code_hash = null, owner_code_until = null;
    return jsonb_build_object('status', 'owner');
  end if;

  if length(c) = 15 and left(c, 3) = 'TCH' and cfg.teacher_code is not null and c = cfg.teacher_code then
    insert into public.profiles (id) values (me) on conflict do nothing;
    insert into public.dli_teachers (user_id) values (me) on conflict do nothing;
    return jsonb_build_object('status', 'teacher');
  end if;

  if length(c) = 10 and left(c, 2) = 'CO' then
    select * into cls from public.dli_classes k where k.staff_code = c;
    if found then
      if not exists (select 1 from public.dli_teachers t where t.user_id = me) then
        insert into private.dli_tries (user_id) values (me);  -- (counted, so codes can't be found by guessing)
        return jsonb_build_object('status', 'need_teacher');
      end if;
      if (select count(*) from public.dli_class_teachers t where t.class_id = cls.id) >= 10 then
        return jsonb_build_object('status', 'full');
      end if;
      insert into public.dli_class_teachers (class_id, user_id) values (cls.id, me) on conflict do nothing;
      return jsonb_build_object('status', 'coteacher', 'class', cls.id, 'name', cls.name);
    end if;
  end if;

  if length(c) = 6 then
    select * into cls from public.dli_classes k where k.code = c;
    if found then
      if not exists (select 1 from public.dli_students s where s.user_id = me) then
        insert into private.dli_tries (user_id) values (me);
        return jsonb_build_object('status', 'need_student');
      end if;
      if exists (select 1 from public.dli_class_students s where s.class_id = cls.id and s.user_id = me) then
        return jsonb_build_object('status', 'joined', 'class', cls.id, 'name', cls.name);
      end if;
      if (select count(*) from public.dli_class_students s where s.class_id = cls.id) >= 60
         or (select count(*) from public.dli_class_students s where s.user_id = me) >= 10 then
        return jsonb_build_object('status', 'full');
      end if;
      insert into public.dli_class_students (class_id, user_id) values (cls.id, me);
      return jsonb_build_object('status', 'joined', 'class', cls.id, 'name', cls.name);
    end if;
  end if;

  insert into private.dli_tries (user_id) values (me);
  delete from private.dli_tries t where t.at < now() - interval '2 days';
  return jsonb_build_object('status', 'no');
end $$;


-- ======================================================================= 6. teachers
-- The name my students see for me.
create or replace function public.dli_set_teacher_name(name text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_name text := private.dli_name(name);
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if length(v_name) > 40 or v_name ~ '[[:cntrl:]<>]' then raise exception 'dli_bad_name'; end if;
  update public.dli_teachers t set name = v_name where t.user_id = auth.uid();
  if not found then raise exception 'dli_not_teacher'; end if;
end $$;

-- Start a class (20 each at most). Answers {id, name, code, staff_code}.
create or replace function public.dli_create_class(name text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  v_name text := private.dli_name(name);
  v_id uuid;
  v_code text;
  v_staff text;
begin
  if me is null then raise exception 'Not signed in'; end if;
  if not exists (select 1 from public.dli_teachers t where t.user_id = me) then raise exception 'dli_not_teacher'; end if;
  if length(v_name) < 1 or length(v_name) > 60 or v_name ~ '[[:cntrl:]<>]' then raise exception 'dli_bad_name'; end if;
  if (select count(*) from public.dli_class_teachers t where t.user_id = me) >= 20 then raise exception 'dli_class_limit'; end if;
  loop
    v_code := private.dli_code(6);
    v_staff := 'CO' || private.dli_code(8);
    exit when not exists (select 1 from public.dli_classes c where c.code = v_code or c.staff_code = v_staff);
  end loop;
  insert into public.dli_classes (name, code, staff_code) values (v_name, v_code, v_staff) returning id into v_id;
  insert into public.dli_class_teachers (class_id, user_id) values (v_id, me);
  return jsonb_build_object('id', v_id, 'name', v_name, 'code', v_code, 'staff_code', v_staff);
end $$;

create or replace function public.dli_rename_class(class uuid, name text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_name text := private.dli_name(name);
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if not private.dli_teaches(auth.uid(), class) then raise exception 'dli_not_your_class'; end if;
  if length(v_name) < 1 or length(v_name) > 60 or v_name ~ '[[:cntrl:]<>]' then raise exception 'dli_bad_name'; end if;
  update public.dli_classes c set name = v_name where c.id = class;
end $$;

-- New codes for a class (when one got out). The people already in it stay. Answers {code, staff_code}.
create or replace function public.dli_new_codes(class uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_code text;
  v_staff text;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if not private.dli_teaches(auth.uid(), class) then raise exception 'dli_not_your_class'; end if;
  loop
    v_code := private.dli_code(6);
    v_staff := 'CO' || private.dli_code(8);
    exit when not exists (select 1 from public.dli_classes c where c.code = v_code or c.staff_code = v_staff);
  end loop;
  update public.dli_classes c set code = v_code, staff_code = v_staff where c.id = class;
  return jsonb_build_object('code', v_code, 'staff_code', v_staff);
end $$;

create or replace function public.dli_delete_class(class uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if not private.dli_teaches(auth.uid(), class) then raise exception 'dli_not_your_class'; end if;
  delete from public.dli_classes c where c.id = class;
end $$;

-- Leave a class, as its student or as one of its teachers (the last teacher leaving closes it).
create or replace function public.dli_leave_class(class uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  delete from public.dli_class_students s where s.class_id = class and s.user_id = auth.uid();
  delete from public.dli_class_teachers t where t.class_id = class and t.user_id = auth.uid();
end $$;

-- A teacher takes a student out of their class.
create or replace function public.dli_remove_student(class uuid, student uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if not private.dli_teaches(auth.uid(), class) then raise exception 'dli_not_your_class'; end if;
  delete from public.dli_class_students s where s.class_id = class and s.user_id = student;
end $$;

-- A class as its teachers see it: each student's last name, language and weekly numbers, from the week they
-- joined the class (at most `weeks` weeks back, 12 unless asked, never more than 104).
create or replace function public.dli_class_report(class uuid, weeks integer default 12) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  v_weeks integer := least(greatest(coalesce(weeks, 12), 1), 104);
  v_from date := current_date - (v_weeks * 7);
  v_class jsonb;
  v_students jsonb;
begin
  if me is null then raise exception 'Not signed in'; end if;
  if not private.dli_teaches(me, class) then raise exception 'dli_not_your_class'; end if;
  select jsonb_build_object('id', c.id, 'name', c.name, 'code', c.code, 'staff_code', c.staff_code,
                            'teachers', private.dli_teacher_names(c.id))
    into v_class from public.dli_classes c where c.id = class;
  select coalesce(jsonb_agg(jsonb_build_object('id', s.user_id, 'last_name', s.last_name, 'language', s.language,
           'joined_at', cs.joined_at,
           'weeks', private.dli_weeks_of(s.user_id, greatest(v_from, date_trunc('week', cs.joined_at)::date), v_weeks))
           order by lower(s.last_name), s.user_id), '[]'::jsonb)
    into v_students
  from public.dli_class_students cs join public.dli_students s on s.user_id = cs.user_id
  where cs.class_id = class;
  return jsonb_build_object('class', v_class, 'students', v_students);
end $$;


-- ======================================================================= 7. the owner
-- Every DLI student, the teachers, the classes and the teacher code. Only the owner.
create or replace function public.dli_owner_report(weeks integer default 12) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  v_weeks integer := least(greatest(coalesce(weeks, 12), 1), 104);
  v_from date := current_date - (v_weeks * 7);
  v_students jsonb;
  v_teachers jsonb;
  v_classes jsonb;
begin
  if me is null then raise exception 'Not signed in'; end if;
  if not private.dli_is_owner(me) then raise exception 'dli_not_owner'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', s.user_id, 'last_name', s.last_name, 'language', s.language,
           'agreed_at', s.agreed_at,
           'classes', (select coalesce(jsonb_agg(c.name order by cs.joined_at), '[]'::jsonb)
                       from public.dli_class_students cs join public.dli_classes c on c.id = cs.class_id
                       where cs.user_id = s.user_id),
           'weeks', private.dli_weeks_of(s.user_id, v_from, v_weeks))
           order by lower(s.last_name), s.user_id), '[]'::jsonb)
    into v_students from public.dli_students s;
  select coalesce(jsonb_agg(jsonb_build_object('id', t.user_id, 'name', t.name, 'username', p.username, 'since', t.since,
           'classes', (select count(*) from public.dli_class_teachers ct where ct.user_id = t.user_id))
           order by t.since, t.user_id), '[]'::jsonb)
    into v_teachers from public.dli_teachers t left join public.profiles p on p.id = t.user_id;
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'created_at', c.created_at,
           'students', (select count(*) from public.dli_class_students cs where cs.class_id = c.id),
           'teachers', private.dli_teacher_names(c.id)) order by c.created_at, c.id), '[]'::jsonb)
    into v_classes from public.dli_classes c;
  return jsonb_build_object('students', v_students, 'teachers', v_teachers, 'classes', v_classes,
    'teacher_code', (select g.teacher_code from private.dli_config g limit 1),
    'teacher_code_at', (select g.teacher_code_at from private.dli_config g limit 1));
end $$;

-- A new teacher code (the old one stops working; teachers who already used it stay teachers).
create or replace function public.dli_owner_new_teacher_code() returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_code text := 'TCH' || private.dli_code(12);
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if not private.dli_is_owner(auth.uid()) then raise exception 'dli_not_owner'; end if;
  update private.dli_config set teacher_code = v_code, teacher_code_at = now();
  return v_code;
end $$;

-- Someone stops being a teacher: they leave their classes (a class with no teacher left closes).
create or replace function public.dli_owner_remove_teacher(person uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if not private.dli_is_owner(auth.uid()) then raise exception 'dli_not_owner'; end if;
  delete from public.dli_teachers t where t.user_id = person;
end $$;

-- Delete a student's DLI record (someone who left DLI): last name, classes and weekly rows.
create or replace function public.dli_owner_remove_student(person uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if not private.dli_is_owner(auth.uid()) then raise exception 'dli_not_owner'; end if;
  delete from public.dli_students s where s.user_id = person;
end $$;


-- ======================================================================= 8. who may run what
-- Signed-in people only, never the signed-out public; each function checks the rest itself.
revoke all on function public.dli_me(), public.dli_register(text, text, integer), public.dli_unregister(),
  public.dli_report_week(date, integer, integer, integer, integer, integer, integer, integer), public.dli_use_code(text),
  public.dli_set_teacher_name(text), public.dli_create_class(text), public.dli_rename_class(uuid, text),
  public.dli_new_codes(uuid), public.dli_delete_class(uuid), public.dli_leave_class(uuid),
  public.dli_remove_student(uuid, uuid), public.dli_class_report(uuid, integer), public.dli_owner_report(integer),
  public.dli_owner_new_teacher_code(), public.dli_owner_remove_teacher(uuid), public.dli_owner_remove_student(uuid)
  from public, anon;
grant execute on function public.dli_me(), public.dli_register(text, text, integer), public.dli_unregister(),
  public.dli_report_week(date, integer, integer, integer, integer, integer, integer, integer), public.dli_use_code(text),
  public.dli_set_teacher_name(text), public.dli_create_class(text), public.dli_rename_class(uuid, text),
  public.dli_new_codes(uuid), public.dli_delete_class(uuid), public.dli_leave_class(uuid),
  public.dli_remove_student(uuid, uuid), public.dli_class_report(uuid, integer), public.dli_owner_report(integer),
  public.dli_owner_new_teacher_code(), public.dli_owner_remove_teacher(uuid), public.dli_owner_remove_student(uuid)
  to authenticated;


-- ======================================================================= 9. first run: the codes
-- A teacher code if there is none yet, and (while nobody is the owner) a fresh one-time owner code, shown
-- once in the result below and kept here only as a fingerprint.
do $$
declare
  v_code text;
begin
  update private.dli_config set teacher_code = 'TCH' || private.dli_code(12), teacher_code_at = now() where teacher_code is null;
  perform set_config('tamkeen.dli_owner_code', '', false);
  if not exists (select 1 from private.dli_owners) then
    v_code := 'OWN' || private.dli_code(20);
    update private.dli_config set owner_code_hash = encode(sha256(convert_to(v_code, 'UTF8')), 'hex'),
                                  owner_code_until = now() + interval '7 days';
    perform set_config('tamkeen.dli_owner_code',
      regexp_replace(v_code, '^(.{3})(.{5})(.{5})(.{5})(.{5})$', '\1-\2-\3-\4-\5'), false);
  end if;
end $$;

-- Tell the API about the new functions straight away.
notify pgrst, 'reload schema';

-- The result row. owner_code: type it in Tamkeen (Settings -> DLI students -> I'm a DLI teacher -> Teacher code) within seven
-- days; it works once. After that this says an owner is set.
select 'v10 DLI classes: in place' as result,
       coalesce(nullif(current_setting('tamkeen.dli_owner_code', true), ''), 'an owner is already set') as owner_code,
       (select count(*) from private.dli_owners) as owners,
       (select count(*) from public.dli_students) as students,
       (select count(*) from public.dli_teachers) as teachers,
       (select count(*) from public.dli_classes) as classes;
