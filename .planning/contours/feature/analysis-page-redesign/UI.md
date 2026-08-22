# UI.md — analysis-page-redesign

Дизайн-спецификация для вкладки **«Анализ процессов»** (no-scroll dashboard).

## 1. Источник токенов

- `design-system/processmap-to-be/MASTER.md` — единственный источник токенов.
- **Новые цвета/шрифты запрещены** (правило LLM4).
- Шрифты: `Fira Code` (heading/numbers), `Fira Sans` (body).
- CSS-переменные: `--pm-tobe-*`, `--color-*` из MASTER.md.

## 2. Профиль

- **Profile:** Data-Dense Dashboard
- **Variance:** 4 (balanced)
- **Motion:** 3 (subtle)
- **Density:** 8 (dense)

## 3. Цветовая палитра

| Роль | CSS variable | Hex | Применение |
|---|---|---|---|
| Primary | `--color-primary` | `#1E3A5F` | заголовки, focus ring, активная таба |
| On primary | `--color-on-primary` | `#FFFFFF` | текст на primary |
| Secondary | `--color-secondary` | `#2563EB` | ссылки, выделенные метрики |
| Accent/CTA | `--color-accent` | `#059669` | success, OK, привязка |
| Background | `--color-background` | `#F8FAFC` | фон страницы |
| Foreground | `--color-foreground` | `#0F172A` | основной текст |
| Muted | `--color-muted` | `#F1F3F5` | фон карточек/строк |
| Border | `--color-border` | `#E4E7EB` | границы |
| Destructive | `--color-destructive` | `#DC2626` | ошибки, delete |
| Ring | `--color-ring` | `#1E3A5F` | focus outline |
| Assistant | `--pm-tobe-assistant` | `#6D28D9` | LLM/AI элементы |
| Surface | `--pm-tobe-surface` | `#FFFFFF` | карточки на фоне |
| Shadow SM | `--pm-tobe-shadow-sm` | `rgba(15,23,42,.08)` | карточки |
| Shadow Lift | `--pm-tobe-shadow-lift` | `rgba(15,23,42,.10)` | hover карточек |

Семантические тона KPI (только существующие переменные):
- `success` → `--color-accent`
- `warning` → `#F59E0B` (использовать как utility, не добавлять в дизайн-систему)
- `danger` → `--color-destructive`
- `info` → `--color-secondary`
- `neutral` → `--color-primary`

## 4. Типографика

| Элемент | Font | Size | Weight | Line-height | Letter-spacing |
|---|---|---|---|---|---|
| Page title | Fira Code | 18px | 600 | 1.2 | 0 |
| Tab label | Fira Sans | 13px | 500 | 1 | 0.01em |
| KPI value | Fira Code | 28px | 700 | 1.1 | -0.02em |
| KPI label | Fira Sans | 11px | 500 | 1.2 | 0.04em uppercase |
| Section title | Fira Code | 14px | 600 | 1.2 | 0 |
| Body | Fira Sans | 13px | 400 | 1.35 | 0 |
| Small/muted | Fira Sans | 11px | 400 | 1.3 | 0 |
| Table header | Fira Sans | 11px | 600 | 1.2 | 0.03em uppercase |
| Table cell | Fira Sans | 12px | 400 | 1.3 | 0 |

## 5. Layout

### 5.1 Контейнер

```css
.processAnalysisPage {
  display: flex;
  flex-direction: column;
  height: 100%; /* fills workbench content area */
  min-height: 0;
  overflow: hidden;
  background: var(--color-background);
  color: var(--color-foreground);
}
```

### 5.2 Шапка

```css
.processAnalysisHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-bottom: 1px solid var(--color-border);
  background: var(--pm-tobe-surface);
  flex: 0 0 auto;
}
```

- Слева: back button + title процесса.
- По центру: page title «Анализ процессов».
- Справа: pill tab bar.

### 5.3 Pill tab bar

```css
.processAnalysisTabs {
  display: inline-flex;
  gap: 4px;
  padding: 3px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-muted);
}
.processAnalysisTab {
  padding: 5px 12px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-foreground);
  background: transparent;
  border: none;
  cursor: pointer;
  transition: background-color 150ms ease, color 150ms ease;
}
.processAnalysisTab[aria-selected="true"] {
  background: var(--color-primary);
  color: var(--color-on-primary);
}
.processAnalysisTab:hover:not([aria-selected="true"]) {
  background: var(--pm-tobe-surface);
}
.processAnalysisTab:focus-visible {
  outline: 2px solid var(--color-ring);
  outline-offset: 2px;
}
```

### 5.4 Контентная область

```css
.processAnalysisBody {
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
  padding: 12px;
}
```

Каждая таба — отдельная панель с `height: 100%` и `overflow: hidden`.

## 6. Компоненты

### 6.1 KPI card

```css
.processAnalysisKpiCard {
  background: var(--pm-tobe-surface);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 12px;
  box-shadow: var(--pm-tobe-shadow-sm);
  transition: box-shadow 150ms ease, transform 150ms ease;
  min-height: 80px; /* reserved height */
}
.processAnalysisKpiCard:hover {
  box-shadow: var(--pm-tobe-shadow-lift);
  transform: translateY(-1px);
}
.processAnalysisKpiLabel {
  font-size: 11px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-foreground);
  opacity: 0.7;
}
.processAnalysisKpiValue {
  margin-top: 6px;
  font-family: 'Fira Code', monospace;
  font-size: 28px;
  font-weight: 700;
  color: var(--color-primary);
}
.processAnalysisKpiUnit {
  font-size: 12px;
  font-weight: 400;
  margin-left: 4px;
  opacity: 0.8;
}
```

- Left accent border 3px по тону метрики (success/warning/danger/info).
- Icon 20×20 inline SVG в правом верхнем углу.

### 6.2 Distribution list / mini chart

```css
.processAnalysisDistribution {
  background: var(--pm-tobe-surface);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 12px;
  min-height: 120px;
}
.processAnalysisBarTrack {
  height: 8px;
  background: var(--color-muted);
  border-radius: 4px;
  overflow: hidden;
}
.processAnalysisBarFill {
  height: 100%;
  background: var(--color-secondary);
  border-radius: 4px;
  transition: width 250ms ease;
}
```

- Горизонтальные бар-чарты без новых библиотек.
- Tooltip при hover — native `title` или кастомный tooltip компонент.

### 6.3 Coverage meter

```css
.processAnalysisMeter {
  display: flex;
  align-items: center;
  gap: 8px;
}
.processAnalysisMeterTrack {
  flex: 1;
  height: 6px;
  background: var(--color-muted);
  border-radius: 3px;
  overflow: hidden;
}
.processAnalysisMeterFill {
  height: 100%;
  background: var(--color-accent);
  border-radius: 3px;
  transition: width 250ms ease;
}
.processAnalysisMeterFill.low {
  background: var(--color-destructive);
}
.processAnalysisMeterFill.mid {
  background: #F59E0B;
}
```

### 6.4 Table

```css
.processAnalysisTableWrap {
  border: 1px solid var(--color-border);
  border-radius: 10px;
  overflow: auto;
  background: var(--pm-tobe-surface);
}
.processAnalysisTable {
  width: 100%;
  border-collapse: collapse;
}
.processAnalysisTable thead th {
  position: sticky;
  top: 0;
  background: var(--color-muted);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  padding: 6px 8px;
  text-align: left;
  border-bottom: 1px solid var(--color-border);
}
.processAnalysisTable tbody td {
  padding: 5px 8px;
  font-size: 12px;
  border-bottom: 1px solid var(--color-border);
}
.processAnalysisTable tbody tr:hover {
  background: rgba(37, 99, 235, 0.04); /* --color-secondary 4% */
}
```

- Row height 32px (dense).
- Checkbox / selection column width 32px.

### 6.5 Right panel (Шаг и продукт)

```css
.processAnalysisSidePanel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  height: 100%;
  min-width: 320px;
  max-width: 420px;
  overflow: hidden;
}
.processAnalysisSidePanelSection {
  background: var(--pm-tobe-surface);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 10px;
  overflow: auto;
}
```

### 6.6 Skeleton / loading

```css
.processAnalysisSkeleton {
  background: linear-gradient(90deg, var(--color-muted) 25%, #E8EAED 50%, var(--color-muted) 75%);
  background-size: 200% 100%;
  border-radius: 6px;
  animation: shimmer 1.2s infinite;
}
@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
@media (prefers-reduced-motion: reduce) {
  .processAnalysisSkeleton {
    animation: none;
  }
}
```

- Каждый блок данных имеет reserved `min-height` и skeleton placeholder на время загрузки read-model.
- Цель: CLS < 0.1.

### 6.7 Empty state

```css
.processAnalysisEmpty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px;
  color: var(--color-foreground);
  opacity: 0.7;
  min-height: 120px;
}
```

- SVG icon 48px.
- Title 14px medium.
- Description 12px.

### 6.8 Error state

```css
.processAnalysisError {
  padding: 12px;
  border: 1px solid var(--color-destructive);
  border-radius: 8px;
  background: rgba(220, 38, 38, 0.06);
  color: var(--color-destructive);
}
```

## 7. Анимации

- Hover карточек: 150ms ease.
- Tab switch: 150ms fade (opacity), без сдвига layout.
- Bar fills: 250ms ease.
- Skeleton: 1.2s shimmer, отключается `prefers-reduced-motion`.
- **Запрещено:** decorative анимация, bounce, parallax, layout-shifting transforms.

## 8. Responsive

| Viewport | Layout |
|---|---|
| ≥1440px | KPI row 4-6 cards; Overview 2 columns (60/40); Steps table + side panel side-by-side. |
| 1024–1439px | KPI 2 rows × 2; Overview 1 column; Steps table + side panel side-by-side (panel 320px). |
| 768–1023px | Tabs выпадают в select/scrollable row; Overview 1 column; Steps stack vertically. |
| <768px | Single column, табы в dropdown, touch targets ≥ 44px. |

- Ни при каком viewport не допускается горизонтальный скролл страницы.

## 9. Accessibility

- Все интерактивные элементы focusable, focus ring 2px `--color-ring`.
- Табы реализованы как `role="tablist"` / `role="tab"` / `role="tabpanel"`.
- Цвета не единственный индикатор состояния (иконки + текст).
- Контраст текста ≥ 4.5:1.
- `prefers-reduced-motion` отключает анимации.
- SVG-иконки с `aria-hidden="true"` и `focusable="false"`.
- Нет эмодзи в интерфейсе.

## 10. Структура табов

| Таб | Содержание | Основной scroll-контейнер |
|---|---|---|
| Обзор | KPI + распределения + топ-ожидания + coverage | нет (всё видно) |
| Шаги | TimelineTable + ProductActionsPanel + RagSearchPanel | таблица и панель по отдельности |
| Ветки BPMN | BpmnBranchesPanel | дерево/карточки веток |
| Исключения | ExceptionsBlock | таблица исключений |
| AI | AiQuestionsBlock + LlmAnalysisBlock | таблица AI-вопросов |

## 11. Интерактив ≥24px

- Все кнопки, иконки, чекбоксы, селекты — минимум 24×24px hit area.
- В dense-режиме row height 32px.
