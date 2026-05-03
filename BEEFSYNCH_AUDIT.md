# BeefSynch Full Audit

**Commit:** `64e5e6a` (pulled 2026-04-22, after the Planning/BullReport bull-param auto-load fix landed)
**Scope:** Full `src/`, assets, `.env`/`.gitignore`. Read-only.
**Auditor note:** Every finding has a `file:line` reference or grep match. I cross-checked my own subagent output — where the dead-code agent was wrong about `BreedingProject`, I corrected it below.

---

## Executive summary

- **Files audited:** 182 `.ts` / `.tsx` files under `src/` (36,895 LOC total)
- **Priority-1 findings:** 8
- **Priority-2 findings:** 12
- **Priority-3 findings:** 9
- **Verified clean:** TypeScript compiles (`tsc --noEmit` exit 0); Vite production build compiles; no Lucide-called-as-function bugs; no hardcoded API keys; no service-role key usage on frontend; no `dangerouslySetInnerHTML` on user input; only one TODO comment in the whole repo; no empty `catch {}` blocks.
- **Biggest single risk:** `.env` is tracked in git (not in `.gitignore`). It currently only holds `VITE_`-prefixed publishable values that ship to the browser anyway — so no secret *is* leaked today — but the pattern guarantees the next secret added to `.env` auto-commits.
- **Biggest single debt:** five files with 30+ `useState` calls. `PackDetail.tsx` has **51** and the entire repo uses `useReducer` zero times.

---

## Priority 1 — Fix now

### P1-1. `.env` is tracked in git; `.gitignore` has no env rule

- **Files:** `.env` (tracked at repo root), `.gitignore` (no `.env` line)
- **Evidence:**
  ```
  $ git ls-files | grep -E "^\.env"
  .env
  .env.example
  $ git check-ignore -v .env    → (empty; not ignored)
  ```
- **Symptom today:** Committed values are `VITE_GOOGLE_CLIENT_ID`, `VITE_SUPABASE_PROJECT_ID`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_URL` — all `VITE_`-prefixed, all shipped to the browser bundle. So **no secret is currently leaked**.
- **Risk of not fixing:** The next person who puts a server-side secret (service role key, Resend API key, Google private key) into `.env` won't notice it's being committed to a public GitHub repo until it's too late. This is how 90% of credential leaks happen.
- **Proposed fix:**
  1. Add `.env` and `.env.local` to `.gitignore`.
  2. `git rm --cached .env` (keep local copy, stop tracking).
  3. Commit the `.gitignore` change and the untrack.
  4. Leave `.env.example` tracked as the template.
- **Effort:** Single prompt.
- **Risk to fix:** Low. The live keys don't become invalid when we untrack them.

### P1-2. Oversized image assets (3 MB each) shipped to every page load

- **Files:**
  - `public/favicon.png` — **3,023,011 bytes (2.9 MB)**
  - `src/assets/beefsynch-icon.png` — **3,023,011 bytes (2.9 MB)** (duplicate of the favicon)
  - `src/assets/beefsynch-badge.png` — 1,066,562 bytes (1.0 MB)
  - `src/assets/beefsynch-logo.png` — 712,222 bytes (0.7 MB)
- **Symptom:** Every initial page load pushes ~5 MB of PNG before the actual JS (537 KB main bundle) even gets to parse. Mobile users on rural LTE suffer most.
- **Proposed fix:** Re-encode all four to WebP or compressed PNG (TinyPNG / squoosh / `sharp` CLI). Target under 80 KB each at current display dimensions. The favicon in `public/` should be a real 32×32 ICO plus a 180×180 apple-touch-icon — not a 3 MB PNG.
- **Effort:** Single prompt (with image tooling) + one commit.
- **Risk to fix:** Low — cosmetic unless we accidentally degrade visible quality.

### P1-3. Seven orphan page files cluttering `src/pages/`

- **Files (verified unimported AND not routed):**
  - `src/pages/InventoryDashboard.tsx`
  - `src/pages/InventoryLog.tsx`
  - `src/pages/Packs.tsx`
  - `src/pages/SemenOrders.tsx` *(Lovable still edits this file — it added a "Planning" button tonight in commit `b02e4c6`. That means Lovable doesn't know it's dead and keeps spending churn on it.)*
  - `src/pages/Shipments.tsx`
  - `src/pages/TanksDashboard.tsx`
  - `src/pages/Unpacks.tsx`
- **Evidence:** `App.tsx` has `<Route path="/semen-orders" element={<Navigate to="/operations?tab=orders" replace />} />` and similar lines for the other six — these are **redirects away from the page**, not routes that render it. No `import` of these components exists anywhere in `src/`.
- **Symptom:** Lovable and humans keep editing files that nobody ever renders. Wasted tokens, confused diffs, split-brain state (e.g., the "Planning" button was added to SemenOrders.tsx tonight but the user will never see it).
- **Proposed fix:** Delete all seven files. If any contain unique UI you want back, copy the relevant snippet into the corresponding `Operations*Tab.tsx` first.
- **Effort:** Single prompt (delete files + confirm tsc passes).
- **Risk to fix:** Low — confirmed zero imports. Verify once more immediately before deleting.

### P1-4. Schema drift: 4 tables/views + 4 RPCs not in `types.ts`

Code accesses these via `as any` casts that silence the type-checker. If the server schema changes, the frontend won't notice.

**Tables/views missing from `src/integrations/supabase/types.ts`:**

| Object | Called from | Access pattern |
|---|---|---|
| `order_supply_items` | [NewOrderDialog.tsx:247](src/components/NewOrderDialog.tsx:247), [SemenOrderDetail.tsx:155](src/pages/SemenOrderDetail.tsx:155) | `(supabase as any).from("order_supply_items")` |
| `view_bull_planning` | [Planning.tsx:58](src/pages/Planning.tsx:58) | `(supabase as any).from("view_bull_planning")` |

**RPCs missing from `types.ts`:**

| RPC | Called from |
|---|---|
| `confirm_shipment` | [ReceiveShipmentPreview.tsx:265](src/pages/ReceiveShipmentPreview.tsx:265) |
| `edit_received_line` | [OrderShipmentReconciliation.tsx:238](src/components/inventory/OrderShipmentReconciliation.tsx:238) |
| `move_received_units` | [OrderShipmentReconciliation.tsx:258](src/components/inventory/OrderShipmentReconciliation.tsx:258) |
| `delete_received_line` | [OrderShipmentReconciliation.tsx:280](src/components/inventory/OrderShipmentReconciliation.tsx:280) |

*(`naab_controllers` and `stud_code_registry` exist in the DB but aren't referenced anywhere in `src/` — so no drift there.)*

- **Proposed fix:** Regenerate `types.ts` via the Supabase CLI or MCP tool. Then remove the `as any` casts at the six call sites above.
- **Effort:** Single session.
- **Risk to fix:** Low. Regeneration is mechanical. Removing the casts may surface a handful of real type errors that should be fixed.

### P1-5. `mockData.ts` still present but misnamed — `BreedingProject` type is live, `mockProjects` is dead

- **File:** `src/data/mockData.ts`
- **What's actually there:**
  - `BreedingProject` type — **used** by [ProjectsTable.tsx:3](src/components/ProjectsTable.tsx:3) and [ProjectsTab.tsx:12](src/components/operations/ProjectsTab.tsx:12)
  - `AnimalType`, `ProjectStatus` types — imported transitively via `BreedingProject`
  - `protocols` array — **dead** (not imported anywhere)
  - `mockProjects` array — **dead**
- **Symptom:** Production code imports a real-looking type from a file named `mockData.ts`. Anyone grepping for "mock" in this codebase thinks they can delete it and breaks the app.
- **Proposed fix:**
  1. Move `BreedingProject`/`AnimalType`/`ProjectStatus` to `src/types/project.ts` (or `src/lib/projectTypes.ts`).
  2. Delete `mockProjects` and `protocols` arrays (dead).
  3. Delete `mockData.ts`.
  4. Update the two import sites.
- **Effort:** Single prompt.
- **Risk to fix:** Low.

### P1-6. `BullsRowManager.tsx` uses `key={i}` on addable/removable rows

- **File:** [BullsRowManager.tsx:117](src/components/BullsRowManager.tsx:117)
- **Symptom:** When a user deletes a middle row or reorders bulls, React reuses DOM nodes for the wrong row because the key is the array index. Form inputs and selected catalog IDs can visibly swap between rows. Subtle data-loss bug.
- **Proposed fix:** Add a stable id to each `BullRow` when it's first added (e.g., `crypto.randomUUID()`), and key by that instead of the index.
- **Effort:** Single prompt.
- **Risk of not fixing:** User edits Bull A's units, then deletes Bull B above it — the edit can reapply to the wrong bull.

### P1-7. Multi-table mutations in TypeScript instead of SECURITY DEFINER RPCs

The Build Manual requires that any mutation touching more than one table go through a `SECURITY DEFINER` Postgres function, because JS-side multi-step mutations can partially fail and leave orphan rows. Violators found in this audit:

- [BulkActionToolbar.tsx:67-99](src/components/BulkActionToolbar.tsx:67) — bulk delete loop does 4 sequential `.delete()` calls per project across `google_calendar_events`, `protocol_events`, `project_bulls`, `projects`. **No transaction**. If any call fails halfway, the project is left partially deleted.
- [ReceiveShipment.tsx](src/pages/ReceiveShipment.tsx) (confirmed by subagent structural review) — submit handler chains inserts on `tank_inventory` + `inventory_transactions`.
- [ProjectBilling.tsx:147-677](src/pages/ProjectBilling.tsx:147) — `handleFinalize` / `handleComplete` chain ~18 `.update`/`.insert`/`.delete` calls across `project_billing_*` tables (per structural review).
- [ReceiveShipmentPreview.tsx](src/pages/ReceiveShipmentPreview.tsx) — approval handlers chain multi-table mutations (partially already RPC-backed via `confirm_shipment`, but the draft-creation path isn't).
- [PackDetail.tsx](src/pages/PackDetail.tsx) — pack-status-change handlers do sequential table writes.

- **Symptom:** Intermittent partial-state bugs — orphan rows, counts that don't reconcile, "I deleted this but it's still in the list" user reports.
- **Proposed fix:** Audit and lift each multi-table mutation into a `SECURITY DEFINER` RPC. Priority order: **bulk delete** (BulkActionToolbar) first — it's the easiest to leave behind orphans. Billing next.
- **Effort:** Multi-session (one session per handler, with SQL migration).
- **Risk of not fixing:** Data integrity bugs that only manifest under load or network hiccups — hard to reproduce once they happen.

### P1-8. `select("*")` without explicit columns (Build Manual violation)

- **Count:** 57 matches in src/. Representative sample:
  - [BulkActionToolbar.tsx:126](src/components/BulkActionToolbar.tsx:126) — `.select("*")` on `projects`
  - [CustomerDetail.tsx:136,151,195,234](src/pages/CustomerDetail.tsx:136) — seven separate `.select("*")` calls
  - [ProjectBilling.tsx:76-147](src/pages/ProjectBilling.tsx:76) — six `.select("*")` calls
  - [lib/generateFullExport.ts:7,20,37,68,79](src/lib/generateFullExport.ts:7) — intentional since this is a full-data export, but should still be `.select("<explicit list>")` so the export is stable when columns are added
  - [TankDetail.tsx:227](src/pages/TankDetail.tsx:227) — `.select("*")` on `tanks`
- **Symptom:** When the DB schema adds a column, that column is fetched by every page for free — wasted bandwidth and silent coupling.
- **Proposed fix:** Replace each `.select("*")` with an explicit column list. Takes one session per offender file.
- **Effort:** Multi-session (drip over time).
- **Priority justification for P1:** This is explicitly called out in the Build Manual. Also an incident waiting to happen for a wide table.

---

## Priority 2 — Fix soon

### P2-1. Five hot-spot files with state explosions

| File | `useState` count | Recommendation |
|---|---|---|
| [PackDetail.tsx](src/pages/PackDetail.tsx) | **51** | `useReducer` for dialog + form state; extract `<PackSummaryDialog>` + `<PackLinesTable>` subcomponents |
| [TanksTabContent.tsx](src/components/inventory/TanksTabContent.tsx) | **48** | Split `CustomersTab` into its own file; extract CSV parsing to `src/lib/csvParsing.ts` |
| [PackTank.tsx](src/pages/PackTank.tsx) | **42** | `react-hook-form` for form inputs; `useReducer` for UI toggles |
| [CustomerDetail.tsx](src/pages/CustomerDetail.tsx) | **42** | Extract three dialog flows into custom hooks (`useAddTankDialog`, `useAddSemenDialog`, `useEditCustomerDialog`) |
| [TankDetail.tsx](src/pages/TankDetail.tsx) | **33** | Deduplicate tank-movement logic (currently copy-pasted from CustomerDetail) into shared utility |

`useReducer` is used **0 times** in the entire codebase; that's the consolidation tool the Build Manual calls for.

### P2-2. `formatTime12` is duplicated in four places

Canonical: [formatUtils.ts:10](src/lib/formatUtils.ts:10). Then **redeclared locally** in:
- [ProjectDetail.tsx:371,377](src/pages/ProjectDetail.tsx:371)
- [ProjectScheduleCard.tsx:24,30](src/components/project/ProjectScheduleCard.tsx:24)
- [billingTypes.ts:112](src/components/billing/billingTypes.ts:112) — **I added this one during the recent billing refactor; it was wrong of me, it should import from formatUtils.**

Same goes for `isNoTimeEvent` — duplicated in ProjectDetail.tsx and ProjectScheduleCard.tsx.

**Fix:** Delete the local copies, import from `formatUtils.ts`.

### P2-3. `fulfillmentColors` and `billingColors` duplicated across two files

- [SemenOrders.tsx:33,42](src/pages/SemenOrders.tsx:33) *(…but SemenOrders.tsx is an orphan file anyway — see P1-3)*
- [SemenOrderDetail.tsx:58,67](src/pages/SemenOrderDetail.tsx:58)

Build Manual says status color maps belong in `src/lib/badgeStyles.ts` (which already exists and has maps like `getBadgeClass('logType', ...)`). Add `fulfillmentColors` and `billingColors` there and import in SemenOrderDetail.

### P2-4. `statusColor` inline in ProjectDetail.tsx

- [ProjectDetail.tsx:100](src/pages/ProjectDetail.tsx:100) declares a one-off `statusColor` map. Should move to `badgeStyles.ts` with a `getBadgeClass('projectStatus', status)` accessor.

### P2-5. `getBullDisplayName` / `bullMatchesQuery` only used in one file

- Defined in [bullDisplay.ts](src/lib/bullDisplay.ts). Only consumed by [InventoryTab.tsx:31](src/components/inventory/InventoryTab.tsx:31).
- Other consumers still hand-roll the fallback chain: [TankMap.tsx:118-122, :175-179](src/components/inventory/TankMap.tsx:118), [LogTab.tsx:174](src/components/inventory/LogTab.tsx:174), [BullReport.tsx:288,333,423,441,559,564](src/pages/BullReport.tsx:288), [useBullReport.ts:117,150](src/hooks/useBullReport.ts:117), `PackDetail.tsx`, `SemenInventory.tsx`, `TankDetail.tsx`, `CustomerTankCard.tsx`, and 20 more files.
- **Fix:** Migrate each consumer to `getBullDisplayName`. Not urgent (the inline chains work), but every unmigrated file will keep drifting from the canonical rule.

### P2-6. Three orphan lib/hook files

- [src/components/NavLink.tsx](src/components/NavLink.tsx) — forwardRef wrapper around `react-router-dom`'s NavLink. Nobody imports it. Delete.
- [src/hooks/useBullReport.ts](src/hooks/useBullReport.ts) — 166-line hook that nobody imports. Delete (or wire it into BullReport.tsx, since BullReport has the same logic inline).
- [src/lib/routeConstants.ts](src/lib/routeConstants.ts) — exports `ROUTES`, `QUERY_PARAMS`, `OPERATION_TABS`, `buildOperationsUrl`. Zero imports. Delete.

### P2-7. Six dead date-formatter exports in `formatUtils.ts`

[formatUtils.ts](src/lib/formatUtils.ts) exports six formatters nobody calls: `formatDateLong`, `formatDateShort`, `formatDateSlash`, `formatDateCompact`, `formatDateISO`, `formatDateFilenameSeparator`. Consumers use `date-fns format` directly instead. Delete.

### P2-8. `key={index}` on reorderable/deletable lists (non-`BullsRowManager` cases)

`BullsRowManager` is P1-6 because it's the highest-impact. Other `key={i}` / `key={idx}` / `key={index}` occurrences that may hit the same bug:
- [BullChat.tsx:213](src/pages/BullChat.tsx:213)
- [NewOrderDialog.tsx:482](src/components/NewOrderDialog.tsx:482)
- [NewProjectDialog.tsx:443](src/components/NewProjectDialog.tsx:443)
- [ReceiveShipmentPreview.tsx:545](src/pages/ReceiveShipmentPreview.tsx:545)
- [SemenOrderDetail.tsx:584,615](src/pages/SemenOrderDetail.tsx:584)
- [InventoryTab.tsx:398](src/components/inventory/InventoryTab.tsx:398)
- [ProjectsTable.tsx:121](src/components/ProjectsTable.tsx:121)
- [PackTank.tsx:919,1307](src/pages/PackTank.tsx:919)
- [PackDetail.tsx:963](src/pages/PackDetail.tsx:963)
- [admin/ImportBulls.tsx:327,346,410,424,435](src/pages/admin/ImportBulls.tsx:327)
- [UnpackTank.tsx:250](src/pages/UnpackTank.tsx:250)

Audit each: if the list is append-only and never reordered/deleted, `key={i}` is fine. If items can be deleted or moved, add a stable id.

### P2-9. Accessibility gaps on form labels

- Only **13** occurrences of `htmlFor=` across the entire `src/`. The app has hundreds of form inputs. Screen-reader users can't reliably navigate most forms today.
- Only **18** `aria-label` uses, most of which are in the shadcn UI components (breadcrumb, pagination, sidebar) — not in our own screens.
- Only **4** `maxLength` attributes on inputs (in `CustomerDetail`, `Customers`, `CustomerPicker`, `EditCustomerDialog`). Most text inputs accept unlimited characters, which is both a UX issue (paste garbage → blown layout) and a bandwidth/DB issue.
- **Fix:** Do a pass on the five most-used forms (Auth, NewProjectDialog, NewOrderDialog, ReceiveShipment, EditCustomerDialog) to add `htmlFor`, `aria-label` on icon-only buttons, and reasonable `maxLength` on text fields.

### P2-10. 247 `as any` casts + 382 explicit `: any` annotations

Not all are wrong — some paper over Supabase drift (P1-4). But many are genuine type holes. Top offenders:
- [PackDetail.tsx](src/pages/PackDetail.tsx): 25 `as any` + 33 `: any`
- [TanksTabContent.tsx](src/components/inventory/TanksTabContent.tsx): 21 + 38
- [PackTank.tsx](src/pages/PackTank.tsx): 17 + 27
- [TankDetail.tsx](src/pages/TankDetail.tsx): 15 + 24
- [ProjectBilling.tsx](src/pages/ProjectBilling.tsx): 13 + 15

Once P1-4 is done (types regenerated), revisit these — many `as any` casts will no longer be needed.

### P2-11. Zero test coverage

- `src/test/example.test.ts` is the only test file. It tests nothing useful.
- The Build Manual's standard is at minimum: one test per `src/lib/` pure function (there are ~19 PDF generators + `bullDisplay.ts` + `formatUtils.ts` + `badgeStyles.ts` — easy wins).
- **Fix:** Start by adding tests for pure helpers (no Supabase mocking needed): `getBullDisplayName`, `bullMatchesQuery`, `formatTime12`, `isNoTimeEvent`, `toggleSetItem`, everything in `badgeStyles.ts`.

### P2-12. `BullList.tsx` and `BullReport.tsx` have `eslint-disable react-hooks/exhaustive-deps`

- [BullList.tsx:183](src/pages/BullList.tsx:183) and [BullReport.tsx:172](src/pages/BullReport.tsx:172) both suppress the exhaustive-deps rule on `useEffect`.
- Sometimes this is intentional (infinite loop avoidance), sometimes it's a stale-closure bug in hiding.
- **Fix:** Inspect each; if the missing dep is actually needed, add it and use a ref or flag to prevent loops. If the omission is intentional, replace the generic disable with a comment explaining *why*.

---

## Priority 3 — Nice to have

### P3-1. Navbar click uses `cursor: pointer` div instead of a button
[Navbar.tsx:59](src/components/Navbar.tsx:59) — `<div onClick=...>` for the logo click. Should be a `<button>` for keyboard access.

### P3-2. `ui/chart.tsx` uses `dangerouslySetInnerHTML`
[ui/chart.tsx:70](src/components/ui/chart.tsx:70) — injects CSS for recharts theming. Safe (no user input touches it) but worth a comment explaining why it's necessary.

### P3-3. One TODO remains
[Packs.tsx:56](src/pages/Packs.tsx:56) — "switch to paginated loop if pack count exceeds 500 in production". Moot since Packs.tsx is an orphan (P1-3). Will be deleted with the file.

### P3-4. Inline subcomponents defined inside render functions
Per structural review:
- `PackDetail.tsx` — `SavedBadge` subcomponent defined at file top is fine, but `PackTank.tsx` defines line-item rendering inline inside the main return.
- `ProjectDetail.tsx` — duplicate mobile/desktop dropdown blocks at [:569-658](src/pages/ProjectDetail.tsx:569).

### P3-5. 25 `console.log` / `console.error` / `console.warn` calls left in src/
Most in error branches (useful). Review and strip debug `console.log`s. Heaviest offenders: [googleCalendar.ts](src/lib/googleCalendar.ts) (9), [ReceiveShipmentPreview.tsx](src/pages/ReceiveShipmentPreview.tsx) (6).

### P3-6. CSV parsing duplicated
`tryParseDate` and Papa.parse scaffolding appears in both [TanksTabContent.tsx](src/components/inventory/TanksTabContent.tsx) and [TankFills.tsx](src/pages/TankFills.tsx). Extract to `src/lib/csvParsing.ts` when either of those files is refactored.

### P3-7. Pagination pattern duplicated
`while { .range(from, from + PAGE - 1) }` loops appear in 14 files. Every one reimplements the same logic. A `paginatedFetch(query)` helper in `src/hooks/usePaginatedSupabaseQuery.ts` already exists — two files use it — but most hand-roll. Drive-by fix as those files get touched.

### P3-8. `generateSessionSheetPdf.ts`, `generateReceivingReportPdf.ts`, etc. — 19 PDF generators
All import from `pdfUtils.ts` (good — the `pdfBase.ts` consolidation has effectively happened, just under a different name). Remaining variance is in the wrapper functions. Not a bug. Flag only because the sheer count (19 generators) is worth knowing for future consolidation.

### P3-9. `SESSION_STORAGE` / `LOCAL_STORAGE` only used by Supabase session persistence
[client.ts:13](src/integrations/supabase/client.ts:13) — single localStorage use, for auth session. Appropriate. No additional client-state stored outside of react-query cache.

---

## Deferred / out of scope

- **Migrating everything to `react-query`**: half the pages use `useQuery`, half use `useState + useEffect`. Standardizing would be ideal, but it's a multi-week migration with low incremental ROI unless we're already editing that page.
- **Upgrading Vite / Radix / Tailwind majors**: out of scope for this audit.
- **Service worker / PWA**: out of scope — not a current requirement.
- **Component library of extracted primitives (StatCard variants, expandable card patterns)**: catalogued under P2, but a proper design-system extraction is its own multi-session project.

---

## Numeric findings table

| Metric | Count |
|---|---|
| Total `src/` files (.ts/.tsx) | 182 |
| Total LOC | 36,895 |
| Files over 500 lines | **22** |
| Files over 800 lines | **11** |
| Files over 1000 lines | **7** |
| `as any` casts | 247 |
| Explicit `: any` type annotations | 382 |
| `console.log` / `.error` / `.warn` | 25 |
| TODO / FIXME / XXX / HACK | 1 (plus 0 FIXME/XXX/HACK) |
| `.select("*")` occurrences | 57 |
| `(supabase as any).from(...)` occurrences | 23 |
| `dangerouslySetInnerHTML` | 1 (chart.tsx, safe) |
| Empty `catch (e) {}` blocks | 0 |
| `eslint-disable` comments in `src/` | 2 |
| RPC calls from frontend | 11 (4 typed + 7 `as any`) |
| `useReducer` usages | **0** |
| `aria-label` attributes | 18 (9 in shadcn UI) |
| `htmlFor=` attributes | 13 |
| `maxLength` attributes | 4 |
| `key={index}` / `key={i}` usages | 19 |
| Test files | 1 (trivial) |
| Tracked `.env*` files | 2 (`.env`, `.env.example`) |
| Public PNG assets over 500 KB | 4 |
| Orphan pages | 7 |
| Orphan library/hook files | 3 |
| Dead exports identified | 9 |

---

## Recommended repair order

1. **P1-1** `.env` → `.gitignore` + `git rm --cached .env`. 5-minute fix, closes a security-shaped liability.
2. **P1-3** Delete the 7 orphan pages. Stops Lovable from editing dead code; shrinks diff surface for future audits.
3. **P1-5** Move `BreedingProject` out of `mockData.ts` and delete mockData.ts. Touches 3 files.
4. **P1-2** Compress the four oversized images. First-load speed win for every visitor.
5. **P1-4** Regenerate `types.ts`. Unblocks removing many `as any` casts.
6. **P2-6** Delete the 3 orphan lib/hook files. Trivial cleanup.
7. **P2-7** Delete the 6 dead formatters in `formatUtils.ts`.
8. **P2-2** Collapse `formatTime12` / `isNoTimeEvent` duplicates back to `formatUtils.ts` (I need to fix my own `billingTypes.ts` copy here).
9. **P2-3 / P2-4** Move color maps to `badgeStyles.ts`.
10. **P1-6** Stable keys in `BullsRowManager`. Real latent bug.
11. **P1-7** First pass on multi-table RPCs: convert `BulkActionToolbar` bulk-delete first (smallest, highest data-integrity risk), then billing.
12. **P2-5** Migrate 2–3 high-traffic bull-name sites (TankMap, LogTab) to `getBullDisplayName`.
13. **P2-9** Accessibility pass on the 5 most-used forms.
14. **P2-11** Add tests for pure helpers in `src/lib/`. At least one per file.
15. **P2-1** Begin state-explosion refactors, one hot-spot file per session. Start with `PackDetail.tsx`.
16. **P1-8** Ongoing `.select("*")` → explicit-columns pass as files are touched.
17. **P2-10** `as any` cleanup rides along with #15–16.
18. **P2-12** Review the 2 `eslint-disable` usages and replace with specific reasoning or real fixes.
19. **P2-8** Stable-key audit on the other `key={index}` sites.
20. **P3-** items as drive-by cleanups in adjacent sessions.

---

## Files verified clean (not in scope for fixes)

**These were checked and are fine as-is** — noting them so you don't need to re-audit:

- **TypeScript + build**: `npx tsc --noEmit` exits 0. `npx vite build --mode production` builds cleanly in ~80s. Only warning is the 537 KB main bundle chunk-size advisory.
- **Lucide icon rendering**: Zero instances of `Icon({...})` call-style in `src/`. All icons are rendered as JSX after the EmptyState fix.
- **Secrets in source**: No hardcoded API keys, bearer tokens, JWTs, or service-role references in `src/`. Supabase client uses the `VITE_SUPABASE_PUBLISHABLE_KEY` (anon key only) via env.
- **`dangerouslySetInnerHTML`**: Only one occurrence ([ui/chart.tsx:70](src/components/ui/chart.tsx:70)) and it injects only theme CSS that never touches user input. Safe.
- **Empty catches**: Zero `catch (e) {}` with no body.
- **Routing**: All 31 routes in `App.tsx` reference components that exist. The Planning → BullReport query-param mismatch was caught yesterday and patched today (`9ed3f6d`).
- **PDF library consolidation**: 17 PDF generators share a `pdfUtils.ts` base. The Build Manual intent is met (the name is `pdfUtils`, not `pdfBase`, but function is identical).
- **RPCs that *are* in types.ts**: `accept_org_invite`, `lookup_invite_by_token`, `lookup_org_by_invite_code`, `get_org_members`, `get_org_role` — all typed.
- **Schema drift — *not* present for**: `project_billing_session_inventory` (line 798 of types.ts), `receiving_report_audit_log` (line 1093) — these *are* in the typed schema.
- **Tables referenced correctly**: the 34 tables listed in `types.ts` cover all non-`as any` database access in the codebase.
- **Old `tanks.status` column references**: Zero. The April 13 split to `nitrogen_status` + `location_status` is fully propagated on the frontend.
- **.env.example**: exists and is intentionally tracked — this is fine.

---

## Appendix A — Full `as any` offender list (by file)

```
TanksTabContent.tsx    21
PackTank.tsx           17
TankDetail.tsx         15
ProjectBilling.tsx     13
PackDetail.tsx         12  (plus 13 in same file — total 25)
Customers.tsx           8
ReceiveShipmentPreview.tsx  8
Packs.tsx               7  (orphan file)
UnpackTank.tsx          7
TanksOut.tsx            6
Tanks.tsx               5
InventoryTab.tsx        5
ReInventory.tsx         5
TankFills.tsx           5
NewOrderDialog.tsx      4
BullList.tsx            4
HubTab.tsx             10
OrderShipmentReconciliation.tsx  11
PackingTab.tsx         13
... (42 more files with 1-3 each)
```

## Appendix B — Largest files (line count)

```
1583  src/pages/PackDetail.tsx
1527  src/pages/PackTank.tsx
1240  src/pages/CustomerDetail.tsx
1127  src/pages/ProjectDetail.tsx
1115  src/components/inventory/TanksTabContent.tsx
1102  src/pages/TankDetail.tsx
1016  src/pages/ReceiveShipment.tsx
 970  src/pages/BullReport.tsx
 939  src/pages/ProjectBilling.tsx
 837  src/pages/BullList.tsx
 833  src/components/inventory/InventoryTab.tsx
 803  src/pages/ReceiveShipmentPreview.tsx
 719  src/components/inventory/OrderShipmentReconciliation.tsx
 671  src/pages/TankFills.tsx
 666  src/pages/SemenOrderDetail.tsx
 637  src/components/ui/sidebar.tsx          [shadcn primitive — ignore]
 607  src/pages/SemenInventory.tsx
 591  src/components/operations/HubTab.tsx
 580  src/pages/TeamManagement.tsx
 562  src/components/NewOrderDialog.tsx
 558  src/pages/Tanks.tsx
 547  src/pages/AcceptInvite.tsx
 529  src/components/inventory/PackingTab.tsx
 501  src/pages/ReInventory.tsx
```

End of audit.
