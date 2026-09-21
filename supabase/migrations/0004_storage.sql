-- ScalePods schema, migration 4 of 4
-- Private storage buckets + storage RLS policies.
-- Layout:
--   resumes/                       {account_id}/{candidate_id}-{filename}
--   interview-recordings/          {account_id}/{session_id}/chunk-{NNN}.webm
--   assignments/                   {account_id}/{campaign_id}/{round_instance_id}/submission/{filename}
-- All access is via signed URLs. Recruiters (authed) can generate them for
-- their own account folders; candidates get signed upload/download URLs from
-- the sign-upload Edge Function (service role), so RLS never sees an anon user.

insert into storage.buckets (id, name, public)
values
  ('resumes', 'resumes', false),
  ('interview-recordings', 'interview-recordings', false),
  ('assignments', 'assignments', false)
on conflict (id) do nothing;

-- Recruiter: SELECT (needed for createSignedUrl) + INSERT within own account folder.
create or replace function public.storage_own_account(bucket text, name text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select (storage.foldername(name))[1] = auth.uid()::text;
$$;

create policy "tenant select resumes" on storage.objects
  for select using (bucket_id = 'resumes' and public.storage_own_account(bucket_id, name));
create policy "tenant select recordings" on storage.objects
  for select using (bucket_id = 'interview-recordings' and public.storage_own_account(bucket_id, name));
create policy "tenant select assignments" on storage.objects
  for select using (bucket_id = 'assignments' and public.storage_own_account(bucket_id, name));

create policy "tenant insert resumes" on storage.objects
  for insert with check (bucket_id = 'resumes' and public.storage_own_account(bucket_id, name));
create policy "tenant insert recordings" on storage.objects
  for insert with check (bucket_id = 'interview-recordings' and public.storage_own_account(bucket_id, name));
create policy "tenant insert assignments" on storage.objects
  for insert with check (bucket_id = 'assignments' and public.storage_own_account(bucket_id, name));

create policy "tenant update resumes" on storage.objects
  for update using (bucket_id = 'resumes' and public.storage_own_account(bucket_id, name));
create policy "tenant update recordings" on storage.objects
  for update using (bucket_id = 'interview-recordings' and public.storage_own_account(bucket_id, name));
create policy "tenant update assignments" on storage.objects
  for update using (bucket_id = 'assignments' and public.storage_own_account(bucket_id, name));