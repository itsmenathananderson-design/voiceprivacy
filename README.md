# Ephemeral Voice

Privacy-first voice cloning + text-to-speech. Voice samples auto-delete after **24 hours**,
generated audio after **30 minutes**. Next.js + Supabase + self-hosted XTTS v2.

```
Browser ──► Next.js (Vercel) ──► Supabase Edge Functions ──► your XTTS server (Colab/Kaggle/Modal)
                 │                        │
                 └── Supabase Auth / Postgres / Storage ◄── pg_cron → cleanup-expired (every minute)
```

## Setup

### 1. Supabase project
Create a free project at supabase.com. From **Project Settings → API** copy the Project URL and anon key.

### 2. Database, storage, and cron
Open the SQL Editor and run `supabase/migrations/0001_init.sql`. Then run these two lines once
(real values), so pg_cron can call the cleanup function:

```sql
select vault.create_secret('https://YOUR-REF.supabase.co', 'project_url');
select vault.create_secret('YOUR-SERVICE-ROLE-KEY', 'service_role_key');
```

### 3. Deploy the Edge Functions
```bash
npm i -g supabase
supabase login
supabase link --project-ref YOUR-REF
supabase functions deploy process-voice
supabase functions deploy generate-speech
supabase functions deploy cleanup-expired
```

### 4. Start your XTTS server and connect it
Run `xtts-server/app.py` on a free GPU (Colab/Kaggle) and expose it with a tunnel
(cloudflared or ngrok). Then tell Supabase where it is:

```bash
supabase secrets set XTTS_ENDPOINT_URL=https://your-tunnel-url XTTS_API_KEY=your-long-random-key
```

### 5. Run the web app
```bash
cp .env.example .env.local   # fill in URL + anon key
npm install
npm run dev
```
In Supabase **Authentication → Providers → Email**, turn off "Confirm email" while testing.

### 6. Deploy to Vercel
Import the repo, add the two `NEXT_PUBLIC_*` env vars, deploy. No Vercel cron is used.

## Verify auto-deletion
- Generate a clip, then check the `generated_audio` table and `generated-audio` bucket after 31 minutes: both should be empty.
- To test faster: `update generated_audio set expires_at = now() - interval '1 minute';` and wait a minute.
- Job history: `select * from cron.job_run_details order by start_time desc limit 10;`

## Things to know
- **Colab tunnels are temporary.** When the session ends, generation fails until you restart it and update `XTTS_ENDPOINT_URL`.
- **XTTS v2 license:** the Coqui Public Model License restricts commercial use. Fine for personal projects; check it before charging money.
- **Free-tier limits:** Supabase Edge Functions time out around 150 s, and free storage is 1 GB. Cap text at 1,000 characters (already enforced).
- **Misuse:** the upload form requires a consent checkbox. Consider adding rate limits and abuse reporting before opening sign-ups publicly.
- **Privacy caveat:** auto-delete removes files and rows, but Supabase backups (paid tiers) and the XTTS host's logs are outside this app's control.

## Not built yet
Rate limiting per user, a "delete now" button, MP3 output, and an automated test for the cleanup function.
