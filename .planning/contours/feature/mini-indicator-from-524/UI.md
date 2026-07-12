# UI.md — Property Panel UX Redesign: component spec

**Phase UX-1, контур feature/mini-indicator-from-524. Дата: 2026-07-12.**
Token discipline: `--kimi-*` в продукте отсутствуют (D2/#524) — используется маппинг на `styles/tokens.css` (PLAN §4). Ниже «token(X)» = X из маппинга.

---

## 1. Component hierarchy

```
SidebarAccordion «Свойства»
├─ propertiesTabTopRow                    [exists, #526 — НЕ трогаем]
│  └─ ExtensionStateMiniIndicator
├─ DisplaySettingsBlock (P1, заменяет sidebarPropertiesDisplaySettings)
│  ├─ SegmentedControl «Свойства над задачей»      [NEW P0]
│  │   segments: При наведении | Всегда | Скрыто   (role=radiogroup)
│  ├─ V2OverlayControl                             [NEW P1]
│  │  ├─ ToggleSwitch «V2-оверлеи»                 (role=switch)
│  │  └─ V2SubControl (collapsible, dependent)
│  │     └─ SegmentedControl: Компактно | Раскрыто
│  └─ PerElementFlagRow                            [P1, G6 — сохранение флага]
│     └─ ToggleSwitch «Показывать над этой задачей» (fpc-show-properties → XML)
├─ CamundaPropertiesSection
│  ├─ QuickPropertiesBlock (P2, заменяет table 1946-2003)
│  │  ├─ BlockHead «Быстрые свойства» + InfoTip
│  │  ├─ QuickPropertyChipList (role=list)
│  │  │  ├─ QuickPropertyChip × N   [NEW P2]
│  │  │  └─ AddPropertyChip «+ Добавить» → QuickAddMiniForm
│  ├─ AdditionalBpmnPropertiesSection (P3)
│  │  ├─ BpmnPropertyRow × N (KV, hover-actions)   [refactor InlineBpmnPropertyRow]
│  │  ├─ AddBpmnPropertyForm (inline, ✓/✕)
│  │  └─ EmptyState «Нет дополнительных свойств»
│  └─ … (Идентификация, listeners, documentation — без изменений)
└─ SaveBar (P4, floating, ≤48px)         [NEW P4, заменяет 2 футера]
   ├─ primaryBtn «Сохранить»
   └─ textBtn «Отмена»
```

## 2. State machines

### 2.1 SegmentedControl (display mode)
```
states: hover | always | hidden   (exactly one)
event SELECT(seg):  → seg; emit onChange(seg); instant preview (draft-level, no save)
mapping (App.jsx, existing states — no new data):
  hover  := showOnSelect=true,  showAlways=false
  always := showAlways=true     (on-select value ignored while always)
  hidden := showOnSelect=false, showAlways=false
keyboard: ←/→ move selection (roving tabindex), Home/End — first/last; focus-visible ring
```

### 2.2 V2OverlayControl
```
toggle: off | on
sub:    compact | expanded   (meaningful only when on)
OFF → ON:  sub-control expands (height 0→auto, ≤200ms ease-out; opacity 0→1 150ms)
ON → OFF:  sub-control collapses; v2OverlaysEnabled=false (sub value persisted, not reset)
a11y: role=switch + aria-checked; Space/Enter toggles; sub-control has aria-hidden when collapsed
```

### 2.3 QuickPropertyChip
```
idle        → hover/focus-within: actions (pencil, ×) opacity 0→1 (150ms)
click chip  → editing: inline input[value] (Enter/Blur=commit draft, Escape=cancel)
click ×     → confirm-free delete to draft (unified with edit; save via SaveBar)   [Q2]
empty value → «{name}: —», dash = token(hint)
a11y: role=listitem; × aria-label="Удалить {name}"; aria-live=polite announces add/remove
```

### 2.4 BpmnPropertyRow (KV)
```
idle → hover: pencil/trash fade-in
click value → input (Enter/Blur commit, Escape cancel)   [поведение = текущий InlineBpmnPropertyRow]
add: text-button → inline form (name+value, ✓ commit / ✕ cancel); new row slide-down (height+opacity ≤200ms)
empty list → muted hint «Нет дополнительных свойств»
```

### 2.5 SaveBar
```
hidden  (sidebarGlobalHasChanges=false)  → не рендерится
visible (hasChanges=true): slide-up ≤150ms; «Сохранить» busy-state «Сохраняю…»;
  success → hide; 409 → draft rollback (existing pipeline, UI не меняет)
```

## 3. Token map & visual spec

| Элемент | Spec |
|---|---|
| SegmentedControl | height 32px; track bg token(panel2), radius 10px, padding 2px; segment radius 8px, 13px/500; active: bg token(bg-elevated) + `0 1px 3px rgba(15,23,42,.08)`, text token(text); inactive: token(muted); gap 2px |
| ToggleSwitch | 32×18px track; off: token(border-strong); on: token(accent); knob 14px white, translateX 14px; transition 150ms |
| V2SubControl | margin-left 8px; padding-left 10px; border-left 2px solid token(border); height transition ≤200ms |
| Chip | height 28px; radius 8px; padding 0 8px; font 13px; bg token(panel2); border 1px token(border); name token(muted) + `: ` + value token(text); empty value token(hint); hover bg `color-mix(in srgb, hsl(var(--accent)) 8%, transparent)` |
| Chip actions | 6px icon buttons, radius 6px; opacity 0→1 150ms; focus-within keeps visible |
| KV row | min-height 32px; label 12px token(muted) left; value 14px token(text) right/below; row gap 8px; section gap 16px |
| SaveBar | position sticky bottom; height ≤48px; border-top 1px token(border); bg token(panel); padding 6px 8px; primary 32px height |
| Typography | body 14px; hints/metadata 12px token(hint); chips 13px |

RU copy (финальная): «При наведении», «Всегда», «Скрыто», «V2-оверлеи», «Компактно», «Раскрыто», «Показывать над этой задачей», «Быстрые свойства», «+ Добавить», «BPMN-свойства», «+ Добавить BPMN-свойство», «Нет дополнительных свойств», «Сохранить», «Отмена».

## 4. Animation specs

| Transition | Duration | Easing |
|---|---|---|
| hover actions opacity | 150ms | ease-out |
| V2 sub-control height/opacity | ≤200ms / 150ms | ease-out |
| add-row slide-down | ≤200ms | ease-out |
| SaveBar slide-up | ≤150ms | ease-out |
| ToggleSwitch knob | 150ms | ease-in-out |

`@media (prefers-reduced-motion: reduce)`: все transitions → 0ms.

## 5. Responsive rules

- Сайдбар 320–420px: chip-row = flex-wrap (chips переносятся, gap 6px); segmented control = равные сегменты, min-width 0, ellipsis на label (labels короткие — помещаются).
- <340px: KV row value переносится под label (stacked).
- Touch (pointer:coarse): hover-actions не работают → actions видимы при `focus-within` + fallback: row tap открывает editing, × остаётся доступен через long-press? **Нет** — на coarse pointers actions рендерятся always-visible (media query), trade-off осознанный.

## 6. a11y checklist

- SegmentedControl: `role=radiogroup` + `role=radio` + `aria-checked`; roving tabindex; arrow/Home/End; `aria-label` на группе.
- ToggleSwitch: `role=switch` + `aria-checked`; Space/Enter.
- Chips: `role=list`/`listitem`; remove `aria-label="Удалить {name}"`; `aria-live=polite` region для add/remove анонсов.
- Inline edit: focus в input при входе; Escape cancel возвращает focus на row; focus trap не нужен (нет модальности).
- Цвет не единственный индикатор: active segment имеет текст+weight; toggle имеет label; статусы — через mini-indicator (#526) с tooltip.
- Все интерактивы: `:focus-visible` ring token(focus-ring).
