# PLAN — branch hygiene / merge-scope isolation

Контур: `tooling/registry-analytics-branch-hygiene-and-merge-scope-v1`  
Run ID: `20260517T191023Z-10717`  
Роль: Agent 1 / Planner  
Дата: `2026-05-17`

## Цель

Сделать уже review-passed работу по Analytics Hub и Product Actions Registry merge-safe: отделить нужные продуктовые изменения от грязного checkout и unrelated артефактов, не добавляя новую UI-функциональность.

Этот контур не реализует новый UI. Он создает доказательный merge-scope: какие файлы нужно сохранить для продукта, какие исключить, какие требуют решения человека, и как безопасно собрать чистую ветку от `origin/main`.

## Runtime-reviewed product facts

### Analytics Hub

- Контур `feature/process-analytics-hub-and-registry-navigation-v1` имеет `REVIEW_PASS`.
- Analytics Hub существует как отдельная analytics surface.
- `Реестр действий` вложен внутрь Analytics Hub.
- `Реестр свойств`, `Дашборды`, `Экспорт` существуют как placeholders.
- Runtime review проверял переход `?surface=analytics` -> `?surface=product-actions-registry&return_to=analytics`.
- Focused tests проходили для Analytics Hub и Registry.

### Product Actions Registry redesign

- Контур `uiux/product-actions-registry-inner-page-safe-redesign-v1` имеет финальный `REVIEW_PASS`.
- Runtime `http://clearvestnic.ru:5180` отдавал `HTTP 200` и `build-info.json` с `sha=5b20bc2`.
- Runtime-visible версия: `v1.0.137`.
- Registry работает в populated project scope.
- Empty workspace scope сохраняет структуру: метрики, фильтры/actions, AI controls, table shell, pagination shell, sources below.
- AI controls находятся до таблицы.
- `Источники данных` отделены и расположены после pagination.
- Console/network clean для реальных populated paths.
- Focused tests: `ProductActionsRegistryPanel.test.mjs`, `ProductActionsRegistryPage.test.mjs`, `ProcessAnalyticsHub.test.mjs` прошли.

## Branch hygiene problem

Текущая рабочая ветка: `fix/lockfile-sync-test`.  
Текущий checkout грязный и не является merge/release-ready целиком.

Обязательный source/runtime snapshot Agent 1:

| Поле | Значение |
|---|---|
| `pwd` | `/opt/processmap-test` |
| branch | `fix/lockfile-sync-test` |
| `HEAD` | `5b20bc2d1292f419647238eaf37dac55f9315942` |
| `origin/main` после `git fetch origin` | `d805e1c64c1107b9e3fe6854e031694bf741b187` |
| staged diff | отсутствует |
| tracked dirty files | 20 frontend files |
| untracked files | `.agents/`, `.planning/`, `PROCESSMAP/`, screenshots, tools, generated/public assets, evidence files, `.env.backup_*` и другие |

Смысл blocker: в одной рабочей директории смешаны Analytics Hub, Registry redesign, version/build-info proof, BPMN/Diagram leftovers, tooling/generated artifacts, screenshots/evidence и возможные unrelated files. Merge всего checkout нарушит bounded contour.

## Strict non-goals

- Не делать новый UI redesign.
- Не менять Product Actions feature behavior.
- Не менять backend/schema.
- Не менять BPMN XML.
- Не менять RAG runtime.
- Не делать Diagram performance work.
- Не запускать package install.
- Не делать deploy.
- Не делать merge/PR без отдельного явного запроса.
- Не делать destructive git cleanup.
- Не удалять файлы без backup/evidence.
- Не трогать secrets и `.env`.

## File classification model

Каждый tracked dirty и untracked файл должен попасть ровно в одну категорию:

| Категория | Смысл |
|---|---|
| `A. KEEP_ANALYTICS_HUB` | Файлы, обязательные для Analytics Hub, analytics route/surface, Analytics navigation, hub tests/styles/version rows. |
| `B. KEEP_REGISTRY_REDESIGN` | Файлы, обязательные для Registry inner page redesign: filters/table/actions/empty state/sources section, tests/styles/version rows. |
| `C. KEEP_VERSION_RUNTIME_PROOF` | Файлы, обязательные для `appVersion`, changelog, build-info/version proof или уже accepted runtime marker infrastructure. |
| `D. TOOLING_AGENT_INFRA` | Agent workflow, launcher scripts, planning tooling. Не включать в product PR без отдельного решения. |
| `E. EVIDENCE_ONLY` | Screenshots, reports, Playwright traces, generated evidence. Не включать в product merge, кроме accepted planning/docs paths. |
| `F. UNRELATED_OR_UNSAFE` | Всё, что не нужно для Analytics Hub + Registry redesign. Изолировать, revert/stash только по безопасному плану, либо документировать как excluded. |
| `G. NEEDS_HUMAN_DECISION` | Неоднозначные файлы, по которым нужен user decision до merge. |

## Safe isolation strategy

1. Сначала провести полную инвентаризацию dirty state: tracked, staged, untracked.
2. Классифицировать каждый путь по модели A-G.
3. Определить минимальный product merge manifest:
   - Analytics Hub files;
   - Registry redesign files;
   - version/build-info proof files только если они реально требуются для accepted runtime/version story.
4. Исключить из product merge:
   - BPMN/Diagram/runtime leftovers, если они не имеют прямого relation к Analytics/Registry;
   - tooling/launcher/agent scripts;
   - generated/public assets без accepted runtime justification;
   - screenshots/evidence outside accepted planning/docs paths;
   - `.env`, `.env.backup_*`, secrets-adjacent файлы.
5. Предпочтительная стратегия: создать чистую branch/worktree от свежего `origin/main`, затем применить только явно классифицированные A/B/C файлы через patch/cherry-pick/manual restore с manifest proof.
6. Любое действие, похожее на cleanup, reset, checkout overwrite или delete, запрещено без backup/evidence и отдельного отчёта.
7. До user approval не делать merge, PR, deploy или push.

## Worker split

### Agent 2 / Worker — Git/file classification and clean-scope preparation

Независимый scope:

- Зафиксировать git/source truth.
- Инвентаризировать tracked dirty, staged, untracked.
- Классифицировать каждый файл по A-G.
- Подготовить merge-scope manifest.
- Найти минимальный набор product files для Analytics Hub + Registry redesign.
- Предложить clean branch/worktree strategy от `origin/main`.
- Если безопасно в рамках плана, подготовить patch/manifest only; не merge.
- Не удалять unrelated files.
- Не делать force checkout/reset.
- Писать отчёты на русском.

Required reports:

- `WORKER_2_REPORT.md`
- `GIT_STATUS_INVENTORY.md`
- `CHANGED_FILES_CLASSIFICATION.md`
- `UNTRACKED_FILES_CLASSIFICATION.md`
- `MERGE_SCOPE_MANIFEST.md`
- `CLEAN_BRANCH_STRATEGY.md`
- `EXCLUDED_FILES_REPORT.md`
- `WORKER_2_DONE`
- если blocked: `EXEC_PART_1_BLOCKED.md`

### Agent 3 / Worker — Independent validation and runtime/test preservation plan

Независимый scope:

- Самостоятельно собрать preservation checklist по review-passed Analytics/Registry behavior.
- Зафиксировать, какие runtime/test proofs нельзя потерять после isolation.
- Проверить, не смешаны ли generated/evidence files с source scope.
- Подготовить Agent 4 review checklist.
- Писать отчёты на русском.

Required reports:

- `WORKER_3_REPORT.md`
- `RUNTIME_VALIDATION_PRESERVATION_PLAN.md`
- `PRODUCT_CHANGE_PRESERVATION_CHECKLIST.md`
- `EVIDENCE_AND_GENERATED_ARTIFACTS_AUDIT.md`
- `TESTS_TO_RERUN_AFTER_ISOLATION.md`
- `AGENT4_REVIEW_CHECKLIST.md`
- `WORKER_3_DONE`
- если blocked: `EXEC_PART_2_BLOCKED.md`

## Agent 4 gates

Agent 4 может выдать `REVIEW_PASS` только если:

- каждый dirty tracked файл классифицирован;
- каждый untracked файл классифицирован;
- Analytics Hub files явно идентифицированы;
- Registry redesign files явно идентифицированы;
- unrelated files явно идентифицированы и исключены из product merge scope;
- generated/evidence artifacts не входят в product merge scope;
- clean branch/worktree strategy actionable;
- rollback/no-destructive policy соблюдена;
- runtime/test preservation checklist существует;
- backend/schema/BPMN/RAG изменения не включены, если они не classified и не justified явно;
- merge/PR/deploy не выполнялись.

## No-destructive-git rules

- Запрещены `git reset --hard`, `git checkout -- <path>`, `git clean`, force-update веток и любые destructive cleanup команды без отдельного явного user approval.
- Если нужно убрать unrelated файлы, сначала описать backup/isolation strategy.
- Если файл содержит secret-like имя или `.env`, не печатать содержимое.
- Git remote в отчётах печатать только sanitized, без token/credentials.
- Product code не менять в этом planning contour.

## Acceptance criteria

- Создан полный planning pack в `.planning/contours/tooling/registry-analytics-branch-hygiene-and-merge-scope-v1/`.
- `AGENT_RUN_ID` содержит ровно `20260517T191023Z-10717`.
- Worker prompts независимы и допускают параллельный старт.
- Prompt для independent validation lane не содержит forbidden dependency phrases.
- `READY_FOR_EXECUTION` обновлён после записи артефактов.
- После записи выполнен mirror report в Project Atlas.

## Planner verdict

Контур нужен, потому что product/runtime работа уже review-passed, но текущий dirty checkout содержит смешанный scope. Без classification manifest и clean branch strategy нельзя безопасно решать, что попадёт в product merge.
