-- The study's online storage (Supabase): run once in the project's SQL Editor.
--
-- The study site (a static page) holds only the publishable key, which anyone can read.
-- So the rules below allow anyone to ADD a session (one zip, at most 10 MB, and one
-- row describing it) and nothing else: no one without an account can read, list, change
-- or delete anything. Only signed-in users can read and download, and sign-ups are off,
-- so the only user is the researcher's own account.

-- 1. One row per signed session
create table if not exists public.submissions (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  participant text not null check (participant ~ '^S-[A-Z0-9]{4}$'),
  expertise   text check (char_length(expertise) <= 200),
  car         text check (char_length(car) <= 10),
  started_at  timestamptz,
  signed_at   timestamptz,
  build       text check (char_length(build) <= 80),
  file_path   text not null check (file_path ~ '^S-[A-Z0-9]{4}/study_S-[A-Z0-9]{4}_[0-9]{8}T[0-9]{6}\.zip$'),
  size_bytes  integer not null check (size_bytes > 0 and size_bytes <= 10485760)
);

alter table public.submissions enable row level security;

drop policy if exists "anyone can add a session" on public.submissions;
create policy "anyone can add a session" on public.submissions
  for insert to anon, authenticated with check (true);

drop policy if exists "the researcher reads every session" on public.submissions;
create policy "the researcher reads every session" on public.submissions
  for select to authenticated using (true);

-- adding is allowed, but not reading back what was added
revoke select, update, delete on public.submissions from anon;
grant insert on public.submissions to anon;

-- 2. The zips: a private bucket (never public links), 10 MB per file, zips only
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sessions', 'sessions', false, 10485760, array['application/zip'])
on conflict (id) do update
  set public = false, file_size_limit = 10485760, allowed_mime_types = array['application/zip'];

drop policy if exists "anyone can add a session zip" on storage.objects;
create policy "anyone can add a session zip" on storage.objects
  for insert to anon, authenticated
  with check (
    bucket_id = 'sessions'
    and name ~ '^S-[A-Z0-9]{4}/study_S-[A-Z0-9]{4}_[0-9]{8}T[0-9]{6}\.zip$'
  );

drop policy if exists "the researcher downloads the session zips" on storage.objects;
create policy "the researcher downloads the session zips" on storage.objects
  for select to authenticated using (bucket_id = 'sessions');

-- No update or delete policy: nothing uploaded can be overwritten or removed from the page.
