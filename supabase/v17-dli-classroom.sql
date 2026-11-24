-- Schema v17: the Classroom. What a teacher sends to a class (v15's class posts) becomes the class's shared
-- material: kept until a teacher removes it, sorted into folders the teacher makes, carrying the teacher's notes
-- on its words, and changed in place. Run once in the Supabase SQL editor (safe to re-run), AFTER
-- v15-dli-class-tab.sql.
--
-- WHAT IT ADDS
--   folders        public.dli_class_folders: a class's folders (a name), made, renamed and removed by its teachers.
--   on each item   three more columns on public.dli_class_posts:
--                    folder_id   the folder it is in (none: the top of the classroom)
--                    notes       the teacher's work on its words: a list of
--                                {w: the word, important: true, meaning: the teacher's own definition,
--                                 note: a note, s: the sentence it was met in}. The app checks every field.
--                    updated_at  when a teacher last changed it (students' apps offer the update)
--   keeping        an item stays until a teacher removes it (v15 dropped them after 60 days and kept 50): a class
--                  holds 300 at most, a teacher adds 100 a day at most.
--   functions      dli_classroom, dli_room_add, dli_room_update, dli_room_move, dli_folder_save, dli_folder_remove;
--                  dli_post and dli_class_posts (v15) are redefined to match, so an app from before v17 still works.
-- Files stay where v15 put them: bucket "dli-class", <class id>/<file id>.gz, read by the class, written by its
-- teachers. Nothing new about a student is stored: the notes are the teacher's.
--
-- WHO MAY DO WHAT (enforced here, not in the app)
--   a teacher of the class     everything above, for that class only
--   a student of the class     read the folders and the items (with the notes)
--   anyone else                nothing: the tables have no reading rules; everything goes through the functions.
-- Self-test: supabase/test_rls_dli_classroom.sql.

do $$
begin
  if to_regclass('public.dli_class_posts') is null then
    raise exception 'Run supabase/v15-dli-class-tab.sql first: the classroom is built on its class posts.';
  end if;
end $$;


-- ======================================================================= 1. tables
create table if not exists public.dli_class_folders (
  id         uuid primary key default gen_random_uuid(),
  class_id   uuid not null references public.dli_classes(id) on delete cascade,
  name       text not null check (length(name) between 1 and 60),
  created_at timestamptz not null default now()
);
create index if not exists dli_class_folders_class on public.dli_class_folders (class_id, created_at);
alter table public.dli_class_folders enable row level security;
revoke all on public.dli_class_folders from anon, authenticated;

alter table public.dli_class_posts add column if not exists folder_id uuid references public.dli_class_folders(id) on delete set null;
alter table public.dli_class_posts add column if not exists notes jsonb not null default '[]'::jsonb;
alter table public.dli_class_posts add column if not exists updated_at timestamptz not null default now();
do $$
begin
  if not exists (select 1 from pg_constraint c where c.conname = 'dli_class_posts_notes_ok') then
    alter table public.dli_class_posts add constraint dli_class_posts_notes_ok
      check (jsonb_typeof(notes) = 'array' and octet_length(notes::text) <= 120000);
  end if;
end $$;


-- ======================================================================= 2. helpers (private)
-- Is this a file of this class, or no file at all?
create or replace function private.dli_room_path_ok(class uuid, path text) returns boolean
language sql immutable set search_path = '' as $$
  select path is null or (path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.gz$' and split_part(path, '/', 1) = class::text);
$$;

revoke all on function private.dli_room_path_ok(uuid, text) from public, anon, authenticated;


-- ======================================================================= 3. reading
-- The classroom of one of my classes: {folders: [{id, name}], items: [{id, item, path, notes, folder, sender, mine,
-- created_at, updated_at}]}, folders in the order they were made, items newest first.
create or replace function public.dli_classroom(class uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'Not signed in'; end if;
  if not private.dli_member(me, class) then raise exception 'dli_not_your_class'; end if;
  return jsonb_build_object(
    'folders', (select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'name', f.name) order by f.created_at, f.id), '[]'::jsonb)
                from public.dli_class_folders f where f.class_id = class),
    'items', (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'item', x.item, 'path', x.path, 'notes', x.notes,
                'folder', x.folder_id, 'sender', case when x.sender is null then '' else private.dli_handle(x.sender) end,
                'mine', x.sender = me, 'created_at', x.created_at, 'updated_at', x.updated_at)
                order by x.created_at desc, x.id), '[]'::jsonb)
              from (select * from public.dli_class_posts p where p.class_id = class order by p.created_at desc limit 300) x));
end $$;

-- (v15's list, for an app from before v17: the same items, without the 60-day limit.)
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
          from (select * from public.dli_class_posts p where p.class_id = class order by p.created_at desc limit 50) x);
end $$;


-- ======================================================================= 4. folders
-- Make a folder (folder is null) or rename one. Answers its id. 40 folders a class at most.
create or replace function public.dli_folder_save(class uuid, name text, folder uuid default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  v_name text := left(btrim(regexp_replace(coalesce(name, ''), '\s+', ' ', 'g')), 60);
  v_id uuid;
begin
  if me is null then raise exception 'Not signed in'; end if;
  if not private.dli_teaches(me, class) then raise exception 'dli_not_your_class'; end if;
  if v_name = '' then raise exception 'dli_bad_name'; end if;
  if folder is not null then
    update public.dli_class_folders f set name = v_name where f.id = folder and f.class_id = class returning f.id into v_id;
    if v_id is null then raise exception 'dli_no_folder'; end if;
    return v_id;
  end if;
  if (select count(*) from public.dli_class_folders f where f.class_id = class) >= 40 then raise exception 'dli_room_full'; end if;
  insert into public.dli_class_folders (class_id, name) values (class, v_name) returning id into v_id;
  return v_id;
end $$;

-- Remove a folder. What was in it stays in the classroom, outside any folder.
create or replace function public.dli_folder_remove(folder uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_class uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select f.class_id into v_class from public.dli_class_folders f where f.id = folder;
  if v_class is null then return; end if;
  if not private.dli_teaches(auth.uid(), v_class) then raise exception 'dli_not_your_class'; end if;
  delete from public.dli_class_folders f where f.id = folder;
end $$;


-- ======================================================================= 5. items
-- A teacher adds something to the classroom. `item`: what it is (4,000 bytes at most; the app decides its fields
-- and checks them again on arrival). `path`: its words as a file, or null. `notes`: the teacher's notes on its
-- words (a list, 120,000 bytes at most). `folder`: one of the class's folders, or null. Answers {id}.
create or replace function public.dli_room_add(class uuid, item jsonb, path text default null, notes jsonb default '[]'::jsonb,
                                               folder uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  v_item jsonb := item;
  v_path text := nullif(btrim(coalesce(path, '')), '');
  v_notes jsonb := coalesce(notes, '[]'::jsonb);
  v_folder uuid := folder;
  v_id uuid;
begin
  if me is null then raise exception 'Not signed in'; end if;
  if not private.dli_teaches(me, class) then raise exception 'dli_not_your_class'; end if;
  if v_item is null or jsonb_typeof(v_item) <> 'object' or octet_length(v_item::text) > 4000
     or jsonb_typeof(v_notes) <> 'array' or octet_length(v_notes::text) > 120000
     or not private.dli_room_path_ok(class, v_path) then
    raise exception 'dli_bad_post';
  end if;
  if v_folder is not null and not exists (select 1 from public.dli_class_folders f where f.id = v_folder and f.class_id = class) then
    v_folder := null; -- (a folder removed meanwhile: the item goes to the top)
  end if;
  if (select count(*) from public.dli_class_posts p where p.sender = me and p.created_at > now() - interval '1 day') >= 100 then
    raise exception 'dli_post_limit';
  end if;
  if (select count(*) from public.dli_class_posts p where p.class_id = class) >= 300 then raise exception 'dli_room_full'; end if;
  insert into public.dli_class_posts (class_id, sender, item, path, notes, folder_id)
  values (class, me, v_item, v_path, v_notes, v_folder) returning id into v_id;
  return jsonb_build_object('id', v_id);
end $$;

-- (v15's call, for an app from before v17: the same, with no notes and no folder; nothing is dropped any more.)
create or replace function public.dli_post(class uuid, item jsonb, path text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  v_id := (public.dli_room_add(class, item, path, '[]'::jsonb, null)->>'id')::uuid;
  return jsonb_build_object('id', v_id, 'old', '[]'::jsonb);
end $$;

-- A teacher of the class changes an item in place: what it is, its words' file, the notes. A null leaves that
-- part as it is (pass path '' to take the file away). Answers the path of the file it no longer uses (or null),
-- for the app to delete.
create or replace function public.dli_room_update(post uuid, item jsonb default null, path text default null, notes jsonb default null)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  v_class uuid;
  v_was text;
  v_item jsonb := item;
  v_notes jsonb := notes;
  v_path text;
begin
  if me is null then raise exception 'Not signed in'; end if;
  select p.class_id, p.path into v_class, v_was from public.dli_class_posts p where p.id = post;
  if v_class is null then raise exception 'dli_no_post'; end if;
  if not private.dli_teaches(me, v_class) then raise exception 'dli_not_your_class'; end if;
  v_path := case when path is null then v_was else nullif(btrim(path), '') end;
  if (v_item is not null and (jsonb_typeof(v_item) <> 'object' or octet_length(v_item::text) > 4000))
     or (v_notes is not null and (jsonb_typeof(v_notes) <> 'array' or octet_length(v_notes::text) > 120000))
     or not private.dli_room_path_ok(v_class, v_path) then
    raise exception 'dli_bad_post';
  end if;
  update public.dli_class_posts p
  set item = coalesce(v_item, p.item), notes = coalesce(v_notes, p.notes), path = v_path, updated_at = now()
  where p.id = post;
  return case when v_was is distinct from v_path then v_was end;
end $$;

-- A teacher of the class puts an item in one of the class's folders (null: out of any folder).
create or replace function public.dli_room_move(post uuid, folder uuid default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  v_class uuid;
begin
  if me is null then raise exception 'Not signed in'; end if;
  select p.class_id into v_class from public.dli_class_posts p where p.id = post;
  if v_class is null then raise exception 'dli_no_post'; end if;
  if not private.dli_teaches(me, v_class) then raise exception 'dli_not_your_class'; end if;
  if folder is not null and not exists (select 1 from public.dli_class_folders f where f.id = folder and f.class_id = v_class) then
    raise exception 'dli_no_folder';
  end if;
  update public.dli_class_posts p set folder_id = folder where p.id = post;
end $$;


-- ======================================================================= 6. who may run what
-- Signed-in people only, never the signed-out public; each function checks the rest itself.
revoke all on function public.dli_classroom(uuid), public.dli_class_posts(uuid), public.dli_folder_save(uuid, text, uuid),
  public.dli_folder_remove(uuid), public.dli_room_add(uuid, jsonb, text, jsonb, uuid), public.dli_post(uuid, jsonb, text),
  public.dli_room_update(uuid, jsonb, text, jsonb), public.dli_room_move(uuid, uuid) from public, anon;
grant execute on function public.dli_classroom(uuid), public.dli_class_posts(uuid), public.dli_folder_save(uuid, text, uuid),
  public.dli_folder_remove(uuid), public.dli_room_add(uuid, jsonb, text, jsonb, uuid), public.dli_post(uuid, jsonb, text),
  public.dli_room_update(uuid, jsonb, text, jsonb), public.dli_room_move(uuid, uuid) to authenticated;

-- Tell the API about the new functions straight away.
notify pgrst, 'reload schema';

select 'v17 DLI classroom: in place' as result,
       (select count(*) from public.dli_class_folders) as folders,
       (select count(*) from public.dli_class_posts) as items;
