# FILTERS_REFERENCE_FIX_REPORT — Исправление ReferenceError

**Контур:** `uiux/product-actions-registry-inner-page-safe-redesign-v1`  
**Run ID:** `20260517T121105Z-76345`  
**Агент:** Agent 2 / Worker (rework)  
**Дата:** `2026-05-17`  
**Язык:** русский

---

## Проблема

Agent 4 выявил критическую ошибку:

```
ReferenceError: FILTERS is not defined
```

В `ProductActionsRegistryPanel.jsx` на строке 328 `activeFilterLabels` использовало `FILTERS.forEach(...)`, но inline-константа `const FILTERS = [...]` была удалена при редизайне, а ссылка осталась.

Кроме того, при аудите были обнаружены две дополнительные потерянные ссылки, внесённые при редизайне:
- `paginatedRows` — использовался в `<ProductActionsRegistryTable rows={paginatedRows} />`, но не был определён
- `emptyMessage` — использовался в `<ProductActionsRegistryTable emptyMessage={emptyMessage} />`, но не был определён
- `pageState`, `pageSize`, `setPageState`, `setPageSize` — использовались в `<ProductActionsRegistryPagination />`, но не были определены

---

## Исправления

### 1. FILTERS — единый источник правды

**Файл:** `frontend/src/components/process/analysis/registry/ProductActionsRegistryFilters.jsx`

- Изменено: `const FILTERS = [...]` → `export const FILTERS = [...]`

**Файл:** `frontend/src/components/process/analysis/registry/index.js`

- Добавлен re-export: `export { FILTERS } from "./ProductActionsRegistryFilters.jsx";`

**Файл:** `frontend/src/components/process/analysis/ProductActionsRegistryPanel.jsx`

- Добавлен импорт: `FILTERS` в destructuring import из `./registry/index.js`

### 2. Пагинация — добавлены отсутствующие состояния

**Файл:** `frontend/src/components/process/analysis/ProductActionsRegistryPanel.jsx`

Добавлены:
```javascript
const [pageState, setPageState] = useState(1);
const [pageSize, setPageSize] = useState(25);
```

Добавлен `useEffect` для сброса страницы при изменении фильтров:
```javascript
useEffect(() => {
  setPageState(1);
}, [filters]);
```

Добавлено вычисление `paginatedRows`:
```javascript
const paginatedRows = useMemo(() => {
  const start = (pageState - 1) * pageSize;
  return filteredRows.slice(start, start + pageSize);
}, [filteredRows, pageState, pageSize]);
```

### 3. Пустое состояние таблицы

Добавлено:
```javascript
const emptyMessage = backendStatus || "В выбранном источнике пока нет действий с продуктом.";
```

---

## Проверка статических ссылок

```bash
cd /opt/processmap-test/frontend
grep -rn "FILTERS" src/components/process/analysis/
```

Результат:
```
src/components/process/analysis/ProductActionsRegistryPanel.jsx:26:  FILTERS,
src/components/process/analysis/ProductActionsRegistryPanel.jsx:329:    FILTERS.forEach(([key, label]) => {
src/components/process/analysis/registry/ProductActionsRegistryFilters.jsx:1:export const FILTERS = [
src/components/process/analysis/registry/ProductActionsRegistryFilters.jsx:27:        {FILTERS.map(([key, label]) => (
src/components/process/analysis/registry/index.js:4:export { FILTERS } from "./ProductActionsRegistryFilters.jsx";
```

✅ Все ссылки на `FILTERS` разрешены. Нет `ReferenceError`.

---

## Файлы, изменённые при rework

```
frontend/src/components/process/analysis/ProductActionsRegistryPanel.jsx
frontend/src/components/process/analysis/registry/ProductActionsRegistryFilters.jsx
frontend/src/components/process/analysis/registry/index.js
```

---

*Agent 2 / Worker*  
*Исправлено: 2026-05-17*
