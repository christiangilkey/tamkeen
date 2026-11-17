-- Schema v11: listening, watching and reading time in DLI students' weekly numbers. Run once in the Supabase
-- SQL editor AFTER v10-dli-classes.sql (safe to re-run). Until it is run, the app (v0.61 on) keeps sending the
-- flashcard numbers as before and the time columns show 0.
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


-- The owner's report (v10's, with `since`: the day each student first joined).
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
           'agreed_at', s.agreed_at, 'since', s.joined_at,
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


-- ======================================================================= 4. who may run what
-- Signed-in people only, never the signed-out public; the function checks the rest itself.
revoke all on function private.dli_weeks_of(uuid, date, integer) from public, anon, authenticated;
revoke all on function public.dli_report_time(date, text, integer, integer, integer, integer) from public, anon;
grant execute on function public.dli_report_time(date, text, integer, integer, integer, integer) to authenticated;

-- Tell the API about the new function straight away.
notify pgrst, 'reload schema';

select 'v11 DLI activity: in place' as result,
       (select count(*) from public.dli_week_time) as time_rows;
