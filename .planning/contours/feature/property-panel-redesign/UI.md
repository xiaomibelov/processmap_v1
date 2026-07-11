# UI: Property Panel Redesign

**Contour:** `feature/property-panel-redesign` · спецификация для Фаз 0–4 · ссылки на As-Is — по `origin/main@03090852`

## 1. Компонентная декомпозиция

Единый cohesive settings-panel внутри аккордеона «Свойства» (`NotesPanel.jsx:3163-3164`), заменяет блок `.sidebarPropertiesDisplaySettings` (`NotesPanel.jsx:3168-3224`) и оборачивает builder.

```
«Свойства» accordion (NotesPanel.jsx)
└─ PropertyPanel .................................... NEW, cohesive shell
   ├─ LiveCardPreview ............................... NEW — карточка оверлея как на canvas (верх панели)
   ├─ PropertyDisplaySettings ....................... NEW — заменяет 5 чекбоксов
   │  ├─ DisplayModeSelect .......................... NEW — dropdown + inline hint
   │  ├─ V2ModeSelect ............................... NEW — dropdown + inline hint
   │  └─ FieldChips ................................. NEW — chips per-field visibility
   ├─ ToBeBuilder ................................... NEW
   │  ├─ SummaryPills ............................... NEW — «X in To-Be / Y skipped»
   │  ├─ AsIsList ................................... NEW — строки + StatusBadge
   │  └─ PoolList ................................... NEW — строки + StatusBadge + action «+»
   └─ CamundaPropertiesSection ...................... EXISTING (NotesPanel.jsx:3225-3262) — CRUD без изменений
```

Режим процесса (Фаза 3): при process-like selection — шапка сайдбара «Процесс: {name||id}» (место: `SelectedElementCard.jsx:63-64`), в аккордеоне «Свойства» группа «Свойства процесса» (та же `CamundaPropertiesSection`, id-generic), остальные секции скрыты по гейту из дизайна `feat/process-properties` §5.

## 2. State machine

### 2.1 Новая модель (заменяет 5 стейтов App.jsx:895-897 + мёртвый #1)

```
displayMode : "hover" | "always" | "hidden"      // legacy overlay pipeline
v2Mode      : "none" | "all" | "expanded"        // V2 overlay pipeline
visibleFields : Set<propertyName>                // per-field (chips), per-session (D3)
```

**Независимые оси** (dropdown гарантирует radio-семантику, недопустимые комбо невозможны):
- `displayMode=hidden` — legacy-оверлеи не показываются (ни hover-preview, ни always).
- `v2Mode="expanded"` ⊂ «V2 включены» — нет отдельного disabled-чекбокса (As-Is #5 зависел от #4).
- V2 ≠ none → V2-пайплайн подавляет legacy decor на canvas (существующее поведение `BpmnStage.jsx:4701-4708`, сохраняется).
- Per-element флаг `fpc-show-properties` (As-Is #3) — **display-override**: элемент с флагом показывает legacy-карточку независимо от `displayMode` (кроме `hidden`, который глобален). Данные не трогаем (R4). Precedence-таблица — в API.md §5.

### 2.2 Миграция старого стейта (Фаза 0)

| As-Is | Источник | → Новая модель |
|---|---|---|
| #1 «при выделении» (мёртвый uncontrolled) | — | dropped; покрывается `displayMode=hover` (default) |
| #2 «Всегда…» | localStorage `fpc_properties_overlay_always_v1:{sid}` | `true → always`, `false/absent → hover` |
| #3 `fpc-show-properties` | property-строка в XML | **без миграции** — остаётся data-флагом, только display-семантика |
| #4 «Все V2…» | `v2OverlaysEnabled` (не персистился) | default `none` |
| #5 «…раскрытыми» | `v2OverlaysExpanded` (не персистился) | `all` / `expanded` |

Новый persisted-ключ (per-session): `fpc_overlay_display_v1:{sid}` = `{ displayMode, v2Mode, visibleFields }`. Старые ключи не удаляются (read-only миграция, rollback-safe).

### 2.3 Владение стейтом

- Фаза 0: единый `useOverlayDisplaySettings(sessionId)` — **один** state object в `App.jsx` вместо 5 (минимальная интрузия; drill-цепочка App→AppShell→ProcessStage→BpmnStage сохраняется, сужается до 1 пропа).
- Overlay-пайплайны уже читают через refs (`BpmnStage.jsx:1070-1072`) → canvas не ре-маунтится на тоггл. Если замеры покажут jank (R2) — Фаза 4: вынести в context у canvas.

## 3. Interaction map

| Действие | Результат |
|---|---|
| Клик по пустому canvas | (Фаза 3) selection = root process → сайдбар «Процесс: …», группа «Свойства процесса» |
| Выбор элемента | LiveCardPreview обновляется из draft (без save) — существующий `useCamundaPropertiesOverlayPreview` |
| Редактирование свойства (draft) | LiveCardPreview + AsIsList обновляются live; pills пересчитываются |
| Смена `displayMode` | refs → re-apply decor (существующий эффект `BpmnStage.jsx:1235-1250`); localStorage write |
| Смена `v2Mode` | V2 mount-эффект (`BpmnStage.jsx:4676-4722`) пересобирает V2; при v2≠none legacy decor очищается |
| Клик/Space/Enter по chip | поле toggled в `visibleFields` → overlay preview фильтруется по имени (preview-level, данные не трогаются) |
| «+» на Pool-строке | `addPropertyRow(name)` (существующий `useBpmnPropertiesController.js:212-214`) → draft → AsIsList с badge «Added»/«In To-Be» |
| Удаление свойства ∈ To-Be | переходит в Pool с badge «Removed» (tracked, API.md §4); delete-семантика (автосейв) не меняется |
| Hover по canvas (root) | (Фаза 3) `fpcCanvasProcessHoverHint` — tint фона canvas |

## 4. Token usage (без hardcoded colors, AC12)

Реальная система — `styles/tokens.css` (HSL-каналы, `:root,.light` / `.dark`), потребление `hsl(var(--x))`. Маппинг:

| Элемент | Токен |
|---|---|
| Поверхность панели/карточек | `hsl(var(--panel))` / `hsl(var(--panel2))` |
| Текст / вторичный / hint | `hsl(var(--text))` / `hsl(var(--muted))` / `hsl(var(--hint))` |
| Chip **active**: заливка (black per spec) | `hsl(var(--text))`; checkmark — `hsl(var(--bg))` |
| Chip **inactive**: outline | `1px solid hsl(var(--border))`, текст `hsl(var(--muted))`, **без checkmark** |
| Chip hover tint | `color-mix(in srgb, hsl(var(--text)) 8%, transparent)` |
| Select border / focus ring | `hsl(var(--border))` / `hsl(var(--ring))` или `hsl(var(--focus))` |
| Badge «In To-Be» | `hsl(var(--accent))` + tint `color-mix(in srgb, hsl(var(--accent)) 14%, transparent)` |
| Badge «Added» | `hsl(var(--success))` + tint |
| Badge «Removed» | `hsl(var(--danger))` + tint |
| Badge «Not filled» | `hsl(var(--muted))` + tint |
| LiveCardPreview рамка/тень | `hsl(var(--border))` / `--shadow-*` из tokens.css |
| Process hover hint (canvas tint) | `color-mix(in srgb, hsl(var(--accent)) 6%, transparent)` (в `05-02-bpmn-text-contrast.css`, рядом с существующими BPMN-правилами) |

Dark theme: все токены имеют `.dark`-варианты в tokens.css → новые стили наследуют dark бесплатно; отдельных dark-правил не писать (проверить визуально, TESTS.md §5).

## 5. Responsive / density

- Сайдбар 300–520px (`useSidebarWidth.js`, default 380). Все контролы — fluid, фиксированных px-ширин не вводить.
- Selects: `width: 100%`; chips: `flex-wrap: wrap; gap: 6px`.
- Density: шаг 4/8px по существующим sidebar-паттернам (`05-01-leftpanel-cards.css`); padding карточек 8–10px; без лишних отступов (spec: dense, no excessive whitespace).
- LiveCardPreview: `max-height` + `overflow:auto` при >6 строках.
- Pool/As-Is списки: виртуализация не нужна (≤ десятков строк); при >30 — scroll-контейнер.

## 6. Keyboard & a11y (AC11)

- **Selects**: нативный `<select>` (рекомендация) — keyboard/SR из коробки; styled через токены. Если потребуется custom listbox — `role=listbox` + `aria-expanded` + roving.
- **Chips**: `<button aria-pressed>`; фокус — `focus-visible` ring `hsl(var(--ring))`; Space/Enter toggle; checkmark — декоративный (`aria-hidden`), состояние озвучивается через `aria-pressed`.
- **Списки**: строки — `role=listitem` в `role=list`; action «+» — кнопка с `aria-label="Добавить {name} в To-Be"`.
- **Badges**: `role=status` не нужен (статичны); текстовый лейбл обязателен (не только цвет).
- **Tab-порядок**: preview (нефокусируемый) → display select → v2 select → chips → pills (нефокусируемые) → As-Is → Pool → CRUD.
- Все лейблы — RU (§7).

## 7. Russian UI copy (финальные строки)

| Контрол | Лейбл | Опции / hint |
|---|---|---|
| DisplayModeSelect | «Свойства над задачей» | «При выделении» — hint «Карточка появляется при выделении элемента» · «Всегда» — hint «Карточки видны над всеми задачами» · «Скрыты» — hint «Оверлеи не показываются» |
| V2ModeSelect | «V2-оверлеи» | «Нет» — hint «V2-оверлеи выключены» · «Все» — hint «Компактные карточки над всеми элементами» · «Раскрытые» — hint «Карточки показаны полностью» |
| FieldChips | «Поля в оверлее» | chip = имя поля; active = заливка + ✓ |
| LiveCardPreview | «Превью оверлея» | пустое состояние: «У элемента нет свойств» |
| ToBeBuilder | «To-Be» | pills «{X} in To-Be / {Y} skipped» |
| AsIsList | «Настроено» | badges «In To-Be» / «Added» |
| PoolList | «Не заполнено» | badges «Not filled» / «Removed» + action «+» |
| Process header | «Процесс: {name‖id}» | группа «Свойства процесса» |

Термины To-Be/As-Is/Pool/badges/pills — строго по документу пользователя (RAG decision: без выдуманных терминов).

## 8. Что НЕ меняется визуально

- CRUD-секция свойств (`CamundaPropertiesSection` / `ElementSettingsControls`) — строки, inline-edit, quick-add: без изменений.
- Карточки оверлеев на canvas (legacy + V2) — контент/стиль прежние; меняется только фильтр по полям и источник enabled-флага.
- Футер сайдбара «Сохранить всё» / «Сбросить» — без изменений (семантика «двух сохранений» — отдельный аудит, не этот контур).
