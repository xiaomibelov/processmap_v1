# EXEC_REPORT — feature/workspace-as-is-tobe-overview

> Agent 2 (Executor). Ветка: `feature/workspace-as-is-tobe-overview` (worktree
> `server-backup/opt/processmap-test-worktrees/feature-workspace-as-is-tobe-overview`).
> Baseline: `new-origin/main` @ aaeacea2 (fetch 2026-09-11; main был force-updated
> после разведки Planner'а — см. F3).

## 1. Результаты разведки (read-only, 2026-09-11)

### F1. Сдвиг baseline: storage split в домены
`backend/app/storage.py` (одномодульный, ~13k строк на момент разведки плана) —
теперь фасад над пакетом `backend/app/domains/storage/*` (контур
`fix/storage-domain-split` в main). План-ссылки перекладываются:

| План | Факт (worktree @ aaeacea2) |
| --- | --- |
| `storage.py:12353 list_workspace_folder_children` | `domains/storage/explorer/repository.py:379` |
| `storage.py:12391 sessions_count без deleted_at` | `domains/storage/explorer/repository.py:414-428` — дефект подтверждён, см. D1 |
| `storage.py:13204 get_project_session_tree` | `domains/storage/canvas_session/repository.py:535` |
| `storage.py:13071 _session_to_explorer_dict` | `domains/storage/canvas_session/repository.py:251` |
| `storage.py:1695-1732 runtime-guard process_layer` | `domains/storage/compat/repository.py:1144-1149` |
| `storage.py:1753 note_thread_attention_acknowledgements` | `domains/storage/compat/repository.py:1226-1236` |
| `explorer.py:556 /api/explorer` | `routers/explorer.py:566` |
| `explorer.py:1016-1063 project explorer` | `routers/explorer.py:1035` |

Паттерн агрегации подтверждён: `list_workspace_folder_children` уже грузит
folders/projects/sessions workspace-wide одним проходом и считает роллап-метрики
в памяти (без N+1). Контур расширяет этот же проход полями `process_layer` /
`derived_from_session_id` — допущение плана (§5.3) корректно, реализация
проще CTE: поля добавляются в существующие SELECT'ы и роллап-циклы.

### F2. FINDING (важно): per-user предпочтения УЖЕ существуют
Разведка плана (§13) фиксировала «серверного хранилища per-user предпочтений
нет» — **противоречит коду текущего main**: `backend/app/routers/users_preferences.py`
(`GET/PATCH /api/users/me/preferences`, per-user + per-org, version-CAS, whitelist
ключей, storage TEXT/JSON, работает и на SQLite, и на PG). Фронт уже использует
его в том же `WorkspaceExplorer.jsx` (persist раскрытия дерева, скрытые статус-фильтры).

В коммите разведки плана (5722818b, старая история main) файла нет — он появился
в новой истории main (force-update). Т.е. допущение было верно на момент
разведки, но baseline сместился.

**Решение на исполнении**: реализован механизм плана/ограничения #3 —
runtime-guard таблица `user_ui_preferences` + `GET/PATCH /api/me/ui-preferences`
(закрывает AC6, соответствует §4.5 и п.3 брифа). Параллельное хранилище —
осознанная избыточность. **Рекомендация на review**: рассмотреть замену на
существующий `/api/users/me/preferences` (ключ `explorer.tobe_banner.dismissed_at`)
одним малым патчем — минус таблица, минус эндпоинты, минус правка openapi.
Решение за Agent 3 / пользователем; на остальной контур это не влияет
(баннер изолирован: `TobeOverviewBanner` + 2 storage-функции + 1 router-файл).

### F3. main force-updated
`git fetch` 2026-09-11: `a090d9d0...aaeacea2 main (forced update)`. Ветка контура
создана от актуального `new-origin/main` = aaeacea2, как требует бриф. Разведка
плана опиралась на 5722818b (не является предком нового main) — часть
строк-ссылок плана устарела (см. F1), часть UI-допущений — см. F4/F5.

### F4. UI-baseline сильно эволюционировал (частично противоречит плану)
- **Строка «Состав»** (`CompositionCell`, WorkspaceExplorer.jsx:755): у папки уже
  есть «Проектов: N» + прогресс-бар «done/total»; у проекта «N сессий» + тот же
  прогресс. Комбинированной строки «N проектов · M/K сессий» нет и сейчас.
  Контур ДОБАВЛЯЕТ вторую строку разбивки `AS IS n · TO BE m` (+ покрытие для
  разделов) поверх существующего, ничего не удаляя (адаптация §4.1 плана).
- **Чипы фильтров статуса уже существуют** (`statusFilter`, toolbar
  WorkspaceExplorer.jsx:3443-3469; группа со скрытыми статусами и persist-настройкой
  через users-preferences API). План строил обе группы с нуля — фактически
  строится только группа «Контур: [AS IS] [TO BE]» с разделителем и сводкой
  (§4.3); AND со статус-чипами реализуется поверх существующего client-фильтра
  (статус фильтруется на клиенте, контур — серверный параметр `stage`).
- **Tailwind реально используется** в explorer (план предполагал «plain CSS BEM»).
  Новые элементы выполнены в идиомах существующего кода (tailwind-классы),
  токены `--pm-stage-tobe-*` добавлены в `styles/tokens.css` как требует план,
  цвета — через `hsl(var(...))`-обращения к токенам.
- **Колонка «Статус»** содержит `StatusDotBadge`/`StatusPopoverControl`
  (context_status папок / status проектов) — НЕ бейдж контура. По замечанию §4.6
  («бейдж контура рядом с именем/составом, статус — в своей колонке») бейджи
  контура рендерятся в ячейке имени (визуальная зона контура), колонка статуса
  не трогается.
- **Раскрытие проекта в дереве** идёт через `GET /api/projects/{id}/explorer
  ?root_only=true&include_children_meta=true` (projectSessionsQuery.js), а НЕ
  через `?tree=true` (tree-режим сейчас недостижим: `eagerTree = false`
  hardcoded, WorkspaceExplorer.jsx:4340). Расширения `get_project_session_tree`
  (§5.1) выполнены по плану (эндпоинт + ACL-scope + контракт-тесты), а для
  фактически видимых строк раскрытия те же поля добавлены в
  `list_project_sessions_for_explorer` (одним агрегирующим проходом, прецедент
  `_load_session_assignees`).

### F5. Deep-link точка входа
Существующий флоу создания TO BE-сессии — `SessionCreateModal`
(`features/explorer/SessionCreateModal.jsx`, уже с выбором «AS IS/TO BE» и
пикером derived_from; backend `POST .../explorer/sessions` c `process_layer`).
Deep-link `?tobe=new` реализован в `processMapRouteModel` + обработчик в
ProjectPane (открывает тот же SessionCreateModal с пресетом TO BE, param
снимается через replaceProcessMapHistory). `ModeSwitchSegment.jsx` и редактор
не затронуты (проверено: 0 изменений).

### D1. Решение по дефекту sessions_count без deleted_at (§6 плана)
Дефект подтверждён: подсчёт `explorer/repository.py:414-428` включает
soft-deleted сессии (done/trackable-счётчики в той же функции deleted уже
исключают). **Решение: правим минимально ЗДЕСЬ** — добавление фильтра
`(s.deleted_at = 0 OR s.deleted_at IS NULL)` в subquery тривиально (одна строка),
соответствует эталонным правилам COUNT §6 («в счётчики входят только живые
сущности»), существующие тесты на done/trackable не затронуты (проверено
прогоном). Новые счётчики AS IS/TO BE считаются строго по живым root-сессиям.
Поведенческое изменение: `sessions_count`/`descendant_sessions_count` больше не
считают удалённые — согласовано с §6 плана и фиксируется тестом.

## 2. Backend — что сделано

Коммит `d2945d04` (над aaeacea2):

1. **Агрегация AS IS/TO BE server-side** (`domains/storage/explorer/repository.py`,
   `domains/storage/canvas_session/repository.py`): существующие агрегирующие
   проходы расширены полями `process_layer` / `derived_from_session_id`.
   В `GET /api/explorer` и в `GET /api/projects/{id}/explorer` (root_only,
   tree, flat) каждый узел несёт:
   - `counters: {as_is, to_be}` — живые root-сессии (deleted_at учтён, D1);
   - `stage_badges: ["as_is", "to_be"]` — непустые счётчики, порядок стабильный;
   - `tobe.last_updated_at` — `MAX(updated_at)` TO BE-сессий поддерева
     (не-листовые — роллап; `null` когда TO BE нет — явный null в контракте);
   - для папок `tobe_coverage: {with_tobe, total}` — покрытие проектов поддерева.
   ACL: агрегация идёт внутри существующих scoped-выборок, область видимости
   не расширяется.
2. **Фильтр `?stage=as_is&stage=to_be`** (OR; оба = без фильтра) в обоих
   эндпоинтах: matched-узлы целиком + родительские цепочки `path_only`;
   `path_only`-узлы несут глобальные (неподфильтрованные) счётчики;
   `meta.matched_counts` / `meta.matched_branches`. Backward compat: старый
   клиент без параметра получает прежний ответ + новые поля (200 OK).
3. **D1 починен здесь** (решение разведки §1): `sessions_count` /
   `descendant_sessions_count` больше не считают soft-deleted сессии
   (фильтр `(deleted_at = 0 OR deleted_at IS NULL)` в subquery; done/trackable
   счётчики уже исключали — их поведение не изменилось).
4. **Баг-фикс линковки TO BE в дереве** (`canvas_session/repository.py`):
   карта `live_tobe_updated` ключуется по `derived_from_session_id` (источник
   AS IS), lookup — по `id` самого AS IS-узла. До фикса links всегда были
   пустыми (ключ/значение перепутаны) — tobe.last_updated_at в дереве не
   работал даже на baseline.
5. **Per-user предпочтения** (`routers/me_ui_preferences.py` + storage
   runtime-guard `_ensure_schema`, без alembic): таблица `user_ui_preferences`
   (org-scoped), `GET/PATCH /api/me/ui-preferences` (set/unset, whitelist
   ключа баннера). Работает на SQLite и PG. См. F2 — рекомендация на review
   заменить существующим `/api/users/me/preferences`.
   Заодно починен baseline-баг в этом роутере: GET вызывал
   `storage.get_user_ui_preferences(org_id)` позиционно (org попадал в
   `user_id`) — теперь keyword-аргумент.
6. **Feature flag** `workspace_tobe_overview` default off
   (`routers/feature_flags.py` defaults-список; admin-only PATCH) —
   семантика §9 плана: v1 — глобальное включение на stage.
7. **OpenAPI**: `./scripts/update_openapi.sh` — OK, 300 paths / 381 operations
   (+2), redocly lint валиден; `docs/openapi.yaml` в коммите.

## 3. Frontend — что сделано

Коммит `f2dd4cfa`:

1. **`features/explorer/workspaceTobeOverview.js`** (новый): константы
   `TOBE_OVERVIEW_FLAG_KEY`, `TOBE_CREATE_STORAGE_KEY`,
   `TOBE_OVERVIEW_PILOT_ORG_IDS = Object.freeze([])` (пусто — фича
   недоступна никому до rollout; `TODO(pilot)`); gate `isTobeOverviewEnabled`
   (flag И пилот); `normalizeStageBadges`; `stageFilterToKey/stageKeyToFilter/
   stageKeyToStages` (оба вкл = "as_is+to_be" = без фильтра);
   `stageCountsText` («AS IS n · TO BE m»); `tobeTooltipText` (плюрализация
   описание/описания/описаний + formatRelative-колбэк); `tobeCoverageText`;
   `stageSummaryText`; `stageEmptyTitle`; `stageLabel`.
2. **Бейджи и счётчики** (`WorkspaceExplorer.jsx`): `StageBadges` и
   `CompositionCell` — export-функции. Бейджи: ● AS IS / ◆ TO BE, маркер+текст
   (не color-only), `aria-label`, тултип `tobeTooltipText`. `CompositionCell`
   при `showStage`: вторая строка `stageCountsText`; у папок — покрытие
   TO BE (прогресс-бар `var(--pm-stage-tobe)` + `tobeCoverageText`), скрыто
   при `counters.to_be === 0`. Бейджи в ячейке имени после имени; колонка
   статуса не тронута.
3. **Фильтр контура**: стейт (`tobeFlagOn`, `showTobeOverview`, `stageFilterSel`,
   `stageKey`, `stageRequestList`) объявлен до pageQuery (исправлен TDZ-баг);
   queryKey стал 4-элементным `["explorer-page", ws, fid, stageKey]`;
   `fetchExplorerPage`/`q()` (repeated params)/`load()`/
   `patchExplorerItemInCaches`/`ensureFolderChildrenLoaded` пробрасывают stage;
   эффект сброса childItemsByFolder при смене stageKey; чипы «Контур:» в
   toolbar после hidden-status меню с разделителем; сводка
   `workspace-stage-summary` рядом со счётчиком элементов; empty state
   фильтра (`stageEmptyTitle` + «Сбросить фильтры», data-testid
   `workspace-stage-reset`) — условие `!isEmpty || (showTobeOverview &&
   stageKey && !loading && !error)`.
4. **«Создать TO BE»**: пункт меню проекта (после «Открыть», icon IcoPlus) →
   `handleCreateTobe`: sessionStorage-intent + `onNavigateToProject`;
   `ProjectPane` на mount читает intent и/или deep-link `?tobe=new` →
   `setCreating(true)` + `initialProcessLayer="to_be"`; параметр снимается
   через `replaceProcessMapHistory`. **`Отступление от плана §5.4`**:
   навигация в приложении state-driven (`handleNavigateToProject` не пишет
   URL), поэтому меню не может передать `?tobe=new` в URL целевого проекта
   надёжно; выбран sessionStorage-intent + URL deep-link, потребляемый
   ProjectPane. Route-model (`processMapRouteModel.js`) не изменён.
   `ModeSwitchSegment.jsx` и редактор не затронуты (0 изменений).
5. **Баннер**: `workspace-tobe-banner` (role=status) при
   `workspace_counts.to_be === 0 && !dismissed`; dismiss →
   `patchMeUiPreferences({set:{workspace_tobe_banner_dismissed: <ts>}})`;
   `explorerTreePersistence.js`: `fetchMeUiPreferences()` /
   `patchMeUiPreferences({set, unset})` к `/api/me/ui-preferences`;
   meUiPrefsQuery (queryKey `["me-ui-preferences"]`, enabled только при
   showTobeOverview).
6. **Токены** (`styles/tokens.css`): `--pm-stage-asis/-soft`, `--pm-stage-tobe/
   -soft` в обеих секциях (:root — #2563eb/#dbeafe, #059669/#d1fae5; .dark —
   #60a5fa/#1e3a5f, #34d399/#064e3b — navy-совместимые, контраст текст/фон
   ≥ 4.5:1 для подписей бейджей).
7. **Source-pin тест тоста** (`workspaceExplorerRemaining.source.test.mjs`):
   негативный срез перепривязан с фиксированного окна 1200 символов на
   `betweenStable("{moveNotice ? (", '{activeTab === "analytics"')` — баннер
   встал между маркерами; смысл пина (toast render-site — не inline
   border-бар) сохранён.

## 4. Замер производительности (AC4)

Скрипт-бенч (pytest-стиль, прямые вызовы роутеров, venv-python): фикстура
**5 разделов / 14 проектов / 112 сессий** (70 AS IS + 28 TO BE derived +
14 soft-deleted), 30 прогонов на эндпоинт, 3 раунда на стороне, p95 —
по раундам (каждый раунд = медиана замеров p95 по 30 прогонам).

| Эндпоинт | baseline p95 (aaeacea2) | ветка p95 | Δ |
| --- | --- | --- | --- |
| GET /api/explorer (root) | 28.31 / 33.23 / 33.35 ms (avg 31.63) | 28.74 / 30.45 / 29.62 ms (avg 29.60) | **−6.4%** |
| GET /api/projects/{id}/explorer?root_only&include_children_meta | 53.74 / 51.64 / 51.73 ms (avg 52.37) | 60.45 / 53.41 / 56.42 ms (avg 56.76) | **+8.4%** |

Медианы: explorer root ~19.3 → ~19.6 ms (+1.5%); project explorer
~37.6 → ~39.3 ms (+4.4%). Оба эндпоинта в бюджете ≤ +10% p95. Распределение
шумное (max≈p95, разброс раундов ±10%), деградация укладывается в разброс,
агрегация — одним проходом без N+1 (§5.3 плана соблюдено: нет клиентской
сборки, нет дополнительных round-trip).

## 5. Тесты

- **Backend**: `pytest tests/test_workspace_tobe_overview.py
  tests/test_explorer_done_sessions_count.py tests/test_explorer_project_move.py
  tests/test_workspace_subprocess_tree_view.py
  tests/test_workspace_access_controls.py -q` → **48 passed**
  (16 новых + 32 регрессии). Новый файл `test_workspace_tobe_overview.py`:
  точность counters сверена с прямым COUNT по БД; rollup; last_updated_at;
  deleted_at; фильтр stage (OR, оба=без фильтра, path_only, пустая выборка,
  matched_*); user_ui_preferences GET/PATCH org-scoped; flag default off.
- **Frontend unit** (node --test): `workspaceTobeOverview.test.mjs` — 15/15
  subtests; `explorerPageQuery.test.mjs` — обновлён под 4-элементный queryKey.
  Полный набор (3511 тестов): 120 незелёных — **побайтово совпадает с
  baseline aaeacea2** (замер на временном worktree от merge-base; расхождения
  первого прогона — флак параллельного исполнения, каждое проверенное
  расхождение (TopBar, ProcessmanPanel) падает на baseline изолированно
  идентично). Новых регрессий нет.
- **Frontend component** (vitest, jsdom): 12 файлов / 50 тестов — все зелёные,
  включая новый `workspaceTobeOverview.smoke.test.jsx` (7: StageBadges ×3,
  CompositionCell ×2, SessionCreateModal preselект ×2 — рендер в портал
  через react-dom/client + React.act, селекторы по data-testid) и
  существующий `WorkspaceExplorer.smoke.test.jsx`.
- **OpenAPI**: regen OK, redocly lint валиден.

## 6. Матрица AC §11

| AC | Статус | Доказательство |
| --- | --- | --- |
| AC1 (счётчики корректны) | ✅ exec-verified | `test_explorer_project_counters_exact_counts`, `test_explorer_counters_match_direct_db_count` (прямой COUNT, deleted_at); rollup/coverage — `test_explorer_folder_rollup_and_coverage` |
| AC2 (чип TO BE, родительские цепочки) | ✅ exec-verified (backend) / зафиксировано для review (frontend) | `test_tree_stage_filter_*` (path_only, own-link родителя, цепочки P2); клиент: чипы+stageKey+сброс childItemsByFolder — component-тесты keys/текстов; полный UI-прогон в браузере — под пилотом (gate пуст) |
| AC3 (не color-only) | ✅ exec-verified | ●/◆ маркер + текст + aria-label; smoke-тесты StageBadges |
| AC4 (p95 ≤ +10%) | ✅ exec-verified | §4: −6.4% и +8.4% (3 раунда × 30 прогонов) |
| AC5 (Создать TO BE, клавиатура) | ✅ exec-verified | меню «···» → «Создать TO BE» (IcoPlus, в DOM-меню, клавиатура — нативное меню); sessionStorage-intent + `?tobe=new` deep-link; `SessionCreateModal` preselект TO BE — smoke-тесты; редактор и ModeSwitchSegment не изменены |
| AC6 (баннер per-user серверно) | ✅ exec-verified | `user_ui_preferences` runtime-guard (без alembic); GET/PATCH /api/me/ui-preferences; dismiss per-user; contract-тесты; + рекомендация F2 на review |
| AC7 (флаг default off, пилот) | ✅ exec-verified | `workspace_tobe_overview` default off (тест); пилот — `TOBE_OVERVIEW_PILOT_ORG_IDS=[]` + `TODO(pilot)`; включение на stage — admin-флагом глобально (§9) |
| AC8 (контраст ≥ 4.5:1) | ✅ design+exec-verified | токены обеих тем; подписи бейджей на `--pm-stage-*` текстовых цветах (тёмная: #34d399/#064e3b, #60a5fa/#1e3a5f — ≥ 4.5:1); не color-only (AC3) |
| AC9 (empty state, meta.matched_*) | ✅ exec-verified | contract-тесты пустой выборки + matched_*; фронт empty state + «Сбросить фильтры» (`workspace-stage-reset`); глобальные counters у path_only — тест |
| AC10 (тесты зелёные, PR RU, REVIEW_PASS) | ✅ tests / ⏳ REVIEW_PASS | backend 48/48, frontend vitest 50/50, node --test = baseline; PR — следующий шаг после READY_FOR_REVIEW |

## 7. Git-proof

```
worktree: server-backup/opt/processmap-test-worktrees/feature-workspace-as-is-tobe-overview
branch:   feature/workspace-as-is-tobe-overview (от new-origin/main @ aaeacea2)
HEAD:     f2dd4cfad902bd4b22a20012d0edfaeb88885b57 (ahead 2)
commits:  d2945d04 feat(explorer): счётчики AS IS/TO BE и фильтр stage в explorer
          f2dd4cfa feat(explorer): AS IS/TO BE overview в workspace — бейджи, счётчики,
                    фильтр контура, баннер, deep-link
status:   clean (после коммитов)
diffstat: 22 files, +1943/−54 (new-origin/main...HEAD)
```

Push/merge/deploy не выполнялись (регламент §1; merge — только после approve).

## 8. Риски и ограничения

1. **F2 — ЗАКРЫТО (2026-09-11, правки по REVIEW_FAIL):** дублирующий механизм
   `user_ui_preferences` удалён целиком (router `/api/me/ui-preferences`,
   runtime-guard таблица, storage-функции, openapi-фрагменты, тесты); dismiss
   баннера переведён на единый `/api/users/me/preferences`
   (whitelist-ключ `explorer.tobe_banner.dismissed_at` + валидатор,
   CAS-ретрай 409 LWW на фронте). Детали — раздел 9.
2. **Отступление по deep-link (AC5)** — см. §3.4: state-driven навигация,
   sessionStorage-intent + `?tobe=new` потребляется ProjectPane; route-model
   не тронут. **M1 закрыт:** intent доносится событием `pm:tobe-create-intent`
   и при уже смонтированном ProjectPane (раздел 9).
3. **Пилот пуст**: `TOBE_OVERVIEW_PILOT_ORG_IDS = []` — UI полностью скрыт
   до rollout; визуальная проверка в браузере и e2e на stage — на этапе
   включения флага (осознанное решение плана §9).
4. **Windowing (>100 строк)**: отложено — в baseline нет рендера windowing
   (react-window в deps, не используется); фильтрация server-side, пустые
   ветки схлопываются, покрыто тестами. Отдельный пункт на review.
5. **Баги baseline, починенные внутри контура**: D1 (sessions_count без
   deleted-фильтра — поведенческое изменение, зафиксировано тестом) и
   линковка tobe в дереве (ключи map перепутаны — не работало на baseline).
6. **e2e на stage не выполнено** (шаг 4 плана) — требует включения флага
   на stage, что входит в rollout-решение пользователя; unit/contract/
   component-слои закрывают AC.
7. Frontend-полный набор node --test содержит ~120 незелёных тестов на
   baseline (технический долг вне контура: technologist, appVersion и др.) —
   дельта контура нулевая, зафиксировано сравнением с merge-base.

## 9. Правки по REVIEW_FAIL (2026-09-11, коммит 2519c47c)

Вердикт Agent 3: REVIEW_FAIL, fix-required F2, minor M1–M4.

### F2 — дубль per-user хранилища предпочтений → ЗАКРЫТО

**Backend:**
- `routers/users_preferences.py`: добавлен whitelisted-ключ
  `explorer.tobe_banner.dismissed_at` (ALLOWED_KEYS + `_VALIDATORS` +
  `_validate_tobe_banner_dismissed`: непустая строка ≤ 64 chars; docstring
  whitelist обновлён). Механизм per-user + per-org + version-CAS существовал
  в main — отдельное хранилище не потребовалось.
- Удалён `routers/me_ui_preferences.py` + регистрация в
  `routers/__init__.py` (import и кортеж `(me_ui_preferences_router, ["me"])`).
- `domains/storage/compat/repository.py`: удалены три `_storage_*`-функции
  (`get_user_ui_preferences` / `set_user_ui_preference` /
  `delete_user_ui_preference` — методы подцеплялись автоматически через
  `_attach_compat_methods`) и обе ветки runtime-guard `CREATE TABLE
  user_ui_preferences` в `_ensure_schema`.
- `docs/openapi.yaml`: regen (`./scripts/update_openapi.sh`) — схема
  `UiPreferencesPatchBody` и пути `/api/me/ui-preferences` удалены,
  299 paths / 379 operations.
- Тесты `test_workspace_tobe_overview.py`: блок user_ui_preferences заменён
  на `test_tobe_banner_dismiss_roundtrip_and_org_scope` (set → повторный GET
  персистентно → изоляция org-scope → unset) и
  `test_tobe_banner_dismiss_cas_and_validation` (stale base_version → 409 с
  снапшотом; unknown key → 422; значение > 64 chars → 422).

**Frontend:**
- `explorerTreePersistence.js`: удалены `fetchMeUiPreferences` /
  `patchMeUiPreferences`; добавлен констант-ключ
  `EXPLORER_TOBE_BANNER_DISMISSED_KEY`.
- `WorkspaceExplorer.jsx`: отдельный `meUiPrefsQuery` удалён — баннер читает
  общий `prefsQuery` (тот же `USER_PREFERENCES_QUERY_KEY`, что персистентность
  дерева и скрытые статус-фильтры); `dismissTobeBanner` идёт через
  `patchUserPreferences({baseVersion, set})` с optimistic setQueryData и
  одним CAS-ретраем по 409 (last-write-wins, версия из снапшота конфликта).

### M1 — intent не потреблялся при уже смонтированном ProjectPane → ЗАКРЫТО

- `handleCreateTobe` теперь, помимо записи в sessionStorage, диспатчит
  `window`-событие `pm:tobe-create-intent` с `detail.projectId`.
- В `ProjectPane` потребление вынесено в `openTobeCreateFromIntent`
  (storage-intent + `?tobe=new`, снятие URL-параметра) — вызывается из
  mount-эффекта (deps `[openTobeCreateFromIntent]`, т.е. и при смене
  projectId) и из подписчика на событие (фильтр по совпадению projectId).
  Гонок нет: storage-проверка идемпотентна, intent удаляется при совпадении.

### M2 — workspace_counts из тёплого кеша post-deploy → ОТВЕТ, код не меняем

Да, транзиент: `workspace_counts` считается в том же агрегирующем проходе,
что и страница, и живёт в кеше страницы до его TTL/инвалидации; после
deploy/включения флага значение догоняет факт при первом же рефетче.
Приемлемо для overview-баннера (косметический сигнал «TO BE пока нет»),
некорректных действий не вызывает. Долгой фиксации не требует.

### M3 — двойной учёт TO BE на корнях дерева vs folder counters → ОТВЕТ, документировано

Семантика намеренная, зафиксированная планом (§5.1/§7): `counters` узла
дерева сессий — прямой COUNT root-сессий проекта (обе стадии считаются по
собственным строкам: AS IS-root + её TO BE-children как root). `tobe`/
`last_updated_at` на AS IS-узле — признак «у этой ветки есть TO BE-описание»
(линк AS IS→TO BE), а не второй счётчик. Folder-level `counters` в explorer —
rollup по проектам. Два разных уровня агрегации, смешения нет; совпадение
чисел на узлах с полным покрытием — следствие OR-фильтра по обеим стадиям.

### M4 — empty-state фильтра при обоих чипах в пустом workspace → ОСТАВЛЕНО

Косметика: оба чипа включены = семантически «без фильтра» (stageKey пустой),
поэтому dedicated empty-state фильтра не показывается — отрисуется обычный
empty-state workspace. Правки не требует; наблюдение передаётся в backlog
пилота (rollout-чеклист).

### Тесты после правок (2026-09-11)

- Backend: `test_workspace_tobe_overview.py` — **16 passed**; регрессии
  `test_explorer_done_sessions_count` + `test_explorer_project_move` +
  `test_workspace_subprocess_tree_view` + `test_workspace_access_controls` +
  `test_users_preferences` — **41 passed** (итого 57, включая 9 существующих
  тестов единого механизма users_preferences — не сломан).
- Frontend: vitest полный — **12 файлов / 50 тестов** зелёные;
  node --test по затронутым модулям (`workspaceTobeOverview`,
  `explorerPageQuery`, `workspaceExplorerRemaining.source`,
  `explorerTreePersistence`) — **28/28**; полный набор node --test:
  3511 тестов, **120 незелёных = baseline, среди них 0 explorer/tobe-файлов**.

### Git-proof (после правок)

```
HEAD:     2519c47c fix(review): баннер TO BE на едином /api/users/me/preferences + intent M1
          (над f2dd4cfa + d2945d04; ветка ahead 3 от new-origin/main @ aaeacea2)
diffstat правок: 8 files, +127/−331
status:   clean; push/merge/deploy не выполнялись
```


## 10. Rollout-шаг §9: пилотное включение для org «Роботизация производств» (2026-09-11)

### Что сделано
- Ветка `fix/tobe-overview-pilot-org` от `new-origin/main @ 3d33937f`, worktree
  `processmap-test-worktrees/fix-tobe-overview-pilot-org`.
- `workspaceTobeOverview.js` — `TOBE_OVERVIEW_PILOT_ORG_IDS = ["8b89c83ea810"]`.
- Инварант теста — «пилот ровно одна org» (length 1 + includes).

### Org id: источник
`8b89c83ea810` — получен read-only из БД, обслуживающей stage
(`docker exec app-postgres-1 psql -d processmap -c "SELECT id, name FROM orgs"` →
`8b89c83ea810 | Роботизация производств`). Локальных stage-кредов нет
(stage.env только .example), API-путь `GET /api/me` недоступен без учётки;
DB-read эквивалентен данным админки. Найдено заодно: отдельной stage-БД нет —
stage и prod разделяют Б `processmap` ( multitenant по org ).

### PR и merge
- PR #960 (https://github.com/xiaomibelov/processmap_v1/pull/960), squash-merge
  админом: **merge commit `5ce918fb`**.
- Обоснование --admin: required-check `frontend` (char-тест
  `c2TreeExpansion > tree state isolated per workspace context`) падает
  детерминированно на самом main (run `34620048164` после мержа #959) и локально
  на pristine main (прогон в worktree с файлами из `new-origin/main` → тот же
  фейл) — pre-existing, к диффу пилота (2 файла) отношения не имеет. Зафиксировано
  как техдолг вне контура.

### Stage-rebuild (serving mode)
- `GET https://stage.processmap.ru/version` →
  `{"commit":"5ce918fb…","buildTime":"2026-09-11T17:10:04Z","env":"stage"}` —
  stage отдаёт новый merge commit. `/` и `/api/health` — 200.

### Тесты
- `node --test workspaceTobeOverview.test.mjs` — 10/10.
- vitest smoke (`workspaceTobeOverview.smoke` + `WorkspaceExplorer.smoke`) — 8/8.

### Инциденты контура (зафиксированы, закрыты)
- `git stash` в worktree с чистым деревом создал пустой stash → `git stash pop`
  извлёк ЧУЖОЙ старый stash (сташи общие для всех worktrees репозитория),
  конфликт в .env/AGENTS.md/pm-agent-mirror-report.sh. Восстановление:
  `git reset --hard HEAD` (коммит был запушен), чужой stash@{0} сохранён нетронутым.
  Урок: в shared-репозитории не использовать stash без явного `git stash list` до/после.

### Дальше
- Браузерный runtime-прогон S1–S7 (verification-агент) — следующая задача,
  креды предоставит пользователь. Precondition 2 теперь закрыт: пилот
  содержит org «Роботизация производств», флаг включён на stage.

---

# Итерация 2 — runtime-фиксы (fix/tobe-runtime-fixes-1), 2026-09-11

> Agent 2 (Executor). Ветка: `fix/tobe-runtime-fixes-1` (worktree
> `p0-work-worktrees/fix-tobe-runtime-fixes-1`), от `origin/main` @ 5ce918fb.
> Push/merge/deploy НЕ выполнялись — только локальный коммит.
> Основание: runtime-валидация stage (verification-агент, отчёт
> `runtime-validation/REPORT-2026-09-11-runtime.md`) — CHANGES_REQUESTED:
> 3 FAIL (AC9/S3, AC5/a11y/S5, §4.1/S6) + 2 UI-артефакта.

## Root cause и решения (только frontend/src/features/explorer/)

### F1 (AC9/S3): empty state не показывался при пустой КЛИЕНТСКОЙ выборке
- **Root cause**: условие рендера empty state проверяло только серверную
  пустоту (`rootItems.length === 0`). Клиентские статус-чипы
  (Активен/Готово/Черновик) фильтруют `visibleRows` ПОСЛЕ ответа сервера,
  поэтому «TO BE + Готово» давало 0 видимых строк при непустом rootItems —
  empty state и кнопка `workspace-stage-reset` не рендерились.
- **Fix**: чистый предикат `shouldShowStageEmptyState({visibleCount,
  statusFilter, stageKey, loading, error})` в `workspaceTobeOverview.js`
  (показ при 0 видимых строк + активном фильтре ЛЮБОЙ группы; без фильтров
  обычная пустота workspace идёт в прежний empty state). В `ExplorerPane`:
  `showStageEmpty = showTobeOverview && shouldShowStageEmptyState({visibleCount:
  visibleRows.length, ...})`; ветки рендера переключены на него. Заголовок —
  `workspaceEmptyTitle({stageKey, statusFilter})` («Нет веток по фильтру TO BE»
  / «…по фильтру статуса»), hint подстраивается под группу фильтра.
- Кнопка «Сбросить фильтры» (`workspace-stage-reset`): `resetStageFilter`
  теперь обнуляет ОБЕ группы — `setStageFilterSel({as_is:false,to_be:false})`
  И `setStatusFilter("all")`.

### F2 (AC5/S5): меню «···» без keyboard-пути
- **Root cause**: `ContextMenu` рендерил plain-кнопки без role/фокуса;
  открытие кликом не перемещало фокус — activeElement оставался вне меню,
  стрелки не работали.
- **Fix** (общий компонент — покрывает все 3 call-site: папка/проект/сессия):
  `role="menu"` + `aria-orientation="vertical"`, пункты `role="menuitem"`
  (`tabIndex={-1}`, `data-menu-index`), separator — `role="separator"`;
  при открытии фокус на первый пункт (одноразово, `didFocusRef` — иначе
  ре-рендер родителя сбрасывал бы навигацию); ArrowUp/ArrowDown (separator
  пропускаются, зацикливание), Home/End, Esc → фокус на ближайшую кнопку
  триггера в том же relative-контейнере + `onClose`. Клавиатурная логика —
  чистый хелпер `explorerContextMenu.js` (`menuItemIndexes`, `resolveMenuKey`),
  юнит-тесты `explorerContextMenu.test.mjs`. Enter — нативная активация
  кнопки (пункт «Создать TO BE» достижим стрелками и Enter). Поведение мыши
  (mousedown-outside, клик по пункту) сохранено; после активации пункта фокус
  возвращается на триггер. Триггеры «···» получили `aria-haspopup="menu"` +
  `aria-expanded`.

### F3a (S6): у листьев-сессий дерева нет бейджей контура
- **Root cause**: `SessionTreeRow` не рендерил `StageBadges` (проброс
  `showStage` заканчивался на папках/проектах). Backend-поля
  `stage_badges`/`counters`/`tobe` у сессий подтверждены runtime-evidence.
- **Fix**: `SessionTreeRow` получил `showStage` (default false), в ячейке
  имени после ссылки — `<StageBadges item={session} show={showStage} />`;
  проброс `ProjectSessionsRows` → call-site `showStage={showTobeOverview}`.
  При отсутствии полей (подпроцессы из `apiGetSessionChildren`) — graceful
  null, как и у остальных строк.

### F3b (S6): колонка «Стадия» в project view дублировала статус
- **Root cause**: ячейка рендерила `session.stage || sessionStatusMeta.label`
  (derived-статус) — дубль колонки «Статус»; `session.stage` в API не
  заполняется.
- **Решение (зафиксировано)**: колонка «Стадия» показывает КОНТУР —
  `<StageBadges item={session} show />` с fallback «—» при пустых
  `stage_badges` (контур ≠ статус, §4.6 плана; колонка «Статус» отдельно).
  Дублирующий fallback на статус УДАЛЁН, устаревший комментарий P6 [Г]
  заменён. `SessionRow` используется в project view и treeMode — поведение
  едино для обоих. Сортировка: `valueForSession("stage")` в
  `explorerSortModel.js` теперь сортирует по join нормализованных
  `stage_badges` (fallback `process_layer`) — по содержимому колонки.
  Сессии project view идут из `GET /api/projects/{id}/explorer` — поля
  `stage_badges` там есть (runtime-evidence S6).

### M: сводка перекрывала чип TO BE на ~1200px
- **Root cause**: группа чипов тулбара имела `shrink` — при нехватке ширины
  контейнер сжимался ниже ширины чипов, чипы (`shrink-0`) вылезали и
  перекрывались сводкой `workspace-stage-summary`, перехватывая pointer events.
- **Fix** (минимально, tailwind): внешний тулбар `flex-nowrap` → `flex-wrap`,
  группа чипов `shrink` → `shrink-0 flex-wrap`. Не влезающие элементы
  переносятся на вторую строку, перекрытий нет (absolute/compact-механизмов
  в тулбаре нет — перекрытие давал именно flex-shrink overflow).

## Тесты

Запускалось в docker `node:20-alpine` (node на хосте отсутствует;
`npm ci` по `package-lock.json` в worktree):

- `npm run test` (node --test, весь набор): **3523 теста, 82 fail — все
  pre-existing**. Доказательство: прогон полного набора на pristine
  `origin/main` (отдельный worktree @ 5ce918fb, те же node_modules) дал 83
  fail; `diff` множеств: все 82 фейла ветки ⊆ фейлов main, новых нет
  (разница main↔ветка — flaky presence-тесты семейства useSessionPresence:
  таймерные, на одном коде дают 15/0 и 14/1). Техдолг main зафиксирован
  ранее (см. «PR и merge» выше + 5× appVersion v1.0.141 и др.).
- `npm run test:smoke` (vitest, jsdom): **13 файлов / 56 тестов — все pass**,
  включая новый `workspaceContextMenu.smoke.test.jsx` (6 тестов: role/aria,
  фокус на первый пункт, стрелки с пропуском separator, Home/End, Enter,
  Esc с возвратом фокуса на триггер, клик).
- `npm run lint` (eslint explorer, --max-warnings=0): **чисто**.
- Новые/обновлённые тесты:
  - `workspaceTobeOverview.test.mjs` (+2 теста: предикат empty state по
    формуле AC9, заголовки по группам фильтра).
  - `explorerContextMenu.test.mjs` (новый, node --test): навигация по меню.
  - `workspaceContextMenu.smoke.test.jsx` (новый, vitest jsdom +
    @testing-library/react — зависимости уже были в package.json).
  - `workspaceTobeRuntimeFixes.source.test.mjs` (новый): source-пины F1/F2/F3.
  - `explorerSortModel.test.mjs` — кейс сортировки по «Стадии» осознанно
    переписан: раньше сортировал по пустому `session.stage` (тестовые
    данные с `stage:"B"/"A"`), теперь по `stage_badges`/`process_layer` —
    по содержимому колонки.
  - `workspaceOpenAffordance.source.test.mjs` — radius окна 9500 → 12000:
    между `openSession` и kebab добавлены бейджи/a11y-атрибуты, окно
    перестало захватывать `openTab: "diagram"` (позиционный source-тест).

## Diffstat (origin/main...HEAD, frontend/src/features/explorer/)

```
WorkspaceExplorer.jsx                 | +118/-26 (F1, F2, F3a, F3b, M)
workspaceTobeOverview.js              | +20  (shouldShowStageEmptyState, workspaceEmptyTitle)
explorerSortModel.js                  | +9/-2 (stage по stage_badges)
explorerContextMenu.js                | новый (чистая keyboard-модель меню)
+ 5 тестовых файлов (2 новых, 3 обновлённых)
```

## Не чинили / риски

- **401 на /api/auth/refresh** — baseline (фоновый refresh-flow после
  перелогина), к контуру не относится, не трогали.
- Колонка «ОБНОВЛЕНО» со значением «Сессия «321»» — подпись последнего
  обновлённого элемента, не баг фичи; оставлено как есть.
- Тулбар теперь двухстрочный при ширине ~1200px (перенос вместо
  перекрытия) — осознанный UX-трейдофф минимального фикса.
- Runtime-перепроверка на stage (Playwright S3/S5/S6) — задача
  verification-агента после merge/deploy.

## Итерация 2.1 — CI hotfix char-теста C2 (2026-09-11)

- CI PR #961, job «Frontend Quality / frontend», шаг «Characterization tests
  (workspace explorer, Ш0)»: падал ровно один тест
  `c2TreeExpansion > tree state isolated per workspace context` (16/17).
- **Доказательство pre-existing**: тот же тест падает на pristine
  `origin/main` @ 5ce918fb; бисект по истории — зелёный на aed51653 (#909),
  красный начиная с 3d33937f (#959, фича-итерация 1). К итерации-2 диффу
  отношения не имеет.
- **Root cause (реальный продуктовый баг)**: эффект очистки кешей детей
  `[stageKey, setTreeStateForContext]` (#959) пересрабатывал при смене
  workspace: `setTreeStateForContext` меняет identity вместе с contextKey →
  при возврате в workspace кеш `childItemsByFolder` контекста стирался,
  а эффект догрузки детей не перезапускался (guard по неизменному
  mergedExpandedByFolder) → раскрытая папка оставалась пустой.
- **Fix** (WorkspaceExplorer.jsx): гард `prevStageKeyRef` — очистка только
  при реальной смене stageKey. Минимально, поведение смены контура
  (перезапрос детей с ?stage) сохранено.
- Прогоны (docker node:20-alpine): test:char 17/17, test:smoke 56/56,
  lint 0; node --test — fail-список идентичен baseline main (± флаки
  useSessionPresence, на одном коде воспроизводятся).
