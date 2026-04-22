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
3. Lists files in all 3 storage buckets (via `supabase.storage.from(bucket).list()` — path, size, mimetype, created_at, updated_at for each object)
4. Zips everything into `BeefSynch_Backup_YYYY-MM-DD.zip`
5. Emails the ZIP to `office@catlresources.com` via Resend

**Current behavior: storage metadata only, not file bytes.** The ZIP contains a manifest of what files exist in each bucket but does not currently include the binary content of any file. If a bucket is lost, you can reconstruct the file *list* but not the files themselves — recovery has to come from Supabase's storage replication or the `storage-per-bucket` daily snapshot. Upgrading the function to embed bytes is in the "Known gaps" section below.

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
4. **Restore storage files.** The ZIP contains metadata only (see section 3). Your options, in order of preference:
   - Restore the buckets from Supabase's own storage snapshot / zone replication (it survives most project-level disasters on Pro)
   - If the Supabase project itself is gone and storage with it, the `storage_*.jsonl` manifests tell you what files *should* exist; you will need to re-upload them from original sources (local copies, email attachments, etc.) because the bytes were never captured in this ZIP
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

The nightly ZIP does **not** currently contain file bytes (see section 3). Recovery path:
1. Check Supabase's own storage — on Pro, buckets are replicated across availability zones and survive most hardware failures
2. If the file is truly gone: use `storage_{bucket}.jsonl` from the ZIP as an inventory — it lists every file that should exist with its path and original size. You must re-upload from the original source (local copy, email, etc.).

Upgrading the backup to include file bytes is in the "Known gaps" section. Once done, this scenario becomes a simple extract-and-upload.

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

2. **When a new storage bucket is added**, add it to the `buckets` array in `supabase/functions/full-export/index.ts` (inside the main handler) and also list the new bucket in `scheduled-backup/index.ts`'s email body copy.

3. **When a new edge function is added** that needs a new secret, add it to section 2A of this doc in the same commit.

4. **When any secret is rotated**, update this doc's "last verified" date at the top.

5. **Lovable IDE is split-brained**. It still thinks the database is `qgpufoqjjxyecimxusze` (a dead project from before the DB cutover). All schema changes must go through Supabase MCP directly, never through Lovable prompts that touch schema.

---

## 7. Known gaps — deferred work

Items this doc *aspires* to but the code doesn't do yet. Logged here instead of silently omitted so the next session has a clear TODO list.

### G-1. `full-export` should embed storage file bytes, not just metadata

**Current:** `supabase/functions/full-export/index.ts` lists each bucket with `supabase.storage.from(bucket).list()` and writes path/size/mimetype/dates to `storage_<bucket>.jsonl`. No file bytes are downloaded or zipped.

**Target:** for each listed file, call `supabase.storage.from(bucket).download(path)` and add the binary to the ZIP under `storage/<bucket>/<path>`. Size cap (≈ 20 MB total) with graceful fallback to metadata-only and a note in the email if exceeded. Currently ~5.5 MB across all three buckets, so the cap should not trigger.

**Why deferred:** wasn't part of the original backup refactor. Scenario C in section 5 is stronger with this shipped — without it, a lost storage bucket can only be recovered from Supabase's own replication, not from the nightly ZIP.

### G-2. Dedicated `list_storage_objects` SECURITY DEFINER RPC

**Current:** `full-export` uses the client-side `storage.list()` API, which has subtle pagination quirks (especially around folders) that the code works around imperfectly (see the nested folder walk at the bottom of the `buckets` loop).

**Target:** a `public.list_storage_objects(bucket text)` SECURITY DEFINER function that returns a full flat listing from `storage.objects` in one query. Simpler edge-function code, single round trip, no folder-recursion bugs.

**Why deferred:** also not part of the original refactor. Low urgency — current code works. Worth doing whenever someone's touching `full-export` anyway.

### G-3. Upgrade `scheduled-backup`'s email body to list bucket names dynamically

**Current:** hardcodes the bucket names `shipment-documents, email-assets, documents` in the email copy. Drifts silently if a new bucket is added and only `full-export`'s array gets updated.

**Target:** have `scheduled-backup` read the manifest from the ZIP it receives and template the bucket list into the email.

**Why deferred:** cosmetic only — the ZIP itself is correct regardless of what the email says.

### G-4. GitHub Action to auto-regenerate `types.ts`

**Current:** Lovable's deploy flow periodically reverts `src/integrations/supabase/types.ts` back to the stale schema from the dead project `qgpufoqjjxyecimxusze` (see maintenance rule 5). Every manual regen is a one-shot fix.

**Target:** `.github/workflows/regenerate-supabase-types.yml` that fires on every push to `main`, runs `supabase gen types typescript --project-id ktelduvdymplytoihtht`, and auto-commits a correction if the file differs. Self-healing. Requires two GitHub secrets: `SUPABASE_ACCESS_TOKEN` and a `TYPES_WRITEBACK_PAT`.

**Why deferred:** design discussed but not yet implemented.
