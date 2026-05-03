# BeefSynch — Deployment & Disaster Recovery

Last verified: 2026-04-23

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

A pg_cron job named `beefsynch-nightly-backup` runs every night at **07:00 UTC (≈2 AM Central)** and calls the `full-export` edge function with the service role key. That function (at `backup_version: 5` as of 2026-04-23):

1. Reads every row from all 38 public tables
2. Reads all auth users and identities (via SECURITY DEFINER RPCs `export_auth_users` and `export_auth_identities`)
3. Lists files in all 3 storage buckets AND downloads their binary contents
4. Zips everything (including the bucket file bytes under `storage/<bucket>/<path>`) into `BeefSynch_Backup_YYYY-MM-DD.zip`
5. Emails the ZIP to `office@catlresources.com` via Resend

**Current scale** (measured 2026-04-23 via a manual invoke): 9,266 rows across 38 tables, 22 auth users, 3 buckets containing ~11.8 MB of file bytes total. Final email attachment is ≈ 11.5 MB — comfortably under Resend's 40 MB cap.

**Response summary** from every run is a JSON like:

```json
{
  "success": true,
  "mode": "email",
  "backup_version": 5,
  "tables_included": 38,
  "total_rows": 9266,
  "size_kb": 11816,
  "auth_users_count": 22,
  "auth_identities_count": 22,
  "storage_buckets": 3,
  "storage_total_bytes": 11787203,
  "storage_contents_embedded": true,
  "storage_contents_skipped_reason": null,
  "errors": null
}
```

If `storage_contents_embedded` ever returns `false`, the function hit its internal size cap and fell back to metadata-only for buckets; the skip reason appears in `storage_contents_skipped_reason`.

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
4. **Restore storage files.** The ZIP contains file bytes under `storage/<bucket>/<path>/` (as long as the run reported `storage_contents_embedded: true`). For each file, upload it back to the matching bucket preserving its path. If the run had embedding turned off for size reasons, fall back to the `storage_*.jsonl` manifest + Supabase's own zone replication.
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

Extract the most recent email ZIP. File bytes live under `storage/<bucket>/<path>/` (assuming `storage_contents_embedded: true` on that run). Re-upload to the matching bucket preserving the original path.

If for some reason that run had embedding disabled (size cap tripped — shouldn't happen at current scale), fall back to Supabase's own zone-replicated storage and the `storage_{bucket}.jsonl` manifests in the ZIP, which at least tell you what files *should* exist.

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

### ✅ G-1. `full-export` embeds storage file bytes — SHIPPED 2026-04-23

Verified via a manual invoke that reported `storage_contents_embedded: true` with `storage_total_bytes: 11,787,203`. The deployed `full-export` is now at `backup_version: 5` and has diverged from the version checked into this repo at commit `2d8e849` — someone (Lovable or a later session) rewrote it to embed bytes and emit a summary JSON instead of returning the raw ZIP in the HTTP body.

**Follow-up for this section:** `supabase functions download full-export --project-ref ktelduvdymplytoihtht` and commit the current production source back into the repo so the code of record matches what's actually running.

### G-2. Dedicated `list_storage_objects` SECURITY DEFINER RPC

**Current:** may still be using the client-side `storage.list()` API — unverified after the `backup_version: 5` rewrite. Check once the current source is pulled back into the repo (see G-1 follow-up).

**Target:** a `public.list_storage_objects(bucket text)` SECURITY DEFINER function that returns a full flat listing from `storage.objects` in one query. Simpler edge-function code, single round trip, no folder-recursion bugs.

**Why deferred:** low urgency — current code works. Worth doing whenever someone's touching `full-export` anyway.

### G-3. Upgrade `scheduled-backup`'s email body to list bucket names dynamically

**Current:** status uncertain after the `backup_version: 5` rewrite. The production function now appears to email directly from `full-export` (`mode: "email"` in the response). Re-evaluate after pulling current source.

**Target:** if `scheduled-backup` still exists as a separate shim, have it read the manifest from the ZIP and template the bucket list into the email. If the roles have consolidated into `full-export`, ensure that function reads its own manifest.

**Why deferred:** cosmetic — the ZIP is correct regardless of what the email says.

### G-4. GitHub Action to auto-regenerate `types.ts`

**Current:** Lovable's deploy flow periodically reverts `src/integrations/supabase/types.ts` back to the stale schema from the dead project `qgpufoqjjxyecimxusze` (see maintenance rule 5). Every manual regen is a one-shot fix.

**Target:** `.github/workflows/regenerate-supabase-types.yml` that fires on every push to `main`, runs `supabase gen types typescript --project-id ktelduvdymplytoihtht`, and auto-commits a correction if the file differs. Self-healing. Requires two GitHub secrets: `SUPABASE_ACCESS_TOKEN` and a `TYPES_WRITEBACK_PAT`.

**Why deferred:** design discussed but not yet implemented.

### G-5. Sync production `full-export` source back into the repo

**Gap:** the deployed function (`backup_version: 5`) is more advanced than the version in `supabase/functions/full-export/index.ts` at HEAD. The repo is behind reality, which means a fresh deploy from git would *regress* the backup.

**Target:** `supabase functions download full-export --project-ref ktelduvdymplytoihtht`, overwrite the local file, commit. Also diff against the repo version to capture what changed (byte embedding, JSON summary, direct email) for project memory / audit trail.

**Why deferred:** noted during the 2026-04-23 manual invoke; not yet done.
