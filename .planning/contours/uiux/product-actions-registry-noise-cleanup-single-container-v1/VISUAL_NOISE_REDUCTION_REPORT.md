# Visual Noise Reduction Report

Что удалено/упрощено в скоупе реестра (только в `.productActionsRegistryPanel--page`).

## Удалено / нейтрализовано

| Источник шума | Где было | Что сделано |
|---|---|---|
| `linear-gradient` фон `.productActionsRegistryPanel` | `tailwind.css` старые правила | `.productActionsRegistryPanel--page` override: `background: transparent`, `padding: 0`, `border: 0`, `box-shadow: none` |
| `linear-gradient` фон `.productActionsRegistryPage` | старые правила | `background: #F3F4F6` |
| Gradient + цветной фон `.productActionsRegistryAiReview` (`hsl(var(--accent)/0.06)`) | старые правила | В page-варианте — белый контейнер `#FFFFFF`, border `#E5E7EB`, shadow `0 1px 3px rgba(0,0,0,0.06)`. Сам AI primary actions block — без подложки и градиента |
| Жёлтая подложка/border `.productActionsRegistryIncompleteBanner` | старые правила | `background: transparent; border: 0`; остался только icon `#F59E0B` + текст `#B45309` + правый link `#7C3AED` |
| Dashed border `.productActionsRegistryWorkspaceNotice` | старые правила | `border: 0; background: transparent` |
| Цветные карточки метрик (5×`<article>` с border + bg) | `Metrics.jsx` | Заменены на одну текстовую строку с числом 20/700 и uppercase-лейблом 11/`#9CA3AF`. Карточек больше нет |
| Card-in-card: framed `secondaryBtn` для «Сбросить фильтры» | `Filters.jsx` | Заменён на text-link 13/`#6B7280` без border/bg, hover underline |
| Inner shadow от `box-shadow: 0 24px 80px ...` в `.productActionsRegistryPanel` | старые правила | На странице (`--page`) `box-shadow: none`; единственная разрешённая тень — внешняя `0 1px 3px rgba(0,0,0,0.06)` у `.productActionsRegistryContainer` |
| Stagger-loading / marketing entrance | — | Никогда не добавлялись и не вводятся |
| Дубли CSV/XLSX | — | Audit подтвердил: CSV/XLSX рендерятся **ровно один раз** в `ProductActionsRegistryHeader.jsx` |
| Checkbox-колонка в таблице | `Table.jsx` | Не используется (AI-выбор идёт через chips/sessions list), таблица — 4 колонки `Продукт / Действие / Процесс·шаг / Статус` |

## Forbidden-pattern grep (proof)

```
=== FORBIDDEN PATTERNS in registry scope (excl. allowed 0 1px 3px shadow) ===
(пустой вывод)

=== Restricted patterns in registry CSS noise-cleanup block ===
5: * No gradients, no dotted, no inner shadows, no colored metric cards.
(единственное совпадение — строка комментария о том, что эти паттерны запрещены)
```

## Required-pattern compliance (proof)

| Требование | Подтверждение |
|---|---|
| Один белый контейнер radius 12, border `#E5E7EB`, shadow `0 1px 3px rgba(0,0,0,0.06)`, padding 0 | `.productActionsRegistryContainer { background:#FFFFFF; border:1px solid #E5E7EB; border-radius:12px; box-shadow:0 1px 3px rgba(0,0,0,0.06); padding:0 }` |
| Разделители `1px solid #F3F4F6` full-width | `.productActionsRegistrySection + .productActionsRegistrySection { border-top:1px solid #F3F4F6 }` |
| 24h/12v секционный padding | `.productActionsRegistrySection { padding:12px 24px }` |
| 16px между tabs и контейнером | `.productActionsRegistryContainer { margin-top:16px }` |
| Scope tabs — underline 2px `#7C3AED` | `.productActionsRegistryPanel--page > .productActionsRegistryScope button.isActive { border-bottom:2px solid #7C3AED }` |
| Workspace scope default collapsed | `<details>` без `open` |
| Sessions — compact flex (не таблица) | `.productActionsRegistrySessionSummaryRow` — grid 20px/1.4fr/auto/auto, без table-borders |
| Metrics — одна строка, gap 32 | `.productActionsRegistryMetrics { display:flex; gap:32px }` |
| Filters — компактная строка, reset = text-link | `.productActionsRegistryFilterReset { background:transparent; border:0 }` |
| Warning — строка без подложки | `.productActionsRegistryIncompleteBanner { background:transparent; border:0 }` |
| AI — строка без подложки/градиента | `.productActionsRegistryPrimaryActions { background:transparent; border:0 }` |
| Table — header `#FAFAFA`, hover `#FAFAFA`, badge только зелёный/оранжевый | `.productActionsRegistryTableHead { background:#FAFAFA }`, `.productActionsRegistryRow:hover { background:#FAFAFA }`, `.productActionsRegistryCompleteness.{complete\|incomplete}` использует `#10B981`/`#F59E0B` |
| Row expansion: chevron rotation + max-height + 4 read-only | `.productActionsRegistryRowChevron.isOpen { transform:rotate(90deg) }`, `.productActionsRegistryRowExpansion { max-height:0→240px }`, `<dl>` 4 колонки `ID·BPMN·Сессия·Дата` |
| Empty state — без фейков | `.productActionsRegistryEmpty` показывается, когда `rows.length === 0` |
| Bump версии | `frontend/src/config/appVersion.js`: `v1.0.137 → v1.0.138` |
