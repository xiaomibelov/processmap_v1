# PLAN — Property Panel UX Redesign (контур feature/mini-indicator-from-524, Phase UX-1)

**Дата:** 2026-07-12. **Ветка:** `feature/mini-indicator-from-524` (от main@47a0c12f).
**Статус:** AWAITING APPROVE — только проектирование, кода нет.
**Источник:** AGENT PROMPT «Property Panel UX Redesign» (PREMIUM/URGENT).

---

## 1. Scope

UX-перестройка панели свойств в сайдбаре (аккордеон «Свойства»): display mode → segmented control; V2-оверлеи → parent toggle + dependent sub-control; быстрые свойства → chip-лист; BPMN-свойства → компактный key-value list; Save/Reset → компактная панель.

**Не в scope (жёстко):** save pipeline / XML / backend; удаление per-element `fpc-show-properties`; To-Be builder и dropdown-подход из #524; fieldChips/hiddenFields (Tier 2, отдельно); LiveCardPreview; изменение каноники extension-state.

## 2. Gap-анализ As-Is (верифицировано по коду main@47a0c12f)

| # | As-Is (файл:строка) | Проблема | To-Be |
|---|---|---|---|
| G1 | 5 независимых чекбоксов в `NotesPanel.jsx` «Свойства» (on-select / always / per-element flag / V2 on / V2 expanded), `sidebarPropertiesDisplaySettings` | Возможны невалидные комбинации (always+hidden per-element; expanded без V2); нет визуальной иерархии | A: segmented control 3 сегмента + B: parent toggle с dependent sub-control |
| G2 | Quick properties = таблица с шапкой «Свойство/Значение/Действие» + zebra (`ElementSettingsControls.jsx:1946-2003`), `QuickEmptyPropertyRow` рисует placeholder-строки с «—» | Визуальный шум, пустые строки, CTA спрятан | C: chip-лист `name: value`, muted «—», hover-actions, «+ Добавить» chip |
| G3 | `InlineBpmnPropertyRow.jsx:127-154` — pencil+trash **перманентно видимы** в каждой строке (quick + additional) | Иконочные колонки ×N строк | C/D: hover-reveal actions (opacity 0→1, 150ms), focus-within для клавиатуры |
| G4 | Additional BPMN = collapsible `AdditionalBpmnPropertiesSection` со строками-таблицей; delete = **auto-save** (L20-29, вызывает `onSaveExtensionState` немедленно) | Несогласованность: delete сохраняет мгновенно, edit — нет | D: KV-лист; **delete остаётся draft-only** (unify с edit) — отдельное решение, см. §6 R2 |
| G5 | «Сохранить всё»/«Сбросить» — sticky footer внутри группы «Вспомогательное» (`ElementSettingsControls.jsx:2424`) + глобальный footer `SidebarShell` (`NotesPanel.jsx:3080-3105`) | Кнопки оторваны от контекста, два футера | E: compact floating bar ≤48px, 1px top border (вариант E1); header-кнопки (вариант E2) — см. §6 Q1 |
| G6 | Per-element `fpc-show-properties` (3-й чекбокс) пишется в BPMN XML | — | **Сохраняется** (constraint); в новом UI — компактный toggle в строке подзаголовка секции, не часть segmented control (другая ось: per-element vs per-session) |

## 3. Design Direction (из промпта, с уточнениями)

- **A. Segmented control** «При наведении / Всегда / Скрыто» — `role=radiogroup`, arrow-key navigation. Маппинг на существующие App.jsx состояния (без новых данных): `hover` = on-select ON + always OFF; `always` = always ON; `hidden` = оба OFF. Instant preview (draft-level), save не требуется — как сейчас.
- **B. V2**: `role=switch` toggle «V2-оверлеи»; при ON — dependent segmented «Компактно / Раскрыто» с height-transition, 8px indent, 2px left border `hsl(var(--border))`. OFF → sub-control `display:none` (не disabled).
- **C. Quick chips**: горизонтальный wrap-ряд; chip = `{name}: {value|—}`; empty value muted (`hsl(var(--hint))`); hover/focus-within → pencil + ×; «+ Добавить» chip → inline mini-form (селект имени из quick defaults + input значения, ✓/✕).
- **D. BPMN KV-list**: строки label/value; click на value → input (Enter/Blur commit, Escape cancel — как InlineBpmnPropertyRow сейчас); hover-reveal actions; «+ Добавить BPMN-свойство» text-button → inline 2-field form; empty state «Нет дополнительных свойств».
- **E. Save bar**: floating bar ≤48px, 1px top border `hsl(var(--border))`, primary «Сохранить» + text-only «Отмена»; виден только при `sidebarGlobalHasChanges` (сейчас footer рендерится всегда с disabled).

## 4. Token map (важно: `--kimi-*` в продукте НЕТ — решение D2 контура #524)

| Промпт (kimi) | Продукт (tokens.css) |
|---|---|
| `--kimi-color-text-primary` | `hsl(var(--text))` |
| `--kimi-color-text-secondary` | `hsl(var(--muted))` |
| `--kimi-color-text-quaternary` | `hsl(var(--hint))` |
| `--kimi-color-border` | `hsl(var(--border))` |
| `--kimi-color-bg-secondary` | `hsl(var(--panel2))` |
| hover tints | `color-mix(in srgb, hsl(var(--accent)) 8%, transparent)` |

Typography 14/12/13px, radii 8/10/6px, spacing 16/8/6px — как в промпте; shadows только `0 1px 3px` для floating bar. Никаких hardcoded цветов (gate: grep-проверка + ui-copy source-тест).

## 5. Фазы (каждая — independently shippable, отдельный commit)

| Phase | Содержание | Файлы |
|---|---|---|
| P0 | Primitives: `SegmentedControl.jsx`, `ToggleSwitch.jsx` + token-CSS + pure-node тесты | новые, `styles/tailwind.css` |
| P1 | A+B: display mode segmented + V2 toggle/sub-control вместо 4 чекбоксов (per-element flag → toggle в подзаголовке, G6) | `NotesPanel.jsx` |
| P2 | C: Quick chips (`QuickPropertyChip.jsx`, chip-form), замена таблицы quick properties | `ElementSettingsControls.jsx`, новые |
| P3 | D: BPMN KV-list (refactor `InlineBpmnPropertyRow` → hover-actions; `AdditionalBpmnPropertiesSection` empty-state + add-form) | `rows/`, `sections/` |
| P4 | E: floating save bar (unify два футера) | `ElementSettingsControls.jsx`, `NotesPanel.jsx` |

## 6. Решения (APPROVED 2026-07-12)

- **Q1 (E-вариант):** ✅ **E1 floating bar внизу** — ≤48px, 1px top border, виден только при изменениях. Header-вариант и auto-save отклонены.
- **Q2 (G4):** ✅ **draft-only унификация** — delete в Additional BPMN больше не делает мгновенный PUT; сохранение через SaveBar (консистентно с edit). E2E T8 пишется под новый флоу.
- **Q3 (G6):** ✅ **toggle «Показывать над этой задачей»** в строке подзаголовка блока «Быстрые свойства» (отдельная per-element ось, не часть segmented control).
- **Q4 («Скрыто»):** ✅ подтверждено — оба overlay-режима OFF, свойства только в панели (= derive `{showOnSelect:false, showAlways:false}`).

## 7. Acceptance Criteria

- [ ] AC1: segmented control заменяет 3 чекбокса; невалидные комбинации невозможны структурно; keyboard arrows работают
- [ ] AC2: V2 toggle OFF → sub-control скрыт (height transition ≤200ms); ON → «Компактно/Раскрыто» доступно; состояние сохраняется per-session как сейчас
- [ ] AC3: quick properties — chips; empty value = muted «—»; actions только при hover/focus-within; add через inline mini-form
- [ ] AC4: BPMN list — click-to-edit (Enter/Blur commit, Escape cancel); hover-actions; empty-state hint; add-form ✓/✕
- [ ] AC5: save bar ≤48px, виден только при наличии изменений; save pipeline (camunda→documentation→paths→stepTime→robotMeta, 409 rollback) байт-в-байт
- [ ] AC6: per-element `fpc-show-properties` доступен и пишет в XML как раньше
- [ ] AC7: token-only CSS (grep gate), RU copy, a11y: radiogroup/switch/aria-labels/focus-visible; цвет не единственный индикатор
- [ ] AC8: регрессии: unit baseline 51=51, foundation 10/10, e2e process-properties 5/5 + extension-state-mini 2/2 + v2-overlay-persistence 3/3

## 8. Dependencies / конфликты

- **#526 (mini-indicator, pr-open)** — эта ветка; redesign не трогает indicator (topRow сохраняется).
- **#524 (property-panel-redesign, pr-open)** — параллельный redesign ТОЙ ЖЕ зоны (dropdown-подход + To-Be). Рекомендация: **#524 закрыть/не мёржить** — этот контур его замещает сегментированным подходом; при желании chips/To-Be заимствуются позже отдельно.
- Файлы: `NotesPanel.jsx`, `ElementSettingsControls.jsx`, `rows/InlineBpmnPropertyRow.jsx`, `sections/AdditionalBpmnPropertiesSection.jsx`, `styles/tailwind.css`.
- E2E-хелперы: переиспользуются из `extension-state-mini.spec.mjs` / `process-properties.spec.mjs`.

## 9. Verification plan

Per phase: pure-node unit (view-models, ui-copy source-тесты) → build → unit sweep 51=51 → stage deploy → e2e (новый `property-panel-ux.spec.mjs`: segmented keyboard, toggle dependency, chip hover-actions, KV inline edit, save bar visibility) + регрессионные specs (§AC8). Stage deploy с обязательным refresh `.env VITE_BUILD_*` (lesson 2026-07-12).
