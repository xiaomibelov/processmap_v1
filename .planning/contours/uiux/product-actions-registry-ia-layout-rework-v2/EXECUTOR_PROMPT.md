# EXECUTOR_PROMPT — uiux/product-actions-registry-ia-layout-rework-v2

> **Role:** Agent 2 / Executor  
> **Contour:** `uiux/product-actions-registry-ia-layout-rework-v2`  
> **Run ID:** `20260514T194022Z-72528`  
> **Scope:** Frontend UI/UX information architecture rework for Product Actions Registry screen

---

## Pre-flight

1. Read:
   - `PLAN.md`
   - `RUNTIME_NAVIGATION.md`
   - `RUNTIME_PROOF_CHECKLIST.md`
   - `STATE.json`
2. Confirm current branch and status:
   ```bash
   cd /opt/processmap-test
   git status -sb
   git branch --show-current
   ```
3. Do NOT start if branch or status indicates unrelated changes.

---

## Primary target files

| # | Path | What to change |
|---|------|----------------|
| 1 | `frontend/src/components/process/analysis/ProductActionsRegistryPanel.jsx` | DOM order, copy, layout, component structure |
| 2 | `frontend/src/styles/tailwind.css` | CSS for new layout, toolbar, collapsible sources |
| 3 | `frontend/src/components/process/analysis/ProductActionsRegistryPanel.test.mjs` | Update test expectations |
| 4 | `frontend/src/components/process/analysis/ProductActionsRegistryPage.test.mjs` | Update test expectations |

---

## Task list

### Task 1. Remove/rephrase all technical/debug copy

In `ProductActionsRegistryPanel.jsx`:

**1.1 Workspace notice (line ~757)**
- Current: `Сводка строится без загрузки полных данных всех сессий на frontend.`
- Replace with: `Данные агрегируются на сервере — сессии не загружаются целиком.`
- Current small text: `Workspace будет выбран текущим контекстом приложения.`
- Replace with: `Выберите рабочее пространство.`

**1.2 Backend status strings (lines 283, 293, 303, 307, 318, 335)**
- `"Workspace будет выбран текущим контекстом приложения."` → `"Выберите рабочее пространство."`
- `"Выберите проект или откройте реестр из проекта."` → `"Выберите проект."`
- `"Откройте сессию или выберите проект для preview."` → `"Откройте сессию или выберите проект."`
- `"Загружаю read-only реестр…"` → `"Загружаем реестр…"`
- `"Backend-агрегация пока недоступна."` → `"Реестр временно недоступен. Попробуйте позже."`
- `"В выбранном scope пока нет сессий с действиями с продуктом."` → `"В выбранном источнике пока нет сессий с действиями с продуктом."`

**1.3 Project picker subcopy (line ~768)**
- Current: `Строки проекта загружаются сразу. Ручной выбор сессий оставлен как временный small-scope fallback.`
- Replace with: `Строки проекта загружаются сразу. При необходимости выберите сессии вручную.`

**1.4 Session section heading (line ~817)**
- Current: `Сессии workspace`
- Replace with: `Источники данных`

**1.5 Session section subcopy (line ~818)**
- Current: `Все сессии в выбранном scope, включая сессии без действий с продуктом.`
- Replace with: `Сессии, из которых собраны действия с продуктом.`

**1.6 Project status strings (lines 393, 396, 404, 410, 414, 440)**
- Replace "реестр workspace" with "реестр рабочего пространства".
- Replace any "preview" with "просмотр" or remove.

### Task 2. Restructure information hierarchy

**Required DOM order:**
1. Header (title + subtitle only)
2. Scope segmented control
3. Summary metrics
4. Registry toolbar (filters + actions)
5. Main registry table (with contextual empty state)
6. Collapsible source sessions section (secondary)
7. Bulk AI results (after source section or after table)

**Implementation:**
- Move `<section className="productActionsRegistrySummary">` to immediately AFTER scope selector.
- Remove export bar and "Вернуться" from header.
- Create new unified toolbar element that contains:
  - Filters (moved from current position)
  - Export CSV/XLSX buttons
  - AI button
  - AI selection count
  - Reset button
- Move `<section className="productActionsRegistryPreview">` to immediately AFTER toolbar.
- Move `productActionsRegistrySessions` section to AFTER registry table.
- Wrap session section in a collapsible container (see Task 4).

### Task 3. Create unified registry toolbar

New JSX structure (conceptual):
```jsx
<div className="productActionsRegistryToolbar">
  <div className="productActionsRegistryToolbarFilters">
    {/* 7 filter selects + completeness — compact */}
  </div>
  <div className="productActionsRegistryToolbarActions">
    <span className="productActionsRegistryToolbarAiLabel">
      Выбрано для AI: {selectedVisibleSessionIds.length} / {PRODUCT_ACTIONS_BULK_AI_SESSION_CAP}
    </span>
    <button disabled={!canRunBulkAi}>AI: предложить действия</button>
    <button disabled={!canExportRegistry}>CSV</button>
    <button disabled={!canExportRegistry}>XLSX</button>
    <button className="secondaryBtn" onClick={resetFilters}>Сбросить</button>
  </div>
</div>
```

Rules:
- One flex row with `justify-content: space-between`.
- Filter selects compact (`height: 28–32px`, `font-size: 12–13px`, `min-width: auto`).
- Action buttons small and secondary (AI button primary when enabled).
- Export disabled at 0 rows (`opacity: 0.5`, `cursor: not-allowed`).
- Remove old `productActionsRegistryExportBar` from header entirely.
- Remove export meta span from header.

### Task 4. Make source sessions secondary/collapsible

Wrap the entire `productActionsRegistrySessions` section in a collapsible block:
```jsx
<details className="productActionsRegistrySources" open={rows.length === 0}>
  <summary>Источники данных ({sessionRows.length})</summary>
  {/* existing session content */}
</details>
```

- Default open when `rows.length === 0`, closed when `rows.length > 0`.
- Remove grid column headers from `productActionsRegistrySessionSummaryTable` (AI / Процесс / Project / path / Действия / Статус / Открыть).
- Replace with compact list items: checkbox + session title + action count + date + open link.
- Reduce font size to small.
- Remove or subdue row hover effects.
- Max-height with overflow if > 6 items.
- Session selection helpers ("Выбрать все видимые" etc.) stay inside this section.
- **Move AI button OUT of this section** into registry toolbar.

### Task 5. Reposition AI button

- Move `runBulkAiSuggestions` button from session section to registry toolbar.
- State rules:
  - Disabled when `selectedVisibleSessionIds.length === 0`.
  - Label: "AI: предложить действия".
  - Selection count: "Выбрано для AI: N / 10" next to button.
- Remove redundant count span from session section.

### Task 6. Fix empty state for "sessions exist, no actions"

Update `UnifiedEmptyState` to detect:
```jsx
if (visibleSessionTotal > 0 && summary.rows === 0 && !activeFilterLabels.length) {
  title = `Действий с продуктом пока нет`;
  message = `Найдена ${pluralizeSessions(visibleSessionTotal)}, но действия с продуктом ещё не заполнены. Откройте сессию или запустите AI-предложение действий.`;
}
```

Implement simple Russian pluralization:
```js
function pluralizeSessions(n) {
  if (n % 10 === 1 && n % 100 !== 11) return `${n} сессия`;
  if ([2,3,4].includes(n % 10) && ![12,13,14].includes(n % 100)) return `${n} сессии`;
  return `${n} сессий`;
}
```

### Task 7. Handle "Вернуться" button

In `ProductActionsRegistryPanel.jsx`:
- When `page === true`, do NOT render the `onClose` / "Вернуться" button.
- When `page === false` (modal overlay), keep "Закрыть" as a button.

### Task 8. CSS adjustments

In `tailwind.css`, add/modify:

```css
.productActionsRegistryToolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 12px;
  border-top: 1px solid var(--analysis-border-soft);
  border-bottom: 1px solid var(--analysis-border-soft);
}
.productActionsRegistryToolbarFilters {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.productActionsRegistryToolbarActions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.productActionsRegistryToolbarActions button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.productActionsRegistrySources {
  margin-top: 16px;
  border: 1px solid var(--analysis-border-soft);
  border-radius: 8px;
  padding: 8px 12px;
}
.productActionsRegistrySources summary {
  cursor: pointer;
  font-weight: 600;
  padding: 4px 0;
}
```

Adjust existing styles:
- `.productActionsRegistryHeaderRight` — remove or hide when `page === true`.
- `.productActionsRegistryExportBar` — remove from header styles or mark deprecated.
- `.productActionsRegistrySessionSummaryTable` — reduce visual weight (no headers, smaller text).

### Task 9. Tests

Update `ProductActionsRegistryPanel.test.mjs`:
- Replace assertions for removed strings ("frontend", "workspace", "scope", "Сессии workspace").
- Add assertions for new strings ("Источники данных", "Данные агрегируются на сервере").
- Update DOM order assertions if tests check child index.

Update `ProductActionsRegistryPage.test.mjs`:
- Update copy assertions.

Run tests:
```bash
cd /opt/processmap-test/frontend
npm run build
node --test src/components/process/analysis/ProductActionsRegistryPanel.test.mjs
node --test src/components/process/analysis/ProductActionsRegistryPage.test.mjs
```

---

## Forbidden

- NO backend changes.
- NO schema/storage changes.
- NO Product Actions AI backend changes.
- NO AG-UI integration.
- NO RAG changes.
- NO BPMN XML mutation.
- NO durable truth mutation.
- NO `.env` changes.
- NO commit/push/PR/deploy.
- NO changes to `ProcessStage.jsx` routing logic.
- NO changes to `productActionsRegistryModel.js` data logic.
- NO broad redesign outside registry route.

---

## Validation

1. Build passes: `npm run build`
2. Tests pass: `node --test` for registry test files
3. No console errors when opening registry screen
4. No network errors
5. Light/dark readable
6. No horizontal scrollbar at 1280px+

---

## Output

After completion, write:
- `EXEC_REPORT.md` in contour directory
- `READY_FOR_REVIEW` marker file

EXEC_REPORT.md must include:
- Files changed
- Before/after UX summary
- Exact strings removed
- Validation commands/results
- Runtime URL
- No backend/no BPMN/no RAG/no AG-UI confirmation
