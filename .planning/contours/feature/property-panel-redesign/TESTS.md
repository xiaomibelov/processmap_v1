# TESTS: Property Panel Redesign

**Contour:** `feature/property-panel-redesign` · маппинг на AC1–AC13 (PLAN.md §6)
**Runners:** unit = `node --test "src/**/*.test.mjs"` (jsdom, 404 файла в baseline) · e2e = Playwright (`playwright.config.mjs`, 1 worker, boot из `v2-overlay-persistence.spec.mjs:119-147`) · build = `npm run build`

## 1. Unit tests (новые файлы, node:test)

| Файл | Покрывает | Кейсы |
|---|---|---|
| `src/components/sidebar/displaySettings/overlayDisplaySettings.test.mjs` | AC2, AC3, AC12-инварианты модели | defaults; миграция `fpc_properties_overlay_always_v1` (true→always / absent→hover); validation untrusted JSON (мусор → defaults); round-trip write/read; expanded⊂enabled инвариант |
| `src/components/sidebar/displaySettings/fieldChipsModel.test.mjs` | AC4 | union источников имён (элемент ∪ словарь ∪ quick pins); dedup; toggle on/off; «все скрыты» → preview пуст |
| `src/components/sidebar/displaySettings/filterRowsByHiddenFields.test.mjs` | AC4, AC5 | preview rows фильтруются по имени (opt-out); порядок сохраняется; поля активны по умолчанию; не меняет исходные данные (immutable) |
| `src/components/sidebar/toBe/toBeBuilderModel.test.mjs` | AC6–AC8 | derived: inToBe/added/skipped/pills; badge «Removed» vs «Not filled» (removed-tracked); add из Pool → asIs; дубли x3 во входных строках → dedup |
| `src/features/process/bpmn/stage/interaction/processRootSelection.test.mjs` | AC9 | (adopted) process root → element; collaboration root → element; subprocess drill-down root → null; нет definitions → null; fallback definitions.rootElements[0] |
| расширение `src/components/process/utils/bpmnOverlayParser.test.mjs` | AC10 | process-like root с properties исключён из `extractOverlaysFromBpmn` (adopted-дизайн §7) |
| расширение `src/features/process/bpmn/stage/decor/decorManager.test.mjs` | AC10 | process-root id в always-map → карточка не строится |

Существующие тесты, которые НЕ должны сломаться (регрессионный периметр): `propertyDeleteSemantics.test.mjs`, `useElementSettingsController.delete-semantics.test.mjs`, `sidebarQuickAddSync.test.mjs`, `camundaExtensions*.test.mjs`, `camundaPresentation.test.mjs`, `saveBpmnState.property-pipeline.test.mjs`, `v2Overlay*.test.mjs`, `wireBpmnStageRuntimeEvents.context-menu-owner.test.mjs`, `sidebarRedesignFoundation.test.mjs` (380/300/520 — сайдбар не трогаем).

## 2. Integration / jsdom (по существующим паттернам)

- `propertyDisplaySettings.ui-copy.test.mjs` (по образцу `ElementSettingsControls.ui-copy.test.mjs`): рендер labels/hints RU из UI.md §7; нативный select содержит 3 опции с правильными value; disabled-опций нет.
- `fieldChips.a11y.test.mjs`: каждый chip — `button[aria-pressed]`; toggle по клику/keyboard меняет `aria-pressed`; checkmark-нода `aria-hidden="true"`; inactive chip без checkmark-ноды.
- `toBeBuilder.badges.test.mjs`: pills текст «X in To-Be / Y skipped»; badge-лейблы присутствуют текстом (не только цвет).
- `camundaPropertiesSectionMemo.test.mjs` — расширить: props-мемоизация не ломается при смене display settings (нет лишних ре-рендеров CRUD-секции — R2 smoke).

## 3. E2E — `frontend/e2e/property-panel-redesign.spec.mjs`

Boot: `apiLogin` → `createFixture` (quick_skeleton, seed XML с 2 задачами: одна с `ee_time`+`ingredient_value`, вторая без свойств) → `setUiToken` → org pin → `waitForDiagramReady` → открыть сайдбар (`left-sidebar-handle`) → аккордеон properties (`.sidebarAccordion[data-section-id="properties"]`).

| # | Сценарий | AC |
|---|---|---|
| 1 | В аккордеоне: 2 select + chips-строка; 5 старых чекбоксов отсутствуют; hints видны | AC1, AC2 |
| 2 | displayMode «Всегда» → legacy-карточки над задачами; reload страницы → режим сохранился (per-session) | AC3 |
| 3 | Старый ключ: pre-seed localStorage `fpc_properties_overlay_always_v1:{sid}=true` (init-script) → после загрузки select = «Всегда» | AC3 |
| 4 | Снять chip `ee_time` → карточка задачи без строки ee_time; вернуть → строка назад; то же в V2 (`v2Mode=all`) | AC4 |
| 5 | v2Mode «Раскрытые» → V2 expanded класс на хостах; legacy decor отсутствует на canvas | AC4, AC5 |
| 6 | Live preview: редактировать значение свойства в draft (без save) → preview обновился | AC6 |
| 7 | To-Be: добавить поле из Pool («+») → строка появилась в CRUD draft; pills пересчитались; «Сохранить всё» → `GET /bpmn` содержит свойство | AC7, AC8 |
| 8 | Клик по пустому canvas → сайдбар «Процесс: …»; add property → save → XML: `<camunda:property>` под `<bpmn:process>`; reload → свойство на месте; edit + delete → XML отражает | AC9 |
| 9 | Регрессия: task select → CRUD как раньше; Escape → deselect; subprocess drill-down canvas-click = старое поведение; карточки root нет ни в legacy, ни в V2 | AC10 |
| 10 | Keyboard: Tab-порядок по панели; Space на chip переключает; select управляется стрелками; фокус-ring виден | AC11 |
| 11 | Perf-guard (R1): DOM-ноды `.fpcPropertyOverlay`/`.fpc-overlay-v2-host` при toggle chips не растут (baseline ±0); console без errors; network без 4xx/5xx | R1 |

Post-deploy запуск на stage — как `playwright.post-deploy.config.mjs` (env `E2E_APP_BASE_URL`/`E2E_API_BASE_URL`).

## 4. Baseline & build gates

- `node --test "src/**/*.test.mjs"` — полный sweep, результат не хуже baseline (последний contour: 53=53; зафиксировать `/tmp/fails_main.txt` до старта Фазы 0).
- `npm run build` — зелёный.
- Foundation guard (из adopted-дизайна §10) — 10/10.
- `git diff --stat` по окончании каждой фазы — только файлы контура (§4 scope).

## 5. Visual regression checklist (ручной, скриншоты в EXEC_REPORT)

1. Аккордеон «Свойства» до/после (5 чекбоксов → compact).
2. Chips: active/inactive/hover/focus-visible — light + dark.
3. Оба select закрыты/открыты, hint-строки.
4. LiveCardPreview: пустое состояние / 1 свойство / 6+ строк (scroll).
5. ToBeBuilder: badges ×4, pills; пустой Pool.
6. Canvas: legacy always / V2 all / V2 expanded / chips-фильтр — parity с pre-redesign скриншотами (AC5).
7. Процесс: шапка «Процесс: …», hover-hint tint на canvas, root без карточки.
8. Сайдбар 300px (min) и 520px (max) — ничего не ломается, chips переносятся.

## 6. a11y assertions (AC11)

- [ ] Все интерактивные элементы достижимы по Tab в порядке UI.md §6.
- [ ] Chips: `aria-pressed` отражает состояние; Space/Enter toggle.
- [ ] Selects: `aria-label` RU; hint связан через `aria-describedby`.
- [ ] Badges имеют текстовые лейблы; pills — текст.
- [ ] `focus-visible` ring на всех контролах (токен `--ring`/`--focus`).
- [ ] Screen-reader проходка (VoiceOver): панель озвучивается как единая группа «Настройки отображения свойств»; chip toggle озвучивает «включено/выключено».
- [ ] Контраст: active chip (заливка `--text` на `--panel`) ≥ 4.5:1 в light и dark.

## 7. Review-гейт (Agent 3, после реализации)

- Runtime proof: свежий runtime (D5: :5180 если поднят, иначе stage.processmap.ru — решение пользователя), `curl -I` 200 + no-cache (rule-agent3-fresh-runtime).
- Exact scenario: воспроизвести §3 сценарии 1–11 по шагам (rule-agent3-exact-scenario).
- Real drag на canvas с включёнными оверлеями — без jank-регресса (rule-agent3-real-drag).
- 5-plane proof: code (ветка/commit), workspace (worktree path), DB (localStorage + XML после сценариев), env (compose стейджа), serving mode.
- Результат → `REVIEW_REPORT.md` + `READY_FOR_REVIEW` → push → PR **только по команде пользователя** (rule-no-pr-without-command).
