# UX/IA problem map

Контур: `architecture/analytics-hub-registries-ux-and-server-split-master-plan-v1`  
Run ID: `20260517T192328Z-13073`  
Lane: Agent 3 / Worker 3, UX/IA and server-split

## Scope и статус фактов

Эта карта описывает direction для следующих implementation contours. Product-code в текущем контуре не менялся.

Подтверждено чтением текущего checkout:
- есть `ProcessAnalyticsHub.jsx` с модулями `Реестр действий`, `Реестр свойств`, `Дашборды`, `Экспорт`;
- есть dedicated `ProductActionsRegistryPanel.jsx` и registry subcomponents: header, metrics, filters, table, pagination;
- registry уже работает со scope `workspace/project/session`;
- есть backend endpoints `POST /api/analysis/product-actions/registry/query`, `export.csv`, `export.xlsx`;
- есть bulk AI suggestions flow, который может сохранять выбранные предложения через `acceptAiProductActions`;
- текущий checkout dirty, поэтому эти факты являются evidence текущего workspace, а не merge-ready product truth.

Гипотеза/proposed model:
- `Реестр свойств` пока нужно проектировать как новый read-only analytics module, пока отдельный source-truth contour не подтвердит durable data model.

## Основные UX проблемы

| Area | Наблюдение | UX риск | Direction |
|---|---|---|---|
| Top-level Analytics | Hub уже есть, но его роль должна быть закреплена как L1 navigation surface, а не просто карточки. | Пользователь не понимает, что Analytics шире одного registry. | Описать Hub как центр модулей, current scope, recent/status signals и входы в registries. |
| Scope | Workspace / Проект / Сессия присутствуют как tabs. | Scope может читаться как технический переключатель, а не как граница данных. | Сделать scope bar самостоятельным блоком с current value, availability state и source hint. |
| Metrics | Сейчас есть 5 metric cards: сессий, строк, полных, неполных, после фильтров. | Метрики занимают много ширины и спорят с рабочей таблицей. | Перевести в compact metric rail: 3-4 primary numbers, filtered state как inline chip/hint. |
| Main work area | Table содержит summary row fields, но detail/source/missing fields скрыты слабо. | Flat table не объясняет, почему строка неполная и откуда она взята. | Phase 1: table + expandable row. Side panel оставить как later option. |
| AI area | Bulk AI controls расположены перед основной таблицей для workspace/project scope. | AI может перехватывать внимание до comprehension registry rows. | Переместить в support panel/contextual section после primary registry surface или рядом с session source selection. |
| AI mutation | Existing flow может принять выбранные AI rows. | Architecture goal требует read-only AI/RAG layer для будущей Analytics. | Для будущего AI/RAG слоя отделить explain/filter/export suggestions от mutation flows; apply actions остается отдельным explicit product action, не RAG automation. |
| Sources | `Источники данных` находятся в details block. | Источники полезны, но если раскрыты как большой блок, они могут перегрузить страницу. | Сохранить secondary priority; дать summary above fold и full diagnostics в collapsible/detail section. |
| Properties registry | Hub показывает module, но durable model не подтвержден. | Можно случайно выдать proposed groups за существующие product truth. | Маркировать groups как proposed until source-truth inventory. |

## Target IA

Рекомендуемая иерархия:

1. `L0 App navigation`: вход в Analytics из shell/explorer/process context.
2. `L1 Analytics Hub`: обзор модулей, текущий scope, статусы готовности.
3. `L2 Registry pages`: `Реестр действий`, `Реестр свойств`.
4. `L3 Entity detail`: expandable row или detail panel.
5. `L4 Export/dashboard drilldowns`: future surfaces.

Registry page structure:

1. Header: название, назначение, back to Hub, export controls.
2. Scope bar: Workspace / Проект / Сессия с явными состояниями.
3. Compact metrics rail: total, complete, incomplete, filtered.
4. Filters + primary registry table.
5. Row detail / AI support area.
6. Data sources diagnostics.

## Pass/fail criteria for future UX contour

- За 5 секунд ясно, где пользователь: Hub, actions registry, properties registry, export или dashboard.
- Scope не смешан с metrics и не выглядит как декоративная строка.
- Метрики не доминируют над таблицей.
- Main registry surface читается в empty и populated состояниях.
- AI/RAG output имеет source/confidence/status и не выглядит как canonical truth.
- Sources diagnostics отделены от primary registry workflow.
