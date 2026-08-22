# TESTS.md — Property Panel UX Redesign: test plan

**Phase UX-1, контур feature/mini-indicator-from-524. Дата: 2026-07-12.**
Discipline: новые unit-тесты — pure-node (`node --test`); e2e — stage (`:5177`/`:8011`), specs 25s–2.5min, generous timeouts.

---

## 1. Unit (pure-node)

| Файл | Что проверяет |
|---|---|
| `segmentedControlModel.test.mjs` | nextValueOnKey: ←/→/Home/End, wrap-around, disabled options skip; invalid options → dev assert |
| `displaySettingsModel.test.mjs` | deriveDisplayMode × all combos (4 входа → 3 режима); applyDisplayMode: hidden={F,F}, hover={T,F}, always={*,T} + onSelect preserved; round-trip |
| `quickChipsModel.test.mjs` | buildQuickChips: pinned defaults всегда; value → chip; "" → empty chip (dash flag); порядок = defaults first |
| `v2SubControlModel.test.mjs` (если выделен) | collapsed ⇒ not rendered; expanded state persisted across toggle off/on |
| ui-copy source-тесты (`*.ui-copy.test.mjs`) | RU labels всех компонентов (AC7), token-only CSS grep (no `#hex`, no `rgb(` кроме rgba-совместимых legacy — whitelist), `role=radiogroup/switch`, aria-labels |

## 2. E2E — новый spec `e2e/property-panel-ux.spec.mjs`

Boot: helpers из `extension-state-mini.spec.mjs` (org pin, `originalEvent.button===0` click, raw-XML GET).

| # | Сценарий | Assertions |
|---|---|---|
| T1 | **Segmented keyboard** | focus → ArrowRight меняет режим; `aria-checked` переключается; overlay card появляется/исчезает instant (без save) |
| T2 | **DisplayMode instant preview** | «Всегда» → карточки над всеми задачами без reload; «Скрыто» → 0 карточек; «При наведении» → только selected |
| T3 | **V2 toggle dependency** | OFF → sub-control отсутствует в DOM (`toHaveCount(0)`); ON → height transition завершается, «Компактно/Раскрыто» кликабельны; повторный OFF → sub скрыт, значение сохранено при ON |
| T4 | **Chip hover actions** | hover chip → pencil/× видимы (opacity 1); blur → скрыты; keyboard focus (Tab) → actions видимы (focus-within) |
| T5 | **Chip inline edit** | click chip → input; Enter commit → draft (mini indicator → dirty); Escape → откат значения |
| T6 | **Chip empty value** | pinned default без значения → chip «ee_time: —», dash имеет muted class |
| T7 | **Add quick property** | «+ Добавить» → mini-form; ✓ → новый chip появляется (slide-down); ✕ → form закрыт без изменений |
| T8 | **BPMN KV inline edit + delete** | click value → edit → Enter; delete → row исчезает, **mini indicator → dirty** (draft-only, Q2); XML НЕ изменился до SaveBar |
| T9 | **BPMN empty state** | элемент без additional props → hint «Нет дополнительных свойств»; add-form ✓ → row появляется, hint скрыт |
| T10 | **SaveBar visibility** | нет изменений → SaveBar отсутствует; edit → SaveBar slide-up ≤48px; «Сохранить» → PUT /bpmn 200, indicator saved, bar скрыт; XML содержит значение |
| T11 | **Per-element flag (G6)** | toggle «Показывать над этой задачей» → SaveBar → XML содержит/не содержит `fpc-show-properties` |
| T12 | **a11y sweep** | radiogroup/switch roles; Space на toggle; `aria-live` анонс add; focus-visible ring присутствует; console problems == [] |

## 3. Regression suite (stage, каждый phase-gate)

| Spec | Ожидание |
|---|---|
| `process-properties.spec.mjs` | 5/5 |
| `extension-state-mini.spec.mjs` | 2/2 |
| `v2-overlay-persistence.spec.mjs` | 3/3 |
| Unit sweep vs baseline main | 51=51, comm -13 пусто |
| `sidebarRedesignFoundation.test.mjs` | 10/10 |
| `npm run build` | EXIT=0 (лог-файл, не pipe) |

## 4. Phase gates

| Gate | Критерий |
|---|---|
| G-P0 | primitives unit ✓, build ✓ |
| G-P1 | T1-T3 ✓ + regression ✓ |
| G-P2 | T4-T7 ✓ + regression ✓ |
| G-P3 | T8-T9 ✓ + regression ✓ |
| G-P4 | T10-T12 ✓ + полный regression ✓ → PR-ready |

## 5. Known flakes / lessons (reuse)

- org-chooser: pin `fpc_active_org_id` + poll loop (settleOrgChooser).
- synthetic click: `originalEvent: { button: 0 }` (isPrimaryButton gate).
- GET /bpmn → raw XML (`res.text()`).
- Additional-section delete на main = auto-save → T8 осознанно меняет поведение (Q2); spec пишется под draft-only.
- Pre-existing console warning «Maximum update depth exceeded» — фильтр как в extension-state-mini.spec.
