# API.md — Property Panel UX Redesign: prop interfaces & events

**Phase UX-1, контур feature/mini-indicator-from-524. Дата: 2026-07-12.**
Принцип: новые компоненты — controlled, thin; вся логика в pure view-models (pure-node тесты). Существующие data-каналы (App.jsx → NotesPanel → ElementSettingsControls) сохраняются; новых backend-данных нет.

---

## 1. Primitives (P0)

### `SegmentedControl.jsx`
```ts
type SegmentedOption = { value: string; label: string; hint?: string };
interface SegmentedControlProps {
  options: SegmentedOption[];          // 2..4
  value: string;                       // controlled
  onChange: (value: string) => void;
  ariaLabel: string;                   // RU, обязателен
  disabled?: boolean;
  size?: "sm" | "md";                  // md=32px (default), sm=28px
  testIdPrefix?: string;               // data-testid={`${testIdPrefix}-segment-${value}`}
}
```
View-model `segmentedControlModel.js` (pure): `nextValueOnKey(current, key, options)` — arrow/Home/End; `assertValidOptions` (dev).

### `ToggleSwitch.jsx`
```ts
interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;                       // visible RU label (справа от track)
  disabled?: boolean;
  testId?: string;
}
```

## 2. Display settings (P1)

### `DisplaySettingsBlock.jsx` (заменяет блок чекбоксов в NotesPanel)
```ts
type DisplayMode = "hover" | "always" | "hidden";
type V2Mode = "compact" | "expanded";           // meaningful only when v2Enabled
interface DisplaySettingsBlockProps {
  displayMode: DisplayMode;                      // derived из showOnSelect/showAlways
  onDisplayModeChange: (mode: DisplayMode) => void;
  v2Enabled: boolean;
  onV2EnabledChange: (enabled: boolean) => void;
  v2Mode: V2Mode;
  onV2ModeChange: (mode: V2Mode) => void;
  perElementFlag: boolean | null;                // null = элемент недоступен/нередактируем
  onPerElementFlagChange: (enabled: boolean) => void;
  disabled?: boolean;
}
```
View-model `displaySettingsModel.js` (pure):
```ts
deriveDisplayMode({ showOnSelect: boolean, showAlways: boolean }): DisplayMode
applyDisplayMode(mode: DisplayMode): { showOnSelect: boolean, showAlways: boolean }
// hidden := {false,false}; hover := {true,false}; always := {*,true} (onSelect не трогаем — сохраняем выбор пользователя)
```

### NotesPanel integration (без новых App-level данных)
```
existing props (App.jsx → NotesPanel) остаются источником:
  showPropertiesOverlayOnSelect / onShowPropertiesOverlayOnSelectChange
  showPropertiesOverlayAlways   / onShowPropertiesOverlayAlwaysChange
  v2OverlaysEnabled / onShowV2OverlaysChange
  v2OverlaysExpanded / onShowV2OverlaysExpandedChange
  showPropertiesFlag (per-element) / setShowPropertiesFlag
NotesPanel: DisplayMode = deriveDisplayMode(...); onChange → applyDisplayMode → 2 вызова setters.
```

## 3. Quick properties (P2)

### `QuickPropertyChip.jsx`
```ts
interface QuickPropertyChipProps {
  name: string;
  value: string;                       // "" → muted «—»
  disabled?: boolean;
  busy?: boolean;
  onCommitValue: (name: string, value: string) => void;   // draft update
  onDelete: (name: string) => void;                        // draft update [Q2]
}
```

### `QuickPropertyChipList.jsx`
```ts
interface QuickPropertyChipListProps {
  chips: Array<{ name: string; value: string }>;   // quickPropertyNames × quickRows (existing derivation)
  quickDefaults: string[];                          // DEFAULT_QUICK_PROPERTY_NAMES
  disabled?: boolean;
  busy?: boolean;
  onCommitValue: (name: string, value: string) => void;
  onDelete: (name: string) => void;
  onAdd: (name: string, value: string) => void;     // addQuickPropertyRow(name, value)
}
```
View-model `quickChipsModel.js` (pure): `buildQuickChips({ names, rows })` — pinned defaults всегда присутствуют (empty → «—» chip, сохраняет текущее pinned-поведение без placeholder-таблицы).

## 4. BPMN properties (P3)

### `BpmnPropertyRow.jsx` (refactor InlineBpmnPropertyRow — API стабилен)
```ts
interface BpmnPropertyRowProps {
  row: { id: string; name: string; value: string };
  disabled?: boolean;
  busy?: boolean;
  onCommit: (rowId: string, patch: { name?: string; value?: string }) => void;  // = updatePropertyRow
  onDelete: (rowId: string) => void;                                             // = deletePropertyRow
}
```
(InlineBpmnPropertyRow остаётся как deprecated-alias на 1 релиз, либо обновляются все call-sites — решение на implementation.)

### `AdditionalBpmnPropertiesSection` (расширение, не замена)
```ts
// новые props:
emptyHint?: string;            // «Нет дополнительных свойств»
addButtonLabel?: string;       // «+ Добавить BPMN-свойство»
deleteMode?: "draft" | "autosave";   // default "draft" после Q2; "autosave" = legacy
```

## 5. Save bar (P4)

### `SaveBar.jsx`
```ts
interface SaveBarProps {
  visible: boolean;              // sidebarGlobalHasChanges
  busy?: boolean;                // sidebarSaveAllBusy
  saveLabel?: string;            // «Сохранить» / «Сохраняю…»
  onSave: () => void;            // = handleSidebarSaveAll (pipeline НЕ меняется)
  onCancel: () => void;          // = handleSidebarResetAll
}
```

## 6. Event payloads (internal, без backend)

| Event | Payload | Consumer |
|---|---|---|
| `displayMode.change` | `{ mode: DisplayMode }` | App.jsx state (2 derived setters) |
| `v2.toggle` | `{ enabled: boolean }` | App.jsx `v2OverlaysEnabled` |
| `v2.mode.change` | `{ mode: "compact"\|"expanded" }` | App.jsx `v2OverlaysExpanded` |
| `quick.commit` | `{ name, value }` | `updateCamundaPropertiesDraft` (existing) |
| `quick.delete` / `bpmn.delete` | `{ rowId }` | draft update (save via SaveBar) |
| `bpmn.add` | `{ name, value }` | `addPropertyRow` (existing) |
| `perElementFlag.change` | `{ enabled }` | `setShowPropertiesFlag` → XML row (existing, G6) |
| `save.click` / `cancel.click` | `{}` | existing `handleSidebarSaveAll` / `handleSidebarResetAll` |

## 7. Invariants (guard-тесты)

1. DisplayMode — единственный источник: `hidden ⇒ overlay cards never render` (ui-copy + unit).
2. `v2Enabled=false ⇒ V2 sub-control not in DOM` (не disabled, а отсутствует).
3. Save pipeline порядок (camunda → documentation → paths → stepTime → robotMeta) неизменен — source-string guard на `handleSidebarSaveAll`.
4. Per-element flag row `fpc-show-properties` пишется в XML — regression e2e (existing spec).
5. `InlineBpmnPropertyRow` commit semantics (Enter/Blur/Escape) — unit + e2e.
