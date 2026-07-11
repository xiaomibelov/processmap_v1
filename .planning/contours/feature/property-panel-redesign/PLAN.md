# PLAN: Property Panel Redesign

**Contour:** `feature/property-panel-redesign` · ветка `feature/property-panel-redesign` от `origin/main` · PR → approval → merge (без self-merge)
**Workspace:** `.planning/contours/feature/property-panel-redesign/{PLAN.md,STATE.json}` + Obsidian mirror через `tools/pm-agent-mirror-report.sh`
**Статус:** `planned` — ждёт approve пользователя (ни строчки product-кода до approve)

## 0. Runtime/source truth (AGENTS.md §3)

| Плоскость | Значение |
|---|---|
| workspace | `/Users/mac/PycharmProjects/processmap_property_panel_redesign` (clean worktree) |
| branch | `feature/property-panel-redesign` |
| HEAD == origin/main | `03090852` (merge PR #522) — совпадает |
| diff | 0 unstaged / 0 staged |
| stage runtime | `https://stage.processmap.ru` health ok; `/opt/processmap-test` на clearvestnic.ru HEAD = тот же `03090852` |
| `:5180` runtime | **не слушает** (нужен для review-гейта rule-agent3-fresh-runtime — см. D5) |

## 1. As-Is (что есть сегодня)

Сайдбар: `frontend/src/components/NotesPanel.jsx` (3554 строки), аккордеон «Свойства». В нём блок `.sidebarPropertiesDisplaySettings` (`NotesPanel.jsx:3168-3224`) — **5 чекбоксов**:

| # | Лейбл | Стейт | Персистентность | Проблема |
|---|---|---|---|---|
| 1 | «Показывать свойства над задачей при выделении» :3177 | `showPropertiesOverlayOnSelect` — App.jsx **никогда не передаёт проп** → локальный uncontrolled fallback (`NotesPanel.jsx:1055-1060`) | не персистится | фактически мёртвый контрол |
| 2 | «Всегда показывать свойства над задачей» :3188 | `showPropertiesOverlayAlways` (`App.jsx:895`) | localStorage `fpc_properties_overlay_always_v1:{sid}` | — |
| 3 | «Показывать свойства над задачей» (per-element) :3199 | derived из property-строки `fpc-show-properties` (`NotesPanel.jsx:1482-1486`) | **как `camunda:property` в BPMN XML** + bpmn_meta | UI-флаг хранится как бизнес-свойство в XML — семантическая перегрузка; тоггл автосейвит |
| 4 | «Показывать все V2-оверлеи свойств» :3211 | `v2OverlaysEnabled` (`App.jsx:896`) | **не персистится** (сброс при reload) | — |
| 5 | «…раскрытыми» :3222 | `v2OverlaysExpanded` (`App.jsx:897`) | **не персистится** | зависит от #4 (disabled), но #2/#3/#4 независимы → возможны бессмысленные комбинации |

Дополнительные факты As-Is:

- **Per-field visibility не существует** — ноль механизмов (ни eye-иконок, ни списков полей). Строки свойств имеют только edit/delete (`rows/InlineBpmnPropertyRow.jsx`).
- **To-Be/builder не существует** — greenfield. Единственные близкие концепты: quick-pins (`processmap_quick_pins`) и per-element `bpmn_meta.presentation_by_element_id.showPropertiesOverlay` (один boolean).
- **Процесс не селектится**: `isSelectableElement` (`BpmnStage.jsx:1689-1694`) и его дубль (`selectionFocusDecor.js:9-28`) исключают process/collaboration/lane/participant. Клик по пустому canvas → `emitElementSelectionChange(null)` → сайдбар пустой (`wireBpmnStageRuntimeEvents.js:444-472` viewer / `:649-677` editor, папка `stage/orchestration/`).
- **Два overlay-пайплайна**: legacy `decorManager.js:1726 applyPropertiesOverlayDecor`; V2 в `features/process/bpmn/stage/overlay/` (`useV2OverlayState.js`, mount-эффект `BpmnStage.jsx:4676-4722`, feature flag `useBpmnExtensionOverlays`). Стейт владения — `App.jsx`, prop-drill через AppShell → ProcessStage → BpmnStage (4 уровня) → любой тоггл ре-рендерит весь shell (подтверждено аудитом `sidebar-overlay-performance`).
- **`--kimi-*` токенов нет** в коде. Реальная система: `styles/tokens.css` — HSL-каналы (`--bg: 220 24% 93%` → `hsl(var(--bg))`), группы: surfaces/text (`--bg/--panel/--text/--muted/--hint/--border`), brand/semantic (`--accent/--accent2/--accent-hover/--accent-soft/--danger/--success/--warning/--ring/--focus`), BPMN-набор, legacy-алиасы `--c-*`. `color-mix()` используется массово (203 раза в `tailwind.css`).
- **7-типового канона свойств (value, value_um, ingredient, ingredient_value, container_tara, document, ee_time) в коде НЕТ** — `value_um` не встречается ни в frontend, ни в backend. Имена свойств в основном hardcoded; константы только `DEFAULT_QUICK_PROPERTY_NAMES=["ee_time","ingredient_value"]`. Существует data-driven словарь организации (`orgPropertyDictionaryBundle` / `propertyDictionaryModel.js`).
- **CRUD свойств неоднороден**: add — draft-only до «Сохранить всё», а delete — **автосейвит сразу** (`AdditionalBpmnPropertiesSection.jsx:20-29`).
- **Известный баг x3** (аудит 2026-07-09): zeebe/camunda дублирование property в XML и meta — To-Be списки будут читать эти же строки → нужен dedup на отображении.

## 2. To-Be (целевое, строго по документу пользователя)

1. **Compact Mode**: два dropdown (display mode: hover / always / hidden; V2 overlay mode: all overlays / expanded / none) вместо checkbox-листа. Взаимоисключающие режимы конструктивно. Каждая опция с inline hint text.
2. **Chip toggles** для per-field visibility: active = заливка + checkmark (checkmark только когда active), inactive = gray outline.
3. **To-Be Builder**: live card preview вверху панели; As-Is list (сконфигурированные свойства); Pool list (unfilled properties); status badges «In To-Be» / «Removed» / «Added» / «Not filled»; summary pills «X in To-Be / Y skipped».
4. **Process-level Properties**: клик по canvas = выбор корневого `bpmn:process` (или collaboration/lane/participant); сайдбар показывает группу «Свойства процесса» с тем же CRUD; в шапке «Процесс: [name/id]».
5. **Design system**: все контролы на токенах + `color-mix` tints, без hardcoded colors; Russian UI copy; compact dense layout; keyboard-accessible + screen-reader friendly.
6. Референс поведения: Camunda Modeler property panel (compact layout).

## 3. Gap analysis As-Is → To-Be

| To-Be | As-Is | Gap |
|---|---|---|
| 2 dropdown вместо 5 чекбоксов | 5 независимых чекбоксов (`NotesPanel.jsx:3168-3224`), #1 мёртвый, #3 перегружен | Новая модель состояния (radio-семантика), миграция persisted-ключа #2, решение по #3 (см. R4) |
| Chip per-field visibility | Не существует | Greenfield: модель видимости полей + фильтрация overlay-контента + хранение (D3) |
| To-Be Builder (preview/As-Is/Pool/badges/pills) | Не существует | Greenfield: источник Pool (словарь организации), семантика badges, хранение To-Be (D4) |
| Процесс селектится + «Свойства процесса» | Процесс исключён из selectable; property machinery id-generic (доказано контуром `feat/process-properties`) | **Дизайн готов** — adoption контура `feat/process-properties` (D1) |
| Kimi tokens | Токенов `--kimi-*` нет; есть `tokens.css` | D2: использовать существующие токены + color-mix (рекомендация) |
| a11y/keyboard | Чекбоксы нативные (ок), dropdown/chips — новые контролы | aria-pressed/role=switch на chips, aria-expanded/listbox на dropdowns, focus-visible, RU aria-labels |

## 4. Scope

**In scope (bounded):**
- `NotesPanel.jsx` — замена блока `.sidebarPropertiesDisplaySettings` на compact-панель (dropdowns + chips); группа «Свойства процесса»; шапка «Процесс: …».
- Новый компактный settings-panel компонент (единый cohesive) + state-модель display-режимов.
- Chips per-field visibility + фильтрация overlay preview (preview-level, не data-level).
- To-Be Builder в панели «Свойства» (live preview, As-Is, Pool, badges, pills).
- Process-level selection (adoption `feat/process-properties`: `processRootSelection.js` + правки selection routing + overlay-гарды).
- CSS на `tokens.css` + color-mix; a11y; unit tests (node:test) + e2e (playwright).

**Out of scope:**
- Backend (никаких изменений).
- Фикс бага x3 (отдельный контур), удаление/миграция данных `fpc-show-properties` (только display-семантика, R4).
- Overlay rendering engine (viewport-culling, виртуализация) — только не ухудшить.
- Analytics «Реестр свойств», канон 7 типов как backend-константа.

## 5. Фазы реализации (после approve)

**Фаза 0 — state-модель (foundation).** Единая модель: `displayMode ∈ {hover, always, hidden}` × `v2Mode ∈ {all, expanded, none}` + `visibleFields: Set<name>`. Маппинг старых стейтов → новой модели; чтение legacy localStorage-ключа `fpc_properties_overlay_always_v1` (миграция вперёд-совместимая). Контроллер рядом с canvas (не App.jsx prop-drill — по аудиту sidebar-overlay-performance, R2). Тесты на маппинг.
Файлы: новый `useOverlayDisplaySettings` (или context), `App.jsx` (удаление 5 стейтов → 1), drill-цепочка.

**Фаза 1 — Compact Mode UI.** Два dropdown (display mode + V2 mode) с inline hints; chips-строка per-field (данные — из свойств текущего элемента + словаря). Dropdown/chips — доступные контролы (keyboard, aria). Замена блока `NotesPanel.jsx:3168-3224`. Стили на токенах.

**Фаза 2 — To-Be Builder.** Live card preview (рендер из overlay preview builder); As-Is list (дедупнутые строки элемента, R3); Pool list (словарь минус As-Is); badges и pills по семантике из §2; проводка «добавить из Pool» → существующий add-pipeline. Хранение — по D4.

**Фаза 3 — Process-level properties.** Adoption дизайна `feat/process-properties` **дословно** (см. §7): `processRootSelection.js` (уже написан, 64 строки, pure), правки `wireBpmnStageRuntimeEvents.js` (2 хендлера), `isSelectableElement` ×2, `NotesPanel.jsx` (шапка + gating секций), гарды `decorManager.js`/`bpmnOverlayParser.js`, CSS hover-hint. CRUD идёт через существующий id-generic pipeline — **ноль изменений в ядре свойств**.

**Фаза 4 — a11y/полировка/verification.** Keyboard-проходка всей панели, screen-reader labels (RU), focus management; `npm run build`; unit sweep vs baseline; e2e spec на stage; review-гейт.

## 6. Acceptance criteria (проверяемые)

**Compact Mode**
- AC1. В «Свойства» вместо 5 чекбоксов — 2 dropdown + chips-строка; каждая опция dropdown с inline hint.
- AC2. Недопустимые комбинации невозможны конструктивно (один dropdown = один режим).
- AC3. Выбор режимов персистится per-session и восстанавливается после reload (миграция со старого ключа #2 работает: старое `always=true` → `displayMode=always`).
- AC4. Chips: active = заливка + checkmark (inactive — outline, без checkmark); клик и Space/Enter переключают; overlay-контент фильтруется по активным chips в legacy и V2 пайплайнах.
- AC5. При эквивалентных настройках legacy/V2 карточки рендерят тот же контент, что и до редизайна (визуальная регрессия по скриншотам).

**To-Be Builder**
- AC6. Live card preview обновляется при редактировании свойств элемента (без save).
- AC7. As-Is list = сконфигурированные свойства (без дублей x3); Pool = незаполненные; badges («In To-Be»/«Removed»/«Added»/«Not filled») и pills («X in To-Be / Y skipped») сходятся с фактическим состоянием.
- AC8. Добавление свойства из Pool создаёт строку через существующий add-pipeline (draft → «Сохранить всё» → XML).

**Process-level**
- AC9. Клик по пустому canvas → сайдбар «Процесс: {name||id}» + группа «Свойства процесса»; add → «Сохранить всё» → `GET /api/sessions/{id}/bpmn` содержит `<camunda:property>` под `<bpmn:process>` extensionElements; reload → свойство на месте; edit/delete работают.
- AC10. Регрессия: task-selection и CRUD свойств задач не изменились; subprocess drill-down сохраняет старое deselect-поведение; overlay не рисует карточку для root.

**Cross-cutting**
- AC11. Keyboard: полный Tab-порядок по панели; Space/Enter на chips/dropdowns; `aria-pressed`/`aria-expanded`; screen-reader озвучивает RU-лейблы.
- AC12. Ноль hardcoded hex в новом CSS — только `tokens.css` vars + color-mix tints.
- AC13. `npm run build` зелёный; `node --test` sweep не хуже baseline (53=53 по последнему contour-отчёту); новый e2e spec зелёный на stage; консоль без новых ошибок.

## 7. Dependencies / prior art

- **Контур `feat/process-properties`** (server, state `in-progress`, без PR/коммитов): готовый file-by-file дизайн + реализованный `processRootSelection.js` (pure, импорт `../overlay/overlayUtils.js` — существует в worktree). Ключевое доказанное утверждение: property draft/executor/save — id-generic, процесс проходит end-to-end без изменений ядра. **Adopt целиком как Фазу 3** (см. D1).
- Save pipeline: `saveBpmnState.js:119` → coordinator `flushSave` → `PUT /api/sessions/{id}/bpmn` — используется как есть.
- Словарь свойств организации (`propertyDictionaryModel.js` / `orgPropertyDictionaryBundle`) — источник Pool list.
- `bpmn_meta.presentation_by_element_id` — кандидат на хранение per-element UI-стейта (D4).
- E2E boot pattern: `v2-overlay-persistence.spec.mjs:119-147` (apiLogin → createFixture → quick_skeleton session → setUiToken → waitForDiagramReady).
- Stage deploy: frontend-only rebuild (как в контуре v2-overlay-persistence).

## 8. Risks

| # | Риск | Митигация |
|---|---|---|
| R1 | Overlay perf: фильтрация chips не должна пересоздавать все карточки (DOM-инфляция, аудит overlays performance) | Фильтр на уровне preview-данных + CSS-class toggling (паттерн `useV2OverlayState`); замер DOM-нод в e2e |
| R2 | Стейт в App.jsx → ре-рендер всего shell на каждый тоггл | Контроллер display-настроек рядом с canvas / context; сайдбар получает только callbacks |
| R3 | Баг x3: дубли zeebe/camunda попадут в As-Is list | Дедуп на чтении (`dedupeExactPropertyRows` уже существует); сам баг — out of scope |
| R4 | `fpc-show-properties` хранится как camunda:property в XML — нельзя молча удалить/изменить данные | Сохранить строку как есть; dropdown-режимы влияют только на display; поведение флага задокументировать в UI.md |
| R5 | Чекбокс #1 мёртвый/uncontrolled — удаление меняет локальное поведение | Не персистится → impact ~0; отметить в PR.md |
| R6 | Изменение selection pipeline (процесс) — риск для decor/overlay | Уже покрыто дизайном feat/process-properties (geometry-safe гарды) |

## 9. Открытые решения (нужен ответ пользователя на review)

- **D1. Судьба контура `feat/process-properties`.** Рекомендация: **absorb** — влить его дизайн в эту ветку как Фазу 3 (один PR вместо двух конфликтующих по NotesPanel/BpmnStage; у него нет ни PR, ни коммитов). Альтернатива: sequence — сначала он, потом rebase.
- **D2. «Kimi design tokens» не существуют в коде.** Рекомендация: использовать существующие `tokens.css` vars + color-mix (это и есть де-факто дизайн-система продукта). Если есть внешняя Kimi token-spec — дайте ссылку/файл, заведу `--kimi-*` как алиасы.
- **D3. Scope chips per-field.** Рекомендация MVP: **per-session** (localStorage, глобально для всех элементов сессии). Альтернатива: per-element (bpmn_meta) — тяжелее, отложить.
- **D4. Хранение To-Be.** Рекомендация MVP: **derived + localStorage** — To-Be-множество хранится per-session в localStorage; badges вычисляются из (To-Be-set × As-Is × Pool). Альтернатива: `bpmn_meta.tobe_by_element_id` (дurable, но меняет save-payload — требует осторожности с CAS). *Гипотеза, требует подтверждения.*
- **D5. Review-гейт runtime `:5180`.** Сейчас не слушает. Поднимать ли :5180-стек перед review-фазой, или review делаем на `stage.processmap.ru` (rule-agent3-fresh-runtime требует :5180 — нужно решение).

## 10. Gates & next steps

1. **Сейчас:** PLAN.md → mirror в Obsidian → **STOP, review пользователя** (ответы D1–D5).
2. После approve: UI.md (component breakdown, state machine, interaction map, token usage, responsive) → API.md (data contracts, event payloads, prop interfaces) → TESTS.md (unit + e2e + a11y + visual regression).
3. Реализация по фазам §5 через TDD (сначала failing test), атомарные коммиты.
4. Review (Agent 3): runtime proof (D5), exact scenario, real drag на canvas; затем `READY_FOR_REVIEW` → push → PR **только по явной команде** (rule-no-pr-without-command). PR.md на русском.
5. No merge / no deploy без явного approve (AGENTS.md §7).

## 11. Discipline checklist (RAG preflight gates)

- [x] GSD discipline recorded (AGENTS.md §1–§8 зеркалированы локально)
- [x] Source/runtime truth captured (§0)
- [x] Bounded scope defined (§4)
- [x] Acceptance criteria defined (§6)
- [x] User rejection facts reviewed (RAG: TO-BE только по документу пользователя — соблюдено, гипотезы помечены)
- [x] No product code written by Planner (Agent 1) — только артефакты `.planning/`
- [x] No merge/deploy/PR — ждём approve

---
*Handoff (§8): цель контура — compact property panel (dropdowns+chips), To-Be builder, process-level properties. As-Is картирован, prior art (feat/process-properties) найден и готов к adoption. Открытые решения D1–D5 — с пользователем. Риски: overlay perf (R1), state ownership (R2), x3 дубли (R3), XML-флаг (R4).*
