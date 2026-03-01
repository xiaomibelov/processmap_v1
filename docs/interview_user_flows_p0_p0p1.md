# Interview/Diagram/Doc/Reports: user flows P0 и P0+P1

Документ собран по фактам из:
- `docs/interview_pathspec_reports.md`
- `docs/interview_decomposition_audit.md`
- `docs/interview_graph_acceptance_and_test_plan.md`
- `docs/INTERVIEW_ACTIONS_CATALOG.md`
- `docs/user_guide.md`
- `docs/ui_actions_catalog.md`
- `docs/r-tiers_sequences.md`
- кода frontend/backend (список файлов в конце).

---

## A. Карта UI-экранов и режимов

### A1. Верхние табы процесса
1. `Interview` — рабочий режим сбора/правки шагов.
2. `Diagram` — BPMN canvas с визуальными маркерами и sidebar.
3. `XML` — сырой BPMN XML.
4. `DOC` — документ процесса и варианты прохождения (R0/R1/R2).

### A2. Где выбирается сценарий и где виден route
1. В `Interview` есть режим `Paths` (через `TimelineControls`).
2. Выбор сценария делается в левой панели `ScenarioNav`:
   - секции: `P0 (Ideal)`, `P0 (Alt)`, `P1 (Mitigated)`, `P2 (Fail)`.
3. Маршрут выбранного сценария показывается в центральной панели `PathStepList` как `rows` активного сценария.

### A3. Reports modal
1. Открывается из `PathHeader` кнопкой `Отчёты ▾`.
2. Левая зона:
   - список версий `vN`,
   - статус (`running|ok|error`),
   - hash, `актуален/устарел`, `последний актуальный`,
   - действия `Открыть`, `Повторить генерацию`, `Скопировать markdown`.
3. Правая зона:
   - header версии (`vN/hash/model/tpl/date/status`),
   - KPI-grid,
   - structured JSON sections (если есть `report_json`),
   - markdown fallback (`ReportAccordion`).
4. Есть трасса генерации (`Путь формирования отчёта`) с фазами request/status/save.

---

## B. Источники истины и данные

| Сущность | Где хранится | Владелец истины | Потребители |
|---|---|---|---|
| `PathSpec` | `interview.path_spec` | `order_index`/`steps[]` (ручной порядок) | `pathReport.buildManualPathReportSteps` (fallback), API payload отчёта |
| `Interview steps` | `interview.steps[]` | поля шага (`id`, `order_index`, `bpmn_ref/node_id`, time, notes) | Matrix, Paths, DoD snapshot, report payload |
| `node_path_meta` | `bpmn_meta.node_path_meta[nodeId]` | явная привязка `paths=[P0/P1/P2]`, `sequence_key`, `source` | `buildInterviewVM` (построение сценариев), Diagram markers |
| `flow_meta` | `bpmn_meta.flow_meta[flowId]` | `tier` (P0/P1/P2), `rtier` (R0/R1/R2), `source/reason` | Graph model, Diagram flow styling, DoD `r_variants` |
| `work_duration_sec`/`wait_duration_sec` | `interview.steps[]` (секунды) | секундная модель времени | Interview KPI, report payload totals, DOC snapshot |
| `steps_hash` | вычисляется из canonical JSON | `sha256(stableJson(canonical_json))` | актуальность отчётов, сравнение версий |
| `ReportVersion` | `interview.report_versions[path_id][]` + `interview.path_reports[path_id]` | versioning в backend по `(session_id,path_id)` | Reports modal list/viewer, stale/actual labels |
| `Scenario` | `InterviewVM.scenarios[]` | builder (`node_path_meta` first, иначе `flow_tier`) | Paths UI, active path selection, report source |
| Branches/loops | `scenario.groups/rows`, `between_branches_item` | graph traversal + scenario builder policies | Paths route UI, matrix groups, DOC variants |

### B1. Что меняет `steps_hash`, а что нет
`steps_hash` меняется при изменении канонических полей шага:
- `order_index`, `title`, `lane_id`, `bpmn_ref`, `work_duration_sec`, `wait_duration_sec`, `decision`, `notes`.

`steps_hash` не меняется от чисто UI-состояний:
- selected row, collapsed panels, фильтры, активная вкладка, открытие/закрытие drawer.

### B2. Где сейчас собираются сценарии/ветки/loops
- `buildInterviewVM`:
  - сначала пытается построить сценарии из `node_path_meta` (`source=node_path_meta`);
  - если разметки нет — fallback `buildScenarios` по `flow_tier`.
- `buildScenarios`:
  - gateway policy: `P0 > P1 > default > shortest_path`,
  - loop policy: `single_iteration`,
  - ранжирование сценариев: `ideal / alt_happy / mitigated / fail`.

---

## C. FLOW 1 — P0 (Ideal) end-to-end

### C1. Как формируется P0 (истина)
1. Пользователь размечает BPMN:
   - flow tier (`P0/P1/P2`) на `sequenceFlow`,
   - node path tags (`P0/P1/P2`) + `sequence_key` на узлах.
2. Текущее фактическое поведение по коду:
   - **включено сейчас:** `Paths` строится из `node_path_meta`, если оно непустое;
   - **fallback:** если `node_path_meta` пустое, сценарии строятся из `flow_tier` (`legacy source` warning).
3. Вариант с `PathSpec.order_index`:
   - в текущем коде это не основной источник для `Paths route`;
   - `PathSpec` используется в генерации отчёта как fallback, когда нет `scenarioSequence`.
4. Дополнительный fallback деградации:
   - если `interview.steps` пусты, `timelineViewModel` создаёт fallback-steps из backend nodes.

### C2. Как P0 отображается в Interview
1. Режим `Paths`:
   - слева выбирается сценарий (`ScenarioNav`),
   - в центре показывается маршрут (`PathStepList`),
   - сверху `PathHeader` с metrics/hash/кнопками отчёта.
2. `order mode BPMN/Interview`:
   - управляется в `TimelineControls` (`Сортировка: BPMN/Creation`);
   - влияет на базовый timeline (Matrix), который затем кормит VM.
3. По умолчанию сценарий P0:
   - bucket `P0_IDEAL`,
   - title `P0 Ideal`,
   - статус `OK` (если outcome success).

### C3. Как P0 показывается на Diagram (Path Highlight)
Минимальная спецификация текущей реализации:
1. **Flow layer** (из `bpmn_meta.flow_meta`):
   - `fpcFlowTierP0`, `fpcFlowTierP1`, `fpcFlowTierP2`,
   - для `P0` дополнительно `fpcHappyFlow`.
2. **Node layer** (из `bpmn_meta.node_path_meta`):
   - `fpcNodePathP0`, `fpcNodePathP1`, `fpcNodePathP2`,
   - на элемент пишется `data-fpc-sequence-key`.
3. **Focus layer**:
   - при jump/select узла используется marker `fpcNodeFocus`.
4. **Ограничения текущего UI**:
   - нет отдельного toggle “показывать только активный сценарий”;
   - нет отдельного diagram-layer для “selected outgoing flow” на gateway.

Привязка к acceptance:
- целевой порядок mainline должен идти по `sequenceFlow traversal`, без XML element order/creation order (критерий из `interview_graph_acceptance_and_test_plan.md`).

### C4. Как формируется отчёт по P0
1. Источник path:
   - `activePathId` берётся из активного сценария:
   - `sequence_key -> scenario.path_id -> vm.path_id -> interview.path_spec.id -> scenario.id -> manual_path`.
2. Источник шагов:
   - приоритетно `buildScenarioSequenceForReport(activeScenario)` (route выбранного сценария),
   - fallback: `PathSpec.steps` по `order_index`,
   - fallback2: `interview.steps` по `order_index`.
3. Payload (`buildPathReportPayload`) без BPMN XML:
   - `session_id`, `path_id`, `path_name`, `generated_at`,
   - `totals {steps_count, work_total_sec, wait_total_sec, total_sec}`,
   - `missing_fields_coverage`,
   - `dod_summary`,
   - `quality_summary`,
   - `steps[]` (order/title/lane/bpmn_ref/work/wait/decision/notes).
4. `steps_hash`:
   - вычисляется из canonical JSON (`sha256`).
5. Генерация:
   - `POST /api/sessions/{sid}/paths/{path_id}/reports` (frontend пробует также alias endpoints).
6. Версионирование:
   - backend создаёт новую запись `ReportVersion` на каждый запуск,
   - version автоинкрементируется в рамках `path_id`,
   - старые версии не перетираются.
7. Актуальность:
   - `is_actual = report.steps_hash === currentStepsHash`.
8. Polling:
   - пока есть `running`, UI опрашивает list/detail каждые ~2.5s.

---

## D. FLOW 2 — P0 + P1 (Mitigated / recovery) end-to-end

### D1. Семантика P1
1. P1 = успешный путь с восстановлением (не fail), ведущий в success end.
2. По примеру `docs/r-tiers_sequences.md`:
   - R0 и R1 расходятся на gateway-решении,
   - R1 выбирает recovery-ветку и возвращается на mainline,
   - обе трассы завершаются на `Event_1pqduoq`,
   - R2 уходит в escalation end `Event_1aulnyq`.

### D2. Как пользователь фиксирует P1
1. В Diagram sidebar:
   - на узлах: теги `P1` + `sequence_key` (`mitigated_*`),
   - на переходах: tier `P1`.
2. Для ветки:
   - `Выделить ветку` + `Применить P1 для выделенных`.
3. Почему не “магия цветов”:
   - когда сценарии строятся только из `flow_tier`, UI явно показывает `Legacy source`,
   - стабильная модель достигается через явный `node_path_meta`.

### D3. Как P0+P1 показывается в Interview (фиксированный стандарт)
Принятый стандарт (по текущему коду): **отдельные сценарии**.
1. `P0 Ideal` и `P1 Mitigated #N` отображаются как разные items.
2. Переключение сценария меняет:
   - route list,
   - метрики,
   - активный `path_id` для отчёта.
3. Обоснование:
   - соответствует текущим bucket’ам (`P0_IDEAL`, `P1_MITIGATED`) и acceptance по детерминизму;
   - проще проверять DoD и версионирование path-scoped отчётов.

### D4. Как P0+P1 показывается на Diagram
1. Слой P0:
   - flow/node markers класса `...P0`.
2. Слой P1:
   - flow/node markers класса `...P1` на recovery-ветках.
3. Loops:
   - в сценарном builder и в `R-variants` loop expansion ограничен (`single_iteration`, `maxLoopIters=1`).
4. Layout не перестраивается; визуализация идёт маркерами/стилями.

### D5. Как P0+P1 попадает в отчёт
1. Отчёт всегда привязан к **активному** сценарию/path_id.
2. Если выбран `P1 Mitigated`, payload собирается из шагов P1-маршрута.
3. “Стоимость восстановления”:
   - сейчас уже считается в Paths как `diff_from_ideal` (`+steps`, `+time`);
   - в report viewer нет отдельной авто-дельты P1 vs P0, но данные сравнимы по KPI двух версий/path.
4. Versioning/actuality — те же правила `steps_hash`.

---

## E. Диагностика: где ломается

| # | Симптом в UI | Где в пайплайне | Как диагностировать | Что показать пользователю |
|---|---|---|---|---|
| 1 | Отчёт ушёл “не по тому” сценарию | `InterviewPathsView.jsx` (`activePathId` chain) | Проверить trace `endpoint /paths/{pathId}/reports` + selected scenario | Плашка в `PathHeader`: `Report source path_id=<...>` |
| 2 | `POST .../reports` даёт `404/unsupported_endpoint` | `api.js apiCreatePathReportVersion` + backend build | Network + `reportErrorMeta.unsupported_endpoint` | Красная плашка с endpoint и HTTP status (уже есть `ReportApiErrorNotice`) |
| 3 | `504 Gateway Timeout`/провайдер оборвал ответ | backend `_run_path_report_generation_async` | `error_message` в версии + trace `request_error/provider_error` | Плашка `Provider timeout`, кнопка `Повторить генерацию` |
| 4 | Версия долго `running`, потом `stale running state` | backend `_mark_stale_running_reports` | Проверить `created_at`, stale timeout, status flip to error | Явный badge `stale-running interrupted` в списке версий |
| 5 | После reload “нет отчёта” (в этой сессии) | `path_id`-scoped versions + выбран другой path | Проверить текущий active scenario/path и `interview.report_versions[path_id]` | Плашка “для текущего path версий нет; есть для path X” |
| 6 | Paths показывает `Legacy source` | `buildInterviewVM` source fallback `flow_tier` | `vm.path_source === flow_tier` | Warn плашка + CTA `Импорт из цветов` (уже есть) |
| 7 | Порядок шагов “плывёт” между режимами | `useInterviewDerivedState`, `timelineViewModel`, `computeDodSnapshot` | Проверить `order_mode`, `bpmnOrderFallback`, наличие fallback-steps | Плашка `Order fallback: creation/runtime`, badge в Timeline |
| 8 | В DOC сценарий выглядит не как route | `DocStage` + `computeDodSnapshot` tier projection | Сравнить `snapshot.steps` vs `r_variants` edges | В DOC подпись источника: `tier projection` vs `variant trace` |
| 9 | При пустых steps появляются “авто-шаги” | `timelineViewModel.buildFallbackStepsFromBackend` | Проверить `interview.steps.length===0` и `auto_` step ids | Плашка `Используются fallback steps (draft пуст)` |
|10| Ветка циклит/обрывается | `buildScenarios` (`loopPolicy`), `buildRVariants` (`loop_cutoff`) | Проверить `stop_reason`, `warnings: loop_*`, loop markers | Маркер `↩ loop` + stop reason `loop_cutoff` в route |
|11| Link events дают разрывы | `computeDodSnapshot` link integrity | quality items `link_integrity warn/error` | Marker на link-узлах + блок `Link integrity` |
|12| 401 на project/sessions list | auth + `api.js request` | Network `401`, auth refresh trace | Глобальная плашка “Требуется повторный вход” |

---

## F. DoD для каждого flow

### F1. DoD — P0

**Interview**
- [ ] В `Paths` выбран `P0 Ideal`.
- [ ] Route в центре непрерывный и ожидаемый.
- [ ] Нет предупреждения `Legacy source` (или осознанно принято).
- [ ] Метрики шага/работы/ожидания заполнены ожидаемо.

**Diagram**
- [ ] На нужных flow стоят `P0` маркеры.
- [ ] На узлах P0 стоят `fpcNodePathP0`.
- [ ] Jump из route фокусирует соответствующий BPMN-узел.
- [ ] При loop есть явный marker/stop reason (без бесконечного разворота).

**Report**
- [ ] POST уходит на `.../paths/{activePathId}/reports`.
- [ ] В payload шаги упорядочены по `order_index`.
- [ ] `steps_hash` посчитан и сохранён в версии.
- [ ] В списке версий видны `актуален/устарел`.
- [ ] После изменения шага старый отчёт становится `устарел`.

### F2. DoD — P0+P1

**Interview**
- [ ] В списке сценариев есть и `P0 Ideal`, и `P1 Mitigated #N`.
- [ ] Переключение P0↔P1 меняет route и metrics.
- [ ] Для P1 виден `diff_from_ideal` (`+steps/+time`).

**Diagram**
- [ ] P0 и P1 ветки визуально различимы (разные tier classes).
- [ ] Recovery-узлы имеют tag `P1`.
- [ ] Loop/retry ветки отображаются конечными.

**Report**
- [ ] Для P1 отчёта используется path_id сценария P1.
- [ ] Payload содержит шаги именно P1 маршрута.
- [ ] Версия P1 имеет свой `steps_hash` и свой version history.
- [ ] Актуальность считается по `steps_hash` в рамках выбранного path.

---

## Карта API

### 1) Сохранение Interview
- `PATCH /api/sessions/{session_id}`
  - отправляется autosave-ом как основной write-path.
  - содержит изменённые части `interview`/`nodes`/`edges`/`bpmn_meta`.
- `POST /api/sessions/{session_id}/recompute`
  - вызывается после большинства PATCH-мутаций (кроме patch-only кейсов AI questions by element).

### 2) Разметка путей/tiers
- `PATCH /api/sessions/{session_id}/bpmn_meta`
  - flow tier (`tier`), rtier (`rtier`), node path updates (`node_updates`).
- `POST /api/sessions/{session_id}/bpmn_meta/infer_rtiers`
  - детерминированный inference `R0/R1/R2` по BPMN XML + scope start.

### 3) Генерация отчёта
- Canonical endpoint (backend):  
  `POST /api/sessions/{session_id}/paths/{path_id}/reports`
- Frontend пробует aliases (`/path/...`, trailing slash, `/sessions/...`) для совместимости со старым backend.
- Обязательные поля запроса:
  - `steps_hash`,
  - `request_payload_json`,
  - `prompt_template_version` (сейчас `v2`).

### 4) Версии/статусы отчёта
- Список версий path:
  - `GET /api/sessions/{session_id}/paths/{path_id}/reports`
- Детали версии path:
  - `GET /api/sessions/{session_id}/paths/{path_id}/reports/{report_id}`
- Fallback details:
  - `GET /api/reports/{report_id}`
- Polling running:
  - в `InterviewPathsView` интервал ~2500 ms до финального `ok/error`.

---

## Список просмотренных файлов

### Обязательные документы
- `docs/interview_pathspec_reports.md`
- `docs/interview_decomposition_audit.md`
- `docs/interview_graph_acceptance_and_test_plan.md`
- `docs/INTERVIEW_ACTIONS_CATALOG.md`
- `docs/user_guide.md`
- `docs/ui_actions_catalog.md`
- `docs/r-tiers_sequences.md`

### Frontend
- `frontend/src/components/process/interview/InterviewPathsView.jsx`
- `frontend/src/components/process/interview/paths/PathHeader.jsx`
- `frontend/src/components/process/interview/paths/ScenarioNav.jsx`
- `frontend/src/components/process/interview/paths/ReportsDrawer.jsx`
- `frontend/src/components/process/interview/services/pathReport.js`
- `frontend/src/components/process/interview/viewmodel/buildInterviewVM.js`
- `frontend/src/components/process/interview/services/scenarios/buildScenarios.js`
- `frontend/src/components/process/interview/services/scenarios/buildScenarioRows.js`
- `frontend/src/components/process/interview/services/scenarios/buildScenarioMatrixRows.js`
- `frontend/src/components/process/interview/graph/buildGraphModel.js`
- `frontend/src/components/process/interview/timelineViewModel.js`
- `frontend/src/components/process/interview/useInterviewDerivedState.js`
- `frontend/src/components/process/interview/useInterviewActions.js`
- `frontend/src/components/process/interview/TimelineControls.jsx`
- `frontend/src/components/process/BpmnStage.jsx`
- `frontend/src/components/sidebar/SelectedNodeSection.jsx`
- `frontend/src/components/process/DocStage.jsx`
- `frontend/src/features/process/dod/computeDodSnapshot.js`
- `frontend/src/features/process/rtiers/buildRVariants.js`
- `frontend/src/lib/api.js`

### Backend
- `backend/app/main.py`
- `backend/app/models.py`
- `backend/app/rtiers.py`

---

## Следующие исправления (не реализованы, только список)

1. **Жёстко закрепить источник отчёта в UI**
   - Проблема: отчёт может восприниматься как “не тот path”.
   - Исправление: всегда показывать `path_id + sequence_key` рядом с кнопкой генерации и в header версии.

2. **Preflight полноты route перед генерацией**
   - Проблема: обрезанные/деградировавшие сценарии дают “пустые” или странные отчёты.
   - Исправление: проверка reachability start→end для активного сценария; блокировать POST с явной причиной.

3. **Единый порядок для DOC “Вариантов прохождения”**
   - Проблема: tier-projection в DOC не всегда совпадает с route semantics.
   - Исправление: строить таблицу DOC из `r_variants`/scenario trace, а не из tier-фильтра snapshot.steps.

4. **Diagram filter “active scenario only”**
   - Проблема: смешиваются маркеры P0/P1/P2, трудно читать текущий выбор.
   - Исправление: toggle слоя по `activeScenario.sequence_key` без изменения layout.

5. **Явный marker для fallback-order**
   - Проблема: пользователю неочевидно, что порядок взят из creation/runtime fallback.
   - Исправление: постоянный badge в Interview (`BPMN order unavailable -> fallback`) и link на диагностику.

