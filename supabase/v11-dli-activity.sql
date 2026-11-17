-- Schema v11: no more names, and listening, watching and reading time in DLI students' weekly numbers. Run once
-- in the Supabase SQL editor AFTER v10-dli-classes.sql (safe to re-run). Until it is run, the app (v0.61 on)
-- keeps sending the flashcard numbers as before and the time columns show 0.
--
-- NAMES ARE GONE (the owner's decision, 2026-11-16): students' last names and the names teachers chose for their
-- students are DELETED (both columns are dropped), and nobody is asked for one again. Students and teachers show
-- to each other, and to the owner, by their Tamkeen username (or "user-" and six characters of their id when
-- they have none yet). Older apps that still send a last name are answered as before, but the name is thrown away.
-- To clear the dropped names from the database's own storage too, run this on its own afterwards:
--   vacuum full public.dli_students, public.dli_teachers;
--
-- WHAT IS ADDED, AND NOTHING ELSE
--   per student, per week, per device: minutes spent listening (podcasts, audio), watching (videos, reels) and
--   reading (books, web pages) in the DLI language, and which days of that week had any study (seven bits).
--   Never what was played or read. Each device sends its own share, named by a random 16-digit device id
--   made by the app (nothing about the device in it); the reports add the devices up.
--
-- WHO MAY SEE IT: exactly who sees the weekly numbers already (v10): the student, the teachers of a class they
-- joined (from the week they joined) and the owner. The table has no reading or writing rule; it is written by
-- dli_report_time only and read through private.dli_weeks_of, which every v10 report already uses.
--
-- Leaving: the rows belong to the student's DLI record ("on delete cascade"), so stopping sharing, being
-- deleted by the owner or deleting the account deletes them at once. Rows older than about two years go.

-- ======================================================================= 1. the table
create table if not exists public.dli_week_time (
  user_id    uuid not null references public.dli_students(user_id) on delete cascade,
  week       date not null,
  device     text not null check (device ~ '^[0-9a-f]{16}$'),
  listening  integer not null default 0 check (listening between 0 and 10080),
  watching   integer not null default 0 check (watching between 0 and 10080),
  reading    integer not null default 0 check (reading between 0 and 10080),
  day_mask   smallint not null default 0 check (day_mask between 0 and 127),
  updated_at timestamptz not null default now(),
  primary key (user_id, week, device)
);

-- No reading or writing rules at all: with row-level security on and no rule, the API gets nothing.
alter table public.dli_week_time enable row level security;
revoke all on public.dli_week_time from anon, authenticated;


-- When each student first agreed to share. (agreed_at moves when they agree to a newer wording, as every student
-- does once for this change, so the day they joined is kept here.) For students already on record it is the
-- earliest of: when they agreed, their first weekly row, the first class they joined.
alter table public.dli_students add column if not exists joined_at timestamptz;
update public.dli_students s set joined_at = least(s.agreed_at,
    (select min(w.week)::timestamptz from public.dli_weeks w where w.user_id = s.user_id),
    (select min(cs.joined_at) from public.dli_class_students cs where cs.user_id = s.user_id))
  where s.joined_at is null;
alter table public.dli_students alter column joined_at set default now();
alter table public.dli_students alter column joined_at set not null;


-- ======================================================================= 1b. usernames instead of names
-- How a person shows in DLI: their username, or "user-" and six characters of their id when they have none.
create or replace function private.dli_handle(person uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select p.username::text from public.profiles p where p.id = person),
                  'user-' || left(replace(person::text, '-', ''), 6));
$$;

-- The usernames of a class's teachers, longest-standing first.
create or replace function private.dli_teacher_names(class uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(private.dli_handle(ct.user_id) order by ct.added_at, ct.user_id), '[]'::jsonb)
  from public.dli_class_teachers ct
  where ct.class_id = class;
$$;

-- Everything the app needs to draw my side (v10's, by username). `last_name` carries the username too, for
-- apps older than v0.61, which show it where they used to show the last name.
create or replace function public.dli_me() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  v_student jsonb;
  v_teacher jsonb;
  v_classes jsonb;
begin
  if me is null then raise exception 'Not signed in'; end if;
  select jsonb_build_object('username', private.dli_handle(me), 'last_name', private.dli_handle(me), 'language', s.language,
                            'agreed_at', s.agreed_at, 'agreed_version', s.agreed_version, 'joined_at', s.joined_at)
    into v_student from public.dli_students s where s.user_id = me;
  select jsonb_build_object('name', private.dli_handle(me), 'username', private.dli_handle(me), 'since', t.since)
    into v_teacher from public.dli_teachers t where t.user_id = me;
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

-- Agree to share: my DLI language (no name). Calling it again changes the language (the day of agreeing stays,
-- unless the wording agreed to is a newer one: `wording` is its number).
create or replace function public.dli_agree(language text, wording integer default 1) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  v_lang text := language;
  v_wording integer := least(greatest(coalesce(wording, 1), 1), 1000);
begin
  if me is null then raise exception 'Not signed in'; end if;
  if v_lang is null or v_lang not in ('ar', 'zh', 'fa', 'fr', 'ko', 'ru', 'es') then raise exception 'dli_bad_language'; end if;
  insert into public.profiles (id) values (me) on conflict do nothing;
  update public.dli_students s set language = v_lang, updated_at = now(),
    agreed_at = case when v_wording > s.agreed_version then now() else s.agreed_at end,
    agreed_version = greatest(s.agreed_version, v_wording)
  where s.user_id = me;
  if not found then
    insert into public.dli_students (user_id, language, agreed_version) values (me, v_lang, v_wording);
  end if;
  return public.dli_me();
end $$;

-- Apps older than v0.61 still send a last name here: it is thrown away, never stored.
create or replace function public.dli_register(last_name text, language text, wording integer default 1) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_lang text := language;
  v_wording integer := wording;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  return public.dli_agree(v_lang, v_wording);
end $$;

-- Apps older than v0.61 still let a teacher type a name for their students: nothing is stored.
create or replace function public.dli_set_teacher_name(name text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if not exists (select 1 from public.dli_teachers t where t.user_id = auth.uid()) then raise exception 'dli_not_teacher'; end if;
end $$;

-- A class as its teacher sees it (v10's, by username; `last_name` = the username for older apps).
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
  select coalesce(jsonb_agg(jsonb_build_object('id', x.user_id, 'username', x.handle, 'last_name', x.handle, 'language', x.language,
           'joined_at', x.joined_at,
           'weeks', private.dli_weeks_of(x.user_id, greatest(v_from, date_trunc('week', x.joined_at)::date), v_weeks))
           order by lower(x.handle), x.user_id), '[]'::jsonb)
    into v_students
  from (select s.user_id, s.language, cs.joined_at, private.dli_handle(s.user_id) as handle
        from public.dli_class_students cs join public.dli_students s on s.user_id = cs.user_id
        where cs.class_id = class) x;
  return jsonb_build_object('class', v_class, 'students', v_students);
end $$;

-- Every DLI student, the teachers, the classes and the teacher code (v10's, by username, with `since`: the day
-- each student first joined). Only the owner.
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
  select coalesce(jsonb_agg(jsonb_build_object('id', x.user_id, 'username', x.handle, 'last_name', x.handle, 'language', x.language,
           'agreed_at', x.agreed_at, 'since', x.joined_at,
           'classes', (select coalesce(jsonb_agg(c.name order by cs.joined_at), '[]'::jsonb)
                       from public.dli_class_students cs join public.dli_classes c on c.id = cs.class_id
                       where cs.user_id = x.user_id),
           'weeks', private.dli_weeks_of(x.user_id, v_from, v_weeks))
           order by lower(x.handle), x.user_id), '[]'::jsonb)
    into v_students
  from (select s.user_id, s.language, s.agreed_at, s.joined_at, private.dli_handle(s.user_id) as handle from public.dli_students s) x;
  select coalesce(jsonb_agg(jsonb_build_object('id', t.user_id, 'name', private.dli_handle(t.user_id), 'username', private.dli_handle(t.user_id),
           'since', t.since, 'classes', (select count(*) from public.dli_class_teachers ct where ct.user_id = t.user_id))
           order by t.since, t.user_id), '[]'::jsonb)
    into v_teachers from public.dli_teachers t;
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'created_at', c.created_at,
           'students', (select count(*) from public.dli_class_students cs where cs.class_id = c.id),
           'teachers', private.dli_teacher_names(c.id)) order by c.created_at, c.id), '[]'::jsonb)
    into v_classes from public.dli_classes c;
  return jsonb_build_object('students', v_students, 'teachers', v_teachers, 'classes', v_classes,
    'teacher_code', (select g.teacher_code from private.dli_config g limit 1),
    'teacher_code_at', (select g.teacher_code_at from private.dli_config g limit 1));
end $$;

-- The names themselves: deleted, with the columns that held them.
alter table public.dli_students drop column if exists last_name;
alter table public.dli_teachers drop column if exists name;


-- ======================================================================= 2. a student sends their time
-- One device's share of a week (minutes, and the days with any study as bits, Monday = 1). Answers false when
-- the caller has no DLI record (sharing was stopped), true otherwise (a week out of range is quietly ignored).
-- At most 6 devices a week each: a seventh is ignored.
create or replace function public.dli_report_time(week date, device text, listening integer, watching integer, reading integer,
                                                  day_mask integer) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  v_agreed timestamptz;
  -- (copied into v_... first: a parameter named like a column must never meet that column)
  v_week date := week;
  v_device text := lower(coalesce(device, ''));
  v_listening integer := least(greatest(coalesce(listening, 0), 0), 10080);
  v_watching integer := least(greatest(coalesce(watching, 0), 0), 10080);
  v_reading integer := least(greatest(coalesce(reading, 0), 0), 10080);
  v_mask integer := least(greatest(coalesce(day_mask, 0), 0), 127);
begin
  if me is null then raise exception 'Not signed in'; end if;
  select s.agreed_at into v_agreed from public.dli_students s where s.user_id = me;
  if v_agreed is null then return false; end if;
  if v_week is null or extract(isodow from v_week) <> 1 then raise exception 'dli_bad_week'; end if;
  if v_device !~ '^[0-9a-f]{16}$' then raise exception 'dli_bad_device'; end if;
  -- (a little either side, for time zones: my Monday can start before or after the server's)
  if v_week > current_date + 1 or v_week < (date_trunc('week', v_agreed)::date - 7) then return true; end if;
  update public.dli_week_time x set listening = v_listening, watching = v_watching, reading = v_reading,
    day_mask = v_mask, updated_at = now()
  where x.user_id = me and x.week = v_week and x.device = v_device;
  if not found then
    if (select count(*) from public.dli_week_time x where x.user_id = me and x.week = v_week) >= 6 then return true; end if;
    begin
      insert into public.dli_week_time (user_id, week, device, listening, watching, reading, day_mask)
      values (me, v_week, v_device, v_listening, v_watching, v_reading, v_mask);
    exception when unique_violation then null;  -- (the same device sent the same week twice at the same moment)
    end;
  end if;
  delete from public.dli_week_time x where x.user_id = me and x.week < current_date - 760;
  return true;
end $$;


-- ======================================================================= 3. the reports see it
-- A student's weekly rows from `since` on, newest first, at most `most` (the v10 helper, now with the time
-- added up over the devices). A week with time but no flashcard row still shows. active_days = the days with
-- any study: the devices' days put together, and never fewer than the flashcard days.
create or replace function private.dli_weeks_of(person uuid, since date, most integer) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('week', k.week, 'days', coalesce(w.days, 0), 'minutes', coalesce(w.minutes, 0),
           'reviews', coalesce(w.reviews, 0), 'remembered', coalesce(w.remembered, 0), 'new_words', coalesce(w.new_words, 0),
           'words', coalesce(w.words, 0), 'known', coalesce(w.known, 0),
           'listening', coalesce(m.listening, 0), 'watching', coalesce(m.watching, 0), 'reading', coalesce(m.reading, 0),
           'active_days', greatest(coalesce(w.days, 0), coalesce(m.active_days, 0)),
           'updated_at', greatest(w.updated_at, m.updated_at)) order by k.week desc), '[]'::jsonb)
  from (select u.week from (select x.week from public.dli_weeks x where x.user_id = person and x.week >= since
                            union
                            select y.week from public.dli_week_time y where y.user_id = person and y.week >= since) u
        order by u.week desc limit least(greatest(most, 1), 110)) k
  left join public.dli_weeks w on w.user_id = person and w.week = k.week
  left join (select y.week, least(sum(y.listening), 10080)::integer as listening, least(sum(y.watching), 10080)::integer as watching,
                    least(sum(y.reading), 10080)::integer as reading,
                    length(replace((bit_or(y.day_mask)::integer)::bit(7)::text, '0', '')) as active_days,
                    max(y.updated_at) as updated_at
             from public.dli_week_time y where y.user_id = person and y.week >= since group by y.week) m on m.week = k.week;
$$;




-- ======================================================================= 4. who may run what
-- Signed-in people only, never the signed-out public; the function checks the rest itself.
revoke all on function private.dli_weeks_of(uuid, date, integer), private.dli_handle(uuid), private.dli_teacher_names(uuid)
  from public, anon, authenticated;
revoke all on function public.dli_agree(text, integer) from public, anon;
grant execute on function public.dli_agree(text, integer) to authenticated;
revoke all on function public.dli_report_time(date, text, integer, integer, integer, integer) from public, anon;
grant execute on function public.dli_report_time(date, text, integer, integer, integer, integer) to authenticated;

-- Tell the API about the new function straight away.
notify pgrst, 'reload schema';

select 'v11 DLI activity: in place; names deleted' as result,
       (select count(*) from information_schema.columns
         where table_schema = 'public' and ((table_name = 'dli_students' and column_name = 'last_name')
                                            or (table_name = 'dli_teachers' and column_name = 'name'))) as name_columns_left,
       (select count(*) from public.dli_week_time) as time_rows;
