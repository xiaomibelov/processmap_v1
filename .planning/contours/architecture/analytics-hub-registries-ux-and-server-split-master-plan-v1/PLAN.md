# Master plan: Analytics Hub, registries UX and server split

Контур: `architecture/analytics-hub-registries-ux-and-server-split-master-plan-v1`  
Run ID: `20260517T192328Z-13073`  
Статус: `READY_FOR_EXECUTION`

## Зачем нужен контур

Текущий runtime `Product Actions Registry` уже функционален, но пользовательская проблема не сводится к локальному полированию одной страницы. Нужен программный план следующей эволюции `ProcessMap Analytics`: информационная архитектура, визуальная иерархия, роли реестров, безопасный слой AI/RAG и постепенный перенос тяжелой аналитической оркестрации с frontend на backend/server.

Главная цель этого контура - подготовить конкретный, bounded и проверяемый план реализации, а не менять product-code. Контур должен стать основанием для следующих отдельных implementation contours.

## Текущие pain points

1. `Реестр действий с продуктом` визуально слабый и трудно схватывается.
2. `Workspace / Проект / Сессия` слишком прозрачны и плохо отделены друг от друга.
3. Метрики `Сессий / Строк / Полных / Неполных / После фильтров` занимают слишком много ширины.
4. Зона AI suggestions и flow применения/понимания действий ощущаются неудобными.
5. Страница выглядит как одна непрерывная поверхность без визуальных якорей.
6. Недостаточно сильная иерархия секций.
7. Для registry может быть нужен не только flat table, но expandable rows или master-detail.
8. Общая поверхность Analytics требует top-level структуры.
9. Нужен отдельный `Реестр свойств`.
10. `Реестр свойств` должен описывать BPMN-related properties, overlays, attributes и классификацию по типам/группам.
11. AI/RAG должен рассматриваться как read-only support layer для аналитики.
12. Часть аналитических обязанностей нужно постепенно переносить на backend/server.

## Non-goals

- Не менять frontend/backend product-code.
- Не делать прямой UI redesign в коде.
- Не делать backend/API implementation.
- Не делать schema migration.
- Не менять BPMN XML.
- Не внедрять новый AI runtime или RAG runtime.
- Не открывать PR, не merge, не deploy.
- Не выдавать гипотезы за durable product truth.

## Source/runtime truth status

- Workspace: `/opt/processmap-test`.
- Branch: `fix/lockfile-sync-test`.
- HEAD: `5b20bc2d1292f419647238eaf37dac55f9315942`.
- `origin/main`: `d805e1c64c1107b9e3fe6854e031694bf741b187`.
- Tree: dirty, включая product-code изменения и untracked planning/runtime artifacts.
- Вывод: product implementation в этом checkout запрещен для данного контура. Разрешены только артефакты в `.planning/contours/architecture/analytics-hub-registries-ux-and-server-split-master-plan-v1/`.

## Worker split

### Agent 2 / Worker: architecture/source-truth lane

Задача: независимо зафиксировать фактическое текущее состояние аналитических поверхностей и registry runtime.

Основные outputs:
- `WORKER_2_REPORT.md`
- `CURRENT_ANALYTICS_SOURCE_TRUTH.md`
- `CURRENT_RUNTIME_SURFACES_MAP.md`
- `CONFIRMED_VS_HYPOTHESIS_MATRIX.md`
- `CURRENT_ACTIONS_REGISTRY_STATE.md`
- `CURRENT_ANALYTICS_AI_RAG_TOUCHPOINTS.md`
- `WORKER_2_DONE`

### Agent 3 / Worker: UX/IA/server-split lane

Задача: независимо сформировать UX/IA направление и server-split рекомендации, опираясь на пользовательские замечания, текущую поверхность и собственную проверку.

Основные outputs:
- `WORKER_3_REPORT.md`
- `UX_IA_PROBLEM_MAP.md`
- `ACTIONS_REGISTRY_REDESIGN_OPTIONS.md`
- `PROPERTIES_REGISTRY_DESIGN_DIRECTION.md`
- `ANALYTICS_SERVER_SPLIT_CANDIDATES.md`
- `PHASED_RECOMMENDATION_MATRIX.md`
- `WORKER_3_DONE`

## Deliverables planning pack

- `ARCHITECTURE_OVERVIEW.md`
- `ANALYTICS_INFORMATION_ARCHITECTURE.md`
- `PRODUCT_ACTIONS_REGISTRY_REDESIGN_DIRECTION.md`
- `PRODUCT_PROPERTIES_REGISTRY_CONCEPT.md`
- `AI_RAG_IN_ANALYTICS_PLAN.md`
- `FRONTEND_BACKEND_RESPONSIBILITY_SPLIT.md`
- `IMPLEMENTATION_ROADMAP.md`
- `RUNTIME_AND_SOURCE_TRUTH.md`
- worker/reviewer prompts
- `STATE.json`
- `AGENT_RUN_ID`
- `READY_FOR_EXECUTION`

## Review gates

Agent 4 может ставить `REVIEW_PASS` только если:
- current state grounded in source/runtime truth;
- confirmed facts and hypotheses are clearly separated;
- Analytics IA coherent and navigable;
- Product Actions Registry redesign direction specific enough for Phase 1 implementation;
- Product Properties Registry described as concept/proposed model where durable truth is absent;
- AI/RAG remains read-only, no auto-mutation, no BPMN XML mutation;
- frontend/backend split is phased and realistic;
- roadmap produces concrete follow-up contour IDs.

## Phased roadmap summary

1. Phase 0 - approve architecture / IA / UX direction.
2. Phase 1 - bounded Product Actions Registry IA/UI refactor.
3. Phase 2 - Product Properties Registry first version.
4. Phase 3 - server-side analytics aggregation/export split.
5. Phase 4 - AI/RAG-assisted analytics enhancements.
6. Phase 5 - dashboards and advanced analytics expansion.

Полная декомпозиция фаз находится в `IMPLEMENTATION_ROADMAP.md`.
