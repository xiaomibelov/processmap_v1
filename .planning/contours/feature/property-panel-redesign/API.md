# API: Property Panel Redesign

**Contour:** `feature/property-panel-redesign` · data contracts / events / prop interfaces / validation
**Backend:** **без изменений** (GET/PUT `/api/sessions/{id}/bpmn`, PATCH meta — как есть; CAS `diagram_state_version` не затрагивается, т.к. D4 = localStorage).

## 1. Data contracts

### 1.1 `OverlayDisplaySettings` (новая модель, Фаза 0)

```js
/** @typedef {"hover"|"always"|"hidden"} DisplayMode */
/** @typedef {"none"|"all"|"expanded"} V2Mode */
/**
 * @typedef {Object} OverlayDisplaySettings
 * @property {DisplayMode} displayMode      // legacy overlay pipeline
 * @property {V2Mode} v2Mode                // V2 overlay pipeline
 * @property {string[]} hiddenFields        // скрытые поля chips (имена свойств); поля активны по умолчанию
 */
```

- Персистентность (per-session, D3): localStorage `fpc_overlay_display_v1:{sid}` — JSON целиком.
- Defaults: `{ displayMode: "hover", v2Mode: "none", hiddenFields: [] }`.
- Семантика opt-out: поле скрыто из оверлея только если явно в `hiddenFields`; новые поля (кастомное свойство элемента, обновление словаря) видны по умолчанию.
- Миграция: при отсутствии нового ключа читать `fpc_properties_overlay_always_v1:{sid}` (builder ключа `App.jsx:300-303`): `true → displayMode="always"`, иначе `"hover"`. Старый ключ не удалять.

### 1.2 `ToBeState` (D4: derived + localStorage, per-session)

```js
/**
 * @typedef {Object} ToBeState
 * @property {string[]} toBe      // целевой набор имён свойств (To-Be set)
 * @property {string[]} removed   // имена, удалённые пользователем из настроенных (для badge «Removed»)
 */
```

- localStorage `fpc_tobe_v1:{sid}`.
- **Derived model** (вычисляется, не хранится):

```
asIsNames   = dedup(configured property names элемента)          // из draft rows, dedup против x3 (R3)
poolNames   = dictionaryNames ∪ toBe  \  asIsNames               // словарь организации + To-Be
inToBe      = toBe ∩ asIsNames          → badge «In To-Be»
added       = asIsNames \ toBe          → badge «Added»
skipped     = toBe \ asIsNames          → pill Y; badge: removed∋name ? «Removed» : «Not filled»
pills       = "|inToBe| in To-Be / |skipped| skipped"
```

- Источник словаря: `orgPropertyDictionaryBundle` / `propertyDictionaryModel.js` (data-driven; канона 7 типов в коде нет — не хардкодить).
- Badge «Added» показывается только если элемент сконфигурирован вне toBe-set (ad-hoc свойство).

### 1.3 `FieldChip` / источник полей

```js
/** @typedef {{ name: string, label: string, active: boolean }} FieldChip */
```

- Источник имён: union(имена свойств выбранного элемента, имена из словаря организации, `DEFAULT_QUICK_PROPERTY_NAMES` = `["ee_time","ingredient_value"]` — `useBpmnPropertiesController.js:13`).
- `hiddenFields` — глобальный per-session фильтр (не per-element, D3).
- Фильтрация — **preview-level**: `filterRowsByHiddenFields(rows, hiddenFields)` применяется к rows preview (pre-slice в `buildPropertiesOverlayPreview`), НЕ к draft/XML. Поле скрыто из оверлея ≠ свойство удалено.

### 1.4 Process selection (Фаза 3, adoption `feat/process-properties`)

- `resolveProcessLikeRootElement(bpmnInstance)` → djs element | null (`processRootSelection.js`, готовый, pure).
- Selection payload — существующий объект из `App.handleBpmnElementSelect` (`App.jsx:2077-2089`); process root проходит по тому же пути, без новых полей. Тип — через `isProcessLikeType(bo.$type)`.

## 2. Events / payloads

| Событие | Payload | Потребители |
|---|---|---|
| `onDisplaySettingsChange(settings)` | `OverlayDisplaySettings` | App → refs (`BpmnStage.jsx:1070-1072`) → legacy decor; V2 mount-эффект (`:4676-4722`) |
| `onHiddenFieldsChange(names)` | `string[]` | preview memos `App.jsx:1377-1409` + V2 `previewMap` (`:4679-4685`) — через общий `filterRowsByHiddenFields` (pre-slice) |
| `onToBeChange(state)` | `ToBeState` | ToBeBuilder derived model (local) |
| overlay preview (существующий) | `onPropertiesOverlayPreviewChange` / `onPropertiesOverlayAlwaysPreviewChange` (`App.jsx:3360-3361`) | без изменений; на вход preview добавляется field-фильтр |
| selection (существующий) | `emitElementSelection(element, source)` — `elementSelectionEmitter.js` | Фаза 3: источник `"<kind>.canvas_process_select"` |

## 3. Prop interfaces (JSDoc-контракты новых компонентов)

```jsx
// PropertyDisplaySettings — замена блока NotesPanel.jsx:3168-3224
/** @param {{
 *   settings: OverlayDisplaySettings,
 *   fields: FieldChip[],
 *   onDisplayModeChange: (m: DisplayMode) => void,
 *   onV2ModeChange: (m: V2Mode) => void,
 *   onToggleField: (name: string) => void
 * }} props */

// DisplayModeSelect / V2ModeSelect — нативный <select> + hint
/** @param {{ value: string, options: {value:string,label:string,hint:string}[],
 *            onChange: (v:string)=>void, ariaLabel: string }} props */

// FieldChips
/** @param {{ chips: FieldChip[], onToggle: (name:string)=>void }} props */

// LiveCardPreview — рендер существующего preview (buildPropertiesOverlayPreview output)
/** @param {{ preview: object|null, elementName?: string }} props */

// ToBeBuilder
/** @param {{
 *   asIs: {name:string, value:string, badge:"In To-Be"|"Added"}[],
 *   pool: {name:string, badge:"Not filled"|"Removed"}[],
 *   inToBeCount: number, skippedCount: number,
 *   onAddFromPool: (name:string)=>void,     // → addPropertyRow(name)
 *   onToggleToBe: (name:string)=>void
 * }} props */
```

Подключение к NotesPanel: `PropertyPanel` получает уже собранные данные (container-логика — hook `usePropertyPanelModel` рядом с `useElementSettingsController`), существующие пропсы `CamundaPropertiesSection` не меняются.

## 4. Validation schema (untrusted input)

- `readOverlayDisplaySettings(raw)`:
  - `displayMode ∉ {hover,always,hidden}` → `"hover"`;
  - `v2Mode ∉ {none,all,expanded}` → `"none"`;
  - `hiddenFields`: не массив → `[]` = «ничего не скрыто»; элементы не-string → отбросить; дедуп.
- `readToBeState(raw)`: `toBe`/`removed` — массивы string, дедуп, пересечение `toBe∩removed` разрешено (removed ⊂ skipped вычисляется).
- Запись всегда после валидации (round-trip safe).
- Имена свойств санитизируются через существующий `asText`/`toText` хелпер (используется в sidebar-контроллерах).

## 5. Precedence-таблица overlay (display-семантика, Фазы 0–3)

Условия показа legacy-карточки для элемента E:

| displayMode | E имеет `fpc-show-properties` | v2Mode | Результат для E |
|---|---|---|---|
| hidden | любое | none | скрыто |
| hover | нет | none | карточка только при выделении E (существующий hover-preview) |
| hover | да | none | карточка всегда (per-element override) |
| always | любое | none | карточка всегда |
| любое | любое | all / expanded | V2-пайплайн владеет canvas (legacy decor очищен, `BpmnStage.jsx:4701-4708`); per-field фильтр применяется и к V2 |

- Поле скрыто chip'ом → строка отсутствует в карточке (и legacy, и V2); если скрыты все поля элемента → карточка не рендерится.
- Процесс-root (Фаза 3): карточка для root **не рендерится никогда** (гарды `decorManager.js` / `bpmnOverlayParser.js` из adopted-дизайна).

## 6. Контракты, которые НЕ меняются

- `PUT /api/sessions/{id}/bpmn` — тело/заголовки как в `saveBpmnState.js:119`; `source_action` значения прежние.
- `bpmn_meta.camunda_extensions_by_element_id`, `presentation_by_element_id` — читаются; записываются только существующими путями.
- `fpc-show-properties` — чтение/запись строки как сегодня (тоггл As-Is #3 удалён из UI; строка в XML сохраняется и продолжает работать как override, §5).
- Формат XML `camunda:properties` / `zeebe:properties` — контур их не пишет (x3-фикс — отдельный контур).
