# REWORK_PLAN — План доработки контура с runtime-proof верификацией

**Контур:** `uiux/product-actions-registry-inner-page-safe-redesign-v1`  
**Run ID:** `20260517T112506Z-72991`  
**Статус:** `REWORK_OPENED` → `SOURCE_TEST_PASS_RUNTIME_VISUAL_REVIEW_REQUIRED`  
**Дата:** `2026-05-17`  
**Planner:** Agent 1

---

## 1. Контекст

Предыдущий цикл (run `20260517T101528Z-68933`) завершился `REVIEW_PASS`, но **runtime на `clearvestnic.ru:5180` отдавал `v1.0.134`**, в то время как редизайн реестра находится в `v1.0.135` рабочей директории. Визуальное подтверждение нового UI **не получено**.

Этот план описывает **rework workflow**: сборку, деплой, визуальную верификацию и финальное ревью.

---

## 2. Цель rework

Обеспечить:
1. **Сборку** фронтенда с текущим кодом `v1.0.135`.
2. **Деплой** на `clearvestnic.ru:5180` так, чтобы runtime отдавал текущую версию.
3. **Визуальную верификацию** страницы «Реестр действий» в браузере.
4. **Branch hygiene analysis** — понять, безопасно ли мержить ветку с учётом pre-existing Analytics Hub изменений.
5. **Финальное ревью** (Agent 4) **только после** получения runtime visual proof.

---

## 3. Разделение работы (4-agent workflow)

### Agent 1 / Planner (этот документ)
- Создать все rework-артефакты.
- Убедиться, что Worker 2 и Worker 3 независимы.
- Убедиться, что Reviewer ждёт обоих DONE.

### Agent 2 / Worker — Runtime delivery and visual proof preparation
**Старт:** немедленно, независимо.  
**Фокус:** build, deploy, runtime verification, visual evidence capture.

**Обязанности:**
- Собрать фронтенд (`npm run build` или аналог).
- Убедиться, что `clearvestnic.ru:5180` отдаёт актуальные ассеты.
- Проверить версию в footer: должна быть `v1.0.135` (или текущая каноническая).
- Проверить `build-info.json`.
- Убедиться, что старые `v1.0.134` ассеты не кешируются.
- Открыть Analytics Hub (`?surface=analytics`) → «Реестр действий».
- Сделать runtime evidence capture:
  - Заголовок / описание.
  - Ряд метрик.
  - Фильтры.
  - AI-кнопка.
  - CSV / XLSX.
  - Warning-баннер.
  - Таблица.
  - Пагинация.
  - Поведение close/back.
- Проверить console errors.
- Проверить отсутствие PUT/PATCH/BPMN mutation при навигации.
- Написать отчёты: `WORKER_2_REWORK_REPORT.md`, `RUNTIME_VERSION_PROOF.md`, `RUNTIME_VISUAL_EVIDENCE.md`, `RUNTIME_CONSOLE_NETWORK_CHECK.md`.
- Создать маркер `WORKER_2_DONE`.

**Блокировка:** если не удаётся задеплоить или 5180 не отдаёт новую версию — создать `EXEC_PART_1_BLOCKED.md`, НЕ создавать `WORKER_2_DONE`.

### Agent 3 / Worker — Branch hygiene and scope verification
**Старт:** немедленно, независимо. **Не ждёт Worker 2.**  
**Фокус:** branch hygiene, scope classification, merge safety.

**Обязанности:**
- Проинспектировать рабочую директорию и changed files.
- Разделить файлы на:
  1. Analytics Hub v1.0.134 pre-existing изменения.
  2. Registry redesign v1.0.135 изменения.
  3. Несвязанные / небезопасные изменения (если есть).
- Проверить, что контур scope чистый:
  - `AppShell.jsx`
  - `TopBar.jsx`
  - `ProcessStage.jsx`
  - `WorkspaceExplorer.jsx`
  - `processMapRouteModel.js`
  - Product Actions Registry components
  - `appVersion.js`
- Документировать: безопасно ли мержить ветку как комбинацию Analytics Hub + Registry redesign, или требуется разделение.
- Проверить отсутствие backend/schema/BPMN/RAG/package изменений (если есть — документировать и обосновать).
- Проверить тесты Analytics Hub и Registry (если возможно).
- Написать отчёты: `WORKER_3_REWORK_REPORT.md`, `BRANCH_HYGIENE_REPORT.md`, `SCOPE_CLASSIFICATION_REPORT.md`, `MERGE_SCOPE_RISK_REPORT.md`.
- Создать маркер `WORKER_3_DONE`.

**Блокировка:** если branch hygiene неясна или есть неразрешённые out-of-scope изменения — создать `EXEC_PART_2_BLOCKED.md`, НЕ создавать `WORKER_3_DONE`.

### Agent 4 / Reviewer — Final runtime visual review
**Старт:** только после появления **обоих** маркеров:
- `WORKER_2_DONE`
- `WORKER_3_DONE`

**Обязанности:**
- Запустить GSD reviewer discipline.
- Запустить RAG reviewer preflight.
- Проверить, что `5180` действительно отдаёт `v1.0.135` / текущую версию.
- Проверить `build-info.json` и footer.
- Визуально осмотреть страницу «Реестр действий» в браузере.
- Проверить, что текущий ProcessMap shell/header/global layout **не был** редизайнен.
- Проверить, что визуально изменилась **только** внутренняя страница реестра.
- Проверить, что Analytics Hub работает.
- Проверить, что «Реестр действий» вложен под Analytics.
- Проверить визуально: фильтры, таблицу, действия, warning, пагинацию.
- Проверить close/back behavior.
- Проверить отсутствие console errors от реестра.
- Проверить отсутствие backend/schema/BPMN/RAG out-of-scope изменений.
- Просмотреть branch hygiene report.
- Выдать `REVIEW_PASS` **только если** runtime visual proof проходит на `5180`.

**Запрет на REVIEW_PASS если:**
- `5180` всё ещё отдаёт `v1.0.134`.
- `build-info.json` / footer не совпадают с исходным кодом.
- Редизайненная страница не видна в браузере.
- Ревью ограничилось только source/tests.
- Branch hygiene неясна.
- Включены unrelated файлы без классификации.
- Shell/header/global layout был редизайнен.
- Есть backend/schema/BPMN/RAG изменения out of scope.

---

## 4. Критические гейты

| # | Гейт | Ответственный | Критерий |
|---|------|---------------|----------|
| 1 | Build success | Agent 2 | `npm run build` (или аналог) завершается без ошибок |
| 2 | Runtime version | Agent 2 | `curl http://clearvestnic.ru:5180/build-info.json` или footer показывают `v1.0.135` |
| 3 | Asset freshness | Agent 2 | JS/CSS имена ассетов совпадают с текущим `dist/` |
| 4 | No stale cache | Agent 2 | `v1.0.134` ассеты не сервируются |
| 5 | Visual evidence | Agent 2 | Снимки/описания заголовка, метрик, фильтров, таблицы, пагинации, close/back |
| 6 | Console clean | Agent 2 | Нет ошибок консоли от реестра |
| 7 | No mutations | Agent 2 | Нет PUT/PATCH/BPMN mutation при навигации/просмотре |
| 8 | Scope classification | Agent 3 | Все changed files классифицированы (Analytics Hub / Registry / unrelated) |
| 9 | Merge safety | Agent 3 | Документирован риск merge как combined scope |
| 10 | Tests pass | Agent 3 | Тесты Analytics Hub и Registry проходят |
| 11 | Runtime visual review | Agent 4 | Страница визуально проверена в браузере на `5180` |
| 12 | Shell preservation | Agent 4 | Header/sidebar/global layout не изменены |
| 13 | Final REVIEW_PASS | Agent 4 | Только после прохождения гейтов 1–12 |

---

## 5. Артефакты rework

### Создаётся Agent 1 (этот run)
- `REWORK_PLAN.md` — этот документ
- `REWORK_REASON.md` — причина переоткрытия
- `WORKER_2_REWORK_PROMPT.md` / `EXECUTOR_PART_1_PROMPT.md` — инструкция Agent 2
- `WORKER_3_REWORK_PROMPT.md` / `EXECUTOR_PART_2_PROMPT.md` — инструкция Agent 3
- `REVIEWER_REWORK_PROMPT.md` — инструкция Agent 4
- `RUNTIME_VISUAL_REVIEW_CHECKLIST.md` — чеклист визуального ревью
- `BRANCH_HYGIENE_CHECKLIST.md` — чеклист чистоты ветки
- `REWORK_STATE.json` — машиночитаемое состояние
- `CHANGES_REQUESTED` — маркер принудительной доработки
- `AGENT_RUN_ID` — ID текущего run

### Создаётся Agent 2
- `WORKER_2_REWORK_REPORT.md`
- `RUNTIME_VERSION_PROOF.md`
- `RUNTIME_VISUAL_EVIDENCE.md`
- `RUNTIME_CONSOLE_NETWORK_CHECK.md`
- `WORKER_2_DONE` (или `EXEC_PART_1_BLOCKED.md`)

### Создаётся Agent 3
- `WORKER_3_REWORK_REPORT.md`
- `BRANCH_HYGIENE_REPORT.md`
- `SCOPE_CLASSIFICATION_REPORT.md`
- `MERGE_SCOPE_RISK_REPORT.md`
- `WORKER_3_DONE` (или `EXEC_PART_2_BLOCKED.md`)

### Создаётся Agent 4
- `REVIEW_REPORT.md` (или `REWORK_REQUEST.md`)
- `REVIEW_PASS` (только если все гейты пройдены)

---

## 6. GSD / RAG статус

- **GSD:** доступен через `/opt/processmap-test/bin/gsd`.
- **RAG preflight:** выполнен для роли `planner`. Результат сохранён.
- **Runtime facts:** `5180` — целевая среда для visual proof.
- **Source truth:** зафиксирована в `REWORK_STATE.json`.

---

*Agent 1 / Planner*  
*Rework планирование завершено: 2026-05-17*
