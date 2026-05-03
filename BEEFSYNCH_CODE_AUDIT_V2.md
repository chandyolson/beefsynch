# BeefSynch Code Audit V2

**Date:** May 3, 2026
**Branch:** `claude/beefsynch-refactor-670hh`
**Scope:** Full `src/` — 181 TS/TSX files, ~48,400 LOC
**Auditor:** Claude Code (Sonnet 4.6)

---

## What Changed Since V1 (April 22)

The following V1 findings are now resolved:

| V1 Finding | Status |
|---|---|
| `.env` tracked in git | ✅ Fixed — gitignored, `.env.example` added |
| Oversized image assets (5 MB total) | ✅ Fixed — compressed to <80 KB each |
| `formatTime12` / `isNoTimeEvent` duplicated in 7 files | ✅ Fixed — extracted to `src/lib/formatting.ts` |
| Status color maps duplicated in 6 files | ✅ Fixed — extracted to `src/lib/constants.ts` |
| `mockData.ts` dead file | ✅ Fixed — deleted; types moved to `src/types/project.ts` |
| 4 tables + 4 RPCs missing from `types.ts` | ✅ Fixed — 19 RPCs, 3 tables, 2 views, many columns added |
| Supabase mutations without error handling | ✅ Fixed — added to all unchecked calls |
| `getBullDisplayName` only in 1 file | ✅ Fixed — rolled out to 26+ consumers |
| `select("*")` on high-traffic Index/Customers/BullList | ✅ Fixed — explicit column lists |
| Navbar nav items duplicated desktop/mobile | ✅ Fixed — `NAV_ITEMS` array with `.map()` |

---

## A. File Size Analysis

Files exceeding 400 lines (candidates for decomposition). `types.ts` excluded (auto-generated).

| File | Lines | useState | Extraction Candidates | Effort |
|---|---|---|---|---|
| `pages/PackDetail.tsx` | 1,634 | 52 | `usePackEditForm` hook, `LineItemsSection`, `CloseOutDialog`, `PackSummaryCard` | L |
| `pages/PackTank.tsx` | 1,623 | 42 | `usePackForm` hook, `BullLineSelector`, `PackReviewPanel` | L |
| `pages/ReceiveShipment.tsx` | 1,502 | 26 | `useReceiveForm` hook, `LineItemsTable`, `BullMatchRow` | L |
| `pages/TankDetail.tsx` | 1,427 | 44 | `useTankOperations` hook, `InventorySection`, `MovementLog`, transfer/fill dialogs | L |
| `pages/CustomerDetail.tsx` | 1,407 | 46 | `useCustomerData` hook, `CustomerTankList`, `CustomerOrderHistory` | L |
| `components/inventory/TanksTabContent.tsx` | 1,182 | — | Split into `TankListView`, `TankFillDialog`, `TankReturnDialog` | M |
| `pages/ProjectDetail.tsx` | 1,160 | 23 | `ProjectHeaderCard`, `BullsSection`, `EventsTimeline` | M |
| `components/inventory/WeeklySummary.tsx` | 1,158 | — | Extract data fetching to `useWeeklySummaryData` hook | M |
| `pages/ProjectBilling.tsx` ⚠️ | 1,036 | 17 | *(active Lovable iteration — do not modify)* | — |
| `components/inventory/InventoryTab.tsx` | 968 | — | `InventoryFilterBar`, `InventoryRowGroup` | M |
| `pages/SemenOrderDetail.tsx` | 911 | 13 | `OrderPackHistory`, `AvailabilitySection` | S |
| `pages/BullList.tsx` | 873 | 16 | `BullFormModal`, `BullOfferingsEditor` | S |
| `components/operations/HubTab.tsx` | 819 | — | `BullAvailabilityTable`, `PendingOrdersList` | S |
| `pages/ReceiveShipmentPreview.tsx` | 812 | — | `ReconciliationSummary`, `ConfirmReceiveFlow` | S |
| `pages/Planning.tsx` | 807 | 10 | `PlanningFilterBar`, `PlanningExportButton` | S |
| `components/inventory/PackingTab.tsx` | 722 | — | Reduce duplication with PackDetail | S |
| `components/inventory/OrderShipmentReconciliation.tsx` | 718 | — | `EditLineDialog`, `MoveLineDialog` | S |
| `components/NewOrderDialog.tsx` | 715 | — | `BullLineEditor`, `SupplyLineEditor` | S |

**Priority:** The 5 mega-pages (PackDetail, PackTank, ReceiveShipment, TankDetail, CustomerDetail) all have 40+ `useState` calls and are >1,400 lines. Each warrants its own refactor session with a `useReducer` or custom hook extraction.

---

## B. `as any` Inventory

**Post-task-1.1 state:** All `(supabase as any).from(...)` and `(supabase.rpc as any)(...)` casts were removed. Remaining `as any` are data-shape casts on query results.

### Definitely Removable (data casts that match typed results)

These casts exist because `select("*")` returns an inferred type but callers cast to `any` instead of using the typed row:

| Location | Pattern | Fix |
|---|---|---|
| `BulkActionToolbar.tsx:146,156` | `(eRes.data ?? []) as any[]` | Type the map callback properly |
| `WeeklySummary.tsx` (21 casts) | `(data ?? []) as any[]` on each useQuery | Use `Tables<'table_name'>[]` as return type |
| `PackTank.tsx` (15 casts) | `(data ?? []) as any[]` on tank/line queries | Type local state variables |
| `ReceiveShipment.tsx` (11 casts) | `(data ?? []) as any[]` | Type shipment/order state |

### Probably Removable (join result casts)

Supabase TypeScript inference doesn't handle embedded joins (`select("*, relation(field)")`). These require explicit interface declarations or `Tables` utility types:

| Location | Pattern | Fix |
|---|---|---|
| `PackDetail.tsx` (17 casts) | `pack.tanks!` and line item shapes | Declare `PackWithLines` interface |
| `TankDetail.tsx` (29 `: any`) | Join results from inventory queries | Declare typed join interfaces |
| `PackingTab.tsx` (14 casts) | Line/pack display data | Share types with PackDetail |

### Genuinely Needed

| Location | Reason |
|---|---|
| `generateFullExport.ts` — `results.data as any[]` | PapaParse CSV output, not a Supabase type |
| `PackDetail.tsx` — `(doc as any).lastAutoTable` | jsPDF-autotable plugin has no bundled types |
| Catch blocks — `catch (err: any)` | Standard pattern until TS 5.x `useUnknownInCatchVariables` |

**Bottom line:** ~150 of the 178 remaining `as any` casts are removable once `strict: true` is enabled and typed interfaces are declared for joined query results.

---

## C. Mobile Responsiveness Audit

**Method:** Checked for responsive Tailwind classes (`sm:`, `md:`, `lg:`), `overflow-x-auto` wrappers on tables, fixed grid widths, and dialog `max-w` patterns.

**Legend:** ✅ Good | ⚠️ Needs Work | ❌ Broken on mobile

### Page-by-Page Scores

| Page | Score | Issues |
|---|---|---|
| **Navbar.tsx** | ✅ Good | Has distinct mobile panel with hamburger menu. Responsive classes present. |
| **OperationsDashboard** | ⚠️ Needs Work | Shell has 0 responsive classes. Tab overflow on small screens likely. Delegates to sub-tabs below. |
| **SemenOrderDetail.tsx** | ⚠️ Needs Work | Uses `grid-cols-12` fixed layout for bull/unit fields. No overflow wrapper on Order Items table. At 375px these columns collapse illegibly. |
| **TankDetail.tsx** | ⚠️ Needs Work | 0 responsive classes outside one overflow wrapper. Inventory table has 7+ columns at minimum ~420px — overflows on 375px screens without horizontal scroll. |
| **Planning.tsx** | ⚠️ Needs Work | Fixed `grid-cols-4` filter bar. Planning table has 8 columns (Bull, NAAB, Company, On Hand, Incoming, Orders, Needs, Net) — ~560px minimum, no overflow wrapper. |
| **CustomerDetail.tsx** | ⚠️ Needs Work | 5 overflow wrappers present (good). Fixed `grid-cols-4` stat row collapses at mobile. Only 1 responsive class — stat cards don't stack. |
| **PackTank.tsx** | ❌ Broken | 1 responsive class, 0 overflow wrappers. Multi-column source tank selector and line-item table not wrapped. Complex packing form is unusable on 375px. |
| **UnpackTank.tsx** | ⚠️ Needs Work | Fixed `grid-cols-3` for return line layout. Doesn't collapse to single column on mobile. |
| **FulfillOrderDialog.tsx** | ⚠️ Needs Work | Uses `grid-cols-12` for unit inputs per tank. Appears in a dialog — no full-screen on mobile. Touch targets for unit increment buttons appear <44px. |
| **NewOrderDialog.tsx** | ❌ Broken | 0 responsive classes, 0 overflow wrappers. Bull row editor uses fixed column widths. Dialog doesn't go full-width on small screens (`max-w-4xl` fixed). Unusable on phone. |

### Tables Without `overflow-x-auto` Wrappers

These tables render at minimum content width and will cause horizontal page scroll on phones:

- `BullList.tsx` — 5-column bulls table
- `Customers.tsx` — 7-column customers table  
- `Companies.tsx` — multi-column semen companies table
- `ProjectDetail.tsx` — bulls and events tables
- `SemenOrderDetail.tsx` — order items table
- `ReInventory.tsx` — inventory comparison table
- `TeamManagement.tsx` — members table

**Quickest fix:** Wrap each `<Table>` in `<div className="overflow-x-auto">`.

### Dialogs Needing Mobile Treatment

| Dialog | Issue |
|---|---|
| `NewOrderDialog.tsx` | `max-w-4xl` — 896px on desktop, but doesn't adapt on mobile. Should be `w-full sm:max-w-4xl`. |
| `FulfillOrderDialog.tsx` | Has one `sm:max-w` but inner grid uses fixed 12-col layout |
| `InvoiceOrderModal.tsx` | Fixed width, no full-screen on mobile |

---

## D. Duplicate Code Patterns

### Already Resolved in V1 (documented for reference)

- `formatTime12()` — was in 7 files, now only in `src/lib/formatting.ts` ✅
- `isNoTimeEvent()` — was in 6 files, now only in `src/lib/formatting.ts` ✅
- Fulfillment/billing/status color maps — were in 6 files, now only in `src/lib/constants.ts` ✅

### Still Present

**Shared query shapes (same `.from().select()` in 3+ places):**

| Pattern | Files | Fix |
|---|---|---|
| `supabase.from("tanks").select("id, tank_number, tank_name, location_status, nitrogen_status...")` | `PackTank.tsx`, `TankDetail.tsx`, `TanksTabContent.tsx`, `OrderShipmentReconciliation.tsx`, `TransferDialog.tsx` | Extract `useTankOptions(orgId)` hook |
| `supabase.from("customers").select("id, name")...order("name")` | `TransferDialog.tsx`, `Customers.tsx`, `PackTank.tsx`, `CustomerDetail.tsx` | Extract `useCustomerOptions(orgId)` hook |
| `supabase.from("bulls_catalog").select("id, bull_name, naab_code, company...")` | `BullList.tsx`, `NewProjectDialog.tsx`, `BullCombobox.tsx`, `PackTank.tsx` | Extract `useBullCatalog(orgId)` hook |

**Shared UI patterns:**

| Pattern | Files | Fix |
|---|---|---|
| Pack summary card (pack type badge + date + status + tank label) | `PackDetail.tsx`, `PackingTab.tsx`, `PackTank.tsx` | Shared `PackSummaryBadge` component |
| Semen line item row (bull name + code + canister + units) | `SemenOrderDetail.tsx`, `OrderShipmentReconciliation.tsx`, `FulfillOrderDialog.tsx` | Shared `SemenLineRow` component |
| "No data" empty state with icon | 15+ tables across all pages | Already consistent with `text-muted-foreground` but no shared `<EmptyState>` component |

**Shared business logic:**

| Pattern | Files | Fix |
|---|---|---|
| `line.units * line.unit_price` totaling | `NewOrderDialog.tsx`, `SemenOrderDetail.tsx`, `ProjectBilling.tsx` | Utility function |
| Tank label: `tank.tank_number + (tank.tank_name || "")` | 8+ files | Already in some files as `tankLabel()` — promote to `src/lib/formatting.ts` |

---

## E. Dead Code

### Unrouted Pages (confirmed by App.tsx grep)

| File | Lines | Status |
|---|---|---|
| `src/pages/Index.tsx` | 300 | Not routed. Superseded by `OperationsDashboard`. |
| `src/pages/BullReport.tsx` | 1,048 | Not routed via App.tsx. May be opened by `Planning.tsx` via navigation param — verify before deleting. |
| `src/pages/InventoryDashboard.tsx` | 1,112 | Not routed. Replaced by Operations tabs. |
| `src/pages/LandingPage.tsx` | ~100 | Not routed. Old marketing page. |

**Potential savings: ~2,560 lines of dead code.**

### Unused Custom Hooks

| File | Issue |
|---|---|
| `src/hooks/usePaginatedSupabaseQuery.ts` | Generic pagination hook — zero imports outside itself |
| `src/hooks/useSupabaseCount.ts` | Count helper — zero imports outside itself |

### Orphaned Components (never imported in routed code)

Many files under `src/components/bulls/`, `src/components/customer/`, and `src/components/project/` exist but are not imported. Verify each before deleting — some may be intentional stubs for future use:

| Component | Verdict |
|---|---|
| `components/bulls/BullDetailDialog.tsx` | Likely dead — `BullList.tsx` uses inline modal |
| `components/bulls/BullReportStats.tsx` | Likely dead — `BullReport.tsx` is itself unrouted |
| `components/customer/AddSemenDialog.tsx` | Verify — may be planned |
| `components/customer/AddTankDialog.tsx` | Verify |
| `components/customer/EditCustomerDialog.tsx` | Verify |
| `components/orders/DirectSaleDialog.tsx` | Verify — `FulfillOrderDialog` may cover this |
| `components/project/ContactHistoryCard.tsx` | Verify |
| `components/project/ProjectBullsCard.tsx` | Verify |
| `components/project/ProjectNotesCard.tsx` | Verify |
| `components/project/ProjectScheduleCard.tsx` | Verify |

### Unused shadcn/ui Primitives

The following `src/components/ui/` files from the shadcn/ui init are never imported in application code (safe to delete if not needed):
`accordion`, `aspect-ratio`, `avatar`, `carousel`, `chart`, `context-menu`, `drawer`, `hover-card`, `input-otp`, `menubar`, `navigation-menu`, `pagination`, `resizable`, `sidebar`

---

## F. Performance Concerns

### Queries Without `.limit()` on Potentially Large Tables

| Location | Table | Risk |
|---|---|---|
| `WeeklySummary.tsx` — all 9 queries | `project_billing`, `semen_orders`, `projects`, `tank_packs`, `tank_fills`, `shipments`, `inventory_transactions` | Returns all rows in date range — fine now, degrades at scale |
| `generateFullExport.ts:7,20,37,68,79` | 5 tables with `select("*")` | Export queries fetch entire tables — intentional but could time out |
| `SemenOrderDetail.tsx:168` | `order_supply_items` with `select("*")` | Small table, low risk |
| `Planning.tsx:143` | `view_bull_planning` — `select("*")` | View aggregation, may be slow at scale |

### Missing `useMemo` on Expensive Computations

| Location | Issue |
|---|---|
| `PackTank.tsx` — available units per bull calculation | Recalculates on every render; `useMemo([inventory, selectedLines])` needed |
| `TankDetail.tsx` — inventory grouping by canister | Recalculates on render; `useMemo([inventoryData])` needed |
| `Planning.tsx` — row sorting + filtering | Sorted + filtered every render; `useMemo([rows, filters])` needed |

### N+1 Query Patterns

| Location | Pattern | Fix |
|---|---|---|
| `BulkActionToolbar.tsx:67-69` | `for...of` loop calling `supabase.from("projects").update()` per project | Already has `bulk_delete_projects` RPC — needs equivalent bulk-update RPC or single `in()` filter |
| `BulkActionToolbar.tsx:82-86` | Same loop for last-contact update | Batch with single `.in("id", ids)` update |
| `PackDetail.tsx` — line editing | Sequential updates per line in some flows | Batch via RPC (already done for main pack ops) |

### `select("*")` on High-Traffic Detail Pages

**8 tracked with `// TODO: narrow select columns`:**

| File | Count | Table(s) |
|---|---|---|
| `CustomerDetail.tsx` | 4 | `tanks`, `tank_inventory`, `tank_movements`, `tank_fills` |
| `TankDetail.tsx` | 2 | `tank_inventory`, `inventory_transactions` |
| `ProjectDetail.tsx` | 1 | `project_bulls` join |
| `TanksTabContent.tsx` | 1 | `tank_inventory` |

---

## G. Risk Matrix — Top 20 Findings

| # | Finding | Effort (hrs) | Impact | Recommendation |
|---|---|---|---|---|
| 1 | **Mobile: `NewOrderDialog` unusable on phone** — 0 responsive classes, fixed `max-w-4xl` | 3 | High | Fix now — primary order-creation flow |
| 2 | **Mobile: `PackTank` broken on phone** — complex packing form, no responsive layout | 8 | High | Fix now — core daily operation |
| 3 | **Mobile: tables without `overflow-x-auto`** — 8 pages, page-wide horizontal scroll | 2 | High | Fix now — 1-line wrapper per table |
| 4 | **Dead pages: `InventoryDashboard.tsx`, `Index.tsx`, `LandingPage.tsx`** — 1,500+ dead LOC | 1 | Med | Fix now — delete after confirming unused |
| 5 | **`BulkActionToolbar` N+1 update loops** — sequential per-project updates | 2 | Med | Fix now — single `.in()` update call |
| 6 | **`usePaginatedSupabaseQuery` / `useSupabaseCount` orphan hooks** | 0.5 | Low | Fix now — delete |
| 7 | **`select("*")` on CustomerDetail (4x), TankDetail (2x)** | 4 | Med | Fix soon — detail pages load full rows |
| 8 | **`Planning.tsx` table — 8 columns, no overflow** | 1 | High | Fix now — planning is mobile-critical |
| 9 | **Remaining hand-rolled bull name chains** — `InventoryBullPicker`, `BreedingSection`, `BullsRowManager` | 2 | Low | Fix soon |
| 10 | **`key={index}` on 21 deletable/reorderable lists** | 3 | Med | Fix soon — audit each, add stable IDs |
| 11 | **PackDetail / PackTank / TankDetail mega-page decomp** | 24 | Med | Defer — break into sessions |
| 12 | **21 `as any` casts in `WeeklySummary.tsx`** — all removable with typed interfaces | 2 | Low | Fix soon |
| 13 | **`useTankOptions` / `useCustomerOptions` hooks** — 5+ duplicate tank queries | 4 | Low | Defer — nice to have |
| 14 | **9 `console.log` in `googleCalendar.ts`** | 0.5 | Low | Fix soon — debug leakage |
| 15 | **6 `console.*` in `ReceiveShipmentPreview.tsx`** | 0.5 | Low | Fix soon |
| 16 | **`htmlFor=` on only 9% of `<Label>` components** | 6 | Med | Defer — accessibility pass |
| 17 | **`aria-label` missing on icon-only buttons** | 4 | Med | Defer — accessibility pass |
| 18 | **PackTank / TankDetail `useMemo` on inventory calcs** | 2 | Low | Defer |
| 19 | **`BullReport.tsx` unrouted (1,048 lines)** — verify if reachable from Planning | 0.5 | Low | Verify then delete or route |
| 20 | **`tsconfig.json` `strict: false`** — enables `as any` and `: any` proliferation | 8+ | High | Defer — enabling strict requires fixing 400 annotations |

---

## Key Metrics (V2 vs V1)

| Metric | V1 (Apr 22) | V2 (May 3) | Change |
|---|---|---|---|
| `as any` casts (Supabase) | ~80 | 0 | ✅ -80 |
| `as any` casts (total) | ~260 | 178 | ✅ -82 |
| Missing RPCs/tables in types.ts | 10 | 0 | ✅ -10 |
| Dead pages | 7 | 4 | ✅ -3 |
| `getBullDisplayName` consumers | 1 | 26 | ✅ +25 |
| `select("*")` on high-traffic pages | 3 (Index/Customers/BullList) | 0 on those; 33 remain overall | ✅ |
| Files > 1,000 lines | 6 | 8 | ⚠️ +2 (new pages added) |
| Mobile broken pages | — | 2 confirmed (PackTank, NewOrderDialog) | New finding |
| console.* in production | ~10 | 33 | ⚠️ (new code added) |
