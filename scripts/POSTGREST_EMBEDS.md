# PostgREST embed disambiguation

Several Supabase tables have multiple relationships to the same parent table —
either via duplicate FKs (`tank_inventory.customer_id` and
`tank_inventory.owner_customer_id` both → `customers`) or via junction tables
(`shipments` ↔ `semen_orders` is reachable directly AND via `shipment_lines` AND
via `shipment_po_links`).

When a `.select()` embeds the parent without a hint, PostgREST returns
`300 Multiple Choices` (PGRST201). React Query treats that as an error and
falls back to an empty array, so the page renders silently empty.

The fix: pin the FK with `parent!constraint_name(cols)`.

## Auditing

`scripts/postgrest-ambiguous.json` is a snapshot of every ambiguous parent →
child pair in the live DB, with a suggested constraint name where one direct
FK exists.

Run the audit any time, especially after a Lovable rebuild:

```bash
node scripts/audit-postgrest-embeds.mjs
```

Exits 0 if clean, 1 with a per-file report otherwise. Each finding gives the
exact line and a suggested replacement.

## Refreshing the map after schema changes

The map needs to be rebuilt when FKs are added/removed. Use the SQL from
this comment (run via Supabase SQL editor or MCP):

```sql
WITH fks AS (...), junctions AS (...), all_rels AS (...) ...
```

(See git history for the canonical query, or paste it from
`scripts/build-ambiguity-map.mjs` once that exists.)

## Why Lovable keeps re-introducing this

Lovable generates `.select("...embed(cols)...")` strings without FK hints.
After every Lovable session, run the audit; expect 1–10 new findings per
visit and pin them before pushing.
