# REVIEW_REPORT - Agent 4

Контур: `uiux/product-actions-registry-inner-page-safe-redesign-v1`  
Reviewer run id: `20260517T134517Z-85981`  
Время проверки: `2026-05-17T14:34:29Z`  
Вердикт: `CHANGES_REQUESTED`

## Source/runtime truth

- `pwd`: `/opt/processmap-test`
- `remote`: `origin` указывает на `github.com/xiaomibelov/processmap_v1.git`, но через HTTPS token URL, не canonical SSH из operating contract.
- `branch`: `fix/lockfile-sync-test`
- `HEAD`: `5b20bc2d1292f419647238eaf37dac55f9315942`
- `origin/main`: `d805e1c64c1107b9e3fe6854e031694bf741b187`
- `status`: dirty worktree, есть изменения product code и много untracked artifacts.
- `cached diff`: пустой.
- RAG reviewer preflight выполнен. Hard gates: свежий `:5180` runtime proof, exact scenario, no source-only approval.

## Runtime proof

- `curl -I http://clearvestnic.ru:5180`: HTTP 200.
- Headers: `Cache-Control: no-cache, no-store, must-revalidate`, `Pragma: no-cache`, `Expires: 0`.
- `build-info.json`: branch `fix/lockfile-sync-test`, sha `5b20bc2`, contour `uiux/product-actions-registry-inner-page-safe-redesign-v1`, dirty `true`.
- UI footer: `v1.0.136`.
- Served assets observed: `assets/index-CJv5TRjW.css`, `assets/index-CSCi7qTB.js`.

## Browser checks

Проверено в fresh Chromium context на `http://clearvestnic.ru:5180`.

1. Exact Analytics Hub path:
   - Открыт `/app?surface=analytics&cb=<ts>`.
   - Нажата карточка `Реестр действий`.
   - Runtime открыл `/app?surface=product-actions-registry&return_to=analytics&registry_scope=workspace`.
   - В этой default workspace ветке показано `0` строк, но не отрисованы table headers `Продукт / Действие / Процесс / шаг / Статус`.
   - В этой default workspace ветке не видны `AI: предложить действия` и `Выбрано для AI: N / 10`.

2. Project context path:
   - Открыт `/app?project=b1c8a56b6e&surface=analytics&cb=<ts>`.
   - Нажата карточка `Реестр действий`.
   - Runtime открыл `/app?surface=product-actions-registry&project=b1c8a56b6e&registry_scope=project&workspace=ws_org_default_main`.
   - Метрики: `СЕССИЙ 1`, `СТРОК 152`, `ПОЛНЫХ 149`, `НЕПОЛНЫХ 3`, `ПОСЛЕ ФИЛЬТРОВ 152`.
   - Фильтры расположены одной горизонтальной сеткой на y ~= 434.
   - Warning banner над таблицей: `Есть неполные строки - заполните их в исходной сессии перед финальной выгрузкой.`
   - Registry table area начинается на y ~= 542 и доминирует по высоте.
   - Pagination: `Показано 1-25 из 152`, page size `25 / 50`, переход на `50` дал `Показано 1-50 из 152`.
   - Filter `Полнота = Неполные` дал `Показано 1-3 из 3`; reset вернул `Показано 1-25 из 152`.
   - CSV/XLSX export download сработал: `product-actions-project-20260517-1433.csv`, `product-actions-project-20260517-1433.xlsx`.
   - Console errors/warnings: нет.
   - Unsafe registry-triggered durable mutations: нет `PUT/PATCH/DELETE`.

3. Responsive check:
   - `1280x800`: page-level horizontal scroll отсутствует (`scrollWidth=1280`, `innerWidth=1280`).

## Gate results

- Gate 0 Runtime/version: PASS.
- Gate 1 Shell preservation: PASS visually for TopBar/global shell in checked runtime.
- Gate 2 Analytics Hub integrity: PASS.
- Gate 3 Anti-chaos hierarchy: PASS in populated project context; PARTIAL in default workspace context because empty state removes the table structure.
- Gate 4 Filters/actions layout: FAIL. CSV/XLSX are in header and filters are horizontal, but AI controls and selection counter are not in the filters/actions area. In populated project context they are inside the secondary sources/session section around y ~= 2600, below table and pagination.
- Gate 5 Warning/table dominance: PASS in populated project context; FAIL for default exact path because there is no visible table header/table shell when rows are empty.
- Gate 6 Source/session block secondary: PASS for source section placement. However AI controls being placed inside that secondary section conflicts with Gate 4.
- Gate 7 Navigation/back: PASS. `Вернуться` returned to `surface=analytics` without a full page reload in browser behavior.
- Gate 8 Console/errors: PASS.
- Gate 9 Data safety: PASS for observed runtime. No fake metrics found; export used backend endpoints; no unsafe mutations observed.
- Gate 10 Scope safety: PARTIAL/BLOCKING RISK. Runtime branch and served sha match current checkout, but dirty workspace contains unrelated product-code changes and this checkout is not the canonical root from `AGENTS.md`.

## Findings

### HIGH - Exact Analytics -> Registry path can still fail visible acceptance gates

When opening Analytics Hub without a selected project and clicking `Реестр действий`, the page lands in workspace scope with zero rows. In that state the registry renders an empty block instead of the table shell, so the required headers `Продукт / Действие / Процесс / шаг / Статус` are absent. AI controls are also absent. This violates the runtime checklist for the exact scenario.

Evidence:
- URL after click: `/app?surface=product-actions-registry&return_to=analytics&registry_scope=workspace`.
- Visible text: `Показано 0-0 из 0`, `Источники данных`, `После фильтров: 0 строк`.
- Missing visible text: `AI: предложить действия`, `Выбрано для AI`, table headers.
- Source reference: `frontend/src/components/process/analysis/registry/ProductActionsRegistryTable.jsx:43` returns only `productActionsRegistryEmpty` when `rows.length === 0`.

Required fix:
- Preserve the registry table shell/header in the empty state, or make the empty state satisfy the table acceptance explicitly.
- Ensure the exact Analytics -> Registry path exposes the required AI controls when workspace/project scope is valid, or document and implement an intentional disabled state visible in the actions area.

### MEDIUM - AI controls are placed in the secondary sources section, not in the filters/actions area

In populated project scope, the primary page hierarchy is much improved, but `AI: предложить действия` and `Выбрано для AI: 0 / 10` are located in `productActionsRegistrySessions` below table, pagination, and source/session controls around y ~= 2600. Gate 4 expects these actions in the filters/actions area with reset/export controls.

Evidence:
- Filter grid y ~= 403-478.
- Table y ~= 542-2254.
- Pagination y ~= 2266.
- AI controls y ~= 2599.
- Source reference: `frontend/src/components/process/analysis/ProductActionsRegistryPanel.jsx:781` places AI controls inside `productActionsRegistrySessions`, after `ProductActionsRegistryPagination` at `frontend/src/components/process/analysis/ProductActionsRegistryPanel.jsx:721`.

Required fix:
- Move or duplicate the AI selection counter and `AI: предложить действия` into the primary filters/actions band, while keeping source/session details secondary.

### MEDIUM - Merge/release remains blocked by workspace hygiene

The runtime is serving `5b20bc2`, and `build-info.json` matches the current checkout. However, the worktree is dirty with unrelated modifications and untracked artifacts. The project operating contract requires clean isolation before merge/release.

Required fix:
- Before merge or release, isolate the contour branch from `origin/main` and prove unrelated changes are excluded or intentionally split.

## 5-plane proof

- Code: served runtime reports sha `5b20bc2d1292f419647238eaf37dac55f9315942`; product code contains current contour changes plus unrelated dirty changes.
- Workspace: checkout `/opt/processmap-test`, branch `fix/lockfile-sync-test`, dirty.
- DB: review performed read/query/export paths only; no observed `PUT/PATCH/DELETE`; no durable mutation executed by reviewer.
- Env/compose: reviewed external runtime `http://clearvestnic.ru:5180`; no compose/deploy changes made by reviewer.
- Serving mode: nginx-served frontend on `:5180`, no-cache headers, `build-info.json` matches current sha and contour id.

## Verdict

`REVIEW_PASS` is not allowed for this run. Create `CHANGES_REQUESTED` and `REWORK_REQUEST.md`.

