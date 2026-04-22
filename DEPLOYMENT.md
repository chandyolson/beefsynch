# BeefSynch — Deployment & Disaster Recovery

Last verified: 2026-04-22

This document is the source of truth for **what services BeefSynch depends on, where every secret value lives, and how to recover if any one of them breaks**. Keep it checked into the repo. If you rotate a secret or add a new service, update this file in the same commit.

---

## 1. What BeefSynch is made of

BeefSynch is a set of five moving parts. Each one can be replaced independently if it dies, as long as you have the information in this doc.

| Part | What it does | Where it lives |
|---|---|---|
| **Frontend** | The React app users see at beefsynch.com | Source code in GitHub (`chandyolson/beefsynch`), built and hosted by Vercel |
| **Database + backend** | Postgres database, auth, storage buckets, edge functions, nightly cron | Supabase project `ktelduvdymplytoihtht` (region `us-east-1`, Pro plan, org `ubkukhruakwaflabwnzh`) |
| **Transactional email** | Delivers nightly backup emails and password/invite emails | Resend (sends from `mail.beefsynch.com`) |
| **Calendar sync** | Pushes breeding events into users' Google Calendars | Google Cloud project (OAuth client) |
| **AI assistance** | Powers the in-app Bull Chat | Lovable AI gateway (`ai.gateway.lovable.dev`) |

When a user hits beefsynch.com, Vercel serves them the React app, which then talks directly to Supabase for data. Supabase edge functions (server-side code running at Supabase) orchestrate anything that needs secrets or multi-step logic — nightly backups, email sending, invite flows, bull chat.

---

## 2. Every secret and where it lives

There are three places secrets live, and each has to be handled differently.

### A. Supabase Edge Function secrets

These are environment variables set in the Supabase dashboard at:
`Dashboard → Edge Functions → Manage secrets`

Or: `https://supabase.com/dashboard/project/ktelduvdymplytoihtht/functions/secrets`

| Secret name | Used by | Where it comes from | How to regenerate |
|---|---|---|---|
| `SUPABASE_URL` | All edge functions | Auto-provided by Supabase | Can't change — fixed to `https://ktelduvdymplytoihtht.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | All edge functions | Auto-provided by Supabase | Rotate via `Dashboard → Settings → API → Project API keys → service_role → Rotate`. After rotate, **also update `vault.service_role_key`** (see section B below) |
| `SUPABASE_ANON_KEY` | `full-export`, `bull-chat` | Auto-provided by Supabase | Rotate via `Dashboard → Settings → API → Project API keys → anon → Rotate` |
| `RESEND_API_KEY` | `full-export` (emails nightly backup) | [resend.com](https://resend.com) account — API Keys section | Create a new key in Resend dashboard, paste into Supabase secrets, delete the old one in Resend |
| `VITE_GOOGLE_CLIENT_ID` | `google-calendar-config` (returns clientId to frontend) | Google Cloud Console OAuth 2.0 Client ID | Regenerate via Google Cloud Console → APIs & Services → Credentials. This is a **public** identifier, not a secret, but keep it in sync with the frontend's compiled `.env` |
| `LOVABLE_API_KEY` | `bull-chat`, `auth-email-hook` | Lovable project dashboard | Regenerate via Lovable settings. **Important:** also used as the webhook verification secret for auth email hooks — rotating requires updating the webhook config in Supabase Auth too |

### B. Supabase Vault secrets

These are secrets stored in Supabase's encrypted vault table, used by the pg_cron scheduled jobs (which cannot read Edge Function env vars).

Currently just one:

| Vault secret | Used by | Equivalent to |
|---|---|---|
| `service_role_key` | `beefsynch-nightly-backup` cron job | Same value as `SUPABASE_SERVICE_ROLE_KEY` edge function secret |

**If you rotate the service role key, update it in TWO places:** the Edge Function secrets AND the vault. To update the vault, run this SQL in the Supabase SQL editor (replacing `NEW_KEY_HERE`):

```sql
-- View current vault secrets
SELECT name, decrypted_secret FROM vault.decrypted_secrets;

-- Update service_role_key
UPDATE vault.secrets
SET secret = 'NEW_KEY_HERE'
WHERE name = 'service_role_key';
```

If the two get out of sync, the nightly backup cron job silently fails with a 401 Unauthorized until fixed.

### C. Frontend build-time env vars

These live in Vercel (not Supabase) and are compiled into the frontend bundle at build time.

Dashboard location: `https://vercel.com` → the BeefSynch project → Settings → Environment Variables.

Since I don't have Vercel access to verify the exact list, the minimum set is almost certainly:

| Variable | Purpose |
|---|---|
| `VITE_SUPABASE_URL` | Same as above — `https://ktelduvdymplytoihtht.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | The anon key (public, safe to ship to browsers) |
| `VITE_GOOGLE_CLIENT_ID` | The OAuth client ID for calendar sync (public) |

None of these are secret — they ship to every user's browser. They do, however, have to match the Supabase project and Google Cloud project the backend is actually using. If you ever create a new Supabase project, update all three here first.

---

## 3. Daily backup — what runs when

A pg_cron job named `beefsynch-nightly-backup` runs every night at **07:00 UTC (≈2 AM Central)** and calls the `full-export` edge function with the service role key. That function:

1. Reads every row from all 38 public tables
2. Reads all auth users and identities (via SECURITY DEFINER RPCs `export_auth_users` and `export_auth_identities`)
3. Reads file listings for all 3 storage buckets (via the `list_storage_objects` RPC)
4. Downloads and embeds the bytes of every file, provided total storage is ≤ 20 MB (currently ~5.5 MB)
5. Zips everything into `BeefSynch_Backup_YYYY-MM-DD.zip`
6. Emails the ZIP to `office@catlresources.com` via Resend

If total storage exceeds 20 MB in the future, the function automatically falls back to embedding only the manifests (paths + sizes) and notes the skip reason in the email. Raise the threshold in `supabase/functions/full-export/index.ts` if you want that changed.

**To verify it's running:** check that an email with subject `BeefSynch Daily Backup — YYYY-MM-DD` arrives each morning.

**To trigger manually:** go to `beefsynch.com → Team Management → Download Full Export`. This gives you the same ZIP as a direct download (no email sent).

---

## 4. Supabase's own safety net

Supabase Pro includes **automatic daily database snapshots with 7-day retention** — these are completely separate from the email backup. They live on Supabase's infrastructure and can restore the database even if the email ZIP is lost.

View them at: `https://supabase.com/dashboard/project/ktelduvdymplytoihtht/database/backups/scheduled`

**Point-in-Time Recovery (PITR)** is a separate $100/month add-on that adds minute-granularity recovery within a rolling 7-day window. Not currently enabled. Decision pending based on how much a single day of lost work would hurt.

View toggle at: `https://supabase.com/dashboard/project/ktelduvdymplytoihtht/database/backups/pitr`

**Storage buckets** — Supabase Pro replicates storage across availability zones automatically. The email ZIP is an additional layer on top of that.

---

## 5. Disaster recovery scenarios

### Scenario A — the Supabase project is accidentally deleted or corrupted

1. Create a new Supabase project (any name), preferably same region (`us-east-1`)
2. Restore the DB from the most recent email ZIP:
   - Unzip `BeefSynch_Backup_YYYY-MM-DD.zip`
   - The schema has to exist first — apply all migrations from the repo's `supabase/migrations/` folder to the new project (this recreates all 38 tables, RPCs, triggers)
   - Then import each `*.jsonl` file into the corresponding table. JSONL = one JSON row per line. Use a script or `psql \copy` with appropriate casting
3. Restore auth users from `auth_users.jsonl` + `auth_identities.jsonl` — requires direct insert into `auth.users` / `auth.identities` using the Supabase admin API, because the UI won't let you set pre-existing password hashes
4. Restore storage: for each file in the `storage/` folder of the ZIP, upload to the matching bucket preserving its path
5. Redeploy all edge functions from `supabase/functions/` in the repo
6. Recreate all Edge Function secrets per section 2A above
7. Recreate the vault secret per section 2B
8. Recreate the cron job:
```sql
SELECT cron.schedule(
  'beefsynch-nightly-backup', '0 7 * * *',
  $$SELECT net.http_post(
    url := 'https://NEW_PROJECT_REF.supabase.co/functions/v1/full-export',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')),
    body := '{}'::jsonb,
    timeout_milliseconds := 300000) AS request_id;$$);
```
9. Update Vercel env vars to point at the new project ref, redeploy frontend

This is a half-day to full-day job. Having the backup ZIP, the repo, and this doc together means it's *possible* — without any one of the three, it becomes much harder.

### Scenario B — just the database is rolled back or corrupted

Easier. Use Supabase's built-in daily snapshot via the dashboard (section 4). That restores schema + data + auth in one shot, no ZIP import needed. The email ZIP is the fallback if the snapshot itself is damaged or if you need to roll back further than 7 days.

### Scenario C — a storage bucket is deleted or a file disappears

Extract the ZIP, grab files from `storage/{bucket}/{path}/`, re-upload to the same bucket preserving paths.

### Scenario D — email backup stops arriving

Check, in order:
1. Supabase cron job status: `SELECT * FROM cron.job WHERE jobname = 'beefsynch-nightly-backup';` — should have `active = true`
2. Last cron run: `SELECT * FROM cron.job_run_details WHERE jobid = 1 ORDER BY start_time DESC LIMIT 5;`
3. Edge function response: `SELECT id, status_code, content, error_msg FROM net._http_response ORDER BY created DESC LIMIT 5;`
4. Resend dashboard — look for delivery failures, domain auth issues, or quota exceeded
5. Office@catlresources.com spam folder

### Scenario E — a service's API key leaks or needs rotation

Use section 2 above to find the service. Generate a new key in that service's dashboard, paste into the right spot (Edge Function secrets, Vault, or Vercel), then revoke the old one. Test with a manual trigger before walking away.

---

## 6. Ongoing maintenance rules

1. **When a new public table is added**, add it to `TABLES_IN_ORDER` in `supabase/functions/full-export/index.ts` or it won't be backed up. The nightly email shows a row-count list — if a table you expect is missing from that list, it's not being backed up.

2. **When a new storage bucket is added**, add it to `BUCKETS` in the same file.

3. **When a new edge function is added** that needs a new secret, add it to section 2A of this doc in the same commit.

4. **When any secret is rotated**, update this doc's "last verified" date at the top.

5. **Lovable IDE is split-brained**. It still thinks the database is `qgpufoqjjxyecimxusze` (a dead project from before the DB cutover). All schema changes must go through Supabase MCP directly, never through Lovable prompts that touch schema.
