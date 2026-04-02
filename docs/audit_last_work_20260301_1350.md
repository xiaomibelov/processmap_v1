# 1. Executive summary
- Аудит выполнен по рабочему дереву ветки `feat/interview-path-highlight` на `2026-03-01 13:50`.
- Текущий `HEAD` и оба ключевых checkpoint-тега (`cp/interview_pre_path_highlight_20260227_235307`, `cp/interview_path_highlight_branch_start_20260227_235317`) указывают на один и тот же commit `9f21a6da3c52a2f954bdc26702ba3691ddeafd63`.
- Последний объём работ находится не в новых коммитах, а в незакоммиченных изменениях рабочего дерева.
- Состояние дерева: `54` modified tracked + `109` untracked.
- `git diff --stat` от checkpoint: `54 files changed, 24718 insertions(+), 3726 deletions(-)`.
- В проекте фактически добавлен крупный пласт UI/API по Reports/Paths/Diagram/Session navigation.
- Path Reports API реализован на frontend (`frontend/src/lib/api.js`) и backend (`backend/app/main.py`, `ReportVersion` в `backend/app/models.py`).
- Polling отчётов реализован через `setTimeout` + backoff + stop-on-401/403/404 + timeout-guard.
- Reports drawer содержит статусы `running/ok/error`, сворачиваемый техлог и anti-overflow стили.
- В Paths View реализованы компактные инпуты времени и popover пресетов.
- Session navigation (URL sync + open-session race guard + notices) и rename/delete project/session реализованы по фронту и бэку.
- RobotMeta и Diagram Quality/Focus добавлены в UI/рендер-пайплайн; runtime-проверка UI не выполнялась в этом аудите.
- Запущены целевые Node-тесты: `36/36` passed; backend pytest не запущен (в окружении нет `pytest`).
- Найдены подтверждённые риски: placeholder endpoint-string, скрытые TODO-флаги, много dev-логирования, fallback/stub-пути в данных.

# 2. Что изменено (по фактам)
## 2.1 Git состояние

Текущая ветка/HEAD:
```bash
branch: feat/interview-path-highlight
head:   9f21a6da3c52a2f954bdc26702ba3691ddeafd63
```

Проверка checkpoint refs:
```bash
pre=9f21a6da3c52a2f954bdc26702ba3691ddeafd63
branch_start=9f21a6da3c52a2f954bdc26702ba3691ddeafd63
head=9f21a6da3c52a2f954bdc26702ba3691ddeafd63
```

`git status -sb` (факт):
- tracked modified: `54`
- untracked: `109`

Последние 30 коммитов (`git log --oneline -n 30`):
```text
9f21a6d Interview: deterministic BPMN order with graph traversal fallback
c072dda fix(interview-paths): report 404 diagnostics and remove nullish None suffixes
af34f99 chore: remove tracked generated artifacts
04e2f55 test/docs: e2e suite + tooling + DoD
66cb08d feat: process workbench core (bpmn/interview/ai/notes/runtime)
4bd7c17 fix: start interview action, restore sidebar toggle, keep bpmn canvas on tab switch
6d2039a fix(ui): dark inputs in actors-first stage
3cd4ae6 fix(frontend): use fetch in api client (no axios)
14193fd fix(frontend): Process title color + BPMN contrast + AI badge sync
ad8fef5 feat(frontend): bind generate/notes/ai to backend session + graphite UI + BPMN AI badges
229d86d feat(frontend): wire TopBar/Generate/Notes to backend (PATCH full session + GET /bpmn) + fix Process title
2afa1de fix(backend): restore Storage.create/list for project sessions
4ab2ead fix(backend): project sessions endpoints use storage.create + safe filtering
eab8b86 fix(frontend): process title color + softer workflow canvas
d060c61 fix(ui): make Process title readable + soften BPMN canvas (graphite glass)
0a99d44 fix(db): ensure subscriptions columns before ends_at index; include in schema check
b6ae15a feat(backend): project model + process passport (Epic #1)
dcd05d3 fix(frontend): improve contrast (titles) + dark BPMN canvas overrides
4e00272 fix(frontend): graphite contrast + dark BPMN canvas (less glare)
2482b6b fix(frontend): graphite-glass contrast + soften BPMN paper canvas
f7e3a54 fix(frontend): move notes composer into left panel + remove bottom dock (R13 fix)
c2964bd fix(frontend): restore api.js named exports (sessions/meta/notes) + keep apiSaveSession
9a1dd29 fix(backend): restore aux endpoints + stable session write contract
c0e6206 fix(backend): add Storage.create for unified write
97e5d1f feat(frontend): UI polish (RU) + fix BPMN ref warning + avoid duplicate controls
7ad839a feat(frontend): RU UI polish + highlights + apiSaveSession + safe BPMN placeholder
fa17b15 fix(frontend): avoid missing named export apiSaveSession (use api namespace + fetch fallback)
f070df0 feat(backend): session update accepts roles/start_role
a7b8891 fix(frontend): prevent copilot on whitespace + use mock BPMN for local_*; shrink topbar primary button (R9)
9b24eba feat(backend): CORS for local frontend + /api/meta
```

Последние 30 `cp/*` тэгов:
```text
cp/restore_stash_after_apply_20260228_000008
cp/restore_stash_before_apply_20260228_000008
cp/restore_stash_after_20260227_235808
cp/restore_stash_before_20260227_235808
cp/interview_path_highlight_branch_start_20260227_235317
cp/interview_pre_path_highlight_20260227_235307
cp/fpc_stage_commit_deletions_2026-02-20_232233
cp/fpc_commit_artifacts_deletions_2026-02-20_231115
cp/fpc_commit_tooling_2026-02-20_225525
cp/fpc_commit_core_2026-02-20_225152
cp/fpc_cleanup_generated_2026-02-20_224916
cp/fpc_list_backend_routes_v2_2026-02-13_212312
cp/fpc_fix_app_crash_after_delete_patch_v1_2026-02-13_212304
cp/fpc_list_backend_routes_v2_2026-02-13_211706
cp/fpc_add_delete_projects_sessions_direct_v1_2026-02-13_211659
cp/fpc_list_backend_routes_v2_2026-02-13_211225
cp/fpc_backend_add_delete_projects_sessions_v1_2026-02-13_211224
cp/fpc_fix_delete_patcher_real_v1_2026-02-13_211224
cp/fpc_backend_add_delete_projects_sessions_v1_2026-02-13_210210
cp/fpc_fix_delete_patcher_overwrite_v1_2026-02-13_210209
cp/fpc_backend_add_delete_projects_sessions_v1_2026-02-13_205530
cp/fpc_hotfix_delete_endpoints_patch_py_v4_2026-02-13_205530
cp/fpc_backend_add_delete_projects_sessions_v1_2026-02-13_204126
cp/fpc_hotfix_delete_endpoints_patch_py_v4_2026-02-13_204126
cp/fpc_backend_add_delete_projects_sessions_v1_2026-02-13_203546
cp/fpc_hotfix_delete_endpoints_patch_py_v3_2026-02-13_203546
cp/fpc_backend_add_delete_projects_sessions_v1_2026-02-13_191033
cp/fpc_hotfix_delete_endpoints_patch_py_v3_2026-02-13_191033
cp/fpc_backend_add_delete_projects_sessions_v1_2026-02-13_190248
cp/fpc_hotfix_delete_endpoints_patch_py_v2_2026-02-13_190247
```

Stash top-10:
```text
stash@{0}: On fix/frontend-r20-bpmn-contrast-v1: wip before branching (path-highlight) 2026-02-27T23:53:16
stash@{1}: On fix/frontend-r20-bpmn-contrast-v1: wip_env_2026-02-20_224916
stash@{2}: On feat/frontend-r12-ui-polish-ru-v1: WIP backend (auto-stash before frontend R12) 2026-02-11_235657
stash@{3}: On fix/frontend-r10-apiSaveSession-export-v1: WIP backend (auto-stash before frontend api fix) 2026-02-11_231449
stash@{4}: On feat/inline-questions-v1: wip: before step_14 mermaid/roles
stash@{5}: On fix/session-init-v1: wip: before inline questions
stash@{6}: On fix/mermaid-rerender-v1: wip: before step_13c session init fix
stash@{7}: On feat/mvp-loss-v1: wip: before step_13b mermaid rerender
stash@{8}: On feat/mvp-disposition-v1: wip: before step_13 loss
stash@{9}: On feat/mvp-resources-v1: wip: before step_12 disposition
```

## 2.2 Изменённые файлы относительно checkpoint
База: `cp/interview_pre_path_highlight_20260227_235307`.

`git diff --name-only <base>`:
```text
.env.example
README.md
backend/app/ai/deepseek_questions.py
backend/app/main.py
backend/app/models.py
frontend/e2e/README.md
frontend/e2e/bpmn-roundtrip-big.spec.mjs
frontend/e2e/tab-transition-matrix-big.spec.mjs
frontend/playwright.config.mjs
frontend/src/App.jsx
frontend/src/components/AppShell.jsx
frontend/src/components/NotesPanel.jsx
frontend/src/components/ProcessStage.jsx
frontend/src/components/TopBar.jsx
frontend/src/components/process/BpmnStage.jsx
frontend/src/components/process/DocStage.jsx
frontend/src/components/process/InterviewStage.jsx
frontend/src/components/process/interview/BoundariesBlock.jsx
frontend/src/components/process/interview/InterviewPathsView.jsx
frontend/src/components/process/interview/SummaryBlock.jsx
frontend/src/components/process/interview/TimelineControls.jsx
frontend/src/components/process/interview/TimelineTable.jsx
frontend/src/components/process/interview/TransitionsBlock.jsx
frontend/src/components/process/interview/timelineViewModel.js
frontend/src/components/process/interview/useInterviewActions.js
frontend/src/components/process/interview/useInterviewDerivedState.js
frontend/src/components/process/interview/useInterviewSessionState.js
frontend/src/components/process/interview/utils.js
frontend/src/components/process/interview/viewmodel/buildInterviewVM.js
frontend/src/components/process/interview/viewmodel/buildInterviewVM.test.mjs
frontend/src/features/notes/elementNotes.js
frontend/src/features/process/bpmn/coordinator/createBpmnCoordinator.js
frontend/src/features/process/bpmn/persistence/createBpmnPersistence.js
frontend/src/features/process/bpmn/runtime/createBpmnRuntime.js
frontend/src/features/process/bpmn/snapshots/bpmnSnapshots.js
frontend/src/features/process/bpmn/snapshots/bpmnSnapshots.test.mjs
frontend/src/features/process/hooks/useBpmnSync.js
frontend/src/features/process/hooks/useInterviewSyncLifecycle.js
frontend/src/features/process/hooks/useProcessTabs.js
frontend/src/features/process/lib/docMarkdown.js
frontend/src/features/process/lib/markdownPreview.jsx
frontend/src/features/process/lib/processStageDomain.js
frontend/src/lib/api.js
frontend/src/lib/api/bpmnApi.js
frontend/src/main.jsx
frontend/src/styles/app/02/02-02-bpmn-viewer-core.css
frontend/src/styles/app/02/02-04-stage-modeler.css
frontend/src/styles/app/02/02-05-layout-shell-topbar.css
frontend/src/styles/app/02/02-06-bpmn-dark-theme.css
frontend/src/styles/app/03/03-01-interview-core.css
frontend/src/styles/app/04/04-03-llm-bottlenecks.css
frontend/src/styles/app/05/05-02-bpmn-text-contrast.css
frontend/src/styles/tailwind.css
frontend/src/styles/tokens.css
```

`git diff --stat <base>`:
```text
54 files changed, 24718 insertions(+), 3726 deletions(-)
```

Дополнительно (untracked из `git status --porcelain`): `109` новых путей, включая новые backend tests, e2e, interview submodules, robotmeta/rtiers, docs.

## 2.3 Классификация изменений по областям

### Reports UI / Report modal
- `frontend/src/components/process/interview/paths/ReportsDrawer.jsx`
- `frontend/src/components/process/interview/InterviewPathsView.jsx`
- `frontend/src/components/process/interview/services/pathReport.js`
- `frontend/src/styles/tailwind.css` (drawer/report anti-overflow классы)

Факты:
- `techlog` свернут по умолчанию и сбрасывается при закрытии drawer (`ReportsDrawer.jsx`, `techlogExpanded`).
- Статусы `running/ok/error` отображаются на карточках версий и в viewer.
- Есть отдельные ограничения overflow/word-break для markdown/KPI (`tailwind.css`, `.interviewPathReport*`).

### Paths View
- `frontend/src/components/process/interview/InterviewPathsView.jsx`
- `frontend/src/components/process/interview/paths/PathHeader.jsx`
- `frontend/src/components/process/interview/paths/StepDetailsPanel.jsx`

Факты:
- Компактный time editor `W/Wa` с debounce commit и clear.
- Preset popover `+30s/+1m/+2m/+5m`.
- Метрики path header (steps/work/wait/total) присутствуют.

### Diagram overlays / action bar / quality markers
- `frontend/src/components/ProcessStage.jsx`
- `frontend/src/components/process/BpmnStage.jsx`
- `frontend/src/components/process/interview/graph/validateGraphModel.js`
- `frontend/src/components/process/interview/InterviewDebugOverlay.jsx`

Факты:
- Toolbar: Path highlight, Notes, AI, Reports, RobotMeta toggle, Quality popover, overflow.
- Quality overlay категории: orphan/dead_end/gateway/link_errors, с фокусом по node.
- `BpmnStage` expose `focusNode`, применяет overlays/markers и таймер снятия фокуса.

### Navigation / session selection
- `frontend/src/App.jsx`
- `frontend/src/components/TopBar.jsx`

Факты:
- URL sync (`project`, `session`) через read/write helpers.
- Guard от race в openSession (`openSessionReqSeqRef`).
- Missing session notice при исчезновении из списка.
- Rename/Delete dialogs для project/session.

### API client (`frontend/src/lib/api.js`) / polling
- `frontend/src/lib/api.js`
- `frontend/src/components/process/interview/InterviewPathsView.jsx`

Факты:
- Path reports API с alias endpoints и retriable statuses `0/404/405/502/503/504`.
- `apiListPathReportVersions` фильтрует synthetic unavailable rows.
- Polling: backoff, stop-on-401/403/404, timeout caps.

### Backend endpoints (reports, sessions, projects)
- `backend/app/main.py`
- `backend/app/models.py`

Факты:
- Session PATCH (rename/title и др.), DELETE project/session.
- Path reports POST/GET/list/detail endpoints (включая alias `/path/`).
- `ReportVersion` модель с `running|ok|error`.
- stale-running repair (`_mark_stale_running_reports`).

# 3. Что работает / не работает (с воспроизведением)

| Фича | Статус | Как проверить (репро) | Ожидаемый результат | Фактический результат | Что сломано / ограничение |
|---|---|---|---|---|---|
| Reports modal: версии, `running/ok/error`, techlog, no-overflow | PARTIAL (код+frontend unit) | 1) Открыть Interview -> Paths -> Reports. 2) Запустить генерацию. 3) Переключать версии и открыть markdown. | Видны версии и статусы; техлог изначально свернут; длинный markdown не ломает layout. | Подтверждено по коду: `techlogExpanded=false` + reset при close; badges `running/ok/error`; CSS drawer/markdown имеет `overflow:auto`, `overflow-wrap:anywhere`, `word-break:break-word`. | Явной дедупликации массива `visibleReportVersions` нет; дубли не фильтруются на UI-слое, если backend вернёт повтор. |
| Polling: нет 404-spam, backoff/stop-on-error | OK (код+tests) | 1) Стартовать report generation. 2) Наблюдать polling. 3) Сымитировать 404/401/403 и 5xx. | Backoff 1/2/3/5s, стоп на 401/403/404, retry на 5xx/0, timeout stop. | Подтверждено в `InterviewPathsView`: `REPORT_POLL_MAX_ATTEMPTS=20`, `REPORT_POLL_MAX_MS=120000`, `reportPollDelayMs`; `stopPolling` на 401/403/404. Подтверждено тестами `node --test frontend/src/lib/api.reports.test.mjs` (6/6 pass). | Runtime в браузере не прогонялся в этом аудите. |
| Отчёт по выбранному P0: `path_id_used`, `steps_count`, `stop_reason`, marker | OK (код+tests) | 1) Выбрать P0 scenario. 2) Сгенерировать report. 3) Проверить debug trace/log. | В debug есть source path id, число шагов и причина остановки. | Подтверждено: `buildReportBuildDebug` формирует поля `path_id_used`, `steps_count`, `stop_reason`, `stop_at_bpmn_id`; `InterviewPathsView` логирует `[REPORT_BUILD] ... path=... steps=... reason=...`. Тесты `pathReport.test.mjs` (14/14 pass). | Нет backend e2e-валидации через pytest в этом окружении. |
| Paths View: компактность, ввод времени, поповеры пресетов | OK (код+frontend unit) | 1) Открыть Paths. 2) В Step details менять W/Wa, blur/Enter. 3) Использовать пресеты `+30s/+1m/+2m/+5m`. | debounce commit и корректный пересчёт seconds/minutes. | Подтверждено: `StepDurationEditor` с `DURATION_COMMIT_DEBOUNCE_MS=250`, `parseMinutesToNullableSeconds`, `applyPreset`, clear; тесты `utils.pathspec.test.mjs` (2/2 pass). | Браузерный UX/perf не мерился в этом аудите. |
| Session selection: не слетает на список произвольно | PARTIAL (код) | 1) Выбрать session из TopBar. 2) Обновить список сессий. 3) Проверить URL back/forward. | Текущая сессия сохраняется; при исчезновении показывается notice, а не silent reset. | Подтверждено по коду: URL read/write, `openSessionReqSeqRef`, `requestedSessionIdRef`, `sessionNavNotice` при missing session, popstate handler. | Нет запущенного e2e сценария на race/rapid switching в этом аудите. |
| Rename/Delete project/session | PARTIAL (код) | 1) В TopBar нажать delete/rename. 2) Подтвердить dialog. | PATCH title и DELETE работают, список обновляется. | По коду: `submitRenameDialog`, `submitDeleteDialog`, `apiPatchProject/apiPatchSession`, `apiDeleteProject/apiDeleteSession`; backend endpoints присутствуют (`PATCH /api/sessions/{id}`, `DELETE /api/projects/{id}`, `DELETE /api/sessions/{id}`). | Backend автотесты не выполнены: `python3 -m pytest ...` -> `No module named pytest`. |
| RobotMeta (если начали делать) | PARTIAL (код) | 1) Открыть Diagram action bar. 2) Переключить `Robot Meta on/off`. | Overlay для non-human exec.mode; есть model normalization. | Подтверждено: кнопка `diagram-action-robotmeta`; модуль `features/process/robotmeta` (`normalizeRobotMetaMap`, `exec.mode`, moddle descriptor). | UI runtime и сохранение end-to-end не проверялись в этом аудите. |
| Diagram: подсветка проблем (orphan/dead-end/link), focus on node | PARTIAL (код) | 1) Открыть Quality popover. 2) Включить категории и выбрать элемент списка. | Узел фокусируется, применяются маркеры/overlay, есть issue categories. | Подтверждено: `validateGraphModel` генерирует `orphan_node`, `dead_end_non_end`, `parallel/gateway` issues, `cycle_without_stop_condition`; в `ProcessStage` есть quality list + `focusQualityOverlayItem`; в `BpmnStage` `focusNodeOnInstance`/`focusNode`. | E2E smoke по фокусу/overlay не запускался в этом аудите. |

Дополнительно выполненные тесты:
```text
node --test frontend/src/components/process/interview/services/pathReport.test.mjs -> 14 passed
node --test frontend/src/lib/api.reports.test.mjs -> 6 passed
node --test frontend/src/components/process/interview/viewmodel/buildInterviewVM.test.mjs -> 7 passed
node --test frontend/src/features/process/bpmn/snapshots/bpmnSnapshots.test.mjs -> 4 passed
node --test frontend/src/components/process/interview/utils.pathspec.test.mjs -> 2 passed
node --test frontend/src/components/process/interview/viewmodel/buildInterviewRenderState.test.mjs -> 3 passed
python3 -m pytest backend/tests/test_path_report_api.py -> fail (pytest missing)
python3 -m pytest backend/tests/test_bpmn_meta.py -> fail (pytest missing)
```

# 4. Риски и скрытые поломки

## 4.1 Половинчатые/временные изменения
1. Feature flags активны и влияют на рендер-поведение (`frontend/src/components/process/interview/featureFlags.js`): `v2Model`, `betweenBranches`, `timeModel`, `detachedFilter`, `renderMode`.
2. TODO о скрытых вкладках Review/LLM оставлен в коде:
   - `frontend/src/components/ProcessStage.jsx`
   - `frontend/src/features/process/hooks/useProcessTabs.js`
3. Placeholder endpoint-string в UI: `"/api/sessions/:sessionId/paths/:pathId/reports"` при пустых sid/pid (`InterviewPathsView`).
4. Заглушечный metrics state присутствует: `steps_count: 0` и нулевые totals в deferred-path ветке (`useInterviewDerivedState`).
5. Много dev-логов (`console.debug/info/warn/error`) в `App.jsx`, `ProcessStage.jsx`, `BpmnStage.jsx`, `useProcessTabs.js`, `api.js`.

## 4.2 Проверка на дубли pollers / importXML / тяжёлые ререндеры
1. Дублирующий `setInterval` в ключевых файлах не найден (`rg setInterval` по `InterviewPathsView/BpmnStage/useProcessTabs/useBpmnSync` дал 0 совпадений).
2. Polling reports построен как один `setTimeout`-цикл с cleanup и stop conditions; явного второго poller в том же effect не найдено.
3. `importXML` в `BpmnStage` есть в ограниченных местах (viewer/modeler/recovery); есть guards:
   - `lastModelerXmlHashRef` + `resolvedHash` + ветка `modeler.same_hash` (skip re-import)
   - stale guard через `renderRunRef`/`isStale(...)`.
4. По Interview/Paths есть попытки контроля ререндеров: `memo`, `useMemo`, `useDeferredValue`, debounce timers, `measureInterviewSpan`.
5. Риск сохраняется из-за размера компонент и плотности состояния (`InterviewPathsView` и `ProcessStage` очень большие), runtime perf-профиль в браузере не проводился в этом аудите.

## 4.3 Опасные места
1. Дедупликация списка report versions на UI не реализована явно (`visibleReportVersions` только sort/filter).
2. Backend тесты не исполнимы в текущем окружении (`pytest` отсутствует), поэтому regressions backend endpoints не подтверждены запуском.
3. Большой объём незакоммиченных и untracked изменений увеличивает риск потери данных при rollback.

# 5. Откат и восстановление (tags/branches/stash)

## 5.1 Доступные rollback points
- Основной checkpoint tag: `cp/interview_pre_path_highlight_20260227_235307`.
- Branch-start tag: `cp/interview_path_highlight_branch_start_20260227_235317`.
- Дополнительные restore tags:
  - `cp/restore_stash_before_20260227_235808`
  - `cp/restore_stash_after_20260227_235808`
  - `cp/restore_stash_before_apply_20260228_000008`
  - `cp/restore_stash_after_apply_20260228_000008`
- Важно: оба основных checkpoint-тега указывают на тот же commit, что и текущий `HEAD`.

## 5.2 Готовые команды отката

Создать безопасную резервную точку незакоммиченного состояния:
```bash
git stash push -u -m "audit_backup_20260301_1350"
```

Перейти на checkpoint tag (detached):
```bash
git switch --detach cp/interview_pre_path_highlight_20260227_235307
```

Создать ветку от checkpoint tag:
```bash
git switch -c rollback/interview_pre_path_highlight cp/interview_pre_path_highlight_20260227_235307
```

Жёстко откатить текущую ветку к checkpoint (с потерей незакоммиченного):
```bash
git reset --hard cp/interview_pre_path_highlight_20260227_235307
git clean -fd
```

Вернуть stash (если нужно):
```bash
git stash list
git stash apply stash@{0}
# или
git stash pop stash@{0}
```

## 5.3 Что будет потеряно при откате
- При `git reset --hard` + `git clean -fd` будут потеряны текущие незакоммиченные изменения:
  - `54` tracked modified
  - `109` untracked
- Поскольку checkpoint commit совпадает с `HEAD`, rollback по commit не меняет историю, а только очищает рабочее дерево.

# 6. Следующие 5 шагов (в приоритете, без реализации)

| Приоритет | Цель | Затронутые файлы/модули | Риск | Критерий готовности |
|---|---|---|---|---|
| 1 | Закрыть backend test-gap для reports/sessions/projects | `backend/tests/test_path_report_api.py`, `backend/tests/test_bpmn_meta.py`, CI env | Высокий: backend regressions без исполнения тестов | `pytest` доступен, целевые backend тесты проходят в CI и локально |
| 2 | Зафиксировать dedup контракт для report versions | `frontend/src/components/process/interview/InterviewPathsView.jsx`, `frontend/src/components/process/interview/paths/ReportsDrawer.jsx`, `backend/app/main.py` | Средний: визуальные дубли версий/статусов | При повторной выдаче одинаковых report rows в списке отображается уникальный набор |
| 3 | Убрать/переопределить placeholder endpoints и завершить TODO по скрытым табам | `InterviewPathsView.jsx`, `ProcessStage.jsx`, `useProcessTabs.js` | Средний: техдолг и неочевидное поведение UI | Нет placeholder endpoint string в runtime-пути; TODO по tab visibility переведены в явный feature toggle/roadmap |
| 4 | Снизить шум dev-логов и формализовать debug режим | `App.jsx`, `ProcessStage.jsx`, `BpmnStage.jsx`, `useProcessTabs.js`, `api.js` | Средний: шум в консоли, сложность triage | Логи управляются единым флагом; production console без debug flood |
| 5 | Прогнать e2e smoke по критическому маршруту Reports/Paths/Session/Diagram | `frontend/e2e/*` (reports, paths stability, quality, auth-routing) | Высокий: UI-функции подтверждены в основном по коду | Минимальный smoke-набор e2e проходит стабильно и фиксируется в release-checklist |
