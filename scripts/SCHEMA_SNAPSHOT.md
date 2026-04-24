# Schema snapshot tool

Dumps the current Supabase/Postgres `public` schema to a timestamped markdown file under `snapshots/`. The output is deterministic so you can diff before/after a migration session and see exactly what changed.

## Quick start

```bash
npm run schema:snapshot
```

…or the shell wrapper if you prefer:

```bash
./scripts/schema-snapshot.sh
```

Output lands at `snapshots/YYYY-MM-DD_HHMM_snapshot.md`. Snapshot files are gitignored; commit the diffs yourself only if they're meaningful (e.g., "baseline before auth refactor").

## One-time setup

The script connects directly to Postgres (bypassing the Supabase JS client) so it can read `pg_catalog` and `information_schema`. You need the **database connection string**, not an API key.

Add this line to your local `.env` at the repo root:

```
DATABASE_URL=postgresql://postgres.<project-ref>:<db-password>@aws-0-us-east-1.pooler.supabase.com:5432/postgres
```

Copy the exact value from:
`Supabase Dashboard → Project Settings → Database → Connection string → URI (session mode)`

Pick the **session mode** / port 5432 version, not transaction mode / 6543 — some of the `pg_catalog` queries this script runs don't work correctly under transaction pooling.

**Why not the API service role key?** Newer Supabase projects use the `sb_secret_*` format, which is REST/RPC-only and doesn't work as a Postgres password. The database password shown on the Connection string page is separate.

**Never commit `DATABASE_URL`.** `.env` is gitignored per [DEPLOYMENT.md](../DEPLOYMENT.md) §2.A; keep it that way.

## What goes in the snapshot

Nine sections, in order, alphabetized within each:

1. **Tables** — every table in `public` with columns (name, type, nullable, default)
2. **Views** — every view's `view_definition` in a `sql` block
3. **Functions** — every normal function (pg_proc.prokind = 'f', so no aggregates or procedures) with return type, language, and `pg_get_functiondef` output
4. **Triggers** — non-internal triggers: table, trigger name, function called, BEFORE/AFTER/INSTEAD OF, events
5. **Indexes** — table, index name, definition
6. **Foreign keys** — from_table/column → to_table/column with constraint name
7. **RLS policies** — table, policy name, cmd, roles, using expression, with check expression
8. **Enums** — enum types and their values
9. **Extensions** — installed extensions with versions

## How to use it for a migration session

1. `npm run schema:snapshot` → captures the *before* state. Give the file a meaningful rename or note the filename.
2. Run your migrations / schema edits.
3. `npm run schema:snapshot` → captures the *after* state.
4. `git diff --no-index snapshots/<before>.md snapshots/<after>.md` to see exactly what changed.

Because output is deterministic, running it twice back-to-back against an unchanged database produces byte-identical content. Any real diff is a real schema change.

## Troubleshooting

**"Failed to connect to Postgres"**

The script connects to `db.<project-ref>.supabase.co:5432` directly. If your network blocks that (some corporate networks do), you may need a different endpoint or a VPN. The Supabase pooler is *not* used because some pg_catalog queries don't play nicely with pooled connections.

**"ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env"**

`.env` wasn't loaded, or the variables aren't there. Check that `.env` exists at the repo root (not in `scripts/`), and that the two variables are defined with no surrounding quotes.

**Output is slightly different between two back-to-back runs**

Most likely cause: someone else wrote to the DB between runs. Sort stability is enforced in every query; there's no timestamp or sequence-dependent output inside the body.

## What it doesn't capture

- Table row counts (intentional — those change constantly and would make diffs noisy)
- Sequence states (also volatile)
- The `auth`, `storage`, `extensions`, `graphql`, or `vault` schemas — only `public`
- Grants / REVOKEs (add later if we need them)
- Comment/descriptions — could be a follow-up enhancement
