# REWORK_REQUEST — uiux/product-actions-registry-workspace-ux-redesign-v1

## For Agent 2 / Executor

Fix all items below. Do NOT fix silently — document each change in `EXEC_REPORT.md` under **Rework Round 1**.
Target file: `frontend/src/components/process/analysis/ProductActionsRegistryPanel.jsx` (primary). CSS adjustments go to `frontend/src/styles/tailwind.css`.

---

## Item 1. Remove or rephrase all technical/debug copy

### 1.1 Workspace notice (`productActionsRegistryWorkspaceNotice`)
**Current (line ~758):**
```
Сводка строится без загрузки полных данных всех сессий на frontend.
```
**Replace with:**
```
Данные агрегируются на сервере — сессии не загружаются целиком.
```

### 1.2 Backend status strings (lines 283, 293, 303, 307, 318)
**Current:**
- `"Workspace будет выбран текущим контекстом приложения."`
- `"Выберите проект или откройте реестр из проекта."`
- `"Откройте сессию или выберите проект для preview."`
- `"Загружаю read-only реестр…"`
- `"Backend-агрегация пока недоступна."`

**Replace with user-facing copy:**
- `"Выберите рабочее пространство."`
- `"Выберите проект."`
- `"Откройте сессию или выберите проект."`
- `"Загружаем реестр…"`
- `"Реестр временно недоступен. Попробуйте позже."`

### 1.3 Section heading (line ~817)
**Current:** `Сессии workspace`
**Replace with:** `Источники данных`

### 1.4 Subcopy under heading (line ~818)
**Current:** `Все сессии в выбранном scope, включая сессии без действий с продуктом.`
**Replace with:** `Сессии, из которых собраны действия с продуктом.`

---

## Item 2. Restructure information hierarchy — registry must dominate

The registry table (`productActionsRegistryPreview`) is the primary object. The session/source list is secondary context.

**Current DOM order (simplified):**
1. header (export + back)
2. scope selector
3. workspace notice / project picker / **session list (LARGE)**
4. bulk AI results
5. metrics
6. filters
7. registry table / empty state

**Required DOM order:**
1. header (title + minimal subtitle only)
2. scope selector
3. **summary metrics**
4. **registry toolbar** (filters + search + AI button + export)
5. **registry table**
6. contextual empty state (inside table area when rows === 0)
7. **collapsible source section** (compact, secondary)

**Implementation:**
- Move `<section className="productActionsRegistrySummary">` (lines 1020–1026) to immediately AFTER the scope selector.
- Move `<section className="productActionsRegistryFilters">` (lines 1028–1057) to become the FIRST element of a new unified toolbar.
- Move `<section className="productActionsRegistryPreview">` (lines 1066–1114) to immediately AFTER the toolbar.
- Move the session list section (`productActionsRegistrySessions`, lines 813–938) to AFTER the registry table, OR render it as a collapsible `<details>` / accordion block.
- Keep `productActionsRegistryProjectPicker` (project scope session chooser, lines 763–810) inside the collapsible source section.
- Keep `bulkAiResults` section (lines 941–1018) immediately after the registry table or inside the source section.

---

## Item 3. Session/source section must be compact, not a full table

### 3.1 Visual reduction
The session summary table (`productActionsRegistrySessionSummaryTable`, lines 861–936) must NOT use the same visual weight as the registry table.

**Required changes:**
- Remove grid column headers ("AI / Процесс / Project / path / Действия / Статус / Открыть").
- Replace with a compact list item: checkbox + session title + action count + date + open link.
- Reduce font size to `--font-size-sm` or smaller.
- Remove row hover effects or make them very subtle (`background: transparent` → `background: rgba(255,255,255,0.02)`).
- Max-height with `overflow-y: auto` if more than 6 items.

### 3.2 Collapsible wrapper
Wrap the entire `productActionsRegistrySessions` section in a collapsible container:
```jsx
<details className="productActionsRegistrySources">
  <summary>Источники данных ({sessionRows.length})</summary>
  {/* session list content */}
</details>
```
Default state: **collapsed** when `rows.length > 0` (registry has data). **Expanded** when `rows.length === 0` (so user can select sources).

---

## Item 4. AI button belongs in registry toolbar

### 4.1 Move the button
**Current location:** inside `productActionsRegistrySessions` section (lines 846–853).
**New location:** inside the unified registry toolbar, to the right of the filters.

### 4.2 State rules
- **Disabled when** `selectedVisibleSessionIds.length === 0`.
- **Tooltip/label when disabled:** "Выберите сессии в разделе «Источники данных»".
- **Label when enabled:** "AI: предложить действия".
- Remove the redundant "Выбрано для AI: N / 10" span from the session list; keep it ONLY in the toolbar next to the AI button.

### 4.3 Session selection helpers
The three helper buttons ("Выбрать все видимые", "Только без действий", "Только неполные") stay inside the collapsible source section, NOT in the main toolbar.

---

## Item 5. Fix empty state for "1 session, 0 actions" scenario

### 5.1 Context-aware copy
Update `UnifiedEmptyState` (lines 176–214) to detect the "sessions exist but no actions" state.

**New condition:**
```jsx
if (visibleSessionTotal > 0 && summary.rows === 0 && !activeFilterLabels.length) {
  title = `Найдена ${visibleSessionTotal} сессия, но действий с продуктом пока нет.`;
  message = "Откройте сессию или запустите AI-предложение действий.";
}
```
(Use proper Russian pluralization: "Найдена 1 сессия", "Найдено 2 сессии", "Найдено 5 сессий".)

### 5.2 Preserve existing states
Keep existing states for: loading, active filters, no workspace, no project, no session selected.

---

## Item 6. Filters must be part of unified registry toolbar

### 6.1 Structural change
Merge filters into a single horizontal toolbar that sits directly above the registry table.

**Required toolbar structure (new JSX):**
```jsx
<div className="productActionsRegistryToolbar">
  <div className="productActionsRegistryToolbarFilters">
    {/* filter selects — compact, min-width auto */}
  </div>
  <div className="productActionsRegistryToolbarActions">
    <button disabled={selectedVisibleSessionIds.length === 0}>AI: предложить действия</button>
    <button disabled={!canExportRegistry}>CSV</button>
    <button disabled={!canExportRegistry}>XLSX</button>
    <button onClick={resetFilters}>Сбросить</button>
  </div>
</div>
```

### 6.2 Visual rules
- Toolbar is ONE bordered container or one flex row with a subtle top/bottom border.
- Filter selects are compact (`height: 28–32px`, `font-size: 12–13px`).
- Action buttons are small and secondary (except AI button which is primary when enabled).
- "Сбросить" is the right-most item and uses `secondaryBtn`.

---

## Item 7. Export controls — secondary, disabled at 0 rows

### 7.1 Move export from header
Remove the entire `productActionsRegistryExportBar` (lines 687–710) from the header.

### 7.2 Place in toolbar
Place CSV and XLSX buttons in the unified registry toolbar (see Item 6).

### 7.3 Disabled state
`disabled={!canExportRegistry}` is already implemented — keep it. When disabled, buttons should have `opacity: 0.5` or `cursor: not-allowed` (verify in CSS).

### 7.4 Remove export meta from header
The span "Экспорт: N строк · полных: N · неполных: N" should be removed from the header. The footer already shows "После фильтров: N строк · полных: N · неполных: N". Consolidate to ONE location: keep the footer, remove the header meta.

---

## Item 8. "Вернуться" must be secondary/passive

### 8.1 On registry page route
When `page === true`, the `onClose` / "Вернуться" button (lines 712–715) should be:
- **Either hidden entirely** (preferred — user can use browser back or app navigation)
- **Or rendered as a small text link** (e.g., `<a className="textLinkSmall">← Назад</a>`) instead of a `secondaryBtn`

### 8.2 On modal/overlay route
When `page === false`, "Закрыть" can remain a button since it is a dialog dismiss action.

---

## Item 9. Remove "Проекты" back-button redundancy

`AppShell.jsx` already hides the TopBar back button on registry route. Ensure the registry page does NOT render its own prominent back button at the same time. This is covered by Item 8 (hide or de-prioritize "Вернуться").

---

## Item 10. CSS adjustments (tailwind.css)

### 10.1 Toolbar styles
Add:
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
  gap: 8px;
  align-items: center;
  flex-shrink: 0;
}
```

### 10.2 Collapsible source section
Add:
```css
.productActionsRegistrySources {
  margin-top: 16px;
  padding: 8px 12px;
  border: 1px solid var(--analysis-border-soft);
  border-radius: 6px;
  font-size: 12px;
}
.productActionsRegistrySources summary {
  cursor: pointer;
  font-weight: 500;
  color: var(--analysis-muted);
}
```

### 10.3 Compact session list
Override session summary table to be a compact list:
```css
.productActionsRegistrySessionSummaryTable {
  display: block;
  max-height: 240px;
  overflow-y: auto;
}
.productActionsRegistrySessionSummaryHead {
  display: none; /* hide column headers */
}
.productActionsRegistrySessionSummaryRow {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  font-size: 12px;
}
```

---

## Acceptance Criteria for Round 1

- [ ] No string contains "frontend", "backend", "workspace" (as technical noun), "scope", "preview", "read-only" in user-facing UI.
- [ ] Metrics bar renders immediately below scope selector.
- [ ] Unified toolbar renders immediately below metrics bar.
- [ ] Registry table renders immediately below toolbar.
- [ ] Session/source section is collapsible, titled "Источники данных", and visually subordinate.
- [ ] AI button is in toolbar, disabled with explanatory tooltip when no sessions selected.
- [ ] Export buttons are in toolbar, disabled when 0 rows.
- [ ] Empty state shows session-aware copy when `sessions > 0 && actions === 0`.
- [ ] "Вернуться" is hidden or a text link on registry page.
- [ ] No regression in build or tests (`npm run build` passes, existing tests pass).
- [ ] No backend, durable truth, BPMN XML, RAG, AG-UI changes.

---

*Agent 3 must re-review after READY_FOR_REVIEW is recreated.*
