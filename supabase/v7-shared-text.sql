-- Schema v7: the words that travel with something sent to a friend from the Library or a player
-- (web/js/sharetext.js, web/js/components/sendmedia.js). Run once in the Supabase SQL editor
-- (safe to re-run). Nothing else changes: no new table, no new rule about who may read what.
--
-- The transcript (or a page's or book's text) is gzipped JSON, uploaded to the private "voice"
-- storage at voice/<user A>_<user B>/text-<random id>.json.gz, beside the voice notes, so the same
-- rules already decide who can read it (only those two friends) and who can delete it (either).
-- The message carries only the file's path: payload.media.transcript_path.
--
-- Until this has run, the storage refuses the upload ("mime type application/gzip is not
-- supported") and the app falls back to the old way: small transcripts inside the message itself,
-- longer ones not sent.

-- 1. The "voice" storage also takes gzipped files (3 MB each at most, as before).
update storage.buckets
set allowed_mime_types = array['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'application/gzip']
where id = 'voice';

-- 2. When a shared item's message goes (dismissed, or cleared after 30 days), its files are handed
-- back for deleting too, like a voice note's: the transcript file and the audio clips of shared
-- words. (The app also deletes them itself when it accepts or dismisses; this catches the ones
-- nobody opened.)
create or replace function public.dismiss_message(message_id uuid) returns setof text
language sql security definer set search_path = public as $$
  with gone as (
    delete from public.messages where id = message_id and recipient = auth.uid()
    returning kind, payload
  )
  select payload->>'path' from gone where kind = 'voice' and payload->>'path' is not null
  union all
  select payload->'media'->>'transcript_path' from gone
  where kind = 'share' and payload->'media'->>'transcript_path' is not null
  union all
  select w->>'clip' from gone,
    jsonb_array_elements(case when jsonb_typeof(payload->'words') = 'array' then payload->'words' else '[]'::jsonb end) w
  where kind = 'share' and w->>'clip' is not null;
$$;
revoke all on function public.dismiss_message(uuid) from public, anon;
grant execute on function public.dismiss_message(uuid) to authenticated;

create or replace function public.purge_old_messages() returns setof text
language sql security definer set search_path = public as $$
  with gone as (
    delete from public.messages
    where auth.uid() in (sender, recipient) and created_at < now() - interval '30 days'
    returning kind, payload
  )
  select payload->>'path' from gone where kind = 'voice' and payload->>'path' is not null
  union all
  select payload->'media'->>'transcript_path' from gone
  where kind = 'share' and payload->'media'->>'transcript_path' is not null
  union all
  select w->>'clip' from gone,
    jsonb_array_elements(case when jsonb_typeof(payload->'words') = 'array' then payload->'words' else '[]'::jsonb end) w
  where kind = 'share' and w->>'clip' is not null;
$$;
revoke all on function public.purge_old_messages() from public, anon;
grant execute on function public.purge_old_messages() to authenticated;

-- 3. Check (optional): this should list application/gzip among the types.
-- select allowed_mime_types from storage.buckets where id = 'voice';
