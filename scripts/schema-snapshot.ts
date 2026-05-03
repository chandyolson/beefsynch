/**
 * schema-snapshot.ts
 *
 * Dumps the current Supabase/Postgres public-schema state to a timestamped
 * markdown file under snapshots/ so we can diff before/after each migration
 * session.
 *
 * Usage:   npm run schema:snapshot
 * Output:  snapshots/YYYY-MM-DD_HHMM_snapshot.md
 *
 * Env (loaded from .env at repo root):
 *   DATABASE_URL  — full Postgres connection string, e.g.
 *                   postgresql://postgres.<ref>:<db-password>@aws-0-us-east-1.pooler.supabase.com:5432/postgres
 *                   Copy from Supabase Dashboard → Project Settings → Database
 *                   → Connection string → URI (session mode).
 *                   NEVER commit this value.
 *
 * NOTE on service role keys: the newer Supabase `sb_secret_*` API keys are
 * for REST/RPC auth only and cannot be used as a Postgres password. Use
 * the database-specific connection string from the dashboard instead.
 *
 * The generated markdown is deterministic (stable sort everywhere, no
 * timestamps inside the body) so running it twice in a row should produce
 * byte-identical content — makes diffs meaningful.
 */

import { Client } from "pg";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const SNAPSHOTS_DIR = join(REPO_ROOT, "snapshots");

loadDotenv({ path: join(REPO_ROOT, ".env") });

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error(
    "ERROR: DATABASE_URL must be set in .env.\n" +
      "See scripts/SCHEMA_SNAPSHOT.md for where to copy it from."
  );
  process.exit(1);
}

async function run() {
  const client = new Client({ connectionString: DATABASE_URL });
  try {
    await client.connect();
  } catch (err) {
    console.error(
      "Failed to connect to Postgres. Check DATABASE_URL in .env and that " +
        "your network can reach the Supabase pooler."
    );
    console.error((err as Error).message);
    process.exit(1);
  }

  const sections: string[] = [];
  sections.push("# Schema snapshot\n");
  sections.push(
    "Deterministic dump of the `public` schema. Safe to diff across sessions — no timestamps inside the content (only in the filename).\n"
  );

  // 1. Tables
  console.log("Dumping tables...");
  sections.push(await dumpTables(client));

  // 2. Views
  console.log("Dumping views...");
  sections.push(await dumpViews(client));

  // 3. Functions
  console.log("Dumping functions...");
  sections.push(await dumpFunctions(client));

  // 4. Triggers
  console.log("Dumping triggers...");
  sections.push(await dumpTriggers(client));

  // 5. Indexes
  console.log("Dumping indexes...");
  sections.push(await dumpIndexes(client));

  // 6. Foreign keys
  console.log("Dumping foreign keys...");
  sections.push(await dumpForeignKeys(client));

  // 7. RLS policies
  console.log("Dumping RLS policies...");
  sections.push(await dumpPolicies(client));

  // 8. Enums
  console.log("Dumping enums...");
  sections.push(await dumpEnums(client));

  // 9. Extensions
  console.log("Dumping extensions...");
  sections.push(await dumpExtensions(client));

  await client.end();

  // Write output
  mkdirSync(SNAPSHOTS_DIR, { recursive: true });
  const now = new Date();
  const stamp = formatTimestampForFilename(now);
  const outPath = join(SNAPSHOTS_DIR, `${stamp}_snapshot.md`);
  writeFileSync(outPath, sections.join("\n"), "utf8");
  console.log(`Wrote ${outPath}`);
}

function formatTimestampForFilename(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${mo}-${da}_${h}${mi}`;
}

// ─── Section dumpers ─────────────────────────────────────────────────────────

async function dumpTables(c: Client): Promise<string> {
  const { rows } = await c.query<{
    table_name: string;
    column_name: string;
    data_type: string;
    is_nullable: string;
    column_default: string | null;
  }>(
    `SELECT table_name, column_name, data_type, is_nullable, column_default
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name IN (SELECT table_name FROM information_schema.tables
                          WHERE table_schema = 'public' AND table_type = 'BASE TABLE')
     ORDER BY table_name, ordinal_position`
  );

  const byTable = new Map<string, typeof rows>();
  for (const r of rows) {
    if (!byTable.has(r.table_name)) byTable.set(r.table_name, [] as any);
    byTable.get(r.table_name)!.push(r);
  }

  const out: string[] = ["## 1. Tables\n"];
  for (const table of [...byTable.keys()].sort()) {
    out.push(`### ${table}\n`);
    out.push("| column | type | nullable | default |");
    out.push("|---|---|---|---|");
    for (const col of byTable.get(table)!) {
      out.push(
        `| ${col.column_name} | ${col.data_type} | ${col.is_nullable} | ${col.column_default ?? ""} |`
      );
    }
    out.push("");
  }
  return out.join("\n");
}

async function dumpViews(c: Client): Promise<string> {
  const { rows } = await c.query<{ table_name: string; view_definition: string }>(
    `SELECT table_name, view_definition
     FROM information_schema.views
     WHERE table_schema = 'public'
     ORDER BY table_name`
  );
  const out: string[] = ["## 2. Views\n"];
  for (const v of rows) {
    out.push(`### ${v.table_name}\n`);
    out.push("```sql");
    out.push((v.view_definition ?? "").trim());
    out.push("```");
    out.push("");
  }
  if (rows.length === 0) out.push("_(none)_\n");
  return out.join("\n");
}

async function dumpFunctions(c: Client): Promise<string> {
  // prokind: f = normal function, a = aggregate, p = procedure, w = window
  // We want only plain functions.
  const { rows } = await c.query<{
    name: string;
    return_type: string;
    language: string;
    definition: string;
  }>(
    `SELECT p.proname AS name,
            pg_get_function_result(p.oid) AS return_type,
            l.lanname AS language,
            pg_get_functiondef(p.oid) AS definition
     FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
     JOIN pg_language l ON l.oid = p.prolang
     WHERE n.nspname = 'public'
       AND p.prokind = 'f'
     ORDER BY p.proname`
  );
  const out: string[] = ["## 3. Functions\n"];
  for (const fn of rows) {
    out.push(`### ${fn.name}\n`);
    out.push(`- **Returns:** \`${fn.return_type}\``);
    out.push(`- **Language:** \`${fn.language}\``);
    out.push("");
    out.push("```sql");
    out.push((fn.definition ?? "").trim());
    out.push("```");
    out.push("");
  }
  if (rows.length === 0) out.push("_(none)_\n");
  return out.join("\n");
}

async function dumpTriggers(c: Client): Promise<string> {
  const { rows } = await c.query<{
    table_name: string;
    trigger_name: string;
    function_name: string;
    timing: string;
    events: string;
  }>(
    `SELECT
       c.relname AS table_name,
       t.tgname AS trigger_name,
       tp.proname AS function_name,
       CASE
         WHEN t.tgtype & 2  != 0 THEN 'BEFORE'
         WHEN t.tgtype & 64 != 0 THEN 'INSTEAD OF'
         ELSE 'AFTER'
       END AS timing,
       array_to_string(array_remove(ARRAY[
         CASE WHEN t.tgtype & 4  != 0 THEN 'INSERT' END,
         CASE WHEN t.tgtype & 8  != 0 THEN 'DELETE' END,
         CASE WHEN t.tgtype & 16 != 0 THEN 'UPDATE' END,
         CASE WHEN t.tgtype & 32 != 0 THEN 'TRUNCATE' END
       ], NULL), ', ') AS events
     FROM pg_trigger t
     JOIN pg_class c ON c.oid = t.tgrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
     JOIN pg_proc tp ON tp.oid = t.tgfoid
     WHERE n.nspname = 'public'
       AND NOT t.tgisinternal
     ORDER BY c.relname, t.tgname`
  );
  const out: string[] = ["## 4. Triggers\n"];
  if (rows.length === 0) {
    out.push("_(none)_\n");
    return out.join("\n");
  }
  out.push("| table | trigger | function | timing | events |");
  out.push("|---|---|---|---|---|");
  for (const t of rows) {
    out.push(
      `| ${t.table_name} | ${t.trigger_name} | ${t.function_name} | ${t.timing} | ${t.events} |`
    );
  }
  out.push("");
  return out.join("\n");
}

async function dumpIndexes(c: Client): Promise<string> {
  const { rows } = await c.query<{
    tablename: string;
    indexname: string;
    indexdef: string;
  }>(
    `SELECT tablename, indexname, indexdef
     FROM pg_indexes
     WHERE schemaname = 'public'
     ORDER BY tablename, indexname`
  );
  const out: string[] = ["## 5. Indexes\n"];
  if (rows.length === 0) {
    out.push("_(none)_\n");
    return out.join("\n");
  }
  out.push("| table | index | definition |");
  out.push("|---|---|---|");
  for (const i of rows) {
    // Escape pipes in definition for markdown table cells
    const def = i.indexdef.replace(/\|/g, "\\|");
    out.push(`| ${i.tablename} | ${i.indexname} | \`${def}\` |`);
  }
  out.push("");
  return out.join("\n");
}

async function dumpForeignKeys(c: Client): Promise<string> {
  const { rows } = await c.query<{
    from_table: string;
    from_column: string;
    to_table: string;
    to_column: string;
    constraint_name: string;
  }>(
    `SELECT
       c.relname AS from_table,
       a.attname AS from_column,
       rc.relname AS to_table,
       ra.attname AS to_column,
       con.conname AS constraint_name
     FROM pg_constraint con
     JOIN pg_class c ON c.oid = con.conrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
     JOIN pg_class rc ON rc.oid = con.confrelid
     JOIN unnest(con.conkey) WITH ORDINALITY AS k(attnum, ord) ON TRUE
     JOIN unnest(con.confkey) WITH ORDINALITY AS rk(attnum, ord) ON rk.ord = k.ord
     JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.attnum
     JOIN pg_attribute ra ON ra.attrelid = con.confrelid AND ra.attnum = rk.attnum
     WHERE con.contype = 'f'
       AND n.nspname = 'public'
     ORDER BY c.relname, con.conname, a.attname`
  );
  const out: string[] = ["## 6. Foreign keys\n"];
  if (rows.length === 0) {
    out.push("_(none)_\n");
    return out.join("\n");
  }
  out.push("| from_table | from_column | to_table | to_column | constraint |");
  out.push("|---|---|---|---|---|");
  for (const f of rows) {
    out.push(
      `| ${f.from_table} | ${f.from_column} | ${f.to_table} | ${f.to_column} | ${f.constraint_name} |`
    );
  }
  out.push("");
  return out.join("\n");
}

async function dumpPolicies(c: Client): Promise<string> {
  const { rows } = await c.query<{
    tablename: string;
    policyname: string;
    cmd: string;
    roles: string[] | null;
    qual: string | null;
    with_check: string | null;
  }>(
    `SELECT tablename, policyname, cmd, roles, qual, with_check
     FROM pg_policies
     WHERE schemaname = 'public'
     ORDER BY tablename, policyname`
  );
  const out: string[] = ["## 7. RLS policies\n"];
  if (rows.length === 0) {
    out.push("_(none)_\n");
    return out.join("\n");
  }
  out.push("| table | policy | cmd | roles | using | with check |");
  out.push("|---|---|---|---|---|---|");
  for (const p of rows) {
    const rolesStr = (p.roles ?? []).join(", ");
    const using = (p.qual ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
    const withCheck = (p.with_check ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
    out.push(
      `| ${p.tablename} | ${p.policyname} | ${p.cmd} | ${rolesStr} | \`${using}\` | \`${withCheck}\` |`
    );
  }
  out.push("");
  return out.join("\n");
}

async function dumpEnums(c: Client): Promise<string> {
  const { rows } = await c.query<{ enum_name: string; labels: string[] }>(
    `SELECT t.typname AS enum_name,
            array_agg(e.enumlabel ORDER BY e.enumsortorder) AS labels
     FROM pg_type t
     JOIN pg_enum e ON e.enumtypid = t.oid
     JOIN pg_namespace n ON n.oid = t.typnamespace
     WHERE n.nspname = 'public'
       AND t.typtype = 'e'
     GROUP BY t.typname
     ORDER BY t.typname`
  );
  const out: string[] = ["## 8. Enums\n"];
  if (rows.length === 0) {
    out.push("_(none)_\n");
    return out.join("\n");
  }
  for (const e of rows) {
    out.push(`### ${e.enum_name}`);
    for (const label of e.labels) {
      out.push(`- \`${label}\``);
    }
    out.push("");
  }
  return out.join("\n");
}

async function dumpExtensions(c: Client): Promise<string> {
  const { rows } = await c.query<{ extname: string; extversion: string }>(
    `SELECT extname, extversion FROM pg_extension ORDER BY extname`
  );
  const out: string[] = ["## 9. Extensions\n"];
  out.push("| extension | version |");
  out.push("|---|---|");
  for (const e of rows) {
    out.push(`| ${e.extname} | ${e.extversion} |`);
  }
  out.push("");
  return out.join("\n");
}

run().catch((err) => {
  console.error("Snapshot failed:", err);
  process.exit(1);
});
