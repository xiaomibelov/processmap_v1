# ProcessMap — UI/UX Specification
## Реестр действий (Product Actions Registry) + Реестр свойств (Properties Registry)

**Version:** 1.0  
**Status:** Approved design direction  
**Scope:** Analytics → Registry pages  
**Constraint:** Single-container, no-visual-noise, backend-driven view-model, honest empty/source states.

---

## 1. Design Tokens

### 1.1 Colors
| Token | Hex | Usage |
|---|---|---|
| `--bg-canvas` | `#F5F5F5` | Page background behind containers |
| `--bg-surface` | `#FFFFFF` | Main white container |
| `--text-primary` | `#1A1A1A` | Headings, primary table text |
| `--text-secondary` | `#6B7280` | Labels, descriptions, placeholders |
| `--text-muted` | `#9CA3AF` | Disabled, timestamps, hints |
| `--border-light` | `#E5E7EB` | Separators, table borders, input borders |
| `--border-hover` | `#D1D5DB` | Input hover |
| `--purple-primary` | `#7C3AED` | AI controls, active links, primary actions |
| `--purple-hover` | `#6D28D9` | Purple hover state |
| `--green-complete` | `#10B981` | "Полная" status, success |
| `--orange-partial` | `#F59E0B` | "Неполная" status, warning |
| `--red-error` | `#EF4444` | Errors only (rare) |
| `--blue-link` | `#2563EB` | External links, secondary actions |

### 1.2 Typography
| Token | Size | Weight | Line-height | Usage |
|---|---|---|---|---|
| `title-page` | 20px | 600 | 1.3 | Page header |
| `title-section` | 16px | 600 | 1.4 | Section headers inside container |
| `body` | 14px | 400 | 1.5 | Table cells, descriptions |
| `body-small` | 13px | 400 | 1.5 | Secondary text, metadata |
| `caption` | 12px | 500 | 1.4 | Labels, badges, uppercase table headers |
| `metric-value` | 28px | 700 | 1.2 | Metric numbers |
| `metric-label` | 12px | 500 | 1.4 | Metric descriptions |

**Font family:** `Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`

### 1.3 Spacing
| Token | Value |
|---|---|
| `page-padding` | 24px |
| `container-padding` | 24px |
| `section-gap` | 24px |
| `row-gap` | 16px |
| `element-gap` | 12px |
| `compact-gap` | 8px |
| `table-row-height` | 48px |
| `input-height` | 36px |

### 1.4 Shadows & Radius
| Token | Value | Usage |
|---|---|---|
| `radius-container` | 12px | Main white container |
| `radius-card` | 8px | Inner cards (rare, metrics only if needed) |
| `radius-input` | 6px | Inputs, buttons, badges |
| `shadow-container` | `0 1px 3px rgba(0,0,0,0.04)` | Only to lift white surface from gray canvas |
| `shadow-none` | `none` | Default for all inner elements |

**Rule:** No internal shadows on table rows, filters, or content blocks. No gradients anywhere.

---

## 2. Global Page Structure

Both registries live inside the global ProcessMap shell (header + sidebar). The registry page itself is a **thin client** — it renders what backend sends in `view_model`.

```
┌─────────────────────────────────────────────────────────────┐
│  ProcessMap Header (global)                                 │
├──────────┬──────────────────────────────────────────────────┤
│          │  Page padding (24px)                             │
│ Sidebar  │  ┌────────────────────────────────────────────┐  │
│ (global) │  │  White Container (bg-surface, radius 12px) │  │
│          │  │  padding: 24px                               │  │
│          │  │                                              │  │
│          │  │  [Header Row]                                │  │
│          │  │  [Scope Tabs]                                │  │
│          │  │  [Metrics Row]                               │  │
│          │  │  [Filters Row]                               │  │
│          │  │  [Warning Row] (conditional)                 │  │
│          │  │  [AI Controls Row]                           │  │
│          │  │  [Main Table]                                │  │
│          │  │  [Source / Provenance Section]               │  │
│          │  │                                              │  │
│          │  └────────────────────────────────────────────┘  │
│          │                                                │
└──────────┴──────────────────────────────────────────────────┘
```

**Rule:** Only ONE main white container per page. No nested card chaos. No sidebar panels inside the registry.

---

## 3. Реестр действий (Product Actions Registry)

### 3.1 Header Row
```
┌────────────────────────────────────────────────────────────┐
│  Реестр действий                              [?] [Export] │
│  Действия с продуктами из сессий и проектов               │
└────────────────────────────────────────────────────────────┘
```

- **Title:** `title-page` — "Реестр действий"
- **Subtitle:** `body-small`, `--text-secondary` — "Действия с продуктами из сессий и проектов"
- **Actions (right aligned):**
  - Icon-only help button `[?]` — 32px circle, `--text-secondary`, hover `--text-primary`
  - Export dropdown — `caption` button with download icon. Options: CSV, XLSX. **Only here, never duplicated in table or filters.**

### 3.2 Scope Tabs
```
┌────────────────────────────────────────────────────────────┐
│  [ Все действия ] [ По продуктам ] [ По сессиям ]         │
└────────────────────────────────────────────────────────────┘
```

- Style: horizontal row of text buttons, `body` size.
- Active tab: `--text-primary`, border-bottom 2px `--purple-primary`.
- Inactive tab: `--text-secondary`, border-bottom 2px transparent.
- Hover: `--text-primary`.
- Height: 40px.
- **Backend contract:** `view_model.scope_tabs` — array of `{id, label, active, count?}`.

### 3.3 Metrics Row
```
┌────────────────────────────────────────────────────────────┐
│  1 247          892           355           71.9%          │
│  Всего          С продуктом   Без продукта  Заполненность  │
└────────────────────────────────────────────────────────────┘
```

**Visual rules:**
- **NO cards.** NO backgrounds, NO borders, NO shadows on individual metrics.
- Layout: horizontal flex row, `element-gap: 32px` between metric blocks.
- Each block: vertical stack.
  - Value: `metric-value`, `--text-primary`
  - Label: `metric-label`, `--text-secondary`
- "Заполненность" value uses `--green-complete` if ≥ 80%, `--orange-partial` if < 80%.
- If backend sends `null` or missing metric — show `"—"` (em-dash) instead of `0`. Never fake numbers.

**Backend contract:** `view_model.metrics` — array of `{label, value, unit?, status?}`.

### 3.4 Filters Row
```
┌────────────────────────────────────────────────────────────┐
│  Период ▾  Продукт ▾  Сессия ▾  Статус ▾  Источник ▾     │
│  [ Сбросить фильтры ]                                      │
└────────────────────────────────────────────────────────────┘
```

**Visual rules:**
- **Single horizontal row.** Never stack vertically unless screen width < 768px.
- Each filter: dropdown/select component.
  - Height: `input-height` (36px)
  - Border: 1px `--border-light`, radius 6px
  - Background: `--bg-surface` (white)
  - Label inside or above: `caption`, `--text-secondary`
  - Chevron icon on right, `--text-muted`
- Gap between filters: `element-gap` (12px)
- "Сбросить фильтры" — text button, `caption`, `--purple-primary`, appears only when filters are active.
- **Backend contract:** `view_model.filter_options` — array of `{id, label, options[], selected?}`. Frontend renders what backend provides. Frontend does not hardcode filter lists.

### 3.5 Warning Row (conditional)
```
┌────────────────────────────────────────────────────────────┐
│  ⚠ Неполные данные: 3 сессии не содержат привязки к      │
│    продуктам. Результаты могут быть неточными.            │
└────────────────────────────────────────────────────────────┘
```

**Visual rules:**
- **Soft text row.** NOT a colored banner. NOT a card. NOT an alert box.
- Layout: full-width text block, padding 12px 0.
- Icon: small warning triangle (16px), `--orange-partial`.
- Text: `body-small`, `--text-secondary`.
- If multiple warnings — stack vertically with `compact-gap`.
- **Backend contract:** `view_model.warnings` — array of strings. If empty, row is hidden.

### 3.6 AI Controls Row
```
┌────────────────────────────────────────────────────────────┐
│  🤖 AI: Найдено 12 потенциальных привязок продукта         │
│     [ Показать рекомендации ]                              │
└────────────────────────────────────────────────────────────┘
```

**Visual rules:**
- Positioned above table, separated by 1px `--border-light` line from filters.
- Icon: 16px sparkles/robot, `--purple-primary`.
- Text: `body-small`, `--text-secondary`.
- Action button: "Показать рекомендации" — `caption`, `--purple-primary`, hover `--purple-hover`, ghost style (no fill, no border).
- **Backend contract:** `view_model.ai_suggestions` — `{count, action_label, action_url?}`. If `count === 0`, row is hidden.

### 3.7 Main Table
```
┌────────────────────────────────────────────────────────────┐
│  Действие      Продукт    Сессия   Источник   Статус   Дата │
│  ─────────────────────────────────────────────────────────  │
│  Согласовать   CRM        S-42     BPMN       Полная   21.05│
│  договор                                                     │
│  ─────────────────────────────────────────────────────────  │
│  Подготовить   —           S-43     Ручной     ...      20.05│
│  отчет                                                       │
└────────────────────────────────────────────────────────────┘
```

**Table spec:**
- Header row: `caption`, `--text-secondary`, uppercase, letter-spacing 0.5px.
  - Height: 40px
  - Border-bottom: 1px `--border-light`
  - No background fill on header (transparent).
- Row height: `table-row-height` (48px)
- Row separator: 1px `--border-light` (full bleed, no indent)
- Row hover: background `#FAFAFA` (very subtle, no shadow)
- Cell padding: 12px 16px
- Text: `body`, `--text-primary`
- Empty cell (no data): `"—"`, `--text-muted`

**Columns (backend-driven):**
| Column | Width | Align | Notes |
|---|---|---|---|
| Действие | flex-grow 2 | left | May wrap 2 lines, clamp with ellipsis if > 2 |
| Продукт | flex-grow 1 | left | If null — show "—" muted |
| Сессия | 120px | left | Monospace-ish if ID format |
| Источник | 140px | left | Badge style if needed |
| Статус | 120px | center | Badge with color (see Status Badges) |
| Дата | 100px | right | `body-small`, `--text-secondary` |

**Status Badges:**
- "Полная" — `caption`, `--green-complete`, no background, just colored text + small dot (8px circle) left of text.
- "Неполная" — `caption`, `--orange-partial`, same dot pattern.
- "Не определена" — `caption`, `--text-muted`.

**No colored backgrounds on status cells.** Typography over decoration.

**Pagination (if needed):**
- Below table, right-aligned.
- Style: minimal text buttons "← Назад" / "Вперед →" + page counter "1 – 50 из 1 247".
- `caption`, `--text-secondary`. Active page: `--text-primary`.

### 3.8 Source / Provenance Section
```
┌────────────────────────────────────────────────────────────┐
│  Источники данных                                           │
│  ─────────────────────────────────────────────────────────  │
│  ● BPMN диаграммы        842 записи      [ Просмотреть ]   │
│  ● Ручной ввод           312 записи      [ Просмотреть ]   │
│  ● Сессии анализа        93 записи       [ Просмотреть ]   │
│  ○ Внешний API           недоступно      [ Настроить ]     │
└────────────────────────────────────────────────────────────┘
```

**Visual rules:**
- Title: `title-section`, "Источники данных"
- Separator: 1px `--border-light` above section, margin-top 24px.
- Layout: table-like list, NOT cards.
- Each row: 40px height, flex row.
  - Indicator: 8px circle. Filled = active source (`--green-complete`), empty/outline = inactive (`--text-muted`).
  - Source name: `body`, `--text-primary`
  - Count: `body-small`, `--text-secondary` (or "недоступно" / "не подключен")
  - Action: text link, `caption`, `--blue-link` or `--purple-primary`
- **NO dotted border around this section.** NO card wrapper. It lives inside the same white container, separated by light line only.
- **Backend contract:** `view_model.source_state` — `{sources[], overall_status}`.

### 3.9 Empty State (honest)
```
┌────────────────────────────────────────────────────────────┐
│                                                             │
│                    📋 (48px icon, muted)                   │
│                                                             │
│              Нет действий с продуктами                      │
│                                                             │
│     Данные будут собраны из BPMN диаграмм и сессий        │
│     анализа по мере их создания.                            │
│                                                             │
│              [ Начать анализ сессии ]  ← if applicable     │
│                                                             │
└────────────────────────────────────────────────────────────┘
```

**Rules:**
- Centered vertically and horizontally in table area (min-height 300px).
- Icon: 48px, `--text-muted`, stroke-only (no fill).
- Title: `title-section`, `--text-primary`.
- Description: `body`, `--text-secondary`, max-width 480px, centered.
- CTA button (optional): primary button only if backend provides `empty_state.action`.
- **NO fake rows. NO fake counts. NO "0 из 0" metrics.** If empty, metrics row shows "—" or is hidden.
- **Backend contract:** `view_model.empty_state` — `{title, description, action?}`.

### 3.10 Loading State
- **Skeletons, not spinners.**
- Table header visible but text replaced by gray bars (4px radius, `#E5E7EB`).
- 5 skeleton rows, each 48px height.
- Metrics row: 4 skeleton blocks (80px wide each).
- Filters: inputs disabled with `--bg-canvas` background.
- **No full-page overlay. No blocking modal.**

---

## 4. Реестр свойств (Properties Registry)

### 4.1 Header Row
```
┌────────────────────────────────────────────────────────────┐
│  Реестр свойств                              [?]          │
│  BPMN-объекты и их атрибуты из подтвержденных источников  │
└────────────────────────────────────────────────────────────┘
```

- Title: "Реестр свойств"
- Subtitle: "BPMN-объекты и их атрибуты из подтвержденных источников"
- No export button at top level (export lives inside specific views if needed later).

### 4.2 Search & Filter Row
```
┌────────────────────────────────────────────────────────────┐
│  🔍 [ Поиск по названию свойства... ]  Тип ▾  Источник ▾  │
└────────────────────────────────────────────────────────────┘
```

- Search input: flex-grow, height 36px, left icon 16px `--text-muted`.
- Filters: same style as Product Actions Registry, but fewer (Тип, Источник).
- **Backend contract:** `view_model.search_placeholder`, `view_model.filter_options`.

### 4.3 Main Table
```
┌────────────────────────────────────────────────────────────┐
│  Свойство          Тип          BPMN элемент   Источник    │
│  ─────────────────────────────────────────────────────────  │
│  Сумма договора    Currency    Task          BPMN (3)    │
│  Ответственный     User        Lane          Сессия (1)   │
│  Дата старта       Date       Start Event   BPMN (5)     │
└────────────────────────────────────────────────────────────┘
```

**Table spec:**
- Same table system as Product Actions Registry (header, row height, separators, hover).
- Columns:

| Column | Width | Notes |
|---|---|---|
| Свойство | flex-grow 2 | Property name. If has description — show below in `body-small` muted |
| Тип | 140px | Type badge (Currency, User, Date, String, etc.) |
| BPMN элемент | 160px | Element type (Task, Gateway, Event, Lane, etc.) |
| Источник | 160px | Source + count in parens, `body-small` muted |
| Статус | 120px | "Подтверждено" / "Предположение" (see below) |

**Type Badges:**
- Small pill: height 20px, radius 10px, background `#F3F4F6`, text `caption` `--text-secondary`.
- Examples: `Currency`, `User`, `Date`, `String`, `Number`, `Boolean`.

**Status:**
- "Подтверждено" — green dot + text `--text-secondary`.
- "Предположение" — orange dot + text `--text-secondary`.
- "Не определено" — gray dot + text `--text-muted`.

### 4.4 Expandable Detail Row (on click)
```
┌────────────────────────────────────────────────────────────┐
│  ▼ Сумма договора  ...                                     │
│  ─────────────────────────────────────────────────────────  │
│  Описание: Договорная сумма с НДС                          │
│  Тип: Currency (RUB)                                        │
│  BPMN элемент: User Task «Согласовать договор»              │
│  Источники:                                                 │
│    • BPMN «Продажа» v3 — Task T-12 (автоматически)         │
│    • Сессия анализа #42 — подтверждено аналитиком          │
│  ─────────────────────────────────────────────────────────  │
│  ▶ Ответственный  ...                                      │
└────────────────────────────────────────────────────────────┘
```

- Expansion: click anywhere on row (except links/buttons).
- Expanded area: padding 16px 24px, background `#FAFAFA` (subtle, no card, no shadow).
- Content: `body-small`, `--text-secondary`.
- Source list: bulleted, with provenance details.
- **Backend contract:** `view_model.properties[].detail` or fetched on demand via API.

### 4.5 Empty State (honest)
```
┌────────────────────────────────────────────────────────────┐
│                                                             │
│                    🏗 (48px icon, muted)                   │
│                                                             │
│              Нет подтвержденных свойств                     │
│                                                             │
│     Свойства будут собраны автоматически из BPMN           │
│     диаграмм и сессий анализа по мере их обработки.        │
│                                                             │
│     Текущий статус источников:                              │
│     • BPMN диаграммы: ожидает первой загрузки              │
│     • Сессии анализа: не проведены                         │
│                                                             │
└────────────────────────────────────────────────────────────┘
```

**Rules:**
- Same centered layout as Product Actions empty state.
- **Must include `source_state` breakdown** so user understands WHY empty (not just "nothing here").
- If sources are connected but no properties extracted yet — say so explicitly.
- If sources not connected — show that with muted indicators.
- **NO fake property rows. NO "0 свойств" with fake table headers.** If empty — table is completely hidden, only empty state shows.

### 4.6 Source State Panel (alternative to empty state)
If backend sends `source_state` but no properties yet, show compact panel above empty state:
```
Источники:
● BPMN диаграммы — подключено, 2 диаграммы загружены
○ Сессии анализа — не проведены
```

---

## 5. Shared Components

### 5.1 Button Variants
| Variant | Style | Usage |
|---|---|---|
| Primary | `bg: --purple-primary`, `color: white`, radius 6px, height 36px | Main CTA, AI actions |
| Secondary | `border: 1px --border-light`, `bg: white`, radius 6px | Export, secondary actions |
| Ghost | `bg: transparent`, `color: --purple-primary` | Filter reset, inline links |
| Icon | 32px square, transparent, icon centered | Help, close, expand |

### 5.2 Select / Dropdown
- Trigger: height 36px, border 1px `--border-light`, radius 6px, padding 0 12px.
- Chevron: 16px, `--text-muted`.
- Dropdown: white bg, radius 8px, shadow `0 4px 12px rgba(0,0,0,0.08)`, max-height 240px, scrollable.
- Option hover: `#F9FAFB`.
- Selected: `--purple-primary` text + left checkmark.

### 5.3 Badge / Pill
- Height 20px, radius 10px, padding 0 10px.
- Background: `#F3F4F6`, text: `caption` `--text-secondary`.
- Status variant: no background, just colored dot + text.

### 5.4 Tooltip
- Trigger: icon-only `[?]` buttons.
- Style: `body-small`, white bg, radius 8px, shadow `0 2px 8px rgba(0,0,0,0.1)`, max-width 280px.
- Delay: 300ms.

---

## 6. Responsive Behavior

**Desktop (>1024px):**
- Full layout as described.

**Tablet (768–1024px):**
- Filters row: wrap to 2 rows if > 4 filters.
- Metrics: 2x2 grid instead of horizontal row.
- Source section: collapsible accordion.

**Mobile (<768px):**
- Page padding: 16px.
- Container padding: 16px.
- Filters: vertical stack, full-width selects.
- Metrics: 2x2 grid.
- Table: horizontal scroll with sticky first column (Действие/Свойство).
- Source section: accordion, collapsed by default.

---

## 7. Backend View-Model Contract (Thin Client)

### 7.1 Product Actions Registry Endpoint
`GET /api/analysis/product-actions/registry`

Response shape (simplified):
```json
{
  "view_model": {
    "title": "Реестр действий",
    "subtitle": "Действия с продуктами из сессий и проектов",
    "scope_tabs": [
      {"id": "all", "label": "Все действия", "active": true, "count": 1247},
      {"id": "by_product", "label": "По продуктам", "active": false},
      {"id": "by_session", "label": "По сессиям", "active": false}
    ],
    "metrics": [
      {"label": "Всего", "value": 1247},
      {"label": "С продуктом", "value": 892},
      {"label": "Без продукта", "value": 355},
      {"label": "Заполненность", "value": 71.9, "unit": "%", "status": "partial"}
    ],
    "filter_options": [
      {"id": "period", "label": "Период", "options": [...], "selected": null},
      {"id": "product", "label": "Продукт", "options": [...]}
    ],
    "applied_filters": [],
    "warnings": [
      "Неполные данные: 3 сессии не содержат привязки к продуктам."
    ],
    "ai_suggestions": {
      "count": 12,
      "action_label": "Показать рекомендации",
      "action_url": "/api/ai/suggestions/product-actions"
    },
    "items": [
      {
        "id": "...",
        "action_name": "Согласовать договор",
        "product_name": "CRM",
        "session_id": "S-42",
        "source": "BPMN",
        "status": "complete",
        "date": "2026-05-21"
      }
    ],
    "pagination": {"page": 1, "per_page": 50, "total": 1247},
    "source_state": {
      "sources": [
        {"name": "BPMN диаграммы", "count": 842, "active": true},
        {"name": "Ручной ввод", "count": 312, "active": true},
        {"name": "Внешний API", "count": null, "active": false}
      ]
    },
    "empty_state": null
  }
}
```

### 7.2 Properties Registry Endpoint
`GET /api/analysis/process-properties/registry`

Response shape (simplified):
```json
{
  "view_model": {
    "title": "Реестр свойств",
    "subtitle": "BPMN-объекты и их атрибуты из подтвержденных источников",
    "search_placeholder": "Поиск по названию свойства...",
    "filter_options": [
      {"id": "type", "label": "Тип", "options": [...]},
      {"id": "source", "label": "Источник", "options": [...]}
    ],
    "properties": [
      {
        "id": "...",
        "name": "Сумма договора",
        "type": "Currency",
        "bpmn_element": "User Task",
        "source": "BPMN (3)",
        "status": "confirmed",
        "detail": {
          "description": "Договорная сумма с НДС",
          "type_detail": "Currency (RUB)",
          "sources": [
            {"name": "BPMN «Продажа» v3", "context": "Task T-12", "method": "автоматически"},
            {"name": "Сессия анализа #42", "context": "подтверждено аналитиком", "method": "ручное"}
          ]
        }
      }
    ],
    "source_state": {
      "sources": [
        {"name": "BPMN диаграммы", "status": "connected", "count": 2},
        {"name": "Сессии анализа", "status": "missing", "reason": "не проведены"}
      ]
    },
    "empty_state": null
  }
}
```

**Critical rule:** If `items` or `properties` is empty array, backend MUST send `empty_state` object with honest messaging. Frontend MUST render empty state, NOT an empty table.

---

## 8. What is Forbidden (Design Anti-Patterns)

| Anti-Pattern | Why Forbidden |
|---|---|
| Gradient backgrounds | Violates no-visual-noise rule |
| Dotted borders | Looks cheap, violates approved direction |
| Internal shadows on rows/cards | Creates visual noise, outdated |
| Colored metric cards | Metrics must be clean text, not cards |
| Fake data / fake counts | Breaks source-truth principle |
| Marketing animations (stagger, bounce) | Distracting, unprofessional for registry |
| Aggressive warning banners | Use soft text rows instead |
| Duplicate export buttons | One export control in header only |
| Vertical filter stacks (desktop) | Wastes space, breaks scanability |
| Fake table headers with empty body | Show honest empty state instead |
| AI controls inside source section | AI is primary action, must be above table |
| Frontend hardcoding filter lists | Backend must own filter_options |

---

## 9. Implementation Checklist for Agent

- [ ] Create/reuse `RegistryLayout` component (single white container, padding 24px, radius 12px)
- [ ] Implement `RegistryHeader` (title + subtitle + actions)
- [ ] Implement `ScopeTabs` (horizontal, backend-driven)
- [ ] Implement `MetricsRow` (flex row, no cards, colored values only)
- [ ] Implement `FiltersRow` (horizontal flex, backend-driven options)
- [ ] Implement `WarningRow` (conditional, soft text, orange icon)
- [ ] Implement `AIControlsRow` (conditional, purple, above table)
- [ ] Implement `DataTable` (generic, backend-driven columns, status dots, hover)
- [ ] Implement `SourceSection` (list with indicators, no cards, no dotted border)
- [ ] Implement `EmptyState` (centered, icon, honest message, source_state if applicable)
- [ ] Implement `LoadingSkeleton` (table skeletons, no full-page spinner)
- [ ] Implement `PropertiesTable` with expandable rows
- [ ] Connect to backend endpoints, consume view_model strictly
- [ ] Add tests: rendering, empty state, filter application, navigation back to Hub
- [ ] Runtime proof: :5180, :8088, build-info, footer version, browser verification

---

*End of specification. This document replaces any previous informal UI descriptions for Product Actions Registry and Properties Registry.*
