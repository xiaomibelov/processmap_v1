# Архитектурный обзор Analytics evolution

## Целевая картина

`Аналитика` должна стать не одной страницей и не набором случайных ссылок, а верхнеуровневым рабочим пространством для чтения процессов, действий, свойств, качества данных, экспорта и будущих дашбордов.

Предлагаемая модель:
- `Analytics Hub` - стартовая поверхность с модулями, последним контекстом и быстрыми переходами.
- `Реестр действий` - операционный registry product/process actions, ориентированный на события, полноту и источники.
- `Реестр свойств` - новый registry BPMN/process properties, overlays, attributes and classification groups.
- `Дашборды` - агрегированные визуальные summary, тренды, completeness, usage and quality signals.
- `Экспорт` - подготовка выгрузок и audit-friendly snapshots.
- `AI/RAG помощник` - read-only объяснение, поиск, подсказки фильтрации и summary.

## Принципы

- Top-level IA сначала, локальные registry improvements потом.
- Сильные визуальные якоря: модуль, scope, summary, working surface, data sources.
- Один экран не должен выглядеть как бесконечная прозрачная плоскость.
- Client отвечает за interaction, display state и lightweight filtering.
- Server постепенно получает aggregation, row shaping, pagination, export preparation, summaries and AI batch support.
- RAG не является источником истины и не выполняет mutations.

## Подтверждено сейчас

- В repo/worktree присутствуют analytics-related файлы и screenshots, включая `ProcessAnalyticsHub`, `ProductActionsRegistryPanel`, registry screenshots and tests.
- Дерево грязное, есть product-code изменения, поэтому этот planning contour не должен менять runtime files.
- RAG preflight доступен и подтвердил read-only AI/RAG boundary.

## Гипотезы и proposed model

- `Реестр свойств` как отдельная product surface пока является proposed model, пока Worker 2 не подтвердит существующие property artifacts.
- Server-side analytics view models являются migration direction, а не обещанием немедленной backend реализации.
- Master-detail для actions registry является target interaction option, которую нужно проверить через UX acceptance в Phase 1.

## Architecture decision candidates

| Decision | Recommendation | Reason |
|---|---|---|
| Analytics as hub or single registry | Hub + module routes | Пользовательская проблема шире одной registry страницы |
| Actions registry table model | Table + expandable/detail layer | Flat rows недостаточно объясняют источники, AI suggestions и completeness |
| Properties registry source truth | Define explicitly in Phase 2 | Нельзя выдумывать durable truth до инвентаризации |
| AI/RAG | Read-only support | Соответствует RAG policy и снижает риск auto-mutation |
| Server split | Incremental view-model APIs | Позволяет не ломать frontend и мигрировать тяжелые операции постепенно |
