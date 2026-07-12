# WORKER_REPORT — feature/sidebar-redesign-v2

Дата: 2026-07-12
Ветка: `feature/sidebar-redesign-v2` от `origin/main@5aabba98`
Base reuse: PR #524 (7 code-коммитов cherry-pick, см. REVIEW_REPORT.md)
Scope: frontend-only. Save pipeline / backend НЕ тронуты.

## Что сделано (после approve REVIEW_REPORT)

### G1 — Индикатор сохранения в шапку аккордеона ✅
- `SidebarAccordionSection`: новый опциональный слот `headerRight`
  (рендерится между заголовком и chevron, `stopPropagation` — клик по
  индикатору не сворачивает аккордеон).
- `NotesPanel`: `ExtensionStateMiniIndicator` перенесён из контента
  (`.propertiesTabTopRow` удалён) в `headerRight` аккордеона «Свойства».
- CSS: `.sidebarAccordionHeaderRight` (inline-flex, margin-right: 4px).
- Тест: `SidebarAccordionSection.headerRight.test.mjs` (слот перед chevron,
  stopPropagation).

### G2 — Reference-набор быстрых свойств ✅
- `DEFAULT_QUICK_PROPERTY_NAMES` = `["ee_time", "ingredient", "ingredient_um",
  "ingredient_value", "equipment"]` (было ee_time + ingredient_value).
- Эффект: Quick-блок всегда показывает 5 строк (filled или empty с
  «Добавить значение для …»); те же 5 полей — overlay chips; To-Be pool
  видит их как «Not filled».
- Обновлён source-text тест `sidebarQuickAddSync.test.mjs`.

### G3 — Dense CSS
Без изменений: после UI refresh (collapsible groups, select'ы в ряд,
full-width блоки) layout уже dense. Pixel-полировка — когда будет скриншот.

### G4 — Focused e2e ✅
- `e2e/helpers/sidebarRedesignBoot.mjs` — shared helpers (boot/select/save/
  console collector), чтобы спеки не импортировали друг друга.
- `e2e/sidebar-redesign-v2.spec.mjs` — 3 сценария:
  1. Reference quick set: 5 quick rows + 5 chips на элементе.
  2. Индикатор в HEADER аккордеона (не в body), saved → dirty при inline edit.
  3. Roundtrip: add ingredient → edit → save → XML → reload → persists →
     delete → XML clean. Selectors с `{ exact: true }` (ingredient ⊂
     ingredient_um/ingredient_value).

## Проверка

- Unit: sweep — fail-set байт-идентичен baseline (35 pre-existing);
  sidebar suites 95/95 green.
- Build: exit 0 (20.45s).
- e2e: `sidebar-redesign-v2.spec.mjs` + `property-panel-redesign.spec.mjs`
  (regression) — v2 spec 3/3 green, reused spec 10/10 green.

## Риски / открытые

- G2 меняет quick-состав глобально: элементы со старыми свойствами из
  «additional» (ingredient_um/equipment) теперь показывают их в Quick —
  intended per reference.
- Скриншот-референс так и не получен — G3 отложен, G2 сделан по описанию.
- Pre-existing render-loop ProcessStage↔AppShell — вне скоупа (см.
  WORKER_REPORT контура property-panel-redesign), e2e фильтрует только это
  точное warning.
- PR #524 остаётся открытым; судьба (merge 524 vs эта ветка) — за пользователем.
