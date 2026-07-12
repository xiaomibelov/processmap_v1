# REVIEW_REPORT — feature/sidebar-redesign-v2 (reuse из PR #524 → референс)

Дата: 2026-07-12
Ветка: `feature/sidebar-redesign-v2` от `origin/main@5aabba98`
Worktree: `/Users/mac/PycharmProjects/processmap_sidebar_redesign_v2` (clean)
Статус: **AWAITING APPROVE** — adaptation code не начат (дисциплина: report → approve → code)

## 1. Что взято из PR #524 (cherry-pick, 7 code-коммитов)

| Новый хеш | Коммит | Что даёт |
|-----------|--------|----------|
| `da54aaf3` | phase 0 | overlay display settings model + per-field preview filter |
| `27df6a3a` | refactor | hiddenFields opt-out semantics |
| `87bf76ce` | phase 1 | compact settings: 2 dropdowns + chips (вместо 5 чекбоксов) |
| `7dfb950d` | phase 2 | To-Be builder + LiveCardPreview |
| `d0c6a968` | phase 4 | per-field chip filter для V2-карт + clear-before-mount fix |
| `4f67f0ac` | test(e2e) | property-panel-redesign spec (10 сценариев) |
| `979d1b0e` | UI refresh | collapsible PanelGroup + select'ы в ряд + mini extension-state indicator |

Docs-коммиты 524 (planning-артефакты другого контура) НЕ перенесены — конфликт
на `.planning/contours/feature/property-panel-redesign/*` разрешён удалением;
этот контур получает собственные артефакты.

**Проверка cherry-pick:** displaySettings suites 86/86 green, `npm run build` exit 0.

## 2. Что уже есть на main (не требует работы)

- **Process-level properties** — PR #523 в main: canvas click = выбор корневого
  процесса, свойства процесса через тот же CRUD. Reuse = просто присутствует.
- **Таблица быстрых свойств** — `ElementSettingsControls.jsx:1966-2023`: блок
  «Быстрые свойства» с шапкой «Свойство / Значение / Действие», inline
  edit/delete, «+ Добавить быстрое свойство». Совпадает с референсом.
- **«Дополнительные BPMN-свойства»** — `sections/AdditionalBpmnPropertiesSection.jsx`:
  аккордеон со счётчиком (`sidebarPropertiesBlockMeta`), та же таблица
  «Свойство / Значение / Действие». Совпадает с референсом.
- **«Сохранить всё» + «Сбросить»** — `SidebarGlobalFooter` внизу сайдбара. Есть.

## 3. Gap: 524+main → референс (что реально нужно сделать)

### G1. Индикатор сохранения — в шапку аккордеона (из 524 он в контенте)
Сейчас: `ExtensionStateMiniIndicator` рендерится строкой `.propertiesTabTopRow`
внутри контента аккордеона «Свойства». Референс: мини-иконка (✓/✎) **в шапке
самого аккордеона** (справа от заголовка «Свойства»).
Работа: `SidebarAccordion` — добавить опциональный слот `headerRight`;
NotesPanel передаёт туда `ExtensionStateMiniIndicator`; убрать top-row из
контента. Риск: низкий (изолированный слот).

### G2. Состав быстрых свойств / chips / превью
Референс: превью-карточка с `ingredient / ingredient_um / ingredient_value /
equipment`; chips — те же поля + `ee_time`.
Сейчас: LiveCardPreview data-driven (показывает свойства элемента, уже
отфильтрованные chips) — структурно совпадает, состав зависит от данных.
`DEFAULT_QUICK_PROPERTY_NAMES` = `ee_time + ingredient_value`; chips строятся
`buildFieldChips` из draft + dictionary.
Работа: проверить, откуда приходит quick-набор (dictionary schema операции);
если референс требует именно ingredient/ingredient_um/equipment в быстрых —
это конфиг quickPropertyNames (dictionary), НЕ хардкод. **Нужен скриншот**,
чтобы понять: это состав конкретного элемента на референсе или требование к
quick-набору по умолчанию.

### G3. Dense layout / CSS под референс
Токены: `styles/tokens.css` + color-mix (как в 524, без --kimi-*).
Работа: финальная полировка отступов/размеров **после получения скриншота**.
Без скриншота — только описательная адаптация.

### G4. E2E (минимум 5 сценариев: add / edit / save / reload / delete)
Существующий spec (10 тестов) покрывает edit+save+reload (To-Be сценарий),
chips, persistence, a11y. Для v2 добавить focused spec
`sidebar-redesign-v2.spec.mjs`: add → edit → save → reload → delete быстрого
свойства + проверка индикатора в шапке аккордеона (G1).

## 4. Что НЕ трогаем (ограничения)

- Save pipeline (CAS, diagram_state_version) — без изменений.
- Backend — без изменений. Frontend-only.
- `SidebarTrustStatus` (детальный статус + «Повторить») — сохраняется.
- PR #524 остаётся открытым; эта ветка — самостоятельный контур (решение по
  судьбе 524 — за пользователем: merge 524 ИЛИ эта ветка как замена).

## 5. План после approve

1. G1: `SidebarAccordion` headerRight slot + перенос индикатора (+ui-copy test).
2. G2: выяснить quick-набор (dictionary), адаптировать по скриншоту.
3. G3: CSS dense-полировка по скриншоту.
4. G4: `sidebar-redesign-v2.spec.mjs` (5+ сценариев), прогон полного e2e.
5. Unit sweep vs baseline, build, commit → push/PR только по команде.

## 6. Блокеры

- **Референсный скриншот отсутствует** (временная папка пуста) — запрошен у
  пользователя. G2/G3 без него — только по текстовому описанию.
