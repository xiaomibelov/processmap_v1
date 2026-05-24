# UX Acceptance Criteria From Spec

Контур: `uiux/product-actions-registry-polished-table-layout-v1`

## Header hierarchy

- `Реестр действий с продуктом` является самым сильным текстовым элементом страницы, но не hero-scale.
- Subtitle объясняет scope страницы вторичным тоном и не конкурирует с title.
- `Вернуться` выглядит как компактное navigation action, а не как primary CTA.
- CSV/XLSX размещены один раз и только в header utility area.
- Header не меняет глобальный ProcessMap shell/sidebar/topbar.

## Compact metrics dashboard

- Метрики собраны в единый компактный summary block/card.
- Numeric values заметны, но не oversized и не перетягивают внимание с таблицы.
- Labels secondary, small, preferably uppercase-style.
- `Полных` и `Неполных` используют тонкое semantic treatment; color не должен быть alarm-like.
- `После фильтров` не дублирует total как равноценная heavy metric; если значение совпадает с total, оно secondary/badge-like.
- Метрики считаются только из реальных Product Actions данных текущего scope.

## Filters and applied states

- Main filters визуально сгруппированы: `Группа`, `Товар`, `Тип`, `Этап`, `Категория`.
- Secondary filters визуально сгруппированы: `Роль`, `Полнота`, `Сбросить`.
- Applied values заметны без необходимости читать каждое поле внимательно.
- `Сбросить фильтры` выглядит как quiet text/link action, а не destructive/primary button.
- Empty filters state не создает fake selected values.

## AI block hierarchy

- Label `AI-предложения` сохранен и отделяет AI controls от обычных filters.
- `Все видимые`, `Без действий`, `Неполные` выглядят как secondary toggle chips.
- `AI: предложить действия` является primary CTA внутри AI block.
- `Выбрано для AI: 0/10` расположен рядом с CTA и визуально secondary.
- AI controls находятся в primary actions area before table, не в `Источники данных`.
- AI behavior не меняется: review проверяет placement/visual hierarchy, а не новый AI workflow.

## Warning banner

- Warning о неполных строках находится над таблицей и рядом с table workflow.
- Визуальный тон мягкий: notice/advisory, не system failure.
- Если реализован `Показать только неполные`, action должен применять реальный completeness filter.
- Если quick action не реализован, Agent 2 должен явно documented skip; half-built action недопустим.

## Table-first structure

- Таблица является самой широкой и визуально главной рабочей зоной.
- Header таблицы спокойный, readable, без чрезмерного контраста.
- Rows имеют clear separation и hover state.
- `Полная`/`Неполная` badges aligned, consistent, readable.
- Tags под actions компактные и не превращают row в badge soup.
- BPMN code visually muted; он помогает идентификации, но не доминирует над action/product text.
- Checkbox column допустим только при безопасной existing selection model support.
- Sticky header допустим только если не ломает layout и не перекрывает global shell.

## Sources section

- `Источники данных` остается secondary section после table/pagination.
- Sources не содержат primary AI controls и export controls.
- Sources показывают реальные metadata/source context, не fake explanation.

## Spacing and layout

- Секции имеют ясный vertical rhythm: header, metrics, filters/actions, warning, table, sources.
- Нет ощущения одной непрерывной серой простыни.
- Нет ощущения узкой вставленной панели внутри пустого workspace.
- Page использует доступную workspace width с readable margins.
- Cards/sections не вложены визуально в тяжелые cards-in-cards без необходимости.

## Unchanged boundaries

- Global ProcessMap shell не редизайнится.
- Analytics Hub navigation compatibility сохраняется.
- Durable truth остается `interview.analysis.product_actions[]`.
- Backend/schema/BPMN/RAG/runtime AI behavior не меняются.
- Viewing/navigation сценарий не должен отправлять unsafe `PUT`, `PATCH`, `DELETE`.
