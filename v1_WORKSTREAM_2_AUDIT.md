# Workstream 2 — Phase A audit

_Branch: `audit/workstream-2`. No code changes in this commit — this is the punch list that Phase B works through._

## Scope check (live DB state, 2026-04-26)

Confirmed via Supabase MCP against `ktelduvdymplytoihtht`:

| Object | Status |
|---|---|
| `tank_inventory.customer_id` column | ✅ exists |
| `inventory_transactions.is_billable` column | ✅ exists |
| `get_billable_units_for_order(_order_id uuid)` function | ✅ exists, returns `TABLE(bull_catalog_id uuid, naab_code text, bull_name text, units integer)` |
| `available_inventory` view | ❌ does NOT exist yet (Workstream 1 still owes it) |

So Phase B should default to **Pattern A** (`.is('customer_id', null)` on the query) unless the parallel session ships the view first.

---

## Section 1 — `tank_inventory` "available inventory" filter sites

Every site that touches `tank_inventory`, classified by intent. **Reads only** are evaluated for the filter; writes/inserts/deletes/existence-checks are listed for completeness but excluded from the migration.

### 1.A — Filter REQUIRED ("what can we sell?" / "what's our stock?")

These should add `.is('customer_id', null)` (or move to `available_inventory` view once it exists). Customer-owned rows currently inflate these aggregates and would let the app accidentally promise/sell another customer's semen.

| File:line | Current snippet | What it computes |
|---|---|---|
| [src/components/BullsRowManager.tsx:52](src/components/BullsRowManager.tsx:52) | paginated SELECT then sum into `byCatalogId` / `byName` maps | "On Hand" badge next to each bull row in `NewOrderDialog` and `NewProjectDialog` — drives whether the user thinks a quantity is promiseable. Filtering customer-owned out is essential. |
| [src/pages/PackTank.tsx:381](src/pages/PackTank.tsx:381) | `eq("bull_catalog_id", id) .gt("units", 0) .limit(1)` | `autoFillFromProject` — picks the largest source tank to seed a project pack line. Sourcing from a customer-owned row would silently move someone else's semen. |
| [src/pages/PackTank.tsx:394](src/pages/PackTank.tsx:394) | same as :381 by `bull_code` | Same as :381, fallback strategy. |
| [src/pages/PackTank.tsx:407](src/pages/PackTank.tsx:407) | same as :381 by `custom_bull_name` | Same as :381, last-resort strategy. |

### 1.B — Filter ALREADY APPLIED

These already filter properly today; flagged so we don't accidentally add a redundant filter.

| File:line | Current filter |
|---|---|
| [src/pages/PackTank.tsx:316](src/pages/PackTank.tsx:316) | `.is("customer_id", null)` ✓ |
| [src/pages/PackTank.tsx:326](src/pages/PackTank.tsx:326) | `.is("customer_id", null)` ✓ |
| [src/pages/PackTank.tsx:473](src/pages/PackTank.tsx:473) | `.eq("storage_type", "inventory")` + `.in("owner", ["Select","CATL"])` — narrower than customer_id IS NULL but achieves the same intent (CATL/Select inventory tanks only). Don't double-filter. |
| [src/pages/SemenOrderDetail.tsx:200](src/pages/SemenOrderDetail.tsx:200) | Same pattern as PackTank:473. |
| [src/pages/ReceiveShipment.tsx:284](src/pages/ReceiveShipment.tsx:284) | Conditional: `customer_id IS NULL` when `semenOwnerId === null`, else `customer_id = semenOwnerId`. Already correctly scoped per receive context. |

### 1.C — Filter NOT REQUIRED ("what's physically here?")

Physical-presence views and per-customer/per-tank scopes. Customer-owned rows correctly belong in these.

| File:line | What it shows |
|---|---|
| [src/components/inventory/TankMap.tsx:75](src/components/inventory/TankMap.tsx:75) | Tank-map page — every tank's contents. Physical view; must include customer-owned. |
| [src/components/inventory/TankMap.tsx:312](src/components/inventory/TankMap.tsx:312) | Single-tank print sheet from the map. Same. |
| [src/components/inventory/TanksTabContent.tsx:401](src/components/inventory/TanksTabContent.tsx:401) | Per-tank "Total Units" column on the Tanks list inside the inventory dashboard. Physical sum. |
| [src/pages/Tanks.tsx:180](src/pages/Tanks.tsx:180) | Per-tank "Total Units" column on the standalone Tanks page. Physical sum. |
| [src/pages/TankDetail.tsx:243](src/pages/TankDetail.tsx:243) | Single-tank detail page, full inventory listing. Physical view. |
| [src/pages/ReInventory.tsx:108](src/pages/ReInventory.tsx:108) | Re-inventory workflow for a single tank. User is reconciling physical contents — must see everything. |
| [src/pages/CustomerDetail.tsx:168](src/pages/CustomerDetail.tsx:168) | Customer-owned semen via `eq("customer_id", id)` — already correctly scoped to that customer. |
| [src/pages/CustomerDetail.tsx:217](src/pages/CustomerDetail.tsx:217) | Customer's stored semen on communal tanks via `eq("owner_customer_id", id)` — already scoped. |
| [src/components/inventory/InventoryTab.tsx:291](src/components/inventory/InventoryTab.tsx:291) | Collision check inside the dashboard's edit-row dialog. Must consider all rows regardless of ownership to enforce the unique constraint. |
| [src/components/InventoryBullPicker.tsx:76](src/components/InventoryBullPicker.tsx:76) | Picks an inventory row from a specified `sourceTankId` (with optional `customer_id` scoping). Tank-scoped physical picker. |
| [src/pages/PackDetail.tsx:283](src/pages/PackDetail.tsx:283) | Picks inventory rows from a chosen source tank when manually adding a pack line. Tank-scoped picker. **Borderline** — a future improvement could filter by ownership matching the pack type, but not required for this migration. |

### 1.D — Filter CONDITIONAL (driven by the new toggle, see §3)

| File:line | Notes |
|---|---|
| [src/components/inventory/InventoryTab.tsx:97](src/components/inventory/InventoryTab.tsx:97) | The main Inventory dashboard list. Default after Phase B = filter on (Available stock only); toggle off = show everything. |

### 1.E — Writes / non-reads (excluded from filter migration, listed for completeness)

| File:line | Op |
|---|---|
| [src/components/inventory/InventoryTab.tsx:309](src/components/inventory/InventoryTab.tsx:309), [:341](src/components/inventory/InventoryTab.tsx:341), [:363](src/components/inventory/InventoryTab.tsx:363), [:369](src/components/inventory/InventoryTab.tsx:369), [:395](src/components/inventory/InventoryTab.tsx:395) | UPDATE / DELETE — dashboard edit/merge/delete row |
| [src/pages/CustomerDetail.tsx:502](src/pages/CustomerDetail.tsx:502) | INSERT — Add Semen dialog (sets `customer_id` on the new row, by design) |
| [src/pages/TankDetail.tsx:567](src/pages/TankDetail.tsx:567) | INSERT — Add Bull dialog |
| [src/pages/BullList.tsx:334](src/pages/BullList.tsx:334) | `count("id", { head: true })` — deletion-guard existence check; should consider all rows regardless of ownership |

**Section 1 totals:** 4 filter-required reads, 5 already-correct, 11 not-required, 1 conditional, 7 writes/exempt.

---

## Section 2 — Billing math migration sites

The prior session tagged 5 sites as "Hard billing math." Re-examined with the new spec (`get_billable_units_for_order` RPC, replacing the earlier `tank_pack_orders.allocated_units` plan) — and with closer reading of intent at each site, only **2 of 5** are actually billing-quantity reads. The other 3 are reconciliation displays (ordered vs received from supplier, ordered vs packed for short-fill detection) that should keep `semen_order_items.units` because their semantic IS "what the customer ordered" or "what we ordered from the supplier."

### 2.A — TRUE billing-math reads — migrate to `get_billable_units_for_order`

These flow into a number that reflects "what we are charging" (or its preview).

| File:line | Currently computes | Should call instead | Per-bull breakdown? |
|---|---|---|---|
| [src/components/operations/HubTab.tsx:166](src/components/operations/HubTab.tsx:166) | `ordered = items.reduce((s, i) => s + (i.units || 0), 0)` from `semen_order_items` per row in the Hub Ready-to-Invoice list. The list is the user's "what to invoice next" queue. | `get_billable_units_for_order(o.id)` summed for the row total; bull-summary string at [HubTab.tsx:172](src/components/operations/HubTab.tsx:172) becomes per-bull from the same RPC rows. | Yes — RPC returns one row per bull with `bull_name` already, the existing summary maps over that. |
| [src/pages/SemenOrderDetail.tsx:286](src/pages/SemenOrderDetail.tsx:286) | `totalOrdered = items.reduce(...)` snapshotted into the reconciliation block of the order PDF (`generateOrderPdf` call at :322). | **Conditional — depends on whether the PDF is meant as the customer's invoice or as an internal order summary.** The PDF currently includes both ordered and reconciliation sections; if Chandy treats it as the invoice when invoicing, migrate. If invoices are produced elsewhere (QuickBooks, the unfinished `InvoiceOrderModal` flow), keep as ordered. **Stop and ask before migrating.** |

### 2.B — Walk back: reconcile-style "Ordered" displays — KEEP `semen_order_items.units`

These were tagged "hard billing math" in the prior pass but are actually order/supplier reconciliation. Their semantic is literally "what was ordered" — that's the right field.

| File:line | Why it should keep semen_order_items.units |
|---|---|
| [src/pages/SemenOrderDetail.tsx:449](src/pages/SemenOrderDetail.tsx:449) | `unitsOrdered={items.reduce(...)}` passed to `MarkFulfilledModal` for short-fill detection. The modal asks "did we deliver everything ordered?" That comparison wants ordered units, not billable. Customer-facing decision is "do we close the order short?", not "what to charge." |
| [src/components/inventory/OrderShipmentReconciliation.tsx:313](src/components/inventory/OrderShipmentReconciliation.tsx:313) | `ordered: item.units` per row in the supplier reconciliation grid. Joined against `inventory_transactions where transaction_type='received'` — this is "did we receive (from supplier) what we ordered (from supplier)?" Pure supplier reconciliation. |
| [src/components/inventory/OrderShipmentReconciliation.tsx:351](src/components/inventory/OrderShipmentReconciliation.tsx:351) | `totalOrdered = grouped.reduce(...)` aggregate of the same grid. Same reasoning. |

### 2.C — "Probably-billing aggregates" re-examined

The prior session's nervous-middle category. Each one re-read with the spec context.

| File:line | Display | Verdict |
|---|---|---|
| [src/components/operations/HubTab.tsx:144-145](src/components/operations/HubTab.tsx:144) | `pendingCustUnits` — total units across pending customer orders (Hub action-counts). | **KEEP `semen_order_items.units`.** These orders are pre-pack; no `is_billable` rows exist yet. The semantic is "ordered, not yet fulfilled." |
| [src/components/inventory/OrdersTab.tsx:86](src/components/inventory/OrdersTab.tsx:86) | `totalUnits` stat at top of the Orders tab — sum across all orders in scope. | **KEEP.** The list mixes pending+fulfilled+cancelled orders; the stat header is "what's been ordered through this lens." A billable total would be misleading because some rows aren't billable yet. |
| [src/components/inventory/OrdersTab.tsx:94](src/components/inventory/OrdersTab.tsx:94), [:240](src/components/inventory/OrdersTab.tsx:240), [:278](src/components/inventory/OrdersTab.tsx:278) | Per-row "Units" column via `getOrderUnits`. | **KEEP.** Column is implicitly "what was ordered." If a billable column is wanted, that's NEW work, not migration. |
| [src/pages/CustomerDetail.tsx:267](src/pages/CustomerDetail.tsx:267) | Customer's order list with `semen_order_items(units)` embed. | **KEEP.** Per-row order display; same reasoning as OrdersTab. |
| [src/components/inventory/WeeklySummary.tsx:221, :410-413](src/components/inventory/WeeklySummary.tsx:221) | Per-order totals on the new-orders-this-week digest. | **KEEP.** Pre-pack window; ordered units is the right view. |
| [src/lib/generateCustomerInventoryPdf.ts:134](src/lib/generateCustomerInventoryPdf.ts:134) | `unitsOnOrder` shown on the customer's PDF header — "Open Orders: N units". | **KEEP.** Open orders are pending; no billable yet. |
| [src/lib/generateCustomerInventoryPdf.ts:230, :233, :236](src/lib/generateCustomerInventoryPdf.ts:230) | Per-order rows in the PDF's Orders section — bull summary + total. | **REVIEW.** This PDF is customer-facing. Today it shows ordered. After Workstream 2 ships, the customer might prefer to see "what's been billed" alongside or instead. Product call. |
| [src/pages/BullReport.tsx:323, :336, :345, :368, :377, :386](src/pages/BullReport.tsx:323) | Per-bull rollups in the bull usage report. Drives the "Total Semen Units" stat ([:482](src/pages/BullReport.tsx:482), [:643](src/pages/BullReport.tsx:643)). | **KEEP.** The report's title ("Total Semen Units") is ambiguous, but the source is `semen_order_items` joined to date range — semantic = "what was ordered through customer orders in this window." Billable would be a meaningfully different report (and harder, because it requires per-order RPC calls). If Chandy wants a billable variant, that's a NEW report column/filter. |
| [src/pages/Planning.tsx:91-92](src/pages/Planning.tsx:91) | Per-bull customer-order demand for the planning forecast. | **KEEP.** Forecasting wants ordered demand, not billed amounts. |
| [src/pages/PackTank.tsx:516-517, :577-578, :1271, :209](src/pages/PackTank.tsx:516) | Auto-fill seed and pickup-order picker totals. | **KEEP.** Pre-pack; nothing is billable yet at this step. |
| [src/pages/ReceiveShipment.tsx:561-563](src/pages/ReceiveShipment.tsx:561) | `orderedQtyMap` for receive-vs-ordered comparison on the receiving page. | **KEEP.** Supplier reconciliation. |
| [src/pages/ReceiveShipmentPreview.tsx:86-88](src/pages/ReceiveShipmentPreview.tsx:86) | Same pattern. | **KEEP.** |

### 2.D — Sites that should ADD billable info but didn't exist before (NEW work, not migration)

Surfaced for awareness — not part of this audit's mandate, but the spec implies these exist.

- [src/components/orders/InvoiceOrderModal.tsx](src/components/orders/InvoiceOrderModal.tsx) — currently records invoice number/date only, doesn't preview billable. A natural place to surface `get_billable_units_for_order(orderId)` rows so Chandy sees the per-bull breakdown before clicking Mark Invoiced.
- A "billable preview" column on the Hub Ready-to-Invoice list — adjacent to today's "Ordered" / "Filled" columns.

### Section 2 summary

| Category | Sites |
|---|---|
| Migrate to `get_billable_units_for_order` (definite) | 1 — HubTab.tsx:166 |
| Migrate (conditional on product call) | 1 — SemenOrderDetail.tsx:286 |
| Walked back from prior list (KEEP) | 3 — SemenOrderDetail.tsx:449, OrderShipmentReconciliation.tsx:313, :351 |
| Probably-billing (KEEP, re-examined) | ~13 sites |
| Customer PDF (REVIEW with product) | 1 — generateCustomerInventoryPdf.ts orders section |
| New work (not part of migration) | InvoiceOrderModal preview, Hub billable column |

**Net migration footprint for Section 2 is much smaller than the prior audit suggested** — 1 definite site, 1 ask-Chandy site. The earlier "5 hard billing math sites" framing collapsed several distinct semantic categories (billing, ordered, supplier-reconcile, short-fill detection) into one bucket; closer reading separates them.

---

## Section 3 — Inventory tab toggle

### Current state of `src/components/inventory/InventoryTab.tsx`

**Filter toolbar** (around line 547-582):

- **Storage type** dropdown (`storageFilter`): `all` | `customer` | `communal` | `rental` | `inventory`
- **Owner** dropdown (`ownerFilter`): `all` | `company` | `customer` | `CATL` | `Select` — _defaults to `"company"`_ via `initialOwnerFilter` prop (callers in `OperationsDashboard` pass `"company"` by default).
- **Search** input — by bull, customer, tank
- **View mode** segmented control (`viewMode`): `detail` | `grouped` | `map`

**Stats row** (line 535-545) — clickable StatCards that act as filter shortcuts:

- Total Units (sets ownerFilter=all)
- Customer Units (sets ownerFilter=customer)
- Company Units (sets ownerFilter=company)
- Unique Bulls (no filter action)

**Detail-view row** (line 620-668) — columns:

| Column | Source |
|---|---|
| Bull | `getBullDisplayName(item)` + `bull_code` |
| Location | `tanks.tank_name #tank_number`, `Canister N / sub-can` |
| Owner | `customers.name` if customer-owned else `owner` text else `"Company"` |
| Units | `units` (right-aligned) |
| Storage | colored badge per `storage_type` |
| Actions | dropdown: Edit / Delete |

**Grouped view** (line 783-801) — same data grouped by bull → customer → tanks list.

**Map view** (line 588) — delegates to `<TankMap orgId={orgId!} />`.

### Existing toggle patterns in the codebase

1. **3-way segmented control** (best fit) — line 577-581 of InventoryTab itself for `viewMode`:
   ```tsx
   <div className="flex border border-border rounded-md overflow-hidden">
     <button onClick={() => setViewMode("detail")} className={cn(..., viewMode === "detail" ? "bg-primary text-primary-foreground" : "...")}>Detail</button>
     <button onClick={() => setViewMode("grouped")} className={...}>Grouped</button>
     <button onClick={() => setViewMode("map")} className={...}>Map</button>
   </div>
   ```
   This pattern can become a 2-way "Available / All" toggle by stripping one button.

2. **Tab pattern** — `<Tabs value=... onValueChange=...>` at `ReceivingTab.tsx:137-141`. Heavier UI; less appropriate for a simple binary.

3. **shadcn Switch** — used in places like `Tanks.tsx` for boolean filters. Simplest, but less discoverable than a segmented control.

### Recommendation for Phase B (do not build yet — this is the spec)

Add a 2-way segmented control next to the existing view-mode toggle, labeled **"Available stock only"** | **"All shelf contents"**, defaulting to "Available stock only". When "Available stock only" is selected, the dashboard query at line 97 adds `.is('customer_id', null)`. Existing storage and owner dropdowns remain.

Subtle interaction: with the new toggle = "Available stock only" AND existing ownerFilter = "customer", the result is empty (contradiction). Two reasonable resolutions:

- (a) Disable the ownerFilter "customer" option when toggle = available-only.
- (b) Treat the filters as AND and let the user discover the empty result.

Option (a) is friendlier; option (b) is simpler. Phase B should pick (a) unless Chandy says otherwise.

The existing StatCards auto-recompute based on the current dataset, so when the toggle is on:
- Customer Units → 0
- Company Units → totalUnits

The "Customer Units" StatCard would feel useless. **Suggestion:** when toggle = available-only, hide the Customer Units stat or grey it out. Phase B implementation note.

---

## Phase B dependency status

Phase B can begin once Workstream 1 confirms:

1. ✅ `get_billable_units_for_order` exists (already shipped)
2. ⏳ `available_inventory` view (optional — Phase B can use `.is('customer_id', null)` instead)
3. ⏳ Any RPC/trigger updates that affect what `is_billable=true` rows look like (Phase B must verify the function returns sensible data before migrating HubTab.tsx:166)

Migration risk is concentrated in Section 1.A (4 sites, all `tank_inventory` reads — purely additive `.is('customer_id', null)` filters, low blast radius) and Section 2.A (1-2 sites). Section 3 is its own UI feature, independent of the others.

---

## Stop-and-ask items for Chandy before Phase B

1. **SemenOrderDetail.tsx:286 — order PDF totalOrdered**: is `generateOrderPdf` the customer's invoice document, or an internal order summary? If invoice → migrate to RPC; if summary → keep ordered.
2. **generateCustomerInventoryPdf.ts:230-236**: should the customer-facing PDF show ordered units (today) or billed units (after Workstream 2)?
3. **InventoryTab toggle interaction with ownerFilter**: prefer option (a) disable conflicting choice, or (b) let it produce empty results?
4. **InvoiceOrderModal billable preview** and **Hub billable column** are flagged as natural new-feature follow-ons — in scope for this workstream, or separate?
