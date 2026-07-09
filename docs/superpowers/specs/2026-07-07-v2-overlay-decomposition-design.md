# Декомпозиция V2 overlay + фикс удалённых свойств

## Контекст

После внедрения «Подхода A» (merge preview map) V2 overlay стал зависеть от одного монолитного файла `overlayLifecycleManager.js`. Любая правка в логике показа, данных или DOM вызывает регрессии в смежных участках.

Также зафиксирован баг: удалённые в сайдбаре BPMN-свойства продолжают отображаться (в overlay и, при определённых условиях, в сайдбаре).

## Цель

1. Разделить V2 overlay lifecycle на 4 модуля с чёткой зоной ответственности.
2. Устранить root cause появления удалённых свойств.
3. Сохранить legacy overlay без регрессий.
4. Покрыть каждый модуль unit-тестами и пройти E2E.

---

## Root cause (доказательства)

### 1. V2 overlay: fallback на modeler/XML при отсутствии элемента в preview map

**Гипотеза C** подтверждена `console.log` и unit-тестом:

```
[mergeV2OverlaysWithPropertyPreview] previewMap keys: [] overlayList count: 1
[mergeV2OverlaysWithPropertyPreview] merged result: 1 fallback from extracted: 1
```

Когда пользователь удаляет **последнее** свойство элемента, `useCamundaPropertiesOverlayPreview` отдаёт `{ enabled: false, items: [] }`. `BpmnStage.jsx` не включает такую запись в комбинированную preview map (строка `if (selected?.enabled === true && asArray(selected?.items).length)`). В результате `mergeV2OverlaysWithPropertyPreview` не видит элемента в preview map и возвращает overlay, извлечённый из modeler/XML, где старое свойство ещё есть.

**Конкретные строки:**
- `frontend/src/components/process/BpmnStage.jsx:1255` — пустой/отключённый preview отфильтровывается.
- `frontend/src/features/process/bpmn/stage/overlay/overlayLifecycleManager.js:401-406` — fallback на `overlayList` для элементов, отсутствующих в preview map.

### 2. Сайдбар: дублирующиеся строки с одинаковым именем

При наличии в `extensionProperties` нескольких строк с одинаковым `name` UI может отображать одну логическую пару «свойство→значение», а `deleteExtensionPropertyRowsByDeleteAction` удаляет только одну строку по `id`. Вторая строка с тем же именем остаётся, и после пересчёта `buildPropertiesOverlayPreview` свойство снова видно.

**Конкретная строка:**
- `frontend/src/components/sidebar/propertyDeleteSemantics.js:20-22` — удаление только по `id`.

### 3. Гидрация meta из BPMN: re-add удалённых managed-свойств

`hydrateCamundaExtensionsFromBpmn` при `sessionHasData === true` всё ещё добавляет в `nextProperties` свойства из BPMN, которых нет в session meta (строки 1450–1467). Если modeler/XML на момент гидрации отстаёт от draft, удалённое свойство возвращается.

---

## Архитектура

```
┌─────────────────────────────────────────────────────────────┐
│                    V2OverlayCoordinator                     │
│  Подписка на события, diff, culling, вызов A → B → C        │
└──────────────┬──────────────────────────────────────────────┘
               │
       ┌───────▼────────┐      ┌──────────────────────┐
       │ V2Overlay      │      │ V2OverlayVisibility  │
       │ ContentResolver│      │ Controller           │
       │ (что показать) │──────▶ (показывать ли)      │
       └────────────────┘      └──────────┬───────────┘
                                          │
                              ┌───────────▼───────────┐
                              │ V2OverlayRenderer     │
                              │ (как рендерить DOM)   │
                              └───────────────────────┘
```

### Модуль A — V2OverlayContentResolver

**Файл:** `frontend/src/features/process/bpmn/stage/overlay/v2OverlayContentResolver.js`

**Ответственность:** только данные.

**Input:**
- `elementId`
- `modeler` / `viewer` instance
- `previewMap` (optional)

**Output:**
```ts
{
  elementId: string,
  source: "preview" | "bpmn" | "none",
  title: string,
  colorKey: string,
  properties: { name: string, value: string }[],
  geometry?: { x, y, width, height },
  explicit?: boolean,
}
```

**Правила:**
- Если preview map содержит элемент (даже `enabled: false` / `items: []`), он авторитетен.
- Если preview map отсутствует — fallback к `extractOverlaysFromBpmn`.
- Не знает про visibility, DOM, toggle.

### Модуль B — V2OverlayVisibilityController

**Файл:** `frontend/src/features/process/bpmn/stage/overlay/v2OverlayVisibilityController.js`

**Ответственность:** только булево «показывать ли».

**Input:**
- `elementId`
- `globalEnabled`
- `selectedElementId`
- `elementState` (`{ width, height, type, hasLegacyOverlay }`)
- `content` (только для проверки `properties.length` / `title`)

**Output:** `boolean`

**Правила:**
- `false` если глобальный toggle выключен.
- `false` если элемент слишком маленький (не sequence flow && < 20px).
- `false` если для элемента уже есть legacy overlay.
- `false` если нет content-а (`properties.length === 0 && !title && !globalEnabled`).

### Модуль C — V2OverlayRenderer

**Файл:** `frontend/src/features/process/bpmn/stage/overlay/v2OverlayRenderer.js`

**Ответственность:** только DOM.

**Input:**
- `element` (bpmn-js element)
- `content`
- `visible: boolean`
- `expanded: boolean`

**Output:** `{ host, position, cleanup }`

**Правила:**
- Создаёт `div.fpc-overlay-v2-host`.
- Рассчитывает позицию (shape / sequence flow midpoint).
- Навешивает hover/expand слушатели.
- `cleanup()` удаляет DOM и слушатели.
- Не знает про preview map, visibility logic.

### Модуль D — V2OverlayCoordinator

**Файл:** `frontend/src/features/process/bpmn/stage/overlay/v2OverlayCoordinator.js`

**Ответственность:** glue code.

**Input:**
- `modeler` / `viewer`
- `previewMapRef`
- `enabledRef`
- `expandedRef`
- `selectedElementRef` (optional)

**Что делает:**
1. Слушает `element.changed`, `canvas.viewbox.changed`, `bpmnModelerSyncEpoch`.
2. Для каждого элемента вызывает `ContentResolver.resolve()`.
3. Передаёт результат в `VisibilityController.isVisible()`.
4. Diff-ит желаемое множество overlay; вызывает `Renderer.render()` / `overlays.remove()`.
5. Ведёт `Map<elementId, { overlayId, contentSig, host }>`.

**Backward compat:** старый `overlayLifecycleManager.js` превращается в тонкий facade, который реэкспортирует `createOverlayLifecycleManager` и `mergeV2OverlaysWithPropertyPreview`, чтобы не сломать импорты.

---

## Фикс удалённых свойств

### Overlay

1. В `BpmnStage.jsx` всегда включать `selectedPropertiesOverlayPreview` в комбинированную preview map, если есть `selectedElementId`, даже если `items` пусты. Это передаёт в ContentResolver сигнал «элемент известен, но свойств нет».
2. В ContentResolver/merge: если preview map содержит элемент, использовать его как авторитетный источник; fallback к BPMN только для элементов, полностью отсутствующих в preview map.

### Сайдбар

1. В `propertyDeleteSemantics.js` удалять не только строку по `id`, но и все строки с тем же логическим именем, если UI сворачивает дубли в одну видимую строку.
2. В `hydrateCamundaExtensionsFromBpmn` при `sessionHasData` не мержить managed `extensionProperties` / `extensionListeners` из BPMN — session meta авторитетна. Сохранить merge только для `preservedExtensionElements`.

---

## Тестирование

### Unit

- `v2OverlayContentResolver.test.mjs`
  - preview override BPMN
  - пустой preview suppresses BPMN content
  - fallback к BPMN, если элемента нет в preview
  - sequence flow midpoint не нужен в resolver (только в renderer)
- `v2OverlayVisibilityController.test.mjs`
  - global toggle off
  - legacy overlay present → false
  - tiny element → false
  - no content → false
- `v2OverlayRenderer.test.mjs`
  - DOM host создаётся
  - hover expand/collapse
  - cleanup удаляет host
- `v2OverlayCoordinator.test.mjs`
  - diff: add/update/remove
  - пустой preview map не приводит к fallback-оверлею
- `propertyDeleteSemantics.test.mjs` дополнить кейсами на удаление по логическому имени.
- `camundaExtensions.test.mjs` (или новый) — hydrate не возвращает удалённые managed-свойства.

### E2E

- `frontend/e2e/bpmn-property-pipeline-smoke.spec.mjs`
- `frontend/e2e/audit-property-duplication.spec.mjs`
- Новый/обновлённый: удаление свойства → исчезает из сайдбара и overlay → сохранение → reload → свойство не возвращается.

---

## Риски и ограничения

- Legacy overlay (`decorManager.js`) не трогаем; V2 должен продолжать уступать ему.
- `mergeV2OverlaysWithPropertyPreview` остаётся публичным для существующих тестов, но реализован через ContentResolver.
- Гидрация `hydrateCamundaExtensionsFromBpmn` затрагивает загрузку BPMN из XML; нужно убедиться, что seed из BPMN (пустой session) продолжает работать.

---

## Done-критерии

- [ ] 4 модуля созданы и имеют unit-тесты.
- [ ] Удалённые свойства не появляются в overlay (включая случай удаления последнего свойства).
- [ ] Удалённые свойства не появляются в сайдбаре после save/reload.
- [ ] Legacy overlay не сломан.
- [ ] `npm run build` успешен.
- [ ] Unit tests: 229+/230 (pre-existing failure не затронут).
- [ ] E2E по property pipeline проходит.
