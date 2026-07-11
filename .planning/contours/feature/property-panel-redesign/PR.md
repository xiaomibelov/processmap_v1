# PR: Property Panel Redesign — компактная панель отображения свойств + To-Be builder

**Ветка:** `feature/property-panel-redesign` → `main`
**Base:** main@5aabba98 (после merge PR #523)
**Контур:** `.planning/contours/feature/property-panel-redesign/` (PLAN/UI/API/TESTS/WORKER_REPORT/REVIEW_REPORT)

## Что меняется

### 1. Компактные настройки отображения (вместо 5 чекбоксов)
- Два dropdown: **режим отображения** (При наведении / Всегда / Скрыто) и
  **V2-оверлеи** (Нет / Все / Раскрытые), каждый с inline-подсказкой.
- **Chips** видимости по полям: активное = чёрная заливка + галочка,
  неактивное = серый контур. Keyboard-accessible (Space/Enter, aria-pressed).
- Взаимоисключающие режимы — недопустимые комбинации состояний устранены.
- Persistence per session (`fpc_overlay_display_v1:{sid}`) + read-only миграция
  legacy-ключа `fpc_properties_overlay_always_v1:{sid}` (ключ не удаляется).

### 2. Live preview карточки оверлея
- Верх панели «Свойства»: карточка-превью зеркалит draft элемента без save.
- Скрыта для process-like selection (у корня процесса нет canvas-геометрии).

### 3. To-Be builder (MVP)
- As-Is список (сконфигурированные свойства) + Pool (незаполненные из
  словаря/быстрых), статус-бейджи («In To-Be» / «Removed» / «Added» /
  «Not filled»), summary «X in To-Be / Y skipped».
- «+» из Pool → draft-строка свойства → сохраняется штатным Global Save
  (та же XML-pipeline, без обходов).
- Удалённое свойство помечается «Removed» (delete-detection scoped по elementId).
- Хранение — localStorage per session (`fpc_tobe_v1:{sid}`), без bpmn_meta (MVP).

### 4. Per-field фильтр V2-карт
- Chips фильтруют строки и legacy-карт, и V2-карт (preview- и BPMN-ветки).
- Auto-карта, у которой скрыты все поля, не рендерится; name-only и authored
  оверлеи не затрагиваются. Данные (XML/draft) фильтр не трогает.

### 5. Fix порядка V2 mount (pre-existing bug)
- Legacy decor теперь очищается ДО монтирования V2 hosts: раньше карточка
  выделенного элемента подавляла свежий V2 host, и элемент оставался без
  карточки при включении V2.

### 6. UI refresh вкладки «Свойства»
- Блоки «Свойства над задачей» / «V2-оверлеи» / «Поля в оверлее» / «To-Be»
  сворачиваются (collapsible PanelGroup, состояние в localStorage
  `fpc_prop_panel_groups_v1`, default — раскрыто).
- Select'ы режимов — в один ряд (2 колонки), не друг над другом.
- «Быстрые свойства» и «Дополнительные BPMN-свойства» — на полную ширину
  сайдбара (убраны боковые паддинги `.sidebarPropertiesLayout--centered`).
- Мини-индикатор extension-state (✓/✎/⟳/⚠, ~16px, tooltip) в самом верху
  вкладки; детальный статус с «Повторить» в «Вспомогательном» сохранён.
- Summary pills To-Be — в header collapsible-группы (без дубля заголовка).

## UX-поведение по умолчанию
- displayMode по умолчанию — **«При наведении»** (раньше чекбокс #1 был мёртвый
  uncontrolled; теперь карточка выделенного элемента показывается явно).
- V2 по умолчанию — выключены.

## Тесты
- Unit: +новые модульные тесты (модели, chips, filter, toBe, resolver +6,
  coordinator +2); полный sweep — fail-set идентичен baseline (35 pre-existing).
- E2E: `frontend/e2e/property-panel-redesign.spec.mjs` — 8 сценариев, 8/8 green.
- Build: exit 0. CSS — token-only (var(--*)/color-mix), без hardcoded colors.

## Migration / rollback
- Миграция настроек — read-only, автоматическая, обратимая (legacy-ключи
  сохраняются; откат кода вернёт старое поведение без потери данных).
- To-Be/display settings живут только в localStorage — rollback их просто
  игнорирует.
- BPMN XML не меняет формат: новые UI-пути пишут через существующий save pipeline.

## Out of scope (future)
- Process-level properties — upstream PR #523 (уже в main), здесь только
  integration gates.
- AI-слой FB-помощника, real-time sync, cross-session notes, rich text.

## Известные находки (не блокеры этого PR)
- Pre-existing render-loop ProcessStage↔AppShell (`useBpmnSync` возвращает новый
  объект каждый рендер → перерегистрация safe-refresh handler каждый рендер).
  Воспроизводится на чистом main; рекомендуется отдельный PR (useMemo на return
  useBpmnSync + стабильный onClearWorkspaceProject). Подробности — WORKER_REPORT.md.

## Checklist перед merge
- [ ] Review WORKER_REPORT.md + REVIEW_REPORT.md
- [ ] Stage deploy + ручной UI-чеклист (overlay визуально, console/network clean)
- [ ] Решение по D5 (runtime для review) и по render-loop (отдельный PR)
