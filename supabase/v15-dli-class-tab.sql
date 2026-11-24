-- Schema v15: the Class tab. Teachers invite students by username, classmates see each other, and a teacher
-- sends things to study to the whole class. Run once in the Supabase SQL editor (safe to re-run), AFTER
-- v10-dli-classes.sql and v11-dli-activity.sql. It works with or without v12, v13 and v14.
--
-- WHAT IT ADDS
--   invitations   a teacher of a class types a DLI student's Tamkeen username; the student sees the invitation
--                 in their Class tab and joins only when they press Accept. Nothing about a student is shown
--                 to a teacher before that. (The class code still works too.)
--   classmates    someone in a class sees the usernames of its teachers and of its other students, and each
--                 student's activity level: one word (active, some, little, stopped, none). Never their
--                 numbers. Only students who agreed to wording 3 or later (the sharing screen that says
--                 classmates see this) are listed, and only such a student may look.
--   class posts   a teacher sends the class something to study: a title, a kind, a link and, when the teacher's
--                 app has them, its words as a file. The same things "Send to a friend" sends; the app never
--                 offers Netflix. Kept 60 days, 50 per class at most.
--   files         storage bucket "dli-class" (private), at <class id>/<file id>.gz: read by the class's teachers
--                 and students, written and removed by its teachers.
--
-- WHO MAY SEE WHAT (enforced here, not in the app)
--   a student     their invitations; their classes' teachers, classmates (username + level) and posts
--   a teacher     the same for their own classes, plus who they invited and has not answered yet
--   anyone else   nothing: the tables below have no reading rules; everything goes through the functions.
-- Usernames only: no real name is kept or shown. Self-test: supabase/test_rls_dli_class_tab.sql.

create schema if not exists private;
grant usage on schema private to authenticated, service_role;


-- ======================================================================= 1. tables
create table if not exists public.dli_class_invites (
  class_id   uuid not null references public.dli_classes(id) on delete cascade,
  user_id    uuid not null references public.dli_students(user_id) on delete cascade,
  invited_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (class_id, user_id)
);
create index if not exists dli_class_invites_user on public.dli_class_invites (user_id);

create table if not exists public.dli_class_posts (
  id         uuid primary key default gen_random_uuid(),
  class_id   uuid not null references public.dli_classes(id) on delete cascade,
  sender     uuid references public.profiles(id) on delete set null,
  item       jsonb not null check (jsonb_typeof(item) = 'object' and octet_length(item::text) <= 4000),
  path       text check (path is null or path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.gz$'),
  created_at timestamptz not null default now()
);
create index if not exists dli_class_posts_class on public.dli_class_posts (class_id, created_at desc);

-- No reading or writing rules at all: with row-level security on and no rule, the API gets nothing.
alter table public.dli_class_invites enable row level security;
alter table public.dli_class_posts enable row level security;
revoke all on public.dli_class_invites, public.dli_class_posts from anon, authenticated;


-- ======================================================================= 2. helpers (private)
-- A class id out of a file's folder name (null for anything that isn't one).
create or replace function private.dli_class_of(folder text) returns uuid
language sql immutable set search_path = '' as $$
  select case when folder ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then folder::uuid end;
$$;

-- Is `person` in class `class`, as a teacher or as a student?
create or replace function private.dli_member(person uuid, class uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.dli_class_teachers t where t.user_id = person and t.class_id = class)
      or exists (select 1 from public.dli_class_students s where s.user_id = person and s.class_id = class);
$$;

-- A student's activity level, in one word, by the days a week they studied (the app's dliweeks.js `activity`):
--   none     never studied since sharing            stopped  studied before, but not this week or last
--   active   4 or more days a week on average       some     2 or 3          little   less than 2
-- The average is over the four whole weeks before this one, from the week they joined (`since`).
create or replace function private.dli_level(person uuid, since timestamptz) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  cur date := date_trunc('week', now())::date;
  joined date := date_trunc('week', coalesce(since, 'epoch'::timestamptz))::date;
  v_any boolean;
  v_recent boolean;
  v_days numeric;
  v_now numeric;
  v_n integer := 0;
  v_per numeric;
begin
  with w as (
    select (x->>'week')::date as wk, coalesce((x->>'active_days')::integer, (x->>'days')::integer, 0) as d,
           (coalesce((x->>'active_days')::integer, 0) > 0 or coalesce((x->>'days')::integer, 0) > 0
            or coalesce((x->>'reviews')::integer, 0) > 0
            or coalesce((x->>'listening')::integer, 0) + coalesce((x->>'watching')::integer, 0) + coalesce((x->>'reading')::integer, 0) > 0) as studied
    from jsonb_array_elements(private.dli_weeks_of(person, date '2000-01-01', 110)) x)
  select coalesce(bool_or(w.studied), false), coalesce(bool_or(w.studied and w.wk >= cur - 7), false),
         coalesce(sum(w.d) filter (where w.wk < cur and w.wk >= cur - 28 and w.wk >= joined), 0),
         coalesce(sum(w.d) filter (where w.wk = cur), 0)
    into v_any, v_recent, v_days, v_now from w;
  if not v_any then return 'none'; end if;
  if not v_recent then return 'stopped'; end if;
  for n in 1 .. 4 loop
    if cur - 7 * n >= joined then v_n := v_n + 1; end if;
  end loop;
  if v_n = 0 then v_per := v_now; else v_per := round(v_days / v_n, 1); end if;
  return case when v_per >= 4 then 'active' when v_per >= 2 then 'some' else 'little' end;
end $$;

revoke all on function private.dli_class_of(text), private.dli_member(uuid, uuid), private.dli_level(uuid, timestamptz)
  from public, anon;
-- (the file rules below run as the person asking, so they must be allowed to ask these two)
grant execute on function private.dli_class_of(text), private.dli_member(uuid, uuid) to authenticated;
revoke all on function private.dli_level(uuid, timestamptz) from authenticated;


-- ======================================================================= 3. invitations
-- A teacher invites a DLI student to one of their classes, by Tamkeen username (capitals don't matter; a leading
-- @ is ignored). Answers {status}:
--   "invited"   the invitation is waiting for them        (+ username)
--   "already"   they were invited already                 (+ username)
--   "in_class"  they are in the class already             (+ username)
--   "full"      the class has 60 students and invitations, or the student has 10 classes and invitations
--   "wait"      20 names that didn't work today: try again tomorrow
--   "no"        nobody with that username is a DLI student who shares (one answer for "no such user" and "not a
--               DLI student", so the box can't be used to find out who has an account)
create or replace function public.dli_invite_student(class uuid, username text) returns jsonb
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
    select p.id into v_who from public.profiles p join public.dli_students s on s.user_id = p.id
    where lower(p.username::text) = v_name;
  end if;
  if v_who is null then
    insert into private.dli_tries (user_id) values (me);
    return jsonb_build_object('status', 'no');
  end if;
  if exists (select 1 from public.dli_class_students s where s.class_id = class and s.user_id = v_who) then
    return jsonb_build_object('status', 'in_class', 'username', private.dli_handle(v_who));
  end if;
  if exists (select 1 from public.dli_class_invites i where i.class_id = class and i.user_id = v_who) then
    return jsonb_build_object('status', 'already', 'username', private.dli_handle(v_who));
  end if;
  if (select count(*) from public.dli_class_students s where s.class_id = class)
       + (select count(*) from public.dli_class_invites i where i.class_id = class) >= 60
     or (select count(*) from public.dli_class_students s where s.user_id = v_who)
       + (select count(*) from public.dli_class_invites i where i.user_id = v_who) >= 10 then
    return jsonb_build_object('status', 'full');
  end if;
  insert into public.dli_class_invites (class_id, user_id, invited_by) values (class, v_who, me) on conflict do nothing;
  return jsonb_build_object('status', 'invited', 'username', private.dli_handle(v_who));
end $$;

-- Who a class's teachers invited and has not answered yet: [{id, username, invited_at}].
create or replace function public.dli_class_invited(class uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if not private.dli_teaches(auth.uid(), class) then raise exception 'dli_not_your_class'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', i.user_id, 'username', private.dli_handle(i.user_id),
            'invited_at', i.created_at) order by i.created_at, i.user_id), '[]'::jsonb)
          from public.dli_class_invites i where i.class_id = class);
end $$;

-- A teacher takes an invitation back.
create or replace function public.dli_cancel_invite(class uuid, student uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if not private.dli_teaches(auth.uid(), class) then raise exception 'dli_not_your_class'; end if;
  delete from public.dli_class_invites i where i.class_id = class and i.user_id = student;
end $$;

-- The invitations waiting for me: [{class, name, teachers, invited_at}].
create or replace function public.dli_my_invites() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'Not signed in'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('class', c.id, 'name', c.name,
            'teachers', private.dli_teacher_names(c.id), 'invited_at', i.created_at) order by i.created_at, c.id), '[]'::jsonb)
          from public.dli_class_invites i join public.dli_classes c on c.id = i.class_id where i.user_id = me);
end $$;

-- I answer an invitation. Answers {status}: "joined" (+ class, name), "declined", "full" (the class filled up
-- meanwhile; the invitation stays), "gone" (there was no such invitation).
create or replace function public.dli_answer_invite(class uuid, accept boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  v_name text;
begin
  if me is null then raise exception 'Not signed in'; end if;
  if not exists (select 1 from public.dli_class_invites i where i.class_id = class and i.user_id = me) then
    return jsonb_build_object('status', 'gone');
  end if;
  if not coalesce(accept, false) then
    delete from public.dli_class_invites i where i.class_id = class and i.user_id = me;
    return jsonb_build_object('status', 'declined');
  end if;
  if not exists (select 1 from public.dli_students s where s.user_id = me) then
    return jsonb_build_object('status', 'gone');
  end if;
  if (select count(*) from public.dli_class_students s where s.class_id = class) >= 60
     or (select count(*) from public.dli_class_students s where s.user_id = me) >= 10 then
    return jsonb_build_object('status', 'full');
  end if;
  insert into public.dli_class_students (class_id, user_id) values (class, me) on conflict do nothing;
  delete from public.dli_class_invites i where i.class_id = class and i.user_id = me;
  select c.name into v_name from public.dli_classes c where c.id = class;
  return jsonb_build_object('status', 'joined', 'class', class, 'name', v_name);
end $$;


-- ======================================================================= 4. classmates
-- The people of one of my classes: {teachers: [username], students: [{username, level, me}]}. A student is
-- listed only once they agreed to wording 3 (which says classmates see their username and activity level), and
-- a student who has not agreed to it yet may not look ("dli_agree_first"). Teachers of the class may always look.
create or replace function public.dli_classmates(class uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  v_teacher boolean;
begin
  if me is null then raise exception 'Not signed in'; end if;
  if not private.dli_member(me, class) then raise exception 'dli_not_your_class'; end if;
  v_teacher := private.dli_teaches(me, class);
  if not v_teacher and not exists (select 1 from public.dli_students s where s.user_id = me and s.agreed_version >= 3) then
    raise exception 'dli_agree_first';
  end if;
  return jsonb_build_object(
    'teachers', private.dli_teacher_names(class),
    'students', (select coalesce(jsonb_agg(jsonb_build_object('username', private.dli_handle(s.user_id),
                   'level', private.dli_level(s.user_id, cs.joined_at), 'me', s.user_id = me)
                   order by lower(private.dli_handle(s.user_id)), s.user_id), '[]'::jsonb)
                 from public.dli_class_students cs join public.dli_students s on s.user_id = cs.user_id
                 where cs.class_id = class and s.agreed_version >= 3));
end $$;


-- ======================================================================= 5. class posts
-- A teacher sends the class something to study. `item`: what it is (title, kind, link and the like, at most
-- 4,000 bytes; the app decides its fields and checks them again on arrival). `path`: its words as a file in the
-- "dli-class" storage, "<class id>/<file id>.gz", or null. 30 a day for each teacher. Posts older than 60 days,
-- and those beyond the newest 50 of the class, go: their file paths come back in `old` for the app to delete
-- (SQL must not delete files itself). Answers {id, old: [path]}.
create or replace function public.dli_post(class uuid, item jsonb, path text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  v_item jsonb := item;
  v_path text := nullif(btrim(coalesce(path, '')), '');
  v_id uuid;
  v_old jsonb;
begin
  if me is null then raise exception 'Not signed in'; end if;
  if not private.dli_teaches(me, class) then raise exception 'dli_not_your_class'; end if;
  if v_item is null or jsonb_typeof(v_item) <> 'object' or octet_length(v_item::text) > 4000 then raise exception 'dli_bad_post'; end if;
  if v_path is not null and (v_path !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.gz$' or split_part(v_path, '/', 1) <> class::text) then
    raise exception 'dli_bad_post';
  end if;
  if (select count(*) from public.dli_class_posts p where p.sender = me and p.created_at > now() - interval '1 day') >= 30 then
    raise exception 'dli_post_limit';
  end if;
  insert into public.dli_class_posts (class_id, sender, item, path) values (class, me, v_item, v_path) returning id into v_id;
  with gone as (
    delete from public.dli_class_posts p
    where p.class_id = class
      and (p.created_at < now() - interval '60 days'
           or p.id in (select q.id from public.dli_class_posts q where q.class_id = class order by q.created_at desc offset 50))
    returning p.path)
  select coalesce(jsonb_agg(g.path) filter (where g.path is not null), '[]'::jsonb) into v_old from gone g;
  return jsonb_build_object('id', v_id, 'old', v_old);
end $$;

-- What was sent to one of my classes, newest first: [{id, item, path, sender, mine, created_at}].
create or replace function public.dli_class_posts(class uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'Not signed in'; end if;
  if not private.dli_member(me, class) then raise exception 'dli_not_your_class'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'item', x.item, 'path', x.path,
            'sender', case when x.sender is null then '' else private.dli_handle(x.sender) end, 'mine', x.sender = me,
            'created_at', x.created_at) order by x.created_at desc), '[]'::jsonb)
          from (select * from public.dli_class_posts p where p.class_id = class
                  and p.created_at > now() - interval '60 days' order by p.created_at desc limit 50) x);
end $$;

-- A teacher of the class takes a post back. Answers its file's path (or null) for the app to delete.
create or replace function public.dli_delete_post(post uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_class uuid;
  v_path text;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select p.class_id, p.path into v_class, v_path from public.dli_class_posts p where p.id = post;
  if v_class is null then return null; end if;
  if not private.dli_teaches(auth.uid(), v_class) then raise exception 'dli_not_your_class'; end if;
  delete from public.dli_class_posts p where p.id = post;
  return v_path;
end $$;


-- ======================================================================= 6. the files
-- Private storage: <class id>/<file id>.gz, the packed words of something sent to the class, 3 MB at most.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('dli-class', 'dli-class', false, 3145728, array['application/gzip'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "dli-class: class reads" on storage.objects;
create policy "dli-class: class reads" on storage.objects
  for select to authenticated
  using (bucket_id = 'dli-class' and private.dli_member((select auth.uid()), private.dli_class_of((storage.foldername(name))[1])));
drop policy if exists "dli-class: teachers add" on storage.objects;
create policy "dli-class: teachers add" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'dli-class' and array_length(storage.foldername(name), 1) = 1
              and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.gz$'
              and private.dli_teaches((select auth.uid()), private.dli_class_of((storage.foldername(name))[1])));
drop policy if exists "dli-class: teachers remove" on storage.objects;
create policy "dli-class: teachers remove" on storage.objects
  for delete to authenticated
  using (bucket_id = 'dli-class' and private.dli_teaches((select auth.uid()), private.dli_class_of((storage.foldername(name))[1])));
-- (the file rules run as the person asking, so they must be allowed to ask "does this person teach this class?")
grant execute on function private.dli_teaches(uuid, uuid) to authenticated;


-- ======================================================================= 7. who may run what
-- Signed-in people only, never the signed-out public; each function checks the rest itself.
revoke all on function public.dli_invite_student(uuid, text), public.dli_class_invited(uuid), public.dli_cancel_invite(uuid, uuid),
  public.dli_my_invites(), public.dli_answer_invite(uuid, boolean), public.dli_classmates(uuid),
  public.dli_post(uuid, jsonb, text), public.dli_class_posts(uuid), public.dli_delete_post(uuid) from public, anon;
grant execute on function public.dli_invite_student(uuid, text), public.dli_class_invited(uuid), public.dli_cancel_invite(uuid, uuid),
  public.dli_my_invites(), public.dli_answer_invite(uuid, boolean), public.dli_classmates(uuid),
  public.dli_post(uuid, jsonb, text), public.dli_class_posts(uuid), public.dli_delete_post(uuid) to authenticated;

-- Tell the API about the new functions straight away.
notify pgrst, 'reload schema';

select 'v15 DLI class tab: in place' as result,
       (select count(*) from public.dli_class_invites) as invitations,
       (select count(*) from public.dli_class_posts) as posts,
       (select count(*) from storage.buckets b where b.id = 'dli-class') as file_folder;
