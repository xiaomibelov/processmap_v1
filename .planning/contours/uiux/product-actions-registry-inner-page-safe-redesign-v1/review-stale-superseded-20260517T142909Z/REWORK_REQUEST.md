# REWORK_REQUEST — uiux/product-actions-registry-inner-page-safe-redesign-v1

**Run ID:** `20260517T121105Z-76345`  
**Агент:** Agent 4 / Reviewer  
**Дата:** `2026-05-17`  
**Статус:** `CHANGES_REQUESTED`

---

## Причина rework

Страница «Реестр действий с продуктом» падает с JavaScript-ошибкой при открытии. Визуальная иерархия и все элементы редизайна недоступны для проверки.

---

## Критическая ошибка

### ReferenceError: FILTERS is not defined

**Где:** `frontend/src/components/process/analysis/ProductActionsRegistryPanel.jsx:328`  
**Что происходит:** При открытии реестра React-компонент падает в `useMemo` для `activeFilterLabels`, потому что переменная `FILTERS` не определена.

**Source code (строка 328):**
```javascript
const activeFilterLabels = useMemo(() => {
  const labels = [];
  FILTERS.forEach(([key, label]) => {   // ← ReferenceError здесь
    const value = toText(filters[key]);
    if (value) labels.push(`${label}: ${value}`);
  });
  if (toText(filters.completeness || "all") !== "all") {
    labels.push(filters.completeness === "complete" ? "Полнота: полные" : "Полнота: неполные");
  }
  if ((scope === "workspace" || scope === "project") && selectedVisibleSessionIds.length) {
    labels.push(`Сессии: ${selectedVisibleSessionIds.length}`);
  }
  return labels;
}, [filters, scope, selectedVisibleSessionIds.length]);
```

**Agent 2 заявил:** «Удалены inline-определения SummaryPill и const FILTERS, которые дублировали логику компонентов.»  
**Факт:** Ссылка на `FILTERS` осталась, что привело к `ReferenceError`.

---

## Требуемые исправления

1. **Исправить `ProductActionsRegistryPanel.jsx`**
   - Вариант А: Восстановить `const FILTERS = [...]` рядом с `activeFilterLabels`
   - Вариант Б: Заменить `FILTERS.forEach(...)` на inline-итерацию по ключам фильтров
   - Важно: убедиться, что `FILTERS` определена до использования

2. **Пересобрать frontend**
   ```bash
   cd /opt/processmap-test/frontend && npm run build
   ```

3. **Runtime-проверка исполнителем**
   - Открыть `http://clearvestnic.ru:5180/app?surface=analytics`
   - Нажать «Открыть» на карточке «Реестр действий»
   - Убедиться, что страница реестра открывается (без «Произошла ошибка интерфейса»)
   - Открыть DevTools Console — должно быть 0 ошибок от `ProductActionsRegistry`

4. **Обновить отчёты**
   - `EXEC_REPORT.md` — зафиксировать новую сборку
   - `WORKER_2_REWORK_REPORT.md` — описать фикс

---

## Гейты, которые невозможно проверить из-за ошибки

- Gate 3 — Anti-Chaos Hierarchy (заголовок, табы, метрики)
- Gate 4 — Filters & Actions Layout (горизонтальные фильтры)
- Gate 5 — Warning & Table Dominance (таблица, баннер)
- Gate 6 — Source/Session Block Secondary
- Gate 7 — Navigation & Close (обратная навигация из реестра)
- Gate 9 — Data Safety (метрики, экспорт)

---

## Что работает (не требует исправления)

- Gate 0 — Версия `v1.0.136` отдаётся корректно
- Gate 1 — Shell/TopBar выглядит неизменным (проверено через Analytics Hub)
- Gate 2 — Analytics Hub открывается, карточка «Реестр действий» видна
- Gate 10 — Scope safe (изменения только в 3 файлах frontend)

---

## Повторное ревью

После исправления Agent 3 автоматически переработает и передаст на повторное ревью. Agent 4 проведёт полный runtime visual review заново.

---

*Agent 4 / Reviewer*  
*Rework запрошен: 2026-05-17*
