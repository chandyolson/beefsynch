# BeefSynch Diagnosis Report

**Date:** 2026-04-21
**Repo commit:** `e3ee099` (`Disabled confirm during submit`, pulled fresh from `origin/main`)
**Scope:** Tonight's three deploys — Planning page, `bullDisplay` helper, Confirm button fix — plus everything that landed alongside them in the last 48h.

---

## TL;DR

- **One confirmed blocker**: the Planning → Bull Report link silently renders a blank page. Root cause is a navigation contract mismatch between `Planning.tsx` and `BullReport.tsx`. This is the symptom the user explicitly called out.
- **No TypeScript errors.** `npx tsc --noEmit` exits clean. `npx vite build --mode development` builds successfully (only chunk-size warnings).
- **No Lucide-icon-called-as-function bugs** (the common render-time crash pattern). No missing imports. No stale re-export paths.
- The broader "Something went wrong on most pages" complaint is **not explainable from source alone**. See [Unresolved](#unresolved) — this likely needs a browser-side stack trace to pin down.

---

## Blocker issues

### 1. Planning → Bull Report renders blank (confirmed bug, matches reported symptom)

- **What's broken (user-facing):** On `/planning`, clicking a bull row navigates to the Bull Report page, but the page shows no results — just the "Set your filters and click Generate Report" empty state. The bull the user clicked has no effect on what is shown.
- **Files involved:**
  - [src/pages/Planning.tsx:180,184](src/pages/Planning.tsx:180)
  - [src/pages/BullReport.tsx](src/pages/BullReport.tsx) (the full file — it has no path param or query param reader anywhere)
  - [src/App.tsx:107](src/App.tsx:107)
- **Root cause (one sentence):** `Planning.tsx` navigates to `/bull-report?bull=${r.bull_catalog_id}`, but `BullReport.tsx` never calls `useSearchParams` and never auto-sets `hasRun`, so the `bull` query param is dropped on the floor and the page sits in its initial empty state.
- **Evidence:**
  - `Planning.tsx:180` — `onClick={() => navigate(\`/bull-report?bull=${r.bull_catalog_id}\`)}`
  - `App.tsx:107` — `<Route path="/bull-report" element={...} />` (no `:id`, so a query param is the only way to pass a bull in)
  - Grep for `useSearchParams` or `searchParams.get('bull')` inside `src/pages/BullReport.tsx` returns **zero matches**.
  - Both queries in `BullReport.tsx` (`bull_report_projects`, `bull_report_orders`) are gated on `enabled: hasRun && ...` and `hasRun` is initialized to `false` and only flipped by the "Generate Report" button.
  - So on arrival: no queries fire, filters are untouched, page renders the "Set your filters and click Generate Report" block at `BullReport.tsx:900-906`.
- **Proposed fix (concrete):** In `BullReport.tsx`, on mount, read `?bull=` from the URL, look up the catalog row to get the bull's display name, pre-fill `search` / `appliedSearch` with that name (or the catalog id), and set `hasRun=true` so the report auto-runs. Something like:
  ```ts
  const [searchParams] = useSearchParams();
  const bullParam = searchParams.get("bull");
  useEffect(() => {
    if (!bullParam) return;
    // either set search to the bull_name resolved from bulls_catalog,
    // or add a bull_catalog_id filter to the queryKey and filter there
    setAppliedSearch(bullParam);
    setSearch(bullParam);
    setHasRun(true);
  }, [bullParam]);
  ```
  Note: the current `appliedSearch` filter in `BullReport.tsx:296,341` matches on `bullName.toLowerCase().includes(q)`, which will NOT match a UUID. The fix therefore needs to either (a) resolve `bull_catalog_id` → `bull_name` first, or (b) add a new filter path that matches `bull_catalog_id` directly in the group reducers. Option (b) is cleaner.
- **Risk level:** Needs human review — there's a design choice here (what does "Bull Report for bull X" mean? Just filtered rows? Date range still applied? Filters locked?). Not a safe blind auto-fix.

---

## Warning issues

### W1. `view_bull_planning` is queried via `supabase as any`

- **File:** [src/pages/Planning.tsx:57-59](src/pages/Planning.tsx:57)
- **Concern:** The view is cast through `as any` to sidestep the generated types. If the view doesn't exist server-side (or returns a different shape than the `PlanningRow` interface expects), the page silently renders "No active demand or incoming supply." with no error surfaced.
- **Error handling today:** On error, `setRows([])` and `console.error` — user sees an empty state, not a crash.
- **Why a warning not blocker:** This only bites if the Supabase view is missing. The user said backend is known-good, so this is likely fine — but it's invisible if it does break.
- **Proposed:** After we confirm the view exists, regenerate `src/integrations/supabase/types.ts` so we don't need the `as any` cast here.
- **Risk level:** Low. Not actively broken.

### W2. `TankMap.tsx` duplicates bull-name fallback logic instead of using `bullDisplay`

- **Files:** [src/components/inventory/TankMap.tsx:118-122, :175-179](src/components/inventory/TankMap.tsx:118)
- **Concern:** `bullDisplay.ts`'s own docstring says "Use this EVERYWHERE a bull name appears in the UI." TankMap hand-rolls the same chain in two places. Not a bug today, but means the next time the rule changes (e.g., trim whitespace, add a new fallback), TankMap will drift.
- **Proposed:** Swap the two inline chains for `getBullDisplayName(r)`.
- **Risk level:** Safe to auto-fix (pure refactor, identical semantics).

### W3. Global `ErrorBoundary` at the top level hides which page actually crashed

- **File:** [src/components/ErrorBoundary.tsx](src/components/ErrorBoundary.tsx), wrapping the entire `Routes` in [src/App.tsx:86-142](src/App.tsx:86)
- **Concern:** There's only one `ErrorBoundary`, at the top of the tree. If any route crashes once, the boundary state stays `hasError=true` until the user clicks "Try Again" (which re-renders the same broken tree and crashes again) or reloads. That turns "one page crashed once" into "every page is broken" from the user's perspective — which may be what's driving the "most pages" report.
- **Proposed:** (a) confirm this is in fact what happened (see [Unresolved](#unresolved)); (b) consider adding per-route error boundaries so a crash in `Planning` doesn't nuke navigation to other pages. Also consider logging `error.message` + `error.stack` to the `toast` or a dev-mode overlay so the user can read it without DevTools.
- **Risk level:** Needs design decision — don't blind-fix.

### W4. BullReport's `useEffect` dependency on `hasRun` pattern is easy to race

- **File:** [src/pages/BullReport.tsx:214,240](src/pages/BullReport.tsx:214)
- **Concern:** `enabled: hasRun && appliedSource !== "orders"` — fine, but once fixed for W1 so that `hasRun` flips from a URL param, make sure the query key includes whatever filter the bull param sets, otherwise the first query can run against the wrong `appliedSearch`.
- **Risk level:** Only relevant once blocker #1 is being fixed.

---

## Clean checks (verified OK)

- **TypeScript:** `npx tsc --noEmit` exits 0 with no output. Captured output is zero bytes.
- **Vite dev build:** `npx vite build --mode development` builds cleanly in ~1m21s. Only warnings are chunk-size warnings (`index-D9OtHZiN.js` is 537 kB — cosmetic, not a crash source).
- **Lucide icon usage:** `grep -rnE "\b(Archive|Search|Plus|...)\(\{" src/` returns no matches. No icons called as functions (the forwardRef-bug pattern we fought with in the EmptyState session).
- **`@/lib/bullDisplay` imports:** One consumer so far — [src/components/inventory/InventoryTab.tsx:31](src/components/inventory/InventoryTab.tsx:31). Import path and casing correct. Both named exports exist in the file.
- **`bullDisplay.ts` shape:** File exists, exports `BullNameSource` interface, `getBullDisplayName`, and `bullMatchesQuery` — matches the prompt's expected shape exactly.
- **`Planning.tsx` shape:** File exists. Imports `{ supabase }` from `@/integrations/supabase/client`. Queries `.from("view_bull_planning")`. All Lucide icons (`ArrowLeft`, `Search`, `AlertTriangle`, `Clock`, `CheckCircle2`, `ChevronDown`, `ChevronRight`, `CalendarClock`) imported correctly.
- **Routes registered:** `/planning` at [App.tsx:125](src/App.tsx:125), `/bull-report` at [App.tsx:107](src/App.tsx:107). `Planning` is lazy-imported at [App.tsx:45](src/App.tsx:45). No stale imports.
- **Confirm-button fix on `ReceiveShipmentPreview.tsx`:** Diff is minimal and clean — early-return guard when `confirming` is already true, `setConfirming(false)` on both error paths, stays `true` on success (intentional — navigating away). Button disabled prop and "Confirming…" label correctly wired at [ReceiveShipmentPreview.tsx:705-717](src/pages/ReceiveShipmentPreview.tsx:705).
- **`BullsRowManager.tsx` extension:** New `showInventory` + `orgId` props are opt-in. `useQuery` is gated on `enabled: showInventory && !!orgId`. The `getOnHand` helper returns `null` when the index hasn't loaded, and the badge only renders when `hasSelection && onHand !== null`. Well-guarded.
- **`NewProjectDialog` / `NewOrderDialog`:** Only change is adding `showInventory={true}` + `orgId={...}` to `<BullsRowManager/>`. Props correctly typed.
- **`OrdersTab.tsx`, `ProjectsTab.tsx`, `SemenOrders.tsx`:** Only change is adding a "Planning" button that navigates to `/planning`. Imports all correct.

---

## Unresolved

The user said "Something went wrong on **most** pages." I cannot reproduce that from the source. Specifically:

- `tsc` and `vite build` are both clean — the bundle compiles fine.
- No shared code (Navbar, OperationsDashboard, useOrgRole, ProtectedRoute) was touched in the last 48h — a sudden breakage there isn't visible in git.
- The Planning → BullReport bug does **not** throw — it renders blank. It would not trigger the `ErrorBoundary`'s "Something went wrong" screen.

Two hypotheses I cannot confirm from code:

1. **Stale Vercel deploy / browser cache** — Lovable pushed ~40 commits tonight. If the user is on an older HTML shell fetching a newer JS bundle (or vice versa), the mismatch would throw on load. Diagnose by: hard-reload (Ctrl+Shift+R), check Vercel deploy status, confirm deployed commit matches `e3ee099`.
2. **A real runtime crash on a page I haven't identified** — driven by specific data shape (e.g., a `tank_inventory` row with a non-string field). This would only surface when that page renders.

**What to get from the user to close this out:**

> Open DevTools (F12) → Console tab → reload the broken page → copy the red error text (including the stack trace). In dev builds, the `ErrorBoundary` also prints the error message in the UI itself (see [ErrorBoundary.tsx:69-75](src/components/ErrorBoundary.tsx:69)) — screenshot that.

Without that, I can't point to a line.

---

## Raw output appendix

### `npx tsc --noEmit`

```
(zero output, EXIT=0)
```

### `npx vite build --mode development`

```
✓ built in 1m 21s
(only chunk-size warnings — see index-D9OtHZiN.js at 537 kB)
```

### `git log --since="48 hours ago" --oneline` (tonight's deploys)

```
e3ee099 Disabled confirm during submit
21d790c Changes
df3bf3a Changes
309878d Fixed bull names in inventory
2092a5f Changes
7ee3696 Changes
49a0512 Added Planning page & routes
b02e4c6 Changes
f4e908c Changes  (← 480-line Planning.tsx added here)
5a2c3b3 Aligned tank map bull names
... 30+ more "Changes" commits from gpt-engineer-app[bot]
```

### Key grep results

```
# "Icon({" pattern (Lucide-as-function bug)
(no matches)

# bullDisplay importers
src/components/inventory/InventoryTab.tsx:31

# useSearchParams / searchParams.get('bull') inside BullReport.tsx
(no matches — this is the blocker)

# view_bull_planning
src/pages/Planning.tsx:58

# custom_bull_name (36 files still reference directly — only InventoryTab migrated to helper)
```

### Key excerpt — the mismatch

```tsx
// src/pages/Planning.tsx:180
onClick={() => navigate(`/bull-report?bull=${r.bull_catalog_id}`)}

// src/App.tsx:107
<Route path="/bull-report" element={<ProtectedRoute><BullReport /></ProtectedRoute>} />

// src/pages/BullReport.tsx — entire file, no useSearchParams, hasRun defaults to false
const [hasRun, setHasRun] = useState(false);  // line 135
// ...
enabled: hasRun && appliedSource !== "orders",  // line 214
// ...
{!hasRun && (  // line 900
  <div className="py-20 text-center text-muted-foreground">
    <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-30" />
    <p className="text-lg font-medium">Set your filters and click Generate Report</p>
  </div>
)}
```

---

## Recommended repair order

1. **Get the ErrorBoundary error text from the user for "most pages are broken."** This is cheap and could immediately reveal a separate runtime bug that's not visible in source. Skip straight to step 2 if the user confirms it was a cache/deploy hiccup that a hard reload fixed.
2. **Fix Blocker #1 (Planning → BullReport).** Requires a small product call: when you land on `/bull-report?bull=<id>`, do you want the report auto-run with just that bull, or locked to that bull plus date filters? My recommendation: resolve the bull_catalog_id to bull_name on mount, pre-fill `search`/`appliedSearch` with it, set `hasRun=true`. Preserves the existing filter UX.
3. **W2: swap TankMap's inline fallback chains for `getBullDisplayName`.** Safe, pure refactor. Can be bundled with #2 or done standalone.
4. **W1: regenerate `supabase/types.ts`** to include `view_bull_planning` so we drop the `as any`. Do this after #2 so the Planning filter wiring is stable first.
5. **W3: per-route error boundaries.** Design decision — defer unless the user confirms ErrorBoundary-sticky-state is a real UX problem.

End of report.
