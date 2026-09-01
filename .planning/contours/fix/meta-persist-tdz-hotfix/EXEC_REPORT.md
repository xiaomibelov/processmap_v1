# FIX: meta-persist-tdz-hotfix — EXEC_REPORT

**Contour:** `fix/meta-persist-tdz-hotfix`  
**Type:** fix (minimal patch, no logic change)  
**Branch:** `fix/meta-persist-tdz-hotfix`  
**Remote:** `git@github.com:xiaomibelov/processmap_v1.git`  
**Base:** `origin/main @ 1f91b1c684afc19114233c3a0e71d214a7938831`  
**HEAD:** `fix/meta-persist-tdz-hotfix @ a89b9d261a654ffe9b676662c03f35c54fe129f6`  
**Workspace:** `/Users/mac/agents_place/kimi_PM/p0-work-worktrees/fix-meta-persist-tdz-hotfix`  
**Prod commit (untouched):** `8f904834` — verified via `/version`, not in scope.

---

## 1. Симптом и первопричина

**Симптом:** после merge `fix/save-revision-hygiene` страница процесса падает:

```
ReferenceError: Cannot access 'M' before initialization
(index-*.js, рендер ProcessStage)
```

**Первопричина (доказана):**

- `frontend/src/features/process/stage/controllers/useSessionMetaPersist.js`
- `onSessionSyncWithPersistedRefs` (строка ~97) имел deps `[onSessionSync, syncPersistedRefs]`.
- `syncPersistedRefs` объявлен ПОЗЖЕ (строка ~124).
- Deps-массив вычисляется при рендере → TDZ `ReferenceError`.

**Bundle-доказательство (stage):** в минимизированном `index-*.js` переменная `j` (syncPersistedRefs) ссылалась в deps-массиве callback'а `C` (onSessionSyncWithPersistedRefs) до своего объявления.

**Почему проскочило:** контур save-revision-hygiene гонял только unit-suites классификатора и backend; полный frontend render-suite не выполнялся, т.к. в окружении не было jsdom. CI не рендерит ProcessStage.

---

## 2. Минимальный патч

### 2.A Перестановка объявлений

Файл: `frontend/src/features/process/stage/controllers/useSessionMetaPersist.js`

- Объявление `syncPersistedRefs` перенесено ВЫШЕ `onSessionSyncWithPersistedRefs`.
- Логика не изменена — только порядок `const` в теле хука.

```diff
+  const syncPersistedRefs = useCallback((metaRaw) => { ... }, [...]);
+
   const onSessionSyncWithPersistedRefs = useCallback((envelope) => {
     ...
   }, [onSessionSync, syncPersistedRefs]);
```

### 2.B Аудит всех изменённых файлов save-revision-hygiene на тот же паттерн

Проверенные frontend-файлы из PR `fix/save-revision-hygiene`:

| Файл | Результат | Примечание |
|---|---|---|
| `frontend/src/components/ProcessStage.jsx` | 4 срабатывания `no-use-before-define` | Все 4 — ссылки в теле callback/функции, а не в deps-массиве; поэтому **не TDZ**. Приведены ниже. |
| `frontend/src/features/process/navigation/saveUploadStatus.js` | чисто | — |
| `frontend/src/features/process/stage/controllers/useSessionMetaPersist.js` | **исправлено** | TDZ в deps-массиве. |
| `frontend/src/features/process/stage/ui/saveConflictModalModel.js` | чисто | — |
| `frontend/src/lib/api.js` | чисто | — |
| `frontend/src/lib/clientId.js` | чисто | — |

Детали по 4 срабатываниям в `ProcessStage.jsx` (не являются TDZ):

1. `persistSavedSessionCompanion` (строка ~2839) — вызов внутри `runManualSaveAction`; callback создаётся при рендере, выполняется позже, когда `persistSavedSessionCompanion` уже инициализирован.
2. `selectedElementId` (строки ~2897-2898) — использование в теле `runManualSaveAction`, а не в deps-массиве.
3. `buildExecutionPlanNow` (строка ~6825) — использование внутри `useEffect` callback; эффект выполняется после инициализации.

**Метод проверки:**

```bash
docker run --rm -v "$PWD/frontend:/frontend" -w /frontend node:20-alpine \
  sh -c 'npm install --no-save eslint@8 --silent && \
  npx eslint --no-eslintrc --ext .js,.jsx \
    --parser-options ecmaVersion:2022,sourceType:module,ecmaFeatures:{jsx:true} \
    --rule '"'"'no-use-before-define: ["error", {"variables": true, "functions": false, "classes": false}]'"'"' \
    --rule 'no-unused-vars: off' \
    src/components/ProcessStage.jsx \
    src/features/process/navigation/saveUploadStatus.js \
    src/features/process/stage/controllers/useSessionMetaPersist.js \
    src/features/process/stage/ui/saveConflictModalModel.js \
    src/lib/api.js \
    src/lib/clientId.js'
```

После фикса `useSessionMetaPersist.js` не имеет ошибок; остальные 4 — телесные ссылки, не deps-TDZ.

---

## 3. Регрессионный тест (RED → GREEN)

Файл: `frontend/src/features/process/stage/controllers/useSessionMetaPersist.smoke.test.jsx`

- Рендерит тестовый компонент, который вызывает `useSessionMetaPersist` с минимальными моками.
- Ловит `ReferenceError: Cannot access 'syncPersistedRefs' before initialization` до фикса.
- Зелёный после фикса.

### RED (revert фикса)

```
FAIL  .../useSessionMetaPersist.smoke.test.jsx
ReferenceError: Cannot access 'syncPersistedRefs' before initialization
 ❯ Module.useSessionMetaPersist .../useSessionMetaPersist.js:109:22
    107|     }
    108|     onSessionSync?.(envelope);
    109|   }, [onSessionSync, syncPersistedRefs]);
```

### GREEN (фикс на месте)

```
Test Files  1 passed (1)
Tests  1 passed (1)
```

---

## 4. Прогоны

### 4.1 Целевые suites save-revision-hygiene (5 файлов)

```bash
docker run --rm -v "$PWD/frontend:/frontend" -w /frontend node:20-alpine \
  sh -c 'node --test \
    src/features/process/stage/ui/saveConflictModalModel.test.mjs \
    src/features/session/__tests__/conflictModel.test.mjs \
    src/features/process/lib/conflictChangedFieldsHumanization.test.mjs \
    src/lib/casVersionTracker.test.mjs \
    src/features/process/navigation/saveUploadStatus.test.mjs'
```

**Результат:** `41 passed, 0 failed`.

### 4.2 Полный frontend suite (`node --test`)

```bash
docker run --rm -v "$PWD/frontend:/frontend" -w /frontend node:20-alpine \
  sh -c 'node --test $(find src -name "*.test.mjs")'
```

**Результат:**

```
# tests 3219
# pass 3132
# fail 82
# cancelled 0
# skipped 5
```

**Контроль против baseline `origin/main` (без наших изменений):** те же цифры — `3219 / 3132 / 82 / 5`. Наши изменения не добавили и не убрали ни одного падения. 82 failures — pre-existing (snapshot/unit-тесты AppShell, NotesPanel, TopBar и др.), к контуру не относятся.

### 4.3 Vitest smoke suite (jsdom)

```bash
docker run --rm -v "$PWD/frontend:/frontend" -w /frontend node:20-alpine \
  npx vitest run
```

**Результат:** `9 passed, 29 tests` — включает новый smoke-тест useSessionMetaPersist.

---

## 5. Сборка фронта и bundle-проверка

```bash
docker run --rm -m 8g -e NODE_OPTIONS=--max-old-space-size=7168 \
  -v "$PWD/frontend:/frontend" -w /frontend node:20-alpine \
  npx vite build
```

**Результат:** `dist/assets/index-CGRMdkOV.js` (5.3 MB) собран.

**Проверка порядка объявлений** в собранном бандле (фрагмент около `put_bpmn`):

```
... j=b.useCallback($=>{const T=S($);l.current=f(T.hybrid_layer_by_element_id),u.current=h(T.hybrid_v2),d.current=m(T.drawio)},[d,l,u,S,m,f,h]),C=b.useCallback($=>{const T=String(($==null?void 0:$._sync_source)||"");(T.includes("put_bpmn")||T.includes("bpmn_save")||T.includes("save_conflict_refresh")||T.includes("session_patch")||T.includes("meta_patch"))&&j(($==null?void 0:$.bpmn_meta)||{}),i==null||i($)},[i,j]) ...
```

- `j` = `syncPersistedRefs` объявлен первым.
- `C` = `onSessionSyncWithPersistedRefs` объявлен вторым.
- Deps-массив `[i,j]` для `C` ссылается на `j`, который уже инициализирован.
- TDZ в production-бандле устранён.

---

## 6. Линт: почему `no-use-before-define` не сработал раньше

- В `frontend/` **отсутствует конфигурация ESLint** и eslint не указан в `devDependencies`.
- `no-use-before-define` не был выключен — его просто не было в CI.
- Для hotfix включение ESLint в проект выходит за минимальный объём.
- **Follow-up:** добавить `eslint` + правило `no-use-before-define` (variables) в frontend CI; пока regress-защита — новый smoke-тест и полный jsdom-suite.

---

## 7. Git-proof

```bash
$ git status -sb
## fix/meta-persist-tdz-hotfix
 M frontend/src/features/process/stage/controllers/useSessionMetaPersist.js
?? frontend/src/features/process/stage/controllers/useSessionMetaPersist.smoke.test.jsx

$ git diff --stat
 .../stage/controllers/useSessionMetaPersist.js     | 30 +++++++++++-----------
 1 file changed, 15 insertions(+), 15 deletions(-)
```

**Branch создана от:** `origin/main @ 1f91b1c684afc19114233c3a0e71d214a7938831`.

---

## 8. PR (русский)

**Title:** `fix(meta-persist): TDZ syncPersistedRefs — перестановка объявлений + render-тест`

**Body:**

```
Фикс критического регресса на stage после merge `fix/save-revision-hygiene`.

**Первопричина**
- `useSessionMetaPersist.js`: `onSessionSyncWithPersistedRefs` имел deps
  `[onSessionSync, syncPersistedRefs]`, но `syncPersistedRefs` был объявлен
  позже (строки ~97 vs ~124). Deps-массив вычисляется при рендере → TDZ
  `ReferenceError: Cannot access 'M' before initialization`.
- Stage bundle (`index-*.js`) подтверждал: переменная использовалась в
  deps-массиве до инициализации.

**Что сделано**
- Переставлено объявление `syncPersistedRefs` ВЫШЕ
  `onSessionSyncWithPersistedRefs`. Логика не изменена.
- Проверен весь diff `fix/save-revision-hygiene` на аналогичный TDZ-паттерн
  (ProcessStage.jsx, saveUploadStatus.js, saveConflictModalModel.js, api.js,
  clientId.js) — других deps-TDZ не найдено.
- Добавлен regression smoke-test: рендерит `useSessionMetaPersist`;
  падает с TDZ до фикса, зелёный после.

**Прогоны**
- Целевые suites save-revision-hygiene: 41 passed, 0 failed.
- Полный frontend suite (`node --test`): 3219 tests, 3132 pass, 82 fail
  (те же 82 fail на чистом `origin/main`, pre-existing).
- Vitest smoke suite (jsdom): 9 files / 29 tests passed.
- `vite build`: собран; в бандле `syncPersistedRefs` объявлен ДО использования.

**Риски**
Нулевые. Изменение — только порядок объявлений `const` без смены логики.

**Следующий шаг**
После merge — stage verify: страница процесса открывается с чистой консолью,
1 клик «Сохранить» = 1 ревизия.
```

---

## 9. Handoff-proof

**Цель:** устранить TDZ-краш ProcessStage после merge save-revision-hygiene.

**Закрыто:**
- Перестановка `syncPersistedRefs` в `useSessionMetaPersist.js`.
- Regression render-тест (RED→GREEN).
- Аудит изменённых файлов на аналогичный TDZ.
- Полный frontend suite + целевые suites + bundle-проверка.

**Риски / ограничения:**
- Линт `no-use-before-define` в проекте не настроен; защита пока через тесты.
- Stage verify после merge требует отдельного approve.
- Prod не затронут.

**Следующие шаги (требуют approve пользователя):**
1. Review PR.
2. Merge в `main`.
3. Stage verify по §4.
4. Prod deploy — только явное решение владельца.
