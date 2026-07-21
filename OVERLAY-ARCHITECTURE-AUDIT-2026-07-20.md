# Аудит архитектуры overlay'ей: V2 vs Draw.io

Дата: 2026-07-20
Репозиторий: `/Users/mac/PycharmProjects/processmap_canonical_main`, ветка `origin/main` (post-merge PR #572, коммит `e97afc08`)
Режим: read-only, без изменений кода и коммитов.

## Executive summary

**V2 overlay и Draw.io overlay — две РАЗНЫЕ, независимые системы.** Они рендерятся в разных слоях, управляются разными тоглами и не знают друг о друге.

Разноцветные карточки со свойствами, которые пользователь видит на canvas и которые управляются тоглом «V2-оверлеи» — это **V2 overlay** (HTML-карточки через bpmn-js overlays API). Draw.io overlay (SVG-фигуры: rect, container, text, note, раскрашенные через presets после PR #572) — отдельный слой авторских аннотаций, к тоглу V2 отношения не имеет.

Ключевой факт: **V2 overlay УЖЕ окрашивается по property name** — но цвет вычисляется как хеш имени свойства → произвольный HSL-оттенок, а не как фиксированная семантическая карта. Поэтому `ingredient` не обязательно синий, а `ee_time` не обязательно красный: цвета детерминированы, но «случайные» по оттенку. Именно это пользователь воспринимает как «цвета не property-based».

---

## 1. V2 overlay

| Аспект | Значение |
|---|---|
| Что это | Текстовые карточки (badge) со списком свойств элемента: `имя: значение` |
| Компонент | `frontend/src/features/process/bpmn/stage/overlay/v2OverlayRenderer.js` — `createV2OverlayHost()` (строки 64–144) |
| Рендеринг | HTML (`div.fpc-overlay-v2-host`) через bpmn-js `overlays.add()` — `v2OverlayCoordinator.js:203` |
| Тогл в UI | Сайдбар → `frontend/src/components/sidebar/displaySettings/DisplaySettingsBlock.jsx:81` (`ToggleSwitch`, label «V2-оверлеи», testId `v2-toggle`), под-контроль «Компактно/Раскрыто» |
| State | React state в `frontend/src/App.jsx:900-901` (`v2OverlaysEnabled`, `v2OverlaysExpanded`), проброшен через AppShell → NotesPanel → ProcessStage → BpmnStage |
| Цвета | Есть. Акцент карточки и каждой строки свойства — через `overlayPropertyColorByKey(key)` |
| Знает property name | **Да** — именно имя свойства является входом функции цвета |

### Как V2 определяет цвет

`frontend/src/features/process/bpmn/stage/decor/overlayColorModel.js`:

- `overlayPropertyColorByKey(key)` нормализует имя свойства, считает хеш `hash = (hash * 37 + charCode) % 360` и строит палитру `hsl(hash, …)` — accent/background/text/mutedText/separator/shadow.
- Для карточки целиком: `colorKey = content.colorKey || content.meta?.type || "property"` (`v2OverlayRenderer.js:78`).
- `colorKey` формируется в `bpmnOverlayParser.js` → `deriveOverlayColorKey(props, explicitType)`: если у overlay'я есть явный meta-`type` — берётся он, иначе **имя первого не-meta свойства**, иначе `"property"`.
- Для каждой строки свойства отдельно: `makeV2PropertyRow()` (`v2OverlayRenderer.js:9-33`) красит строку через `overlayPropertyColorByKey(prop.name)` в CSS-переменную `--fpc-property-accent`.

То есть механизм «цвет по имени свойства» существует, но оттенок = хеш по модулю 360. Два свойства с близкими именами могут получить совершенно разные цвета, а одно и то же свойство — непредсказуемый оттенок (не «синий» для ingredient, а что угодно).

### Источник данных

`v2OverlayContentResolver.js` → `resolveV2OverlayContent()`: читает `camunda:properties` из `element.businessObject` (через `bpmnOverlayParser.js` → `extractOverlayProperties`), фильтрует meta-свойства (`fpc-overlay-v2`, `fpc-show-properties`, `fpc:overlay:*`) и per-field chips, строит `properties: [{name, value}]`. Также мержится selection preview (`previewMap`).

---

## 2. Draw.io overlay

| Аспект | Значение |
|---|---|
| Что это | Авторские SVG-фигуры поверх диаграммы: rect (shape), container, text, note — рисуются пользователем инструментами |
| Компонент | `frontend/src/features/process/drawio/DrawioOverlayRenderer.jsx` (React-компонент, SVG-слой с `<g dangerouslySetInnerHTML>`) |
| Рендеринг | Отдельный SVG-слой в `ProcessDiagramOverlayLayers.jsx`, поверх `<BpmnStage>`; **не** через bpmn-js overlays API |
| Тогл в UI | Нет — фигуры создаются/редактируются вручную через панель слоёв (LayersPopover) и Draw.io editor modal |
| Цвета | Presets по типу инструмента (PR #572): `drawio/drawioRuntimeStylePresets.js` — shape/blue, container/gray, text/dark, note/yellow; выбранный preset хранится в `row.style` |
| Знает property name | **Нет** — цвет определяется типом инструмента и выбранным пользователем preset'ом, к свойствам BPMN-элемента отношения не имеет |

---

## 3. Связь между V2 и Draw.io

**Системы не связаны. Ни одна не оборачивает другую; mutual exclusion между ними нет — обе могут быть видимы одновременно.**

Доказательства:

- `ProcessDiagramOverlayLayers.jsx` рендерит `<BpmnStage>` (внутри — V2 HTML overlays) и `<DrawioOverlayRenderer>` (SVG-слой) как независимых соседей.
- `buildProcessDiagramOverlayLayersProps.js:84-85` — `v2OverlaysEnabled` передаётся **только** в `bpmnStageProps`; в `drawioOverlayProps` (функция `buildDrawioDiagramOverlayLayersProps`) он не попадает вообще.
- Общего state/context между ними нет; V2 читает `businessObject` BPMN-элементов, Draw.io читает `drawio_elements_v1` rows.

Единственная «связь» — косвенная: тогл V2 **блокирует legacy-режим «Свойства над задачей»** (segmented control принудительно в «Скрыто», `DisplaySettingsBlock.jsx:58-62`, хинт «Скрыто автоматически: включены V2-оверлеи»), и при включении V2 legacy-карточки снимаются с canvas (`BpmnStage.jsx:4703-4714`, `clearPropertiesOverlayDecor`). К Draw.io overlay это отношения не имеет.

---

## 4. Почему цвета не property-based (в понимании пользователя)

1. **Палитра — хеш, а не карта.** `overlayColorModel.js` превращает имя свойства в `hue = hash % 360`. Цвет детерминирован, но семантически произволен: нет маппинга `ingredient → синий`, `container → зелёный`, `ee_time → красный`.
2. **Акцент всей карточки** берётся по `colorKey` — имени **первого** свойства (или meta-type). Карточка с 5 свойствами имеет один общий акцент «по первому свойству»; индивидуально цветными остаются только строки свойств (через `--fpc-property-accent`).
3. **Тогл V2 не перекрашивает Draw.io overlay'и.** Если на скриншоте пользователя разноцветные фигуры — это Draw.io shapes, то тогл V2 на них не влияет никак: их цвет — preset по типу инструмента (схема B, PR #572), что по дизайну не property-based.
4. Если же разноцветные элементы — это V2-карточки, то они уже «property-based», но с хеш-палитрой, что визуально выглядит как хаос.

---

## 5. Как сделать property-based coloring (если нужно)

### Вариант 1 (рекомендуется): фиксированная карта в `overlayColorModel.js` — low сложность

Добавить в `frontend/src/features/process/bpmn/stage/decor/overlayColorModel.js` явный маппинг известных property names → hue/цвет, с fallback на существующий хеш:

```js
const PROPERTY_HUE_MAP = {
  ingredient: 217,  // blue
  container: 142,   // green
  ee_time: 0,       // red
  // ...
};
function hueFromKey(key) {
  const normalized = normalizeOverlayPropertyKey(key) || "property";
  if (normalized in PROPERTY_HUE_MAP) return PROPERTY_HUE_MAP[normalized];
  // fallback: текущий хеш
}
```

- Затрагивает один файл, один чистый модуль; покрывается unit-тестами на `overlayPropertyColorByKey`.
- Сразу даёт фиксированные цвета и строкам свойств, и карточкам (colorKey проходит через ту же функцию).
- Обратная совместимость: неизвестные свойства красятся как раньше.

### Вариант 2: auto-assign Draw.io preset по property name — medium/high сложность

Если требуется красить именно Draw.io-фигуры: при создании overlay'я на элементе смотреть свойства элемента и выбирать preset из `DRAWIO_RUNTIME_STYLE_PRESETS` по карте property→preset. Минус: Draw.io-фигуры свободно позиционируются и не обязаны принадлежать конкретному BPMN-элементу — привязка к свойствам неестественна для их модели данных.

### Вариант 3: ничего не делать

Если достаточно детерминированной хеш-палитры — документировать поведение. Но это не закрывает запрос «ingredient = синий».

---

## 6. Рекомендация

Работать с **V2 overlay** (вариант 1): система уже property-aware, уже включена тоглом, который пользователь реально использует, и изменение локализовано в одном модуле `overlayColorModel.js`. Draw.io overlay (presets, схема B из PR #572) трогать не нужно — это отдельная авторская система аннотаций, её поведение соответствует дизайну.

Коммиты и изменения кода в рамках этого аудита не выполнялись.
