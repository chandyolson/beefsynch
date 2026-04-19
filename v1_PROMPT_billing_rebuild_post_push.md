# BILLING REBUILD — Post-Push Lovable Prompt

## Paste this AFTER Claude pushes the billing rebuild to GitHub

---

**File:** `src/pages/ProjectBilling.tsx`

**What happened:** The billing page was rebuilt from a single 2,079-line file into four files:
- `src/components/billing/billingTypes.ts` (122 lines) — shared types, constants, helpers
- `src/components/billing/SessionsTab.tsx` (344 lines) — collapsible session cards with inline products and semen tracking
- `src/components/billing/BillingTab.tsx` (273 lines) — billing summary, semen table, totals, invoice numbers, notes
- `src/pages/ProjectBilling.tsx` (640 lines) — thin orchestrator with data loading, save functions, header, pack bar, tabs

**What to do:** Pull the latest changes from GitHub. The new files are already committed. Then paste this prompt:

---

### Lovable Prompt (paste this):

```
The billing page (src/pages/ProjectBilling.tsx) has been restructured via a direct GitHub push. Three new files were added:

1. src/components/billing/billingTypes.ts — shared types and helpers
2. src/components/billing/SessionsTab.tsx — sessions tab component
3. src/components/billing/BillingTab.tsx — billing tab component

ProjectBilling.tsx now imports and uses these components.

Please do the following:

1. Run a type check to make sure everything compiles cleanly. If there are any type errors from the new files, fix them — the intent of each file is clear from the code.

2. If any import paths don't resolve, check that the billing/ directory exists under src/components/ with the three files listed above.

3. Do NOT modify any business logic, data loading, or save functions. Only fix compilation issues if any exist.

4. Do NOT regenerate types.ts — the current version is correct.

5. Do NOT touch any other pages or components.

Verification after deploy:
- Navigate to any project → Billing page
- Sessions tab should show collapsible session cards
- Billing tab should show the billing summary with products, semen table, totals
- Both tabs should render the same data (products entered on sessions appear on billing tab)
- Status dropdown, pack bar, and print button should work as before
```
