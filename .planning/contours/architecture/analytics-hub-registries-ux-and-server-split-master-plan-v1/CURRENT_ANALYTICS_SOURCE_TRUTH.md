# Current Analytics Source Truth

Контур: `architecture/analytics-hub-registries-ux-and-server-split-master-plan-v1`  
Run ID: `20260517T192328Z-13073`  
Роль: Agent 2 / Executor Part 1, source-truth lane  
Вердикт: текущая Analytics-поверхность уже существует как frontend route/surface, но Hub пока является навигационным shell с placeholder-метриками; durable analytics truth подтверждён только для Product Actions Registry и связанных AI/RAG endpoints.

## Preflight truth

| Проверка | Значение |
|---|---|
| `pwd` | `/opt/processmap-test` |
| Remote | `origin` указывает на `github.com/xiaomibelov/processmap_v1.git`; credentials в отчёте редактированы |
| `git fetch origin` | выполнен успешно |
| Branch | `fix/lockfile-sync-test` |
| HEAD | `5b20bc2d1292f419647238eaf37dac55f9315942` |
| `origin/main` | `d805e1c64c1107b9e3fe6854e031694bf741b187` |
| Staged diff | отсутствует |
| Unstaged product diff | есть; в основном frontend analytics/registry/runtime/style файлы |
| Untracked artifacts | есть; `.agents/`, `.planning/contours/`, screenshots, reports, tools, generated/public files |
| GSD availability | `.planning/` существует, `bin/gsd` найден |
| RAG preflight | выполнен через `node tools/rag/pm-rag-agent-preflight.mjs ...` |

## Подтверждённая code truth

1. Analytics Hub реализован как React-компонент `ProcessAnalyticsHub` в `frontend/src/components/process/analysis/ProcessAnalyticsHub.jsx`.
2. Hub route определяется query-параметром `surface=analytics` через `readAnalyticsHubRoute` / `buildAnalyticsHubUrl` в `frontend/src/app/processMapRouteModel.js`.
3. Hub подключён в `ProcessStage.jsx`: при `analyticsHubRoute.active` рендерится `ProcessAnalyticsHub`.
4. В Explorer есть входы в Hub на workspace/project уровне: `workspace-analytics-hub-nav` и `project-analytics-hub`.
5. Hub содержит карточки `Реестр действий`, `Реестр свойств`, `Дашборды`, `Экспорт`; только `Реестр действий` имеет рабочий переход.
6. Summary cards Hub (`Действия`, `Свойства`, `Процессы`, `Неполные данные`) сейчас показывают `—`, то есть не подтверждают числовую аналитику.
7. Product Actions Registry реализован как dedicated page `ProductActionsRegistryPage` и reusable content `ProductActionsRegistryContent`.
8. Product Actions Registry route определяется query-параметрами `surface=product-actions-registry` и `registry_scope=workspace|project|session`.
9. Backend Product Actions Registry endpoints существуют:
   - `POST /api/analysis/product-actions/registry/query`
   - `POST /api/analysis/product-actions/registry/export.csv`
   - `POST /api/analysis/product-actions/registry/export.xlsx`
10. Product Actions durable source подтверждён как `interview.analysis.product_actions[]`, не BPMN XML.
11. AI bulk suggestions для registry используют `POST /api/analysis/product-actions/suggest-bulk` и сохраняют truth только после явного `Принять выбранные`.
12. RAG touchpoints существуют как read/index endpoints, включая `POST /api/rag/product-actions/index`; RAG preflight отдельно подтверждает read-only boundary.

## Runtime-derived truth from source

Runtime не перезапускался в этой части, поэтому ниже именно derived truth из code-path, а не live browser proof.

| Surface | Route/source | Поведение |
|---|---|---|
| Analytics Hub | `surface=analytics` | Показывает верхнеуровневую страницу с module cards и закрытием обратно к base URL |
| Product Actions Registry | `surface=product-actions-registry` + `registry_scope` | Показывает отдельную product page, не modal, когда активен route |
| Registry workspace scope | backend query + workspace_id | Должен строить сводку без полной загрузки всех session на frontend |
| Registry project scope | backend query + project_id; manual fallback via project sessions | Строки проекта грузятся через backend; ручной выбор сессий оставлен как small-scope fallback |
| Registry session scope | backend query + session_id, fallback to current interview data | Читает product actions текущей session |
| Empty state | `ProductActionsRegistryTable` + `backendStatus` | Показывает `Нет действий`/status copy вместо fake rows |
| Populated state | backend rows normalized into registry rows | Показывает product/action/process/status, фильтры, pagination, export meta |

## Гипотезы и ограничения

- Hub не доказывает настоящую aggregate analytics DB truth: текущие карточки используют `—`, а не запросы к analytics endpoint.
- `Реестр свойств` в Hub является placeholder/proposed surface: есть много property-related runtime artifacts, но dedicated properties registry route/page/API не найден.
- `Дашборды` и `Экспорт` в Hub являются future modules; рабочий экспорт подтверждён только внутри Product Actions Registry.
- Dirty checkout не является merge-ready целиком: product-code diff смешивает Analytics Hub, registry redesign, runtime/version/style файлы и множество untracked artifacts.
- Текущий contour является documentation/source-truth lane; product code не изменялся в этой части.

## Proposed future model separated from truth

Future model может быть таким: Analytics Hub становится L1 workspace для всех analytics modules; Product Actions Registry остаётся L2 dedicated registry; Properties Registry становится отдельной L2 read-only surface; backend постепенно берёт на себя aggregate row shaping и export contracts. Это не подтверждённая текущая runtime truth, а направление из planning artifacts.
