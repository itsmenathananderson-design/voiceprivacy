-- ============================================================
-- 0001_init.sql
-- Core schema + privacy auto-delete infrastructure
-- Run this in the Supabase SQL Editor (or via `supabase db push`)
-- ============================================================

-- Extensions needed for scheduled cleanup
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ------------------------------------------------------------
-- Tables
-- ------------------------------------------------------------

create table if not exists voice_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  storage_path text not null,          -- path inside 'voice-samples' bucket
  label text not null default 'My Voice',
  status text not null default 'processing', -- processing | ready | failed | deleted
  embedding_ref text,                  -- opaque reference/id returned by the XTTS server, if any
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')
);

create table if not exists generated_audio (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  voice_profile_id uuid references voice_profiles(id) on delete cascade,
  storage_path text not null,          -- path inside 'generated-audio' bucket
  text_input text not null,
  status text not null default 'processing', -- processing | ready | failed | deleted
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 minutes')
);

create index if not exists idx_voice_profiles_expiry on voice_profiles (expires_at) where status <> 'deleted';
create index if not exists idx_generated_audio_expiry on generated_audio (expires_at) where status <> 'deleted';

-- ------------------------------------------------------------
-- Row Level Security — users only ever see their own rows
-- ------------------------------------------------------------

alter table voice_profiles enable row level security;
alter table generated_audio enable row level security;

create policy "select own voice profiles" on voice_profiles
  for select using (auth.uid() = user_id);
create policy "insert own voice profiles" on voice_profiles
  for insert with check (auth.uid() = user_id);
create policy "update own voice profiles" on voice_profiles
  for update using (auth.uid() = user_id);
create policy "delete own voice profiles" on voice_profiles
  for delete using (auth.uid() = user_id);

create policy "select own generated audio" on generated_audio
  for select using (auth.uid() = user_id);
create policy "insert own generated audio" on generated_audio
  for insert with check (auth.uid() = user_id);
create policy "update own generated audio" on generated_audio
  for update using (auth.uid() = user_id);
create policy "delete own generated audio" on generated_audio
  for delete using (auth.uid() = user_id);

-- ------------------------------------------------------------
-- Storage buckets (private — accessed only via signed URLs / service role)
-- ------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('voice-samples', 'voice-samples', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('generated-audio', 'generated-audio', false)
on conflict (id) do nothing;

-- Users can only touch objects under a folder named after their own uid,
-- e.g. voice-samples/<user_id>/sample.wav
create policy "user can manage own voice sample objects"
  on storage.objects for all
  using (bucket_id = 'voice-samples' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'voice-samples' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "user can manage own generated audio objects"
  on storage.objects for all
  using (bucket_id = 'generated-audio' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'generated-audio' and (storage.foldername(name))[1] = auth.uid()::text);

-- ------------------------------------------------------------
-- Vault secrets used by pg_cron to call the cleanup Edge Function
-- Run these two lines manually once, with your real project values:
--
-- select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
-- select vault.create_secret('<service-role-key>', 'service_role_key');
-- ------------------------------------------------------------

-- ------------------------------------------------------------
-- pg_cron jobs — this is what replaces "Vercel Cron" for the
-- privacy auto-delete rules. Vercel's free tier only allows
-- once-per-day cron, which is too infrequent for a 30-minute
-- audio expiry, so the cleanup lives here in Postgres instead.
-- ------------------------------------------------------------

select cron.schedule(
  'cleanup-expired-audio',
  '* * * * *', -- every minute — matches the 30-min audio rule closely
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/cleanup-expired',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{"type":"audio"}'::jsonb
  );
  $$
);

select cron.schedule(
  'cleanup-expired-voice-profiles',
  '*/5 * * * *', -- every 5 minutes is plenty for a 24-hour rule
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/cleanup-expired',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{"type":"voice"}'::jsonb
  );
  $$
);
