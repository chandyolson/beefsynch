# BeefSynch — Migration from Lovable Cloud to Self-Hosted Supabase

This document describes how to migrate the BeefSynch project from Lovable Cloud to your own Supabase instance. It is split into two phases: **Export** (from Lovable Cloud) and **Import** (into a new Supabase project). Credentials and connection strings are intentionally omitted — you will supply them at runtime.

---

## Prerequisites

- A new Supabase project created at [supabase.com](https://supabase.com) (or self-hosted)
- Supabase CLI installed (`npm i -g supabase` or `brew install supabase/tap/supabase`)
- `psql` (PostgreSQL client) installed locally
- `deno` installed (for Edge Function deployment)
- Access to the Lovable Cloud backend (database credentials available from Lovable support or the Cloud UI)
- The BeefSynch Git repo cloned locally

---

## Phase 1 — Export (from Lovable Cloud)

### Step 1.1 — Export the Database Schema

> **⚠️ IMPORTANT:** The `supabase/migrations/` directory only contains incremental migrations — it does **not** have complete DDL for every table. Only 7 of 33 tables were originally created via migration files; the other 26 were created directly in the Lovable Cloud SQL Editor.
>
> The authoritative, complete schema is in **`supabase/baseline_schema.sql`**. This file contains `CREATE TABLE IF NOT EXISTS` statements for all 26 missing tables plus all functions, triggers, indexes, unique constraints, foreign keys, and RLS policies.

**What to do:**
1. Open `supabase/baseline_schema.sql` and review the contents.
2. On your **new** Supabase project, run the baseline schema first (via the SQL Editor or `psql`):
   ```bash
   psql "$NEW_DB_CONNECTION_STRING" -f supabase/baseline_schema.sql
   ```
3. Then apply the incremental migrations in order:
   ```bash
   for f in supabase/migrations/*.sql; do
     echo "Applying $f ..."
     psql "$NEW_DB_CONNECTION_STRING" -f "$f" 2>&1 | grep -i error || true
   done
   ```
   Many will report "already exists" errors — that's expected and safe since the baseline already created them.

**What to verify:**
- Run `\dt public.*` in `psql` and confirm all 33 tables exist.
- Run `SELECT count(*) FROM pg_policies WHERE schemaname = 'public';` — you should see 60+ RLS policies.
- Confirm all functions exist: `\df public.*` should list `user_org_ids`, `get_org_role`, `get_org_members`, `accept_org_invite`, `lookup_invite_by_token`, `handle_new_user`, etc.

**Rollback:** Drop and recreate the database, or restore from the Supabase dashboard's point-in-time recovery.

**Tables covered by `baseline_schema.sql` (26):**
organizations, organization_members, pending_invites, customers, semen_companies, tanks, tank_inventory, tank_fills, tank_movements, shipments, inventory_transactions, bull_favorites, billing_products, project_contacts, project_billing, project_billing_labor, project_billing_products, project_billing_semen, project_billing_sessions, tank_packs, tank_pack_lines, tank_pack_projects, tank_pack_orders, tank_unpack_lines, google_calendar_events, receiving_report_audit_log

**Tables covered by existing migrations (7):**
bulls_catalog, profiles, projects, protocol_events, project_bulls, semen_orders, semen_order_items

---

### Step 1.2 — Export Data (via `full-export` Edge Function)

Lovable Cloud does not expose a direct Postgres connection string, so `pg_dump` is not available. Instead, use the `full-export` Edge Function deployed in the project. It exports all 33 public-schema tables, auth users/identities, and storage file metadata as a ZIP of JSONL files.

**What to do:**
1. Call the function with the service role key:
   ```bash
   curl -o beefsynch_export.zip \
     -H "Authorization: Bearer <SERVICE_ROLE_KEY>" \
     "https://<SUPABASE_PROJECT_REF>.supabase.co/functions/v1/full-export"
   ```
   Replace `<SERVICE_ROLE_KEY>` and `<SUPABASE_PROJECT_REF>` with your actual values.

2. Unzip and inspect:
   ```bash
   unzip beefsynch_export.zip -d beefsynch_export/
   cat beefsynch_export/manifest.json
   ```

**What the ZIP contains:**
- One `.jsonl` file per public table (e.g., `organizations.jsonl`, `tank_inventory.jsonl`)
- `auth_users.jsonl` and `auth_identities.jsonl` (or an error file if auth export failed)
- `storage_shipment_documents.jsonl` and `storage_email_assets.jsonl` (file metadata only — paths, sizes, mimetypes)
- `manifest.json` with export timestamp, row counts, and tables in foreign-key dependency order

**What to verify:**
- `manifest.json` lists all 33 tables with non-zero row counts for tables you know have data.
- Spot-check a JSONL file: `head -3 beefsynch_export/projects.jsonl`
- Auth users count matches what you expect.
- Storage metadata lists all files you know exist.

**Rollback:** N/A — this is read-only.

**⚠️ BeefSynch-specific:**
- The function paginates internally (1000 rows per request) so large tables like `tank_inventory` and `inventory_transactions` are fully exported.
- The `bulls_catalog` table is global (not org-scoped) and can be large. Verify it's included.
- UUIDs are preserved as strings, timestamps as ISO 8601, JSONB as nested objects.

---

### Step 1.3 — Export Storage Files (shipment-documents bucket)

BeefSynch has two storage buckets:
- `email-assets` (public) — logos and email images
- `shipment-documents` (private) — uploaded receiving report documents

**What to do:**
1. List all files in each bucket using the Supabase JS client or REST API:
   ```bash
   curl -H "Authorization: Bearer <SERVICE_ROLE_KEY>" \
     "<SUPABASE_URL>/storage/v1/object/list/shipment-documents" \
     -d '{"prefix":"","limit":1000}'
   ```
2. Download each file locally:
   ```bash
   mkdir -p export/shipment-documents export/email-assets
   # For each file path returned:
   curl -H "Authorization: Bearer <SERVICE_ROLE_KEY>" \
     "<SUPABASE_URL>/storage/v1/object/shipment-documents/<FILE_PATH>" \
     -o "export/shipment-documents/<FILE_PATH>"
   ```
3. Repeat for `email-assets`.

**What to verify:**
- File counts match what you see in the Cloud UI.
- Spot-check a few downloaded files to ensure they're not empty / corrupted.

**Rollback:** N/A — read-only.

**⚠️ BeefSynch-specific:** The `shipments.document_path` column stores paths relative to the bucket root. These paths must remain the same in the new project or you'll need to update every row.

---

### Step 1.4 — Document Edge Function Secrets

Record the names and values of all secrets your Edge Functions need. The current secrets are:

| Secret Name | Used By |
|---|---|
| `RESEND_API_KEY` | `scheduled-backup`, `invite-member`, `resend-invite` |
| `VITE_GOOGLE_CLIENT_ID` | `google-calendar-config` |
| `LOVABLE_API_KEY` | `bull-chat` (Lovable AI Gateway) |

**What to do:**
1. Retrieve each secret value from the Lovable Cloud secrets UI.
2. Store them securely (e.g., a password manager). Do NOT commit them to the repo.

**What to verify:**
- You have a value for every secret listed above.

**⚠️ BeefSynch-specific:** The `LOVABLE_API_KEY` is for the Lovable AI Gateway. If migrating away from Lovable entirely, you'll need to replace the `bull-chat` Edge Function with a direct OpenAI/Google AI call and use your own API key.

---

### Step 1.5 — Document Auth Configuration

Record the current auth settings:

- **Email signup:** Enabled, email confirmation required (not auto-confirm)
- **Google OAuth:** Enabled (uses `VITE_GOOGLE_CLIENT_ID`)
- **Auth email hook:** Custom email templates via `auth-email-hook` Edge Function

**What to do:**
1. Screenshot or note the current auth settings from Lovable Cloud.
2. Note the Site URL and Redirect URLs configured.

---

## Phase 2 — Import (into a new Supabase project)

### Step 2.1 — Apply Schema Migrations

**Tools:** Supabase CLI, `psql`

**What to do:**
1. Link the Supabase CLI to your new project:
   ```bash
   supabase link --project-ref <NEW_PROJECT_REF>
   ```
2. Push all migrations:
   ```bash
   supabase db push
   ```
   This applies all 32 migration files in order.

**What to verify:**
- Command completes without errors.
- Connect via `psql` and verify tables exist:
  ```sql
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public' ORDER BY table_name;
  ```
- Verify all 28+ tables are present (organizations, projects, tanks, tank_inventory, tank_packs, shipments, etc.).

**Rollback:**
- If a migration fails partway, fix the SQL and re-run. Supabase CLI tracks which migrations have been applied.
- Nuclear option: delete the Supabase project and recreate.

**⚠️ BeefSynch-specific items to verify:**

| Component | How to verify |
|---|---|
| **RLS policies** | `SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename;` — should return 50+ policies |
| **Database functions** | `SELECT routine_name FROM information_schema.routines WHERE routine_schema = 'public';` — should include: `user_org_ids`, `get_org_role`, `get_org_members`, `accept_org_invite`, `lookup_invite_by_token`, `lookup_org_by_invite_code`, `handle_new_user`, `cleanup_anonymous_projects`, `update_billing_timestamp`, `update_shipments_updated_at` |
| **Triggers** | `SELECT trigger_name, event_object_table FROM information_schema.triggers WHERE trigger_schema = 'public';` — verify `handle_new_user` trigger on `auth.users`, billing timestamp trigger, shipments updated_at trigger |
| **Sequences** | Sequences are auto-created by `gen_random_uuid()` defaults — no manual action needed |

---

### Step 2.2 — Import Data (from JSONL export)

**Tools:** `psql`, a conversion script (Node.js or Python)

Since the export is JSONL (not SQL), you need to convert each `.jsonl` file into SQL INSERT statements or use a script to insert via the Supabase client.

**What to do:**
1. Write a conversion script. Example in Node.js:
   ```js
   // convert-jsonl-to-sql.js
   const fs = require('fs');
   const path = require('path');
   const manifest = JSON.parse(fs.readFileSync('beefsynch_export/manifest.json', 'utf8'));

   for (const { name } of manifest.tables) {
     const lines = fs.readFileSync(`beefsynch_export/${name}.jsonl`, 'utf8')
       .split('\n').filter(Boolean);
     if (lines.length === 0) continue;

     const out = fs.createWriteStream(`beefsynch_export/${name}.sql`);
     for (const line of lines) {
       const row = JSON.parse(line);
       const cols = Object.keys(row);
       const vals = cols.map(c => {
         const v = row[c];
         if (v === null) return 'NULL';
         if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
         if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
         if (typeof v === 'number') return String(v);
         return `'${String(v).replace(/'/g, "''")}'`;
       });
       out.write(`INSERT INTO public.${name} (${cols.join(', ')}) VALUES (${vals.join(', ')});\n`);
     }
     out.end();
   }
   console.log('Done. SQL files written to beefsynch_export/');
   ```
2. Run the conversion: `node convert-jsonl-to-sql.js`
3. Temporarily disable triggers:
   ```sql
   SET session_replication_role = 'replica';
   ```
4. Import tables in dependency order (as listed in `manifest.json`):
   ```bash
   for table in $(node -e "const m=require('./beefsynch_export/manifest.json'); m.tables.forEach(t=>console.log(t.name))"); do
     echo "Importing $table..."
     psql "<NEW_DATABASE_CONNECTION_STRING>" -f "beefsynch_export/${table}.sql"
   done
   ```
5. Re-enable triggers:
   ```sql
   SET session_replication_role = 'origin';
   ```

**What to verify:**
- Spot-check row counts:
  ```sql
  SELECT 'organizations' AS t, count(*) FROM organizations
  UNION ALL SELECT 'projects', count(*) FROM projects
  UNION ALL SELECT 'tanks', count(*) FROM tanks
  UNION ALL SELECT 'tank_inventory', count(*) FROM tank_inventory
  UNION ALL SELECT 'bulls_catalog', count(*) FROM bulls_catalog
  UNION ALL SELECT 'shipments', count(*) FROM shipments
  UNION ALL SELECT 'semen_orders', count(*) FROM semen_orders;
  ```
- Compare counts against `manifest.json`.

**Rollback:**
```sql
-- If data import is wrong, truncate all public tables and re-import:
TRUNCATE TABLE public.inventory_transactions, public.tank_unpack_lines,
  public.tank_pack_lines, public.tank_pack_orders, public.tank_pack_projects,
  public.tank_packs, public.tank_inventory, public.tank_fills, public.tank_movements,
  public.shipments, public.semen_order_items, public.semen_orders,
  public.project_billing_labor, public.project_billing_products,
  public.project_billing_semen, public.project_billing_sessions, public.project_billing,
  public.protocol_events, public.project_bulls, public.project_contacts, public.projects,
  public.pending_invites, public.organization_members, public.organizations,
  public.customers, public.semen_companies, public.bulls_catalog,
  public.bull_favorites, public.profiles, public.billing_products,
  public.google_calendar_events, public.receiving_report_audit_log
CASCADE;
```

---

### Step 2.3 — Import Auth Users (Optional)

The export ZIP includes `auth_users.jsonl` and `auth_identities.jsonl`.

**What to do:**
1. Convert `auth_users.jsonl` to SQL INSERTs targeting `auth.users` (same conversion pattern as Step 2.2).
2. Convert `auth_identities.jsonl` to SQL INSERTs targeting `auth.identities`.
3. Disable the `handle_new_user` trigger to prevent duplicate profile rows:
   ```sql
   ALTER TABLE auth.users DISABLE TRIGGER on_auth_user_created;
   ```
4. Import users then identities:
   ```bash
   psql "<NEW_DATABASE_CONNECTION_STRING>" -f auth_users.sql
   psql "<NEW_DATABASE_CONNECTION_STRING>" -f auth_identities.sql
   ```
5. Re-enable the trigger:
   ```sql
   ALTER TABLE auth.users ENABLE TRIGGER on_auth_user_created;
   ```

**If `auth_users_ERROR.json` exists instead:** The service role couldn't export auth data. You'll need to have users re-register, or manually create them via the Supabase Dashboard.

**What to verify:**
- Users can log in with their existing credentials.
- `SELECT count(*) FROM auth.users;` matches source.

**Rollback:** `TRUNCATE auth.users, auth.identities CASCADE;` (caution: this removes all auth state).

**⚠️ BeefSynch-specific:** User passwords are hashed — they transfer as-is. However, OAuth tokens (Google) will NOT transfer. Users will need to re-link Google OAuth on first login.

---

### Step 2.4 — Create Storage Buckets and Upload Files

**Tools:** Supabase Dashboard or CLI

**What to do:**
1. Create the buckets in the new project:
   ```sql
   INSERT INTO storage.buckets (id, name, public) VALUES ('email-assets', 'email-assets', true);
   INSERT INTO storage.buckets (id, name, public) VALUES ('shipment-documents', 'shipment-documents', false);
   ```
2. Create storage policies — check the existing migrations for the exact policies, or create:
   ```sql
   -- email-assets: public read
   CREATE POLICY "Public read email-assets"
   ON storage.objects FOR SELECT
   USING (bucket_id = 'email-assets');

   -- shipment-documents: org members only (via service role for now)
   CREATE POLICY "Org members read shipment docs"
   ON storage.objects FOR SELECT
   USING (bucket_id = 'shipment-documents' AND auth.role() = 'authenticated');

   CREATE POLICY "Org members upload shipment docs"
   ON storage.objects FOR INSERT
   WITH CHECK (bucket_id = 'shipment-documents' AND auth.role() = 'authenticated');
   ```
3. Upload files using the Supabase CLI or a script:
   ```bash
   # For each file in export/shipment-documents/:
   supabase storage cp export/shipment-documents/<FILE> \
     ss:///shipment-documents/<FILE> --project-ref <NEW_PROJECT_REF>
   ```

**What to verify:**
- `supabase storage ls ss:///shipment-documents --project-ref <NEW_PROJECT_REF>` shows all files.
- Open one file URL in the app to confirm access works.

**Rollback:** Delete bucket contents and re-upload.

---

### Step 2.5 — Deploy Edge Functions

**Tools:** Supabase CLI

BeefSynch has 6 Edge Functions:

| Function | JWT Verification | Notes |
|---|---|---|
| `auth-email-hook` | Disabled (`verify_jwt = false`) | Custom email templates |
| `bull-chat` | Default (enabled) | AI chat — uses LOVABLE_API_KEY |
| `google-calendar-config` | Default (enabled) | Google Calendar integration |
| `invite-member` | Default (enabled) | Sends invite emails via Resend |
| `resend-invite` | Default (enabled) | Re-sends invite emails |
| `scheduled-backup` | Default (enabled) | Daily backup via Resend (auth via service role key in header) |

**What to do:**
1. Ensure `supabase/config.toml` has the correct `project_id` for your new project:
   ```toml
   project_id = "<NEW_PROJECT_REF>"
   ```
2. Deploy all functions:
   ```bash
   supabase functions deploy auth-email-hook --project-ref <NEW_PROJECT_REF>
   supabase functions deploy bull-chat --project-ref <NEW_PROJECT_REF>
   supabase functions deploy google-calendar-config --project-ref <NEW_PROJECT_REF>
   supabase functions deploy invite-member --project-ref <NEW_PROJECT_REF>
   supabase functions deploy resend-invite --project-ref <NEW_PROJECT_REF>
   supabase functions deploy scheduled-backup --project-ref <NEW_PROJECT_REF>
   ```
3. Set secrets on the new project:
   ```bash
   supabase secrets set RESEND_API_KEY=<value> --project-ref <NEW_PROJECT_REF>
   supabase secrets set VITE_GOOGLE_CLIENT_ID=<value> --project-ref <NEW_PROJECT_REF>
   # Only if continuing to use Lovable AI Gateway:
   supabase secrets set LOVABLE_API_KEY=<value> --project-ref <NEW_PROJECT_REF>
   ```

**What to verify:**
- `supabase functions list --project-ref <NEW_PROJECT_REF>` shows all 6 functions.
- Test `invite-member` by invoking it with a test payload.
- Check function logs: `supabase functions logs invite-member --project-ref <NEW_PROJECT_REF>`

**Rollback:** `supabase functions delete <function-name> --project-ref <NEW_PROJECT_REF>` and redeploy.

**⚠️ BeefSynch-specific:**
- The `auth-email-hook` must have `verify_jwt = false` in `supabase/config.toml`. This is already configured.
- The `scheduled-backup` function authenticates via `SUPABASE_SERVICE_ROLE_KEY` in the Authorization header — this key is automatically available to Edge Functions, no manual secret needed.
- The `bull-chat` function calls the Lovable AI Gateway (`https://ai.lovable.dev`). If you're leaving the Lovable ecosystem, you'll need to rewrite this function to call OpenAI/Google directly.

---

### Step 2.6 — Configure Authentication

**Tools:** Supabase Dashboard

**What to do:**
1. Go to **Authentication → Providers → Email** in the Supabase Dashboard:
   - Enable Email provider
   - **Disable** "Confirm email" auto-confirm (users must verify email)
   - Enable "Secure email change" if desired
2. Go to **Authentication → Providers → Google**:
   - Enable Google provider
   - Enter your Google Client ID and Client Secret
   - Set the authorized redirect URI to `https://<NEW_PROJECT_REF>.supabase.co/auth/v1/callback`
3. Go to **Authentication → URL Configuration**:
   - Set **Site URL** to your production domain (e.g., `https://beefsynch.com`)
   - Add redirect URLs: `https://beefsynch.com/**`, `http://localhost:5173/**`
4. Go to **Authentication → Hooks**:
   - Configure the `auth-email-hook` function as the email hook (for custom email templates)

**What to verify:**
- Create a test account via email — confirmation email arrives with correct branding.
- Sign in with Google — redirects correctly.

**Rollback:** Revert settings in the Dashboard.

---

### Step 2.7 — Update Frontend Environment Variables

**What to do:**
1. Update your `.env` (or hosting platform env vars) with the new Supabase project values:
   ```
   VITE_SUPABASE_URL=https://<NEW_PROJECT_REF>.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=<NEW_ANON_KEY>
   VITE_SUPABASE_PROJECT_ID=<NEW_PROJECT_REF>
   ```
2. Update `src/integrations/supabase/client.ts` if it hardcodes any URLs (it shouldn't — it reads from env vars).
3. Rebuild and deploy the frontend.

**What to verify:**
- App loads without console errors.
- Data appears (projects, tanks, inventory).
- Auth works (login, signup, Google OAuth).

**Rollback:** Revert env vars to Lovable Cloud values.

---

### Step 2.8 — Update DNS and CORS (if using custom domain)

**What to do:**
1. If Edge Functions have hardcoded CORS origins (BeefSynch uses `https://beefsynch.com`), verify they match your domain.
2. Update Google OAuth authorized origins/redirect URIs to include the new Supabase callback URL.
3. If using Resend for emails, verify the sending domain (`backups@mail.beefsynch.com`) is still configured.

**What to verify:**
- Edge Function calls from the frontend don't get CORS errors.
- Email sending works (invite, backup).

---

## Post-Migration Checklist

| # | Check | How |
|---|---|---|
| 1 | All tables present | `SELECT count(*) FROM information_schema.tables WHERE table_schema='public';` |
| 2 | RLS policies active | `SELECT count(*) FROM pg_policies WHERE schemaname='public';` |
| 3 | Database functions present | `SELECT routine_name FROM information_schema.routines WHERE routine_schema='public';` |
| 4 | Row counts match | Compare key tables between old and new |
| 5 | Auth users migrated | `SELECT count(*) FROM auth.users;` |
| 6 | Storage files accessible | Open a shipment document in the app |
| 7 | Edge Functions responding | `curl https://<NEW_PROJECT_REF>.supabase.co/functions/v1/bull-chat` returns 401 (JWT required) |
| 8 | Email hook working | Sign up a new user, verify branded email arrives |
| 9 | Google OAuth working | Sign in with Google |
| 10 | Scheduled backup working | Manually invoke `scheduled-backup` and verify email arrives |
| 11 | Frontend loads data | Log in and browse projects, inventory, shipments |
| 12 | Realtime working | If any tables use realtime (`supabase_realtime` publication), verify subscriptions |

---

## Known Risks and Gotchas

1. **1000-row query limit**: Supabase PostgREST returns max 1000 rows by default. BeefSynch already handles this with `.range()` pagination for `tank_inventory` and `inventory_transactions`. Verify this still works with the new project.

2. **UUID references**: All IDs are UUIDs. Data import preserves them, so foreign key relationships remain intact.

3. **`owner` text field sync**: `tank_inventory.owner` is a denormalized text copy of the customer name. If customer names were updated after inventory was created, the `owner` field may be stale. This is a pre-existing condition, not caused by migration.

4. **Lovable AI Gateway**: The `bull-chat` function uses `https://ai.lovable.dev` with a `LOVABLE_API_KEY`. This endpoint may not be accessible outside Lovable. Plan to replace with direct AI provider calls.

5. **Auth email hook**: The custom email hook must be re-registered in the new Supabase project's Auth settings. It's not automatic from migration files.

6. **`supabase/config.toml`**: The `project_id` in this file must be updated to your new project ref before deploying functions.

7. **Cascading deletes**: `tank_pack_lines`, `tank_pack_projects`, and `tank_pack_orders` should have `ON DELETE CASCADE` to `tank_packs`. Verify this exists in the migration files — if not, add it manually before importing data.
