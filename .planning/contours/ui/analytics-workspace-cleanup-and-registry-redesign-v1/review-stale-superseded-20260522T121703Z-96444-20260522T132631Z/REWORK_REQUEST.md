# Rework Request — ui/analytics-workspace-cleanup-and-registry-redesign-v1

> **From:** Agent 4 / Reviewer  
> **To:** Agent 3 / Executor  
> **Run ID:** `20260522T121703Z-96444`  
> **Blocked at:** 2026-05-22T13:20:00Z

---

## Required Fixes

### Fix 1 — Loading skeleton stuck (Critical)

**File:** `frontend/src/components/process/analysis/ProductActionsRegistryPanel.jsx`

**Problem:** The fallback `useEffect` (legacy data loader) leaves `backendLoading` permanently `true` when the view-model effect wins the race. This causes `isLoading` to remain `true` and the `LoadingSkeleton` never dismisses, even though 152 items were successfully fetched from the GET endpoint.

**Repro:**
1. Open registry with workspace scope (`?surface=product-actions-registry&scope=workspace`).
2. Observe that `GET /api/analysis/product-actions/registry` returns 200 with `view_model.items` (152 rows).
3. Observe that the skeleton bars remain visible indefinitely and the `DataTable` never renders.

**Suggested fix:**
At the beginning of the fallback `useEffect`'s `loadBackendRegistry` function, before the early return:

```js
async function loadBackendRegistry() {
  if (registryViewModel && !registryViewModelError) {
    setBackendLoading(false); // <-- add this
    return;
  }
  ...
}
```

Or, alternatively, unify the loading state so that `isLoading` is driven only by the active effect.

**Verification:** After fix, reload the registry page. The skeleton should dismiss within ~2 seconds and the `DataTable` should render with rows.

---

### Fix 2 — Dark mode filter select chevron tiling (High)

**File:** `frontend/src/styles/tailwind.css`

**Problem:** `.dark .registryFilterSelect` uses `background: #1F2937` shorthand, which resets `background-repeat` to `repeat` and `background-position` to `0 0`, causing the custom SVG arrow to tile across the select.

**Suggested fix:**
Replace:

```css
.dark .registryFilterSelect {
  background: #1F2937;
  color: var(--registry-text-primary);
  background-image: url("...");
}
```

With:

```css
.dark .registryFilterSelect {
  background-color: #1F2937;
  color: var(--registry-text-primary);
  background-image: url("...");
  background-repeat: no-repeat;
  background-position: right 8px center;
}
```

**Verification:** In dark mode, filter selects should show a single down-arrow on the right side, not a row of repeated chevrons.

---

## Unblock Checklist

- [ ] Fix 1 applied and verified in browser/runtime.
- [ ] Fix 2 applied and verified in browser/runtime (dark mode).
- [ ] `npm run build` passes with zero errors.
- [ ] Tests pass (`node --test ProductActionsRegistryPanel.test.mjs ProductActionsRegistryPage.test.mjs`).
- [ ] `READY_FOR_REVIEW` marker refreshed.
- [ ] `EXEC_REPORT.md` updated with fix summary.
